import React, { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { getSupabaseClient } from '../utils/supabase';
import type { User as SharedUser, PremiumTier } from '@shared/types';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';

interface DbUser extends SharedUser {
  premium_expires_at?: string;
  subscription_canceled_at?: string;
}

interface AuthContextValue {
  user: DbUser | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
  isGuest: boolean;
  isPremium: boolean;
  supabaseUser: SupabaseUser | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<DbUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const lastFetchTimeRef = useRef(0);
  const lastFetchIdRef = useRef<string | null>(null);

  const fetchUser = async (userId: string, accessToken: string): Promise<void> => {
    const now = Date.now();
    if (userId === lastFetchIdRef.current && now - lastFetchTimeRef.current < 2000) {
      console.log('⏳ [AUTH] Skipping redundant user fetch (throttled)');
      return;
    }
    lastFetchTimeRef.current = now;
    lastFetchIdRef.current = userId;

    try {
      console.log('👤 [AUTH] Fetching user from database:', userId);

      if (!accessToken) {
        console.error('❌ [AUTH] No access token provided to fetchUser');
        throw new Error('No authentication token');
      }

      const url = `/api/users/${userId}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('❌ [AUTH] Fetch user failed:', response.status, errorData);

        if (response.status === 401) {
          console.warn('🔐 [AUTH] Token invalid/expired, clearing session...');
          localStorage.removeItem('gamebuddies-auth');
          setSession(null);
          setUser(null);
          return;
        }

        throw new Error(errorData.error || 'Failed to fetch user');
      }

      const data = await response.json();
      console.log('✅ [AUTH] User data loaded:', {
        id: data.user.id,
        username: data.user.username,
        premium: data.user.premium_tier,
      });

      setUser(data.user);
    } catch (error) {
      console.error('❌ [AUTH] Failed to fetch user:', error);
    }
  };

  useEffect(() => {
    const initAuth = async (): Promise<(() => void) | void> => {
      const startTime = Date.now();
      try {
        console.log('🔐 [AUTH] Initializing auth...');

        const supabase = await getSupabaseClient();

        const storageKey = 'gamebuddies-auth';
        const cachedData = localStorage.getItem(storageKey);
        if (cachedData) {
          try {
            const parsed = JSON.parse(cachedData);
            if (parsed?.access_token && parsed?.user) {
              console.log('🔐 [AUTH] Found cached session in localStorage');
              setSession(parsed);
              await fetchUser(parsed.user.id, parsed.access_token);
            }
          } catch {
            console.warn('🔐 [AUTH] Failed to parse cached session');
          }
        }

        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((event, newSession) => {
          console.log('🔐 [AUTH] State changed:', event, newSession ? 'authenticated' : 'guest');
          setSession(newSession);

          if (newSession) {
            fetchUser(newSession.user.id, newSession.access_token);
          } else {
            setUser(null);
          }

          setLoading(false);
        });

        setLoading(false);

        supabase.auth
          .getSession()
          .then(({ data: { session: validatedSession }, error }) => {
            if (error) {
              console.error('❌ [AUTH] Session validation error:', error);
            } else {
              setSession(validatedSession);
              if (validatedSession) {
                fetchUser(validatedSession.user.id, validatedSession.access_token);
              } else {
                setUser(null);
              }
            }
          })
          .catch((sessionError) => {
            console.error('❌ [AUTH] getSession failed:', sessionError);
          });

        return () => {
          subscription.unsubscribe();
        };
      } catch (error) {
        console.error('❌ [AUTH] Init error:', error);
        setLoading(false);
      }
    };

    const handleBeforeUnload = (): void => {
      const isTemporarySession = sessionStorage.getItem('gamebuddies-session-temp');
      if (isTemporarySession) {
        localStorage.removeItem('gamebuddies-auth');
        console.log('🔒 [AUTH] Cleared temporary session on browser close');
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    let cleanup: (() => void) | void;
    initAuth().then((fn) => {
      cleanup = fn;
    });

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (cleanup) cleanup();
    };
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    try {
      console.log('🚪 [AUTH] Signing out...');

      setUser(null);
      setSession(null);
      localStorage.removeItem('gamebuddies-auth');

      const supabase = await getSupabaseClient();
      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error('❌ [AUTH] Sign out error:', error);
      }

      console.log('✅ [AUTH] Signed out successfully');
    } catch (error) {
      console.error('❌ [AUTH] Sign out failed:', error);
    }
  }, []);

  const refreshUser = useCallback(async (): Promise<void> => {
    if (session) {
      await fetchUser(session.user.id, session.access_token);
    }
  }, [session]);

  const value: AuthContextValue = {
    user,
    session,
    loading,
    signOut,
    refreshUser,
    isAuthenticated: !!session,
    isGuest: !session,
    isPremium: !!(user && user.premium_tier && user.premium_tier !== 'free'),
    supabaseUser: session?.user || null,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export default AuthContext;
