import { supabaseAdmin } from '../lib/supabase';
import { xpService } from './xpService';
import type {
  Achievement,
  AchievementWithProgress,
  AchievementEvent,
  AchievementCheckResult,
  UnlockedAchievement,
  UserProfile,
  AchievementFilter,
} from '../../shared/types/achievements';

/**
 * Achievement Service
 * Handles achievement checking, granting, and profile retrieval
 */
export class AchievementService {
  /**
   * Check and unlock achievements based on an event
   */
  async checkAchievements(event: AchievementEvent): Promise<AchievementCheckResult> {
    try {
      console.log(`[AchievementService] Checking achievements for user ${event.user_id}, event: ${event.type}`);

      // Call the database function to check achievements
      const { data, error } = await supabaseAdmin.rpc('check_achievements', {
        p_user_id: event.user_id,
        p_event_type: event.type,
        p_event_data: {
          game_id: event.game_id,
          room_id: event.room_id,
          won: event.won,
          score: event.score,
          win_streak: event.win_streak,
          ...event.metadata,
        },
      });

      if (error) {
        console.error('[AchievementService] Error checking achievements:', error);
        return { unlocked: [], count: 0 };
      }

      const result = data as AchievementCheckResult;

      if (result.count > 0) {
        console.log(`[AchievementService] User ${event.user_id} unlocked ${result.count} achievements:`,
          result.unlocked.map(a => a.name).join(', '));
      }

      return result;
    } catch (error) {
      console.error('[AchievementService] Unexpected error:', error);
      return { unlocked: [], count: 0 };
    }
  }

  /**
   * Get all achievements (definitions) with optional filtering
   */
  async getAllAchievements(filter?: AchievementFilter): Promise<Achievement[]> {
    try {
      let query = supabaseAdmin
        .from('achievements')
        .select('*')
        .order('display_order', { ascending: true });

      // Apply filters
      if (filter?.category && filter.category !== 'all') {
        query = query.eq('category', filter.category);
      }
      if (filter?.rarity && filter.rarity !== 'all') {
        query = query.eq('rarity', filter.rarity);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[AchievementService] Error fetching achievements:', error);
        return [];
      }

      return data as Achievement[];
    } catch (error) {
      console.error('[AchievementService] Unexpected error:', error);
      return [];
    }
  }

