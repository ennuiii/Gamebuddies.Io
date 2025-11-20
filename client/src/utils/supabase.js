import { createClient } from '@supabase/supabase-js';

// Function to get Supabase config from server
const getSupabaseConfig = async () => {
  const startTime = Date.now();
  try {
    console.log('🔧 [SUPABASE] Fetching config from server...', { timestamp: new Date().toISOString() });
    const response = await fetch('/api/supabase-config');
    if (!response.ok) {
      throw new Error('Failed to fetch Supabase config');
    }
    const config = await response.json();
    console.log('🔧 [SUPABASE] Config fetched successfully', {
      took: `${Date.now() - startTime}ms`,
      hasUrl: !!config?.url,
      hasKey: !!config?.anonKey
    });
    return config;
  } catch (error) {
    console.error('❌ Failed to get Supabase config from server:', error, {
      took: `${Date.now() - startTime}ms`
    });
    return null;
  }
};

// Initialize Supabase client
let supabaseClient = null;
let initializationPromise = null;

const initializeSupabase = async () => {
  if (supabaseClient) return supabaseClient;

  // Prevent multiple simultaneous initialization attempts
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    try {
      const config = await getSupabaseConfig();
      if (!config || !config.url || !config.anonKey) {
        console.error('❌ Cannot initialize Supabase client - invalid config:', config);
        return null;
      }

      supabaseClient = createClient(config.url, config.anonKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
          storage: window.localStorage,
          storageKey: 'gamebuddies-auth',
          flowType: 'pkce'
        },
        realtime: {
          params: {
            eventsPerSecond: 10
          }
        }
      });

      console.log('✅ Supabase client initialized for frontend');
      return supabaseClient;
    } catch (error) {
      console.error('❌ Error initializing Supabase client:', error);
      return null;
    }
  })();

  return initializationPromise;
};

// Export a promise that resolves to the initialized client
export const getSupabaseClient = async () => {
  if (!supabaseClient) {
    await initializeSupabase();
  }
  return supabaseClient;
};

// Export null initially - client must use getSupabaseClient() for async initialization
export const supabase = null;
export default null; 