import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { AchievementWithProgress } from '@shared/types/achievements';
import './RecentAchievements.css';

interface RecentAchievementsProps {
  maxDisplay?: number;
}

const RecentAchievements: React.FC<RecentAchievementsProps> = ({ maxDisplay = 4 }) => {
  const navigate = useNavigate();
  const { user, isAuthenticated, session } = useAuth();
  const [achievements, setAchievements] = useState<AchievementWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{ unlocked: number; total: number; points: number } | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !user || user.is_guest) {
      setLoading(false);
      return;
    }

    fetchRecentAchievements();
  }, [isAuthenticated, user, session]);

  const fetchRecentAchievements = async () => {
    try {
      setLoading(true);

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch('/api/achievements/me', { headers });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch achievements');
      }

      // Get unlocked achievements sorted by most recent
      const unlocked = (data.achievements || [])
        .filter((a: AchievementWithProgress) => a.is_unlocked && a.earned_at)
        .sort((a: AchievementWithProgress, b: AchievementWithProgress) => {
          return new Date(b.earned_at!).getTime() - new Date(a.earned_at!).getTime();
        })
        .slice(0, maxDisplay);

      setAchievements(unlocked);
      setStats(data.stats || null);
    } catch (err) {
      console.error('Error fetching recent achievements:', err);
    } finally {
      setLoading(false);
    }
  };

  // Don't render for guests or unauthenticated users
  if (!isAuthenticated || !user || user.is_guest) {
    return null;
  }

  // Don't render if still loading or no achievements
  if (loading) {
    return null;
  }

  // Show even if no recent achievements - to encourage users
  const hasRecentAchievements = achievements.length > 0;

  const getRarityIcon = (rarity: string): string => {
    switch (rarity) {
      case 'legendary':
        return '👑';
      case 'epic':
        return '💜';
      case 'rare':
        return '💙';
      default:
        return '🏅';  // Medal icon instead of white circle for common
    }
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
  };

  return (
    <section className="recent-achievements-section">
      <div className="container">
        <motion.div
          className="section-header"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
        >
          <h2 className="section-title">Your Achievements</h2>
          {stats && (
            <p className="achievement-summary">
              <span className="trophy-icon">🏆</span>
              <span className="points-highlight">{stats.points}</span> points
              <span className="separator">|</span>
              <span className="unlocked-count">{stats.unlocked}</span> / {stats.total} unlocked
            </p>
          )}
        </motion.div>

        {hasRecentAchievements ? (
          <>
            <motion.p
              className="recent-label"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              viewport={{ once: true }}
            >
              Recently Unlocked
            </motion.p>
            <div className="recent-achievements-grid">
              {achievements.map((achievement, index) => (
                <motion.div
                  key={achievement.id}
                  className={`recent-achievement-card rarity-${achievement.rarity}`}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  viewport={{ once: true }}
                  whileHover={{ scale: 1.02, y: -5 }}
                  onClick={() => navigate('/achievements')}
                >
                  <div className="achievement-icon-wrapper">
                    {achievement.icon_url ? (
                      <img src={achievement.icon_url} alt="" className="achievement-icon-img" />
                    ) : (
                      <span className="achievement-icon-emoji">
                        {achievement.icon || getRarityIcon(achievement.rarity)}
                      </span>
                    )}
                    <span className="unlocked-check">✓</span>
                  </div>
                  <div className="achievement-info">
                    <h3 className="achievement-name">{achievement.name}</h3>
                    <p className="achievement-description">{achievement.description}</p>
                    <div className="achievement-meta">
                      <span className={`rarity-badge ${achievement.rarity}`}>
                        {getRarityIcon(achievement.rarity)} {achievement.rarity}
                      </span>
                      <span className="earned-date">{formatDate(achievement.earned_at!)}</span>
                    </div>
                  </div>
                  <div className="achievement-points">
                    <span className="points-value">+{achievement.points}</span>
                    <span className="points-label">pts</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </>
        ) : (
          <motion.div
            className="no-achievements-prompt"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
          >
            <span className="prompt-icon">🎮</span>
            <p>Start playing games to unlock achievements!</p>
          </motion.div>
        )}

        <motion.button
          className="view-all-button"
          onClick={() => navigate('/achievements')}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          viewport={{ once: true }}
          whileHover={{ scale: 1.05, y: -3 }}
          whileTap={{ scale: 0.95 }}
        >
          <span>View All Achievements</span>
          <span className="arrow">→</span>
        </motion.button>
      </div>
    </section>
  );
};

export default RecentAchievements;
