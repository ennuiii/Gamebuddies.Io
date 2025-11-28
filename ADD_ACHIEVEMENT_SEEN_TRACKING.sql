-- Migration: Add seen_at tracking to user_achievements
-- Purpose: Track which achievements users have seen (for notification bell)
-- Run this in Supabase SQL Editor

-- 1. Add seen_at column to user_achievements
ALTER TABLE user_achievements
ADD COLUMN IF NOT EXISTS seen_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- 2. Create index for efficient unseen achievement queries
CREATE INDEX IF NOT EXISTS idx_user_achievements_unseen
ON user_achievements(user_id, earned_at)
WHERE seen_at IS NULL AND earned_at IS NOT NULL;

-- 3. Mark all existing achievements as seen (so users don't get flooded with old notifications)
UPDATE user_achievements
SET seen_at = earned_at
WHERE earned_at IS NOT NULL AND seen_at IS NULL;

-- Verification query
SELECT
  'user_achievements' as table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'user_achievements' AND column_name = 'seen_at';
