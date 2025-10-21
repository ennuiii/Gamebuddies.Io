-- =====================================================
-- Soft Delete Implementation
-- =====================================================
-- This migration adds soft delete functionality to rooms and users
-- allowing data recovery and better audit trails.
-- =====================================================

-- Add deleted_at column to rooms table
ALTER TABLE public.rooms
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add deleted_at column to users table
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add deleted_by column to track who deleted the record
ALTER TABLE public.rooms
ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.users(id) DEFAULT NULL;

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.users(id) DEFAULT NULL;

-- Create indexes on deleted_at for performance
CREATE INDEX IF NOT EXISTS idx_rooms_deleted_at
ON public.rooms(deleted_at)
WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_deleted_at
ON public.users(deleted_at)
WHERE deleted_at IS NOT NULL;

-- Create index for active (not deleted) rooms - most common query
CREATE INDEX IF NOT EXISTS idx_rooms_active
ON public.rooms(status, created_at DESC)
WHERE deleted_at IS NULL;

-- Create index for active users
CREATE INDEX IF NOT EXISTS idx_users_active
ON public.users(last_seen DESC)
WHERE deleted_at IS NULL;

-- Update existing views to exclude soft-deleted records
DROP VIEW IF EXISTS public.room_status_summary CASCADE;
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
WHERE r.deleted_at IS NULL  -- Exclude soft-deleted rooms
GROUP BY r.id, r.room_code, r.status, r.current_game, r.host_id, u.username, r.created_at, r.last_activity;

-- Function to soft delete a room
CREATE OR REPLACE FUNCTION public.soft_delete_room(
    room_uuid UUID,
    deleting_user_uuid UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE public.rooms
    SET
        deleted_at = NOW(),
        deleted_by = deleting_user_uuid,
        updated_at = NOW()
    WHERE id = room_uuid AND deleted_at IS NULL;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to soft delete a user
CREATE OR REPLACE FUNCTION public.soft_delete_user(
    user_uuid UUID,
    deleting_user_uuid UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE public.users
    SET
        deleted_at = NOW(),
        deleted_by = deleting_user_uuid
    WHERE id = user_uuid AND deleted_at IS NULL;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to restore a soft-deleted room
CREATE OR REPLACE FUNCTION public.restore_room(room_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE public.rooms
    SET
        deleted_at = NULL,
        deleted_by = NULL,
        updated_at = NOW()
    WHERE id = room_uuid AND deleted_at IS NOT NULL;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to restore a soft-deleted user
CREATE OR REPLACE FUNCTION public.restore_user(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE public.users
    SET
        deleted_at = NULL,
        deleted_by = NULL
    WHERE id = user_uuid AND deleted_at IS NOT NULL;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to permanently delete old soft-deleted records
CREATE OR REPLACE FUNCTION public.cleanup_soft_deleted()
RETURNS TABLE(
    rooms_deleted INTEGER,
    users_deleted INTEGER,
    total_deleted INTEGER
) AS $$
DECLARE
    v_rooms_deleted INTEGER := 0;
    v_users_deleted INTEGER := 0;
BEGIN
    -- Permanently delete rooms soft-deleted more than 90 days ago
    DELETE FROM public.rooms
    WHERE deleted_at < NOW() - INTERVAL '90 days';
    GET DIAGNOSTICS v_rooms_deleted = ROW_COUNT;

    -- Permanently delete guest users soft-deleted more than 1 year ago
    DELETE FROM public.users
    WHERE deleted_at < NOW() - INTERVAL '1 year'
    AND is_guest = true;
    GET DIAGNOSTICS v_users_deleted = ROW_COUNT;

    -- Return summary
    RETURN QUERY SELECT
        v_rooms_deleted,
        v_users_deleted,
        v_rooms_deleted + v_users_deleted;
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup of old soft-deleted records (monthly)
SELECT cron.schedule(
    'cleanup-soft-deleted-monthly',
    '0 3 1 * *',  -- First day of month at 3 AM
    'SELECT public.cleanup_soft_deleted();'
);

-- Update RLS policies to exclude soft-deleted records
DROP POLICY IF EXISTS "Anyone can view public rooms" ON public.rooms;
CREATE POLICY "Anyone can view public rooms" ON public.rooms
    FOR SELECT USING (is_public = true AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Room members can view their rooms" ON public.rooms;
CREATE POLICY "Room members can view their rooms" ON public.rooms
    FOR SELECT USING (
        deleted_at IS NULL AND
        id IN (
            SELECT room_id FROM public.room_members
            WHERE user_id = auth.uid()
        )
    );

-- Comments
COMMENT ON COLUMN public.rooms.deleted_at IS
'Timestamp when room was soft-deleted. NULL means active.';

COMMENT ON COLUMN public.users.deleted_at IS
'Timestamp when user was soft-deleted. NULL means active.';

COMMENT ON FUNCTION public.soft_delete_room IS
'Soft delete a room instead of permanently removing it';

COMMENT ON FUNCTION public.restore_room IS
'Restore a soft-deleted room';

COMMENT ON FUNCTION public.cleanup_soft_deleted IS
'Permanently delete soft-deleted records older than retention period';
