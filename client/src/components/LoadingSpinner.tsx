import React from 'react';
import { useUIStore } from '../stores/useUIStore';
import './LoadingSpinner.css';

interface LoadingSpinnerProps {
  message?: string;
  fullScreen?: boolean;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ message, fullScreen = false }) => {
  const { isLoading, loadingMessage } = useUIStore();

  const displayMessage = message || loadingMessage || 'Loading...';

  if (!isLoading && !message) {
    return null;
  }

  const spinnerContent = (
    <div className={`loading-container ${fullScreen ? 'loading-fullscreen' : ''}`}>
      <div className="loading-spinner">
        <div className="spinner"></div>
      </div>
      <p className="loading-message">{displayMessage}</p>
    </div>
  );

  return spinnerContent;
};

export default LoadingSpinner;
