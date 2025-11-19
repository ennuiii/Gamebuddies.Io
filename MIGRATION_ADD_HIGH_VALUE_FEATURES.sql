-- =====================================================
-- GameBuddies - Add High-Value Features Migration
-- =====================================================
-- Run this in Supabase SQL Editor to add all recommended features
-- This adds: Stats, Achievements, Social, Notifications, Moderation

-- =====================================================
-- PHASE 1: PLAYER STATISTICS & MATCH HISTORY (HIGH PRIORITY)
-- =====================================================

-- Player Statistics Table (per-game stats)
CREATE TABLE IF NOT EXISTS public.player_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  game_id VARCHAR(50) REFERENCES public.games(id) ON DELETE CASCADE,

  -- Game statistics
  games_played INTEGER DEFAULT 0 CHECK (games_played >= 0),
  games_won INTEGER DEFAULT 0 CHECK (games_won >= 0),
  games_lost INTEGER DEFAULT 0 CHECK (games_lost >= 0),
  games_abandoned INTEGER DEFAULT 0 CHECK (games_abandoned >= 0),

  -- Time tracking
  total_time_played_minutes INTEGER DEFAULT 0 CHECK (total_time_played_minutes >= 0),
  average_game_duration_minutes DECIMAL(10,2),

  -- Performance (computed column)
  win_rate DECIMAL(5,2) GENERATED ALWAYS AS (
    CASE
      WHEN games_played > 0
      THEN ROUND((games_won::DECIMAL / games_played) * 100, 2)
      ELSE 0
    END
  ) STORED,

  -- Engagement
  favorite_game BOOLEAN DEFAULT false,
  last_played_at TIMESTAMPTZ,
  streak_days INTEGER DEFAULT 0 CHECK (streak_days >= 0),
  longest_streak INTEGER DEFAULT 0 CHECK (longest_streak >= 0),

  -- Skill rating (for matchmaking - ELO-like)
  skill_rating INTEGER DEFAULT 1000 CHECK (skill_rating >= 0 AND skill_rating <= 5000),
  skill_confidence DECIMAL(5,2) DEFAULT 0.5 CHECK (skill_confidence >= 0 AND skill_confidence <= 1),

  -- Timestamps
  first_played_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_user_game_stats UNIQUE(user_id, game_id),
  CONSTRAINT stats_games_won_check CHECK (games_won <= games_played),
  CONSTRAINT stats_games_lost_check CHECK (games_lost <= games_played)
);

-- Indexes for player_stats
CREATE INDEX idx_player_stats_user ON public.player_stats(user_id);
CREATE INDEX idx_player_stats_game ON public.player_stats(game_id);
CREATE INDEX idx_player_stats_win_rate ON public.player_stats(win_rate DESC) WHERE games_played >= 10;
CREATE INDEX idx_player_stats_skill ON public.player_stats(game_id, skill_rating DESC);
CREATE INDEX idx_player_stats_last_played ON public.player_stats(last_played_at DESC);

COMMENT ON TABLE public.player_stats IS 'Per-game player statistics for leaderboards and profiles';
COMMENT ON COLUMN public.player_stats.skill_rating IS 'ELO-like rating for matchmaking (1000 = average)';
COMMENT ON COLUMN public.player_stats.win_rate IS 'Computed: (games_won / games_played) * 100';

-- Match History Table
CREATE TABLE IF NOT EXISTS public.game_matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  game_id VARCHAR(50) NOT NULL REFERENCES public.games(id),

  -- Match details
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (ended_at - started_at)) / 60
  ) STORED,

  -- Players (JSONB array of player data)
  total_players INTEGER NOT NULL CHECK (total_players >= 1),
  players JSONB NOT NULL, -- [{"user_id": "uuid", "username": "name", "rank": 1, "score": 100}]

  -- Results
  winner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  final_scores JSONB, -- {"player_id": score}

  -- Metadata
  game_mode VARCHAR(50),
  game_settings JSONB DEFAULT '{}',
  was_abandoned BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_duration CHECK (ended_at > started_at)
);

