/**
 * Level Curve Configuration
 * BUG FIX #14: Shared constant to ensure client and server use the same values
 *
 * This file is the single source of truth for level progression.
 * Both client (Header.tsx) and server (XP calculations) should import from here.
 */

export interface LevelCurveEntry {
  level: number;
  xp: number;
}

/**
 * XP thresholds for each level
 * - Level 1 starts at 0 XP
 * - Each subsequent level requires more XP
 * - This curve should match the database level calculation in add_xp function
 */
export const LEVEL_CURVE: LevelCurveEntry[] = [
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
 * Maximum level in the current curve
 */
export const MAX_LEVEL = LEVEL_CURVE[LEVEL_CURVE.length - 1].level;

/**
 * Get XP required to reach a specific level
 */
export function getXpForLevel(level: number): number {
  const entry = LEVEL_CURVE.find(l => l.level === level);
  return entry?.xp ?? 0;
}

/**
 * Get XP required for the next level
 */
export function getNextLevelXp(currentLevel: number): number | null {
  const nextEntry = LEVEL_CURVE.find(l => l.level === currentLevel + 1);
  return nextEntry?.xp ?? null;
}

/**
 * Calculate level from total XP
 */
export function calculateLevelFromXp(totalXp: number): number {
  let level = 1;
  for (const entry of LEVEL_CURVE) {
    if (totalXp >= entry.xp) {
      level = entry.level;
    } else {
      break;
    }
  }
  return level;
}

/**
 * Calculate progress percentage within current level
 */
export function calculateLevelProgress(totalXp: number, currentLevel: number): {
  percent: number;
  currentLevelXp: number;
  nextLevelXp: number | null;
} {
  const currentLevelStart = getXpForLevel(currentLevel);
  const nextLevelStart = getNextLevelXp(currentLevel);

  // If max level, return 100%
  if (nextLevelStart === null) {
    return {
      percent: 100,
      currentLevelXp: totalXp,
      nextLevelXp: null,
    };
  }

  const xpInThisLevel = totalXp - currentLevelStart;
  const xpNeededForLevel = nextLevelStart - currentLevelStart;
  const percent = Math.min(100, Math.floor((xpInThisLevel / xpNeededForLevel) * 100));

  return {
    percent,
    currentLevelXp: totalXp,
    nextLevelXp: nextLevelStart,
  };
}
