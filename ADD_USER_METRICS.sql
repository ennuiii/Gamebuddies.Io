-- =====================================================
-- GameBuddies - Flexible User Metrics System
-- =====================================================
-- Run this in Supabase SQL Editor AFTER ADD_MATCH_RESULT_TRACKING.sql
-- Creates a flexible key-value store for tracking ANY user stat

-- =====================================================
-- STEP 1: Create user_metrics table
-- =====================================================

CREATE TABLE IF NOT EXISTS public.user_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  metric_key VARCHAR(100) NOT NULL,
  value BIGINT DEFAULT 0,
  game_id VARCHAR(50) DEFAULT NULL,  -- NULL = global metric, otherwise game-specific
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique per user + metric + game combination
  UNIQUE(user_id, metric_key, game_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_metrics_user_id ON public.user_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_user_metrics_key ON public.user_metrics(metric_key);
CREATE INDEX IF NOT EXISTS idx_user_metrics_user_key ON public.user_metrics(user_id, metric_key);

COMMENT ON TABLE public.user_metrics IS 'Flexible key-value store for tracking any user statistic';
COMMENT ON COLUMN public.user_metrics.metric_key IS 'Metric name (e.g., correct_answers, time_played_seconds, rooms_hosted)';
COMMENT ON COLUMN public.user_metrics.value IS 'Numeric value of the metric';
COMMENT ON COLUMN public.user_metrics.game_id IS 'NULL for global metrics, game ID for game-specific metrics';

-- =====================================================
-- STEP 2: Function to increment a metric
-- =====================================================

CREATE OR REPLACE FUNCTION increment_metric(
  p_user_id UUID,
  p_metric_key VARCHAR,
  p_increment BIGINT DEFAULT 1,
  p_game_id VARCHAR DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
  v_new_value BIGINT;
BEGIN
  INSERT INTO public.user_metrics (user_id, metric_key, value, game_id, updated_at)
  VALUES (p_user_id, p_metric_key, p_increment, p_game_id, NOW())
  ON CONFLICT (user_id, metric_key, game_id)
  DO UPDATE SET
    value = user_metrics.value + p_increment,
    updated_at = NOW()
  RETURNING value INTO v_new_value;

  RETURN v_new_value;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION increment_metric IS 'Increment a metric by a value (creates if not exists)';

-- =====================================================
-- STEP 3: Function to set a metric (for max values, etc.)
-- =====================================================

CREATE OR REPLACE FUNCTION set_metric(
  p_user_id UUID,
  p_metric_key VARCHAR,
  p_value BIGINT,
  p_game_id VARCHAR DEFAULT NULL,
  p_only_if_higher BOOLEAN DEFAULT false
) RETURNS BIGINT AS $$
DECLARE
  v_new_value BIGINT;
BEGIN
  IF p_only_if_higher THEN
    -- Only update if new value is higher (good for high scores)
    INSERT INTO public.user_metrics (user_id, metric_key, value, game_id, updated_at)
    VALUES (p_user_id, p_metric_key, p_value, p_game_id, NOW())
    ON CONFLICT (user_id, metric_key, game_id)
    DO UPDATE SET
      value = GREATEST(user_metrics.value, p_value),
      updated_at = NOW()
    RETURNING value INTO v_new_value;
  ELSE
    -- Always set the value
    INSERT INTO public.user_metrics (user_id, metric_key, value, game_id, updated_at)
    VALUES (p_user_id, p_metric_key, p_value, p_game_id, NOW())
    ON CONFLICT (user_id, metric_key, game_id)
    DO UPDATE SET
      value = p_value,
      updated_at = NOW()
    RETURNING value INTO v_new_value;
  END IF;

  RETURN v_new_value;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION set_metric IS 'Set a metric to a specific value (optionally only if higher)';

-- =====================================================
-- STEP 4: Function to get a metric value
-- =====================================================

CREATE OR REPLACE FUNCTION get_metric(
  p_user_id UUID,
  p_metric_key VARCHAR,
  p_game_id VARCHAR DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
  v_value BIGINT;
BEGIN
  SELECT value INTO v_value
  FROM public.user_metrics
  WHERE user_id = p_user_id
    AND metric_key = p_metric_key
    AND ((p_game_id IS NULL AND game_id IS NULL) OR game_id = p_game_id);

  RETURN COALESCE(v_value, 0);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_metric IS 'Get a metric value for a user (returns 0 if not found)';

-- =====================================================
-- STEP 5: Function to get all metrics for a user
-- =====================================================

CREATE OR REPLACE FUNCTION get_user_metrics(
  p_user_id UUID,
  p_game_id VARCHAR DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF p_game_id IS NULL THEN
    -- Get all metrics (global + all games)
    SELECT COALESCE(jsonb_object_agg(
      CASE WHEN game_id IS NULL THEN metric_key ELSE game_id || ':' || metric_key END,
      value
    ), '{}'::jsonb) INTO v_result
    FROM public.user_metrics
    WHERE user_id = p_user_id;
  ELSE
    -- Get metrics for specific game only
    SELECT COALESCE(jsonb_object_agg(metric_key, value), '{}'::jsonb) INTO v_result
    FROM public.user_metrics
    WHERE user_id = p_user_id AND game_id = p_game_id;
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_user_metrics IS 'Get all metrics for a user as JSON object';

-- =====================================================
-- STEP 6: Function to process multiple metrics at once
-- =====================================================

CREATE OR REPLACE FUNCTION process_metrics(
  p_user_id UUID,
  p_metrics JSONB,
  p_game_id VARCHAR DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_key TEXT;
  v_value BIGINT;
  v_operation TEXT;
  v_metric_value JSONB;
  v_results JSONB := '{}'::jsonb;
  v_new_value BIGINT;
BEGIN
  -- Iterate through each metric in the JSONB object
  FOR v_key, v_metric_value IN SELECT * FROM jsonb_each(p_metrics)
  LOOP
    -- Check if it's a simple value or an object with operation
    IF jsonb_typeof(v_metric_value) = 'number' THEN
      -- Simple increment
      v_value := v_metric_value::BIGINT;
      v_new_value := increment_metric(p_user_id, v_key, v_value, p_game_id);
    ELSIF jsonb_typeof(v_metric_value) = 'object' THEN
      -- Object with operation
      v_operation := COALESCE(v_metric_value->>'op', 'increment');
      v_value := COALESCE((v_metric_value->>'value')::BIGINT, 1);

      CASE v_operation
        WHEN 'increment' THEN
          v_new_value := increment_metric(p_user_id, v_key, v_value, p_game_id);
        WHEN 'set' THEN
          v_new_value := set_metric(p_user_id, v_key, v_value, p_game_id, false);
        WHEN 'max' THEN
          v_new_value := set_metric(p_user_id, v_key, v_value, p_game_id, true);
        ELSE
          v_new_value := increment_metric(p_user_id, v_key, v_value, p_game_id);
      END CASE;
    ELSE
      CONTINUE;
    END IF;

    v_results := v_results || jsonb_build_object(v_key, v_new_value);
  END LOOP;

  RETURN v_results;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION process_metrics IS 'Process multiple metrics at once from a JSONB object';

-- =====================================================
-- STEP 7: Update process_match_result to handle metrics
-- =====================================================

CREATE OR REPLACE FUNCTION process_match_result(
  p_user_id UUID,
  p_game_id VARCHAR,
  p_won BOOLEAN,
  p_score INTEGER DEFAULT NULL,
  p_room_id UUID DEFAULT NULL,
  p_metrics JSONB DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_new_streak INTEGER;
  v_best_streak INTEGER;
  v_games_played INTEGER;
  v_games_won INTEGER;
  v_achievement_result JSONB;
  v_stats JSONB;
  v_metrics_result JSONB := '{}'::jsonb;
BEGIN
  -- Ensure user exists
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  -- Update user stats atomically
  UPDATE public.users
  SET
    total_games_played = COALESCE(total_games_played, 0) + 1,
    total_games_won = CASE
      WHEN p_won THEN COALESCE(total_games_won, 0) + 1
      ELSE COALESCE(total_games_won, 0)
    END,
    current_win_streak = CASE
      WHEN p_won THEN COALESCE(current_win_streak, 0) + 1
      ELSE 0
    END,
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

  -- Process custom metrics if provided
  IF p_metrics IS NOT NULL AND jsonb_typeof(p_metrics) = 'object' THEN
    v_metrics_result := process_metrics(p_user_id, p_metrics, p_game_id);
  END IF;

  -- Build stats object
  v_stats := jsonb_build_object(
    'total_games_played', v_games_played,
    'total_games_won', v_games_won,
    'current_win_streak', v_new_streak,
    'best_win_streak', v_best_streak
  );

  -- Check achievements with platform-calculated streak + custom metrics
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
      ) || COALESCE(v_metrics_result, '{}'::jsonb)
    );
  EXCEPTION WHEN undefined_function THEN
    v_achievement_result := jsonb_build_object('unlocked', '[]'::jsonb, 'count', 0);
  END;

  RETURN jsonb_build_object(
    'success', true,
    'stats', v_stats,
    'metrics', v_metrics_result,
    'achievements', v_achievement_result
  );
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- STEP 8: Seed common metric keys (documentation)
-- =====================================================

COMMENT ON TABLE public.user_metrics IS '
Flexible key-value store for tracking any user statistic.

Common metric keys:
- correct_answers: Total correct answers across all games
- wrong_answers: Total wrong answers
- perfect_games: Games won without wrong answers
- time_played_seconds: Total time played
- rooms_hosted: Number of rooms hosted
- rooms_joined: Number of rooms joined
- messages_sent: Chat messages sent
- high_score: Highest score achieved (use max operation)
- fastest_answer_ms: Fastest correct answer (use max with negative or min)

Game-specific metrics use game_id column:
- schooled:correct_answers, schooled:rounds_played, etc.
';

-- =====================================================
-- VERIFICATION
-- =====================================================

DO $$
DECLARE
  table_exists BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_metrics'
  ) INTO table_exists;

  RAISE NOTICE '===========================================';
  RAISE NOTICE 'User Metrics System Added Successfully!';
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'user_metrics table exists: %', table_exists;
  RAISE NOTICE '';
  RAISE NOTICE 'New functions added:';
  RAISE NOTICE '  - increment_metric() - Add to a counter';
  RAISE NOTICE '  - set_metric() - Set a value (optionally only if higher)';
  RAISE NOTICE '  - get_metric() - Get a single metric value';
  RAISE NOTICE '  - get_user_metrics() - Get all metrics as JSON';
  RAISE NOTICE '  - process_metrics() - Process multiple metrics at once';
  RAISE NOTICE '';
  RAISE NOTICE 'process_match_result() updated to accept p_metrics parameter';
  RAISE NOTICE '===========================================';
END $$;
