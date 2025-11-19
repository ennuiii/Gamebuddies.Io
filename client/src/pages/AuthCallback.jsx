import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../utils/supabase';
import './AuthCallback.css';

const AuthCallback = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  useEffect(() => {
    handleAuthCallback();
  }, []);

  const handleAuthCallback = async () => {
    try {
      console.log('🔐 [AUTH] Handling OAuth callback...');
      const supabase = await getSupabaseClient();

      // Get session from URL hash
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('❌ [AUTH] Session error:', sessionError);
        setError(sessionError.message);
        setStatus('error');
        setTimeout(() => navigate('/login?error=auth_failed'), 2000);
        return;
      }

      if (!session) {
        console.error('❌ [AUTH] No session found');
        setStatus('error');
        setTimeout(() => navigate('/login?error=no_session'), 2000);
        return;
      }

      console.log('✅ [AUTH] Session obtained:', {
        user_id: session.user.id,
        email: session.user.email,
        provider: session.user.app_metadata.provider
      });

      // Sync user to public.users table
      setStatus('syncing');
      await syncUser(session.user);

      // Success! Redirect to home
      setStatus('success');
      setTimeout(() => navigate('/'), 1000);

    } catch (err) {
      console.error('❌ [AUTH] Callback error:', err);
      setError(err.message);
      setStatus('error');
      setTimeout(() => navigate('/login?error=callback_failed'), 2000);
    }
  };

  const syncUser = async (user) => {
    try {
      console.log('🔄 [AUTH] Syncing user to database...');

      const response = await fetch('/api/auth/sync-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          supabase_user_id: user.id,
          email: user.email,
          oauth_provider: user.app_metadata.provider,
          oauth_id: user.user_metadata.provider_id || user.id,
          avatar_url: user.user_metadata.avatar_url || user.user_metadata.picture,
          display_name: user.user_metadata.full_name || user.user_metadata.name || user.email.split('@')[0]
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to sync user');
      }

      const data = await response.json();
      console.log('✅ [AUTH] User synced successfully:', data.user);

    } catch (err) {
      console.error('❌ [AUTH] User sync failed:', err);
      // Don't fail the whole flow if sync fails - user is still authenticated
      // We'll try to sync again on next login
    }
  };

  return (
    <div className="auth-callback-page">
      <div className="auth-callback-container">
        {status === 'loading' && (
          <>
            <div className="spinner"></div>
            <h2>Logging you in...</h2>
            <p>Please wait while we complete your authentication</p>
          </>
        )}

        {status === 'syncing' && (
          <>
            <div className="spinner"></div>
            <h2>Setting up your account...</h2>
            <p>Just a moment</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="success-icon">✓</div>
            <h2>Success!</h2>
            <p>Redirecting you now...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="error-icon">✗</div>
            <h2>Authentication Failed</h2>
            <p>{error || 'Something went wrong. Redirecting to login...'}</p>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthCallback;
