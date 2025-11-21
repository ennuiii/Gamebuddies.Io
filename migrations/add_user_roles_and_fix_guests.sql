-- Migration: Add role column and fix guest status
-- Created at: 2025-11-21
-- Updated to use dynamic SQL for role updates to prevent "column does not exist" parse errors

-- 1. Add role column to users table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'role'
    ) THEN
        ALTER TABLE public.users 
        ADD COLUMN role text DEFAULT 'user' CHECK (role IN ('user', 'admin', 'moderator'));
        
        RAISE NOTICE 'Added role column to users table';
    END IF;
END $$;

-- 2. Update specific user to admin
-- Using dynamic SQL to defer parsing, avoiding error if column was just added in the same batch
DO $$
BEGIN
    EXECUTE 'UPDATE public.users SET role = ''admin'' WHERE username = ''ennuigw2'' OR email = ''ennui.gw2@gmail.com''';
END $$;

-- 3. Fix is_guest logic
-- Users with email OR oauth_provider are NOT guests
UPDATE public.users 
SET is_guest = false 
WHERE email IS NOT NULL OR oauth_provider IS NOT NULL;

-- Users WITHOUT email AND WITHOUT oauth_provider ARE guests
UPDATE public.users 
SET is_guest = true 
WHERE email IS NULL AND oauth_provider IS NULL;