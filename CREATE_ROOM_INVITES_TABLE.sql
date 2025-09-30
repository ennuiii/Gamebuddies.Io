-- Migration: Create room_invites table for streamer mode invite tokens
-- Date: 2025-09-30
-- Description: Adds invite token system for secure room joining in streamer mode

-- Create room_invites table
CREATE TABLE IF NOT EXISTS room_invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  created_by UUID REFERENCES users(id),
  uses_remaining INTEGER DEFAULT NULL, -- NULL = unlimited uses
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_room_invites_token ON room_invites(token);
CREATE INDEX IF NOT EXISTS idx_room_invites_room_id ON room_invites(room_id);
CREATE INDEX IF NOT EXISTS idx_room_invites_expires_at ON room_invites(expires_at);

-- Add comments for documentation
COMMENT ON TABLE room_invites IS 'Invite tokens for joining rooms in streamer mode';
COMMENT ON COLUMN room_invites.token IS 'Unique invite token used in URLs';
COMMENT ON COLUMN room_invites.uses_remaining IS 'Number of remaining uses (NULL = unlimited)';
COMMENT ON COLUMN room_invites.expires_at IS 'Expiration timestamp for the invite';

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_room_invites_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_room_invites_updated_at
  BEFORE UPDATE ON room_invites
  FOR EACH ROW
  EXECUTE FUNCTION update_room_invites_updated_at();