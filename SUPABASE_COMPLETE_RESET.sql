-- =====================================================
-- GameBuddies Supabase Complete Database Reset
-- =====================================================
-- WARNING: This will DELETE ALL DATA in your database!
-- Only run this if you want to completely start fresh.
-- Make sure you have backups if you need to preserve any data.

-- =====================================================
-- STEP 1: DISABLE ALL TRIGGERS AND CONSTRAINTS
-- =====================================================
-- This prevents foreign key constraint errors during deletion

SET session_replication_role = replica;

-- =====================================================
-- STEP 2: DROP ALL VIEWS FIRST
-- =====================================================
-- Views depend on tables, so drop them first

DROP VIEW IF EXISTS public.active_player_sessions CASCADE;
DROP VIEW IF EXISTS public.room_status_summary CASCADE;
DROP VIEW IF EXISTS public.player_status_overview CASCADE;
DROP VIEW IF EXISTS public.game_activity_summary CASCADE;

-- =====================================================
-- STEP 3: DROP ALL FUNCTIONS
-- =====================================================
-- Drop all custom functions

DROP FUNCTION IF EXISTS public.cleanup_expired_sessions() CASCADE;
DROP FUNCTION IF EXISTS public.update_room_activity(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.generate_room_code() CASCADE;
DROP FUNCTION IF EXISTS public.get_or_create_user(TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.log_event(UUID, UUID, TEXT, JSONB) CASCADE;
DROP FUNCTION IF EXISTS public.trigger_update_room_activity() CASCADE;
DROP FUNCTION IF EXISTS public.trigger_update_user_last_seen() CASCADE;
DROP FUNCTION IF EXISTS public.trigger_update_updated_at() CASCADE;

-- =====================================================
-- STEP 4: DROP ALL SCHEDULED JOBS
-- =====================================================
-- Remove all cron jobs if they exist

DO $$
BEGIN
    -- Drop cron jobs if pg_cron is available
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule('cleanup-expired-sessions');
        PERFORM cron.unschedule('cleanup-old-status-history');
        PERFORM cron.unschedule('cleanup-old-room-events');
        PERFORM cron.unschedule('cleanup-old-api-requests');
        PERFORM cron.unschedule('cleanup-old-metrics');
        PERFORM cron.unschedule('cleanup-abandoned-rooms');
    END IF;
EXCEPTION
    WHEN others THEN
        -- Ignore errors if cron jobs don't exist
        NULL;
END $$;

-- =====================================================
-- STEP 5: DROP ALL TABLES WITH CASCADE
-- =====================================================
-- This will remove all tables and their dependencies

-- Drop in reverse dependency order to avoid foreign key issues
DROP TABLE IF EXISTS public.api_requests CASCADE;
DROP TABLE IF EXISTS public.connection_metrics CASCADE;
DROP TABLE IF EXISTS public.game_sessions CASCADE;
DROP TABLE IF EXISTS public.room_events CASCADE;
DROP TABLE IF EXISTS public.game_states CASCADE;
DROP TABLE IF EXISTS public.player_status_history CASCADE;
DROP TABLE IF EXISTS public.player_sessions CASCADE;
DROP TABLE IF EXISTS public.room_members CASCADE;
DROP TABLE IF EXISTS public.rooms CASCADE;
DROP TABLE IF EXISTS public.api_keys CASCADE;
DROP TABLE IF EXISTS public.games CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

-- =====================================================
-- STEP 6: CLEAN UP ANY REMAINING OBJECTS
-- =====================================================

-- Drop any remaining sequences
DROP SEQUENCE IF EXISTS users_id_seq CASCADE;
DROP SEQUENCE IF EXISTS rooms_id_seq CASCADE;
DROP SEQUENCE IF EXISTS room_members_id_seq CASCADE;
DROP SEQUENCE IF EXISTS player_sessions_id_seq CASCADE;
DROP SEQUENCE IF EXISTS player_status_history_id_seq CASCADE;
DROP SEQUENCE IF EXISTS game_states_id_seq CASCADE;
DROP SEQUENCE IF EXISTS room_events_id_seq CASCADE;
DROP SEQUENCE IF EXISTS api_keys_id_seq CASCADE;
DROP SEQUENCE IF EXISTS api_requests_id_seq CASCADE;
DROP SEQUENCE IF EXISTS game_sessions_id_seq CASCADE;
DROP SEQUENCE IF EXISTS connection_metrics_id_seq CASCADE;

-- Drop any remaining types
DROP TYPE IF EXISTS room_status CASCADE;
DROP TYPE IF EXISTS player_role CASCADE;
DROP TYPE IF EXISTS session_status CASCADE;
DROP TYPE IF EXISTS game_session_status CASCADE;

-- =====================================================
-- STEP 7: CLEAN UP REALTIME SUBSCRIPTIONS
-- =====================================================

-- Remove tables from realtime publication (this might fail if tables don't exist, which is OK)
DO $$
BEGIN
    -- Try to remove tables from realtime publication
    -- Check if table exists before trying to remove it from publication
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rooms' AND table_schema = 'public') THEN
        BEGIN
            ALTER publication supabase_realtime DROP TABLE public.rooms;
        EXCEPTION
            WHEN others THEN NULL;
        END;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'room_members' AND table_schema = 'public') THEN
        BEGIN
            ALTER publication supabase_realtime DROP TABLE public.room_members;
        EXCEPTION
            WHEN others THEN NULL;
        END;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'player_sessions' AND table_schema = 'public') THEN
        BEGIN
            ALTER publication supabase_realtime DROP TABLE public.player_sessions;
        EXCEPTION
            WHEN others THEN NULL;
        END;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'game_states' AND table_schema = 'public') THEN
        BEGIN
            ALTER publication supabase_realtime DROP TABLE public.game_states;
        EXCEPTION
            WHEN others THEN NULL;
        END;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'room_events' AND table_schema = 'public') THEN
        BEGIN
            ALTER publication supabase_realtime DROP TABLE public.room_events;
        EXCEPTION
            WHEN others THEN NULL;
        END;
    END IF;
    
    -- Also try to remove any other potential GameBuddies tables
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users' AND table_schema = 'public') THEN
        BEGIN
            ALTER publication supabase_realtime DROP TABLE public.users;
        EXCEPTION
            WHEN others THEN NULL;
        END;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'games' AND table_schema = 'public') THEN
        BEGIN
            ALTER publication supabase_realtime DROP TABLE public.games;
        EXCEPTION
            WHEN others THEN NULL;
        END;
    END IF;