-- Indexes for game_matches
CREATE INDEX idx_game_matches_game ON public.game_matches(game_id);
CREATE INDEX idx_game_matches_started ON public.game_matches(started_at DESC);
CREATE INDEX idx_game_matches_players ON public.game_matches USING gin(players);
CREATE INDEX idx_game_matches_winner ON public.game_matches(winner_id) WHERE winner_id IS NOT NULL;

COMMENT ON TABLE public.game_matches IS 'Complete match history for all games';
COMMENT ON COLUMN public.game_matches.players IS 'JSON array of player data with results';

-- Add global stats to users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS total_games_played INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_games_won INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_rooms_hosted INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_rooms_joined INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS account_level INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS total_xp INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_users_level ON public.users(account_level DESC);
CREATE INDEX IF NOT EXISTS idx_users_total_games ON public.users(total_games_played DESC);

-- =====================================================
-- PHASE 2: ACHIEVEMENTS SYSTEM (GAMIFICATION)
-- =====================================================

-- Achievement Definitions
CREATE TABLE IF NOT EXISTS public.achievements (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  icon_url TEXT,

  -- Requirements
  category VARCHAR(50) NOT NULL, -- 'games_played', 'wins', 'social', 'premium', 'special'
  requirement_type VARCHAR(50) NOT NULL, -- 'count', 'streak', 'condition', 'special'
  requirement_value INTEGER DEFAULT 0,
  requirement_data JSONB DEFAULT '{}', -- For complex requirements

  -- Rewards
  xp_reward INTEGER DEFAULT 0 CHECK (xp_reward >= 0),
  premium_only BOOLEAN DEFAULT false,

  -- Display
  is_hidden BOOLEAN DEFAULT false, -- Secret achievements
  rarity VARCHAR(20) DEFAULT 'common' CHECK (
    rarity IN ('common', 'rare', 'epic', 'legendary')
  ),
  display_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_achievements_category ON public.achievements(category);
CREATE INDEX idx_achievements_rarity ON public.achievements(rarity);

COMMENT ON TABLE public.achievements IS 'Achievement definitions for gamification';

-- User Achievements (Unlocked)
CREATE TABLE IF NOT EXISTS public.user_achievements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  achievement_id VARCHAR(50) NOT NULL REFERENCES public.achievements(id),

  earned_at TIMESTAMPTZ DEFAULT NOW(),
  progress INTEGER DEFAULT 0, -- For progressive achievements (e.g., 7/10 wins)

  -- Context
  earned_in_room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  earned_in_game VARCHAR(50) REFERENCES public.games(id),

  metadata JSONB DEFAULT '{}',

  CONSTRAINT unique_user_achievement UNIQUE(user_id, achievement_id)
);

CREATE INDEX idx_user_achievements_user ON public.user_achievements(user_id);
CREATE INDEX idx_user_achievements_earned ON public.user_achievements(earned_at DESC);
CREATE INDEX idx_user_achievements_achievement ON public.user_achievements(achievement_id);

COMMENT ON TABLE public.user_achievements IS 'Achievements unlocked by users';

-- Insert starter achievements
INSERT INTO public.achievements (id, name, description, category, requirement_type, requirement_value, xp_reward, rarity, display_order) VALUES
('first_game', 'First Steps', 'Play your first game', 'games_played', 'count', 1, 50, 'common', 1),
('games_10', 'Getting Started', 'Play 10 games', 'games_played', 'count', 10, 100, 'common', 2),
('games_50', 'Enthusiast', 'Play 50 games', 'games_played', 'count', 50, 250, 'rare', 3),
('games_100', 'Veteran', 'Play 100 games', 'games_played', 'count', 100, 500, 'epic', 4),
('first_win', 'Victory!', 'Win your first game', 'wins', 'count', 1, 100, 'common', 5),
('wins_10', 'Winner', 'Win 10 games', 'wins', 'count', 10, 200, 'rare', 6),
('win_streak_3', 'On Fire', 'Win 3 games in a row', 'wins', 'streak', 3, 300, 'rare', 7),
('win_streak_5', 'Unstoppable', 'Win 5 games in a row', 'wins', 'streak', 5, 500, 'epic', 8),
('social_10', 'Social Butterfly', 'Play with 10 different players', 'social', 'count', 10, 150, 'common', 9),
('host_10', 'Host Master', 'Host 10 rooms', 'social', 'count', 10, 150, 'common', 10),
('premium_user', 'Premium Player', 'Subscribe to premium', 'premium', 'condition', 1, 200, 'rare', 11)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- PHASE 3: SOCIAL FEATURES (FRIENDS & INVITES)
-- =====================================================

