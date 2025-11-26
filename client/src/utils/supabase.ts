import { createClient, SupabaseClient } from '@supabase/supabase-js';

interface SupabaseConfig {
  url: string;
  anonKey: string;
}

const getSupabaseConfig = async (): Promise<SupabaseConfig | null> => {
  const startTime = Date.now();
  try {
    console.log('🔧 [SUPABASE] Fetching config from server...', { timestamp: new Date().toISOString() });
    const response = await fetch('/api/supabase-config');
    if (!response.ok) {
      throw new Error('Failed to fetch Supabase config');
    }
    const config: SupabaseConfig = await response.json();
    console.log('🔧 [SUPABASE] Config fetched successfully', {
      took: `${Date.now() - startTime}ms`,
      hasUrl: !!config?.url,
      hasKey: !!config?.anonKey,
    });
    return config;
  } catch (error) {
    console.error('❌ Failed to get Supabase config from server:', error, {
      took: `${Date.now() - startTime}ms`,
    });
    return null;
  }
};

let supabaseClient: SupabaseClient | null = null;
let initializationPromise: Promise<SupabaseClient | null> | null = null;

const initializeSupabase = async (): Promise<SupabaseClient | null> => {
  if (supabaseClient) return supabaseClient;

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
          flowType: 'pkce',
        },
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
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

export const getSupabaseClient = async (): Promise<SupabaseClient | null> => {
  if (!supabaseClient) {
    await initializeSupabase();
  }
  return supabaseClient;
};

export const supabase: SupabaseClient | null = null;
export default null;
