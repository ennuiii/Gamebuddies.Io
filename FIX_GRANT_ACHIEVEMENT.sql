-- =====================================================
-- GameBuddies - Fix grant_achievement Function
-- =====================================================
-- This script fixes the 'column "total_xp" does not exist' error in grant_achievement.
-- It updates the function to use the correct 'xp' column name.

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
  v_already_earned BOOLEAN;
  v_result JSONB;
BEGIN
  -- Check if already earned
  SELECT EXISTS(
    SELECT 1 FROM public.user_achievements
    WHERE user_id = p_user_id AND achievement_id = p_achievement_id
  ) INTO v_already_earned;

  IF v_already_earned THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_earned');
  END IF;

  -- Get achievement details
  SELECT xp_reward, COALESCE(points, 10), name, rarity
  INTO v_xp_reward, v_points_reward, v_achievement_name, v_achievement_rarity
  FROM public.achievements
  WHERE id = p_achievement_id;

  IF v_achievement_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'achievement_not_found');
  END IF;

  -- Insert achievement record
  INSERT INTO public.user_achievements (
    user_id,
    achievement_id,
    earned_in_room_id,
    earned_in_game,
    progress
  ) VALUES (
    p_user_id,
    p_achievement_id,
    p_room_id,
    p_game_id,
    100  -- Completed
  );

  -- Update user XP and achievement points - FIXED COLUMN NAME
  UPDATE public.users
  SET
    xp = COALESCE(xp, 0) + v_xp_reward, -- Changed from total_xp to xp
    achievement_points = COALESCE(achievement_points, 0) + v_points_reward
  WHERE id = p_user_id;

  -- Also call add_xp if it exists (for level progression)
  BEGIN
    PERFORM add_xp(p_user_id, v_xp_reward, p_game_id, 'achievement');
  EXCEPTION WHEN undefined_function THEN
    -- add_xp doesn't exist, already updated xp above
    NULL;
  END;

  -- Create notification if table exists
  BEGIN
    INSERT INTO public.notifications (
      user_id,
      type,
      title,
      message,
      related_achievement_id,
      priority,
      metadata
    ) VALUES (
      p_user_id,
      'achievement',
      'Achievement Unlocked!',
      v_achievement_name,
      p_achievement_id,
      CASE
        WHEN v_achievement_rarity = 'legendary' THEN 'urgent'
        WHEN v_achievement_rarity = 'epic' THEN 'high'
        ELSE 'normal'
      END,
      jsonb_build_object(
        'xp_reward', v_xp_reward,
        'points_reward', v_points_reward,
        'rarity', v_achievement_rarity
      )
    );
  EXCEPTION WHEN undefined_table THEN
    -- notifications table doesn't exist, skip
    NULL;
  END;

  -- Build result
  v_result := jsonb_build_object(
    'success', true,
    'achievement_id', p_achievement_id,
    'name', v_achievement_name,
    'xp_reward', v_xp_reward,
    'points_reward', v_points_reward,
    'rarity', v_achievement_rarity
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  RAISE NOTICE 'Fixed grant_achievement function to use correct xp column.';
END $$;
