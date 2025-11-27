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
   */
  async getUserAchievements(
    userId: string,
    filter?: AchievementFilter
  ): Promise<AchievementWithProgress[]> {
    try {
      // Force refresh social achievements if asking for all or social category
      // This ensures progress bars are up to date with metrics
      if (!filter?.category || filter.category === 'all' || filter.category === 'social') {
        await this.checkAchievements({
          type: 'room_hosted',
          user_id: userId,
          metadata: { source: 'profile_view' }
        });
      }

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
        console.error('[AchievementService] Error fetching achievements:', achievementsError);
        return [];
      }

      // Get user's achievement records
      const { data: userAchievements, error: userError } = await supabaseAdmin
        .from('user_achievements')
        .select('*')
        .eq('user_id', userId);

      if (userError) {
        console.error('[AchievementService] Error fetching user achievements:', userError);
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
   */
  async grantAchievement(
    userId: string,
    achievementId: string,
    roomId?: string,
    gameId?: string
  ): Promise<UnlockedAchievement | null> {
    try {
      const { data, error } = await supabaseAdmin.rpc('grant_achievement', {
        p_user_id: userId,
        p_achievement_id: achievementId,
        p_room_id: roomId || null,
        p_game_id: gameId || null,
      });

      if (error) {
        console.error('[AchievementService] Error granting achievement:', error);
        return null;
      }

      // Type for the SQL function return value
      interface GrantAchievementResult {
        success: boolean;
        reason?: string;
        achievement_id?: string;
        name?: string;
        xp_reward?: number;
        points_reward?: number;
        rarity?: string;
      }

      const result = data as GrantAchievementResult;

      if (!result.success) {
        console.log(`[AchievementService] Achievement not granted: ${result.reason}`);
        return null;
      }

      console.log(`[AchievementService] Granted achievement "${result.name}" to user ${userId}`);

      return {
        id: result.achievement_id || achievementId,
        name: result.name || '',
        description: '', // Not returned by function, can be fetched if needed
        icon_url: null,
        xp_reward: result.xp_reward || 0,
        points: result.points_reward || 0,
        rarity: (result.rarity || 'common') as 'common' | 'rare' | 'epic' | 'legendary',
        earned_at: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[AchievementService] Unexpected error:', error);
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
