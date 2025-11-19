-- =====================================================
-- ADD EMAIL FIELDS TO USERS TABLE - Quick Fix
-- =====================================================
-- Run this in Supabase SQL Editor NOW
-- This adds the missing columns that email auth needs

-- Add email_verified column
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;

-- Add email column (if not exists)
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS email TEXT;

-- Add unique constraint on email
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_email_key'
  ) THEN
    ALTER TABLE public.users ADD CONSTRAINT users_email_key UNIQUE (email);
  END IF;
END $$;

-- Add oauth_provider column
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS oauth_provider TEXT;

-- Add oauth_id column
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS oauth_id TEXT;

-- Add oauth_metadata column
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS oauth_metadata JSONB DEFAULT '{}';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_oauth_provider_id ON public.users(oauth_provider, oauth_id);

-- Create unique constraint for OAuth provider + ID combination
DROP INDEX IF EXISTS idx_users_oauth_unique;
CREATE UNIQUE INDEX idx_users_oauth_unique ON public.users(oauth_provider, oauth_id)
WHERE oauth_provider IS NOT NULL;

-- Verify the columns were added
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
  AND column_name IN ('email', 'email_verified', 'oauth_provider', 'oauth_id', 'oauth_metadata')
ORDER BY column_name;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Email fields added successfully!';
  RAISE NOTICE 'You can now use email authentication.';
END $$;
