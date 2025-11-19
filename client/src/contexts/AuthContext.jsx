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
      console.log('🔐 [AUTH DEBUG] Supabase client obtained');

      // Get initial session
      console.log('🔐 [AUTH DEBUG] Calling getSession()...');
      const sessionResult = await supabase.auth.getSession();
      console.log('🔐 [AUTH DEBUG] getSession() returned:', sessionResult);

      const { data: { session }, error } = sessionResult;

      if (error) {
        console.error('❌ [AUTH] Session error:', error);
        setLoading(false);
        return;
      }

      console.log('🔐 [AUTH] Session loaded:', session ? 'authenticated' : 'guest');
      console.log('🔐 [AUTH DEBUG] Session details:', {
        hasSession: !!session,
        hasUser: !!session?.user,
        userId: session?.user?.id,
        hasAccessToken: !!session?.access_token,
        tokenLength: session?.access_token?.length
      });

      setSession(session);

      if (session) {
        console.log('🔐 [AUTH DEBUG] Session found, fetching user data for:', session.user.id);
        await fetchUser(session.user.id);
      } else {
        console.log('🔐 [AUTH DEBUG] No session - user is guest');
      }

      setLoading(false);
      console.log('🔐 [AUTH DEBUG] Auth initialization complete');

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
      console.error('❌ [AUTH] Init error stack:', error.stack);
      console.error('❌ [AUTH] Init error name:', error.name);
      console.error('❌ [AUTH] Init error message:', error.message);
      setLoading(false);
    }
  };

  const fetchUser = async (userId) => {
    try {
      console.log('👤 [AUTH] Fetching user from database:', userId);

      // Get current session to extract JWT token
      const supabase = await getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();

      console.log('👤 [AUTH DEBUG] Session check for fetchUser:', {
        hasSession: !!session,
        hasAccessToken: !!session?.access_token,
        tokenPreview: session?.access_token?.substring(0, 20) + '...'
      });

      if (!session?.access_token) {
        console.error('❌ [AUTH] No access token available');
        throw new Error('No authentication token');
      }

      console.log('🔐 [AUTH] Sending authenticated request with JWT token');
      const url = `/api/users/${userId}`;
      console.log('🔐 [AUTH DEBUG] Request URL:', url);
      console.log('🔐 [AUTH DEBUG] Request headers:', {
        'Authorization': 'Bearer ' + session.access_token.substring(0, 20) + '...',
        'Content-Type': 'application/json'
      });

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('📡 [AUTH DEBUG] Response status:', response.status, response.statusText);
      console.log('📡 [AUTH DEBUG] Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('❌ [AUTH] Fetch user failed:', response.status, errorData);
        throw new Error(errorData.error || 'Failed to fetch user');
      }

      const data = await response.json();
      console.log('✅ [AUTH] User data loaded:', {
        id: data.user.id,
        username: data.user.username,
        premium: data.user.premium_tier,
        premiumExpires: data.user.premium_expires_at,
        subscriptionCanceled: data.user.subscription_canceled_at
      });

      setUser(data.user);
      console.log('✅ [AUTH DEBUG] User state updated successfully');
    } catch (error) {
      console.error('❌ [AUTH] Failed to fetch user:', error);
      console.error('❌ [AUTH] Error details:', error.message);
      console.error('❌ [AUTH] Error stack:', error.stack);
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
