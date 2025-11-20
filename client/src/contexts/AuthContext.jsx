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
    const startTime = Date.now();
    try {
      console.log('🔐 [AUTH] Initializing auth...', { timestamp: new Date().toISOString() });

      const clientStartTime = Date.now();
      const supabase = await getSupabaseClient();
      console.log('🔐 [AUTH DEBUG] Supabase client obtained', {
        took: `${Date.now() - clientStartTime}ms`,
        timestamp: new Date().toISOString()
      });

      // Set up auth state listener FIRST - this is critical for handling login redirects
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          console.log('🔐 [AUTH] State changed:', event, session ? 'authenticated' : 'guest', {
            timestamp: new Date().toISOString(),
            userId: session?.user?.id
          });
          setSession(session);

          if (session) {
            await fetchUser(session.user.id);
          } else {
            setUser(null);
          }

          // Mark loading as false after any auth state change
          setLoading(false);
        }
      );
      console.log('🔐 [AUTH DEBUG] Auth state listener set up');

      // Get initial session - no timeout, let it complete naturally
      // The auth listener will handle the result
      console.log('🔐 [AUTH DEBUG] Calling getSession()...', { timestamp: new Date().toISOString() });

      const sessionStartTime = Date.now();
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        const sessionDuration = Date.now() - sessionStartTime;

        if (error) {
          console.error('❌ [AUTH] Session error:', error, { took: `${sessionDuration}ms` });
        } else {
          console.log('🔐 [AUTH] Session loaded:', session ? 'authenticated' : 'guest', {
            took: `${sessionDuration}ms`,
            timestamp: new Date().toISOString()
          });
          console.log('🔐 [AUTH DEBUG] Session details:', {
            hasSession: !!session,
            hasUser: !!session?.user,
            userId: session?.user?.id,
            hasAccessToken: !!session?.access_token,
            tokenLength: session?.access_token?.length,
            expiresAt: session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : null
          });

          setSession(session);

          if (session) {
            console.log('🔐 [AUTH DEBUG] Session found, fetching user data for:', session.user.id);
            await fetchUser(session.user.id);
          } else {
            console.log('🔐 [AUTH DEBUG] No session - user is guest');
          }
        }
      } catch (sessionError) {
        console.error('❌ [AUTH] getSession failed:', sessionError, {
          took: `${Date.now() - sessionStartTime}ms`
        });
      }

      setLoading(false);
      console.log('🔐 [AUTH DEBUG] Auth initialization complete', {
        totalTime: `${Date.now() - startTime}ms`,
        timestamp: new Date().toISOString()
      });

      return () => {
        subscription.unsubscribe();
      };
    } catch (error) {
      console.error('❌ [AUTH] Init error:', error, {
        took: `${Date.now() - startTime}ms`
      });
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
