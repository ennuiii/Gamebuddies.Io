import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getSupabaseClient } from '../utils/supabase';
import './LoginPage.css';

const LoginPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, loading } = useAuth();
  const error = searchParams.get('error');

  // Email/Password state
  const [authMode, setAuthMode] = useState('oauth'); // 'oauth' or 'email'
  const [isSignUp, setIsSignUp] = useState(false); // true for sign up, false for sign in
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rememberMe, setRememberMe] = useState(true); // Default to remember

  useEffect(() => {
    // Redirect if already authenticated
    if (isAuthenticated && !loading) {
      navigate('/');
    }
  }, [isAuthenticated, loading, navigate]);

  const handleOAuthLogin = async (provider) => {
    try {
      const supabase = await getSupabaseClient();

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: provider === 'discord' ? 'identify email' : undefined
        }
      });

      if (error) {
        console.error('OAuth login error:', error);
        alert('Login failed. Please try again.');
      }
    } catch (err) {
      console.error('Login error:', err);
      alert('An error occurred. Please try again.');
    }
  };

  const handleGuestContinue = () => {
    navigate('/');
  };

  const handleEmailSignUp = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');

    console.log('📧 [CLIENT] Starting email sign up...', { email });

    // Validation
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
      console.log('📧 [CLIENT] Calling Supabase signUp...');
      const supabase = await getSupabaseClient();

      // Use production URL in production, localhost in development
      const redirectUrl = window.location.hostname === 'localhost'
        ? `${window.location.origin}/auth/callback`
        : 'https://gamebuddies.io/auth/callback';

      console.log('📧 [CLIENT] Using redirect URL:', redirectUrl);

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
        }
      });

      console.log('📧 [CLIENT] Supabase signUp response:', {
        success: !error,
        hasUser: !!data?.user,
        userId: data?.user?.id,
        error: error?.message
      });

      if (error) {
        console.error('❌ [CLIENT] Sign up error:', error);
        setAuthError(error.message);
      } else {
        console.log('✅ [CLIENT] Sign up successful, waiting for email verification');
        setAuthSuccess('Registration successful! Please check your email to verify your account.');
        setEmail('');
        setPassword('');
        setConfirmPassword('');
      }
    } catch (err) {
      console.error('❌ [CLIENT] Sign up exception:', err);
      setAuthError('An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmailSignIn = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');

    console.log('🔑 [CLIENT] Starting email sign in...', { email });

    // Validation
    if (!email || !password) {
      setAuthError('Please enter your email and password.');
      return;
    }

    setIsSubmitting(true);

    try {
      console.log('🔑 [CLIENT] Calling Supabase signInWithPassword...');
      const supabase = await getSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      console.log('🔑 [CLIENT] Supabase signInWithPassword response:', {
        success: !error,
        hasUser: !!data?.user,
        userId: data?.user?.id,
        hasSession: !!data?.session,
        error: error?.message
      });

      if (error) {
        console.error('❌ [CLIENT] Sign in error:', error);
        setAuthError(error.message);
      } else {
        console.log('✅ [CLIENT] Sign in successful, redirecting to home...');

        // --- Credential Management API Integration ---
        // Explicitly tell the browser to save these credentials
        if (window.PasswordCredential) {
          try {
            const credential = new window.PasswordCredential({
              id: email,
              password: password,
              name: email, // Optional: Use email as name for now
            });

            await navigator.credentials.store(credential);
            // console.log('🔐 [CLIENT] Credential storage suggested to browser.'); // Removed log
          } catch (credError) {
            console.error('⚠️ [CLIENT] Error storing credential:', credError);
          }
        }

        // If "Remember Me" is unchecked, set a flag to clear session on browser close
        if (!rememberMe) {
          sessionStorage.setItem('gamebuddies-session-temp', 'true');
          console.log('🔒 [CLIENT] Session marked as temporary (will clear on browser close)');
        } else {
          sessionStorage.removeItem('gamebuddies-session-temp');
        }

        // Auth context will handle the redirect
        // Adding a small delay to allow browser password manager to prompt before redirecting
        setTimeout(() => {
          window.location.href = '/';
        }, 500);
      }
    } catch (err) {
      console.error('❌ [CLIENT] Sign in exception:', err);
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
            {error === 'auth_failed' ? 'Authentication failed. Please try again.' : 'An error occurred during login.'}
          </div>
        )}

        {authError && <div className="login-error">{authError}</div>}
        {authSuccess && <div className="login-success">{authSuccess}</div>}

        {/* Auth Mode Toggle */}
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
              {/* Guest Option */}
              <button
                onClick={handleGuestContinue}
                className="auth-button guest-button"
              >
                <span className="button-icon">🎮</span>
                <span className="button-text">Continue as Guest</span>
              </button>

              <div className="divider">
                <span>or sign in with</span>
              </div>

              {/* OAuth Buttons */}
              <button
                onClick={() => handleOAuthLogin('discord')}
                className="auth-button discord-button"
              >
                <span className="button-icon">
                  <svg width="20" height="20" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.440769 45.4204 0.525289C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.525289C25.5141 0.443589 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z" fill="currentColor"/>
                  </svg>
                </span>
                <span className="button-text">Login with Discord</span>
              </button>

              <button
                onClick={() => handleOAuthLogin('google')}
                className="auth-button google-button"
              >
                <span className="button-icon">
                  <svg width="20" height="20" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M47.532 24.5528C47.532 22.9214 47.3997 21.2811 47.1175 19.6761H24.48V28.9181H37.4434C36.9055 31.8988 35.177 34.5356 32.6461 36.2111V42.2078H40.3801C44.9217 38.0278 47.532 31.8547 47.532 24.5528Z" fill="#4285F4"/>
                    <path d="M24.48 48.0016C30.9529 48.0016 36.4116 45.8764 40.3888 42.2078L32.6549 36.2111C30.5031 37.675 27.7252 38.5039 24.4888 38.5039C18.2275 38.5039 12.9187 34.2798 11.0139 28.6006H3.03296V34.7825C7.10718 42.8868 15.4056 48.0016 24.48 48.0016Z" fill="#34A853"/>
                    <path d="M11.0051 28.6006C9.99973 25.6199 9.99973 22.3922 11.0051 19.4115V13.2296H3.03298C-0.371021 20.0112 -0.371021 28.0009 3.03298 34.7825L11.0051 28.6006Z" fill="#FBBC04"/>
                    <path d="M24.48 9.49932C27.9016 9.44641 31.2086 10.7339 33.6866 13.0973L40.5387 6.24523C36.2 2.17101 30.4414 -0.068932 24.48 0.00161733C15.4055 0.00161733 7.10718 5.11644 3.03296 13.2296L11.005 19.4115C12.901 13.7235 18.2187 9.49932 24.48 9.49932Z" fill="#EA4335"/>
                  </svg>
                </span>
                <span className="button-text">Login with Google</span>
              </button>
            </>
          ) : (
            <>
              {/* Email/Password Form */}
              <form key={isSignUp ? 'signup-form' : 'login-form'} onSubmit={isSignUp ? handleEmailSignUp : handleEmailSignIn} className="email-form" method="post" action="#">
                <div className="form-group">
                  <label htmlFor="email">Email</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                    autocomplete="username"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="password">Password</label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autocomplete="current-password"
                  />
                </div>

                {isSignUp && (
                  <div className="form-group">
                    <label htmlFor="confirmPassword">Confirm Password</label>
                    <input
                      type="password"
                      id="confirmPassword"
                      name="confirmPassword"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      autocomplete="new-password"
                    />
                  </div>
                )}

                {!isSignUp && (
                  <div className="remember-me-group">
                    <label className="remember-me-label">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        disabled={isSubmitting}
                      />
                      <span className="checkbox-custom"></span>
                      <span className="remember-me-text">Remember me</span>
                    </label>
                  </div>
                )}

                <button
                  type="submit"
                  className="auth-button email-submit-button"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Processing...' : isSignUp ? 'Sign Up' : 'Sign In'}
                </button>

                {!isSignUp && (
                  <div className="forgot-password">
                    <a href="/password-reset">Forgot password?</a>
                  </div>
                )}

                <div className="auth-toggle">
                  <span>
                    {isSignUp ? 'Already have an account?' : "Don't have an account?"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSignUp(!isSignUp);
                      setAuthError('');
                      setAuthSuccess('');
                    }}
                    className="toggle-link"
                  >
                    {isSignUp ? 'Sign In' : 'Sign Up'}
                  </button>
                </div>
              </form>

              <div className="divider">
                <span>or continue as guest</span>
              </div>

              <button
                onClick={handleGuestContinue}
                className="auth-button guest-button"
              >
                <span className="button-icon">🎮</span>
                <span className="button-text">Continue as Guest</span>
              </button>
            </>
          )}
        </div>

        <div className="login-benefits">
          <p className="benefits-title">Why sign in?</p>
          <ul className="benefits-list">
            <li>💾 Save your game progress</li>
            <li>🏆 Unlock achievements</li>
            <li>👥 Find and play with friends</li>
            <li>⭐ Access premium features</li>
          </ul>
        </div>

        <div className="login-footer">
          <p>By signing in, you agree to our <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a></p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;