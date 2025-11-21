import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getSupabaseClient } from '../utils/supabase';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initAuth();

    // Handle session cleanup when browser closes (if "Remember Me" was unchecked)
    const handleBeforeUnload = () => {
      const isTemporarySession = sessionStorage.getItem('gamebuddies-session-temp');
      if (isTemporarySession) {
        // Clear the auth data from localStorage
        localStorage.removeItem('gamebuddies-auth');
        console.log('🔒 [AUTH] Cleared temporary session on browser close');
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
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

      // Try to get cached session from localStorage first (instant)
      const storageKey = 'gamebuddies-auth';
      const cachedData = localStorage.getItem(storageKey);
      if (cachedData) {
        try {
          const parsed = JSON.parse(cachedData);
          if (parsed?.access_token && parsed?.user) {
            console.log('🔐 [AUTH] Found cached session in localStorage', {
              userId: parsed.user.id,
              expiresAt: parsed.expires_at ? new Date(parsed.expires_at * 1000).toISOString() : null
            });
            // Set cached session immediately so user appears logged in
            setSession(parsed);
            await fetchUser(parsed.user.id, parsed.access_token);
          }
        } catch (e) {
          console.warn('🔐 [AUTH] Failed to parse cached session:', e);
        }
      }

      // Set up auth state listener
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (event, session) => {
          console.log('🔐 [AUTH] State changed:', event, session ? 'authenticated' : 'guest', {
            timestamp: new Date().toISOString(),
            userId: session?.user?.id
          });
          setSession(session);

          if (session) {
            // Don't await inside onAuthStateChange - causes deadlock on signOut
            fetchUser(session.user.id, session.access_token);
          } else {
            setUser(null);
          }

          setLoading(false);
        }
      );
      console.log('🔐 [AUTH DEBUG] Auth state listener set up');

      // Mark loading as false now - we've loaded what we can from cache
      setLoading(false);
      console.log('🔐 [AUTH DEBUG] Initial load complete', {
        took: `${Date.now() - startTime}ms`,
        hasSession: !!session
      });

      // Now call getSession() in background to validate/refresh token
      // This won't block the UI
      console.log('🔐 [AUTH DEBUG] Calling getSession() for validation...', { timestamp: new Date().toISOString() });

      const sessionStartTime = Date.now();
      supabase.auth.getSession().then(({ data: { session: validatedSession }, error }) => {
        const sessionDuration = Date.now() - sessionStartTime;

        if (error) {
          console.error('❌ [AUTH] Session validation error:', error, { took: `${sessionDuration}ms` });
        } else {
          console.log('🔐 [AUTH] Session validated:', validatedSession ? 'authenticated' : 'guest', {
            took: `${sessionDuration}ms`,
            timestamp: new Date().toISOString()
          });

          // Update session if different from cached
          setSession(validatedSession);
          if (validatedSession) {
            fetchUser(validatedSession.user.id, validatedSession.access_token);
          } else {
            setUser(null);
          }
        }
      }).catch(sessionError => {
        console.error('❌ [AUTH] getSession failed:', sessionError, {
          took: `${Date.now() - sessionStartTime}ms`
        });
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

  const fetchUser = async (userId, accessToken) => {
    try {
      console.log('👤 [AUTH] Fetching user from database:', userId);

      // Use the passed access token directly - don't call getSession() again as it can hang
      if (!accessToken) {
        console.error('❌ [AUTH] No access token provided to fetchUser');
        throw new Error('No authentication token');
      }

      console.log('👤 [AUTH DEBUG] Using provided access token:', {
        hasAccessToken: true,
        tokenPreview: accessToken.substring(0, 20) + '...'
      });

      console.log('🔐 [AUTH] Sending authenticated request with JWT token');
      const url = `/api/users/${userId}`;
      console.log('🔐 [AUTH DEBUG] Request URL:', url);
      console.log('🔐 [AUTH DEBUG] Request headers:', {
        'Authorization': 'Bearer ' + accessToken.substring(0, 20) + '...',
        'Content-Type': 'application/json'
      });

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('📡 [AUTH DEBUG] Response status:', response.status, response.statusText);
      console.log('📡 [AUTH DEBUG] Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('❌ [AUTH] Fetch user failed:', response.status, errorData);

        // If unauthorized (401), clear invalid session and treat as guest
        if (response.status === 401) {
          console.warn('🔐 [AUTH] Token invalid/expired, clearing session...');
          localStorage.removeItem('gamebuddies-auth');
          setSession(null);
          setUser(null);
          return; // Don't throw, just treat as logged out
        }

        throw new Error(errorData.error || 'Failed to fetch user');
      }

      const data = await response.json();
      console.log('✅ [AUTH] User data loaded:', {
        id: data.user.id,
        username: data.user.username,
        premium: data.user.premium_tier, // This is the raw value from DB
        premiumExpires: data.user.premium_expires_at,
        subscriptionCanceled: data.user.subscription_canceled_at
      });

      setUser(data.user);
      console.log('✅ [AUTH DEBUG] User state updated successfully. Premium Tier:', data.user.premium_tier);
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

      // Clear local state immediately for instant UI feedback
      setUser(null);
      setSession(null);

      // Clear localStorage directly (in case supabase call hangs)
      localStorage.removeItem('gamebuddies-auth');

      // Then call Supabase signOut
      const supabase = await getSupabaseClient();
      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error('❌ [AUTH] Sign out error:', error);
        // Don't throw - user is already logged out locally
      }

      console.log('✅ [AUTH] Signed out successfully');
    } catch (error) {
      console.error('❌ [AUTH] Sign out failed:', error);
      // User is still logged out locally even if Supabase fails
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (session) {
      await fetchUser(session.user.id, session.access_token);
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
    // Robust check: must have a user, must have a tier, and tier must not be 'free'
    isPremium: !!(user && user.premium_tier && user.premium_tier !== 'free'),
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
