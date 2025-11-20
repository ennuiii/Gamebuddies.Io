# GameBuddies Status Management - Quick Reference

## Critical Issues (Fix ASAP)

### 1. Stale Database Records (CRITICAL)
**Problem:** Players appear online forever after network drop
**Files:** `server/lib/connectionManager.js:119`
**Fix:** Create Supabase function to mark stale players disconnected after 5 mins no activity
**Time to Fix:** 2-3 hours

### 2. Ghost Players Block Room Cleanup (CRITICAL)
**Problem:** Stale is_connected=true prevents room deletion
**Files:** `server/lib/supabase.js:665`, `connectionManager.js:119`
**Fix:** Implement #1 above
**Time to Fix:** Same as #1

### 3. Incomplete Grace Window Feature (URGENT)
**Problem:** `return_in_progress_until` checked but never set (4 reads, 0 writes)
**Files:** `server/index.js:1032,1034,1383,1385`
**Fix:** Set metadata.return_in_progress_until when game ends
**Time to Fix:** 1-2 hours

### 4. Inconsistent Room Abandonment (URGENT)
**Problem:** Socket disconnect → 'abandoned', explicit leave → 'returning'
**Files:** `server/index.js:2977` vs `3557`
**Fix:** Change line 2977 from 'returning' to 'abandoned'
**Time to Fix:** 30 minutes

---

## High Priority Issues

### 5. No Host Grace Period (HIGH)
**Problem:** Host transfers instantly, no chance to reconnect
**Files:** `server/index.js:3478`
**Fix:** Wait 30 seconds before transferring host
**Time to Fix:** 2-3 hours

### 6. No Session Age Limit (HIGH)
**Problem:** Players rejoin after days without restriction
**Files:** `server/lib/supabase.js:219`
**Fix:** Check session age, max 24 hours
**Time to Fix:** 1 hour

---

## Test Cases to Add

```javascript
// Test: Ghost player cleanup
test('Stale player marked disconnected after 5 minutes', async () => {
  // Simulate network drop (no socket disconnect event)
  // Wait 5+ minutes
  // Verify is_connected = false in DB
});

// Test: Grace window works
test('Disconnect ignored during game return grace period', async () => {
  // Start game, player returns to lobby
  // Grace window should be 30 seconds
  // Disconnect during window should be ignored
  // After 30 seconds, disconnect should work
});

// Test: Consistent room abandonment
test('Room marked abandoned regardless of disconnect path', async () => {
  // Test socket disconnect → abandoned
  // Test explicit leave → abandoned
  // Test explicit leave with no players → abandoned
});

// Test: Host grace period
test('Host reconnects within grace period, keeps host role', async () => {
  // Host disconnects
  // Wait < 30 seconds
  // Host reconnects
  // Verify host still has host role
});
```

---

## Database Functions Needed

### cleanup_stale_players()
```sql
UPDATE room_members
SET is_connected = false, current_location = 'disconnected'
WHERE is_connected = true AND last_ping < NOW() - INTERVAL '5 minutes'
```

### Log to room_events when stale cleanup happens

### Optional: Compute room status view
```sql
SELECT 
  CASE 
    WHEN connected_count = 0 THEN 'abandoned'
    WHEN in_game_count > 0 THEN 'in_game'
    ELSE 'lobby'
  END AS computed_status
```

---

## Implementation Order

1. **Week 1:** Fix issues #1-4 (stale cleanup, consistency)
2. **Week 2:** Add host grace period (#5), session age (#6)
3. **Week 3:** Testing, monitoring, edge cases

---

## Monitoring to Add

Track these metrics:
- Stale players cleaned per hour
- Rooms cleaned per cycle
- Host transfers per day
- Session rejoin age distribution
- Grace window hits vs misses

---

## Files Modified Summary

| File | Lines | Changes | Priority |
|------|-------|---------|----------|
| `server/lib/supabase.js` | 557-750 | Add grace window setter | HIGH |
| `server/index.js` | 1032, 1383 | Fix grace window | URGENT |
| `server/index.js` | 2977 | Change 'returning' → 'abandoned' | URGENT |
| `server/index.js` | 3478 | Add host grace period | HIGH |
| `server/lib/connectionManager.js` | 119 | Call DB cleanup | CRITICAL |
| New migration file | N/A | Add cleanup_stale_players() | CRITICAL |

---

## Rollback Plan

All changes are additive (new metadata fields, new functions):
- If grace window breaks, just clear metadata field
- If stale cleanup is wrong, disable via environment variable
- No data deletions, safe to roll back

---

## Performance Impact

- Stale cleanup: +1 query every 5 minutes (background)
- Grace window: +2 metadata updates per game session (negligible)
- Host grace period: +1 room metadata update per disconnect (negligible)

---

## Related Docs

Full analysis: `STATUS_MANAGEMENT_REPORT.md`
Database schema: `server/migrations/001_add_v2_tables.sql`
Connection logic: `server/lib/connectionManager.js`
Status sync: `server/lib/statusSyncManager.js`
