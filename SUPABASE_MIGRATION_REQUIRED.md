# 🔴 SUPABASE MIGRATION REQUIRED

## Critical Update Needed

The secure session token authentication system requires updating the `game_sessions` table in your Supabase database.

## ⚠️ The Problem

Your database currently has an **OLD** `game_sessions` table structure from `SUPABASE_COMPLETE_SCHEMA_SETUP.sql`:

```sql
-- OLD STRUCTURE (incompatible)
CREATE TABLE game_sessions (
  id UUID,
  room_id UUID,
  game_id VARCHAR(50),           -- ❌ Wrong field
  status VARCHAR(20),             -- ❌ Not needed
  participants JSONB,             -- ❌ Not needed
  game_state JSONB,               -- ❌ Not needed
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);
```

But the new authentication system expects:

```sql
-- NEW STRUCTURE (required)
CREATE TABLE game_sessions (
  id UUID,
  session_token TEXT UNIQUE,      -- ✅ Authentication token
  room_id UUID,
  room_code TEXT,                 -- ✅ Room code reference
  player_id UUID,                 -- ✅ Player reference
  game_type TEXT,                 -- ✅ Game type
  streamer_mode BOOLEAN,          -- ✅ Streamer mode flag
  metadata JSONB,                 -- ✅ Player data
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,         -- ✅ Security expiration
  last_accessed TIMESTAMPTZ       -- ✅ Activity tracking
);
```

## 🚀 How to Fix

### Option 1: Run Migration via Supabase SQL Editor (Recommended)

1. **Open Supabase Dashboard** → Your Project → SQL Editor
2. **Copy the contents** of `MIGRATION_UPDATE_GAME_SESSIONS_FOR_AUTH.sql`
3. **Paste and run** the migration
4. **Verify** the table structure:

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'game_sessions'
ORDER BY ordinal_position;
```

You should see:
- ✅ `session_token` (text)
- ✅ `room_code` (text)
- ✅ `player_id` (uuid)
- ✅ `game_type` (text)
- ✅ `streamer_mode` (boolean)
- ✅ `expires_at` (timestamp with time zone)
- ✅ `last_accessed` (timestamp with time zone)

### Option 2: Run Migration via Command Line

```bash
# If you have Supabase CLI installed
supabase db reset --db-url "your-connection-string"

# Or use psql
psql "your-connection-string" -f MIGRATION_UPDATE_GAME_SESSIONS_FOR_AUTH.sql
```

## ⚠️ Important Notes

### Data Loss Warning
**This migration will DROP the existing `game_sessions` table!**

If you have important data in the old table:
1. **Backup first:**
   ```sql
   CREATE TABLE game_sessions_backup AS SELECT * FROM game_sessions;
   ```
2. Run the migration
3. Migrate any needed data to the new structure

### When to Run
- **Before deploying** the new authentication code
- **During maintenance window** (minimal downtime)
- The migration is **idempotent** (safe to run multiple times)

## ✅ Post-Migration Verification

After running the migration, test that it works:

```sql
-- Test 1: Insert a session token
INSERT INTO game_sessions (
  session_token,
  room_id,
  room_code,
  player_id,
  game_type,
  streamer_mode,
  metadata
) VALUES (
  'test_token_12345',
  (SELECT id FROM rooms LIMIT 1),
  'TEST',
  (SELECT id FROM users LIMIT 1),
  'fibbage',
  false,
  '{"player_name": "Test", "premium_tier": "free"}'::jsonb
);

-- Test 2: Query by session token
SELECT * FROM game_sessions WHERE session_token = 'test_token_12345';

-- Test 3: Cleanup expired sessions
SELECT cleanup_expired_game_sessions();

-- Test 4: Delete test data
DELETE FROM game_sessions WHERE session_token = 'test_token_12345';
```

## 🔐 Security Benefits

After this migration, your system will have:
- ✅ **Secure session tokens** (cannot fake premium status)
- ✅ **Automatic expiration** (3 hour sessions)
- ✅ **Activity tracking** (last_accessed timestamp)
- ✅ **Efficient queries** (indexed session_token lookups)
- ✅ **Automatic cleanup** (expired session deletion function)

## 🛟 Rollback Plan

If you need to rollback to the old structure:

```sql
-- Save this as ROLLBACK_GAME_SESSIONS.sql
DROP TABLE IF EXISTS game_sessions CASCADE;

CREATE TABLE public.game_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  game_id VARCHAR(50) NOT NULL REFERENCES public.games(id),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  participants JSONB NOT NULL DEFAULT '[]',
  game_state JSONB DEFAULT '{}',
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE
);
```

## 📞 Need Help?

- Check migration logs in Supabase Dashboard → Database → Logs
- Review the `MIGRATION_UPDATE_GAME_SESSIONS_FOR_AUTH.sql` file
- Test locally first if possible
- Contact support if you encounter issues

## 📋 Migration Checklist

- [ ] Backup existing `game_sessions` table (if has data)
- [ ] Review `MIGRATION_UPDATE_GAME_SESSIONS_FOR_AUTH.sql`
- [ ] Run migration in Supabase SQL Editor
- [ ] Verify table structure with test queries
- [ ] Test session token creation and lookup
- [ ] Deploy updated server code
- [ ] Monitor for errors in production

**Once this migration is complete, the secure authentication system will be fully functional!** 🎉
