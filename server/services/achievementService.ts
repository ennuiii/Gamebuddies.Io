import { supabaseAdmin } from '../lib/supabase';
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
   * Progress is calculated on-the-fly from user_metrics (not stored in user_achievements)
   */
  async getUserAchievements(
    userId: string,
    filter?: AchievementFilter
  ): Promise<AchievementWithProgress[]> {
    try {
      // Use the new database function that calculates progress from user_metrics
      const { data, error } = await supabaseAdmin.rpc('get_user_achievements_with_progress', {
        p_user_id: userId
      });

      if (error) {
        console.error('[AchievementService] Error fetching achievements with progress:', error);
        // Fallback to old method if new function doesn't exist yet
        return this.getUserAchievementsFallback(userId, filter);
      }

      let result: AchievementWithProgress[] = (data || []).map((a: {
        id: string;
        name: string;
        description: string;
        icon_url: string | null;
        category: string;
        requirement_type: string;
        requirement_value: number;
        xp_reward: number;
        points: number;
        rarity: string;
        display_order: number;
        is_hidden: boolean;
        user_progress: number;
        is_unlocked: boolean;
        earned_at: string | null;
      }) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        icon_url: a.icon_url,
        category: a.category,
        requirement_type: a.requirement_type,
        requirement_value: a.requirement_value,
        xp_reward: a.xp_reward,
        points: a.points,
        rarity: a.rarity as 'common' | 'rare' | 'epic' | 'legendary',
        display_order: a.display_order,
        is_hidden: a.is_hidden,
        user_progress: a.user_progress,
        is_unlocked: a.is_unlocked,
        earned_at: a.earned_at,
      }));

      // Apply filters
      if (filter?.category && filter.category !== 'all') {
        result = result.filter(a => a.category === filter.category);
      }
      if (filter?.rarity && filter.rarity !== 'all') {
        result = result.filter(a => a.rarity === filter.rarity);
      }

      // Filter by status if specified
      if (filter?.status === 'unlocked') {
        result = result.filter(a => a.is_unlocked);
      } else if (filter?.status === 'locked') {
        result = result.filter(a => !a.is_unlocked);
      } else if (filter?.status === 'in_progress') {
        result = result.filter(a => !a.is_unlocked && a.user_progress > 0);
      }

      // Sort if specified
      if (filter?.sort === 'rarity') {
        const rarityOrder = { legendary: 0, epic: 1, rare: 2, common: 3 };
        result.sort((a, b) => rarityOrder[a.rarity] - rarityOrder[b.rarity]);
      } else if (filter?.sort === 'points') {
        result.sort((a, b) => b.points - a.points);
      } else if (filter?.sort === 'progress') {
        result.sort((a, b) => b.user_progress - a.user_progress);
      } else if (filter?.sort === 'recent') {
        result.sort((a, b) => {
          if (!a.earned_at) return 1;
          if (!b.earned_at) return -1;
          return new Date(b.earned_at).getTime() - new Date(a.earned_at).getTime();
        });
      }

      return result;
    } catch (error) {
      console.error('[AchievementService] Unexpected error:', error);
      return [];
    }
  }

  /**
   * Fallback method for getUserAchievements if new DB function doesn't exist yet
   * This uses the old approach of joining achievements + user_achievements
   */
  private async getUserAchievementsFallback(
    userId: string,
    filter?: AchievementFilter
  ): Promise<AchievementWithProgress[]> {
    try {
      console.log('[AchievementService] Using fallback method for getUserAchievements');

      // Get all achievements
      let achievementsQuery = supabaseAdmin
        .from('achievements')
        .select('*')
        .order('display_order', { ascending: true });

      if (filter?.category && filter.category !== 'all') {
        achievementsQuery = achievementsQuery.eq('category', filter.category);
      }
      if (filter?.rarity && filter.rarity !== 'all') {
        achievementsQuery = achievementsQuery.eq('rarity', filter.rarity);
      }

      const { data: achievements, error: achievementsError } = await achievementsQuery;

      if (achievementsError) {
        console.error('[AchievementService] Fallback: Error fetching achievements:', achievementsError);
        return [];
      }

      // Get user's achievement records
      const { data: userAchievements, error: userError } = await supabaseAdmin
        .from('user_achievements')
        .select('*')
        .eq('user_id', userId);

      if (userError) {
        console.error('[AchievementService] Fallback: Error fetching user achievements:', userError);
        return [];
      }

      // Create a map for quick lookup
      const userAchievementMap = new Map(
        (userAchievements || []).map((ua: { achievement_id: string; progress: number; earned_at: string | null }) => [
          ua.achievement_id,
          ua,
        ])
      );

      // Combine achievements with user progress
      let result: AchievementWithProgress[] = (achievements || []).map((a: Achievement) => {
        const userRecord = userAchievementMap.get(a.id) as { progress: number; earned_at: string | null } | undefined;
        return {
          ...a,
          user_progress: userRecord?.progress ?? 0,
          is_unlocked: userRecord?.earned_at != null,
          earned_at: userRecord?.earned_at ?? null,
        };
      });

      // Apply status filter
      if (filter?.status === 'unlocked') {
        result = result.filter(a => a.is_unlocked);
      } else if (filter?.status === 'locked') {
        result = result.filter(a => !a.is_unlocked);
      } else if (filter?.status === 'in_progress') {
        result = result.filter(a => !a.is_unlocked && a.user_progress > 0);
      }

      // Apply sorting
      if (filter?.sort === 'rarity') {
        const rarityOrder: Record<string, number> = { legendary: 0, epic: 1, rare: 2, common: 3 };
        result.sort((a, b) => rarityOrder[a.rarity] - rarityOrder[b.rarity]);
      } else if (filter?.sort === 'points') {
        result.sort((a, b) => b.points - a.points);
      } else if (filter?.sort === 'progress') {
        result.sort((a, b) => b.user_progress - a.user_progress);
      } else if (filter?.sort === 'recent') {
        result.sort((a, b) => {
          if (!a.earned_at) return 1;
          if (!b.earned_at) return -1;
          return new Date(b.earned_at).getTime() - new Date(a.earned_at).getTime();
        });
      }

      return result;
    } catch (error) {
      console.error('[AchievementService] Fallback: Unexpected error:', error);
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

      // 4. Update user XP and achievement points EXPLICITLY
      const { data: userData, error: userFetchError } = await supabaseAdmin
        .from('users')
        .select('xp, achievement_points')
        .eq('id', userId)
        .single();

      if (userFetchError) {
        console.error(`[AchievementService] Error fetching user stats:`, userFetchError);
      } else {
        const newXp = (userData?.xp || 0) + achievement.xp_reward;
        const newPoints = (userData?.achievement_points || 0) + achievement.points;

        console.log(`[AchievementService] Updating user ${userId}: XP ${userData?.xp || 0} -> ${newXp}, Points ${userData?.achievement_points || 0} -> ${newPoints}`);

        const { error: updateError } = await supabaseAdmin
          .from('users')
          .update({
            xp: newXp,
            achievement_points: newPoints,
          })
          .eq('id', userId);

        if (updateError) {
          console.error(`[AchievementService] Error updating user XP/points:`, updateError);
        } else {
          console.log(`[AchievementService] Successfully updated user XP and points`);
        }
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
