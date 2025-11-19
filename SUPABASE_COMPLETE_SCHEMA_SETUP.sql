-- =====================================================
-- GameBuddies V2 - Complete Supabase Database Setup
-- =====================================================
-- This script creates the entire database schema from scratch
-- Run this on a fresh Supabase project to set up GameBuddies V2

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- =====================================================
-- CORE TABLES
-- =====================================================

-- Users table
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(50) NOT NULL UNIQUE,
  display_name VARCHAR(100),
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_guest BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  
  -- Constraints
  CONSTRAINT username_length CHECK (length(username) >= 3),
  CONSTRAINT username_format CHECK (username ~ '^[a-zA-Z0-9_-]+$')
);

-- Games table
CREATE TABLE public.games (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  base_url TEXT NOT NULL,
  is_external BOOLEAN DEFAULT false,
  requires_api_key BOOLEAN DEFAULT false,
  min_players INTEGER DEFAULT 2 CHECK (min_players >= 1),
  max_players INTEGER DEFAULT 10 CHECK (max_players >= min_players),
  supports_spectators BOOLEAN DEFAULT false,
  settings_schema JSONB DEFAULT '{}',
  default_settings JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  maintenance_mode BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Rooms table
CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_code VARCHAR(6) NOT NULL UNIQUE,
  host_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'lobby' CHECK (
    status IN ('lobby', 'in_game', 'returning', 'abandoned', 'finished')
  ),
  current_game VARCHAR(50) REFERENCES public.games(id),
  game_started_at TIMESTAMP WITH TIME ZONE,
  game_settings JSONB DEFAULT '{}',
  max_players INTEGER DEFAULT 10 CHECK (max_players >= 2 AND max_players <= 50),
  is_public BOOLEAN DEFAULT true,
  allow_spectators BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',
  
  -- Constraints
  CONSTRAINT room_code_format CHECK (room_code ~ '^[A-Z0-9]{6}$')
);

-- Room Members table (Enhanced for V2)
CREATE TABLE public.room_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'player' CHECK (
    role IN ('host', 'player', 'spectator')
  ),
  is_connected BOOLEAN DEFAULT true,
  last_ping TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  socket_id VARCHAR(128),
  is_ready BOOLEAN DEFAULT false,
  in_game BOOLEAN DEFAULT false,
  current_location VARCHAR(16) DEFAULT 'lobby' CHECK (
    current_location IN ('lobby', 'game', 'disconnected')
  ),
  game_data JSONB DEFAULT '{}',
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  left_at TIMESTAMP WITH TIME ZONE,
  
  -- Constraints
  CONSTRAINT unique_user_per_room UNIQUE(room_id, user_id)
);

-- =====================================================
-- V2 ENHANCED TABLES
-- =====================================================

-- Player Sessions table (for session recovery)
CREATE TABLE public.player_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
  session_token VARCHAR(64) NOT NULL UNIQUE,
  socket_id VARCHAR(128),
  status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'expired', 'revoked')
  ),
  last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours'),
  
  -- Constraints
  CONSTRAINT unique_user_room_session UNIQUE(user_id, room_id)
);

-- Player Status History table (for audit trail)
CREATE TABLE public.player_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  old_location VARCHAR(16),
  new_location VARCHAR(16) NOT NULL CHECK (
    new_location IN ('lobby', 'game', 'disconnected')
  ),
  old_status VARCHAR(16),
  new_status VARCHAR(16) NOT NULL,
  reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Game States table (for game state persistence)
CREATE TABLE public.game_states (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  game_name VARCHAR(50) NOT NULL,
  state_data JSONB NOT NULL DEFAULT '{}',
  state_version INTEGER NOT NULL DEFAULT 1,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

-- Room Events table (for audit trail)
CREATE TABLE public.room_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- API Keys table (for external game integration)
CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key_hash VARCHAR(128) NOT NULL UNIQUE,
  service_name VARCHAR(50) NOT NULL,
  game_id VARCHAR(50) REFERENCES public.games(id),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  permissions JSONB DEFAULT '["read", "write"]',
  rate_limit INTEGER DEFAULT 1000,
  is_active BOOLEAN DEFAULT true,
  last_used TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES public.users(id),
  metadata JSONB DEFAULT '{}'
);