-- Friendships Table
CREATE TABLE IF NOT EXISTS public.friendships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'accepted', 'blocked', 'declined')
  ),

  -- Who initiated
  requested_by UUID NOT NULL REFERENCES public.users(id),

  -- Timestamps
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Constraints
  CONSTRAINT unique_friendship UNIQUE(user_id, friend_id),
  CONSTRAINT no_self_friendship CHECK (user_id != friend_id),
  -- Ensure only one direction exists (smaller UUID first)
  CONSTRAINT friendship_direction CHECK (user_id < friend_id)
);

CREATE INDEX idx_friendships_user ON public.friendships(user_id);
CREATE INDEX idx_friendships_friend ON public.friendships(friend_id);
CREATE INDEX idx_friendships_status ON public.friendships(status);
CREATE INDEX idx_friendships_pending ON public.friendships(user_id, status) WHERE status = 'pending';

COMMENT ON TABLE public.friendships IS 'Friend connections between users';
COMMENT ON CONSTRAINT friendship_direction ON public.friendships IS 'Ensures friendship only stored once (smaller UUID first)';

-- Room Invitations Table
CREATE TABLE IF NOT EXISTS public.room_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  invited_user UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled')
  ),

  message TEXT,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 hour',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,

  CONSTRAINT unique_room_invitation UNIQUE(room_id, invited_user),
  CONSTRAINT no_self_invite CHECK (invited_by != invited_user)
);

CREATE INDEX idx_room_invitations_user ON public.room_invitations(invited_user);
CREATE INDEX idx_room_invitations_room ON public.room_invitations(room_id);
CREATE INDEX idx_room_invitations_status ON public.room_invitations(status);
CREATE INDEX idx_room_invitations_pending ON public.room_invitations(invited_user, status)
  WHERE status = 'pending' AND expires_at > NOW();

COMMENT ON TABLE public.room_invitations IS 'Invitations to join specific rooms';

-- =====================================================
-- PHASE 4: NOTIFICATIONS SYSTEM
-- =====================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- Notification details
  type VARCHAR(50) NOT NULL, -- 'friend_request', 'room_invite', 'achievement', 'subscription', etc.
  title VARCHAR(200) NOT NULL,
  message TEXT,

  -- Status
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,

  -- Actions
  action_url TEXT, -- Link to click
  action_label VARCHAR(50), -- "View", "Accept", "Join"

  -- Related entities
  related_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  related_room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  related_achievement_id VARCHAR(50) REFERENCES public.achievements(id) ON DELETE SET NULL,

  -- Priority
  priority VARCHAR(20) DEFAULT 'normal' CHECK (
    priority IN ('low', 'normal', 'high', 'urgent')
  ),

  -- Expiration
  expires_at TIMESTAMPTZ,

  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON public.notifications(user_id);
CREATE INDEX idx_notifications_unread ON public.notifications(user_id, is_read, created_at DESC)
  WHERE is_read = false;
CREATE INDEX idx_notifications_type ON public.notifications(type);
CREATE INDEX idx_notifications_created ON public.notifications(created_at DESC);

COMMENT ON TABLE public.notifications IS 'User notifications for various events';

-- =====================================================
-- PHASE 5: MODERATION SYSTEM
-- =====================================================

-- User Reports Table
CREATE TABLE IF NOT EXISTS public.user_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reported_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reported_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- Report details
  reason VARCHAR(50) NOT NULL CHECK (
    reason IN ('harassment', 'cheating', 'spam', 'inappropriate_name', 'offensive_content', 'other')
  ),
  description TEXT NOT NULL,

  -- Context
  occurred_in_room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  evidence_urls TEXT[], -- Screenshots, etc.

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (
    status IN ('pending', 'investigating', 'resolved', 'dismissed')
  ),

  -- Moderation
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL, -- Moderator
  resolution TEXT,
  resolved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT no_self_report CHECK (reported_user_id != reported_by)
);

