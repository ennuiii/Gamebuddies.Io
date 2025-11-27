import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getSupabaseClient } from '../utils/supabase';
import AchievementCard from '../components/AchievementCard';
import AchievementDetailsModal from '../components/AchievementDetailsModal';
import LoadingSpinner from '../components/LoadingSpinner';
import type {
  AchievementWithProgress,
  AchievementFilter,
  AchievementCategory,
  AchievementRarity,
} from '@shared/types/achievements';
import './Achievements.css';

interface AchievementStats {
  total: number;
  unlocked: number;
  points: number;
  completion: number;
}

interface RarityStats {
  common: { total: number; unlocked: number };
  rare: { total: number; unlocked: number };
  epic: { total: number; unlocked: number };
  legendary: { total: number; unlocked: number };
}

const Achievements: React.FC = () => {
  const { userId } = useParams<{ userId?: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated, session } = useAuth();

  const [achievements, setAchievements] = useState<AchievementWithProgress[]>([]);
  const [stats, setStats] = useState<AchievementStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [categoryFilter, setCategoryFilter] = useState<AchievementCategory | 'all'>('all');
  const [rarityFilter, setRarityFilter] = useState<AchievementRarity | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unlocked' | 'locked' | 'in_progress'>('all');
  const [sortBy, setSortBy] = useState<'display_order' | 'rarity' | 'points' | 'progress' | 'recent'>('display_order');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modal state
  const [selectedAchievement, setSelectedAchievement] = useState<AchievementWithProgress | null>(null);

  // Determine if viewing own or another user's achievements
  const isOwnProfile = !userId || userId === user?.id;
  const targetUserId = userId || user?.id;

  useEffect(() => {
    if (!targetUserId) {
      if (!isAuthenticated) {
        navigate('/login');
      }
      return;
    }

    fetchAchievements();
  }, [targetUserId, isAuthenticated]);

  const fetchAchievements = async () => {
    try {
      setLoading(true);
      setError(null);

      const endpoint = isOwnProfile ? '/api/achievements/me' : `/api/achievements/user/${targetUserId}`;

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      // Add auth header for own profile
      if (isOwnProfile && session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(endpoint, { headers });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch achievements');
      }

      setAchievements(data.achievements || []);
      setStats(data.stats || null);
    } catch (err) {
      console.error('Error fetching achievements:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Calculate rarity stats
  const rarityStats = useMemo((): RarityStats => {
    const stats: RarityStats = {
      common: { total: 0, unlocked: 0 },
      rare: { total: 0, unlocked: 0 },
      epic: { total: 0, unlocked: 0 },
      legendary: { total: 0, unlocked: 0 },
    };

    achievements.forEach((a) => {
      const rarity = a.rarity as keyof RarityStats;
      if (stats[rarity]) {
        stats[rarity].total++;
        if (a.is_unlocked) {
          stats[rarity].unlocked++;
        }
      }
    });

    return stats;
  }, [achievements]);

  // Handle achievement card click
  const handleAchievementClick = useCallback((achievement: AchievementWithProgress) => {
    setSelectedAchievement(achievement);
  }, []);

  // Filter and sort achievements
  const filteredAchievements = useMemo(() => {
    let result = [...achievements];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter((a) =>
        a.name.toLowerCase().includes(query) ||
        a.description.toLowerCase().includes(query) ||
        a.category.toLowerCase().includes(query)
      );
    }

    // Apply category filter
    if (categoryFilter !== 'all') {
      result = result.filter((a) => a.category === categoryFilter);
    }

    // Apply rarity filter
    if (rarityFilter !== 'all') {
      result = result.filter((a) => a.rarity === rarityFilter);
    }

    // Apply status filter
    if (statusFilter === 'unlocked') {
      result = result.filter((a) => a.is_unlocked);
    } else if (statusFilter === 'locked') {
      result = result.filter((a) => !a.is_unlocked);
    } else if (statusFilter === 'in_progress') {
      result = result.filter((a) => !a.is_unlocked && a.user_progress > 0);
    }

    // Apply sorting
    if (sortBy === 'rarity') {
      const rarityOrder = { legendary: 0, epic: 1, rare: 2, common: 3 };
      result.sort((a, b) => rarityOrder[a.rarity] - rarityOrder[b.rarity]);
    } else if (sortBy === 'points') {
      result.sort((a, b) => b.points - a.points);
    } else if (sortBy === 'progress') {
      result.sort((a, b) => b.user_progress - a.user_progress);
    } else if (sortBy === 'recent') {
      result.sort((a, b) => {
        if (!a.earned_at) return 1;
        if (!b.earned_at) return -1;
        return new Date(b.earned_at).getTime() - new Date(a.earned_at).getTime();
      });
    }

    return result;
  }, [achievements, categoryFilter, rarityFilter, statusFilter, sortBy, searchQuery]);

  if (loading) {
    return (
      <div className="achievements-page">
        <div className="loading-container">
          <LoadingSpinner size="lg" />
          <p>Loading achievements...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="achievements-page">
        <div className="error-container">
          <h2>Error</h2>
          <p>{error}</p>
          <button onClick={() => navigate(-1)}>Go Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="achievements-page">
      {/* Header with stats */}
      <header className="achievements-header">
        <button className="back-button" onClick={() => navigate(-1)} aria-label="Go back">
          &larr; Back
        </button>

        <div className="header-content">
          <h1>{isOwnProfile ? 'My Achievements' : 'Achievements'}</h1>

          {stats && (
            <div className="stats-summary">
              <div className="stat-item">
                <div className="stat-value-row">
                  <span className="stat-value">{stats.unlocked}</span>
                  <span className="stat-label">/ {stats.total}</span>
                </div>
                <span className="stat-name">Unlocked</span>
              </div>
              <div className="stat-item highlight">
                <div className="stat-value-row">
                  <span className="stat-value">{stats.points}</span>
                </div>
                <span className="stat-name">Achievement Points</span>
              </div>
              <div className="stat-item">
                <div className="stat-value-row">
                  <span className="stat-value">{stats.completion}%</span>
                </div>
                <span className="stat-name">Complete</span>
              </div>
            </div>
          )}

          {/* Progress bar */}
          {stats && (
            <div className="completion-bar">
              <div className="completion-fill" style={{ width: `${stats.completion}%` }} />
            </div>
          )}

          {/* Rarity breakdown */}
          {achievements.length > 0 && (
            <div className="rarity-breakdown">
              <div className="rarity-stat legendary">
                <span className="rarity-icon">👑</span>
                <span className="rarity-count">{rarityStats.legendary.unlocked}/{rarityStats.legendary.total}</span>
                <span className="rarity-label">Legendary</span>
              </div>
              <div className="rarity-stat epic">
                <span className="rarity-icon">💜</span>
                <span className="rarity-count">{rarityStats.epic.unlocked}/{rarityStats.epic.total}</span>
                <span className="rarity-label">Epic</span>
              </div>
              <div className="rarity-stat rare">
                <span className="rarity-icon">💙</span>
                <span className="rarity-count">{rarityStats.rare.unlocked}/{rarityStats.rare.total}</span>
                <span className="rarity-label">Rare</span>
              </div>
              <div className="rarity-stat common">
                <span className="rarity-icon">⚪</span>
                <span className="rarity-count">{rarityStats.common.unlocked}/{rarityStats.common.total}</span>
                <span className="rarity-label">Common</span>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Search and Filters */}
      <div className="search-bar">
        <div className="search-input-wrapper">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search achievements..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
            aria-label="Search achievements"
          />
          {searchQuery && (
            <button
              className="search-clear-btn"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              &times;
            </button>
          )}
        </div>
      </div>

      <div className="filters-bar">
        <div className="filter-group">
          <label htmlFor="category-filter">Category</label>
          <select
            id="category-filter"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as AchievementCategory | 'all')}
          >
            <option value="all">All Categories</option>
            <option value="games_played">Games Played</option>
            <option value="wins">Wins</option>
            <option value="social">Social</option>
            <option value="progression">Progression</option>
            <option value="premium">Premium</option>
            <option value="special">Special</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="rarity-filter">Rarity</label>
          <select
            id="rarity-filter"
            value={rarityFilter}
            onChange={(e) => setRarityFilter(e.target.value as AchievementRarity | 'all')}
          >
            <option value="all">All Rarities</option>
            <option value="common">Common</option>
            <option value="rare">Rare</option>
            <option value="epic">Epic</option>
            <option value="legendary">Legendary</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="status-filter">Status</label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'unlocked' | 'locked' | 'in_progress')}
          >
            <option value="all">All</option>
            <option value="unlocked">Unlocked</option>
            <option value="locked">Locked</option>
            <option value="in_progress">In Progress</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="sort-by">Sort By</label>
          <select
            id="sort-by"
            value={sortBy}
            onChange={(e) =>
              setSortBy(e.target.value as 'display_order' | 'rarity' | 'points' | 'progress' | 'recent')
            }
          >
            <option value="display_order">Default</option>
            <option value="rarity">Rarity</option>
            <option value="points">Points</option>
            <option value="progress">Progress</option>
            <option value="recent">Recently Unlocked</option>
          </select>
        </div>
      </div>

      {/* Achievement count */}
      <div className="results-info">
        Showing {filteredAchievements.length} of {achievements.length} achievements
      </div>

      {/* Achievements grid */}
      <div className="achievements-grid">
        {filteredAchievements.length > 0 ? (
          filteredAchievements.map((achievement) => (
            <div
              key={achievement.id}
              className="achievement-card-wrapper"
              onClick={() => handleAchievementClick(achievement)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleAchievementClick(achievement);
                }
              }}
            >
              <AchievementCard achievement={achievement} showProgress={isOwnProfile} />
            </div>
          ))
        ) : (
          <div className="empty-state">
            <span className="empty-icon">🏆</span>
            <p>No achievements match your filters</p>
          </div>
        )}
      </div>

      {/* Achievement Details Modal */}
      <AchievementDetailsModal
        achievement={selectedAchievement}
        isOpen={!!selectedAchievement}
        onClose={() => setSelectedAchievement(null)}
      />
    </div>
  );
};

export default Achievements;
