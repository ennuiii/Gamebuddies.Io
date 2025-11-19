import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getSupabaseClient } from '../utils/supabase';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initAuth();
  }, []);

  const initAuth = async () => {
    try {
      console.log('🔐 [AUTH] Initializing auth...');
      const supabase = await getSupabaseClient();

      // Get initial session
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        console.error('❌ [AUTH] Session error:', error);
        setLoading(false);
        return;
      }

      console.log('🔐 [AUTH] Session loaded:', session ? 'authenticated' : 'guest');
      setSession(session);

      if (session) {
        await fetchUser(session.user.id);
      }

      setLoading(false);

      // Listen for auth state changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          console.log('🔐 [AUTH] State changed:', event, session ? 'authenticated' : 'guest');
          setSession(session);

          if (session) {
            await fetchUser(session.user.id);
          } else {
            setUser(null);
          }
        }
      );

      return () => {
        subscription.unsubscribe();
      };
    } catch (error) {
      console.error('❌ [AUTH] Init error:', error);
      setLoading(false);
    }
  };

  const fetchUser = async (userId) => {
    try {
      console.log('👤 [AUTH] Fetching user from database:', userId);

      // Get current session to extract JWT token
      const supabase = await getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        console.error('❌ [AUTH] No access token available');
        throw new Error('No authentication token');
      }

      console.log('🔐 [AUTH] Sending authenticated request with JWT token');

      const response = await fetch(`/api/users/${userId}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('❌ [AUTH] Fetch user failed:', response.status, errorData);
        throw new Error(errorData.error || 'Failed to fetch user');
      }

      const data = await response.json();
      console.log('✅ [AUTH] User data loaded:', {
        id: data.user.id,
        username: data.user.username,
        premium: data.user.premium_tier
      });

      setUser(data.user);
    } catch (error) {
      console.error('❌ [AUTH] Failed to fetch user:', error);
      // User is still authenticated via Supabase, just no DB record yet
    }
  };

  const signOut = useCallback(async () => {
    try {
      console.log('🚪 [AUTH] Signing out...');
      const supabase = await getSupabaseClient();

      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error('❌ [AUTH] Sign out error:', error);
        throw error;
      }

      setUser(null);
      setSession(null);
      console.log('✅ [AUTH] Signed out successfully');
    } catch (error) {
      console.error('❌ [AUTH] Sign out failed:', error);
      throw error;
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (session) {
      await fetchUser(session.user.id);
    }
  }, [session]);

  const value = {
    user,
    session,
    loading,
    signOut,
    refreshUser,
    isAuthenticated: !!session,
    isGuest: !session,
    isPremium: user?.premium_tier !== 'free' && user?.premium_tier !== null,
    supabaseUser: session?.user || null
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export default AuthContext;
