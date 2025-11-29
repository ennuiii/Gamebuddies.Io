import React from 'react';
import AdWrapper from './AdWrapper';
import AdPlaceholder from './AdPlaceholder';
import './ads.css';

interface AdBannerProps {
  className?: string;
  slot?: string; // For future ad network integration
}

/**
 * Horizontal banner ad component (728x90 desktop, 320x50 mobile).
 * Currently shows a placeholder - will be replaced with real ad network.
 */
const AdBanner: React.FC<AdBannerProps> = ({ className = '', slot }) => {
  // TODO: Replace with real ad network integration
  // For now, show a styled placeholder

  return (
    <AdWrapper type="banner" className={className}>
      <div className="ad-banner-wrapper">
        {/* Desktop banner - 728x90 */}
        <div className="ad-banner-desktop">
          <AdPlaceholder width={728} height={90} label="Banner Ad" />
        </div>
        {/* Mobile banner - 320x50 */}
        <div className="ad-banner-mobile">
          <AdPlaceholder width={320} height={50} label="Banner Ad" />
        </div>
      </div>
    </AdWrapper>
  );
};

export default AdBanner;
