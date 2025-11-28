import React, { useEffect, useState, FormEvent, ChangeEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getSupabaseClient } from '../utils/supabase';
import './LoginPage.css';

type AuthMode = 'oauth' | 'email';
type OAuthProvider = 'discord' | 'google';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, loading } = useAuth();
  const error = searchParams.get('error');

  const [authMode, setAuthMode] = useState<AuthMode>('oauth');
  const [isSignUp, setIsSignUp] = useState<boolean>(false);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [authError, setAuthError] = useState<string>('');
  const [authSuccess, setAuthSuccess] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isOAuthLoading, setIsOAuthLoading] = useState<OAuthProvider | null>(null);
  const [rememberMe, setRememberMe] = useState<boolean>(true);

  useEffect(() => {
    if (isAuthenticated && !loading) {
      navigate('/');
    }
  }, [isAuthenticated, loading, navigate]);

  const handleOAuthLogin = async (provider: OAuthProvider): Promise<void> => {
    setAuthError('');
    setIsOAuthLoading(provider);

    try {
      const supabase = await getSupabaseClient();
      if (!supabase) {
        setAuthError('Failed to connect to authentication service');
        setIsOAuthLoading(null);
        return;
      }

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: provider === 'discord' ? 'identify email' : undefined,
        },
      });

      if (oauthError) {
        console.error('OAuth login error:', oauthError);
        setAuthError('Login failed. Please try again.');
        setIsOAuthLoading(null);
      }
      // Note: On success, user is redirected, so no need to reset loading state
    } catch (err) {
      console.error('Login error:', err);
      setAuthError('An error occurred. Please try again.');
      setIsOAuthLoading(null);
    }
  };

  const handleGuestContinue = (): void => {
    navigate('/');
  };

  const handleEmailSignUp = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');

    if (!email || !password || !confirmPassword) {
      setAuthError('Please fill in all fields.');
      return;
    }

    if (password.length < 6) {
      setAuthError('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setAuthError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = await getSupabaseClient();
      if (!supabase) {
        setAuthError('Failed to connect to authentication service');
        return;
      }

      const redirectUrl =
        window.location.hostname === 'localhost'
          ? `${window.location.origin}/auth/callback`
          : 'https://gamebuddies.io/auth/callback';

      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
        },
      });

      if (signUpError) {
        setAuthError(signUpError.message);
      } else {
        setAuthSuccess(
          'Registration successful! Please check your email to verify your account.'
        );
        setEmail('');
        setPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      setAuthError('An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmailSignIn = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');

    if (!email || !password) {
      setAuthError('Please enter your email and password.');
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = await getSupabaseClient();
      if (!supabase) {
        setAuthError('Failed to connect to authentication service');
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setAuthError(signInError.message);
      } else {
        if (!rememberMe) {
          sessionStorage.setItem('gamebuddies-session-temp', 'true');
        } else {
          sessionStorage.removeItem('gamebuddies-session-temp');
        }

        setTimeout(() => {
          window.location.href = '/';
        }, 500);
      }
    } catch (err) {
      setAuthError('An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="loading">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <h1>🎮 GameBuddies.io</h1>
          <p className="login-subtitle">Play Games with Friends</p>
        </div>

        {error && (
          <div className="login-error">
            {error === 'auth_failed'
              ? 'Authentication failed. Please try again.'
              : 'An error occurred during login.'}
          </div>
        )}

        {authError && <div className="login-error">{authError}</div>}
        {authSuccess && <div className="login-success">{authSuccess}</div>}

        <div className="auth-mode-toggle">
          <button
            className={`mode-button ${authMode === 'oauth' ? 'active' : ''}`}
            onClick={() => {
              setAuthMode('oauth');
              setAuthError('');
              setAuthSuccess('');
            }}
          >
            Quick Login
          </button>
          <button
            className={`mode-button ${authMode === 'email' ? 'active' : ''}`}
            onClick={() => {
              setAuthMode('email');
              setAuthError('');
              setAuthSuccess('');
            }}
          >
            Email / Password
          </button>
        </div>

        <div className="login-options">
          {authMode === 'oauth' ? (
            <>
              <button
                onClick={handleGuestContinue}
                className="auth-button guest-button"
                disabled={isOAuthLoading !== null}
              >
                <span className="button-icon" aria-hidden="true">🎮</span>
                <span className="button-text">Continue as Guest</span>
              </button>

              <div className="divider">
                <span>or sign in with</span>
              </div>

              <button
                onClick={() => handleOAuthLogin('discord')}
                className="auth-button discord-button"
                disabled={isOAuthLoading !== null}
                aria-busy={isOAuthLoading === 'discord'}
              >
                <span className="button-icon" aria-hidden="true">
                  {isOAuthLoading === 'discord' ? '⏳' : '💬'}
                </span>
                <span className="button-text">
                  {isOAuthLoading === 'discord' ? 'Connecting...' : 'Login with Discord'}
                </span>
              </button>

              <button
                onClick={() => handleOAuthLogin('google')}
                className="auth-button google-button"
                disabled={isOAuthLoading !== null}
                aria-busy={isOAuthLoading === 'google'}
              >
                <span className="button-icon" aria-hidden="true">
                  {isOAuthLoading === 'google' ? '⏳' : '🔍'}
                </span>
                <span className="button-text">
                  {isOAuthLoading === 'google' ? 'Connecting...' : 'Login with Google'}
                </span>
              </button>
            </>
          ) : (
            <>
              {isSignUp ? (
                <form onSubmit={handleEmailSignUp} className="email-form">
                  <div className="form-group">
                    <label htmlFor="email">Email</label>
                    <input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      required
                      autoComplete="email"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="password">Password</label>
                    <input
                      type="password"
                      id="password"
                      value={password}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="confirmPassword">Confirm Password</label>
                    <input
                      type="password"
                      id="confirmPassword"
                      value={confirmPassword}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        setConfirmPassword(e.target.value)
                      }
                      placeholder="••••••••"
                      required
                      autoComplete="new-password"
                    />
                  </div>
                  <button
                    type="submit"
                    className="auth-button email-submit-button"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Processing...' : 'Sign Up'}
                  </button>
                  <div className="auth-toggle">
                    <span>Already have an account?</span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsSignUp(false);
                        setAuthError('');
                        setAuthSuccess('');
                      }}
                      className="toggle-link"
                    >
                      Sign In
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleEmailSignIn} className="email-form">
                  <div className="form-group">
                    <label htmlFor="email">Email</label>
                    <input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      required
                      autoComplete="email"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="password">Password</label>
                    <input
                      type="password"
                      id="password"
                      value={password}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      autoComplete="current-password"
                    />
                  </div>
                  <div className="remember-me-group">
                    <label className="remember-me-label">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          setRememberMe(e.target.checked)
                        }
                        disabled={isSubmitting}
                      />
                      <span className="checkbox-custom"></span>
                      <span className="remember-me-text">Remember me</span>
                    </label>
                  </div>
                  <button
                    type="submit"
                    className="auth-button email-submit-button"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Processing...' : 'Sign In'}
                  </button>
                  <div className="forgot-password">
                    <a href="/password-reset">Forgot password?</a>
                  </div>
                  <div className="auth-toggle">
                    <span>Don't have an account?</span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsSignUp(true);
                        setAuthError('');
                        setAuthSuccess('');
                      }}
                      className="toggle-link"
                    >
                      Sign Up
                    </button>
                  </div>
                </form>
              )}

              <div className="divider">
                <span>or continue as guest</span>
              </div>

              <button
                onClick={handleGuestContinue}
                className="auth-button guest-button"
                disabled={isSubmitting}
              >
                <span className="button-icon" aria-hidden="true">🎮</span>
                <span className="button-text">Continue as Guest</span>
              </button>
            </>
          )}
        </div>

        <div className="login-benefits">
          <p className="benefits-title">Why sign in?</p>
          <ul className="benefits-list">
            <li><span aria-hidden="true">💾</span> Save your game progress</li>
            <li><span aria-hidden="true">🏆</span> Unlock achievements</li>
            <li><span aria-hidden="true">👥</span> Find and play with friends</li>
            <li><span aria-hidden="true">⭐</span> Access premium features</li>
          </ul>
        </div>

        <div className="login-footer">
          <p>
            By signing in, you agree to our <a href="/terms">Terms of Service</a> and{' '}
            <a href="/privacy">Privacy Policy</a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
