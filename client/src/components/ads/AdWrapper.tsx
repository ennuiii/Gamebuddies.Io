import React, { ReactNode, useEffect, useRef } from 'react';
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
 *
 * For banners: Respects grace period and frequency cap (max 3 per session).
 * For other types: Just checks shouldShowAds.
 */
const AdWrapper: React.FC<AdWrapperProps> = ({ children, type = 'banner', className = '' }) => {
  const { shouldShowAds, canShowBannerAd, onBannerImpression, isAdBlocked } = useAds();
  const hasTrackedImpression = useRef(false);

  // Determine if this ad should show
  const shouldRender = !isAdBlocked && (type === 'banner' ? canShowBannerAd : shouldShowAds);

  // Track banner impression when first rendered
  useEffect(() => {
    if (type === 'banner' && shouldRender && !hasTrackedImpression.current) {
      hasTrackedImpression.current = true;
      onBannerImpression();
    }
  }, [type, shouldRender, onBannerImpression]);

  if (!shouldRender) {
    return null;
  }

  return (
    <div className={`ad-container ad-${type} ${className}`}>
      {children}
    </div>
  );
};

export default AdWrapper;
