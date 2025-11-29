import React, { ReactNode } from 'react';
import { useAds } from './AdContext';
import './ads.css';

interface AdWrapperProps {
  children: ReactNode;
  type?: 'banner' | 'rectangle' | 'video';
  className?: string;
}

/**
 * Wrapper component that only renders ads for free, authenticated users.
 * Premium users, guests, and unauthenticated users see nothing.
 */
const AdWrapper: React.FC<AdWrapperProps> = ({ children, type = 'banner', className = '' }) => {
  const { shouldShowAds } = useAds();

  // Don't show ads to premium users, guests, or unauthenticated
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
