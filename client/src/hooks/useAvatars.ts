import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface Avatar {
  id: string;
  src: string;
  name?: string;
  premium?: boolean;
}

// BUG FIX #15: Added cache with TTL to prevent stale data and memory leaks
interface CacheEntry {
  avatars: Avatar[];
  timestamp: number;
}

const avatarCache: Record<string, CacheEntry> = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL

const isCacheValid = (cacheKey: string): boolean => {
  const entry = avatarCache[cacheKey];
  if (!entry) return false;
  return Date.now() - entry.timestamp < CACHE_TTL_MS;
};

const getCachedAvatars = (cacheKey: string): Avatar[] | null => {
  if (isCacheValid(cacheKey)) {
    return avatarCache[cacheKey].avatars;
  }
  // Clean up expired cache entry
  if (avatarCache[cacheKey]) {
    delete avatarCache[cacheKey];
  }
  return null;
};

const setCachedAvatars = (cacheKey: string, avatars: Avatar[]): void => {
  avatarCache[cacheKey] = {
    avatars,
    timestamp: Date.now(),
  };
};

export const useAvatars = (): {
  avatars: Avatar[];
  loading: boolean;
  getAvatarSrc: (id: string) => string | null;
} => {
  const { session } = useAuth();
  const token = session?.access_token;
  const cacheKey = token || 'guest';

  // BUG FIX #15: Use TTL-aware cache functions
  const cachedAvatars = getCachedAvatars(cacheKey);
  const [avatars, setAvatars] = useState<Avatar[]>(cachedAvatars || []);
  const [loading, setLoading] = useState(!cachedAvatars);

  useEffect(() => {
    // Check if cache is still valid
    const cached = getCachedAvatars(cacheKey);
    if (cached) {
      setAvatars(cached);
      setLoading(false);
      return;
    }

    const fetchAvatars = async (): Promise<void> => {
      setLoading(true);
      try {
        const headers: Record<string, string> = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch('/api/avatars', { headers });
        const data = await res.json();

        if (data.success) {
          setCachedAvatars(cacheKey, data.avatars);
          setAvatars(data.avatars);
        }
      } catch (err) {
        console.error('Failed to load avatars', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAvatars();
  }, [token, cacheKey]);

  const getAvatarSrc = (id: string): string | null => {
    let avatar = avatars.find((a) => a.id === id);

    if (!avatar) {
      // Search all valid cache entries
      for (const key in avatarCache) {
        if (isCacheValid(key)) {
          const found = avatarCache[key].avatars.find((a) => a.id === id);
          if (found) {
            avatar = found;
            break;
          }
        }
      }
    }

    return avatar ? avatar.src : null;
  };

  return { avatars, loading, getAvatarSrc };
};
