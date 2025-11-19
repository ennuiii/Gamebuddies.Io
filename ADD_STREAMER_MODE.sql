-- Migration: Add streamer_mode feature to GameBuddies
-- Date: 2025-09-30
-- Description: Adds streamer mode functionality to hide room codes

-- Add streamer_mode column to rooms table
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS streamer_mode BOOLEAN DEFAULT FALSE;

-- Create index for faster queries on streamer mode rooms
CREATE INDEX IF NOT EXISTS idx_rooms_streamer_mode ON rooms(streamer_mode);

-- Add comment for documentation
COMMENT ON COLUMN rooms.streamer_mode IS 'When true, room code is hidden from non-host players and invite tokens must be used';