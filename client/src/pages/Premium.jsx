import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Premium.css';

const Premium = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [loadingTier, setLoadingTier] = useState(null);

  const isPremium = user?.premium_tier === 'lifetime' || user?.premium_tier === 'monthly';
  const isLifetime = user?.premium_tier === 'lifetime';
  const isMonthly = user?.premium_tier === 'monthly';

  const handleUpgrade = async (priceType) => {
    if (!isAuthenticated) {
      // Redirect to login if not authenticated
      navigate('/login');
      return;
    }

    if (loadingTier) return; // Prevent double clicks

    setLoadingTier(priceType);
    console.log('💳 [PREMIUM] Creating checkout session:', { priceType, userId: user.id });

    try {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          priceType,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      console.log('✅ [PREMIUM] Redirecting to Stripe Checkout:', data.url);

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (error) {
      console.error('❌ [PREMIUM] Checkout error:', error);
      alert(`Payment error: ${error.message}`);
      setLoadingTier(null);
    }
  };

  const handleManageSubscription = async () => {
    console.log('⚙️  [PREMIUM] Opening customer portal');

    try {
      const response = await fetch('/api/stripe/customer-portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
      alert(`Error: ${error.message}`);
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

      <div className="pricing-tiers">
        {/* Free Tier */}
        <div className={`pricing-card ${!isPremium ? 'current' : ''}`}>
          <div className="tier-header">
            <h2>Free</h2>
            <div className="price">
              <span className="amount">€0</span>
              <span className="period">forever</span>
            </div>
          </div>

          <ul className="features">
            <li className="included">✓ Play all games</li>
            <li className="included">✓ Join rooms</li>
            <li className="included">✓ Basic chat</li>
            <li className="not-included">✗ Custom avatars</li>
            <li className="not-included">✗ Ad-free experience</li>
            <li className="not-included">✗ Premium features</li>
          </ul>

          {!isPremium && (
            <div className="card-footer">
              <span className="current-badge">Current Plan</span>
            </div>
          )}
        </div>

        {/* Monthly Tier */}
        <div className={`pricing-card ${isMonthly ? 'current' : ''} ${!isPremium ? 'recommended' : ''}`}>
          {!isPremium && <div className="recommended-badge">Most Popular</div>}

          <div className="tier-header">
            <h2>Monthly Premium</h2>
            <div className="price">
              <span className="amount">€4.99</span>
              <span className="period">/ month</span>
            </div>
          </div>

          <ul className="features">
            <li className="included">✓ All Free features</li>
            <li className="included">✓ Ad-free experience</li>
            <li className="included">✓ Custom avatars</li>
            <li className="included">✓ Priority support</li>
            <li className="included">✓ Exclusive games</li>
            <li className="included">✓ Advanced statistics</li>
            <li className="included">✓ Custom themes</li>
            <li className="info">↻ Cancel anytime</li>
          </ul>

          <div className="card-footer">
            {isMonthly ? (
              <button
                onClick={handleManageSubscription}
                className="action-button manage"
              >
                Manage Subscription
              </button>
            ) : isLifetime ? (
              <button className="action-button disabled" disabled>
                You have Lifetime
              </button>
            ) : (
              <button
                onClick={() => handleUpgrade('monthly')}
                className="action-button"
                disabled={loadingTier !== null}
              >
                {loadingTier === 'monthly' ? 'Processing...' : 'Subscribe Now'}
              </button>
            )}
          </div>
        </div>

        {/* Lifetime Tier */}
        <div className={`pricing-card premium ${isLifetime ? 'current' : ''}`}>
          <div className="best-value-badge">Best Value</div>

          <div className="tier-header">
            <h2>Lifetime Premium</h2>
            <div className="price">
              <span className="amount">€29.99</span>
              <span className="period">one-time</span>
            </div>
            <div className="savings">Save €30+ over 6 months</div>
          </div>

          <ul className="features">
            <li className="included">✓ All Monthly features</li>
            <li className="included">✓ Lifetime access</li>
            <li className="included">✓ Future features included</li>
            <li className="included">✓ Priority updates</li>
            <li className="included">✓ VIP badge</li>
            <li className="included">✓ Early access to new games</li>
            <li className="included">✓ Exclusive tournaments</li>
            <li className="premium-highlight">⭐ Never pay again</li>
          </ul>

          <div className="card-footer">
            {isLifetime ? (
              <div className="lifetime-badge">
                <span className="star">⭐</span>
                <span>Lifetime Member</span>
              </div>
            ) : (
              <button
                onClick={() => handleUpgrade('lifetime')}
                className="action-button lifetime"
                disabled={loadingTier !== null}
              >
                {loadingTier === 'lifetime' ? 'Processing...' : 'Get Lifetime Access'}
              </button>
            )}
          </div>
        </div>
      </div>

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
