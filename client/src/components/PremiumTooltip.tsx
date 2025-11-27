import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './PremiumTooltip.css';

type PremiumTier = 'lifetime' | 'monthly' | 'admin' | 'free';

interface PremiumTooltipProps {
  /** The tier to display benefits for */
  tier: PremiumTier;
  /** The element that triggers the tooltip */
  children: React.ReactNode;
  /** Whether to show upgrade CTA (for non-premium viewers) */
  showUpgrade?: boolean;
  /** Position of tooltip */
  position?: 'top' | 'bottom' | 'left' | 'right';
}

const tierConfig: Record<PremiumTier, {
  title: string;
  icon: string;
  color: string;
  benefits: string[];
}> = {
  lifetime: {
    title: 'Lifetime Premium',
    icon: '⭐',
    color: '#FFD700',
    benefits: [
      'All premium features forever',
      'Exclusive avatar customization',
      'Priority game queue',
      'Custom room themes',
      'No ads, ever',
      'Early access to new games',
    ],
  },
  monthly: {
    title: 'Pro Member',
    icon: '💎',
    color: '#00d9ff',
    benefits: [
      'Premium avatar options',
      'Priority matchmaking',
      'Ad-free experience',
      'Exclusive badges',
      'Custom emotes',
    ],
  },
  admin: {
    title: 'Admin',
    icon: '💻',
    color: '#ff4444',
    benefits: [
      'Full system access',
      'Moderation tools',
      'Analytics dashboard',
      'All premium features',
    ],
  },
  free: {
    title: 'Free Player',
    icon: '🎮',
    color: '#a8a8a8',
    benefits: [
      'Access to all games',
      'Basic avatar options',
      'Join public rooms',
    ],
  },
};

const PremiumTooltip: React.FC<PremiumTooltipProps> = ({
  tier,
  children,
  showUpgrade = false,
  position = 'top',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const config = tierConfig[tier];

  useEffect(() => {
    if (isVisible && triggerRef.current && tooltipRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const padding = 8;

      let top = 0;
      let left = 0;

      switch (position) {
        case 'top':
          top = triggerRect.top - tooltipRect.height - padding;
          left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
          break;
        case 'bottom':
          top = triggerRect.bottom + padding;
          left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
          break;
        case 'left':
          top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
          left = triggerRect.left - tooltipRect.width - padding;
          break;
        case 'right':
          top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
          left = triggerRect.right + padding;
          break;
      }

      // Keep tooltip within viewport
      const viewportPadding = 10;
      if (left < viewportPadding) left = viewportPadding;
      if (left + tooltipRect.width > window.innerWidth - viewportPadding) {
        left = window.innerWidth - tooltipRect.width - viewportPadding;
      }
      if (top < viewportPadding) top = viewportPadding;
      if (top + tooltipRect.height > window.innerHeight - viewportPadding) {
        top = window.innerHeight - tooltipRect.height - viewportPadding;
      }

      setTooltipPosition({ top, left });
    }
  }, [isVisible, position]);

  const handleUpgradeClick = (): void => {
    setIsVisible(false);
    navigate('/premium');
  };

  return (
    <div
      ref={triggerRef}
      className="premium-tooltip-trigger"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      {children}

      {isVisible && (
        <div
          ref={tooltipRef}
          className={`premium-tooltip premium-tooltip-${tier}`}
          style={{
            top: tooltipPosition.top,
            left: tooltipPosition.left,
            '--accent-color': config.color,
          } as React.CSSProperties}
          role="tooltip"
        >
          <div className="premium-tooltip-header">
            <span className="premium-tooltip-icon">{config.icon}</span>
            <span className="premium-tooltip-title">{config.title}</span>
          </div>

          <ul className="premium-tooltip-benefits">
            {config.benefits.map((benefit, index) => (
              <li key={index}>
                <span className="benefit-check">✓</span>
                {benefit}
              </li>
            ))}
          </ul>

          {showUpgrade && tier === 'free' && (
            <button
              className="premium-tooltip-upgrade-btn"
              onClick={handleUpgradeClick}
            >
              Upgrade to Premium
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default PremiumTooltip;
