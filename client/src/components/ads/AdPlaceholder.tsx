import React from 'react';
import './ads.css';

interface AdPlaceholderProps {
  width: number | string;
  height: number | string;
  label?: string;
}

/**
 * Placeholder component for development/testing before real ads are integrated.
 * Shows a styled placeholder that matches the GameBuddies design.
 */
const AdPlaceholder: React.FC<AdPlaceholderProps> = ({
  width,
  height,
  label = 'Ad Space',
}) => {
  return (
    <div
      className="ad-placeholder"
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
      }}
    >
      <div className="ad-placeholder-content">
        <span className="ad-placeholder-icon">AD</span>
        <span className="ad-placeholder-label">{label}</span>
        <span className="ad-placeholder-support">Support GameBuddies</span>
      </div>
    </div>
  );
};

export default AdPlaceholder;
