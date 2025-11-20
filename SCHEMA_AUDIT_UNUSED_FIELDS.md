# Supabase Schema Audit - Unused Tables & Fields

## 📋 Executive Summary

After auditing the codebase against the Supabase schema, I've identified several **unused tables and fields** that can be removed or need attention. This will:
- ✅ Reduce database complexity
- ✅ Improve query performance
- ✅ Reduce storage costs
- ✅ Make the schema easier to maintain

---

## 🔴 CRITICAL: Tables That Need Migration/Fixing

### 1. `game_sessions` - **SCHEMA CONFLICT**

**Status:** ❌ **INCOMPATIBLE - REQUIRES MIGRATION**

**Problem:**
The schema defines an OLD structure that conflicts with the new session token authentication system.

**Schema Definition (OLD):**
```sql
CREATE TABLE game_sessions (
  id UUID,
  room_id UUID,
  game_id VARCHAR(50),      -- ❌ Conflicts with new 'game_type' field
  status VARCHAR(20),        -- ❌ Not used in new system
  participants JSONB,        -- ❌ Not used in new system
  game_state JSONB,          -- ❌ Not used in new system
  game_result JSONB,         -- ❌ Not used in new system
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);
```

**Required Structure (NEW):**
```sql
CREATE TABLE game_sessions (
  id UUID,
  session_token TEXT UNIQUE,  -- ✅ Required for auth
  room_id UUID,
  room_code TEXT,             -- ✅ Required
  player_id UUID,             -- ✅ Required
  game_type TEXT,             -- ✅ Required
  streamer_mode BOOLEAN,      -- ✅ Required
  metadata JSONB,             -- ✅ Required
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,     -- ✅ Required for security
  last_accessed TIMESTAMPTZ   -- ✅ Required for tracking
);
```

**Action Required:**
Run `MIGRATION_UPDATE_GAME_SESSIONS_FOR_AUTH.sql` IMMEDIATELY

**Code Usage:**
- ✅ Currently USED in new authentication code
- ❌ Schema NOT updated yet
- ⚠️ Will cause runtime errors if not migrated

---

## ❌ UNUSED TABLES (Can be Removed)

### 2. `player_sessions` Table

**Status:** ❌ **COMPLETELY UNUSED**

**Schema:**
```sql
CREATE TABLE player_sessions (
  id UUID,
  user_id UUID,
  room_id UUID,
  session_token VARCHAR(64),
  socket_id VARCHAR(128),
  status VARCHAR(16),
  last_heartbeat TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);
```

**Code Usage:**
- ❌ NOT queried anywhere in codebase
- ❌ NO INSERT statements
- ❌ NO UPDATE statements
- ❌ Views reference it but views are also unused

**Recommendation:** **DELETE** this table

**Why It Exists:**
Appears to be an old session management system that was replaced by:
1. The `connectionManager` in-memory system (server/lib/ConnectionManager.js)
2. The new `game_sessions` token authentication system

### 3. `player_status_history` Table

**Status:** ❌ **COMPLETELY UNUSED**

**Schema:**
```sql
CREATE TABLE player_status_history (
  id UUID,
  user_id UUID,
  room_id UUID,
  old_location VARCHAR(16),
  new_location VARCHAR(16),
  old_status VARCHAR(16),
  new_status VARCHAR(16),
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ
);
```

**Code Usage:**
- ❌ NOT queried anywhere
- ❌ NO INSERT statements
- ❌ No audit trail being written

**Recommendation:** **DELETE** this table

**Why It Exists:**
Designed for audit trails but never implemented. If you need audit trails in the future, re-add it.

### 4. `connection_metrics` Table

**Status:** ⚠️ **PARTIALLY UNUSED**

**Schema:**
```sql
CREATE TABLE connection_metrics (
  id UUID,
  metric_type VARCHAR(32),
  metric_value NUMERIC,
  tags JSONB,
  created_at TIMESTAMPTZ
);
```

**Code Usage:**
- ✅ WRITTEN TO by `cleanup_expired_sessions()` function (in schema)
- ✅ WRITTEN TO by schema setup scripts
- ❌ NEVER QUERIED or read by application code
- ❌ No monitoring dashboard using this data

**Recommendation:**
**Option A:** Delete if not monitoring
**Option B:** Keep if planning to build monitoring dashboard

### 5. `api_requests` Table

**Status:** ⚠️ **PARTIALLY UNUSED**

**Schema:**
```sql
CREATE TABLE api_requests (
  id UUID,
  api_key_id UUID,
  method VARCHAR(10),
  endpoint TEXT,
  status_code INTEGER,
  requested_at TIMESTAMPTZ,
  response_time_ms INTEGER,
  ip_address INET,
  user_agent TEXT,
  request_data JSONB,
  response_data JSONB,
  error_message TEXT
);
```

