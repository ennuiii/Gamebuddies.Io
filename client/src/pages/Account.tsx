import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { getSupabaseClient } from '../utils/supabase';
import AvatarCustomizer from '../components/AvatarCustomizer';
import Avatar from '../components/Avatar';
import MascotAvatar from '../components/MascotAvatar';
import ConfirmDialog from '../components/ConfirmDialog';
import './Account.css';

interface AvatarData {
  avatar_style?: string;
  avatar_seed?: string;
  avatar_options?: Record<string, unknown>;
}

const Account: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, loading: authLoading, session, refreshUser, isPremium } = useAuth();
  const { addNotification } = useNotification();
  const [loading, setLoading] = useState<boolean>(false);
  const [avatarLoading, setAvatarLoading] = useState<boolean>(false);
  const [showAvatarCustomizer, setShowAvatarCustomizer] = useState<boolean>(false);
  const [showCancelDialog, setShowCancelDialog] = useState<boolean>(false);
  const [isCanceling, setIsCanceling] = useState<boolean>(false);

  if (!isAuthenticated) {
    navigate('/login');
    return null;
  }

  const isLifetime = user?.premium_tier === 'lifetime';
  const isMonthly = user?.premium_tier === 'monthly';
  const isCanceled = user?.subscription_canceled_at && isPremium;
  const wasPremium = !isPremium && user?.premium_expires_at;

  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const handleManageSubscription = async (): Promise<void> => {
    setLoading(true);
    try {
      const supabase = await getSupabaseClient();
      if (!supabase) throw new Error('Failed to connect');

      const {
        data: { session: supabaseSession },
      } = await supabase.auth.getSession();

      if (!supabaseSession?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/api/stripe/customer-portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseSession.access_token}`,
        },
        body: JSON.stringify({ userId: user?.id }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to open customer portal');
      }

      window.location.href = data.url;
    } catch (error) {
      addNotification((error as Error).message || 'Failed to open subscription portal', 'error');
      setLoading(false);
    }
  };

  const handleCancelSubscription = (): void => {
    setShowCancelDialog(true);
  };

  const confirmCancelSubscription = async (): Promise<void> => {
    setIsCanceling(true);
    try {
      const supabase = await getSupabaseClient();
      if (!supabase) throw new Error('Failed to connect');

      const {
        data: { session: supabaseSession },
      } = await supabase.auth.getSession();

      if (!supabaseSession?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/api/stripe/cancel-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseSession.access_token}`,
        },
        body: JSON.stringify({ userId: user?.id }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to cancel subscription');
      }

      setShowCancelDialog(false);
      addNotification(
        'Your subscription has been canceled. Premium access will continue until the end of your billing period.',
        'success'
      );
      // Refresh user data instead of full page reload
      if (refreshUser) {
        await refreshUser();
      }
    } catch (error) {
      addNotification((error as Error).message || 'Failed to cancel subscription', 'error');
    } finally {
      setIsCanceling(false);
    }
  };

  const handleSaveAvatar = async (avatarData: AvatarData): Promise<void> => {
    setAvatarLoading(true);
    try {
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/api/users/avatar', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId: user?.id, ...avatarData }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save avatar');
      }

      setShowAvatarCustomizer(false);
      addNotification('Avatar saved successfully!', 'success');
      if (refreshUser) {
        await refreshUser();
      }
    } catch (error) {
      addNotification((error as Error).message || 'Failed to save avatar', 'error');
    } finally {
      setAvatarLoading(false);
    }
  };

  return (
    <div className="account-page">
      <div className="account-container">
        <div className="account-header">
          <h1>Account Settings</h1>
          <p className="account-subtitle">Manage your profile and subscription</p>
        </div>

        <div className="account-section">
          <h2>Profile Information</h2>
          <div className="info-grid">
            <div className="info-item">
              <label>Username</label>
              <div className="info-value">{user?.username || user?.display_name}</div>
            </div>
            <div className="info-item">
              <label>Email</label>
              <div className="info-value">{user?.email}</div>
            </div>
          </div>
        </div>

        <div className="account-section avatar-section">
          <h2>Custom Avatar</h2>
          {/*
            To mirror the customizer view, the static card uses the same large preview treatment.
            When opened, the same container remains and only the options appear below.
          */}
          {showAvatarCustomizer ? (
            <div className="current-avatar customizer-mode">
              <AvatarCustomizer
                currentStyle={user?.avatar_style}
                currentSeed={user?.avatar_seed}
                currentOptions={user?.avatar_options || {}}
                username={user?.username || user?.display_name}
                onSave={handleSaveAvatar}
                onCancel={() => setShowAvatarCustomizer(false)}
                loading={avatarLoading}
                isPremium={isPremium}
                userRole={user?.role}
                userLevel={user?.level || 1}
              />
            </div>
          ) : (
            <div className="current-avatar">
              <div className="mascot-preview-area static-preview">
                <div className="mascot-preview-wrapper">
                  <div className="mascot-spotlight"></div>
                  <div className="mascot-preview-ring" />
                  {user?.avatar_style === 'custom-mascot' ? (
                    <MascotAvatar config={(user?.avatar_options as Record<string, unknown>) || {}} size={230} />
                  ) : user?.avatar_style ? (
                    <Avatar
                      avatarStyle={user.avatar_style}
                      avatarSeed={user.avatar_seed}
                      avatarOptions={user.avatar_options}
                      name={user.username || user.display_name}
                      size={210}
                      isPremium={true}
                      className="avatar-large"
                    />
                  ) : (
                    <div className="avatar-placeholder">
                      <span>
                        {(user?.username || user?.display_name || '?').charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="mascot-pedestal">
                    <div className="pedestal-top" />
                  </div>
                </div>
                <p className="mascot-helper-text">Select your avatar</p>
              </div>
              <button onClick={() => setShowAvatarCustomizer(true)} className="btn btn-secondary">
                {user?.avatar_style ? 'Change Avatar' : 'Create Avatar'}
              </button>
            </div>
          )}
        </div>

        <div className="account-section subscription-section">
          <h2>Subscription Status</h2>
          <div className="status-card">
            <div className="status-header">
              <div className="status-icon" aria-hidden="true">
                {user?.role === 'admin' ? '💻' : isLifetime ? '⭐' : isMonthly ? '💎' : '🎮'}
              </div>
              <div className="status-info">
                <h3>
                  {user?.role === 'admin'
                    ? 'Administrator'
                    : isLifetime
                      ? 'Lifetime Premium'
                      : isMonthly
                        ? 'Monthly Premium'
                        : 'Free Plan'}
                </h3>
              </div>
            </div>

            <div className="subscription-actions">
              {!isPremium ? (
                <button onClick={() => navigate('/premium')} className="btn btn-primary">
                  Upgrade to Premium
                </button>
              ) : (
                <>
                  <button
                    onClick={handleManageSubscription}
                    className="btn btn-secondary"
                    disabled={loading}
                  >
                    {loading ? 'Loading...' : 'Manage Subscription'}
                  </button>
                  {isMonthly && !isCanceled && (
                    <button
                      onClick={handleCancelSubscription}
                      className="btn btn-danger"
                      disabled={loading}
                    >
                      {loading ? 'Processing...' : 'Cancel Subscription'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="account-section progression-section">
          <h2>Game Progression</h2>
          <div className="info-grid">
            <div className="info-item">
              <label>Achievements</label>
              <div className="progression-actions">
                <button 
                  onClick={() => navigate('/achievements')} 
                  className="btn btn-secondary"
                >
                  View My Achievements
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="account-section help-section">
          <h2>Need Help?</h2>
          <button
            onClick={() => (window.location.href = 'mailto:support@gamebuddies.io')}
            className="btn btn-outline"
          >
            Contact Support
          </button>
        </div>
      </div>

      {/* Cancel Subscription Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showCancelDialog}
        title="Cancel Subscription?"
        message="Are you sure you want to cancel your subscription? Your premium access will continue until the end of your current billing period."
        confirmText="Yes, Cancel"
        cancelText="Keep Subscription"
        variant="danger"
        icon="⚠️"
        onConfirm={confirmCancelSubscription}
        onCancel={() => setShowCancelDialog(false)}
        isLoading={isCanceling}
      />
    </div>
  );
};

export default Account;
