-- Migration: Create game_sessions table for streamer mode session tokens
-- Date: 2025-09-30
-- Description: Adds session token system to hide room codes from external game URLs

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create game_sessions table
CREATE TABLE IF NOT EXISTS game_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_token TEXT UNIQUE NOT NULL,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  room_code TEXT NOT NULL,
  player_id UUID REFERENCES users(id) ON DELETE SET NULL,
  game_type TEXT NOT NULL,
  streamer_mode BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '3 hours',
  last_accessed TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_game_sessions_token ON game_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_game_sessions_room_id ON game_sessions(room_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_player_id ON game_sessions(player_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_expires_at ON game_sessions(expires_at);

-- Add comments for documentation
COMMENT ON TABLE game_sessions IS 'Session tokens for external games to prevent room code exposure in URLs';
COMMENT ON COLUMN game_sessions.session_token IS 'Unique session token passed to external games instead of room code';
COMMENT ON COLUMN game_sessions.room_code IS 'The actual room code (only exposed via API, not in URLs)';
COMMENT ON COLUMN game_sessions.streamer_mode IS 'Whether this session is for a streamer mode room';
COMMENT ON COLUMN game_sessions.metadata IS 'Additional session data (player name, role, etc.)';
COMMENT ON COLUMN game_sessions.expires_at IS 'Session expiration timestamp (default 3 hours)';

-- Create trigger to update last_accessed timestamp
CREATE OR REPLACE FUNCTION update_game_sessions_last_accessed()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_accessed = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists, then create it
DROP TRIGGER IF EXISTS trigger_update_game_sessions_last_accessed ON game_sessions;

CREATE TRIGGER trigger_update_game_sessions_last_accessed
  BEFORE UPDATE ON game_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_game_sessions_last_accessed();

-- Create function to cleanup expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_game_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM game_sessions
  WHERE expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_game_sessions IS 'Deletes expired game sessions and returns count of deleted rows';