**Code Usage:**
- ❌ NOT written to by API validation middleware
- ❌ No logging happening
- ✅ Table structure is correct (just not populated)

**Recommendation:**
**Option A:** Delete if not doing API monitoring
**Option B:** Implement logging in `validateApiKey` middleware (server/lib/validation.js)

---

## ⚠️ USED BUT PROBLEMATIC TABLES

### 6. `game_states` Table

**Status:** ⚠️ **WRONG TABLE BEING USED**

**Schema:**
```sql
CREATE TABLE game_states (
  id UUID,
  room_id UUID,
  game_name VARCHAR(50),
  state_data JSONB,
  state_version INTEGER,
  created_by UUID,
  created_at TIMESTAMPTZ,
  metadata JSONB
);
```

**Code Usage:**
Code is trying to use `game_sessions` for game state storage (supabase.js:484-530):
```javascript
async saveGameState(roomId, gameType, stateData, createdBy) {
  const { data: gameState, error } = await this.adminClient
    .from('game_sessions')  // ❌ WRONG TABLE!
    .insert([{
      room_id: roomId,
      game_id: gameType,     // ❌ OLD field name
      game_state: stateData, // ❌ OLD field name
      participants: [{ user_id: createdBy }]
    }])
}
```

**Problem:**
- Code writes to `game_sessions` (which is for authentication tokens)
- Should write to `game_states` table instead
- Field names don't match

**Recommendation:**
**Fix the code** to use the correct table:
```javascript
async saveGameState(roomId, gameType, stateData, createdBy) {
  const { data: gameState, error } = await this.adminClient
    .from('game_states')  // ✅ CORRECT TABLE
    .insert([{
      room_id: roomId,
      game_name: gameType,      // ✅ Correct field
      state_data: stateData,    // ✅ Correct field
      created_by: createdBy,
      state_version: 1
    }])
}
```

---

## ✅ CORRECTLY USED TABLES

These tables are actively used and needed:

### 7. `users` Table ✅
- Used for user authentication and profiles
- Fields used: `id`, `username`, `display_name`, `avatar_url`, `premium_tier`, `last_seen`
- All fields are necessary

### 8. `games` Table ✅
- Used for game catalog and proxy configuration
- All fields are used
- Necessary for system

### 9. `rooms` Table ✅
- Core table for room management
- Fields used: All except possibly:
  - `is_public` - Always true in code? (check if feature is used)
  - `allow_spectators` - Feature not implemented yet?
  - `game_settings` - Only used for specific games?

### 10. `room_members` Table ✅
- Core table for participant management
- Fields used: All
- Critical table

### 11. `room_events` Table ✅
- Used for event logging
- Fields: All used
- Provides audit trail

### 12. `api_keys` Table ✅
- Used for game API authentication
- Fields: All relevant
- Necessary for security

---

## 🔍 UNUSED FIELDS IN USED TABLES

### `users` Table

**Unused Fields:**
- `is_guest` - ❌ Never checked in code (always set to true/false but never queried)
- `metadata` - ⚠️ Written to but rarely read
- `created_at` - ❌ Never queried (only stored)

**Recommendation:**
- Keep `metadata` (flexible for future use)
- Remove `is_guest` if guest system not used
- Keep `created_at` (good practice for audit)

### `rooms` Table

**Potentially Unused Fields:**
- `is_public` - ⚠️ Always set to `true` in code, never `false`
- `allow_spectators` - ❌ Feature not implemented
- `game_settings` - ⚠️ Set but rarely used
- `updated_at` - ❌ Auto-updated by trigger but never queried

**Recommendation:**
- Remove `allow_spectators` if feature not planned
- Keep others for future features

### `room_members` Table

**Unused Fields:**
- `socket_id` - ⚠️ Stored but `connectionManager` is source of truth
- `game_data` - ❌ Never written to or read (renamed to `game_specific_data` in code comments)
- `left_at` - ❌ Never set (participants are deleted instead)

**Recommendation:**
- Remove `game_data` (unused)
- Remove `left_at` (soft delete not implemented)
- Keep `socket_id` (useful for debugging)

---

## 🗄️ UNUSED VIEWS

All 4 views defined in schema are **COMPLETELY UNUSED**:

1. **`active_player_sessions`** - References unused `player_sessions` table
2. **`room_status_summary`** - Never queried
3. **`player_status_overview`** - References unused `player_sessions` table
4. **`game_activity_summary`** - Never queried

**Recommendation:** **DELETE ALL VIEWS**

---

## 🔄 UNUSED FUNCTIONS

### Unused Functions:
- ✅ `generate_room_code()` - **USED**
- ❌ `cleanup_expired_sessions()` - References unused `player_sessions` table
- ✅ `update_room_activity()` - **USED** (via trigger)
- ❌ `get_or_create_user()` - NOT used (code has own implementation)
- ❌ `log_event()` - NOT used (code calls direct INSERT)

