-- GameBuddies V2 Database Schema
-- Complete rework with clean architecture
-- Created: 2024

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Drop existing tables if doing a complete rework (be careful in production!)
-- DROP SCHEMA public CASCADE;
-- CREATE SCHEMA public;

-- =====================================================
-- USERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) NOT NULL,
    display_name VARCHAR(100),
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_guest BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}',
    
    -- Indexes
    CONSTRAINT users_username_unique UNIQUE (username)
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_last_seen ON users(last_seen);

-- =====================================================
-- ROOMS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_code VARCHAR(6) NOT NULL UNIQUE,
    host_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Room Status: lobby, in_game, returning
    status VARCHAR(20) NOT NULL DEFAULT 'lobby',
    
    -- Game Information
    current_game VARCHAR(50), -- null when in lobby, 'ddf', 'schooled', etc when in game
    game_started_at TIMESTAMP WITH TIME ZONE,
    game_settings JSONB DEFAULT '{}',
    
    -- Room Settings
    max_players INTEGER DEFAULT 10 CHECK (max_players >= 2 AND max_players <= 50),
    is_public BOOLEAN DEFAULT true,
    allow_spectators BOOLEAN DEFAULT false,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    -- Constraints
    CONSTRAINT valid_status CHECK (status IN ('lobby', 'in_game', 'returning')),
    CONSTRAINT valid_game CHECK (current_game IN (NULL, 'ddf', 'schooled', 'chess', 'poker', 'trivia', 'custom'))
);

CREATE INDEX idx_rooms_room_code ON rooms(room_code);
CREATE INDEX idx_rooms_status ON rooms(status);
CREATE INDEX idx_rooms_host_id ON rooms(host_id);
CREATE INDEX idx_rooms_last_activity ON rooms(last_activity);

-- =====================================================
-- ROOM MEMBERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS room_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Role: host, player, spectator
    role VARCHAR(20) NOT NULL DEFAULT 'player',
    
    -- Connection Status
    is_connected BOOLEAN DEFAULT true,
    last_ping TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    socket_id VARCHAR(100),
    
    -- Game State
    is_ready BOOLEAN DEFAULT false,
    in_game BOOLEAN DEFAULT false,
    game_data JSONB DEFAULT '{}', -- Store game-specific player data
    
    -- Timestamps
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT valid_role CHECK (role IN ('host', 'player', 'spectator')),
    CONSTRAINT unique_room_member UNIQUE (room_id, user_id)
);

CREATE INDEX idx_room_members_room_id ON room_members(room_id);
CREATE INDEX idx_room_members_user_id ON room_members(user_id);
CREATE INDEX idx_room_members_connected ON room_members(room_id, is_connected);

-- =====================================================
-- GAMES TABLE (Available games registry)
-- =====================================================
CREATE TABLE IF NOT EXISTS games (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    thumbnail_url TEXT,
    
    -- Game URLs
    base_url TEXT NOT NULL, -- e.g., '/ddf' for internal, 'https://ddf.example.com' for external
    is_external BOOLEAN DEFAULT false,
    requires_api_key BOOLEAN DEFAULT false,
    
    -- Game Requirements
    min_players INTEGER DEFAULT 2,
    max_players INTEGER DEFAULT 10,
    supports_spectators BOOLEAN DEFAULT false,
    
    -- Settings Schema
    settings_schema JSONB DEFAULT '{}', -- JSON schema for game-specific settings
    default_settings JSONB DEFAULT '{}',
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    maintenance_mode BOOLEAN DEFAULT false,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default games
INSERT INTO games (id, name, display_name, description, base_url, min_players, max_players) VALUES
('ddf', 'Der Dümmste Fliegt', 'Der Dümmste Fliegt', 'A fun trivia game where the dumbest flies!', '/ddf', 2, 10),
('schooled', 'Schooled', 'Schooled', 'Test your knowledge in this educational game!', '/schooled', 2, 8)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- ROOM EVENTS TABLE (Audit log)
-- =====================================================
CREATE TABLE IF NOT EXISTS room_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Event Types: room_created, member_joined, member_left, game_selected, 
    -- game_started, game_ended, host_changed, room_closed, etc.
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_room_events_room_id ON room_events(room_id);
CREATE INDEX idx_room_events_created_at ON room_events(created_at);

-- =====================================================
-- GAME SESSIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS game_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    game_id VARCHAR(50) NOT NULL REFERENCES games(id),
    
    -- Session Status: active, completed, abandoned
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    
    -- Participants snapshot at game start
    participants JSONB NOT NULL DEFAULT '[]',
    
    -- Game State
    game_state JSONB DEFAULT '{}',
    game_result JSONB DEFAULT '{}',
    
    -- Timestamps
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    CONSTRAINT valid_session_status CHECK (status IN ('active', 'completed', 'abandoned'))
);

