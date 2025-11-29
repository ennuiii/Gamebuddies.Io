import React from 'react';
import AdWrapper from './AdWrapper';
import AdPlaceholder from './AdPlaceholder';
import './ads.css';

interface AdSidebarProps {
  position: 'left' | 'right';
  className?: string;
}

/**
 * Sticky sidebar ad component (160x600 Wide Skyscraper).
 * Only shows on desktop screens (1400px+) to avoid cluttering mobile.
 */
const AdSidebar: React.FC<AdSidebarProps> = ({ position, className = '' }) => {
  return (
    <AdWrapper type="rectangle" className={`ad-sidebar ad-sidebar-${position} ${className}`}>
      <div className="ad-sidebar-wrapper">
        <AdPlaceholder width={160} height={600} label="Side Ad" />
      </div>
    </AdWrapper>
  );
};

export default AdSidebar;
