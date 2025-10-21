import { createClient, SupabaseClient } from '@supabase/supabase-js';

interface SupabaseConfig {
  url: string;
  anonKey: string;
}

// Function to get Supabase config from server
const getSupabaseConfig = async (): Promise<SupabaseConfig | null> => {
  try {
    const response = await fetch('/api/supabase-config');
    if (!response.ok) {
      throw new Error('Failed to fetch Supabase config');
    }
    return await response.json();
  } catch (error) {
    console.error('❌ Failed to get Supabase config from server:', error);
    return null;
  }
};

// Initialize Supabase client
let supabaseClient: SupabaseClient | null = null;
let initializationPromise: Promise<SupabaseClient | null> | null = null;

const initializeSupabase = async (): Promise<SupabaseClient | null> => {
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

// Export a promise that resolves to the initialized client
export const getSupabaseClient = async (): Promise<SupabaseClient | null> => {
  if (!supabaseClient) {
    await initializeSupabase();
  }
  return supabaseClient;
};

// Export null initially - client must use getSupabaseClient() for async initialization
export const supabase = null;
export default null;
