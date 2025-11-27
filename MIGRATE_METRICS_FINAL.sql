-- =====================================================
-- GameBuddies - Metrics Migration & Cleanup
-- =====================================================
-- 1. Creates user_metrics table if missing.
-- 2. Migrates data from users table columns to user_metrics.
-- 3. Initializes default metrics (0) for all users.
-- 4. Updates stored functions to read/write from user_metrics.
-- 5. Drops the old columns from users table.

-- =====================================================
-- STEP 1: Ensure user_metrics table exists
-- =====================================================

CREATE TABLE IF NOT EXISTS public.user_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  metric_key VARCHAR(100) NOT NULL,
  value BIGINT DEFAULT 0,
  game_id VARCHAR(50) DEFAULT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, metric_key, game_id)
);

CREATE INDEX IF NOT EXISTS idx_user_metrics_user_id ON public.user_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_user_metrics_key ON public.user_metrics(metric_key);
CREATE INDEX IF NOT EXISTS idx_user_metrics_user_key ON public.user_metrics(user_id, metric_key);

-- =====================================================
-- STEP 2: Helper Functions (get_metric, increment_metric, set_metric)
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
    INSERT INTO public.user_metrics (user_id, metric_key, value, game_id, updated_at)
    VALUES (p_user_id, p_metric_key, p_value, p_game_id, NOW())
    ON CONFLICT (user_id, metric_key, game_id)
    DO UPDATE SET
      value = GREATEST(user_metrics.value, p_value),
      updated_at = NOW()
    RETURNING value INTO v_new_value;
  ELSE
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

-- =====================================================
-- STEP 3: Migrate Data & Initialize Defaults
-- =====================================================

DO $$
DECLARE
  r RECORD;
  v_val BIGINT;
BEGIN
  -- Loop through all users to ensure they have metrics
  FOR r IN SELECT id, username FROM public.users LOOP
    
    -- 3a. Migrate current_win_streak if column exists
    BEGIN
      EXECUTE 'SELECT current_win_streak FROM public.users WHERE id = $1' INTO v_val USING r.id;
      IF v_val IS NOT NULL AND v_val > 0 THEN
        PERFORM set_metric(r.id, 'current_win_streak', v_val, NULL);
      END IF;
    EXCEPTION WHEN undefined_column THEN
      -- Column doesn't exist, ignore
      NULL;
    END;

    -- 3b. Migrate best_win_streak if column exists
    BEGIN
      EXECUTE 'SELECT best_win_streak FROM public.users WHERE id = $1' INTO v_val USING r.id;
      IF v_val IS NOT NULL AND v_val > 0 THEN
        PERFORM set_metric(r.id, 'best_win_streak', v_val, NULL, true);
      END IF;
    EXCEPTION WHEN undefined_column THEN
      NULL;
    END;

    -- 3c. Migrate total_games_played if column exists
    BEGIN
      EXECUTE 'SELECT total_games_played FROM public.users WHERE id = $1' INTO v_val USING r.id;
      IF v_val IS NOT NULL AND v_val > 0 THEN
        PERFORM set_metric(r.id, 'games_played', v_val, NULL);
      END IF;
    EXCEPTION WHEN undefined_column THEN
      NULL;
    END;

    -- 3d. Migrate total_games_won if column exists
    BEGIN
      EXECUTE 'SELECT total_games_won FROM public.users WHERE id = $1' INTO v_val USING r.id;
      IF v_val IS NOT NULL AND v_val > 0 THEN
        PERFORM set_metric(r.id, 'games_won', v_val, NULL);
      END IF;
    EXCEPTION WHEN undefined_column THEN
      NULL;
    END;

    -- 3e. Migrate total_rooms_hosted if column exists
    BEGIN
      EXECUTE 'SELECT total_rooms_hosted FROM public.users WHERE id = $1' INTO v_val USING r.id;
      IF v_val IS NOT NULL AND v_val > 0 THEN
        PERFORM set_metric(r.id, 'rooms_hosted', v_val, NULL);
      END IF;
    EXCEPTION WHEN undefined_column THEN
      NULL;
    END;

    -- 3f. Initialize defaults (0) if they don't exist yet
    -- We use increment_metric with 0 which creates if missing, does nothing to value if exists
    PERFORM increment_metric(r.id, 'games_played', 0, NULL);
    PERFORM increment_metric(r.id, 'games_won', 0, NULL);
    PERFORM increment_metric(r.id, 'rooms_hosted', 0, NULL);
    PERFORM increment_metric(r.id, 'current_win_streak', 0, NULL);
    PERFORM increment_metric(r.id, 'best_win_streak', 0, NULL);

  END LOOP;
