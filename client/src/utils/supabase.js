import { createClient } from '@supabase/supabase-js';

// Function to get Supabase config from server
const getSupabaseConfig = async () => {
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
let supabase = null;

const initializeSupabase = async () => {
  if (supabase) return supabase;

  const config = await getSupabaseConfig();
  if (!config) {
    console.error('❌ Cannot initialize Supabase client - no config available');
    return null;
  }

  supabase = createClient(config.url, config.anonKey, {
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    }
  });

  console.log('✅ Supabase client initialized for frontend');
  return supabase;
};

// Export a promise that resolves to the initialized client
export const getSupabaseClient = async () => {
  if (!supabase) {
    await initializeSupabase();
  }
  return supabase;
};

// For backward compatibility, export the client (will be null initially)
export { supabase };
export default supabase; 