-- API Requests table (for monitoring)
CREATE TABLE public.api_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  api_key_id UUID REFERENCES public.api_keys(id),
  method VARCHAR(10) NOT NULL,
  endpoint TEXT NOT NULL,
  status_code INTEGER,
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  response_time_ms INTEGER,
  ip_address INET,
  user_agent TEXT,
  request_data JSONB DEFAULT '{}',
  response_data JSONB DEFAULT '{}',
  error_message TEXT
);

-- Game Sessions table (for session tracking)
CREATE TABLE public.game_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  game_id VARCHAR(50) NOT NULL REFERENCES public.games(id),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'completed', 'abandoned')
  ),
  participants JSONB NOT NULL DEFAULT '[]',
  game_state JSONB DEFAULT '{}',
  game_result JSONB DEFAULT '{}',
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}'
);

-- Connection Metrics table (for monitoring)
CREATE TABLE public.connection_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  metric_type VARCHAR(32) NOT NULL,
  metric_value NUMERIC NOT NULL,
  tags JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Users indexes
CREATE INDEX idx_users_username ON public.users(username);
CREATE INDEX idx_users_last_seen ON public.users(last_seen DESC);
CREATE INDEX idx_users_is_guest ON public.users(is_guest);

-- Games indexes
CREATE INDEX idx_games_is_active ON public.games(is_active);
CREATE INDEX idx_games_maintenance ON public.games(maintenance_mode);

-- Rooms indexes
CREATE INDEX idx_rooms_room_code ON public.rooms(room_code);
CREATE INDEX idx_rooms_host_id ON public.rooms(host_id);
CREATE INDEX idx_rooms_status ON public.rooms(status);
CREATE INDEX idx_rooms_current_game ON public.rooms(current_game);
CREATE INDEX idx_rooms_created_at ON public.rooms(created_at DESC);
CREATE INDEX idx_rooms_last_activity ON public.rooms(last_activity DESC);
CREATE INDEX idx_rooms_status_activity ON public.rooms(status, last_activity DESC);

-- Room Members indexes
CREATE INDEX idx_room_members_room_id ON public.room_members(room_id);
CREATE INDEX idx_room_members_user_id ON public.room_members(user_id);
CREATE INDEX idx_room_members_is_connected ON public.room_members(is_connected);
CREATE INDEX idx_room_members_current_location ON public.room_members(current_location);
CREATE INDEX idx_room_members_in_game ON public.room_members(in_game);
CREATE INDEX idx_room_members_location_connected ON public.room_members(current_location, is_connected) WHERE is_connected = true;
CREATE INDEX idx_room_members_socket_id ON public.room_members(socket_id) WHERE socket_id IS NOT NULL;

-- Player Sessions indexes
CREATE INDEX idx_player_sessions_token ON public.player_sessions(session_token);
CREATE INDEX idx_player_sessions_user ON public.player_sessions(user_id);
CREATE INDEX idx_player_sessions_room ON public.player_sessions(room_id);
CREATE INDEX idx_player_sessions_status ON public.player_sessions(status);
CREATE INDEX idx_player_sessions_expires ON public.player_sessions(expires_at);
CREATE INDEX idx_player_sessions_active ON public.player_sessions(user_id, status) WHERE status = 'active';

-- Player Status History indexes
CREATE INDEX idx_status_history_user ON public.player_status_history(user_id);
CREATE INDEX idx_status_history_room ON public.player_status_history(room_id);
CREATE INDEX idx_status_history_created ON public.player_status_history(created_at DESC);
CREATE INDEX idx_status_history_user_room_created ON public.player_status_history(user_id, room_id, created_at DESC);

-- Game States indexes
CREATE INDEX idx_game_states_room ON public.game_states(room_id);
CREATE INDEX idx_game_states_game ON public.game_states(game_name);
CREATE INDEX idx_game_states_version ON public.game_states(room_id, state_version DESC);
CREATE INDEX idx_game_states_created ON public.game_states(created_at DESC);

-- Room Events indexes
CREATE INDEX idx_room_events_room ON public.room_events(room_id);
CREATE INDEX idx_room_events_user ON public.room_events(user_id);
CREATE INDEX idx_room_events_type ON public.room_events(event_type);
CREATE INDEX idx_room_events_created ON public.room_events(created_at DESC);
CREATE INDEX idx_room_events_room_created ON public.room_events(room_id, created_at DESC);