  /**
   * Get user's achievements with progress
   * Progress is calculated in TypeScript from users table, user_metrics, and friendships
   * This eliminates dependency on SQL functions that may not be deployed
   */
  async getUserAchievements(
    userId: string,
    filter?: AchievementFilter
  ): Promise<AchievementWithProgress[]> {
    try {
      console.log(`[AchievementService] Getting achievements with progress for user ${userId}`);

      // 1. Get all achievements
      const { data: achievements, error: achievementsError } = await supabaseAdmin
        .from('achievements')
        .select('*')
        .order('display_order', { ascending: true });

      if (achievementsError) {
        console.error('[AchievementService] Error fetching achievements:', achievementsError);
        return [];
      }

      // 2. Get user's earned achievements
      const { data: userAchievements, error: userError } = await supabaseAdmin
        .from('user_achievements')
        .select('achievement_id, earned_at')
        .eq('user_id', userId);

      if (userError) {
        console.error('[AchievementService] Error fetching user achievements:', userError);
        return [];
      }

      // Create map of earned achievements
      const earnedMap = new Map(
        (userAchievements || []).map(ua => [ua.achievement_id, ua.earned_at])
      );

      // 3. Pre-fetch common data to reduce database queries
      // Cache user stats for progression/premium achievements
      const cachedUserStats = await this.getUserStatsForProgress(userId);
      // Cache friend count for social achievements
      const cachedFriendCount = await this.getFriendCount(userId);

      console.log(`[AchievementService] Cached stats: level=${cachedUserStats?.level}, xp=${cachedUserStats?.xp}, friends=${cachedFriendCount}`);

      // 4. Calculate progress for each achievement
      const result: AchievementWithProgress[] = await Promise.all(
        (achievements || []).map(async (a: Achievement) => {
          const earnedAt = earnedMap.get(a.id);
          const isUnlocked = !!earnedAt;

          // If unlocked, progress is 100%
          // Otherwise, calculate progress from actual data
          const progress = isUnlocked
            ? 100
            : await this.calculateAchievementProgress(userId, a, cachedUserStats, cachedFriendCount);

          return {
            ...a,
            rarity: a.rarity as 'common' | 'rare' | 'epic' | 'legendary',
            user_progress: progress,
            is_unlocked: isUnlocked,
            earned_at: earnedAt || null,
          };
        })
      );

      // 5. Apply filters
      let filtered = result;

      if (filter?.category && filter.category !== 'all') {
        filtered = filtered.filter(a => a.category === filter.category);
      }
      if (filter?.rarity && filter.rarity !== 'all') {
        filtered = filtered.filter(a => a.rarity === filter.rarity);
      }

      // Filter by status
      if (filter?.status === 'unlocked') {
        filtered = filtered.filter(a => a.is_unlocked);
      } else if (filter?.status === 'locked') {
        filtered = filtered.filter(a => !a.is_unlocked);
      } else if (filter?.status === 'in_progress') {
        filtered = filtered.filter(a => !a.is_unlocked && a.user_progress > 0);
      }

      // 6. Apply sorting
      if (filter?.sort === 'rarity') {
        const rarityOrder: Record<string, number> = { legendary: 0, epic: 1, rare: 2, common: 3 };
        filtered.sort((a, b) => rarityOrder[a.rarity] - rarityOrder[b.rarity]);
      } else if (filter?.sort === 'points') {
        filtered.sort((a, b) => b.points - a.points);
      } else if (filter?.sort === 'progress') {
        filtered.sort((a, b) => b.user_progress - a.user_progress);
      } else if (filter?.sort === 'recent') {
        filtered.sort((a, b) => {
          if (!a.earned_at) return 1;
          if (!b.earned_at) return -1;
          return new Date(b.earned_at).getTime() - new Date(a.earned_at).getTime();
        });
      }

      console.log(`[AchievementService] Returning ${filtered.length} achievements with calculated progress`);
      return filtered;
    } catch (error) {
      console.error('[AchievementService] Unexpected error:', error);
      return [];
    }
  }

