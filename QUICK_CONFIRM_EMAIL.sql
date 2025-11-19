-- =====================================================
-- QUICK EMAIL CONFIRMATION
-- =====================================================
-- Run this in Supabase SQL Editor to manually confirm your email
-- Replace 'ennui.gw2@gmail.com' with your actual email

-- Step 1: Confirm the email in auth.users
UPDATE auth.users
SET
  email_confirmed_at = NOW(),
  confirmation_token = NULL,
  confirmation_sent_at = NULL,
  updated_at = NOW()
WHERE email = 'ennui.gw2@gmail.com';

-- Step 2: Mark as verified in public.users (if it exists)
UPDATE public.users
SET
  email_verified = true,
  last_seen = NOW()
WHERE email = 'ennui.gw2@gmail.com';

-- Step 3: Verify the confirmation worked
SELECT
  'auth.users' as table_name,
  id,
  email,
  email_confirmed_at as confirmed_at,
  created_at
FROM auth.users
WHERE email = 'ennui.gw2@gmail.com'

UNION ALL

SELECT
  'public.users' as table_name,
  id,
  email,
  last_seen as confirmed_at,
  created_at
FROM public.users
WHERE email = 'ennui.gw2@gmail.com';

-- Expected output:
-- You should see 2 rows (one from auth.users, one from public.users)
-- Both should have email_confirmed_at / last_seen populated
-- This means the email is confirmed! ✅