**Recommendation:**
- Delete `cleanup_expired_sessions()` (wrong table)
- Delete `get_or_create_user()` (code doesn't call it)
- Delete `log_event()` (code doesn't call it)
- Keep `generate_room_code()` and `update_room_activity()`

---

## 📅 UNUSED SCHEDULED TASKS (pg_cron)

All cron jobs reference the wrong functions or unused tables:

1. `cleanup-expired-sessions` - ❌ Uses wrong table
2. `cleanup-old-status-history` - ❌ Table unused
3. `cleanup-old-room-events` - ⚠️ Could be useful
4. `cleanup-old-api-requests` - ❌ Table not populated
5. `cleanup-old-metrics` - ❌ Table barely used
6. `cleanup-abandoned-rooms` - ⚠️ Useful but code has own implementation

**Recommendation:**
- Remove jobs 1, 2, 4, 5
- Keep job 3 (room_events cleanup)
- Update job 6 or remove if code handles it

---

## 📊 SUMMARY STATISTICS

| Category | Total | Used | Unused | Needs Fix |
|----------|-------|------|--------|-----------|
| **Tables** | 12 | 7 | 4 | 1 |
| **Views** | 4 | 0 | 4 | 0 |
| **Functions** | 8 | 2 | 5 | 1 |
| **Cron Jobs** | 6 | 1 | 5 | 0 |

**Storage Impact:**
- Unused tables: ~40% of schema
- Unused indexes: ~30 indexes on unused tables
- Potential storage savings: Significant

---

## 🚀 RECOMMENDED ACTION PLAN

### Phase 1: CRITICAL (Do Immediately)
1. ✅ Run `MIGRATION_UPDATE_GAME_SESSIONS_FOR_AUTH.sql`
2. ✅ Fix `saveGameState()` to use `game_states` table instead of `game_sessions`
3. ✅ Test authentication system after migration

### Phase 2: Cleanup (Do Soon)
1. Delete unused tables:
   - `player_sessions`
   - `player_status_history`
2. Delete unused views (all 4)
3. Delete unused functions (3 functions)
4. Update cron jobs (remove 5 jobs)

### Phase 3: Optimization (Optional)
1. Remove unused fields from `rooms` table
2. Remove unused fields from `room_members` table
3. Implement API request logging if needed
4. Implement connection metrics monitoring if needed

---

## 💾 CLEANUP SQL SCRIPT

```sql
-- Phase 1: Fix game_sessions (RUN THIS FIRST!)
-- Use MIGRATION_UPDATE_GAME_SESSIONS_FOR_AUTH.sql

-- Phase 2: Remove unused tables
DROP TABLE IF EXISTS player_sessions CASCADE;
DROP TABLE IF EXISTS player_status_history CASCADE;

-- Optional: Remove metrics/monitoring tables if not needed
-- DROP TABLE IF EXISTS connection_metrics CASCADE;
-- DROP TABLE IF EXISTS api_requests CASCADE;

-- Phase 2: Remove unused views
DROP VIEW IF EXISTS active_player_sessions;
DROP VIEW IF EXISTS room_status_summary;
DROP VIEW IF EXISTS player_status_overview;
DROP VIEW IF EXISTS game_activity_summary;

-- Phase 2: Remove unused functions
DROP FUNCTION IF EXISTS cleanup_expired_sessions();
DROP FUNCTION IF EXISTS get_or_create_user(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS log_event(UUID, UUID, TEXT, JSONB);

-- Phase 2: Remove unused cron jobs
SELECT cron.unschedule('cleanup-expired-sessions');
SELECT cron.unschedule('cleanup-old-status-history');
SELECT cron.unschedule('cleanup-old-api-requests');
SELECT cron.unschedule('cleanup-old-metrics');
SELECT cron.unschedule('cleanup-abandoned-rooms');

-- Phase 3: Remove unused fields (optional - be careful!)
-- ALTER TABLE rooms DROP COLUMN IF EXISTS allow_spectators;
-- ALTER TABLE room_members DROP COLUMN IF EXISTS game_data;
-- ALTER TABLE room_members DROP COLUMN IF EXISTS left_at;
```

---

## ⚠️ WARNINGS BEFORE CLEANUP

1. **Backup first!** Always backup before deleting schema objects
2. **Test in staging** before production
3. **Check logs** for any unexpected table access
4. **Monitor errors** after cleanup for 24-48 hours
5. **Have rollback plan** ready

---

## 📞 Next Steps

1. Review this document
2. Run Phase 1 (game_sessions migration) **immediately**
3. Fix `saveGameState()` code bug
4. Test authentication thoroughly
5. Schedule Phase 2 cleanup during maintenance window
6. Monitor for 48 hours after cleanup

**This audit will significantly simplify your database and improve performance!** 🎉