CREATE INDEX idx_game_sessions_room_id ON game_sessions(room_id);
CREATE INDEX idx_game_sessions_status ON game_sessions(status);

-- =====================================================
-- API KEYS TABLE (For external game integrations)
-- =====================================================
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_hash VARCHAR(255) NOT NULL UNIQUE, -- Store bcrypt hash of the key
    game_id VARCHAR(50) REFERENCES games(id) ON DELETE CASCADE,
    
    -- Key Info
    name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Permissions
    permissions JSONB DEFAULT '["read", "write"]',
    rate_limit INTEGER DEFAULT 1000, -- requests per hour
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    last_used TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_game_id ON api_keys(game_id);

-- =====================================================
-- API REQUESTS LOG TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS api_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    
    -- Request Info
    method VARCHAR(10) NOT NULL,
    endpoint TEXT NOT NULL,
    status_code INTEGER,
    
    -- Timing
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    response_time_ms INTEGER,
    
    -- Metadata
    ip_address INET,
    user_agent TEXT,
    request_data JSONB DEFAULT '{}',
    response_data JSONB DEFAULT '{}',
    error_message TEXT
);

CREATE INDEX idx_api_requests_api_key_id ON api_requests(api_key_id);
CREATE INDEX idx_api_requests_requested_at ON api_requests(requested_at);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to generate unique room codes
CREATE OR REPLACE FUNCTION generate_room_code()
RETURNS VARCHAR(6) AS $$
DECLARE
    code VARCHAR(6);
    exists BOOLEAN;
BEGIN
    LOOP
        -- Generate a 6-character code using uppercase letters and numbers
        code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
        
        -- Check if code already exists
        EXISTS (SELECT 1 FROM rooms WHERE room_code = code) INTO exists;
        
        IF NOT exists THEN
            RETURN code;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up inactive rooms
