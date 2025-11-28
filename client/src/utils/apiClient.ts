/**
 * BUG FIX #9: API Client with Request Deduplication
 *
 * Prevents duplicate API calls during rapid re-renders or user actions.
 * Features:
 * - Request deduplication with configurable TTL
 * - Automatic retry with exponential backoff
 * - Request cancellation
 * - Response caching
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

interface PendingRequest<T> {
  promise: Promise<T>;
  controller: AbortController;
}

// In-flight requests (for deduplication)
const pendingRequests = new Map<string, PendingRequest<unknown>>();

// Response cache
const responseCache = new Map<string, CacheEntry<unknown>>();

// Default cache TTL (5 seconds)
const DEFAULT_CACHE_TTL_MS = 5000;

// Default deduplication window (same request within this time is deduplicated)
const DEFAULT_DEDUP_WINDOW_MS = 100;

interface ApiClientOptions {
  /** Cache TTL in milliseconds (default: 5000) */
  cacheTtl?: number;
  /** Skip cache and force fresh request */
  skipCache?: boolean;
  /** Custom headers */
  headers?: Record<string, string>;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Number of retry attempts (default: 0) */
  retries?: number;
  /** Base delay for exponential backoff in ms (default: 1000) */
  retryDelay?: number;
}

/**
 * Generate a cache key from URL and options
 */
function generateCacheKey(url: string, method: string, body?: unknown): string {
  const bodyKey = body ? JSON.stringify(body) : '';
  return `${method}:${url}:${bodyKey}`;
}

/**
 * Check if cache entry is valid
 */
function isCacheValid<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
  return entry !== undefined && Date.now() < entry.expiresAt;
}

/**
 * Clean expired cache entries
 */
function cleanExpiredCache(): void {
  const now = Date.now();
  for (const [key, entry] of responseCache.entries()) {
    if (now >= entry.expiresAt) {
      responseCache.delete(key);
    }
  }
}

// Clean cache periodically
setInterval(cleanExpiredCache, 60000);

/**
 * Fetch with deduplication and caching
 */
async function fetchWithDedup<T>(
  url: string,
  method: string,
  body?: unknown,
  options: ApiClientOptions = {}
): Promise<T> {
  const {
    cacheTtl = DEFAULT_CACHE_TTL_MS,
    skipCache = false,
    headers = {},
    timeout = 30000,
    retries = 0,
    retryDelay = 1000,
  } = options;

  const cacheKey = generateCacheKey(url, method, body);

  // Check cache first (for GET requests only)
  if (method === 'GET' && !skipCache) {
    const cached = responseCache.get(cacheKey) as CacheEntry<T> | undefined;
    if (isCacheValid(cached)) {
      console.log(`[API] Cache hit: ${method} ${url}`);
      return cached.data;
    }
  }

  // Check for in-flight request (deduplication)
  const pending = pendingRequests.get(cacheKey) as PendingRequest<T> | undefined;
  if (pending) {
    console.log(`[API] Deduplicating request: ${method} ${url}`);
    return pending.promise;
  }

  // Create new request
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const executeRequest = async (attempt: number): Promise<T> => {
    try {
      const fetchOptions: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        signal: controller.signal,
      };

      if (body && method !== 'GET') {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as T;

      // Cache successful GET responses
      if (method === 'GET' && cacheTtl > 0) {
        responseCache.set(cacheKey, {
          data,
          timestamp: Date.now(),
          expiresAt: Date.now() + cacheTtl,
        });
      }

      return data;
    } catch (error) {
      // Retry on network errors (not on abort)
      if (attempt < retries && !controller.signal.aborted) {
        const isNetworkError = error instanceof TypeError ||
          (error instanceof Error && error.message.includes('fetch'));

        if (isNetworkError) {
          console.log(`[API] Retry ${attempt + 1}/${retries}: ${method} ${url}`);
          await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, attempt)));
          return executeRequest(attempt + 1);
        }
      }
      throw error;
    }
  };

  const promise = executeRequest(0).finally(() => {
    clearTimeout(timeoutId);
    // Remove from pending after a short delay to handle rapid duplicate calls
    setTimeout(() => {
      pendingRequests.delete(cacheKey);
    }, DEFAULT_DEDUP_WINDOW_MS);
  });

  pendingRequests.set(cacheKey, { promise: promise as Promise<unknown>, controller });

  return promise;
}

/**
 * API Client with deduplication
 */
export const apiClient = {
  /**
   * GET request with caching and deduplication
   */
  async get<T>(url: string, options?: ApiClientOptions): Promise<T> {
    return fetchWithDedup<T>(url, 'GET', undefined, options);
  },

  /**
   * POST request with deduplication
   */
  async post<T>(url: string, body?: unknown, options?: ApiClientOptions): Promise<T> {
    return fetchWithDedup<T>(url, 'POST', body, { ...options, cacheTtl: 0 });
  },

  /**
   * PUT request with deduplication
   */
  async put<T>(url: string, body?: unknown, options?: ApiClientOptions): Promise<T> {
    return fetchWithDedup<T>(url, 'PUT', body, { ...options, cacheTtl: 0 });
  },

  /**
   * DELETE request with deduplication
   */
  async delete<T>(url: string, options?: ApiClientOptions): Promise<T> {
    return fetchWithDedup<T>(url, 'DELETE', undefined, { ...options, cacheTtl: 0 });
  },

  /**
   * Cancel all pending requests
   */
  cancelAll(): void {
    for (const [key, { controller }] of pendingRequests.entries()) {
      controller.abort();
      pendingRequests.delete(key);
    }
  },

  /**
   * Clear response cache
   */
  clearCache(): void {
    responseCache.clear();
  },

  /**
   * Invalidate specific cache entries by URL pattern
   */
  invalidateCache(urlPattern: string | RegExp): void {
    for (const key of responseCache.keys()) {
      if (typeof urlPattern === 'string' ? key.includes(urlPattern) : urlPattern.test(key)) {
        responseCache.delete(key);
      }
    }
  },

  /**
   * Get cache stats (for debugging)
   */
  getCacheStats(): { cacheSize: number; pendingRequests: number } {
    return {
      cacheSize: responseCache.size,
      pendingRequests: pendingRequests.size,
    };
  },
};

export default apiClient;
