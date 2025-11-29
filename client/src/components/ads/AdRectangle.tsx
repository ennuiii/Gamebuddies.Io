import React from 'react';
import AdWrapper from './AdWrapper';
import AdPlaceholder from './AdPlaceholder';
import { useAds } from './AdContext';
import './ads.css';

interface AdRectangleProps {
  className?: string;
  slot?: string; // For future ad network integration
  size?: 'medium' | 'large'; // 300x250 or 336x280
}

/**
 * Rectangle ad component (300x250 medium rectangle).
 * Currently shows a placeholder - will be replaced with real ad network.
 */
const AdRectangle: React.FC<AdRectangleProps> = ({
  className = '',
  slot,
  size = 'medium',
}) => {
  const { shouldShowAds, isAdBlocked } = useAds();
  const dimensions = size === 'large' ? { width: 336, height: 280 } : { width: 300, height: 250 };

  if (!shouldShowAds || isAdBlocked) {
    return null;
  }

  return (
    <AdWrapper type="rectangle" className={className}>
      <div className="ad-rectangle-wrapper">
        <AdPlaceholder
          width={dimensions.width}
          height={dimensions.height}
          label="Rectangle Ad"
        />
      </div>
    </AdWrapper>
  );
};

export default AdRectangle;
