import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { showAchievementUnlock } from './AchievementUnlockToast';
import type { UnlockedAchievement, AchievementRarity, AchievementCategory, AchievementRequirementType } from '@shared/types/achievements';
import './NotificationBell.css';

interface UnseenAchievement extends UnlockedAchievement {
  earned_at: string;
}

interface NotificationBellProps {
  className?: string;
}

const NotificationBell: React.FC<NotificationBellProps> = ({ className }) => {
  const { session } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [unseenAchievements, setUnseenAchievements] = useState<UnseenAchievement[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch unseen achievements
  const fetchUnseen = useCallback(async () => {
    if (!session?.access_token) return;

    try {
      const response = await fetch('/api/achievements/unseen', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.achievements) {
          setUnseenAchievements(data.achievements);
        }
      }
    } catch (error) {
      console.error('[NotificationBell] Error fetching unseen:', error);
    }
  }, [session?.access_token]);

  // Fetch on mount and when session changes
  useEffect(() => {
    fetchUnseen();

    // Poll every 30 seconds for new achievements
    const interval = setInterval(fetchUnseen, 30000);
    return () => clearInterval(interval);
  }, [fetchUnseen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Mark achievement as seen and show toast
  const handleAchievementClick = async (achievement: UnseenAchievement) => {
    if (!session?.access_token) return;

    // Show the fancy toast
    showAchievementUnlock(achievement as UnlockedAchievement);

    // Mark as seen in backend
    try {
      setLoading(true);
      const response = await fetch(`/api/achievements/${achievement.id}/seen`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        // Remove from local state
        setUnseenAchievements(prev => prev.filter(a => a.id !== achievement.id));
      }
    } catch (error) {
      console.error('[NotificationBell] Error marking as seen:', error);
    } finally {
      setLoading(false);
    }
  };

  // Mark all as seen
  const handleMarkAllSeen = async () => {
    if (!session?.access_token || unseenAchievements.length === 0) return;

    setLoading(true);
    try {
      // Mark each as seen
      await Promise.all(
        unseenAchievements.map(achievement =>
          fetch(`/api/achievements/${achievement.id}/seen`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
          })
        )
      );
      setUnseenAchievements([]);
      setIsOpen(false);
    } catch (error) {
      console.error('[NotificationBell] Error marking all as seen:', error);
    } finally {
      setLoading(false);
    }
  };

  const getAchievementEmoji = (achievement: UnseenAchievement): string => {
    if (achievement.id.includes('win') || achievement.id.includes('victory')) return '🏆';
    if (achievement.id.includes('streak')) return '🔥';
    if (achievement.id.includes('game') || achievement.id.includes('played')) return '🎮';
    if (achievement.id.includes('friend')) return '👥';
    if (achievement.id.includes('level')) return '⭐';
    if (achievement.id.includes('xp')) return '✨';
    if (achievement.id.includes('host')) return '🎉';
    if (achievement.id.includes('premium')) return '💎';

    switch (achievement.rarity) {
      case 'legendary': return '👑';
      case 'epic': return '💫';
      case 'rare': return '🌟';
      default: return '🎯';
    }
  };

  const formatTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const unseenCount = unseenAchievements.length;

  return (
    <div className={`notification-bell-container ${className || ''}`} ref={dropdownRef}>
      <button
        className={`notification-bell-button ${unseenCount > 0 ? 'has-notifications' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`Notifications${unseenCount > 0 ? ` (${unseenCount} new)` : ''}`}
        title={unseenCount > 0 ? `${unseenCount} new notification${unseenCount > 1 ? 's' : ''}` : 'Notifications'}
      >
        <svg
          className="bell-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unseenCount > 0 && (
          <span className="notification-badge">{unseenCount > 9 ? '9+' : unseenCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="notification-dropdown">
          <div className="notification-header">
            <h4>Notifications</h4>
            {unseenCount > 0 && (
              <button
                className="mark-all-read"
                onClick={handleMarkAllSeen}
                disabled={loading}
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="notification-list">
            {unseenAchievements.length === 0 ? (
              <div className="notification-empty">
                <span className="empty-icon">🔔</span>
                <p>No new notifications</p>
              </div>
            ) : (
              unseenAchievements.map((achievement) => (
                <button
                  key={achievement.id}
                  className={`notification-item rarity-${achievement.rarity}`}
                  onClick={() => handleAchievementClick(achievement)}
                  disabled={loading}
                >
                  <span className="notification-icon">
                    {achievement.icon_url ? (
                      <img src={achievement.icon_url} alt="" />
                    ) : (
                      getAchievementEmoji(achievement)
                    )}
                  </span>
                  <div className="notification-content">
                    <span className="notification-title">Achievement Unlocked!</span>
                    <span className="notification-name">{achievement.name}</span>
                    <span className="notification-meta">
                      <span className={`rarity-tag rarity-${achievement.rarity}`}>
                        {achievement.rarity}
                      </span>
                      <span className="time-ago">{formatTimeAgo(achievement.earned_at)}</span>
                    </span>
                  </div>
                  <span className="notification-arrow">→</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
