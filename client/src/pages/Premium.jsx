import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext'; // Import useNotification
import { getSupabaseClient } from '../utils/supabase';
import './Premium.css';

const Premium = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [loadingTier, setLoadingTier] = useState(null);
  const [prices, setPrices] = useState(null);
  const [loadingPrices, setLoadingPrices] = useState(true);
  const { addNotification } = useNotification(); // Get addNotification function
  const [referralCode, setReferralCode] = useState('');
  const [referralCodeValid, setReferralCodeValid] = useState(null); // null=unchecked, true=valid, false=invalid
  const [validatingCode, setValidatingCode] = useState(false);

  const isPremium = user?.premium_tier === 'lifetime' || user?.premium_tier === 'monthly';
  const isLifetime = user?.premium_tier === 'lifetime';
  const isMonthly = user?.premium_tier === 'monthly';

  const checkCodeValidity = async (code) => {
    if (!code || code.length < 3) return false;
    try {
      const res = await fetch(`/api/stripe/validate-referral/${code}`);
      const data = await res.json();
      return data.valid;
    } catch {
      return false;
    }
  };

  // Validate referral code on blur
  const validateReferralCode = async () => {
    if (!referralCode || referralCode.length < 3) {
      setReferralCodeValid(null);
      return;
    }

    setValidatingCode(true);
    const isValid = await checkCodeValidity(referralCode);
    setReferralCodeValid(isValid);
    setValidatingCode(false);
  };

  // Fetch prices from Stripe API on component mount
  useEffect(() => {
    const fetchPrices = async () => {
      console.log('💰 [PREMIUM] Fetching prices from Stripe...');
      try {
        const response = await fetch('/api/stripe/prices');
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch prices');
        }

        console.log('💰 [PREMIUM] Prices fetched:', data);

        // Format prices (Stripe returns cents, convert to euros)
        setPrices({
          monthly: {
            amount: (data.monthly.amount / 100).toFixed(2),
            currency: data.monthly.currency.toUpperCase(),
            name: data.monthly.product.name
          },
          lifetime: {
            amount: (data.lifetime.amount / 100).toFixed(2),
            currency: data.lifetime.currency.toUpperCase(),
            name: data.lifetime.product.name
          }
        });

        setLoadingPrices(false);
      } catch (error) {
        console.error('❌ [PREMIUM] Failed to fetch prices:', error);
        // Fallback to default prices if API fails
        setPrices({
          monthly: { amount: '4.99', currency: 'EUR', name: 'Monthly Premium' },
          lifetime: { amount: '29.99', currency: 'EUR', name: 'Lifetime Premium' }
        });
        setLoadingPrices(false);
      }
    };

    fetchPrices();
  }, []);

  const handleUpgrade = async (priceType) => {
    console.log('🚀 [PREMIUM CLIENT] handleUpgrade called with:', priceType);
    console.log('🔐 [PREMIUM CLIENT] Auth status:', { isAuthenticated, hasUser: !!user, userId: user?.id });

    if (!isAuthenticated) {
      console.warn('⚠️ [PREMIUM CLIENT] User not authenticated, redirecting to login');
      navigate('/login');
      return;
    }

    if (loadingTier) {
      console.warn('⚠️ [PREMIUM CLIENT] Already processing a payment, ignoring click');
      return;
    }

    // Re-validate code on submit if present
    if (referralCode) {
      // Check if we already know it's invalid
      if (referralCodeValid === false) {
        addNotification('Please clear or fix the invalid referral code before proceeding.', 'error');
        return;
      }
      
      // If unchecked or valid, verify one last time (in case it was valid but changed?)
      // Actually, if it's 'true', we trust it. If 'null', we check.
      if (referralCodeValid === null) {
        setValidatingCode(true);
        const isValid = await checkCodeValidity(referralCode);
        setReferralCodeValid(isValid);
        setValidatingCode(false);
        
        if (!isValid) {
          addNotification('The referral code entered is invalid.', 'error');
          return;
        }
      }
    }

    setLoadingTier(priceType);

    const payload = {
      userId: user.id,
      priceType,
      referralCode: referralCode.length > 0 ? referralCode : undefined,
    };

    console.log('💳 [PREMIUM CLIENT] Creating checkout session');
    console.log('📦 [PREMIUM CLIENT] Payload:', payload);
    console.log('🌐 [PREMIUM CLIENT] Fetch URL:', '/api/stripe/create-checkout-session');
    console.log('🌐 [PREMIUM CLIENT] Current origin:', window.location.origin);

    try {
      console.log('📡 [PREMIUM CLIENT] Sending request...');

      // Get JWT token for authentication
      const supabase = await getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(payload),
      });

      console.log('📡 [PREMIUM CLIENT] Response received:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: {
          contentType: response.headers.get('content-type')
        }
      });

      // Try to parse response even if not ok
      let data;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
        console.log('📦 [PREMIUM CLIENT] Response data:', data);
      } else {
        const text = await response.text();
        console.error('❌ [PREMIUM CLIENT] Non-JSON response:', text);
        throw new Error('API endpoint not found');
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      console.log('✅ [PREMIUM CLIENT] Checkout session created successfully!');
      console.log('🔗 [PREMIUM CLIENT] Stripe URL:', data.url);
      console.log('🔗 [PREMIUM CLIENT] Session ID:', data.sessionId);

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (error) {
      console.error('❌ [PREMIUM CLIENT] Checkout error:');
      console.error('  Error name:', error.name);
      console.error('  Error message:', error.message);
      console.error('  Error stack:', error.stack);
      addNotification(`Payment error: ${error.message}`, 'error');
      setLoadingTier(null);
    }
  };

  const handleManageSubscription = async () => {
    console.log('⚙️  [PREMIUM] Opening customer portal');

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
        throw new Error(data.error || 'Failed to create portal session');
      }

      // Redirect to Stripe Customer Portal
      window.location.href = data.url;
    } catch (error) {
      console.error('❌ [PREMIUM] Portal error:', error);
      addNotification(`Error opening portal: ${error.message}`, 'error');
    }
  };

  return (
    <div className="premium-page">
      <div className="premium-header">
        <h1>🎮 GameBuddies Premium</h1>
        <p className="premium-subtitle">
          {isPremium
            ? 'You are a premium member! Thank you for your support. 💜'
            : 'Unlock the full GameBuddies experience'}
        </p>
      </div>

      {isPremium && (
        <div className="current-tier-banner">
          <div className="tier-badge">
            {isLifetime ? '⭐ Lifetime Premium' : '💎 Monthly Premium'}
          </div>
          {isMonthly && (
            <div className="tier-info">
              <p>Your subscription renews automatically each month</p>
              <button
                onClick={handleManageSubscription}
                className="manage-button"
              >
                Manage Subscription
              </button>
            </div>
          )}
        </div>
      )}

      <div className="current-tier-banner">
          <div className="tier-badge">
            {isLifetime ? '⭐ Lifetime Premium' : '💎 Monthly Premium'}
          </div>
          {isMonthly && (
            <div className="tier-info">
              <p>Your subscription renews automatically each month</p>
              <button
                onClick={handleManageSubscription}
                className="manage-button"
              >
                Manage Subscription
              </button>
            </div>
          )}
        </div>
      )}

      <div className="referral-code-section">
        <h2>Have a Referral Code?</h2>
        <p className="section-description">
          Enter your streamer's code to support them!
        </p>
        <div className="form-group relative-input">
          <input
            type="text"
            placeholder="Referral Code (Optional)"
            value={referralCode}
            onChange={(e) => {
              setReferralCode(e.target.value.toUpperCase());
              setReferralCodeValid(null);
            }}
            onBlur={validateReferralCode}
            disabled={loadingTier !== null}
            className={`input ${referralCodeValid === false ? 'input-error' : referralCodeValid === true ? 'input-success' : ''}`}
          />
          {validatingCode && <span className="input-status-icon loading">↻</span>}
          {referralCodeValid === true && <span className="input-status-icon success">✓</span>}
          {referralCodeValid === false && <span className="input-status-icon error">✗</span>}
          
          {referralCodeValid === false && (
            <p className="input-error-message">Invalid referral code. Please check or clear it.</p>
          )}
        </div>
      </div>

      <div className="pricing-tiers">

      <div className="premium-faq">
        <h2>Frequently Asked Questions</h2>

        <div className="faq-grid">
          <div className="faq-item">
            <h3>💳 What payment methods do you accept?</h3>
            <p>We accept all major credit cards, debit cards, and many local payment methods through Stripe.</p>
          </div>

          <div className="faq-item">
            <h3>🔄 Can I cancel my monthly subscription?</h3>
            <p>Yes! You can cancel anytime. You'll keep premium access until the end of your billing period.</p>
          </div>

          <div className="faq-item">
            <h3>⭐ What's the difference between Monthly and Lifetime?</h3>
            <p>Both include the same features. Lifetime is a one-time payment with lifetime access, while Monthly renews each month.</p>
          </div>

          <div className="faq-item">
            <h3>🔒 Is my payment secure?</h3>
            <p>Absolutely! We use Stripe for payment processing. We never store your card details.</p>
          </div>

          <div className="faq-item">
            <h3>🎮 What premium features are included?</h3>
            <p>Ad-free experience, custom avatars, exclusive games, advanced stats, priority support, and more!</p>
          </div>

          <div className="faq-item">
            <h3>💰 Can I upgrade from Monthly to Lifetime?</h3>
            <p>Yes! Just purchase Lifetime. Your monthly subscription will be automatically cancelled.</p>
          </div>
        </div>
      </div>

      <div className="premium-footer">
        <p>Questions? Contact us at <a href="mailto:support@gamebuddies.io">support@gamebuddies.io</a></p>
        <p className="terms">By purchasing, you agree to our <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a></p>
      </div>
    </div>
  );
};

export default Premium;
