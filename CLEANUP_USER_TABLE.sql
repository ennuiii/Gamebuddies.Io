-- =====================================================
-- GameBuddies - Cleanup Users Table
-- =====================================================
-- Run this AFTER ADD_USER_METRICS.sql has been applied
-- Removes columns now tracked in user_metrics table
--
-- WARNING: This removes data! Make sure user_metrics is populated first.
-- =====================================================

-- =====================================================
-- STEP 1: Verify user_metrics table exists
-- =====================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_metrics'
  ) THEN
    RAISE EXCEPTION 'user_metrics table does not exist! Run ADD_USER_METRICS.sql first.';
  END IF;
END $$;

-- =====================================================
-- STEP 2: Remove game stats columns (now in user_metrics)
-- =====================================================

-- Remove total_games_played (now tracked as 'games_played' metric)
ALTER TABLE public.users DROP COLUMN IF EXISTS total_games_played;

-- Remove total_games_won (now tracked as 'games_won' metric)
ALTER TABLE public.users DROP COLUMN IF EXISTS total_games_won;

-- Remove current_win_streak (now tracked as 'current_win_streak' metric)
ALTER TABLE public.users DROP COLUMN IF EXISTS current_win_streak;

-- Remove best_win_streak (now tracked as 'best_win_streak' metric)
ALTER TABLE public.users DROP COLUMN IF EXISTS best_win_streak;

-- =====================================================
-- STEP 3: Drop related indexes if they exist
-- =====================================================

DROP INDEX IF EXISTS idx_users_total_games_played;
DROP INDEX IF EXISTS idx_users_total_games_won;
DROP INDEX IF EXISTS idx_users_current_win_streak;
DROP INDEX IF EXISTS idx_users_best_win_streak;

-- =====================================================
-- VERIFICATION
-- =====================================================

DO $$
DECLARE
  v_columns TEXT[];
BEGIN
  SELECT ARRAY_AGG(column_name::TEXT) INTO v_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND column_name IN ('total_games_played', 'total_games_won', 'current_win_streak', 'best_win_streak');

  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Users Table Cleanup Complete!';
  RAISE NOTICE '===========================================';

  IF v_columns IS NULL OR array_length(v_columns, 1) IS NULL THEN
    RAISE NOTICE 'All game stats columns removed successfully.';
  ELSE
    RAISE NOTICE 'WARNING: These columns still exist: %', v_columns;
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE 'Removed columns:';
  RAISE NOTICE '  - total_games_played -> use get_metric(user_id, ''games_played'')';
  RAISE NOTICE '  - total_games_won -> use get_metric(user_id, ''games_won'')';
  RAISE NOTICE '  - current_win_streak -> use get_metric(user_id, ''current_win_streak'')';
  RAISE NOTICE '  - best_win_streak -> use get_metric(user_id, ''best_win_streak'')';
  RAISE NOTICE '===========================================';
END $$;
