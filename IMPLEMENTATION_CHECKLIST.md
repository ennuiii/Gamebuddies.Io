# Implementation Checklist for Status Management Fixes

## CRITICAL Issues (Must Fix First)

### Issue #1: Stale Player Database Cleanup
- [ ] Create Supabase migration file `003_add_stale_cleanup_function.sql`
- [ ] Add `cleanup_stale_players()` function
- [ ] Add CRON job scheduling for function
- [ ] Add Node.js periodic call (backup)
- [ ] Test: Simulate network drop, verify cleanup after 5 mins
- [ ] Add logging to cleanup event
- [ ] Monitor cleanup metrics

**Files to Create:**
```
/server/migrations/003_add_stale_cleanup_function.sql
```

**Files to Modify:**
```
/server/index.js - add periodic call around line 3870
/server/lib/supabase.js - add RPC wrapper method
```

---

### Issue #2: Fix Grace Window Implementation
- [ ] Search codebase for all `return_in_progress_until` references
  - [ ] Line 1032 in index.js - reader
  - [ ] Line 1034 in index.js - reader
  - [ ] Line 1383 in index.js - reader
  - [ ] Line 1385 in index.js - reader
  
- [ ] Find where to SET this value
  - [ ] Line 2995 - playerReturnToLobby event
  - [ ] Line 3025 - game end scenario
  
- [ ] Implement setter:
  ```javascript
  metadata.return_in_progress_until = new Date(Date.now() + 30000).toISOString()
  ```
  
- [ ] Add clear timeout:
  ```javascript
  setTimeout(() => clearReturnGrace(roomId), 30000)
  ```

- [ ] Test: Return from game, disconnect during 30s window, verify ignored
- [ ] Test: Disconnect after 30s window, verify works
- [ ] Add debug logging to grace window checks

**Files to Modify:**
```
/server/index.js - around lines 2995, 3025
```

---

### Issue #3: Consistent Room Abandonment Status
- [ ] Find line 2977 in index.js
- [ ] Change from:
  ```javascript
  status: 'returning'
  ```
  to:
  ```javascript
  status: 'abandoned'
  ```

- [ ] Verify both paths now use 'abandoned':
  - [ ] Socket disconnect (line 3557) - already correct
  - [ ] Explicit leave (line 2977) - CHANGE THIS
  
- [ ] Update cleanup logic to only check for 'abandoned'
- [ ] Test: Leave room with no players → abandoned
- [ ] Test: Disconnect with no players → abandoned
- [ ] Verify cleanup still works

**Files to Modify:**
```
/server/index.js - line 2977 only
```

---

### Issue #4: Incomplete Disconnect Grace Window
- [ ] This is same as Issue #2
- [ ] Mark as duplicate once #2 complete

---

## HIGH Priority Issues

### Issue #5: Host Reconnection Grace Period
- [ ] Create mechanism to delay host transfer
- [ ] When host disconnects:
  - [ ] Store `hostTransferPending` in metadata
  - [ ] Set 30 second grace timer
  - [ ] On host reconnect: clear pending flag
  - [ ] After 30 seconds: execute transfer if still offline

- [ ] Modify socket.on('disconnect') around line 3426
- [ ] Add handler in socket.on('joinRoom') to detect reconnect
- [ ] Test: Host disconnect, rejoin within 30s → keep host
- [ ] Test: Host disconnect, wait 30s → transfer host
- [ ] Test: Other player disconnect → no grace period

**Implementation Pattern:**
```javascript
// In disconnect handler
if (isDisconnectingHost) {
  const graceTimer = setTimeout(async () => {
    // Check if host still offline
    const currentRoom = await db.getRoomById(roomId);
    const hostStillOffline = !currentRoom.participants
      .find(p => p.user_id === hostId)?.is_connected;
    
    if (hostStillOffline) {
      // Transfer host
      await db.autoTransferHost(roomId, hostId);
    }
  }, 30000);
  
  // Store timer for cancellation if host reconnects
  hostTransferTimers.set(roomId, graceTimer);
}

// In joinRoom handler
if (hostTransferTimers.has(roomId)) {
  clearTimeout(hostTransferTimers.get(roomId));
  hostTransferTimers.delete(roomId);
  console.log('Host reconnected within grace period - keeping host');
}
```

