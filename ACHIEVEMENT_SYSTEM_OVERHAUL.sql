-- =====================================================
-- ACHIEVEMENT SYSTEM OVERHAUL
-- =====================================================
-- This migration:
-- 1. Fixes grant_achievement XP bug (total_xp -> xp)
-- 2. Removes redundant progress storage in user_achievements
-- 3. Calculates progress from user_metrics on-the-fly
-- 4. Adds achievement checking for non-game events
-- =====================================================

-- =====================================================
-- STEP 1: Fix grant_achievement function (XP bug)
-- =====================================================
CREATE OR REPLACE FUNCTION grant_achievement(
  p_user_id UUID,
  p_achievement_id VARCHAR,
  p_room_id UUID DEFAULT NULL,
  p_game_id VARCHAR DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_xp_reward INTEGER;
  v_points_reward INTEGER;
  v_achievement_name TEXT;
  v_achievement_rarity TEXT;
  v_achievement_description TEXT;
  v_achievement_icon TEXT;
  v_already_earned BOOLEAN;
  v_result JSONB;
BEGIN
  -- Check if already earned
  SELECT EXISTS(
    SELECT 1 FROM public.user_achievements
    WHERE user_id = p_user_id AND achievement_id = p_achievement_id AND earned_at IS NOT NULL
  ) INTO v_already_earned;

  IF v_already_earned THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_earned');
  END IF;

  -- Get achievement details
  SELECT xp_reward, COALESCE(points, 10), name, rarity, description, icon_url
  INTO v_xp_reward, v_points_reward, v_achievement_name, v_achievement_rarity, v_achievement_description, v_achievement_icon
  FROM public.achievements
  WHERE id = p_achievement_id;

  IF v_achievement_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'achievement_not_found');
  END IF;

  -- Insert/update achievement record (earned)
  INSERT INTO public.user_achievements (
    user_id,
    achievement_id,
    earned_at,
    earned_in_room_id,
    earned_in_game
  ) VALUES (
    p_user_id,
    p_achievement_id,
    NOW(),
    p_room_id,
    p_game_id
  )
  ON CONFLICT (user_id, achievement_id) DO UPDATE
  SET earned_at = NOW(),
      earned_in_room_id = p_room_id,
      earned_in_game = p_game_id;

  -- Update user XP and achievement points - FIXED COLUMN NAME
  UPDATE public.users
  SET
    xp = COALESCE(xp, 0) + v_xp_reward,
    achievement_points = COALESCE(achievement_points, 0) + v_points_reward
  WHERE id = p_user_id;

  -- Also call add_xp if it exists (for level progression)
  BEGIN
    PERFORM add_xp(p_user_id, v_xp_reward, p_game_id, 'achievement');
  EXCEPTION WHEN undefined_function THEN
    NULL;
  END;

  -- Create notification
  BEGIN
    INSERT INTO public.notifications (
      user_id, type, title, message, related_achievement_id, priority, metadata
    ) VALUES (
      p_user_id, 'achievement', 'Achievement Unlocked!', v_achievement_name,
      p_achievement_id,
      CASE
        WHEN v_achievement_rarity = 'legendary' THEN 'urgent'
        WHEN v_achievement_rarity = 'epic' THEN 'high'
        ELSE 'normal'
      END,
      jsonb_build_object(
        'xp_reward', v_xp_reward,
        'points_reward', v_points_reward,
        'rarity', v_achievement_rarity,
        'description', v_achievement_description,
        'icon_url', v_achievement_icon
      )
    );
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  -- Build result with full achievement info for socket emission
  v_result := jsonb_build_object(
    'success', true,
    'achievement_id', p_achievement_id,
    'name', v_achievement_name,
    'description', v_achievement_description,
    'icon_url', v_achievement_icon,
    'xp_reward', v_xp_reward,
    'points_reward', v_points_reward,
    'rarity', v_achievement_rarity
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- STEP 2: Create function to calculate achievement progress from metrics
-- =====================================================
CREATE OR REPLACE FUNCTION get_achievement_progress(
  p_user_id UUID,
  p_achievement_id VARCHAR
)
RETURNS INTEGER AS $$
DECLARE
  v_achievement RECORD;
  v_current_value BIGINT;
  v_friend_count INTEGER;
  v_user_level INTEGER;
  v_user_xp INTEGER;
  v_premium_tier VARCHAR;
  v_progress INTEGER;
BEGIN
  -- Get achievement definition
  SELECT * INTO v_achievement FROM public.achievements WHERE id = p_achievement_id;

  IF v_achievement IS NULL THEN
    RETURN 0;
  END IF;

  -- Check if already earned
  IF EXISTS (
    SELECT 1 FROM public.user_achievements
    WHERE user_id = p_user_id AND achievement_id = p_achievement_id AND earned_at IS NOT NULL
  ) THEN
    RETURN 100;
  END IF;

  -- Get current value based on category
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
        SELECT COUNT(*) INTO v_friend_count
        FROM public.friendships f
        WHERE (f.user_id = p_user_id OR f.friend_id = p_user_id) AND f.status = 'accepted';
        v_current_value := v_friend_count;
      END IF;

    WHEN 'progression' THEN
      SELECT level, xp INTO v_user_level, v_user_xp FROM public.users WHERE id = p_user_id;
      IF v_achievement.id LIKE 'level%' THEN
        v_current_value := v_user_level;
      ELSE
        v_current_value := v_user_xp;
      END IF;

    WHEN 'premium' THEN
      SELECT premium_tier INTO v_premium_tier FROM public.users WHERE id = p_user_id;
      v_current_value := CASE WHEN v_premium_tier != 'free' AND v_premium_tier IS NOT NULL THEN 1 ELSE 0 END;

    ELSE
      IF v_achievement.requirement_type = 'metric' THEN
        v_current_value := get_metric(p_user_id, COALESCE(v_achievement.id, 'unknown'), NULL);
      ELSE
        v_current_value := 0;
      END IF;
  END CASE;

  -- Calculate progress percentage
  IF v_current_value IS NULL OR v_achievement.requirement_value = 0 THEN
    RETURN 0;
  END IF;

  v_progress := LEAST(99, (v_current_value::FLOAT / v_achievement.requirement_value * 100)::INTEGER);

  RETURN COALESCE(v_progress, 0);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- STEP 3: Create function to get all achievements with progress
-- =====================================================
CREATE OR REPLACE FUNCTION get_user_achievements_with_progress(
  p_user_id UUID
)
RETURNS TABLE (
  id VARCHAR,
  name VARCHAR,
  description TEXT,
  icon_url TEXT,
  category VARCHAR,
  requirement_type VARCHAR,
  requirement_value INTEGER,
  xp_reward INTEGER,
  points INTEGER,
  rarity VARCHAR,
  display_order INTEGER,
  is_hidden BOOLEAN,
  user_progress INTEGER,
  is_unlocked BOOLEAN,
  earned_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.name,
    a.description,
    a.icon_url,
    a.category,
    a.requirement_type,
    a.requirement_value,
    a.xp_reward,
    a.points,
    a.rarity,
    a.display_order,
    a.is_hidden,
    CASE
      WHEN ua.earned_at IS NOT NULL THEN 100
      ELSE get_achievement_progress(p_user_id, a.id)
    END AS user_progress,
    (ua.earned_at IS NOT NULL) AS is_unlocked,
    ua.earned_at
  FROM public.achievements a
  LEFT JOIN public.user_achievements ua
    ON ua.achievement_id = a.id AND ua.user_id = p_user_id
  ORDER BY a.display_order;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- STEP 4: Update check_achievements to NOT store progress
-- (Progress is now calculated on-the-fly)
-- =====================================================
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
  -- Get friend count
  SELECT COUNT(*) INTO v_friend_count
  FROM public.friendships f
  WHERE (f.user_id = p_user_id OR f.friend_id = p_user_id) AND f.status = 'accepted';

  -- Get user core stats
  SELECT premium_tier, xp, level INTO v_premium_tier, v_user_xp, v_user_level
  FROM public.users WHERE id = p_user_id;

  -- Loop through unearned achievements
  FOR v_achievement IN
    SELECT a.*
    FROM public.achievements a
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_achievements ua
      WHERE ua.user_id = p_user_id AND ua.achievement_id = a.id AND ua.earned_at IS NOT NULL
    )
    -- Filter by event type for efficiency
    AND (
      (p_event_type = 'game_completed' AND a.category IN ('games_played', 'wins'))
      OR (p_event_type = 'friend_added' AND a.category = 'social' AND a.id NOT LIKE 'host%')
      OR (p_event_type = 'room_hosted' AND a.category = 'social' AND a.id LIKE 'host%')
      OR (p_event_type = 'level_up' AND a.category = 'progression')
      OR (p_event_type = 'premium_subscribed' AND a.category = 'premium')
      OR (p_event_type = 'manual_check') -- Check all on manual
    )
  LOOP
    v_current_value := NULL;

    -- Get current value based on category
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
        v_current_value := CASE WHEN v_premium_tier != 'free' AND v_premium_tier IS NOT NULL THEN 1 ELSE 0 END;
      ELSE
        IF v_achievement.requirement_type = 'metric' THEN
           v_current_value := get_metric(p_user_id, COALESCE(v_achievement.id, 'unknown'), NULL);
        END IF;
    END CASE;

    -- Check if should unlock (NO progress storage anymore)
    IF v_current_value IS NOT NULL AND v_current_value >= v_achievement.requirement_value THEN
      v_result := grant_achievement(p_user_id, v_achievement.id, (p_event_data->>'room_id')::UUID, p_event_data->>'game_id');
      IF (v_result->>'success')::boolean THEN
        v_unlocked := v_unlocked || jsonb_build_object(
          'id', v_achievement.id,
          'name', v_achievement.name,
          'description', v_achievement.description,
          'icon_url', v_achievement.icon_url,
          'xp_reward', v_achievement.xp_reward,
          'points', v_achievement.points,
          'rarity', v_achievement.rarity
        );
      END IF;
    END IF;
    -- NO ELSE BLOCK - we don't store progress anymore!
  END LOOP;

  RETURN jsonb_build_object('unlocked', v_unlocked, 'count', jsonb_array_length(v_unlocked));
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- STEP 5: Drop progress column from user_achievements (optional)
-- Uncomment if you want to remove the column entirely
-- =====================================================
-- ALTER TABLE public.user_achievements DROP COLUMN IF EXISTS progress;

-- =====================================================
-- STEP 6: Create helper function to trigger achievement check
-- Can be called from anywhere: triggers, API, etc.
-- =====================================================
CREATE OR REPLACE FUNCTION trigger_achievement_check(
  p_user_id UUID,
  p_event_type VARCHAR
)
RETURNS JSONB AS $$
BEGIN
  RETURN check_achievements(p_user_id, p_event_type, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- VERIFICATION
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE 'Achievement System Overhaul Complete!';
  RAISE NOTICE '- grant_achievement: Fixed XP column bug';
  RAISE NOTICE '- check_achievements: Removed redundant progress storage';
  RAISE NOTICE '- get_achievement_progress: New function to calculate progress on-the-fly';
  RAISE NOTICE '- get_user_achievements_with_progress: New function for efficient queries';
  RAISE NOTICE '- Event filtering added: game_completed, friend_added, room_hosted, level_up, premium_subscribed';
END $$;
