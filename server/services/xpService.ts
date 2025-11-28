import { supabaseAdmin } from '../lib/supabase';

/**
 * Level curve configuration
 * Defines XP thresholds for each level
 */
interface LevelThreshold {
  level: number;
  xp: number;
}

/**
 * Result of adding XP to a user
 */
export interface AddXpResult {
  newXp: number;
  newLevel: number;
  previousLevel: number;
  previousXp: number;
  leveledUp: boolean;
  levelsGained: number;
}

/**
 * XP Service - Single source of truth for XP and level management
 *
 * Handles:
 * - Adding XP to users
 * - Calculating levels from XP
 * - Atomic XP + level updates
 * - Level recalculation for fixing broken data
 */
class XpService {
  /**
   * Level thresholds - matches client-side Header.tsx LEVEL_CURVE
   * Can be loaded from DB in the future for easy tweaking
   */
  private readonly LEVEL_CURVE: LevelThreshold[] = [
    { level: 1, xp: 0 },
    { level: 2, xp: 500 },
    { level: 3, xp: 1500 },
    { level: 4, xp: 3500 },
    { level: 5, xp: 7500 },
    { level: 6, xp: 15000 },
    { level: 7, xp: 25000 },
    { level: 8, xp: 40000 },
    { level: 9, xp: 65000 },
    { level: 10, xp: 100000 },
  ];

  /**
   * Add XP to a user and update their level atomically
   *
   * @param userId - User ID to add XP to
   * @param amount - Amount of XP to add (can be negative for penalties)
   * @param source - Source of XP (e.g., 'achievement', 'game_completion', 'bonus')
   * @returns Result with new XP, level, and whether user leveled up
   */
  async addXp(userId: string, amount: number, source: string): Promise<AddXpResult> {
    console.log(`⭐ [XP] Adding ${amount} XP to user ${userId} (source: ${source})`);

    // 1. Get current user stats
    const { data: user, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('xp, level')
      .eq('id', userId)
      .single();

    if (fetchError) {
      console.error(`❌ [XP] Error fetching user ${userId}:`, fetchError);
      throw new Error(`Failed to fetch user: ${fetchError.message}`);
    }

    const previousXp = user?.xp || 0;
    const previousLevel = user?.level || 1;
    const newXp = Math.max(0, previousXp + amount); // Prevent negative XP

    // 2. Calculate new level from total XP
    const newLevel = this.calculateLevel(newXp);
    const leveledUp = newLevel > previousLevel;
    const levelsGained = newLevel - previousLevel;

    // 3. Update user atomically (XP and level together)
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        xp: newXp,
        level: newLevel,
      })
      .eq('id', userId);

    if (updateError) {
      console.error(`❌ [XP] Error updating user ${userId}:`, updateError);
      throw new Error(`Failed to update user XP: ${updateError.message}`);
    }

    // Log the result
    if (leveledUp) {
      console.log(`🎉 [XP] User ${userId} LEVELED UP! Level ${previousLevel} → ${newLevel} (+${levelsGained} levels)`);
    }
    console.log(`✅ [XP] User ${userId}: +${amount} XP (${source}), ${previousXp} → ${newXp} XP, Level ${previousLevel} → ${newLevel}`);

    return {
      newXp,
      newLevel,
      previousLevel,
      previousXp,
      leveledUp,
      levelsGained,
    };
  }

  /**
   * Calculate level from total XP
   * Returns the highest level the user qualifies for
   */
  calculateLevel(totalXp: number): number {
    let level = 1;

    for (const threshold of this.LEVEL_CURVE) {
      if (totalXp >= threshold.xp) {
        level = threshold.level;
      } else {
        break;
      }
    }

    return level;
  }

  /**
   * Get XP required for a specific level
   */
  getXpForLevel(level: number): number {
    const threshold = this.LEVEL_CURVE.find(t => t.level === level);
    return threshold?.xp ?? 0;
  }

  /**
   * Get XP progress toward next level
   */
  getLevelProgress(totalXp: number): {
    currentLevel: number;
    currentLevelXp: number;
    nextLevelXp: number;
    xpIntoLevel: number;
    xpNeeded: number;
    percentComplete: number;
  } {
    const currentLevel = this.calculateLevel(totalXp);
    const currentLevelXp = this.getXpForLevel(currentLevel);
    const nextLevelXp = this.getXpForLevel(currentLevel + 1);

    // If at max level
    if (nextLevelXp === 0 || currentLevel >= this.LEVEL_CURVE.length) {
      return {
        currentLevel,
        currentLevelXp,
        nextLevelXp: currentLevelXp,
        xpIntoLevel: 0,
        xpNeeded: 0,
        percentComplete: 100,
      };
    }

    const xpIntoLevel = totalXp - currentLevelXp;
    const xpNeeded = nextLevelXp - currentLevelXp;
    const percentComplete = Math.min(100, Math.floor((xpIntoLevel / xpNeeded) * 100));

    return {
      currentLevel,
      currentLevelXp,
      nextLevelXp,
      xpIntoLevel,
      xpNeeded,
      percentComplete,
    };
  }

  /**
   * Recalculate a user's level from their XP
   * Used to fix users with incorrect levels
   */
  async recalculateUserLevel(userId: string): Promise<{
    previousLevel: number;
    newLevel: number;
    xp: number;
    wasFixed: boolean;
  }> {
    console.log(`🔧 [XP] Recalculating level for user ${userId}`);

    const { data: user, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('xp, level')
      .eq('id', userId)
      .single();

    if (fetchError || !user) {
      console.error(`❌ [XP] Error fetching user ${userId}:`, fetchError);
      throw new Error(`User not found: ${userId}`);
    }

    const currentXp = user.xp || 0;
    const previousLevel = user.level || 1;
    const correctLevel = this.calculateLevel(currentXp);

    if (correctLevel !== previousLevel) {
      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({ level: correctLevel })
        .eq('id', userId);

      if (updateError) {
        console.error(`❌ [XP] Error updating user ${userId} level:`, updateError);
        throw new Error(`Failed to update level: ${updateError.message}`);
      }

      console.log(`✅ [XP] Fixed user ${userId} level: ${previousLevel} → ${correctLevel} (XP: ${currentXp})`);

      return {
        previousLevel,
        newLevel: correctLevel,
        xp: currentXp,
        wasFixed: true,
      };
    }

    console.log(`ℹ️ [XP] User ${userId} level is correct: ${previousLevel} (XP: ${currentXp})`);

    return {
      previousLevel,
      newLevel: previousLevel,
      xp: currentXp,
      wasFixed: false,
    };
  }

  /**
   * Get the level curve configuration
   * Useful for client-side display
   */
  getLevelCurve(): LevelThreshold[] {
    return [...this.LEVEL_CURVE];
  }

  /**
   * Get max level
   */
  getMaxLevel(): number {
    return this.LEVEL_CURVE[this.LEVEL_CURVE.length - 1].level;
  }
}

// Export singleton instance
export const xpService = new XpService();