-- API Keys indexes
CREATE INDEX idx_api_keys_hash ON public.api_keys(key_hash);
CREATE INDEX idx_api_keys_service ON public.api_keys(service_name);
CREATE INDEX idx_api_keys_game ON public.api_keys(game_id);
CREATE INDEX idx_api_keys_active ON public.api_keys(is_active) WHERE is_active = true;

-- API Requests indexes
CREATE INDEX idx_api_requests_api_key ON public.api_requests(api_key_id);
CREATE INDEX idx_api_requests_requested_at ON public.api_requests(requested_at DESC);
CREATE INDEX idx_api_requests_status ON public.api_requests(status_code);
CREATE INDEX idx_api_requests_endpoint ON public.api_requests(endpoint);

-- Game Sessions indexes
CREATE INDEX idx_game_sessions_room ON public.game_sessions(room_id);
CREATE INDEX idx_game_sessions_game ON public.game_sessions(game_id);
CREATE INDEX idx_game_sessions_status ON public.game_sessions(status);
CREATE INDEX idx_game_sessions_started ON public.game_sessions(started_at DESC);

-- Connection Metrics indexes
CREATE INDEX idx_connection_metrics_type ON public.connection_metrics(metric_type);
CREATE INDEX idx_connection_metrics_created ON public.connection_metrics(created_at DESC);
CREATE INDEX idx_connection_metrics_type_created ON public.connection_metrics(metric_type, created_at DESC);

-- =====================================================
-- VIEWS FOR COMMON QUERIES
-- =====================================================

-- Active Player Sessions view
CREATE OR REPLACE VIEW public.active_player_sessions AS
SELECT 
    ps.*,
    u.username,
    u.display_name,
    r.room_code,
    rm.role,
    rm.is_connected,
    rm.current_location,
    rm.in_game
FROM public.player_sessions ps
JOIN public.users u ON ps.user_id = u.id
LEFT JOIN public.rooms r ON ps.room_id = r.id
LEFT JOIN public.room_members rm ON ps.user_id = rm.user_id AND ps.room_id = rm.room_id
WHERE ps.status = 'active' AND ps.expires_at > NOW();

-- Room Status Summary view
CREATE OR REPLACE VIEW public.room_status_summary AS
SELECT 
    r.id,
    r.room_code,
    r.status as room_status,
    r.current_game,
    r.host_id,
    u.username as host_username,
    COUNT(rm.id) as total_members,
    COUNT(CASE WHEN rm.is_connected = true THEN 1 END) as connected_members,
    COUNT(CASE WHEN rm.current_location = 'game' THEN 1 END) as members_in_game,
    COUNT(CASE WHEN rm.current_location = 'lobby' THEN 1 END) as members_in_lobby,
    COUNT(CASE WHEN rm.current_location = 'disconnected' THEN 1 END) as members_disconnected,
    r.created_at,
    r.last_activity,
    EXTRACT(EPOCH FROM (NOW() - r.last_activity)) as seconds_since_activity
FROM public.rooms r
LEFT JOIN public.users u ON r.host_id = u.id
LEFT JOIN public.room_members rm ON r.id = rm.room_id
GROUP BY r.id, r.room_code, r.status, r.current_game, r.host_id, u.username, r.created_at, r.last_activity;

-- Player Status Overview view
CREATE OR REPLACE VIEW public.player_status_overview AS
SELECT 
    u.id as user_id,
    u.username,
    u.display_name,
    rm.room_id,
    r.room_code,
    rm.role,
    rm.is_connected,
    rm.current_location,
    rm.in_game,
    rm.last_ping,
    ps.session_token,
    ps.expires_at as session_expires,
    CASE 
        WHEN ps.expires_at > NOW() THEN 'valid'
        WHEN ps.expires_at IS NULL THEN 'none'
        ELSE 'expired'
    END as session_status
FROM public.users u
LEFT JOIN public.room_members rm ON u.id = rm.user_id
LEFT JOIN public.rooms r ON rm.room_id = r.id
LEFT JOIN public.player_sessions ps ON u.id = ps.user_id AND rm.room_id = ps.room_id AND ps.status = 'active'
WHERE rm.left_at IS NULL OR rm.left_at > NOW() - INTERVAL '1 hour';

-- Game Activity Summary view
CREATE OR REPLACE VIEW public.game_activity_summary AS
SELECT 
    g.id as game_id,
    g.name,
    g.display_name,
    COUNT(DISTINCT r.id) as total_rooms,
    COUNT(DISTINCT CASE WHEN r.status = 'in_game' THEN r.id END) as active_rooms,
    COUNT(DISTINCT rm.user_id) as total_players,
    COUNT(DISTINCT CASE WHEN rm.current_location = 'game' THEN rm.user_id END) as active_players,
    MAX(r.last_activity) as last_activity
