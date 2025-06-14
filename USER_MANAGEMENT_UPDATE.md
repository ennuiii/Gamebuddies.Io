# User Management System Update

## Overview
Updated the GameBuddies user management system to allow duplicate usernames and use `external_id` as the primary unique identifier. This provides a better user experience by allowing multiple users to have the same display name while maintaining unique identification through external IDs.

## Changes Made

### 1. Database Schema Updates
- **Removed unique constraint on `username`** in `user_profiles` table
- **Removed `socket_id` column** from `room_participants` table (socket IDs are ephemeral and handled in memory)
- **Added new user management function** `get_or_create_user()` that uses `external_id` as the primary lookup

### 2. Server Code Updates
- **Updated `getOrCreateUser()` function** in `server/lib/supabase.js`:
  - Always checks by `external_id` first
  - Allows duplicate usernames
  - Better error handling with descriptive logging
  - Updates `last_seen` timestamp for existing users

### 3. Database Setup Script Updates
- Updated `server/scripts/setup-database.js` to reflect new schema
- Added the new `get_or_create_user()` PostgreSQL function
- Removed socket_id references from table definitions

## Database Migration Required

You need to run these SQL commands in your Supabase SQL Editor:

```sql
-- Remove the unique constraint on username
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_username_key;

-- Remove socket_id column if it exists
ALTER TABLE room_participants DROP COLUMN IF EXISTS socket_id;

-- Create the improved user management function
DROP FUNCTION IF EXISTS get_or_create_user(VARCHAR, VARCHAR, VARCHAR);

CREATE OR REPLACE FUNCTION get_or_create_user(
  p_external_id VARCHAR(100),
  p_username VARCHAR(50),
  p_display_name VARCHAR(100) DEFAULT NULL
)
RETURNS user_profiles
LANGUAGE plpgsql
AS $$
DECLARE
  v_user user_profiles;
BEGIN
  -- Try to find by external_id
  SELECT * INTO v_user
  FROM user_profiles
  WHERE external_id = p_external_id;
  
  IF FOUND THEN
    -- Update last_seen
    UPDATE user_profiles
    SET last_seen = NOW()
    WHERE id = v_user.id;
    
    RETURN v_user;
  END IF;
  
  -- Create new user
  INSERT INTO user_profiles (external_id, username, display_name)
  VALUES (
    p_external_id,
    p_username,
    COALESCE(p_display_name, p_username)
  )
  RETURNING * INTO v_user;
  
  RETURN v_user;
END;
$$;
```

## Benefits

1. **Better User Experience**: Users can choose any username they want without worrying about conflicts
2. **Proper Identity Management**: External IDs ensure unique user identification across sessions
3. **Cleaner Architecture**: Socket IDs are handled in memory where they belong (ephemeral data)
4. **Better Performance**: Removed unnecessary database columns and improved lookup logic

## How It Works

1. **User Creation/Login**:
   - System generates a unique `external_id` for each user session
   - Users can choose any `username` (duplicates allowed)
   - Database lookup always happens by `external_id` first
   - If user exists, `last_seen` is updated
   - If user doesn't exist, new user is created with chosen username

2. **Real-time Communication**:
   - Socket IDs are tracked in memory via `activeConnections` Map
   - No socket IDs stored in database (proper separation of concerns)
   - Connection status tracked in `room_participants.connection_status`

3. **Room Management**:
   - Users identified by `user_id` (from user_profiles table)
   - Multiple users can have same display name in different rooms
   - Unique constraint remains on `(room_id, user_id)` to prevent duplicate participation

## Testing

After applying the database migration:
1. Test user creation with duplicate usernames
2. Verify existing users are found by external_id
3. Confirm room joining works with new user system
4. Test reconnection scenarios

## Next Steps

1. Apply the database migration in Supabase
2. Deploy the updated server code
3. Test the system end-to-end
4. Monitor for any issues with user identification 