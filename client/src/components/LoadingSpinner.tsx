import React from 'react';
import './LoadingSpinner.css';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: 'primary' | 'secondary' | 'white';
  inline?: boolean;
  className?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  color = 'secondary',
  inline = false,
  className = '',
}) => {
  const sizeClass = `spinner-${size}`;
  const colorClass = `spinner-${color}`;
  const inlineClass = inline ? 'spinner-inline' : '';

  return (
    <span
      className={`loading-spinner ${sizeClass} ${colorClass} ${inlineClass} ${className}`}
      role="status"
      aria-label="Loading"
    >
      <span className="spinner-ring"></span>
      <span className="spinner-ring"></span>
      <span className="spinner-dot"></span>
    </span>
  );
};

export default LoadingSpinner;