END $$;

-- =====================================================
-- STEP 8: CLEAN UP RLS POLICIES
-- =====================================================
-- RLS policies are automatically dropped with tables, but let's be thorough

-- Note: Policies are automatically dropped when tables are dropped
-- This section is for documentation purposes

-- =====================================================
-- STEP 9: RE-ENABLE TRIGGERS AND CONSTRAINTS
-- =====================================================

SET session_replication_role = DEFAULT;

-- =====================================================
-- STEP 10: VERIFY CLEANUP
-- =====================================================

DO $$
DECLARE
    remaining_table_count INTEGER;
    remaining_function_count INTEGER;
    remaining_view_count INTEGER;
    remaining_type_count INTEGER;
BEGIN
    -- Count remaining tables that might be related to GameBuddies
    SELECT COUNT(*) INTO remaining_table_count
    FROM information_schema.tables t
    WHERE t.table_schema = 'public' 
    AND t.table_name IN (
        'users', 'games', 'rooms', 'room_members', 'player_sessions',
        'player_status_history', 'game_states', 'room_events', 'api_keys',
        'api_requests', 'game_sessions', 'connection_metrics'
    );
    
    -- Count remaining functions
    SELECT COUNT(*) INTO remaining_function_count
    FROM information_schema.routines r
    WHERE r.routine_schema = 'public' 
    AND (r.routine_name LIKE '%gamebuddies%' OR r.routine_name IN (
        'cleanup_expired_sessions', 'update_room_activity', 'generate_room_code',
        'get_or_create_user', 'log_event'
    ));
    
    -- Count remaining views
    SELECT COUNT(*) INTO remaining_view_count
    FROM information_schema.views v
    WHERE v.table_schema = 'public' 
    AND v.table_name IN (
        'active_player_sessions', 'room_status_summary', 
        'player_status_overview', 'game_activity_summary'
    );
    
    -- Count remaining types
    SELECT COUNT(*) INTO remaining_type_count
    FROM pg_type pt
    WHERE pt.typname IN ('room_status', 'player_role', 'session_status', 'game_session_status');
    
    -- Report results
    IF remaining_table_count > 0 THEN
        RAISE WARNING 'Still found % GameBuddies tables remaining', remaining_table_count;
    END IF;
    
    IF remaining_function_count > 0 THEN
        RAISE WARNING 'Still found % GameBuddies functions remaining', remaining_function_count;
    END IF;
    
    IF remaining_view_count > 0 THEN
        RAISE WARNING 'Still found % GameBuddies views remaining', remaining_view_count;
    END IF;
    
    IF remaining_type_count > 0 THEN
        RAISE WARNING 'Still found % GameBuddies types remaining', remaining_type_count;
    END IF;
    
    IF remaining_table_count = 0 AND remaining_function_count = 0 AND remaining_view_count = 0 AND remaining_type_count = 0 THEN
        RAISE NOTICE '✅ SUCCESS: All GameBuddies database objects have been completely removed!';
        RAISE NOTICE 'Your database is now clean and ready for a fresh GameBuddies V2 installation.';
        RAISE NOTICE 'You can now run the SUPABASE_COMPLETE_SCHEMA_SETUP.sql script.';
    ELSE
        RAISE NOTICE '⚠️  Some objects may still remain. Check the warnings above.';
    END IF;
