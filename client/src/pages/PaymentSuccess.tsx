import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './PaymentSuccess.css';

const PaymentSuccess: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    console.log('✅ [PAYMENT] Payment successful, session:', sessionId);

    const timer = setTimeout(() => {
      navigate('/');
    }, 5000);

    return () => clearTimeout(timer);
  }, [sessionId, navigate]);

  return (
    <div className="payment-result-page success">
      <div className="result-container">
        <div className="result-icon success-icon">✅</div>
        <h1>Payment Successful!</h1>
        <p className="result-message">
          Thank you for upgrading to Premium! Your account has been activated.
        </p>

        <div className="result-details">
          <h3>What's next?</h3>
          <ul>
            <li>✨ Enjoy your ad-free experience</li>
            <li>🎨 Customize your avatar</li>
            <li>🎮 Access exclusive games</li>
            <li>📊 View advanced statistics</li>
            <li>⚡ Get priority support</li>
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

        <p className="redirect-notice">You will be redirected to the homepage in 5 seconds...</p>
      </div>
    </div>
  );
};

export default PaymentSuccess;
