import React, { useState } from 'react';
import { useAds } from './AdContext';
import { useAuth } from '../../contexts/AuthContext';
import './ads.css';

interface RewardedAdButtonProps {
  xpReward?: number;
  className?: string;
  onRewardEarned?: (xp: number) => void;
}

/**
 * "Watch Ad for XP" button shown in lobby or profile.
 * - Logged-in free users: "Watch Ad for +50 XP"
 * - Guests: "Watch Ad to Support" (they don't have XP)
 */
const RewardedAdButton: React.FC<RewardedAdButtonProps> = ({
  xpReward = 50,
  className = '',
  onRewardEarned,
}) => {
  const { shouldShowAds, canShowRewardedAd, rewardedAdCooldown, onRewardedAdComplete } = useAds();
  const { isGuest } = useAuth();
  const [isWatching, setIsWatching] = useState(false);
  const [watchProgress, setWatchProgress] = useState(0);

  // Don't render for premium users
  if (!shouldShowAds) {
    return null;
  }

  const handleClick = async () => {
    if (!canShowRewardedAd || isWatching) return;

    setIsWatching(true);

    // Simulate ad watching (10 seconds for rewarded)
    // TODO: Replace with real rewarded ad SDK
    const duration = 10;
    let progress = 0;

    const interval = setInterval(() => {
      progress += (100 / duration);
      setWatchProgress(progress);

      if (progress >= 100) {
        clearInterval(interval);
        setIsWatching(false);
        setWatchProgress(0);
        onRewardedAdComplete();
        onRewardEarned?.(xpReward);
      }
    }, 1000);
  };

  const formatCooldown = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  if (isWatching) {
    return (
      <div className={`rewarded-ad-watching ${className}`}>
        <div className="rewarded-ad-progress">
          <div
            className="rewarded-ad-progress-fill"
            style={{ width: `${watchProgress}%` }}
          />
        </div>
        <span className="rewarded-ad-progress-text">
          Watching... {Math.ceil((100 - watchProgress) / 10)}s
        </span>
      </div>
    );
  }

  // Different messaging for guests vs logged-in users
  const buttonTitle = !canShowRewardedAd
    ? `Available in ${formatCooldown(rewardedAdCooldown)}`
    : isGuest
      ? 'Watch ad to support GameBuddies'
      : `Watch ad for +${xpReward} XP`;

  return (
    <button
      className={`rewarded-ad-button ${!canShowRewardedAd ? 'on-cooldown' : ''} ${className}`}
      onClick={handleClick}
      disabled={!canShowRewardedAd}
      title={buttonTitle}
    >
      <span className="rewarded-ad-icon">🎬</span>
      <span className="rewarded-ad-text">
        {canShowRewardedAd ? (
          isGuest ? (
            <>Watch Ad to <strong>Support Us</strong></>
          ) : (
            <>Watch Ad for <strong>+{xpReward} XP</strong></>
          )
        ) : (
          <>Available in {formatCooldown(rewardedAdCooldown)}</>
        )}
      </span>
    </button>
  );
};

export default RewardedAdButton;
