-- =====================================================
-- Fix OAuth Profile Overwrite Issue
-- =====================================================
-- This script modifies the user synchronization trigger to prevent
-- overwriting existing profile data (name, avatar) when logging in
-- with a different provider (e.g., linking Google and Discord).

-- 1. Create a smarter synchronization function
CREATE OR REPLACE FUNCTION public.handle_user_identity_sync()
RETURNS TRIGGER AS $$
DECLARE
    existing_user public.users%ROWTYPE;
    new_username TEXT;
    new_display_name TEXT;
    new_avatar TEXT;
    sanitized_username TEXT;
BEGIN
    -- Extract data from auth metadata (works for Google, Discord, etc.)
    new_display_name := COALESCE(
        new.raw_user_meta_data->>'full_name', 
        new.raw_user_meta_data->>'name', 
        new.raw_user_meta_data->>'user_name',
        split_part(new.email, '@', 1)
    );
    
    new_avatar := COALESCE(
        new.raw_user_meta_data->>'avatar_url',
        new.raw_user_meta_data->>'picture'
    );

    -- Generate a clean username
    sanitized_username := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9_]', '', 'g'));
    IF length(sanitized_username) < 3 THEN
        sanitized_username := sanitized_username || floor(random() * 1000)::text;
    END IF;

    -- INSERT CASE: New User
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.users (id, username, display_name, avatar_url, is_guest, metadata)
        VALUES (
            new.id,
            sanitized_username, -- Try email prefix first
            new_display_name,
            new_avatar,
            false,
            jsonb_build_object('created_via', 'auth_trigger')
        )
        ON CONFLICT (id) DO NOTHING; -- If it exists, it handles in UPDATE or does nothing
        
        -- Handle username collision on insert by appending random suffix
        EXCEPTION WHEN unique_violation THEN
            INSERT INTO public.users (id, username, display_name, avatar_url, is_guest, metadata)
            VALUES (
                new.id,
                sanitized_username || '_' || floor(random() * 10000)::text,
                new_display_name,
                new_avatar,
                false,
                jsonb_build_object('created_via', 'auth_trigger_retry')
            );
            
        RETURN new;

    -- UPDATE CASE: User logging in / updating
    ELSIF (TG_OP = 'UPDATE') THEN
        
        -- Fetch existing public user data
        SELECT * INTO existing_user FROM public.users WHERE id = new.id;
        
        IF FOUND THEN
            -- SMART UPDATE: Only update fields if they are currently NULL or empty in public.users
            UPDATE public.users
            SET
                -- Keep existing display_name if present, otherwise use new one
                display_name = COALESCE(NULLIF(existing_user.display_name, ''), new_display_name),
                
                -- Keep existing avatar if present, otherwise use new one
                avatar_url = COALESCE(NULLIF(existing_user.avatar_url, ''), new_avatar),
                
                -- Always update last_seen on login
                last_seen = NOW()
            WHERE id = new.id;
        ELSE
            -- Edge case: auth user exists but public user is missing (restore it)
            INSERT INTO public.users (id, username, display_name, avatar_url, is_guest)
            VALUES (new.id, sanitized_username, new_display_name, new_avatar, false)
            ON CONFLICT (username) DO UPDATE SET username = sanitized_username || '_' || floor(random() * 10000)::text;
        END IF;
        
        RETURN new;
    END IF;

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Drop the old triggers (standard naming conventions)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;

-- 3. Create the new triggers using the smart function
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_user_identity_sync();

CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_user_identity_sync();

-- Output success message
SELECT 'OAuth profile overwrite protection enabled.' as status;