**Files to Modify:**
```
/server/index.js - socket.on('disconnect') around 3426
/server/index.js - socket.on('joinRoom') around 2180
```

---

### Issue #6: Maximum Session Age
- [ ] Add MAX_SESSION_AGE_HOURS constant (24 hours)
- [ ] In addParticipant(), check existing participant age
- [ ] If older than 24 hours, throw error with expiration message
- [ ] Client should handle this and require fresh join
- [ ] Test: Rejoin after 23 hours → works
- [ ] Test: Rejoin after 25 hours → rejected
- [ ] Add logging for session expirations

**Implementation Pattern:**
```javascript
async addParticipant(roomId, userId, socketId, role = 'player', customLobbyName = null) {
  const MAX_SESSION_AGE_HOURS = 24;
  
  // Check existing participation
  const { data: existing } = await this.adminClient
    .from('room_members')
    .select('joined_at')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .single();
  
  if (existing) {
    const ageHours = (Date.now() - new Date(existing.joined_at).getTime()) / (1000*60*60);
    if (ageHours > MAX_SESSION_AGE_HOURS) {
      throw new Error(
        `Session expired. Originally joined ${ageHours.toFixed(1)} hours ago`
      );
    }
  }
  
  // Continue with upsert...
}
```

**Files to Modify:**
```
/server/lib/supabase.js - addParticipant() around line 219
```

---

## MEDIUM Priority Issues

### Issue #7: Heartbeat Update Frequency
- [ ] Change from random probability to debouncing
- [ ] Modify statusSyncManager.js handleHeartbeat()
- [ ] Only update DB if lastDbUpdate > 10 seconds ago
- [ ] More accurate last_ping times
- [ ] Better for stale detection

**Current Code (line 98):**
```javascript
const shouldUpdateDb = Date.now() % 10 === 0;
```

**New Code:**
```javascript
const lastDbUpdate = heartbeat.lastDbUpdate || 0;
if (now - lastDbUpdate > 10000) {
  // Update DB
  heartbeat.lastDbUpdate = now;
}
```

**Files to Modify:**
```
/server/lib/statusSyncManager.js - handleHeartbeat() around line 98
```

---

### Issue #8: Room Status Audit Trail
- [ ] Already have room_events table
- [ ] Add automatic logging in updateRoom()
- [ ] Log old_status → new_status with timestamp
- [ ] Useful for debugging status issues
- [ ] Optional but recommended

**Pattern:**
```javascript
async updateRoom(roomId, updates) {
  const room = await this.getRoomById(roomId);
  const oldStatus = room?.status;
  
  const updated = await this.adminClient
    .from('rooms')
    .update({...updates, last_activity: new Date()})
    .eq('id', roomId);
  
  if (oldStatus !== updates.status && updates.status) {
    await this.logEvent(roomId, null, 'room_status_changed', {
      old_status: oldStatus,
      new_status: updates.status
    });
  }
}
```

**Files to Modify:**
```
/server/lib/supabase.js - updateRoom() around line 130
```

---

### Issue #9: Centralize Cleanup Configuration
- [ ] Create new file: `/server/config/cleanupConfig.js`
- [ ] Move all hardcoded thresholds there
- [ ] Current hardcodes at:
  - [ ] Line 3841 (periodic: 24h, 30m)
  - [ ] Line 3902 (offpeak: 2h, 15m)
  - [ ] Line 3833 (manual: 2h, 15m)

- [ ] Make configurable via environment variables
- [ ] Export as module
- [ ] Import in index.js

**New File Structure:**
```javascript
// /server/config/cleanupConfig.js
module.exports = {
  periodic: {
    interval: 10 * 60 * 1000,
    maxAgeHours: parseInt(process.env.CLEANUP_MAX_AGE_HOURS) || 24,
    maxIdleMinutes: parseInt(process.env.CLEANUP_MAX_IDLE_MINUTES) || 30
  },
  offPeak: {
    interval: 60 * 60 * 1000,
    hours: [2, 3, 4, 5],
    maxAgeHours: 2,
    maxIdleMinutes: 15
  }
};
```

**Files to Create:**
```
/server/config/cleanupConfig.js
```

