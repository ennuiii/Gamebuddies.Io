import React, { useState, useEffect, FocusEvent, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { getSupabaseClient } from '../utils/supabase';
import './Premium.css';

interface PriceInfo {
  amount: string;
  currency: string;
  name: string;
}

interface Prices {
  monthly: PriceInfo;
  lifetime: PriceInfo;
}

type PriceType = 'monthly' | 'lifetime';

const Premium: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [loadingTier, setLoadingTier] = useState<PriceType | null>(null);
  const [prices, setPrices] = useState<Prices | null>(null);
  const [loadingPrices, setLoadingPrices] = useState<boolean>(true);
  const { addNotification } = useNotification();
  const [referralCode, setReferralCode] = useState<string>('');
  const [referralCodeValid, setReferralCodeValid] = useState<boolean | null>(null);
  const [validatingCode, setValidatingCode] = useState<boolean>(false);

  const isPremium = user?.premium_tier === 'lifetime' || user?.premium_tier === 'monthly';
  const isLifetime = user?.premium_tier === 'lifetime';
  const isMonthly = user?.premium_tier === 'monthly';

  const checkCodeValidity = async (code: string): Promise<boolean> => {
    if (!code || code.length < 3) return false;
    try {
      const res = await fetch(`/api/stripe/validate-referral/${code}`);
      const data = await res.json();
      return data.valid;
    } catch {
      return false;
    }
  };

  const validateReferralCode = async (): Promise<void> => {
    if (!referralCode || referralCode.length < 3) {
      setReferralCodeValid(null);
      return;
    }

    setValidatingCode(true);
    const isValid = await checkCodeValidity(referralCode);
    setReferralCodeValid(isValid);
    setValidatingCode(false);
  };

  useEffect(() => {
    const fetchPrices = async (): Promise<void> => {
      try {
        const response = await fetch('/api/stripe/prices');
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch prices');
        }

        setPrices({
          monthly: {
            amount: (data.monthly.amount / 100).toFixed(2),
            currency: data.monthly.currency.toUpperCase(),
            name: data.monthly.product.name,
          },
          lifetime: {
            amount: (data.lifetime.amount / 100).toFixed(2),
            currency: data.lifetime.currency.toUpperCase(),
            name: data.lifetime.product.name,
          },
        });

        setLoadingPrices(false);
      } catch (error) {
        setPrices({
          monthly: { amount: '4.99', currency: 'EUR', name: 'Monthly Premium' },
          lifetime: { amount: '29.99', currency: 'EUR', name: 'Lifetime Premium' },
        });
        setLoadingPrices(false);
      }
    };

    fetchPrices();
  }, []);

  const handleUpgrade = async (priceType: PriceType): Promise<void> => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    if (loadingTier) return;

    if (referralCode && referralCodeValid === false) {
      addNotification('Please clear or fix the invalid referral code before proceeding.', 'error');
      return;
    }

    setLoadingTier(priceType);

    try {
      const supabase = await getSupabaseClient();
      if (!supabase) throw new Error('Failed to connect');

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          userId: user?.id,
          priceType,
          referralCode: referralCode.length > 0 ? referralCode : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      window.location.href = data.url;
    } catch (error) {
      addNotification(`Payment error: ${(error as Error).message}`, 'error');
      setLoadingTier(null);
    }
  };

  const handleManageSubscription = async (): Promise<void> => {
    try {
      const supabase = await getSupabaseClient();
      if (!supabase) throw new Error('Failed to connect');

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/api/stripe/customer-portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId: user?.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create portal session');
      }

      window.location.href = data.url;
    } catch (error) {
      addNotification(`Error opening portal: ${(error as Error).message}`, 'error');
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
          <div className="tier-badge">{isLifetime ? '⭐ Lifetime Premium' : '💎 Monthly Premium'}</div>
          {isMonthly && (
            <div className="tier-info">
              <p>Your subscription renews automatically each month</p>
              <button onClick={handleManageSubscription} className="manage-button">
                Manage Subscription
              </button>
            </div>
          )}
        </div>
      )}

      <div className="referral-code-section">
        <h2>Have a Referral Code?</h2>
        <p className="section-description">Enter your streamer's code to support them!</p>
        <div className="form-group relative-input">
          <input
            type="text"
            placeholder="Referral Code (Optional)"
            value={referralCode}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
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
        </div>
      </div>

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
            <li className="not-included">✗ Custom avatars</li>
          </ul>
        </div>

        {/* Monthly Tier */}
        <div className={`pricing-card ${isMonthly ? 'current' : ''}`}>
          <div className="tier-header">
            <h2>{prices?.monthly?.name || 'Monthly Premium'}</h2>
            <div className="price">
              <span className="amount">€{prices?.monthly?.amount || '4.99'}</span>
              <span className="period">/ month</span>
            </div>
          </div>
          <ul className="features">
            <li className="included">✓ All Free features</li>
            <li className="included">✓ Custom avatars</li>
          </ul>
          <div className="card-footer">
            {isMonthly ? (
              <button onClick={handleManageSubscription} className="action-button manage">
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
            <h2>{prices?.lifetime?.name || 'Lifetime Premium'}</h2>
            <div className="price">
              <span className="amount">€{prices?.lifetime?.amount || '29.99'}</span>
              <span className="period">one-time</span>
            </div>
          </div>
          <ul className="features">
            <li className="included">✓ All Monthly features</li>
            <li className="included">✓ Lifetime access</li>
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
    </div>
  );
};

export default Premium;
