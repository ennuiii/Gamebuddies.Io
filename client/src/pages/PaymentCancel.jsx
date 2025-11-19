import React from 'react';
import { useNavigate } from 'react-router-dom';
import './PaymentSuccess.css'; // Reuse same styles

const PaymentCancel = () => {
  const navigate = useNavigate();

  return (
    <div className="payment-result-page cancel">
      <div className="result-container">
        <div className="result-icon cancel-icon">❌</div>
        <h1>Payment Cancelled</h1>
        <p className="result-message">
          Your payment was cancelled. No charges were made.
        </p>

        <div className="result-details">
          <p>Changed your mind? You can try again anytime!</p>
          <p>Premium features include:</p>
          <ul>
            <li>🚫 Ad-free experience</li>
            <li>🎨 Custom avatars</li>
            <li>🎮 Exclusive games</li>
            <li>📊 Advanced statistics</li>
            <li>⚡ Priority support</li>
          </ul>
        </div>

        <div className="result-actions">
          <button
            onClick={() => navigate('/premium')}
            className="primary-button"
          >
            View Premium Plans
          </button>
          <button
            onClick={() => navigate('/')}
            className="secondary-button"
          >
            Go to Homepage
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentCancel;
