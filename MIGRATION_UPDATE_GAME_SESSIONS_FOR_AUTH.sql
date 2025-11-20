-- =====================================================
-- MIGRATION: Update game_sessions table for session token authentication
-- Date: 2025-01-19
-- Description: Replace old game_sessions structure with new session token authentication system
-- =====================================================

-- IMPORTANT: Run this migration to enable secure session token authentication
-- This replaces the old game_sessions table with the new structure

-- Step 1: Drop old game_sessions table (backup first if you have important data!)
DROP TABLE IF EXISTS public.game_sessions CASCADE;

-- Step 2: Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Step 3: Create new game_sessions table for session token authentication
CREATE TABLE public.game_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_token TEXT UNIQUE NOT NULL,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  room_code TEXT NOT NULL,
  player_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  game_type TEXT NOT NULL,
  streamer_mode BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '3 hours',
  last_accessed TIMESTAMPTZ DEFAULT NOW()
);

-- Step 4: Create indexes for better query performance
CREATE INDEX idx_game_sessions_token ON public.game_sessions(session_token);
CREATE INDEX idx_game_sessions_room_id ON public.game_sessions(room_id);
CREATE INDEX idx_game_sessions_player_id ON public.game_sessions(player_id);
CREATE INDEX idx_game_sessions_expires_at ON public.game_sessions(expires_at);

-- Step 5: Add comments for documentation
COMMENT ON TABLE public.game_sessions IS 'Session tokens for secure game authentication - prevents URL tampering';
COMMENT ON COLUMN public.game_sessions.session_token IS 'Cryptographically random token passed to games (32 bytes hex)';
COMMENT ON COLUMN public.game_sessions.room_code IS 'The actual room code (only exposed via API, not in URLs)';
COMMENT ON COLUMN public.game_sessions.player_id IS 'User ID of the player this session belongs to';
COMMENT ON COLUMN public.game_sessions.game_type IS 'Type of game (fibbage, drawful, etc.)';
COMMENT ON COLUMN public.game_sessions.streamer_mode IS 'Whether this session is for a streamer mode room';
COMMENT ON COLUMN public.game_sessions.metadata IS 'Session metadata (player name, premium tier, avatar, etc.)';
COMMENT ON COLUMN public.game_sessions.expires_at IS 'Session expiration timestamp (default 3 hours from creation)';
COMMENT ON COLUMN public.game_sessions.last_accessed IS 'Last time this session was accessed via API';

-- Step 6: Create trigger to update last_accessed timestamp automatically
CREATE OR REPLACE FUNCTION update_game_sessions_last_accessed()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_accessed = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_game_sessions_last_accessed ON public.game_sessions;

CREATE TRIGGER trigger_update_game_sessions_last_accessed
  BEFORE UPDATE ON public.game_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_game_sessions_last_accessed();

-- Step 7: Create function to cleanup expired sessions (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_game_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.game_sessions
  WHERE expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RAISE NOTICE 'Cleaned up % expired game sessions', deleted_count;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_game_sessions IS 'Deletes expired game sessions and returns count of deleted rows';

-- Step 8: Enable Row Level Security (RLS)
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;

-- Step 9: Create RLS policy - allow admin access (server uses service role)
-- Games don't directly access this table - they call the API endpoint
CREATE POLICY "Allow service role full access to game_sessions"
  ON public.game_sessions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Step 10: Grant permissions
GRANT ALL ON public.game_sessions TO authenticated;
GRANT ALL ON public.game_sessions TO service_role;

-- =====================================================
-- Migration complete!
-- =====================================================

-- To verify the migration:
-- SELECT table_name, column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'game_sessions'
-- ORDER BY ordinal_position;

-- To cleanup expired sessions manually:
-- SELECT cleanup_expired_game_sessions();
