import React from 'react';
import { useOrientation } from '../hooks/useOrientation';
import RotateDevicePrompt from './RotateDevicePrompt';

interface LandscapeEnforcerProps {
  children: React.ReactNode;
  enforceOn?: 'always' | 'game-only' | 'never';
  message?: string;
  minWidth?: number; // Only enforce on devices smaller than this width
}

/**
 * LandscapeEnforcer Component
 *
 * Wraps content and shows a "rotate device" prompt on mobile when in portrait mode.
 *
 * Usage:
 * <LandscapeEnforcer enforceOn="game-only">
 *   <GameContent />
 * </LandscapeEnforcer>
 */
const LandscapeEnforcer: React.FC<LandscapeEnforcerProps> = ({
  children,
  enforceOn = 'game-only',
  message,
  minWidth = 769,
}) => {
  const orientation = useOrientation();

  // Don't enforce on desktop
  const isMobile = window.innerWidth < minWidth;

  // Determine if we should show the rotation prompt
  const shouldShowPrompt = (): boolean => {
    if (!isMobile) return false; // Desktop
    if (enforceOn === 'never') return false;
    if (enforceOn === 'always') return orientation.isPortrait;

    // 'game-only' - check if we're in a game
    // You can enhance this logic to check route or game state
    return orientation.isPortrait;
  };

  if (shouldShowPrompt()) {
    return <RotateDevicePrompt message={message} />;
  }

  return <>{children}</>;
};

export default LandscapeEnforcer;