END $$;

-- =====================================================
-- STEP 11: ADDITIONAL CLEANUP FOR SUPABASE-SPECIFIC ITEMS
-- =====================================================

-- Clean up any Supabase auth triggers or policies that might reference our tables
-- Note: This is usually not necessary, but included for completeness

DO $$
BEGIN
    -- Remove any auth triggers that might reference our deleted tables
    -- This is typically not needed but included for safety
    
    RAISE NOTICE 'Cleanup completed. If you see any warnings above, you may need to manually remove those objects.';
    RAISE NOTICE 'To start fresh, run the SUPABASE_COMPLETE_SCHEMA_SETUP.sql script next.';
END $$;

-- =====================================================
-- MANUAL CLEANUP CHECKLIST
-- =====================================================

/*
After running this script, also check the following in your Supabase dashboard:

1. 🗂️  TABLE EDITOR:
   - Verify all GameBuddies tables are gone
   - Check for any orphaned tables

2. 🔐 AUTHENTICATION:
   - Check if any RLS policies reference deleted tables
   - Remove any custom auth functions if you created them

3. 📊 API:
   - Update any API endpoints to handle the reset
   - Clear any cached API responses

4. 🔄 REALTIME:
   - Verify realtime subscriptions are cleaned up
   - No channels should reference the deleted tables

5. 🏗️ EDGE FUNCTIONS (if used):
   - Update any edge functions that referenced the old schema
   - Test that they don't try to access deleted tables

6. 📱 CLIENT APPLICATIONS:
   - Clear any cached data in your applications
   - Update API calls if table/column names changed

7. 🧪 TESTING:
   - Test that your reset was successful
   - Verify no old data remains

NEXT STEPS:
1. Run this reset script in Supabase SQL Editor
2. Verify success message appears
3. Run SUPABASE_COMPLETE_SCHEMA_SETUP.sql
4. Test your application with fresh database

⚠️  WARNING: This reset is IRREVERSIBLE! 
Make sure you have backups if you need to preserve any data.
*/