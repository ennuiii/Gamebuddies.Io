-- GameBuddies V2 Database Migration
-- Adds enhanced tables for session management and status tracking

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Player Sessions Table
CREATE TABLE IF NOT EXISTS player_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  session_token VARCHAR(64) NOT NULL UNIQUE,
  socket_id VARCHAR(128),
  status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours'),
  
  -- Indexes
  CONSTRAINT unique_user_room_session UNIQUE(user_id, room_id)
);

-- Indexes for player_sessions
CREATE INDEX IF NOT EXISTS idx_player_sessions_token ON player_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_player_sessions_user ON player_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_player_sessions_room ON player_sessions(room_id);
CREATE INDEX IF NOT EXISTS idx_player_sessions_status ON player_sessions(status);
CREATE INDEX IF NOT EXISTS idx_player_sessions_expires ON player_sessions(expires_at);

-- Player Status History Table
CREATE TABLE IF NOT EXISTS player_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  old_location VARCHAR(16),
  new_location VARCHAR(16) NOT NULL CHECK (new_location IN ('lobby', 'game', 'disconnected')),
  old_status VARCHAR(16),
  new_status VARCHAR(16) NOT NULL,
  reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for player_status_history
CREATE INDEX IF NOT EXISTS idx_status_history_user ON player_status_history(user_id);
CREATE INDEX IF NOT EXISTS idx_status_history_room ON player_status_history(room_id);
CREATE INDEX IF NOT EXISTS idx_status_history_created ON player_status_history(created_at DESC);

-- Game States table enhancement (if not exists)
CREATE TABLE IF NOT EXISTS game_states (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  game_name VARCHAR(50) NOT NULL,
  state_data JSONB NOT NULL DEFAULT '{}',
  state_version INTEGER NOT NULL DEFAULT 1,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

-- Indexes for game_states
CREATE INDEX IF NOT EXISTS idx_game_states_room ON game_states(room_id);
CREATE INDEX IF NOT EXISTS idx_game_states_game ON game_states(game_name);
CREATE INDEX IF NOT EXISTS idx_game_states_version ON game_states(room_id, state_version DESC);

-- Enhanced room_members table updates
-- Add new columns if they don't exist
DO $$ 
BEGIN
    -- Check and add current_location column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'room_members' AND column_name = 'current_location') THEN
        ALTER TABLE room_members ADD COLUMN current_location VARCHAR(16) DEFAULT 'lobby' 
        CHECK (current_location IN ('lobby', 'game', 'disconnected'));
    END IF;
    
    -- Check and add game_data column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'room_members' AND column_name = 'game_data') THEN
        ALTER TABLE room_members ADD COLUMN game_data JSONB DEFAULT '{}';
    END IF;
END $$;

-- Enhanced rooms table updates
-- Add metadata column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'rooms' AND column_name = 'metadata') THEN
        ALTER TABLE rooms ADD COLUMN metadata JSONB DEFAULT '{}';
    END IF;
    
    -- Add last_activity column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'rooms' AND column_name = 'last_activity') THEN
        ALTER TABLE rooms ADD COLUMN last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
    
    -- Add game_settings column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'rooms' AND column_name = 'game_settings') THEN
        ALTER TABLE rooms ADD COLUMN game_settings JSONB DEFAULT '{}';
    END IF;
END $$;

-- Update room status constraints to include new statuses
ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_status_check;
ALTER TABLE rooms ADD CONSTRAINT rooms_status_check 
CHECK (status IN ('lobby', 'in_game', 'returning', 'abandoned', 'finished'));

-- Room Events table (for audit trail)
CREATE TABLE IF NOT EXISTS room_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for room_events
CREATE INDEX IF NOT EXISTS idx_room_events_room ON room_events(room_id);
CREATE INDEX IF NOT EXISTS idx_room_events_type ON room_events(event_type);
CREATE INDEX IF NOT EXISTS idx_room_events_created ON room_events(created_at DESC);

-- Connection Metrics table (for monitoring)
CREATE TABLE IF NOT EXISTS connection_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  metric_type VARCHAR(32) NOT NULL,
  metric_value NUMERIC NOT NULL,
  tags JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for connection_metrics
CREATE INDEX IF NOT EXISTS idx_connection_metrics_type_created ON connection_metrics(metric_type, created_at DESC);

-- Views for common queries
CREATE OR REPLACE VIEW active_player_sessions AS
SELECT 
    ps.*,
    u.username,
    u.display_name,
    r.room_code,
    rm.role,
    rm.is_connected,
    rm.current_location,
    rm.in_game
FROM player_sessions ps
JOIN users u ON ps.user_id = u.id
LEFT JOIN rooms r ON ps.room_id = r.id
LEFT JOIN room_members rm ON ps.user_id = rm.user_id AND ps.room_id = rm.room_id
WHERE ps.status = 'active' AND ps.expires_at > NOW();

CREATE OR REPLACE VIEW room_status_summary AS
SELECT 
    r.id,
    r.room_code,
    r.status as room_status,
    r.current_game,
    r.host_id,
    COUNT(rm.id) as total_members,
    COUNT(CASE WHEN rm.is_connected = true THEN 1 END) as connected_members,
    COUNT(CASE WHEN rm.current_location = 'game' THEN 1 END) as members_in_game,
    COUNT(CASE WHEN rm.current_location = 'lobby' THEN 1 END) as members_in_lobby,
    r.created_at,
    r.last_activity
FROM rooms r
LEFT JOIN room_members rm ON r.id = rm.room_id
GROUP BY r.id, r.room_code, r.status, r.current_game, r.host_id, r.created_at, r.last_activity;

-- Functions for common operations
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM player_sessions 
    WHERE expires_at < NOW() OR status IN ('expired', 'revoked');
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    INSERT INTO connection_metrics (metric_type, metric_value, tags)
    VALUES ('sessions_cleaned', deleted_count, '{"source": "cleanup_function"}');
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_room_activity(room_uuid UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE rooms 
    SET last_activity = NOW() 
    WHERE id = room_uuid;
END;
$$ LANGUAGE plpgsql;

-- Triggers for automatic updates
CREATE OR REPLACE FUNCTION trigger_update_room_activity()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM update_room_activity(NEW.room_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if it doesn't exist
DROP TRIGGER IF EXISTS update_room_activity_trigger ON room_members;
CREATE TRIGGER update_room_activity_trigger
    AFTER INSERT OR UPDATE ON room_members
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_room_activity();

-- Insert initial data for testing/migration
INSERT INTO connection_metrics (metric_type, metric_value, tags)
VALUES ('migration_completed', 1, '{"version": "2.0", "timestamp": "' || NOW() || '"}')
ON CONFLICT DO NOTHING;

-- Create indexes for performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_room_members_location_connected 
ON room_members(current_location, is_connected) WHERE is_connected = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rooms_status_activity 
ON rooms(status, last_activity DESC);

-- Comments for documentation
COMMENT ON TABLE player_sessions IS 'Stores player session tokens for seamless reconnection and state recovery';
COMMENT ON TABLE player_status_history IS 'Audit trail of player status changes for debugging and analytics';
COMMENT ON TABLE connection_metrics IS 'System metrics for monitoring connection health and performance';
COMMENT ON VIEW active_player_sessions IS 'Active player sessions with user and room information';
COMMENT ON VIEW room_status_summary IS 'Summary of room status with member counts and locations';

-- Grant permissions (adjust as needed for your setup)
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO your_app_user;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO your_app_user;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO your_app_user;