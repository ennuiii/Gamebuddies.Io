import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { UnlockedAchievement, AchievementRarity, AchievementCategory, AchievementRequirementType } from '@shared/types/achievements';
import './AchievementUnlockToast.css';

interface AchievementToastItem extends UnlockedAchievement {
  toastId: string;
}

interface AchievementUnlockToastProps {
  /** Duration in ms before auto-dismiss (default 6000) */
  duration?: number;
  /** Maximum toasts visible at once */
  maxVisible?: number;
}

// Global toast queue - allows adding toasts from anywhere
let toastIdCounter = 0;
const toastListeners = new Set<(achievement: UnlockedAchievement) => void>();

// Public function to show an achievement unlock toast
export const showAchievementUnlock = (achievement: UnlockedAchievement): void => {
  toastListeners.forEach((listener) => listener(achievement));
};

// Show multiple achievements
export const showAchievementUnlocks = (achievements: UnlockedAchievement[]): void => {
  achievements.forEach((achievement, index) => {
    // Stagger the toasts slightly
    setTimeout(() => {
      showAchievementUnlock(achievement);
    }, index * 300);
  });
};

const AchievementUnlockToast: React.FC<AchievementUnlockToastProps> = ({
  duration = 6000,
  maxVisible = 3,
}) => {
  const navigate = useNavigate();
  const [toasts, setToasts] = useState<AchievementToastItem[]>([]);

  // Register listener on mount
  useEffect(() => {
    const handleNewAchievement = (achievement: UnlockedAchievement) => {
      const toastId = `achievement-toast-${++toastIdCounter}-${Date.now()}`;
      const newToast: AchievementToastItem = { ...achievement, toastId };

      setToasts((prev) => {
        const updated = [...prev, newToast];
        // Limit visible toasts
        if (updated.length > maxVisible) {
          return updated.slice(-maxVisible);
        }
        return updated;
      });

      // Auto-dismiss after duration
      setTimeout(() => {
        dismissToast(toastId);
      }, duration);
    };

    toastListeners.add(handleNewAchievement);
    return () => {
      toastListeners.delete(handleNewAchievement);
    };
  }, [duration, maxVisible]);

  const dismissToast = useCallback((toastId: string) => {
    setToasts((prev) => prev.filter((t) => t.toastId !== toastId));
  }, []);

  const handleViewAchievements = useCallback(() => {
    setToasts([]);
    navigate('/achievements');
  }, [navigate]);

  if (toasts.length === 0) return null;

  return (
    <div className="achievement-toast-container">
      {toasts.map((toast, index) => (
        <div
          key={toast.toastId}
          className={`achievement-toast rarity-${toast.rarity}`}
          style={{ animationDelay: `${index * 0.1}s` }}
        >
          <div className="toast-celebration">
            <div className="celebration-particles">
              {[...Array(8)].map((_, i) => (
                <span key={i} className="particle" style={{ '--i': i } as React.CSSProperties} />
              ))}
            </div>
          </div>

          <div className="toast-header">
            <span className="toast-icon">🏆</span>
            <span className="toast-title">Achievement Unlocked!</span>
            <button
              className="toast-close"
              onClick={() => dismissToast(toast.toastId)}
              aria-label="Dismiss"
            >
              &times;
            </button>
          </div>

          <div className="toast-content">
            <div className="achievement-icon-wrapper">
              {toast.icon_url ? (
                <img src={toast.icon_url} alt="" className="achievement-icon-img" />
              ) : (
                <span className="achievement-icon-fallback">
                  {getAchievementEmoji(toast.id, toast.rarity)}
                </span>
              )}
            </div>

            <div className="achievement-details">
              <h4 className="achievement-name">{toast.name}</h4>
              <p className="achievement-description">{toast.description}</p>
              <div className="badge-row">
                {toast.category && (
                  <span className="achievement-category">
                    {getCategoryLabel(toast.category)}
                  </span>
                )}
                <RarityBadge rarity={toast.rarity} />
              </div>
            </div>
          </div>

          {toast.requirement_value && toast.requirement_value > 0 && (
            <div className="unlock-requirement">
              <span className="requirement-label">Requirement:</span>
              <span className="requirement-value">
                {getRequirementText(toast.category, toast.requirement_type, toast.requirement_value)}
              </span>
            </div>
          )}

          <div className="toast-rewards">
            <div className="reward-item xp">
              <span className="reward-icon">✨</span>
              <span className="reward-value">+{toast.xp_reward} XP</span>
            </div>
            <div className="reward-item points">
              <span className="reward-icon">🎯</span>
              <span className="reward-value">+{toast.points} Points</span>
            </div>
          </div>

          <button className="view-achievements-btn" onClick={handleViewAchievements}>
            View Achievements
          </button>
        </div>
      ))}
    </div>
  );
};

// Rarity Badge Component
const RarityBadge: React.FC<{ rarity: AchievementRarity }> = ({ rarity }) => {
  return (
    <span className={`rarity-badge rarity-${rarity}`}>
      {rarity.toUpperCase()}
    </span>
  );
};

// Helper function to get achievement emoji based on id
function getAchievementEmoji(achievementId: string, rarity: AchievementRarity): string {
  if (achievementId.includes('win') || achievementId.includes('victory')) return '🏆';
  if (achievementId.includes('streak')) return '🔥';
  if (achievementId.includes('game') || achievementId.includes('played')) return '🎮';
  if (achievementId.includes('friend')) return '👥';
  if (achievementId.includes('level')) return '⭐';
  if (achievementId.includes('xp')) return '✨';
  if (achievementId.includes('host')) return '🎉';
  if (achievementId.includes('premium')) return '💎';

  // Default based on rarity
  switch (rarity) {
    case 'legendary': return '👑';
    case 'epic': return '💫';
    case 'rare': return '🌟';
    default: return '🎯';
  }
}

// Helper function to get category display label
function getCategoryLabel(category: AchievementCategory): string {
  switch (category) {
    case 'games_played': return 'Games';
    case 'wins': return 'Victories';
    case 'social': return 'Social';
    case 'progression': return 'Progression';
    case 'premium': return 'Premium';
    case 'special': return 'Special';
    default: return 'Achievement';
  }
}

// Helper function to get requirement text
function getRequirementText(
  category: AchievementCategory | undefined,
  requirementType: AchievementRequirementType | undefined,
  requirementValue: number
): string {
  if (!category) return `Complete ${requirementValue} times`;

  switch (category) {
    case 'games_played':
      return `Play ${requirementValue} game${requirementValue !== 1 ? 's' : ''}`;
    case 'wins':
      if (requirementType === 'streak') {
        return `Win ${requirementValue} game${requirementValue !== 1 ? 's' : ''} in a row`;
      }
      return `Win ${requirementValue} game${requirementValue !== 1 ? 's' : ''}`;
    case 'social':
      return `Make ${requirementValue} friend${requirementValue !== 1 ? 's' : ''}`;
    case 'progression':
      return `Reach level ${requirementValue}`;
    case 'premium':
      return 'Subscribe to Premium';
    case 'special':
      return 'Complete special challenge';
    default:
      return `Complete ${requirementValue} times`;
  }
}

export default AchievementUnlockToast;
