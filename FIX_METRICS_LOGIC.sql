-- =====================================================
-- GameBuddies - FIX METRICS LOGIC
-- =====================================================
-- This script fixes the upsert logic for user_metrics to reliably handle NULL game_ids.
-- It replaces the 'ON CONFLICT' clause with a robust UPDATE-then-INSERT pattern.

-- =====================================================
-- 1. Fix increment_metric
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
  -- 1. Try to UPDATE first
  UPDATE public.user_metrics
  SET 
    value = value + p_increment,
    updated_at = NOW()
  WHERE user_id = p_user_id 
    AND metric_key = p_metric_key 
    AND (game_id = p_game_id OR (game_id IS NULL AND p_game_id IS NULL))
  RETURNING value INTO v_new_value;

  -- 2. If updated, return immediately
  IF FOUND THEN
    RETURN v_new_value;
  END IF;

  -- 3. If not found, INSERT
  BEGIN
    INSERT INTO public.user_metrics (user_id, metric_key, value, game_id, updated_at)
    VALUES (p_user_id, p_metric_key, p_increment, p_game_id, NOW())
    RETURNING value INTO v_new_value;
    
    RETURN v_new_value;
  EXCEPTION WHEN unique_violation THEN
    -- 4. Handle race condition: someone inserted while we were checking
    UPDATE public.user_metrics
    SET 
      value = value + p_increment,
      updated_at = NOW()
    WHERE user_id = p_user_id 
      AND metric_key = p_metric_key 
      AND (game_id = p_game_id OR (game_id IS NULL AND p_game_id IS NULL))
    RETURNING value INTO v_new_value;
    
    RETURN v_new_value;
  END;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 2. Fix set_metric
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
  v_current_value BIGINT;
BEGIN
  -- 1. Try to UPDATE first
  IF p_only_if_higher THEN
    UPDATE public.user_metrics
    SET 
      value = GREATEST(value, p_value),
      updated_at = NOW()
    WHERE user_id = p_user_id 
      AND metric_key = p_metric_key 
      AND (game_id = p_game_id OR (game_id IS NULL AND p_game_id IS NULL))
    RETURNING value INTO v_new_value;
  ELSE
    UPDATE public.user_metrics
    SET 
      value = p_value,
      updated_at = NOW()
    WHERE user_id = p_user_id 
      AND metric_key = p_metric_key 
      AND (game_id = p_game_id OR (game_id IS NULL AND p_game_id IS NULL))
    RETURNING value INTO v_new_value;
  END IF;

  -- 2. If updated, return immediately
  IF FOUND THEN
    RETURN v_new_value;
  END IF;

  -- 3. If not found, INSERT
  BEGIN
    INSERT INTO public.user_metrics (user_id, metric_key, value, game_id, updated_at)
    VALUES (p_user_id, p_metric_key, p_value, p_game_id, NOW())
    RETURNING value INTO v_new_value;
    
    RETURN v_new_value;
  EXCEPTION WHEN unique_violation THEN
    -- 4. Handle race condition
    IF p_only_if_higher THEN
      UPDATE public.user_metrics
      SET value = GREATEST(value, p_value), updated_at = NOW()
      WHERE user_id = p_user_id AND metric_key = p_metric_key AND (game_id = p_game_id OR (game_id IS NULL AND p_game_id IS NULL))
      RETURNING value INTO v_new_value;
    ELSE
      UPDATE public.user_metrics
      SET value = p_value, updated_at = NOW()
      WHERE user_id = p_user_id AND metric_key = p_metric_key AND (game_id = p_game_id OR (game_id IS NULL AND p_game_id IS NULL))
      RETURNING value INTO v_new_value;
    END IF;
    
    RETURN v_new_value;
  END;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 3. Verification
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE 'Metrics functions updated to handle NULL game_id correctly.';
END $$;
