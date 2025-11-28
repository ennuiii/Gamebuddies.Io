import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './PaymentSuccess.css';

const PaymentSuccess: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [countdown, setCountdown] = useState<number>(10);
  const [autoRedirectEnabled, setAutoRedirectEnabled] = useState<boolean>(true);

  useEffect(() => {
    console.log('✅ [PAYMENT] Payment successful, session:', sessionId);
  }, [sessionId]);

  useEffect(() => {
    if (!autoRedirectEnabled) return;

    if (countdown <= 0) {
      navigate('/');
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown, autoRedirectEnabled, navigate]);

  const handleCancelRedirect = (): void => {
    setAutoRedirectEnabled(false);
  };

  return (
    <div className="payment-result-page success">
      <div className="result-container" role="main" aria-labelledby="success-title">
        <div className="result-icon success-icon" role="img" aria-label="Success">✅</div>
        <h1 id="success-title">Payment Successful!</h1>
        <p className="result-message">
          Thank you for upgrading to Premium! Your account has been activated.
        </p>

        <div className="result-details">
          <h3>What's next?</h3>
          <ul>
            <li><span aria-hidden="true">✨</span> Enjoy your ad-free experience</li>
            <li><span aria-hidden="true">🎨</span> Customize your avatar</li>
            <li><span aria-hidden="true">🎮</span> Access exclusive games</li>
            <li><span aria-hidden="true">📊</span> View advanced statistics</li>
            <li><span aria-hidden="true">⚡</span> Get priority support</li>
          </ul>
        </div>

        <div className="result-actions">
          <button onClick={() => navigate('/')} className="primary-button">
            Go to Homepage
          </button>
          <button onClick={() => navigate('/premium')} className="secondary-button">
            View Premium Benefits
          </button>
        </div>

        {autoRedirectEnabled ? (
          <p className="redirect-notice" role="status" aria-live="polite">
            Redirecting to homepage in {countdown} seconds...{' '}
            <button
              onClick={handleCancelRedirect}
              className="cancel-redirect-btn"
              aria-label="Cancel automatic redirect"
            >
              Stay here
            </button>
          </p>
        ) : (
          <p className="redirect-notice">
            Auto-redirect cancelled. Use the buttons above to navigate.
          </p>
        )}
      </div>
    </div>
  );
};

export default PaymentSuccess;