END $$;

-- =====================================================
-- STEP 4: Update Functions to use user_metrics
-- =====================================================

-- 4a. process_match_result (The writer)
CREATE OR REPLACE FUNCTION process_match_result(
  p_user_id UUID,
  p_game_id VARCHAR,
  p_won BOOLEAN,
  p_score INTEGER DEFAULT NULL,
  p_room_id UUID DEFAULT NULL,
  p_metrics JSONB DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_games_played BIGINT;
  v_games_won BIGINT;
  v_current_streak BIGINT;
  v_best_streak BIGINT;
  v_achievement_result JSONB;
  v_stats JSONB;
BEGIN
  -- Ensure user exists
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  -- Increment games_played (global & game-specific)
  v_games_played := increment_metric(p_user_id, 'games_played', 1, NULL);
  PERFORM increment_metric(p_user_id, 'games_played', 1, p_game_id);

  -- Handle wins and streaks
  IF p_won THEN
    v_games_won := increment_metric(p_user_id, 'games_won', 1, NULL);
    PERFORM increment_metric(p_user_id, 'games_won', 1, p_game_id);
    v_current_streak := increment_metric(p_user_id, 'current_win_streak', 1, NULL);
    v_best_streak := set_metric(p_user_id, 'best_win_streak', v_current_streak, NULL, true);
  ELSE
    v_games_won := get_metric(p_user_id, 'games_won', NULL);
    v_current_streak := set_metric(p_user_id, 'current_win_streak', 0, NULL, false);
    v_best_streak := get_metric(p_user_id, 'best_win_streak', NULL);
  END IF;

  -- Track score
  IF p_score IS NOT NULL THEN
    PERFORM set_metric(p_user_id, 'high_score', p_score, p_game_id, true);
  END IF;

  -- Check achievements
  BEGIN
    v_achievement_result := check_achievements(
      p_user_id,
      'game_completed',
      jsonb_build_object(
        'game_id', p_game_id,
        'room_id', p_room_id,
        'won', p_won,
        'score', p_score
      )
    );
  EXCEPTION WHEN undefined_function THEN
    v_achievement_result := jsonb_build_object('unlocked', '[]'::jsonb, 'count', 0);
  END;

  RETURN jsonb_build_object(
    'success', true,
    'stats', jsonb_build_object(
      'games_played', v_games_played,
      'games_won', v_games_won,
      'current_win_streak', v_current_streak,
      'best_win_streak', v_best_streak
    ),
    'achievements', v_achievement_result
  );
END;
$$ LANGUAGE plpgsql;

-- 4b. get_user_stats (The reader - public stats)
CREATE OR REPLACE FUNCTION get_user_stats(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user RECORD;
  v_games_played BIGINT;
  v_games_won BIGINT;
  v_current_streak BIGINT;
  v_best_streak BIGINT;
BEGIN
  -- Get base user info (xp, level still on users table)
  SELECT id, username, display_name, level, xp, achievement_points
  INTO v_user FROM public.users WHERE id = p_user_id;

  IF v_user IS NULL THEN RETURN NULL; END IF;

  -- Get metrics
  v_games_played := get_metric(p_user_id, 'games_played', NULL);
  v_games_won := get_metric(p_user_id, 'games_won', NULL);
  v_current_streak := get_metric(p_user_id, 'current_win_streak', NULL);
  v_best_streak := get_metric(p_user_id, 'best_win_streak', NULL);

  RETURN jsonb_build_object(
    'user_id', v_user.id,
    'username', v_user.username,
    'display_name', v_user.display_name,
    'total_games_played', v_games_played,
    'total_games_won', v_games_won,
    'win_rate', CASE WHEN v_games_played > 0 THEN ROUND((v_games_won::DECIMAL / v_games_played) * 100, 1) ELSE 0 END,
    'current_win_streak', v_current_streak,
    'best_win_streak', v_best_streak,
    'account_level', COALESCE(v_user.level, 1),
    'total_xp', COALESCE(v_user.xp, 0),
    'achievement_points', COALESCE(v_user.achievement_points, 0)
  );
END;
$$ LANGUAGE plpgsql;

-- 4c. get_user_profile (The reader - full profile)
CREATE OR REPLACE FUNCTION get_user_profile(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_user RECORD;
  v_achievements JSONB;
  v_recent_achievements JSONB;
  v_stats JSONB;
  v_games_played BIGINT;
  v_games_won BIGINT;
  v_rooms_hosted BIGINT;
  v_friend_count INTEGER;
BEGIN
  -- Get user info
  SELECT
    id, username, display_name, avatar_url, avatar_style, avatar_seed,
    premium_tier, level, xp, achievement_points
  INTO v_user
  FROM public.users
  WHERE id = p_user_id;

  IF v_user IS NULL THEN RETURN NULL; END IF;

  -- Get metrics
  v_games_played := get_metric(p_user_id, 'games_played', NULL);
  v_games_won := get_metric(p_user_id, 'games_won', NULL);
  v_rooms_hosted := get_metric(p_user_id, 'rooms_hosted', NULL);
  
  SELECT COUNT(*) INTO v_friend_count FROM public.friendships f
  WHERE (f.user_id = p_user_id OR f.friend_id = p_user_id) AND f.status = 'accepted';

  -- Get achievement counts (logic unchanged)
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

  -- Get recent achievements
  SELECT COALESCE(jsonb_agg(achievement_data ORDER BY earned_at DESC), '[]'::jsonb)
  INTO v_recent_achievements
  FROM (
    SELECT jsonb_build_object(
      'id', a.id, 'name', a.name, 'description', a.description, 'icon_url', a.icon_url,
      'rarity', a.rarity, 'xp_reward', a.xp_reward, 'points', a.points, 'earned_at', ua.earned_at
    ) as achievement_data, ua.earned_at
    FROM public.user_achievements ua
    JOIN public.achievements a ON ua.achievement_id = a.id
    WHERE ua.user_id = p_user_id AND ua.earned_at IS NOT NULL
    ORDER BY ua.earned_at DESC
    LIMIT 5
  ) recent;

  -- Build stats object using metrics
  v_stats := jsonb_build_object(
    'games_played', v_games_played,
    'games_won', v_games_won,
    'win_rate', CASE WHEN v_games_played > 0 THEN ROUND((v_games_won::DECIMAL / v_games_played) * 100, 1) ELSE 0 END,
    'rooms_hosted', v_rooms_hosted,
    'friend_count', v_friend_count
  );

  RETURN jsonb_build_object(
    'id', v_user.id,
    'username', v_user.username,
    'display_name', v_user.display_name,
    'avatar_url', v_user.avatar_url,
    'avatar_style', v_user.avatar_style,
    'avatar_seed', v_user.avatar_seed,
    'premium_tier', v_user.premium_tier,
    'level', v_user.level,
    'xp', v_user.xp,
    'achievement_points', COALESCE(v_user.achievement_points, 0),
    'stats', v_stats,
    'achievements', v_achievements,
    'recent_achievements', v_recent_achievements
  );
END;
$$ LANGUAGE plpgsql;

-- 4d. check_achievements (The logic engine)
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

  -- Get user core stats (users table)
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

-- =====================================================
-- STEP 5: Drop old columns from users table
-- =====================================================

ALTER TABLE public.users 
  DROP COLUMN IF EXISTS current_win_streak,
  DROP COLUMN IF EXISTS best_win_streak,
  DROP COLUMN IF EXISTS total_games_played,
  DROP COLUMN IF EXISTS total_games_won,
  DROP COLUMN IF EXISTS total_rooms_hosted;

-- =====================================================
-- VERIFICATION
-- =====================================================
DO $$
DECLARE
  metric_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO metric_count FROM public.user_metrics;
  RAISE NOTICE 'Migration Complete! Total metrics created: %', metric_count;
END $$;
