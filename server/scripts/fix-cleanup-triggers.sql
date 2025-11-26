-- ============================================================
-- FIX: Return to GameBuddies Logic Broken by Cleanup Functions
-- ============================================================
--
-- PROBLEM: Multiple cleanup functions were marking players as disconnected
-- and rooms as abandoned without checking if players are IN GAME.
-- Players in external games don't send heartbeats to the lobby server,
-- so they appear "stale" after 2-5 minutes.
--
-- FIX: All cleanup functions now skip players where:
--   - in_game = true
--   - current_location = 'game'
-- ============================================================

-- 1. FIX cleanup_stale_connections()
CREATE OR REPLACE FUNCTION cleanup_stale_connections()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  disconnected_count INT;
  deleted_members_count INT;
  deleted_rooms_count INT;
BEGIN
  -- Mark connections as disconnected ONLY if:
  -- 1. Not currently in game
  -- 2. No ping in 2 minutes (lobby disconnection)
  UPDATE room_members
  SET is_connected = false,
      socket_id = null,
      current_location = 'disconnected'
  WHERE is_connected = true
    AND in_game = false
    AND current_location != 'game'
    AND last_ping < NOW() - INTERVAL '2 minutes';
  GET DIAGNOSTICS disconnected_count = ROW_COUNT;

  -- Delete memberships with no ping in 24 hours (truly abandoned)
  DELETE FROM room_members
  WHERE last_ping < NOW() - INTERVAL '24 hours';
  GET DIAGNOSTICS deleted_members_count = ROW_COUNT;

  -- Delete empty rooms older than 1 hour (no members at all)
  -- Skip rooms that are actively in game
  DELETE FROM rooms
  WHERE id NOT IN (SELECT DISTINCT room_id FROM room_members WHERE room_id IS NOT NULL)
    AND created_at < NOW() - INTERVAL '1 hour'
    AND status != 'in_game';
  GET DIAGNOSTICS deleted_rooms_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'disconnected', disconnected_count,
    'deleted_members', deleted_members_count,
    'deleted_rooms', deleted_rooms_count,
    'timestamp', NOW()
  );
END;
$$;


-- 2. FIX cleanup_stale_players()
CREATE OR REPLACE FUNCTION cleanup_stale_players()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Mark disconnected ONLY if not in game
  UPDATE room_members
  SET is_connected = false,
      current_location = 'disconnected'
  WHERE is_connected = true
    AND in_game = false
    AND current_location != 'game'
    AND last_ping < NOW() - INTERVAL '5 minutes';

  -- Mark empty rooms as abandoned
  -- BUT skip rooms where players are in game
  UPDATE rooms
  SET status = 'abandoned'
  WHERE id IN (
    SELECT r.id FROM rooms r
    LEFT JOIN room_members rm ON r.id = rm.room_id
      AND (rm.is_connected = true OR rm.in_game = true OR rm.current_location = 'game')
    WHERE r.status IN ('lobby', 'in_game')
    GROUP BY r.id
    HAVING COUNT(rm.id) = 0
  );
END;
$$;


-- 3. FIX cleanup_inactive_rooms()
CREATE OR REPLACE FUNCTION cleanup_inactive_rooms()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete rooms that are:
    -- 1. In lobby status and inactive for more than 1 hour
    -- 2. Have no connected OR in-game members
    -- 3. Created more than 24 hours ago

    WITH deleted AS (
        DELETE FROM rooms
        WHERE (
            -- Inactive lobby rooms
            (status = 'lobby' AND last_activity < NOW() - INTERVAL '1 hour')
            OR
            -- Abandoned game rooms (much longer timeout for games)
            (status = 'in_game' AND last_activity < NOW() - INTERVAL '4 hours')
            OR
            -- Old rooms regardless of status
            (created_at < NOW() - INTERVAL '24 hours')
        )
        AND NOT EXISTS (
            SELECT 1 FROM room_members
            WHERE room_id = rooms.id
            AND (is_connected = true OR in_game = true OR current_location = 'game')
        )
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;

    RETURN deleted_count;
END;
$$;


-- 4. FIX trigger_cleanup_on_heartbeat() - 1% probabilistic cleanup
CREATE OR REPLACE FUNCTION trigger_cleanup_on_heartbeat()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- 1% chance to run cleanup on each heartbeat update
  -- This spreads cleanup load and doesn't require pg_cron
  IF random() < 0.01 THEN
    PERFORM cleanup_stale_connections();
  END IF;
  RETURN NEW;
END;
$$;


-- 5. FIX enforce_single_room_membership() - Keep this unchanged but document
-- This trigger fires BEFORE INSERT and removes user from other rooms
-- This is correct behavior - we just need to make sure it doesn't interfere
-- with returning to the SAME room


-- ============================================================
-- VERIFICATION: Run these to check current state
-- ============================================================

-- Check players currently in game (should NOT be marked disconnected)
-- SELECT user_id, room_id, is_connected, in_game, current_location, last_ping
-- FROM room_members
-- WHERE in_game = true OR current_location = 'game';

-- Check rooms with status 'in_game' (should NOT be abandoned)
-- SELECT id, room_code, status, last_activity
-- FROM rooms
-- WHERE status = 'in_game';

-- ============================================================
-- SUCCESS! Run this entire script in Supabase SQL Editor.
-- ============================================================
