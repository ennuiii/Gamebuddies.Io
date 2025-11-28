-- Migration: Fix User Levels Based on XP
-- Purpose: Recalculate all user levels from their XP (fixes level not updating bug)
-- Run this in Supabase SQL Editor
-- IMPORTANT: Run this AFTER deploying the new server-side XP logic

-- Level curve (must match server/client):
-- Level 1: 0 XP
-- Level 2: 500 XP
-- Level 3: 1500 XP
-- Level 4: 3500 XP
-- Level 5: 7500 XP
-- Level 6: 15000 XP
-- Level 7: 25000 XP
-- Level 8: 40000 XP
-- Level 9: 65000 XP
-- Level 10: 100000 XP

-- 1. Check current state (before fix)
SELECT
  id,
  username,
  xp,
  level,
  CASE
    WHEN xp >= 100000 THEN 10
    WHEN xp >= 65000 THEN 9
    WHEN xp >= 40000 THEN 8
    WHEN xp >= 25000 THEN 7
    WHEN xp >= 15000 THEN 6
    WHEN xp >= 7500 THEN 5
    WHEN xp >= 3500 THEN 4
    WHEN xp >= 1500 THEN 3
    WHEN xp >= 500 THEN 2
    ELSE 1
  END as correct_level,
  CASE
    WHEN level != (
      CASE
        WHEN xp >= 100000 THEN 10
        WHEN xp >= 65000 THEN 9
        WHEN xp >= 40000 THEN 8
        WHEN xp >= 25000 THEN 7
        WHEN xp >= 15000 THEN 6
        WHEN xp >= 7500 THEN 5
        WHEN xp >= 3500 THEN 4
        WHEN xp >= 1500 THEN 3
        WHEN xp >= 500 THEN 2
        ELSE 1
      END
    ) THEN 'INCORRECT'
    ELSE 'OK'
  END as status
FROM users
WHERE xp IS NOT NULL AND xp > 0
ORDER BY xp DESC;

-- 2. Fix all users with incorrect levels
UPDATE users
SET level = CASE
  WHEN xp >= 100000 THEN 10
  WHEN xp >= 65000 THEN 9
  WHEN xp >= 40000 THEN 8
  WHEN xp >= 25000 THEN 7
  WHEN xp >= 15000 THEN 6
  WHEN xp >= 7500 THEN 5
  WHEN xp >= 3500 THEN 4
  WHEN xp >= 1500 THEN 3
  WHEN xp >= 500 THEN 2
  ELSE 1
END
WHERE xp IS NOT NULL;

-- 3. Ensure users with NULL xp have level 1
UPDATE users
SET level = 1, xp = 0
WHERE xp IS NULL OR level IS NULL;

-- 4. Verification query (run after fix to confirm)
SELECT
  COUNT(*) as total_users,
  COUNT(CASE WHEN level = 1 THEN 1 END) as level_1,
  COUNT(CASE WHEN level = 2 THEN 1 END) as level_2,
  COUNT(CASE WHEN level = 3 THEN 1 END) as level_3,
  COUNT(CASE WHEN level = 4 THEN 1 END) as level_4,
  COUNT(CASE WHEN level = 5 THEN 1 END) as level_5,
  COUNT(CASE WHEN level >= 6 THEN 1 END) as level_6_plus
FROM users
WHERE is_guest = false;

-- 5. Disable/drop old SQL functions that handled XP (now server handles this)
-- Uncomment if you want to remove them:
-- DROP FUNCTION IF EXISTS add_xp(uuid, integer, varchar, varchar);

-- Note: Keep grant_achievement() and check_achievements() but they should no longer
-- update XP - the server handles that now via xpService
