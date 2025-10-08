-- Migration: Add icon column to games table and populate with current emojis
-- This allows games to be managed purely through the database

-- Add icon column
ALTER TABLE games ADD COLUMN IF NOT EXISTS icon VARCHAR(10) DEFAULT '🎮';

-- Update existing games with their current icons from the hardcoded list
UPDATE games SET icon = '🎱' WHERE id = 'bingo';
UPDATE games SET icon = '🔎' WHERE id = 'cluescale';
UPDATE games SET icon = '🎮' WHERE id = 'ddf';
UPDATE games SET icon = '🎓' WHERE id = 'schooled';
UPDATE games SET icon = '🔍' WHERE id = 'susd';

-- Remove the hardcoded game type constraint on rooms table
-- This allows any game in the games table to be used
ALTER TABLE rooms DROP CONSTRAINT IF EXISTS valid_game;

-- Add a foreign key constraint instead (optional but recommended)
-- This ensures rooms can only reference valid games
DO $$
BEGIN
  -- Only add constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_rooms_current_game'
  ) THEN
    ALTER TABLE rooms
      ADD CONSTRAINT fk_rooms_current_game
      FOREIGN KEY (current_game)
      REFERENCES games(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Create index for faster game lookups
CREATE INDEX IF NOT EXISTS idx_games_active ON games(is_active, maintenance_mode);

-- Comment for future reference
COMMENT ON COLUMN games.icon IS 'Emoji icon displayed in the game picker UI';
