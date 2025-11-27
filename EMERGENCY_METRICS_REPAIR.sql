-- =====================================================
-- GameBuddies - Emergency Metrics Repair
-- =====================================================
-- This script fixes the two critical errors preventing metrics from updating:
-- 1. Removes duplicate rows in `user_metrics` that cause "query returned more than one row".
-- 2. Updates `increment_metric` to be robust against duplicates.
-- 3. Updates `check_achievements` to stop looking for the deleted `total_xp` column.

-- =====================================================
-- STEP 1: Remove Duplicate Metrics
-- =====================================================
-- Deletes duplicates, keeping only the most recently updated record for each (user, key, game) combo.

DELETE FROM public.user_metrics a
USING public.user_metrics b
WHERE a.id < b.id
  AND a.user_id = b.user_id
  AND a.metric_key = b.metric_key
  AND (a.game_id = b.game_id OR (a.game_id IS NULL AND b.game_id IS NULL));

-- =====================================================
-- STEP 2: Fix increment_metric Function
-- =====================================================
-- Replaces the function with a version that handles race conditions and duplicates safely.

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
-- STEP 3: Fix check_achievements Function
-- =====================================================
-- Updates the function to use the correct `xp` column instead of the deleted `total_xp`.

CREATE OR REPLACE FUNCTION check_achievements(
  p_user_id UUID,
  p_event_type VARCHAR,
  p_event_data JSONB DEFAULT '{}'
)
RETURNS JSONB AS $$
DECLARE
  v_unlocked JSONB := '[]'::jsonb;
  v_achievement RECORD;
  v_result JSONB;
  v_current_value BIGINT;
  v_friend_count INTEGER;
  v_premium_tier VARCHAR;
  v_user_xp INTEGER;
  v_user_level INTEGER;
BEGIN
  -- Get friend count (friendships table)
  SELECT COUNT(*) INTO v_friend_count
  FROM public.friendships f
  WHERE (f.user_id = p_user_id OR f.friend_id = p_user_id) AND f.status = 'accepted';

  -- Get user core stats (users table) - FIXED: using `xp` instead of `total_xp`
  SELECT premium_tier, xp, level INTO v_premium_tier, v_user_xp, v_user_level
  FROM public.users WHERE id = p_user_id;

  FOR v_achievement IN
    SELECT a.*
    FROM public.achievements a
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_achievements ua
      WHERE ua.user_id = p_user_id AND ua.achievement_id = a.id AND ua.earned_at IS NOT NULL
    )
  LOOP
    v_current_value := NULL;

    CASE v_achievement.category
      WHEN 'games_played' THEN
        v_current_value := get_metric(p_user_id, 'games_played', NULL);
      WHEN 'wins' THEN
        IF v_achievement.requirement_type = 'streak' THEN
          v_current_value := get_metric(p_user_id, 'current_win_streak', NULL);
        ELSE
          v_current_value := get_metric(p_user_id, 'games_won', NULL);
        END IF;
      WHEN 'social' THEN
        IF v_achievement.id LIKE 'host%' THEN
          v_current_value := get_metric(p_user_id, 'rooms_hosted', NULL);
        ELSE
          v_current_value := v_friend_count;
        END IF;
      WHEN 'progression' THEN
        IF v_achievement.id LIKE 'level%' THEN
          v_current_value := v_user_level;
        ELSE
          v_current_value := v_user_xp;
        END IF;
      WHEN 'premium' THEN
        v_current_value := CASE WHEN v_premium_tier != 'free' THEN 1 ELSE 0 END;
      ELSE
        IF v_achievement.requirement_type = 'metric' THEN
           v_current_value := get_metric(p_user_id, COALESCE(v_achievement.id, 'unknown'), NULL);
        END IF;
    END CASE;

    -- Grant logic
    IF v_current_value IS NOT NULL AND v_current_value >= v_achievement.requirement_value THEN
      v_result := grant_achievement(p_user_id, v_achievement.id, (p_event_data->>'room_id')::UUID, p_event_data->>'game_id');
      IF (v_result->>'success')::boolean THEN
        v_unlocked := v_unlocked || jsonb_build_object('id', v_achievement.id, 'name', v_achievement.name, 'rarity', v_achievement.rarity);
      END IF;
    ELSE
      -- Update progress
      IF v_current_value IS NOT NULL AND v_current_value > 0 THEN
        INSERT INTO public.user_achievements (user_id, achievement_id, progress, earned_at)
        VALUES (p_user_id, v_achievement.id, LEAST(99, (v_current_value::FLOAT / v_achievement.requirement_value * 100)::INTEGER), NULL)
        ON CONFLICT (user_id, achievement_id) DO UPDATE
        SET progress = LEAST(99, (v_current_value::FLOAT / v_achievement.requirement_value * 100)::INTEGER);
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('unlocked', v_unlocked, 'count', jsonb_array_length(v_unlocked));
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  RAISE NOTICE 'Emergency repairs completed successfully.';
END $$;
