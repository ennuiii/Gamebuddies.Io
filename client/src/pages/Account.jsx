import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getSupabaseClient } from '../utils/supabase';
import './Account.css';

const Account = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(false);

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    navigate('/login');
    return null;
  }

  const isPremium = user?.premium_tier === 'lifetime' || user?.premium_tier === 'monthly';
  const isLifetime = user?.premium_tier === 'lifetime';
  const isMonthly = user?.premium_tier === 'monthly';

  // Check if subscription is canceled but still active
  const isCanceled = user?.subscription_canceled_at && isPremium;

  // Check if user was previously premium (has expiration date but is now free)
  const wasPremium = !isPremium && user?.premium_expires_at;

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Handle opening Stripe Customer Portal
  const handleManageSubscription = async () => {
    console.log('⚙️  [ACCOUNT] Opening Stripe Customer Portal');
    setLoading(true);

    try {
      // Get JWT token for authentication
      const supabase = await getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/api/stripe/customer-portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          userId: user.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to open customer portal');
      }

      console.log('✅ [ACCOUNT] Redirecting to Customer Portal');
      // Redirect to Stripe Customer Portal
      window.location.href = data.url;
    } catch (error) {
      console.error('❌ [ACCOUNT] Portal error:', error);
      alert(`Error: ${error.message}`);
      setLoading(false);
    }
  };

  // Handle canceling subscription
  const handleCancelSubscription = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to cancel your subscription?\n\n' +
      'Your premium access will continue until the end of your current billing period.'
    );

    if (!confirmed) return;

    console.log('🚫 [ACCOUNT] Canceling subscription');
    setLoading(true);

    try {
      // Get JWT token for authentication
      const supabase = await getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/api/stripe/cancel-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          userId: user.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to cancel subscription');
      }

      console.log('✅ [ACCOUNT] Subscription canceled');
      alert('Your subscription has been canceled. Premium access will continue until the end of your billing period.');

      // Reload page to update status
      window.location.reload();
    } catch (error) {
      console.error('❌ [ACCOUNT] Cancel error:', error);
      alert(`Error: ${error.message}`);
      setLoading(false);
    }
  };

  return (
    <div className="account-page">
      <div className="account-container">
        <div className="account-header">
          <h1>Account Settings</h1>
          <p className="account-subtitle">Manage your profile and subscription</p>
        </div>

        {/* User Information */}
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
            <div className="info-item">
              <label>User ID</label>
              <div className="info-value info-id">{user?.id?.substring(0, 8)}...</div>
            </div>
          </div>
        </div>

        {/* Subscription Status */}
        <div className="account-section subscription-section">
          <h2>Subscription Status</h2>

          <div className="status-card">
            <div className="status-header">
              <div className="status-icon">
                {isLifetime ? '⭐' : isMonthly ? '💎' : '🎮'}
              </div>
              <div className="status-info">
                <h3>
                  {isLifetime ? 'Lifetime Premium' :
                   isMonthly ? 'Monthly Premium' :
                   'Free Plan'}
                </h3>
                <p className="status-description">
                  {isLifetime ? 'You have lifetime access to all premium features' :
                   isCanceled ? 'Your subscription is canceled and will end at the next billing date' :
                   isMonthly ? 'Your subscription renews automatically each month' :
                   wasPremium ? 'Your premium subscription has ended' :
                   'Upgrade to premium for exclusive features'}
                </p>
              </div>
            </div>

            {isPremium && (
              <div className="subscription-details">
                <div className="detail-row">
                  <span className="detail-label">Status</span>
                  <span className={`detail-value ${isCanceled ? 'status-canceled' : 'status-active'}`}>
                    {isCanceled ? 'Canceled (Active until expiration)' : 'Active'}
                  </span>
                </div>

                {isMonthly && user?.premium_expires_at && (
                  <div className="detail-row">
                    <span className="detail-label">{isCanceled ? 'Access Ends' : 'Next Billing Date'}</span>
                    <span className="detail-value">{formatDate(user.premium_expires_at)}</span>
                  </div>
                )}

                {isCanceled && user?.subscription_canceled_at && (
                  <div className="detail-row">
                    <span className="detail-label">Canceled On</span>
                    <span className="detail-value">{formatDate(user.subscription_canceled_at)}</span>
                  </div>
                )}

                {isLifetime && (
                  <div className="detail-row">
                    <span className="detail-label">Access</span>
                    <span className="detail-value">Forever</span>
                  </div>
                )}

                {user?.stripe_customer_id && (
                  <div className="detail-row">
                    <span className="detail-label">Customer ID</span>
                    <span className="detail-value info-id">
                      {user.stripe_customer_id.substring(0, 12)}...
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Show expiration date for expired subscriptions */}
            {wasPremium && (
              <div className="subscription-details">
                <div className="detail-row">
                  <span className="detail-label">Status</span>
                  <span className="detail-value status-expired">Expired</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Subscription Ended</span>
                  <span className="detail-value">{formatDate(user.premium_expires_at)}</span>
                </div>
                {user?.stripe_customer_id && (
                  <div className="detail-row">
                    <span className="detail-label">Customer ID</span>
                    <span className="detail-value info-id">
                      {user.stripe_customer_id.substring(0, 12)}...
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="subscription-actions">
              {!isPremium ? (
                <button
                  onClick={() => navigate('/premium')}
                  className="btn btn-primary"
                >
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

                  {isCanceled && (
                    <div className="cancellation-notice">
                      <p>⚠️ Your subscription is canceled. You can reactivate it through the Stripe Customer Portal.</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Premium Features */}
        {isPremium && (
          <div className="account-section">
            <h2>Premium Features</h2>
            <div className="features-list">
              <div className="feature-item">
                <span className="feature-icon">✓</span>
                <span className="feature-text">Ad-free experience</span>
              </div>
              <div className="feature-item">
                <span className="feature-icon">✓</span>
                <span className="feature-text">Custom avatars</span>
              </div>
              <div className="feature-item">
                <span className="feature-icon">✓</span>
                <span className="feature-text">Priority support</span>
              </div>
              <div className="feature-item">
                <span className="feature-icon">✓</span>
                <span className="feature-text">Exclusive games</span>
              </div>
              <div className="feature-item">
                <span className="feature-icon">✓</span>
                <span className="feature-text">Advanced statistics</span>
              </div>
              {isLifetime && (
                <div className="feature-item premium">
                  <span className="feature-icon">⭐</span>
                  <span className="feature-text">Lifetime access to all future features</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Help Section */}
        <div className="account-section help-section">
          <h2>Need Help?</h2>
          <p>
            If you have any questions about your subscription or account,
            please contact our support team.
          </p>
          <button
            onClick={() => window.location.href = 'mailto:support@gamebuddies.io'}
            className="btn btn-outline"
          >
            Contact Support
          </button>
        </div>
      </div>
    </div>
  );
};

export default Account;
