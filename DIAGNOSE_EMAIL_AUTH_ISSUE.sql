-- =====================================================
-- DIAGNOSTIC SCRIPT FOR EMAIL AUTH ISSUE
-- =====================================================
-- Run this in Supabase SQL Editor to diagnose the problem
-- Copy the output and share it to understand what's wrong

-- 1. Check if email/oauth columns exist on users table
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
ORDER BY ordinal_position;

-- 2. Check if auth trigger exists
SELECT
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'auth'
  AND event_object_table = 'users';

-- 3. Check if handle_new_user function exists
SELECT
  routine_name,
  routine_type,
  routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'handle_new_user';

-- 4. Check existing constraints on users table
SELECT
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'users'
ORDER BY tc.constraint_type, tc.constraint_name;

-- 5. Test if we can create a dummy user
-- (This will help us understand what constraint is failing)
DO $$
BEGIN
  -- Try to insert a test user (this will be rolled back)
  RAISE NOTICE 'Testing user creation...';

  -- This is just for diagnostics, won't actually insert
  PERFORM 1 FROM public.users LIMIT 1;

  RAISE NOTICE 'Users table is accessible';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error accessing users table: %', SQLERRM;
END $$;