CREATE INDEX idx_user_reports_reported ON public.user_reports(reported_user_id);
CREATE INDEX idx_user_reports_reporter ON public.user_reports(reported_by);
CREATE INDEX idx_user_reports_status ON public.user_reports(status);
CREATE INDEX idx_user_reports_created ON public.user_reports(created_at DESC);
CREATE INDEX idx_user_reports_pending ON public.user_reports(status) WHERE status = 'pending';

COMMENT ON TABLE public.user_reports IS 'User behavior reports for moderation';

-- User Bans Table
CREATE TABLE IF NOT EXISTS public.user_bans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- Ban details
  reason TEXT NOT NULL,
  ban_type VARCHAR(20) NOT NULL CHECK (
    ban_type IN ('warning', 'temporary', 'permanent')
  ),

  -- Duration
  banned_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- NULL for permanent

  -- Moderation
  banned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  related_report_id UUID REFERENCES public.user_reports(id) ON DELETE SET NULL,

  -- Status
  is_active BOOLEAN DEFAULT true,
  lifted_at TIMESTAMPTZ,
  lifted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  lift_reason TEXT,

  metadata JSONB DEFAULT '{}',

  CONSTRAINT permanent_ban_no_expiry CHECK (
    (ban_type = 'permanent' AND expires_at IS NULL) OR
    (ban_type != 'permanent' AND expires_at IS NOT NULL)
  )
);

CREATE INDEX idx_user_bans_user ON public.user_bans(user_id);
CREATE INDEX idx_user_bans_active ON public.user_bans(user_id, is_active) WHERE is_active = true;
CREATE INDEX idx_user_bans_expires ON public.user_bans(expires_at) WHERE expires_at IS NOT NULL;

COMMENT ON TABLE public.user_bans IS 'User bans and warnings';

-- =====================================================
-- PHASE 6: SUBSCRIPTION HISTORY (AUDIT TRAIL)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.subscription_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  event_type VARCHAR(50) NOT NULL CHECK (
    event_type IN ('created', 'renewed', 'upgraded', 'downgraded', 'cancelled', 'expired', 'payment_failed', 'refunded')
  ),

  -- Subscription details
  tier VARCHAR(20) NOT NULL CHECK (tier IN ('free', 'monthly', 'lifetime')),
  old_tier VARCHAR(20),

  -- Payment details
  amount DECIMAL(10,2),
  currency VARCHAR(3) DEFAULT 'USD',
  payment_status VARCHAR(20),
  stripe_event_id TEXT,

  -- Context
  reason TEXT,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscription_events_user ON public.subscription_events(user_id);
CREATE INDEX idx_subscription_events_type ON public.subscription_events(event_type);
CREATE INDEX idx_subscription_events_created ON public.subscription_events(created_at DESC);

COMMENT ON TABLE public.subscription_events IS 'Subscription event history for audit and analytics';

