// Achievement System Types

export type AchievementRarity = 'common' | 'rare' | 'epic' | 'legendary';
export type AchievementCategory = 'games_played' | 'wins' | 'social' | 'progression' | 'premium' | 'special';
export type AchievementRequirementType = 'count' | 'streak' | 'condition' | 'special';

/**
 * Achievement definition from the database
 */
export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon_url: string | null;
  category: AchievementCategory;
  requirement_type: AchievementRequirementType;
  requirement_value: number;
  requirement_data: Record<string, unknown>;
  xp_reward: number;
  points: number;
  premium_only: boolean;
  is_hidden: boolean;
  rarity: AchievementRarity;
  display_order: number;
  created_at: string;
}

/**
 * User's achievement record (earned or in-progress)
 */
export interface UserAchievement {
  id: string;
  user_id: string;
  achievement_id: string;
  earned_at: string | null; // null if not yet earned
  progress: number; // 0-100
  earned_in_room_id: string | null;
  earned_in_game: string | null;
  metadata: Record<string, unknown>;
}

/**
 * Achievement with user progress - for display
 */
export interface AchievementWithProgress extends Achievement {
  user_progress: number; // 0-100
  is_unlocked: boolean;
  earned_at: string | null;
}

/**
 * Unlocked achievement notification data
 */
export interface UnlockedAchievement {
  id: string;
  name: string;
  description: string;
  icon_url: string | null;
  category: AchievementCategory;
  requirement_type: AchievementRequirementType;
  requirement_value: number;
  xp_reward: number;
  points: number;
  rarity: AchievementRarity;
  earned_at: string;
}

/**
 * Event types that can trigger achievement checks
 */
export type AchievementEventType =
  | 'game_completed'
  | 'friend_added'
  | 'room_hosted'
  | 'level_reached'
  | 'xp_earned'
  | 'premium_upgraded'
  | 'special';

/**
 * Event data for achievement checking
 */
export interface AchievementEvent {
  type: AchievementEventType;
  user_id: string;
  game_id?: string;
  room_id?: string;
  won?: boolean;
  score?: number;
  win_streak?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Result of checking achievements
 */
export interface AchievementCheckResult {
  unlocked: UnlockedAchievement[];
  count: number;
}

/**
 * User stats for achievements page
 */
export interface AchievementStats {
  total: number;
  unlocked: number;
  by_rarity: {
    common: number;
    rare: number;
    epic: number;
    legendary: number;
  };
}

/**
 * Public user profile with achievements
 */
export interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_style: string | null;
  avatar_seed: string | null;
  premium_tier: 'free' | 'monthly' | 'lifetime';
  level: number;
  xp: number;
  achievement_points: number;
  stats: {
    games_played: number;
    games_won: number;
    win_rate: number;
    rooms_hosted: number;
    friend_count: number;
  };
  achievements: AchievementStats;
  recent_achievements: UnlockedAchievement[];
}

/**
 * Filter options for achievements list
 */
export interface AchievementFilter {
  category?: AchievementCategory | 'all';
  rarity?: AchievementRarity | 'all';
  status?: 'all' | 'unlocked' | 'locked' | 'in_progress';
  sort?: 'display_order' | 'rarity' | 'points' | 'progress' | 'recent';
}
