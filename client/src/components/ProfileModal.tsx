import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from './Avatar';
import LoadingSpinner from './LoadingSpinner';
import useFocusTrap from '../hooks/useFocusTrap';
import type { UserProfile, UnlockedAchievement } from '@shared/types/achievements';
import './ProfileModal.css';

interface ProfileModalProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ userId, isOpen, onClose }) => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Focus trap for modal accessibility - handles Escape key and focus restoration
  const { containerRef } = useFocusTrap<HTMLDivElement>({
    isActive: isOpen,
    onEscape: onClose,
    closeOnEscape: true,
  });

  useEffect(() => {
    if (isOpen && userId) {
      fetchProfile();
    }
  }, [isOpen, userId]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle click outside
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const fetchProfile = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/achievements/profile/${userId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch profile');
      }

      setProfile(data.profile);
    } catch (err) {
      console.error('Error fetching profile:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleViewAllAchievements = () => {
    onClose();
    navigate(`/achievements/${userId}`);
  };

  if (!isOpen) return null;

  const premiumBadge = profile?.premium_tier !== 'free' ? (
    <span className={`premium-badge tier-${profile?.premium_tier}`}>
      {profile?.premium_tier === 'lifetime' ? 'LIFETIME' : 'PRO'}
    </span>
  ) : null;

  return (
    <div className="profile-modal-overlay" onClick={handleBackdropClick}>
      <div
        ref={containerRef}
        className="profile-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-modal-title"
      >
        <button className="close-button" onClick={onClose} aria-label="Close profile">
          &times;
        </button>

        {loading ? (
          <div className="profile-loading">
            <LoadingSpinner size="lg" />
            <p>Loading profile...</p>
          </div>
        ) : error ? (
          <div className="profile-error">
            <p>{error}</p>
            <button onClick={onClose}>Close</button>
          </div>
        ) : profile ? (
          <>
            {/* Header */}
            <div className="profile-header">
              <div className="profile-avatar">
                <Avatar
                  url={profile.avatar_url}
                  style={profile.avatar_style || undefined}
                  seed={profile.avatar_seed || undefined}
                  size={80}
                />
              </div>
              <div className="profile-info">
                <h2 id="profile-modal-title" className="profile-name">
                  {profile.display_name || profile.username}
                  {premiumBadge}
                </h2>
                <p className="profile-username">@{profile.username}</p>
                <div className="profile-level">
                  <span className="level-badge">Lvl {profile.level}</span>
                  <div className="xp-bar">
                    <div
                      className="xp-fill"
                      style={{ width: `${Math.min(100, ((profile.xp % 1000) / 1000) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Achievement Points */}
            <div className="achievement-points-display">
              <span className="points-icon" aria-hidden="true">🏆</span>
              <span className="points-value">{profile.achievement_points}</span>
              <span className="points-label">Achievement Points</span>
            </div>

            {/* Stats */}
            <div className="profile-stats">
              <div className="stat">
                <span className="stat-value">{profile.stats.games_played}</span>
                <span className="stat-label">Games</span>
              </div>
              <div className="stat">
                <span className="stat-value">{profile.stats.games_won}</span>
                <span className="stat-label">Wins</span>
              </div>
              <div className="stat">
                <span className="stat-value">{profile.stats.win_rate}%</span>
                <span className="stat-label">Win Rate</span>
              </div>
              <div className="stat">
                <span className="stat-value">{profile.achievements.unlocked}</span>
                <span className="stat-label">Achievements</span>
              </div>
            </div>

            {/* Recent Achievements */}
            {profile.recent_achievements && profile.recent_achievements.length > 0 && (
              <div className="recent-achievements">
                <h3>Recent Achievements</h3>
                <div className="achievements-list">
                  {profile.recent_achievements.slice(0, 3).map((achievement) => (
                    <div key={achievement.id} className={`achievement-mini rarity-${achievement.rarity}`}>
                      <span className="achievement-icon" aria-hidden="true">
                        {getAchievementIcon(achievement.id)}
                      </span>
                      <div className="achievement-info">
                        <span className="achievement-name">{achievement.name}</span>
                        <span className={`achievement-rarity ${achievement.rarity}`}>
                          {achievement.rarity}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* View All Button */}
            <button className="view-all-btn" onClick={handleViewAllAchievements}>
              View All Achievements
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
};

// Helper function to get achievement icon
function getAchievementIcon(achievementId: string): string {
  if (achievementId.includes('win') || achievementId.includes('victory')) return '🏆';
  if (achievementId.includes('game')) return '🎮';
  if (achievementId.includes('friend')) return '👥';
  if (achievementId.includes('level')) return '⭐';
  if (achievementId.includes('xp')) return '✨';
  if (achievementId.includes('host')) return '🎉';
  if (achievementId.includes('premium')) return '💎';
  if (achievementId.includes('streak')) return '🔥';
  return '🎯';
}

export default ProfileModal;
