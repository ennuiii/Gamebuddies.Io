import React from 'react';
import type { AchievementWithProgress } from '@shared/types/achievements';
import './AchievementCard.css';

interface AchievementCardProps {
  achievement: AchievementWithProgress;
  showProgress?: boolean;
}

const rarityColors: Record<string, string> = {
  common: '#9CA3AF',
  rare: '#3B82F6',
  epic: '#8B5CF6',
  legendary: '#F59E0B',
};

const rarityLabels: Record<string, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

const AchievementCard: React.FC<AchievementCardProps> = ({ achievement, showProgress = true }) => {
  const {
    id,
    name,
    description,
    icon_url,
    xp_reward,
    points,
    rarity,
    is_hidden,
    is_unlocked,
    user_progress,
    earned_at,
    requirement_type,
    requirement_value,
  } = achievement;

  // For hidden achievements that aren't unlocked, show placeholder
  const isSecret = is_hidden && !is_unlocked;

  // Calculate approximate current value for display
  const currentValue = Math.round((user_progress / 100) * requirement_value);
  
  // Determine display text
  // Show fraction for count/streak if requirement_value > 0
  const showFraction = (requirement_type === 'count' || requirement_type === 'streak') && requirement_value > 0;
  const progressText = showFraction 
    ? `${currentValue} / ${requirement_value}`
    : `${user_progress}%`;

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div
      className={`achievement-card ${is_unlocked ? 'unlocked' : 'locked'} rarity-${rarity}`}
      style={{ '--rarity-color': rarityColors[rarity] } as React.CSSProperties}
    >
      {/* Rarity badge */}
      <span className={`rarity-badge ${rarity}`}>{rarityLabels[rarity]}</span>

      {/* Icon */}
      <div className={`achievement-icon ${is_unlocked ? '' : 'grayscale'}`}>
        {isSecret ? (
          <span className="secret-icon">?</span>
        ) : icon_url ? (
          <img src={icon_url} alt={name} />
        ) : (
          <span className="default-icon">{getDefaultIcon(achievement.category)}</span>
        )}
      </div>

      {/* Content */}
      <div className="achievement-content">
        <h4 className="achievement-name">{isSecret ? '???' : name}</h4>
        <p className="achievement-description">{isSecret ? 'This achievement is hidden' : description}</p>
      </div>

      {/* Progress bar */}
      {showProgress && !is_unlocked && !isSecret && (
        <div className="achievement-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${user_progress}%` }} />
          </div>
          <span className="progress-text">{progressText}</span>
        </div>
      )}

      {/* Rewards */}
      <div className="achievement-rewards">
        <span className="reward xp">
          <span className="reward-icon">+</span>
          {xp_reward} XP
        </span>
        <span className="reward points">
          <span className="reward-icon">+</span>
          {points} pts
        </span>
      </div>

      {/* Unlocked date */}
      {is_unlocked && earned_at && (
        <div className="achievement-earned">
          <span className="earned-label">Unlocked</span>
          <span className="earned-date">{formatDate(earned_at)}</span>
        </div>
      )}
    </div>
  );
};

// Helper function to get default icon based on category
function getDefaultIcon(category: string): string {
  switch (category) {
    case 'games_played':
      return '🎮';
    case 'wins':
      return '🏆';
    case 'social':
      return '👥';
    case 'progression':
      return '⭐';
    case 'premium':
      return '💎';
    case 'special':
      return '🌟';
    default:
      return '🎯';
  }
}

export default AchievementCard;