**Files to Modify:**
```
/server/index.js - lines 3841, 3902 (use config instead)
```

---

## LOW Priority Issues

### Issue #10: Room Status Validation View
- [ ] Optional but provides safety net
- [ ] Create view: room_status_computed
- [ ] Computes actual status from member data
- [ ] Compare computed vs stored in queries
- [ ] Helps detect desync issues
- [ ] For monitoring/debugging, not critical

---

## Testing Checklist

### Unit Tests
- [ ] Test stale player detection
- [ ] Test grace window timer
- [ ] Test session age check
- [ ] Test room abandonment consistency
- [ ] Test host grace period
- [ ] Test heartbeat update frequency

### Integration Tests
- [ ] Full game flow with disconnects
- [ ] Multiple players, one disconnects
- [ ] Host reconnects within grace
- [ ] Host reconnects after grace
- [ ] Room cleanup doesn't delete active rooms
- [ ] Stale cleanup doesn't affect is_connected checks

### Load Tests
- [ ] 100 simultaneous players
- [ ] 1000 simultaneous disconnects
- [ ] Cleanup function performance
- [ ] Grace window timer overhead

### Scenarios to Test
- [ ] Player: disconnect → reconnect < 5 mins
- [ ] Player: disconnect → no reconnect, cleanup at 5 mins
- [ ] Host: disconnect → reconnect < 30 secs
- [ ] Host: disconnect → no reconnect at 30 secs
- [ ] Game: return from game, player disconnects < 30 secs (should ignore)
- [ ] Game: return from game, player disconnects > 30 secs (should work)
- [ ] Room: all players disconnect, mark abandoned
- [ ] Room: cleanup at 24 hours + 30 mins idle

---

## Deployment Checklist

- [ ] Create feature branch: `fix/status-management`
- [ ] Code review all changes
- [ ] Run full test suite
- [ ] Deploy to staging
- [ ] Monitor logs for 48 hours
- [ ] Verify metrics (stale cleanups, transfers, etc.)
- [ ] Get sign-off from team
- [ ] Deploy to production
- [ ] Monitor production for 1 week
- [ ] Document changes in CHANGELOG

---

## Rollback Plan

Each issue is self-contained and safe to rollback:

### Rollback Issue #1
- Disable cleanup function via SQL
- Remove Node.js periodic call
- Data remains unchanged

### Rollback Issue #2
- Clear all return_in_progress_until metadata values
- Queries will just skip grace window check (safe)

### Rollback Issue #3
- Change line 2977 back to 'returning'
- Cleanup logic still works

### Rollback Issue #5
- Remove hostTransferPending metadata
- New socket connects won't clear timers (safe)

### Rollback Issue #6
- Remove session age check
- Old behavior restored

---

## Monitoring & Alerts

### Metrics to Track
- [ ] Stale players cleaned per hour
- [ ] Rooms cleaned per cleanup cycle
- [ ] Failed cleanup attempts
- [ ] Host transfers per day
- [ ] Grace period hits vs misses
- [ ] Session rejoin distribution (age)

### Alerts to Set
- [ ] If no stale cleanups in 2 hours → check function
- [ ] If room cleanup fails 3x in a row → alert
- [ ] If host transfers > 10/hour → unusual activity
- [ ] If session rejoin age > 24h → something wrong

### Dashboard to Create
- [ ] Real-time connection count
- [ ] Rooms by status (lobby, in_game, abandoned)
- [ ] Players by connection status
- [ ] Grace window active count
- [ ] Recent status transitions

---

## Documentation Updates

- [ ] Add architecture doc for status management
- [ ] Document metadata fields used
- [ ] Document grace period behavior
- [ ] Document cleanup job schedule
- [ ] Add troubleshooting guide
- [ ] Update API docs if needed

---

**Total Estimated Time:**
- Critical issues: 6-8 hours
- High priority: 4-5 hours
- Medium priority: 2-3 hours
- Low priority: 1-2 hours
- **Total: 13-18 hours of development**

**Plus:**
- Testing: 8-10 hours
- Code review: 2-3 hours
- Deployment prep: 2-3 hours
- Monitoring: ongoing

---

Last Updated: 2025-11-20
Next Review: After implementation complete