CREATE OR REPLACE FUNCTION cleanup_inactive_rooms()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete rooms that are:
    -- 1. In lobby status and inactive for more than 1 hour
    -- 2. Have no connected members
    -- 3. Created more than 24 hours ago
    
    WITH deleted AS (
        DELETE FROM rooms
        WHERE (
            -- Inactive lobby rooms
            (status = 'lobby' AND last_activity < NOW() - INTERVAL '1 hour')
            OR
            -- Abandoned game rooms
            (status = 'in_game' AND last_activity < NOW() - INTERVAL '2 hours')
            OR
            -- Old rooms regardless of status
            (created_at < NOW() - INTERVAL '24 hours')
        )
        AND NOT EXISTS (
            SELECT 1 FROM room_members 
            WHERE room_id = rooms.id 
            AND is_connected = true
        )
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to update room activity timestamp
CREATE OR REPLACE FUNCTION update_room_activity()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE rooms 
    SET last_activity = CURRENT_TIMESTAMP 
    WHERE id = NEW.room_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Update room activity on member actions
CREATE TRIGGER trigger_room_activity_on_member_change
AFTER INSERT OR UPDATE ON room_members
FOR EACH ROW
EXECUTE FUNCTION update_room_activity();

-- Update room activity on events
CREATE TRIGGER trigger_room_activity_on_event
AFTER INSERT ON room_events
FOR EACH ROW
EXECUTE FUNCTION update_room_activity();

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_rooms_updated_at
BEFORE UPDATE ON rooms
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_games_updated_at
BEFORE UPDATE ON games
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- VIEWS
-- =====================================================

-- Active rooms view for lobby browser
CREATE OR REPLACE VIEW active_rooms AS
SELECT 
    r.id,
    r.room_code,
    r.status,
    r.current_game,
    r.max_players,
    r.is_public,
    r.created_at,
    r.last_activity,
    u.username as host_username,
    u.display_name as host_display_name,
    COUNT(DISTINCT rm.user_id) FILTER (WHERE rm.is_connected = true) as current_players,
    COUNT(DISTINCT rm.user_id) FILTER (WHERE rm.role = 'spectator' AND rm.is_connected = true) as spectator_count,
    COALESCE(
        json_agg(
            json_build_object(
                'id', rm.user_id,
                'username', mu.username,
                'display_name', mu.display_name,
                'role', rm.role,
                'is_ready', rm.is_ready
            ) 
            ORDER BY rm.joined_at
        ) FILTER (WHERE rm.is_connected = true), 
        '[]'::json
    ) as players
FROM rooms r
JOIN users u ON r.host_id = u.id
LEFT JOIN room_members rm ON r.id = rm.room_id
LEFT JOIN users mu ON rm.user_id = mu.id
WHERE r.is_public = true
  AND r.status IN ('lobby', 'in_game')
GROUP BY r.id, u.id
ORDER BY r.created_at DESC;

-- User statistics view
CREATE OR REPLACE VIEW user_stats AS
SELECT 
    u.id,
    u.username,
    u.display_name,
    COUNT(DISTINCT r.id) as rooms_created,
    COUNT(DISTINCT rm.room_id) as rooms_joined,
    COUNT(DISTINCT gs.id) as games_played,
    COUNT(DISTINCT gs.id) FILTER (WHERE gs.status = 'completed') as games_completed,
    u.created_at,
    u.last_seen
FROM users u
LEFT JOIN rooms r ON u.id = r.host_id
LEFT JOIN room_members rm ON u.id = rm.user_id
LEFT JOIN game_sessions gs ON rm.room_id = gs.room_id 
    AND gs.participants::jsonb @> json_build_array(json_build_object('user_id', u.id::text))::jsonb
GROUP BY u.id;

-- =====================================================
-- ROW LEVEL SECURITY (RLS) - Optional but recommended
-- =====================================================

-- Enable RLS on tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;

-- Create policies (example - adjust based on your auth system)
-- These are examples for anonymous access - modify for your auth system

-- Users can view all users
CREATE POLICY "Users are viewable by everyone" ON users
    FOR SELECT USING (true);

-- Anyone can create a user (for guest accounts)
CREATE POLICY "Anyone can create a user" ON users
    FOR INSERT WITH CHECK (true);

-- Rooms are viewable by everyone
CREATE POLICY "Public rooms are viewable by everyone" ON rooms
    FOR SELECT USING (is_public = true OR id IN (
        SELECT room_id FROM room_members WHERE user_id = current_user_id()
    ));

-- Room members are viewable by room participants
CREATE POLICY "Room members are viewable by room participants" ON room_members
    FOR SELECT USING (room_id IN (
        SELECT room_id FROM room_members WHERE user_id = current_user_id()
    ));

-- Note: current_user_id() would need to be implemented based on your auth system

-- =====================================================
-- INITIAL DATA & SETTINGS
-- =====================================================

-- Create a system user for automated actions
INSERT INTO users (id, username, display_name, is_guest)
VALUES ('00000000-0000-0000-0000-000000000000', 'system', 'System', false)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- GRANTS (Adjust based on your Supabase setup)
-- =====================================================

-- Grant permissions to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Grant permissions to anonymous users (for guest access)
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT INSERT ON users, rooms, room_members, room_events TO anon;
GRANT UPDATE ON rooms, room_members TO anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon; 