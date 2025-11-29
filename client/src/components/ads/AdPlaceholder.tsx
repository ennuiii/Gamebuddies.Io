import React, { useMemo } from 'react';
import './ads.css';

interface AdPlaceholderProps {
  width: number | string;
  height: number | string;
  label?: string;
}

// Fake ad content for development/testing
const FAKE_ADS = {
  banner: [
    {
      title: 'GameBuddies Premium',
      subtitle: 'No ads, exclusive features!',
      cta: 'Upgrade Now',
      bgColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    },
    {
      title: 'Play More Games',
      subtitle: 'New games added weekly',
      cta: 'Explore',
      bgColor: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    },
    {
      title: 'Invite Friends',
      subtitle: 'Earn bonus XP together!',
      cta: 'Share',
      bgColor: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    },
  ],
  sidebar: [
    {
      title: 'Level Up!',
      subtitle: 'Unlock achievements',
      cta: 'Play Now',
      bgColor: 'linear-gradient(180deg, #11998e 0%, #38ef7d 100%)',
    },
    {
      title: 'Go Premium',
      subtitle: 'Ad-free gaming',
      cta: 'Upgrade',
      bgColor: 'linear-gradient(180deg, #fc4a1a 0%, #f7b733 100%)',
    },
  ],
};

/**
 * Placeholder component for development/testing before real ads are integrated.
 * Shows fake ad content with images and text.
 */
const AdPlaceholder: React.FC<AdPlaceholderProps> = ({
  width,
  height,
  label = 'Ad Space',
}) => {
  const numWidth = typeof width === 'number' ? width : parseInt(width);
  const numHeight = typeof height === 'number' ? height : parseInt(height);

  // Determine ad type based on dimensions
  const isSidebar = numHeight > 400;

  // Select fake ad - use stable selection based on dimensions to avoid re-renders
  const fakeAd = useMemo(() => {
    const adPool = isSidebar ? FAKE_ADS.sidebar : FAKE_ADS.banner;
    // Use dimensions as a pseudo-seed for stable selection
    const index = (numWidth + numHeight) % adPool.length;
    return adPool[index];
  }, [isSidebar, numWidth, numHeight]);

  return (
    <div
      className="ad-placeholder ad-placeholder-fake"
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        background: fakeAd.bgColor,
      }}
    >
      <div className={`ad-fake-content ${isSidebar ? 'ad-fake-vertical' : 'ad-fake-horizontal'}`}>
        <div className="ad-fake-badge">AD</div>
        <div className="ad-fake-text">
          <span className="ad-fake-title">{fakeAd.title}</span>
          <span className="ad-fake-subtitle">{fakeAd.subtitle}</span>
        </div>
        <button className="ad-fake-cta">{fakeAd.cta || 'Learn More'}</button>
      </div>
    </div>
  );
};

export default AdPlaceholder;