FROM public.games g
LEFT JOIN public.rooms r ON g.id = r.current_game
LEFT JOIN public.room_members rm ON r.id = rm.room_id AND rm.is_connected = true
WHERE g.is_active = true
GROUP BY g.id, g.name, g.display_name;

-- =====================================================
-- FUNCTIONS FOR COMMON OPERATIONS
-- =====================================================

-- Function to cleanup expired sessions
CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete expired sessions
    DELETE FROM public.player_sessions 
    WHERE expires_at < NOW() OR status IN ('expired', 'revoked');
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Log cleanup metrics
    INSERT INTO public.connection_metrics (metric_type, metric_value, tags)
    VALUES ('sessions_cleaned', deleted_count, jsonb_build_object('source', 'cleanup_function', 'timestamp', NOW()));
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to update room activity
CREATE OR REPLACE FUNCTION public.update_room_activity(room_uuid UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.rooms 
    SET last_activity = NOW() 
    WHERE id = room_uuid;
END;
$$ LANGUAGE plpgsql;

-- Function to create room code
CREATE OR REPLACE FUNCTION public.generate_room_code()
RETURNS VARCHAR(6) AS $$
DECLARE
    chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    result VARCHAR(6) := '';
    i INTEGER;
BEGIN
    FOR i IN 1..6 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    
    -- Check if code already exists
    IF EXISTS (SELECT 1 FROM public.rooms WHERE room_code = result) THEN
        RETURN public.generate_room_code(); -- Recursively generate new code
    END IF;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to get or create user
CREATE OR REPLACE FUNCTION public.get_or_create_user(
    external_id TEXT,
    username_param TEXT,
    display_name_param TEXT DEFAULT NULL
)
RETURNS public.users AS $$
DECLARE
    existing_user public.users;
    new_user public.users;
BEGIN
    -- Try to find existing user by username
    SELECT * INTO existing_user 
    FROM public.users 
    WHERE username = username_param;
    
    IF FOUND THEN
        -- Update last seen
        UPDATE public.users 
        SET last_seen = NOW(),
            display_name = COALESCE(display_name_param, display_name)
        WHERE id = existing_user.id
        RETURNING * INTO existing_user;
        
        RETURN existing_user;
    END IF;
    
    -- Create new user
    INSERT INTO public.users (username, display_name, is_guest, metadata)
    VALUES (
        username_param,
        COALESCE(display_name_param, username_param),
        true,
        jsonb_build_object('external_id', external_id, 'created_via', 'api')
    )
    RETURNING * INTO new_user;
    
    RETURN new_user;
END;
$$ LANGUAGE plpgsql;

-- Function to log events
CREATE OR REPLACE FUNCTION public.log_event(
    room_uuid UUID,
    user_uuid UUID,
    event_type_param TEXT,
    event_data_param JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
    event_id UUID;
BEGIN
    INSERT INTO public.room_events (room_id, user_id, event_type, event_data)
    VALUES (room_uuid, user_uuid, event_type_param, event_data_param)
    RETURNING id INTO event_id;
    
    RETURN event_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGERS FOR AUTOMATIC UPDATES
-- =====================================================

-- Function for room activity trigger
CREATE OR REPLACE FUNCTION public.trigger_update_room_activity()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM public.update_room_activity(NEW.room_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function for user last seen trigger
CREATE OR REPLACE FUNCTION public.trigger_update_user_last_seen()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.users 
    SET last_seen = NOW() 
    WHERE id = NEW.user_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function for rooms updated_at trigger
CREATE OR REPLACE FUNCTION public.trigger_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS update_room_activity_trigger ON public.room_members;
CREATE TRIGGER update_room_activity_trigger
    AFTER INSERT OR UPDATE ON public.room_members
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_update_room_activity();

DROP TRIGGER IF EXISTS update_user_last_seen_trigger ON public.room_members;
CREATE TRIGGER update_user_last_seen_trigger
    AFTER INSERT OR UPDATE ON public.room_members
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_update_user_last_seen();

DROP TRIGGER IF EXISTS update_rooms_updated_at ON public.rooms;
CREATE TRIGGER update_rooms_updated_at
    BEFORE UPDATE ON public.rooms
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_update_updated_at();

DROP TRIGGER IF EXISTS update_games_updated_at ON public.games;
CREATE TRIGGER update_games_updated_at
    BEFORE UPDATE ON public.games
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_update_updated_at();

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_metrics ENABLE ROW LEVEL SECURITY;

-- Public read access for games
CREATE POLICY "Games are publicly readable" ON public.games
    FOR SELECT USING (is_active = true AND maintenance_mode = false);

-- Users can read their own data
CREATE POLICY "Users can view own profile" ON public.users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.users
    FOR UPDATE USING (auth.uid() = id);

-- Rooms policies
CREATE POLICY "Anyone can view public rooms" ON public.rooms
    FOR SELECT USING (is_public = true);

CREATE POLICY "Room members can view their rooms" ON public.rooms
    FOR SELECT USING (
        id IN (
            SELECT room_id FROM public.room_members 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Hosts can update their rooms" ON public.rooms
    FOR UPDATE USING (host_id = auth.uid());

CREATE POLICY "Anyone can create rooms" ON public.rooms
    FOR INSERT WITH CHECK (host_id = auth.uid());

-- Room members policies
CREATE POLICY "Room members can view room participants" ON public.room_members
    FOR SELECT USING (
        room_id IN (
            SELECT room_id FROM public.room_members 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can join rooms" ON public.room_members
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own membership" ON public.room_members
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Hosts can update room memberships" ON public.room_members
    FOR UPDATE USING (
        room_id IN (
            SELECT id FROM public.rooms 
            WHERE host_id = auth.uid()
        )
    );

-- Player sessions policies
CREATE POLICY "Users can view own sessions" ON public.player_sessions
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create own sessions" ON public.player_sessions
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own sessions" ON public.player_sessions
    FOR UPDATE USING (user_id = auth.uid());

-- Game states policies
CREATE POLICY "Room members can view game states" ON public.game_states
    FOR SELECT USING (
        room_id IN (
            SELECT room_id FROM public.room_members 
            WHERE user_id = auth.uid()
        )
    );

-- Admin-only policies for sensitive tables
CREATE POLICY "Admin only access" ON public.api_keys
    FOR ALL USING (
        auth.uid() IN (
            SELECT id FROM public.users 
            WHERE metadata->>'role' = 'admin'
        )
    );

CREATE POLICY "Admin only access" ON public.api_requests
    FOR ALL USING (
        auth.uid() IN (
            SELECT id FROM public.users 
            WHERE metadata->>'role' = 'admin'
        )
    );

CREATE POLICY "Admin only access" ON public.connection_metrics
    FOR ALL USING (
        auth.uid() IN (
            SELECT id FROM public.users 
            WHERE metadata->>'role' = 'admin'
        )
    );

-- =====================================================
-- INITIAL DATA SETUP
-- =====================================================

-- Insert default games
INSERT INTO public.games (id, name, display_name, description, base_url, is_external, min_players, max_players, is_active) VALUES
('ddf', 'Der dümmste fliegt', 'Der dümmste fliegt', 'Quiz game where the worst player gets eliminated each round', 'https://ddf-game.onrender.com', true, 2, 8, true),
('schooled', 'Schooled', 'School Quiz Game', 'Educational quiz game for students with various subjects', 'https://schoolquizgame.onrender.com', true, 2, 10, true),
('susd', 'SUS''D', 'SUS''D - Imposter Game', 'Find who''s acting suspicious in this social deduction game', 'https://susd-1.onrender.com', true, 4, 10, true)
ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    base_url = EXCLUDED.base_url,
    updated_at = NOW();

-- Insert connection metrics for migration tracking
INSERT INTO public.connection_metrics (metric_type, metric_value, tags) VALUES
('schema_created', 1, jsonb_build_object('version', '2.0', 'timestamp', NOW(), 'source', 'initial_setup'));

-- =====================================================
-- SCHEDULED TASKS SETUP
-- =====================================================

-- Schedule cleanup tasks (requires pg_cron extension)
-- Clean up expired sessions every hour
SELECT cron.schedule('cleanup-expired-sessions', '0 * * * *', 'SELECT public.cleanup_expired_sessions();');

-- Clean up old status history (keep last 30 days)
SELECT cron.schedule('cleanup-old-status-history', '0 2 * * *', 
    'DELETE FROM public.player_status_history WHERE created_at < NOW() - INTERVAL ''30 days'';');

-- Clean up old room events (keep last 7 days)
SELECT cron.schedule('cleanup-old-room-events', '0 3 * * *', 
    'DELETE FROM public.room_events WHERE created_at < NOW() - INTERVAL ''7 days'';');

-- Clean up old API requests (keep last 7 days)
SELECT cron.schedule('cleanup-old-api-requests', '0 4 * * *', 
    'DELETE FROM public.api_requests WHERE requested_at < NOW() - INTERVAL ''7 days'';');

-- Clean up old connection metrics (keep last 30 days)
SELECT cron.schedule('cleanup-old-metrics', '0 5 * * *', 
    'DELETE FROM public.connection_metrics WHERE created_at < NOW() - INTERVAL ''30 days'';');

-- Clean up abandoned rooms (inactive for 24+ hours)
SELECT cron.schedule('cleanup-abandoned-rooms', '0 6 * * *', 
    'UPDATE public.rooms SET status = ''abandoned'' WHERE last_activity < NOW() - INTERVAL ''24 hours'' AND status NOT IN (''abandoned'', ''finished'');');

-- =====================================================
-- REALTIME SUBSCRIPTIONS SETUP
-- =====================================================

-- Enable realtime for specific tables
ALTER publication supabase_realtime ADD TABLE public.rooms;
ALTER publication supabase_realtime ADD TABLE public.room_members;
ALTER publication supabase_realtime ADD TABLE public.player_sessions;
ALTER publication supabase_realtime ADD TABLE public.game_states;
ALTER publication supabase_realtime ADD TABLE public.room_events;

-- =====================================================
-- COMPLETION VERIFICATION
-- =====================================================

-- Verify all tables were created
DO $$
DECLARE
    table_count INTEGER;
    expected_tables TEXT[] := ARRAY[
        'users', 'games', 'rooms', 'room_members', 'player_sessions',
        'player_status_history', 'game_states', 'room_events', 'api_keys',
        'api_requests', 'game_sessions', 'connection_metrics'
    ];
    missing_tables TEXT[];
    current_table_name TEXT;
BEGIN
    -- Check each expected table
    FOREACH current_table_name IN ARRAY expected_tables LOOP
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables t WHERE t.table_name = current_table_name AND t.table_schema = 'public') THEN
            missing_tables := array_append(missing_tables, current_table_name);
        END IF;
    END LOOP;
    
    IF array_length(missing_tables, 1) > 0 THEN
        RAISE EXCEPTION 'Missing tables: %', array_to_string(missing_tables, ', ');
    END IF;
    
    -- Log successful completion
    INSERT INTO public.connection_metrics (metric_type, metric_value, tags) VALUES
    ('schema_setup_completed', 1, jsonb_build_object(
        'version', '2.0',
        'tables_created', array_length(expected_tables, 1),
        'timestamp', NOW(),
        'status', 'success'
    ));
    
    RAISE NOTICE 'GameBuddies V2 schema setup completed successfully!';
    RAISE NOTICE 'Created % tables with indexes, views, functions, and triggers.', array_length(expected_tables, 1);
END $$;

-- =====================================================
-- FINAL NOTES AND USAGE INSTRUCTIONS
-- =====================================================

/*
🎉 GAMEBUDDIES V2 SCHEMA SETUP COMPLETE!

This script has created:
- 12 core tables with proper relationships and constraints
- 50+ performance indexes for fast queries
- 4 views for common data access patterns
- 8 functions for common operations
- 6 triggers for automatic updates
- Row Level Security policies for data protection
- Scheduled cleanup tasks via pg_cron
- Real-time subscriptions for live updates
- Initial game data

NEXT STEPS:
1. Update your environment variables:
   - DATABASE_URL should point to this Supabase project
   - Add SUPABASE_URL and SUPABASE_ANON_KEY to your .env

2. Create API keys for external games:
   INSERT INTO public.api_keys (key_hash, service_name, name) VALUES
   ('your_hashed_api_key', 'ddf', 'DDF Game API Key');

3. Test the setup:
   - Try creating a room: SELECT public.generate_room_code();
   - Check views: SELECT * FROM public.room_status_summary;
   - Test functions: SELECT public.cleanup_expired_sessions();

4. Monitor your database:
   - Use the connection_metrics table for insights
   - Check the views for real-time status
   - Monitor scheduled task execution

For troubleshooting or questions, check the GameBuddies V2 documentation files.
*/