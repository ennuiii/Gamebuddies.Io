-- Add custom_lobby_name field to allow players to use different names in each lobby
-- This allows users to have personalized display names per room

ALTER TABLE public.room_members
ADD COLUMN IF NOT EXISTS custom_lobby_name VARCHAR(50);

COMMENT ON COLUMN public.room_members.custom_lobby_name IS 'Optional custom display name for this player in this specific lobby (overrides display_name and username)';