-- =====================================================
-- BONUS: USER CUSTOMIZATION FIELDS
-- =====================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS favorite_game VARCHAR(50) REFERENCES public.games(id),
  ADD COLUMN IF NOT EXISTS profile_banner_url TEXT,
  ADD COLUMN IF NOT EXISTS profile_theme VARCHAR(50) DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS privacy_settings JSONB DEFAULT '{"profile_public": true, "stats_public": true, "show_online_status": true}'::jsonb,
  ADD COLUMN IF NOT EXISTS display_preferences JSONB DEFAULT '{}'::jsonb;

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to update player stats after a match
CREATE OR REPLACE FUNCTION update_player_stats_after_match(
  p_user_id UUID,
  p_game_id VARCHAR,
  p_won BOOLEAN,
  p_duration_minutes INTEGER
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.player_stats (
    user_id,
    game_id,
    games_played,
    games_won,
    games_lost,
    total_time_played_minutes,
    last_played_at,
    first_played_at
  ) VALUES (
    p_user_id,
    p_game_id,
    1,
    CASE WHEN p_won THEN 1 ELSE 0 END,
    CASE WHEN NOT p_won THEN 1 ELSE 0 END,
    p_duration_minutes,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id, game_id)
  DO UPDATE SET
    games_played = player_stats.games_played + 1,
    games_won = player_stats.games_won + CASE WHEN p_won THEN 1 ELSE 0 END,
    games_lost = player_stats.games_lost + CASE WHEN NOT p_won THEN 1 ELSE 0 END,
    total_time_played_minutes = player_stats.total_time_played_minutes + p_duration_minutes,
    last_played_at = NOW(),
    updated_at = NOW();

  -- Update global user stats
  UPDATE public.users
  SET
    total_games_played = total_games_played + 1,
    total_games_won = total_games_won + CASE WHEN p_won THEN 1 ELSE 0 END
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_player_stats_after_match IS 'Updates player stats after a game completes';

-- Function to grant achievement to user
CREATE OR REPLACE FUNCTION grant_achievement(
  p_user_id UUID,
  p_achievement_id VARCHAR,
  p_room_id UUID DEFAULT NULL,
  p_game_id VARCHAR DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_xp_reward INTEGER;
  v_already_earned BOOLEAN;
BEGIN
  -- Check if already earned
  SELECT EXISTS(
    SELECT 1 FROM public.user_achievements
    WHERE user_id = p_user_id AND achievement_id = p_achievement_id
  ) INTO v_already_earned;

  IF v_already_earned THEN
    RETURN FALSE;
  END IF;

  -- Get XP reward
  SELECT xp_reward INTO v_xp_reward
  FROM public.achievements
  WHERE id = p_achievement_id;

  -- Insert achievement
  INSERT INTO public.user_achievements (
    user_id,
    achievement_id,
    earned_in_room_id,
    earned_in_game
  ) VALUES (
    p_user_id,
    p_achievement_id,
    p_room_id,
    p_game_id
  );

  -- Update user XP
  UPDATE public.users
  SET total_xp = total_xp + v_xp_reward
  WHERE id = p_user_id;

  -- Create notification
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    related_achievement_id,
    priority
  )
  SELECT
    p_user_id,
    'achievement',
    'Achievement Unlocked!',
    'You earned: ' || a.name,
    p_achievement_id,
    'high'
  FROM public.achievements a
  WHERE a.id = p_achievement_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION grant_achievement IS 'Grants an achievement to a user and creates notification';

-- =====================================================
-- VERIFICATION & SUCCESS MESSAGE
-- =====================================================

DO $$
DECLARE
  table_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'player_stats',
      'game_matches',
      'achievements',
      'user_achievements',
      'friendships',
      'room_invitations',
      'notifications',
      'user_reports',
      'user_bans',
      'subscription_events'
    );

  RAISE NOTICE '===========================================';
  RAISE NOTICE '✅ MIGRATION COMPLETED SUCCESSFULLY!';
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Tables created: % of 10', table_count;
  RAISE NOTICE '';
  RAISE NOTICE '✅ Player Statistics & Match History';
  RAISE NOTICE '✅ Achievements System (11 starter achievements)';
  RAISE NOTICE '✅ Social Features (Friends & Invites)';
  RAISE NOTICE '✅ Notifications System';
  RAISE NOTICE '✅ Moderation Tools';
  RAISE NOTICE '✅ Subscription History';
  RAISE NOTICE '✅ User Customization Fields';
  RAISE NOTICE '✅ Helper Functions';
  RAISE NOTICE '';
  RAISE NOTICE 'Next Steps:';
  RAISE NOTICE '1. Update server code to use new tables';
  RAISE NOTICE '2. Create UI for player profiles/stats';
  RAISE NOTICE '3. Implement achievement checking logic';
  RAISE NOTICE '4. Build friends/social UI';
  RAISE NOTICE '5. Add notification system';
  RAISE NOTICE '';
  RAISE NOTICE 'Check the tables:';
  RAISE NOTICE '  SELECT * FROM player_stats LIMIT 5;';
  RAISE NOTICE '  SELECT * FROM achievements;';
  RAISE NOTICE '===========================================';
END $$;
