-- =====================================================
-- GameBuddies - Complete Achievement System Setup
-- =====================================================
-- Run this in Supabase SQL Editor
-- Creates achievements tables and adds points system

-- =====================================================
-- STEP 0: Create base achievements table if not exists
-- =====================================================

CREATE TABLE IF NOT EXISTS public.achievements (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  icon_url TEXT,
  category VARCHAR(50) NOT NULL DEFAULT 'special',
  requirement_type VARCHAR(50) NOT NULL DEFAULT 'count',
  requirement_value INTEGER NOT NULL DEFAULT 1,
  xp_reward INTEGER NOT NULL DEFAULT 100,
  rarity VARCHAR(20) NOT NULL DEFAULT 'common' CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  display_order INTEGER DEFAULT 0,
  is_hidden BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.achievements IS 'Achievement definitions for the platform';

-- Create user_achievements table if not exists
CREATE TABLE IF NOT EXISTS public.user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  achievement_id VARCHAR(50) NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  earned_in_room_id UUID,
  earned_in_game VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON public.user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_achievement_id ON public.user_achievements(achievement_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_earned_at ON public.user_achievements(earned_at DESC);

COMMENT ON TABLE public.user_achievements IS 'Tracks which achievements users have earned';

-- Add related_achievement_id to notifications if it doesn't exist
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS related_achievement_id VARCHAR(50);

-- =====================================================
-- STEP 0.5: Insert starter achievements (before adding points column)
-- =====================================================

INSERT INTO public.achievements (id, name, description, category, requirement_type, requirement_value, xp_reward, rarity, display_order, is_hidden) VALUES
('first_game', 'First Steps', 'Play your first game', 'games_played', 'count', 1, 50, 'common', 1, false),
('games_10', 'Getting Started', 'Play 10 games', 'games_played', 'count', 10, 100, 'common', 2, false),
('games_50', 'Regular Player', 'Play 50 games', 'games_played', 'count', 50, 250, 'rare', 3, false),
('games_100', 'Veteran', 'Play 100 games', 'games_played', 'count', 100, 500, 'epic', 4, false),
('first_win', 'Winner!', 'Win your first game', 'wins', 'count', 1, 75, 'common', 5, false),
('wins_5', 'On a Roll', 'Win 5 games', 'wins', 'count', 5, 150, 'common', 6, false),
('wins_10', 'Skilled', 'Win 10 games', 'wins', 'count', 10, 200, 'rare', 7, false),
('wins_50', 'Pro', 'Win 50 games', 'wins', 'count', 50, 500, 'epic', 8, false),
('win_streak_3', 'Hot Streak', 'Win 3 games in a row', 'wins', 'streak', 3, 200, 'rare', 9, false),
('win_streak_5', 'Unstoppable', 'Win 5 games in a row', 'wins', 'streak', 5, 400, 'epic', 10, false)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- STEP 1: Add points column to achievements table
-- =====================================================

ALTER TABLE public.achievements
  ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 10 CHECK (points >= 0);

COMMENT ON COLUMN public.achievements.points IS 'Achievement points awarded when unlocked (separate from XP)';

-- =====================================================
-- STEP 2: Add achievement_points column to users table
-- =====================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS achievement_points INTEGER DEFAULT 0 CHECK (achievement_points >= 0);

CREATE INDEX IF NOT EXISTS idx_users_achievement_points ON public.users(achievement_points DESC);

COMMENT ON COLUMN public.users.achievement_points IS 'Total achievement points earned by user';

-- =====================================================
-- STEP 3: Update grant_achievement function to include points
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

  -- Update user XP and achievement points
  UPDATE public.users
  SET
    total_xp = COALESCE(total_xp, 0) + v_xp_reward,
    achievement_points = COALESCE(achievement_points, 0) + v_points_reward
  WHERE id = p_user_id;

  -- Also call add_xp if it exists (for level progression)
  BEGIN
    PERFORM add_xp(p_user_id, v_xp_reward, p_game_id, 'achievement');
  EXCEPTION WHEN undefined_function THEN
    -- add_xp doesn't exist, already updated total_xp above
    NULL;
  END;

  -- Create notification
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

COMMENT ON FUNCTION grant_achievement IS 'Grants an achievement to a user, awards XP and points, creates notification';

-- =====================================================
-- STEP 4: Update existing achievements with points values
-- =====================================================

-- Update existing achievements to have points based on rarity
UPDATE public.achievements SET points =
  CASE rarity
    WHEN 'common' THEN 10
    WHEN 'rare' THEN 25
    WHEN 'epic' THEN 50
    WHEN 'legendary' THEN 100
    ELSE 10
  END
WHERE points IS NULL OR points = 0;

-- =====================================================
-- STEP 5: Add more achievements for comprehensive system
-- =====================================================

-- Gameplay achievements
INSERT INTO public.achievements (id, name, description, category, requirement_type, requirement_value, xp_reward, points, rarity, display_order, is_hidden) VALUES
-- Games played progression
('games_25', 'Regular', 'Play 25 games', 'games_played', 'count', 25, 150, 15, 'common', 2, false),
('games_250', 'Dedicated', 'Play 250 games', 'games_played', 'count', 250, 750, 75, 'epic', 5, false),
('games_500', 'Legend', 'Play 500 games', 'games_played', 'count', 500, 1000, 100, 'legendary', 6, false),

-- Wins progression
('wins_25', 'Victorious', 'Win 25 games', 'wins', 'count', 25, 300, 30, 'rare', 7, false),
('wins_100', 'Champion', 'Win 100 games', 'wins', 'count', 100, 750, 75, 'epic', 8, false),
('wins_250', 'Legendary Winner', 'Win 250 games', 'wins', 'count', 250, 1500, 150, 'legendary', 9, false),

-- Win streaks
('win_streak_7', 'Dominating', 'Win 7 games in a row', 'wins', 'streak', 7, 750, 75, 'epic', 10, false),
('win_streak_10', 'Unbeatable', 'Win 10 games in a row', 'wins', 'streak', 10, 1500, 150, 'legendary', 11, true),

-- Social achievements
('first_friend', 'Friendly', 'Add your first friend', 'social', 'count', 1, 50, 5, 'common', 12, false),
('friends_10', 'Popular', 'Have 10 friends', 'social', 'count', 10, 200, 20, 'rare', 13, false),
('friends_25', 'Social Star', 'Have 25 friends', 'social', 'count', 25, 400, 40, 'epic', 14, false),
('host_25', 'Party Master', 'Host 25 rooms', 'social', 'count', 25, 300, 30, 'rare', 15, false),
('host_100', 'Event Coordinator', 'Host 100 rooms', 'social', 'count', 100, 600, 60, 'epic', 16, false),

-- Progression achievements
('level_5', 'Rising Star', 'Reach level 5', 'progression', 'count', 5, 100, 10, 'common', 17, false),
('level_10', 'Experienced', 'Reach level 10', 'progression', 'count', 10, 250, 25, 'rare', 18, false),
('level_25', 'Expert', 'Reach level 25', 'progression', 'count', 25, 600, 60, 'epic', 19, false),
('level_50', 'Master', 'Reach level 50', 'progression', 'count', 50, 1000, 100, 'legendary', 20, false),
('level_100', 'Grandmaster', 'Reach level 100', 'progression', 'count', 100, 2000, 200, 'legendary', 21, true),

-- XP milestones
('xp_1000', 'XP Collector', 'Earn 1,000 XP', 'progression', 'count', 1000, 100, 10, 'common', 22, false),
('xp_10000', 'XP Hunter', 'Earn 10,000 XP', 'progression', 'count', 10000, 300, 30, 'rare', 23, false),
('xp_50000', 'XP Master', 'Earn 50,000 XP', 'progression', 'count', 50000, 750, 75, 'epic', 24, false),
('xp_100000', 'XP Legend', 'Earn 100,000 XP', 'progression', 'count', 100000, 1500, 150, 'legendary', 25, true),

-- Special achievements
('early_adopter', 'Early Adopter', 'Joined during beta period', 'special', 'special', 1, 500, 100, 'legendary', 26, true),
('first_day', 'Day One', 'Played on launch day', 'special', 'special', 1, 300, 50, 'epic', 27, true),
('comeback', 'Comeback Kid', 'Win a game after being in last place', 'special', 'special', 1, 200, 25, 'rare', 28, true),
('perfect_game', 'Perfect', 'Win without any wrong answers', 'special', 'special', 1, 500, 50, 'epic', 29, true),
('speed_demon', 'Speed Demon', 'Answer correctly in under 2 seconds', 'special', 'special', 1, 150, 15, 'rare', 30, true)

ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  xp_reward = EXCLUDED.xp_reward,
  points = EXCLUDED.points,
  rarity = EXCLUDED.rarity,
  display_order = EXCLUDED.display_order,
  is_hidden = EXCLUDED.is_hidden;

-- =====================================================
-- STEP 6: Function to check and unlock achievements
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
  v_user_stats RECORD;
  v_result JSONB;
  v_current_value INTEGER;
BEGIN
  -- Get user stats
  SELECT
    u.total_games_played,
    u.total_games_won,
    u.total_rooms_hosted,
    u.account_level,
    u.total_xp,
    u.premium_tier,
    (SELECT COUNT(*) FROM public.friendships f
     WHERE (f.user_id = u.id OR f.friend_id = u.id) AND f.status = 'accepted') as friend_count
  INTO v_user_stats
  FROM public.users u
  WHERE u.id = p_user_id;

  -- Check each achievement that user hasn't earned yet
  FOR v_achievement IN
    SELECT a.*
    FROM public.achievements a
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_achievements ua
      WHERE ua.user_id = p_user_id AND ua.achievement_id = a.id
    )
    AND (
      -- Filter by relevant categories based on event type
      (p_event_type = 'game_completed' AND a.category IN ('games_played', 'wins'))
      OR (p_event_type = 'friend_added' AND a.category = 'social')
      OR (p_event_type = 'room_hosted' AND a.category = 'social')
      OR (p_event_type = 'level_reached' AND a.category = 'progression')
      OR (p_event_type = 'xp_earned' AND a.category = 'progression')
      OR (p_event_type = 'premium_upgraded' AND a.category = 'premium')
    )
  LOOP
    v_current_value := NULL;

    -- Determine current value based on achievement category/requirement
    CASE v_achievement.category
      WHEN 'games_played' THEN
        v_current_value := v_user_stats.total_games_played;
      WHEN 'wins' THEN
        IF v_achievement.requirement_type = 'streak' THEN
          v_current_value := COALESCE((p_event_data->>'win_streak')::INTEGER, 0);
        ELSE
          v_current_value := v_user_stats.total_games_won;
        END IF;
      WHEN 'social' THEN
        IF v_achievement.id LIKE 'host%' THEN
          v_current_value := v_user_stats.total_rooms_hosted;
        ELSE
          v_current_value := v_user_stats.friend_count;
        END IF;
      WHEN 'progression' THEN
        IF v_achievement.id LIKE 'level%' THEN
          v_current_value := v_user_stats.account_level;
        ELSE
          v_current_value := v_user_stats.total_xp;
        END IF;
      WHEN 'premium' THEN
        v_current_value := CASE WHEN v_user_stats.premium_tier != 'free' THEN 1 ELSE 0 END;
      ELSE
        CONTINUE;
    END CASE;

    -- Check if requirement is met
    IF v_current_value IS NOT NULL AND v_current_value >= v_achievement.requirement_value THEN
      -- Grant the achievement
      v_result := grant_achievement(
        p_user_id,
        v_achievement.id,
        (p_event_data->>'room_id')::UUID,
        p_event_data->>'game_id'
      );

      IF (v_result->>'success')::boolean THEN
        v_unlocked := v_unlocked || jsonb_build_object(
          'id', v_achievement.id,
          'name', v_achievement.name,
          'xp_reward', v_achievement.xp_reward,
          'points', v_achievement.points,
          'rarity', v_achievement.rarity
        );
      END IF;
    ELSE
      -- Update progress for progressive achievements
      UPDATE public.user_achievements
      SET progress = LEAST(100, (v_current_value::FLOAT / v_achievement.requirement_value * 100)::INTEGER)
      WHERE user_id = p_user_id AND achievement_id = v_achievement.id;

      -- If no record exists, create one with progress
      IF NOT FOUND AND v_current_value > 0 THEN
        INSERT INTO public.user_achievements (user_id, achievement_id, progress, earned_at)
        VALUES (
          p_user_id,
          v_achievement.id,
          LEAST(99, (v_current_value::FLOAT / v_achievement.requirement_value * 100)::INTEGER),
          NULL  -- Not earned yet
        )
        ON CONFLICT (user_id, achievement_id) DO UPDATE
        SET progress = EXCLUDED.progress;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'unlocked', v_unlocked,
    'count', jsonb_array_length(v_unlocked)
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_achievements IS 'Checks and unlocks achievements based on event type and user stats';

-- =====================================================
-- STEP 7: Function to get user profile with achievements
-- =====================================================

CREATE OR REPLACE FUNCTION get_user_profile(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user RECORD;
  v_achievements JSONB;
  v_recent_achievements JSONB;
  v_stats JSONB;
BEGIN
  -- Get user info
  SELECT
    id, username, display_name, avatar_url, avatar_style, avatar_seed,
    premium_tier, account_level, total_xp, achievement_points,
    total_games_played, total_games_won, total_rooms_hosted
  INTO v_user
  FROM public.users
  WHERE id = p_user_id;

  IF v_user IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get achievement counts
  SELECT jsonb_build_object(
    'total', (SELECT COUNT(*) FROM public.achievements WHERE NOT is_hidden),
    'unlocked', (SELECT COUNT(*) FROM public.user_achievements WHERE user_id = p_user_id AND earned_at IS NOT NULL),
    'by_rarity', jsonb_build_object(
      'common', (SELECT COUNT(*) FROM public.user_achievements ua JOIN public.achievements a ON ua.achievement_id = a.id WHERE ua.user_id = p_user_id AND ua.earned_at IS NOT NULL AND a.rarity = 'common'),
      'rare', (SELECT COUNT(*) FROM public.user_achievements ua JOIN public.achievements a ON ua.achievement_id = a.id WHERE ua.user_id = p_user_id AND ua.earned_at IS NOT NULL AND a.rarity = 'rare'),
      'epic', (SELECT COUNT(*) FROM public.user_achievements ua JOIN public.achievements a ON ua.achievement_id = a.id WHERE ua.user_id = p_user_id AND ua.earned_at IS NOT NULL AND a.rarity = 'epic'),
      'legendary', (SELECT COUNT(*) FROM public.user_achievements ua JOIN public.achievements a ON ua.achievement_id = a.id WHERE ua.user_id = p_user_id AND ua.earned_at IS NOT NULL AND a.rarity = 'legendary')
    )
  ) INTO v_achievements;

  -- Get recent achievements (last 5)
  SELECT COALESCE(jsonb_agg(achievement_data ORDER BY earned_at DESC), '[]'::jsonb)
  INTO v_recent_achievements
  FROM (
    SELECT jsonb_build_object(
      'id', a.id,
      'name', a.name,
      'description', a.description,
      'icon_url', a.icon_url,
      'rarity', a.rarity,
      'xp_reward', a.xp_reward,
      'points', a.points,
      'earned_at', ua.earned_at
    ) as achievement_data,
    ua.earned_at
    FROM public.user_achievements ua
    JOIN public.achievements a ON ua.achievement_id = a.id
    WHERE ua.user_id = p_user_id AND ua.earned_at IS NOT NULL
    ORDER BY ua.earned_at DESC
    LIMIT 5
  ) recent;

  -- Calculate win rate
  SELECT jsonb_build_object(
    'games_played', v_user.total_games_played,
    'games_won', v_user.total_games_won,
    'win_rate', CASE WHEN v_user.total_games_played > 0
      THEN ROUND((v_user.total_games_won::DECIMAL / v_user.total_games_played) * 100, 1)
      ELSE 0 END,
    'rooms_hosted', v_user.total_rooms_hosted,
    'friend_count', (SELECT COUNT(*) FROM public.friendships f
      WHERE (f.user_id = p_user_id OR f.friend_id = p_user_id) AND f.status = 'accepted')
  ) INTO v_stats;

  RETURN jsonb_build_object(
    'id', v_user.id,
    'username', v_user.username,
    'display_name', v_user.display_name,
    'avatar_url', v_user.avatar_url,
    'avatar_style', v_user.avatar_style,
    'avatar_seed', v_user.avatar_seed,
    'premium_tier', v_user.premium_tier,
    'level', v_user.account_level,
    'xp', v_user.total_xp,
    'achievement_points', COALESCE(v_user.achievement_points, 0),
    'stats', v_stats,
    'achievements', v_achievements,
    'recent_achievements', v_recent_achievements
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_user_profile IS 'Returns complete user profile with stats and achievements for display';

-- =====================================================
-- VERIFICATION
-- =====================================================

DO $$
DECLARE
  achievement_count INTEGER;
  has_points_column BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO achievement_count FROM public.achievements;

  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'achievements' AND column_name = 'points'
  ) INTO has_points_column;

  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Achievement Points System Added Successfully!';
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Points column exists: %', has_points_column;
  RAISE NOTICE 'Total achievements: %', achievement_count;
  RAISE NOTICE '';
  RAISE NOTICE 'New functions added:';
  RAISE NOTICE '  - grant_achievement() - Awards achievement with XP and points';
  RAISE NOTICE '  - check_achievements() - Checks and unlocks based on events';
  RAISE NOTICE '  - get_user_profile() - Returns full profile with achievements';
  RAISE NOTICE '===========================================';
END $$;
