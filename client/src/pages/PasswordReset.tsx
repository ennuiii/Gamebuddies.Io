import React, { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getSupabaseClient } from '../utils/supabase';
import './PasswordReset.css';

const PasswordReset: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isResetMode, setIsResetMode] = useState<boolean>(false);

  useEffect(() => {
    const type = searchParams.get('type');
    if (type === 'recovery') {
      setIsResetMode(true);
    }
  }, [searchParams]);

  const handleSendResetEmail = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!email) {
      setError('Please enter your email address.');
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = await getSupabaseClient();
      if (!supabase) {
        setError('Failed to connect to authentication service');
        return;
      }

      const redirectUrl =
        window.location.hostname === 'localhost'
          ? `${window.location.origin}/password-reset`
          : 'https://gamebuddies.io/password-reset';

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      if (resetError) {
        setError(resetError.message);
      } else {
        setSuccess(
          'Password reset instructions have been sent to your email. Please check your inbox.'
        );
        setEmail('');
      }
    } catch (err) {
      console.error('Password reset request error:', err);
      setError('An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdatePassword = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!newPassword || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);

    try {
      const supabase = await getSupabaseClient();
      if (!supabase) {
        setError('Failed to connect to authentication service');
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setError(updateError.message);
      } else {
        setSuccess('Password updated successfully! Redirecting to home...');
        setTimeout(() => {
          navigate('/');
        }, 2000);
      }
    } catch (err) {
      console.error('Password update error:', err);
      setError('An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="password-reset-page">
      <div className="password-reset-container">
        <div className="password-reset-header">
          <h1>🎮 GameBuddies.io</h1>
          <p className="password-reset-subtitle">
            {isResetMode ? 'Set New Password' : 'Reset Password'}
          </p>
        </div>

        {error && <div className="reset-error">{error}</div>}
        {success && <div className="reset-success">{success}</div>}

        {!isResetMode ? (
          <>
            <p className="reset-instructions">
              Enter your email address and we'll send you instructions to reset your password.
            </p>

            <form onSubmit={handleSendResetEmail} className="reset-form">
              <div className="form-group">
                <label htmlFor="email">Email Address</label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  disabled={isSubmitting}
                />
              </div>

              <button type="submit" className="reset-button" disabled={isSubmitting}>
                {isSubmitting ? 'Sending...' : 'Send Reset Instructions'}
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="reset-instructions">Please enter your new password below.</p>

            <form onSubmit={handleUpdatePassword} className="reset-form">
              <div className="form-group">
                <label htmlFor="newPassword">New Password</label>
                <input
                  type="password"
                  id="newPassword"
                  value={newPassword}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={isSubmitting}
                />
              </div>

              <div className="form-group">
                <label htmlFor="confirmPassword">Confirm New Password</label>
                <input
                  type="password"
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={isSubmitting}
                />
              </div>

              <button type="submit" className="reset-button" disabled={isSubmitting}>
                {isSubmitting ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </>
        )}

        <div className="reset-footer">
          <button onClick={() => navigate('/login')} className="back-link">
            ← Back to Login
          </button>
        </div>
      </div>
    </div>
  );
};

export default PasswordReset;
