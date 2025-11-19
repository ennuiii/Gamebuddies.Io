-- =====================================================
-- FIX EMAIL AUTH ISSUE - GameBuddies.io
-- =====================================================
-- This script fixes the "Database error saving new user" issue
-- Run this in Supabase SQL Editor

-- Step 1: Drop existing trigger if it exists (it might be broken)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Step 2: Add missing columns to users table (if they don't exist)
DO $$
BEGIN
  -- Add email column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'email'
  ) THEN
    ALTER TABLE public.users ADD COLUMN email TEXT UNIQUE;
  END IF;

  -- Add email_verified column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'email_verified'
  ) THEN
    ALTER TABLE public.users ADD COLUMN email_verified BOOLEAN DEFAULT false;
  END IF;

  -- Add oauth_provider column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'oauth_provider'
  ) THEN
    ALTER TABLE public.users ADD COLUMN oauth_provider TEXT;
  END IF;

  -- Add oauth_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'oauth_id'
  ) THEN
    ALTER TABLE public.users ADD COLUMN oauth_id TEXT;
  END IF;

  -- Add oauth_metadata column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'oauth_metadata'
  ) THEN
    ALTER TABLE public.users ADD COLUMN oauth_metadata JSONB DEFAULT '{}';
  END IF;

  -- Add premium_tier column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'premium_tier'
  ) THEN
    ALTER TABLE public.users ADD COLUMN premium_tier TEXT DEFAULT 'free'
      CHECK (premium_tier IN ('free', 'monthly', 'lifetime'));
  END IF;

  -- Add premium_expires_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'premium_expires_at'
  ) THEN
    ALTER TABLE public.users ADD COLUMN premium_expires_at TIMESTAMP WITH TIME ZONE;
  END IF;

  -- Add stripe_customer_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'stripe_customer_id'
  ) THEN
    ALTER TABLE public.users ADD COLUMN stripe_customer_id TEXT;
  END IF;
END $$;

-- Step 3: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_oauth_provider_id ON public.users(oauth_provider, oauth_id);
CREATE INDEX IF NOT EXISTS idx_users_premium_tier ON public.users(premium_tier);

-- Step 4: Create unique constraint for OAuth provider + ID combination
DROP INDEX IF EXISTS idx_users_oauth_unique;
CREATE UNIQUE INDEX idx_users_oauth_unique ON public.users(oauth_provider, oauth_id)
WHERE oauth_provider IS NOT NULL;

-- Step 5: Create IMPROVED trigger function with conflict handling
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
  attempt_count INTEGER := 0;
  max_attempts INTEGER := 10;
  random_suffix TEXT;
BEGIN
  -- Generate base username from email
  base_username := split_part(NEW.email, '@', 1);

  -- Remove non-alphanumeric characters and ensure minimum length
  base_username := regexp_replace(base_username, '[^a-zA-Z0-9]', '', 'g');

  -- Ensure minimum length of 3 characters
  IF length(base_username) < 3 THEN
    base_username := base_username || '123';
  END IF;

  -- Truncate to 50 characters max
  base_username := left(base_username, 40);

  -- Try to insert with username conflict handling
  final_username := base_username;

  LOOP
    BEGIN
      -- Try to insert the user
      INSERT INTO public.users (
        id,
        username,
        email,
        oauth_provider,
        oauth_id,
        display_name,
        is_guest,
        email_verified,
        last_seen
      ) VALUES (
        NEW.id,
        final_username,
        NEW.email,
        COALESCE(NEW.raw_app_meta_data->>'provider', 'email'),
        NEW.raw_user_meta_data->>'provider_id',
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', final_username),
        false,
        NEW.email_confirmed_at IS NOT NULL,
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        oauth_provider = EXCLUDED.oauth_provider,
        oauth_id = EXCLUDED.oauth_id,
        display_name = EXCLUDED.display_name,
        email_verified = EXCLUDED.email_verified,
        last_seen = NOW();

      -- If we get here, insert was successful
      EXIT;

    EXCEPTION
      WHEN unique_violation THEN
        -- Username conflict, try with random suffix
        attempt_count := attempt_count + 1;

        IF attempt_count >= max_attempts THEN
          -- Give up after max attempts
          RAISE EXCEPTION 'Failed to generate unique username after % attempts', max_attempts;
        END IF;

        -- Generate random suffix (4 characters)
        random_suffix := substr(md5(random()::text || clock_timestamp()::text), 1, 4);
        final_username := base_username || '_' || random_suffix;

        -- Truncate if needed
        final_username := left(final_username, 50);
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Step 6: Create trigger on auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Step 7: Verify setup
DO $$
BEGIN
  RAISE NOTICE '✅ Email authentication fix completed!';
  RAISE NOTICE '';
  RAISE NOTICE 'Summary:';
  RAISE NOTICE '- Added email, oauth_provider, oauth_id columns to users table';
  RAISE NOTICE '- Created handle_new_user() function with conflict handling';
  RAISE NOTICE '- Created trigger on auth.users table';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Enable email provider in Authentication > Providers';
  RAISE NOTICE '2. Configure SMTP in Authentication > Email Templates';
  RAISE NOTICE '3. Test email registration!';
END $$;