  /**
   * Get public user profile with achievements
   */
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    try {
      // Call the database function
      const { data, error } = await supabaseAdmin.rpc('get_user_profile', {
        p_user_id: userId,
      });

      if (error) {
        console.error('[AchievementService] Error fetching user profile:', error);
        return null;
      }

      return data as UserProfile;
    } catch (error) {
      console.error('[AchievementService] Unexpected error:', error);
      return null;
    }
  }

  /**
   * Get user profile by username
   */
  async getUserProfileByUsername(username: string): Promise<UserProfile | null> {
    try {
      // First get the user ID
      const { data: user, error: userError } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('username', username)
        .single();

      if (userError || !user) {
        console.error('[AchievementService] User not found:', username);
        return null;
      }

      return this.getUserProfile(user.id);
    } catch (error) {
      console.error('[AchievementService] Unexpected error:', error);
      return null;
    }
  }

  /**
   * Manually grant an achievement (for special achievements)
   * Now uses server-side logic instead of SQL function for better debugging and data return
   */
  async grantAchievement(
    userId: string,
    achievementId: string,
    roomId?: string,
    gameId?: string
  ): Promise<UnlockedAchievement | null> {
    try {
      console.log(`[AchievementService] Granting achievement "${achievementId}" to user ${userId}`);

      // 1. Check if already earned
      const { data: existing } = await supabaseAdmin
        .from('user_achievements')
        .select('earned_at')
        .eq('user_id', userId)
        .eq('achievement_id', achievementId)
        .maybeSingle();

      if (existing?.earned_at) {
        console.log(`[AchievementService] Achievement "${achievementId}" already earned by user ${userId}`);
        return null;
      }

      // 2. Get achievement definition
      const { data: achievement, error: achievementError } = await supabaseAdmin
        .from('achievements')
        .select('*')
        .eq('id', achievementId)
        .single();

      if (achievementError || !achievement) {
        console.error(`[AchievementService] Achievement "${achievementId}" not found:`, achievementError);
        return null;
      }

      console.log(`[AchievementService] Found achievement: ${achievement.name} (${achievement.xp_reward} XP, ${achievement.points} points)`);

      // 3. Insert/update user_achievements record
      const { error: upsertError } = await supabaseAdmin
        .from('user_achievements')
        .upsert({
          user_id: userId,
          achievement_id: achievementId,
          earned_at: new Date().toISOString(),
          earned_in_room_id: roomId || null,
          earned_in_game: gameId || null,
        }, {
          onConflict: 'user_id,achievement_id'
        });

      if (upsertError) {
        console.error(`[AchievementService] Error inserting user_achievement:`, upsertError);
        return null;
      }

      // 4. Update user XP (with level calculation) and achievement points
      try {
        // Use xpService for XP + level update (atomic, with proper level calculation)
        const xpResult = await xpService.addXp(userId, achievement.xp_reward, `achievement:${achievementId}`);

        if (xpResult.leveledUp) {
          console.log(`[AchievementService] 🎉 User ${userId} leveled up! Level ${xpResult.previousLevel} → ${xpResult.newLevel}`);
        }

        // Update achievement points separately
        const { error: pointsError } = await supabaseAdmin
          .from('users')
          .update({
            achievement_points: supabaseAdmin.rpc ? undefined : undefined, // Will use raw increment below
          })
          .eq('id', userId);

        // Increment achievement points
        const { data: userData } = await supabaseAdmin
          .from('users')
          .select('achievement_points')
          .eq('id', userId)
          .single();

        const newPoints = (userData?.achievement_points || 0) + achievement.points;

        await supabaseAdmin
          .from('users')
          .update({ achievement_points: newPoints })
          .eq('id', userId);

        console.log(`[AchievementService] Updated user ${userId}: +${achievement.xp_reward} XP, +${achievement.points} achievement points`);
      } catch (xpError) {
        console.error(`[AchievementService] Error updating user XP/points:`, xpError);
        // Don't fail the whole achievement grant if XP update fails
      }

      // Note: DB notification removed - socket event handles real-time toast display
      // This prevents the generic green bar from showing alongside the fancy toast

      console.log(`[AchievementService] Successfully granted achievement "${achievement.name}" to user ${userId}`);

      // 6. Return full achievement data for toast
      return {
        id: achievement.id,
        name: achievement.name,
        description: achievement.description || '',
        icon_url: achievement.icon_url || null,
        category: achievement.category as 'games_played' | 'wins' | 'social' | 'progression' | 'premium' | 'special',
        requirement_type: achievement.requirement_type as 'count' | 'streak' | 'condition' | 'special',
        requirement_value: achievement.requirement_value || 1,
        xp_reward: achievement.xp_reward || 0,
        points: achievement.points || 0,
        rarity: (achievement.rarity || 'common') as 'common' | 'rare' | 'epic' | 'legendary',
        earned_at: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[AchievementService] Unexpected error granting achievement:', error);
      return null;
    }
  }

  // =====================================================
  // Helper methods for calculating progress (TypeScript-based)
  // =====================================================

  /**
   * Get a metric value from user_metrics table
   */
  private async getMetricValue(userId: string, metricKey: string): Promise<number> {
    try {
      const { data } = await supabaseAdmin
        .from('user_metrics')
        .select('value')
        .eq('user_id', userId)
        .eq('metric_key', metricKey)
        .is('game_id', null)
        .maybeSingle();
      return data?.value || 0;
    } catch (error) {
      console.error(`[AchievementService] Error getting metric ${metricKey}:`, error);
      return 0;
    }
  }

  /**
   * Get friend count from friendships table
   */
  private async getFriendCount(userId: string): Promise<number> {
    try {
      const { count } = await supabaseAdmin
        .from('friendships')
        .select('*', { count: 'exact', head: true })
        .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
        .eq('status', 'accepted');
      return count || 0;
    } catch (error) {
      console.error('[AchievementService] Error getting friend count:', error);
      return 0;
    }
  }

  /**
   * Get user stats (level, xp, premium_tier) from users table
   */
  private async getUserStatsForProgress(userId: string): Promise<{
    level: number;
    xp: number;
    premium_tier: string;
  } | null> {
    try {
      const { data } = await supabaseAdmin
        .from('users')
        .select('level, xp, premium_tier')
        .eq('id', userId)
        .single();
      return data;
    } catch (error) {
      console.error('[AchievementService] Error getting user stats:', error);
      return null;
    }
  }

  /**
   * Calculate progress for an achievement based on category
   * Returns the RAW CURRENT VALUE (not percentage) - frontend calculates percentage
   * This preserves precision for display (e.g., "1675/10000" instead of "1600/10000")
   */
  private async calculateAchievementProgress(
    userId: string,
    achievement: Achievement,
    cachedUserStats?: { level: number; xp: number; premium_tier: string } | null,
    cachedFriendCount?: number
  ): Promise<number> {
    let currentValue = 0;

    switch (achievement.category) {
      case 'games_played':
        currentValue = await this.getMetricValue(userId, 'games_played');
        break;

      case 'wins':
        if (achievement.requirement_type === 'streak') {
          currentValue = await this.getMetricValue(userId, 'current_win_streak');
        } else {
          currentValue = await this.getMetricValue(userId, 'games_won');
        }
        break;

      case 'social':
        if (achievement.id.startsWith('host')) {
          currentValue = await this.getMetricValue(userId, 'rooms_hosted');
        } else {
          // Friend count - use cached value if available
          currentValue = cachedFriendCount !== undefined
            ? cachedFriendCount
            : await this.getFriendCount(userId);
        }
        break;

      case 'progression':
        // Use cached user stats if available
        const userStats = cachedUserStats !== undefined
          ? cachedUserStats
          : await this.getUserStatsForProgress(userId);

        if (achievement.id.startsWith('level')) {
          currentValue = userStats?.level || 0;
        } else {
          // XP achievements (e.g., xp_1000, xp_5000)
          currentValue = userStats?.xp || 0;
        }
        break;

      case 'premium':
        const user = cachedUserStats !== undefined
          ? cachedUserStats
          : await this.getUserStatsForProgress(userId);
        currentValue = (user?.premium_tier && user.premium_tier !== 'free') ? 1 : 0;
        break;

      case 'special':
      default:
        // Special achievements typically have unique conditions
        // For now, these show 0 progress until manually granted
        currentValue = 0;
        break;
    }

    // Return raw current value - frontend will calculate percentage
    // Cap at requirement_value for display purposes (can't show more than 100%)
    if (!achievement.requirement_value || achievement.requirement_value === 0) {
      return 0;
    }

    return Math.min(currentValue, achievement.requirement_value);
  }

  /**
   * Get achievement statistics for a user
   */
  async getAchievementStats(userId: string): Promise<{
    total: number;
    unlocked: number;
    points: number;
    completion: number;
  }> {
    try {
      // Get total achievements (all, including hidden)
      const { count: total } = await supabaseAdmin
        .from('achievements')
        .select('*', { count: 'exact', head: true });

      // Get unlocked achievements
      const { count: unlocked } = await supabaseAdmin
        .from('user_achievements')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .not('earned_at', 'is', null);

      // Get total achievement points
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('achievement_points')
        .eq('id', userId)
        .single();

      const points = user?.achievement_points ?? 0;
      const completion = total ? Math.round(((unlocked ?? 0) / total) * 100) : 0;

      return {
        total: total ?? 0,
        unlocked: unlocked ?? 0,
        points,
        completion,
      };
    } catch (error) {
      console.error('[AchievementService] Unexpected error:', error);
      return { total: 0, unlocked: 0, points: 0, completion: 0 };
    }
  }
}

// Export singleton instance
export const achievementService = new AchievementService();
