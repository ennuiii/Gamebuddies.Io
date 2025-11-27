-- =====================================================
-- GameBuddies - Match Result Tracking & Win Streaks
-- =====================================================
-- Run this in Supabase SQL Editor AFTER ADD_ACHIEVEMENT_POINTS.sql
-- Adds: Win streak columns, process_match_result() function

-- =====================================================
-- STEP 1: Add win streak columns to users table
-- =====================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS current_win_streak INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS best_win_streak INTEGER DEFAULT 0;

COMMENT ON COLUMN public.users.current_win_streak IS 'Current consecutive wins (global across all games)';
COMMENT ON COLUMN public.users.best_win_streak IS 'All-time highest win streak';

-- =====================================================
-- STEP 2: Create process_match_result function
-- =====================================================
-- Called by games when a match ends to report player results
-- Updates stats, win streaks, and triggers achievement checking

CREATE OR REPLACE FUNCTION process_match_result(
  p_user_id UUID,
  p_game_id VARCHAR,
  p_won BOOLEAN,
  p_score INTEGER DEFAULT NULL,
  p_room_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_new_streak INTEGER;
  v_best_streak INTEGER;
  v_games_played INTEGER;
  v_games_won INTEGER;
  v_achievement_result JSONB;
  v_stats JSONB;
BEGIN
  -- Ensure user exists
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  -- Update user stats atomically
  UPDATE public.users
  SET
    -- Increment games played
    total_games_played = COALESCE(total_games_played, 0) + 1,
    -- Increment games won if won
    total_games_won = CASE
      WHEN p_won THEN COALESCE(total_games_won, 0) + 1
      ELSE COALESCE(total_games_won, 0)
    END,
    -- Win streak: increment on win, reset to 0 on loss
    current_win_streak = CASE
      WHEN p_won THEN COALESCE(current_win_streak, 0) + 1
      ELSE 0
    END,
    -- Best streak: update if current streak (after increment) is higher
    best_win_streak = CASE
      WHEN p_won THEN GREATEST(COALESCE(best_win_streak, 0), COALESCE(current_win_streak, 0) + 1)
      ELSE COALESCE(best_win_streak, 0)
    END
  WHERE id = p_user_id
  RETURNING
    total_games_played,
    total_games_won,
    current_win_streak,
    best_win_streak
  INTO v_games_played, v_games_won, v_new_streak, v_best_streak;

  -- Build stats object
  v_stats := jsonb_build_object(
    'total_games_played', v_games_played,
    'total_games_won', v_games_won,
    'current_win_streak', v_new_streak,
    'best_win_streak', v_best_streak
  );

  -- Check achievements with platform-calculated streak
  BEGIN
    v_achievement_result := check_achievements(
      p_user_id,
      'game_completed',
      jsonb_build_object(
        'game_id', p_game_id,
        'room_id', p_room_id,
        'won', p_won,
        'score', p_score,
        'win_streak', v_new_streak
      )
    );
  EXCEPTION WHEN undefined_function THEN
    -- check_achievements doesn't exist yet, return empty
    v_achievement_result := jsonb_build_object('unlocked', '[]'::jsonb, 'count', 0);
  END;

  RETURN jsonb_build_object(
    'success', true,
    'stats', v_stats,
    'achievements', v_achievement_result
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION process_match_result IS 'Process match result for a player: updates stats, win streaks, and checks achievements';

-- =====================================================
-- STEP 3: Create helper function to get user stats
-- =====================================================

CREATE OR REPLACE FUNCTION get_user_stats(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'user_id', id,
    'username', username,
    'display_name', display_name,
    'total_games_played', COALESCE(total_games_played, 0),
    'total_games_won', COALESCE(total_games_won, 0),
    'win_rate', CASE
      WHEN COALESCE(total_games_played, 0) > 0
      THEN ROUND((COALESCE(total_games_won, 0)::DECIMAL / total_games_played) * 100, 1)
      ELSE 0
    END,
    'current_win_streak', COALESCE(current_win_streak, 0),
    'best_win_streak', COALESCE(best_win_streak, 0),
    'account_level', COALESCE(account_level, 1),
    'total_xp', COALESCE(total_xp, 0),
    'achievement_points', COALESCE(achievement_points, 0)
  ) INTO v_result
  FROM public.users
  WHERE id = p_user_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_user_stats IS 'Get comprehensive stats for a user';

-- =====================================================
-- VERIFICATION
-- =====================================================

DO $$
DECLARE
  has_current_streak BOOLEAN;
  has_best_streak BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'current_win_streak'
  ) INTO has_current_streak;

  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'best_win_streak'
  ) INTO has_best_streak;

  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Match Result Tracking Added Successfully!';
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'current_win_streak column: %', has_current_streak;
  RAISE NOTICE 'best_win_streak column: %', has_best_streak;
  RAISE NOTICE '';
  RAISE NOTICE 'New functions added:';
  RAISE NOTICE '  - process_match_result() - Updates stats, streaks, checks achievements';
  RAISE NOTICE '  - get_user_stats() - Returns comprehensive user stats';
  RAISE NOTICE '';
  RAISE NOTICE 'Usage from games:';
  RAISE NOTICE '  POST /api/game/match-result with player results';
  RAISE NOTICE '===========================================';
END $$;
