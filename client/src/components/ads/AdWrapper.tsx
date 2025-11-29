import React, { ReactNode } from 'react';
import { useAds } from './AdContext';
import './ads.css';

interface AdWrapperProps {
  children: ReactNode;
  type?: 'banner' | 'rectangle' | 'video';
  className?: string;
}

/**
 * Wrapper component that only renders ads for non-premium users.
 * Premium users see nothing. Everyone else (free users, guests) sees ads.
 */
const AdWrapper: React.FC<AdWrapperProps> = ({ children, type = 'banner', className = '' }) => {
  const { shouldShowAds } = useAds();

  // Only show ads to non-premium users
  if (!shouldShowAds) {
    return null;
  }

  return (
    <div className={`ad-container ad-${type} ${className}`}>
      {children}
    </div>
  );
};

export default AdWrapper;
