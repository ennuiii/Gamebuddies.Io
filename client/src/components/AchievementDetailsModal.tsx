import React, { useEffect } from 'react';
import type { AchievementWithProgress } from '@shared/types/achievements';
import useFocusTrap from '../hooks/useFocusTrap';
import './AchievementDetailsModal.css';

interface AchievementDetailsModalProps {
  achievement: AchievementWithProgress | null;
  isOpen: boolean;
  onClose: () => void;
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

const categoryLabels: Record<string, string> = {
  games_played: 'Games Played',
  wins: 'Wins',
  social: 'Social',
  progression: 'Progression',
  premium: 'Premium',
  special: 'Special',
};

const categoryIcons: Record<string, string> = {
  games_played: '🎮',
  wins: '🏆',
  social: '👥',
  progression: '⭐',
  premium: '💎',
  special: '🌟',
};

// Hint system for hidden achievements
const hiddenAchievementHints: Record<string, string> = {
  // Win streaks
  win_streak_3: 'Keep winning games consecutively...',
  win_streak_5: 'A longer winning streak awaits...',
  win_streak_7: 'The momentum of victory carries you forward...',
  win_streak_10: 'Can you become unstoppable?',
  // Level achievements
  level_50: 'Dedication to leveling will be rewarded...',
  level_100: 'The pinnacle of progression awaits...',
  // XP achievements
  xp_50000: 'Experience points accumulate over time...',
  xp_100000: 'A lifetime of gaming excellence...',
  // Special
  early_adopter: 'Were you here from the beginning?',
  first_day: 'Some achievements are earned over time...',
  comeback: 'Victory snatched from the jaws of defeat...',
  perfect_game: 'Flawless performance is rare...',
  speed_demon: 'Lightning-fast reflexes required...',
};

const AchievementDetailsModal: React.FC<AchievementDetailsModalProps> = ({
  achievement,
  isOpen,
  onClose,
}) => {
  // Focus trap for modal accessibility - handles Escape key and focus restoration
  const { containerRef } = useFocusTrap<HTMLDivElement>({
    isActive: isOpen && !!achievement,
    onEscape: onClose,
    closeOnEscape: true,
  });

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !achievement) return null;

  const {
    id,
    name,
    description,
    icon_url,
    xp_reward,
    points,
    rarity,
    category,
    is_hidden,
    is_unlocked,
    user_progress,
    earned_at,
    requirement_type,
    requirement_value,
    created_at,
  } = achievement;

  const isSecret = is_hidden && !is_unlocked;

  // user_progress now contains the RAW current value (not percentage)
  // Calculate percentage for the progress bar
  const progressPercent = requirement_value > 0
    ? Math.min(100, Math.round((user_progress / requirement_value) * 100))
    : 0;

  const showFraction = (requirement_type === 'count' || requirement_type === 'streak') && requirement_value > 0;
  const progressText = showFraction
    ? `${user_progress} / ${requirement_value}`
    : `${progressPercent}%`;

  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getRequirementDescription = (): string => {
    if (isSecret) {
      return hiddenAchievementHints[id] || 'This achievement is a mystery...';
    }
    switch (requirement_type) {
      case 'count':
        return `Reach ${requirement_value} in this category`;
      case 'streak':
        return `Achieve a streak of ${requirement_value}`;
      case 'condition':
        return 'Complete the special condition';
      case 'special':
        return 'Complete the secret requirement';
      default:
        return description;
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="achievement-modal-backdrop" onClick={handleBackdropClick}>
      <div
        ref={containerRef}
        className={`achievement-modal rarity-${rarity}`}
        style={{ '--rarity-color': rarityColors[rarity] } as React.CSSProperties}
        role="dialog"
        aria-modal="true"
        aria-labelledby="achievement-modal-title"
      >
        <button className="modal-close-btn" onClick={onClose} aria-label="Close achievement details">
          &times;
        </button>

        {/* Header with rarity indicator */}
        <div className={`modal-header rarity-${rarity}`}>
          <span className={`modal-rarity-badge ${rarity}`}>{rarityLabels[rarity]}</span>
          <span className="modal-category">
            <span aria-hidden="true">{categoryIcons[category]}</span> {categoryLabels[category]}
          </span>
        </div>

        {/* Main content */}
        <div className="modal-content">
          {/* Icon */}
          <div className={`modal-icon ${is_unlocked ? 'unlocked' : 'locked'}`}>
            {isSecret ? (
              <span className="secret-icon" aria-hidden="true">?</span>
            ) : icon_url ? (
              <img src={icon_url} alt={name} />
            ) : (
              <span className="default-icon" aria-hidden="true">{categoryIcons[category]}</span>
            )}
            {is_unlocked && (
              <div className="unlocked-checkmark" aria-hidden="true">
                <span>✓</span>
              </div>
            )}
          </div>

          {/* Title and description */}
          <h2 id="achievement-modal-title" className="modal-title">{isSecret ? '???' : name}</h2>
          <p className="modal-description">
            {isSecret ? 'This achievement is hidden until unlocked' : description}
          </p>

          {/* Hint for hidden achievements */}
          {isSecret && (
            <div className="modal-hint">
              <span className="hint-icon" aria-hidden="true">💡</span>
              <span className="hint-text">{getRequirementDescription()}</span>
            </div>
          )}

          {/* Progress section */}
          {!is_unlocked && !isSecret && (
            <div className="modal-progress-section">
              <h3>Progress</h3>
              <div className="modal-progress-bar">
                <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
              </div>
              <div className="progress-details">
                <span className="progress-text">{progressText}</span>
                <span className="progress-requirement">{getRequirementDescription()}</span>
              </div>
            </div>
          )}

          {/* Rewards */}
          <div className="modal-rewards">
            <h3>Rewards</h3>
            <div className="rewards-grid">
              <div className="reward-item">
                <span className="reward-value">{xp_reward}</span>
                <span className="reward-label">XP</span>
              </div>
              <div className="reward-item">
                <span className="reward-value">{points}</span>
                <span className="reward-label">Points</span>
              </div>
            </div>
          </div>

          {/* Unlock info */}
          {is_unlocked && earned_at && (
            <div className="modal-unlock-info">
              <div className="unlock-badge">
                <span className="unlock-icon" aria-hidden="true">🏆</span>
                <span className="unlock-text">Achievement Unlocked!</span>
              </div>
              <span className="unlock-date">{formatDate(earned_at)}</span>
            </div>
          )}

          {/* Status indicator */}
          <div className={`modal-status ${is_unlocked ? 'unlocked' : 'locked'}`}>
            {is_unlocked ? (
              <>
                <span className="status-icon" aria-hidden="true">✅</span>
                <span>Completed</span>
              </>
            ) : (
              <>
                <span className="status-icon" aria-hidden="true">🔒</span>
                <span>{progressPercent > 0 ? 'In Progress' : 'Not Started'}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AchievementDetailsModal;
