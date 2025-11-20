# GameBuddies Player & Room Status Management Report
**Analysis Date:** November 20, 2025
**Files Analyzed:** 
- `/server/index.js` (4095 lines)
- `/server/lib/supabase.js` (895 lines)
- `/server/lib/connectionManager.js` (190 lines)
- `/server/lib/statusSyncManager.js` (495 lines)

---

## 1. PLAYER CONNECTION STATUS MANAGEMENT

### 1.1 How `is_connected` is Set/Updated in room_members

**Primary Location:** `/server/lib/supabase.js`

#### Adding Participant (Join/Rejoin)
```javascript
// Line 219-255 in supabase.js
async addParticipant(roomId, userId, socketId, role = 'player', customLobbyName = null) {
  const { data: participant, error } = await this.adminClient
    .from('room_members')
    .upsert({
      room_id: roomId,
      user_id: userId,
      role: role,
      is_connected: true,    // ← Always set to TRUE on join
      current_location: 'lobby',
      last_ping: new Date().toISOString(),
      socket_id: socketId,
      custom_lobby_name: customLobbyName
    }, {
      onConflict: 'room_id, user_id'
    })
    .select()
    .single();
}
```

#### Updating Connection Status
```javascript
// Line 277-313 in supabase.js
async updateParticipantConnection(userId, socketId, status = 'connected', customLobbyName = null) {
  const updateData = {
    is_connected: status === 'connected',  // ← Boolean conversion
    last_ping: new Date().toISOString(),
    socket_id: status === 'connected' ? socketId : null
  };

  // Location transitions
  if (status === 'disconnected') {
    updateData.current_location = 'disconnected';
  } else if (status === 'connected') {
    updateData.current_location = 'lobby';
  } else if (status === 'game') {
    updateData.is_connected = true;  // ← Still connected while in external game
    updateData.current_location = 'game';
    updateData.socket_id = null;     // ← No socket while in game
  }
}
```

**Key Finding:** `is_connected` serves two purposes:
1. **WebSocket Connection Status:** `false` when socket disconnects
2. **Session Status:** `true` when in external game (socket_id = null, current_location = 'game')

### 1.2 When Players Are Marked Disconnected

**Socket Disconnect Handler:** `/server/index.js`, lines 3426-3577

```javascript
// Line 3426-3450
socket.on('disconnect', async () => {
  const connection = connectionManager.removeConnection(socket.id);
  if (connection?.userId) {
    let connectionStatus = 'disconnected';
    
    if (room && disconnectingParticipant) {
      // If room is in_game and player marked as in_game → keep 'game' status
      if (room.status === 'in_game' && disconnectingParticipant.in_game === true) {
        connectionStatus = 'game';  // ← Still in external game
      } else {
        connectionStatus = 'disconnected';
      }
    }

    // Update DB with appropriate status
    await db.updateParticipantConnection(
      connection.userId, 
      socket.id, 
      connectionStatus
    );
  }
});
```

**Explicit Leave Handler:** `/server/index.js`, lines 2900-2991

```javascript
// Line 2900-2930
socket.on('leaveRoom', async (data) => {
  // Removes player from room_members table entirely
  await db.removeParticipant(connection.roomId, connection.userId);
  
  // If no connected players remain, mark room as 'returning'
  const connectedPlayers = allPlayers.filter(p => p.isConnected);
  if (connectedPlayers.length === 0) {
    await db.updateRoom(connection.roomId, {
      status: 'returning'
    });
  }
});
```

### 1.3 Reconnection Handling

**Rejoin Handler:** `/server/index.js`, lines 2180-2647

**Issue: Race Condition in Rejoin Logic**
```javascript
// Line 2200-2230
const lockAcquired = connectionManager.acquireLock(playerName, roomCode, socket.id);
if (!lockAcquired) {
  socket.emit('error', { message: 'Another attempt to join this room is in progress' });
  return;
}

try {
  // Check if user already exists
  const existingParticipant = room.participants?.find(p => p.user_id === user.id);
  
  if (existingParticipant) {
    console.log(`🔄 User already in room as participant`);
    
    // Update is_connected BACK to true
    await db.updateParticipantConnection(user.id, socket.id, 'connected');
    
    // Clean up stale connections
    const userConnections = connectionManager.getUserConnections(user.id)
      .filter(conn => conn.socketId !== socket.id);
    
    userConnections.forEach(staleConn => {
      console.log(`🧹 Removing stale connection for user ${user.id}: ${staleConn.socketId}`);
      connectionManager.removeConnection(staleConn.socketId);
    });
  }
} finally {
  connectionManager.releaseLock(playerName, roomCode);  // ← ALWAYS released
}
```

**What Works Well:**
- Lock mechanism prevents race conditions
- Cleans up stale connections
- Updates `is_connected` back to true
- Maintains `last_ping` timestamp

**Critical Issue:** No maximum age check for reconnections
- A player could disappear for hours and still rejoin without restrictions
- No verification that session hasn't actually ended

### 1.4 Cleanup When Players Don't Reconnect

**Grace Window Logic:** `/server/index.js`, lines 1032-1049 and 1381-1394

```javascript
// Line 1032-1049 (Single player status update)
const graceUntil = roomMeta?.metadata?.return_in_progress_until;
if (graceUntil && Date.now() < new Date(graceUntil).getTime()) {
  console.log(`⚠️ Skipping disconnect for ${playerId} due to active return_in_progress window`);
  return;
}

// ISSUE: return_in_progress_until is checked but NEVER SET ANYWHERE
// This grace window feature is incomplete/unused
```

**Stale Connection Cleanup:** `/server/lib/connectionManager.js`, lines 119-149

```javascript
// Line 119-149
cleanupStaleConnections(maxIdleMs = 300000) { // 5 minutes default
  const now = Date.now();
  const staleConnections = [];
  
  for (const [socketId, connection] of this.activeConnections) {
    const idleTime = now - connection.lastActivity.getTime();
    if (idleTime > maxIdleMs) {
      staleConnections.push(socketId);
      this.activeConnections.delete(socketId);  // ← Removes from MEMORY ONLY
      // ISSUE: Does NOT update database!
    }
  }
  
  // Also cleans up old locks (>10 seconds)
  // Also cleans up rate limit data (>60 seconds)
}
```

**CRITICAL FINDING:** Stale connection cleanup only removes from in-memory map, NOT from database:
- `room_members.is_connected` remains `true` even after cleanup
- `last_ping` is never updated for disconnected players
- Players appear "online" indefinitely

**Database Cleanup:** `/server/lib/supabase.js`, lines 557-750

```javascript
// Line 557-640
async cleanupInactiveRooms(options = {}) {
  const {
    maxAgeHours = 24,        // Rooms older than 24 hours
    maxIdleMinutes = 30,     // Rooms idle for 30 minutes
    includeAbandoned = true,
    includeCompleted = true,
    dryRun = false
  } = options;

  // Get rooms matching cleanup conditions
  const { data: roomsToCleanup } = await this.adminClient
    .from('rooms')
    .select()
    .or(`created_at.lt.${maxAgeDate},last_activity.lt.${maxIdleDate}`);

  // PROTECTION: Don't cleanup active game rooms with connected players
  if (room.status === 'in_game' && hasConnectedPlayers && room.current_game !== 'lobby') {
    console.log(`⚠️ Protecting active game room`);
    return false; // Skip deletion
  }
}

// Line 752-787: Delete room cascade
async deleteRoom(roomId) {
  // 1. Delete game_sessions
  // 2. Delete room_events
  // 3. Delete room_members
  // 4. Delete rooms record
  // All with proper foreign key order
}
```

---

## 2. ROOM STATUS MANAGEMENT

### 2.1 Room Status Transitions

**Defined Statuses** (Line 110 in migration 001_add_v2_tables.sql):
```sql
CHECK (status IN ('lobby', 'in_game', 'returning', 'abandoned', 'finished'))
```

**Status Transition Paths:**

```
┌─────────────────────────────────────────────────┐
│                  Room Status Flow                │
├─────────────────────────────────────────────────┤
│                                                  │
│  lobby ────────────────────> in_game           │
│    ↑                            │                │
│    │                            │                │
│    └────── <player_returns> ────┘               │
│                                                  │
│  lobby/in_game ──> abandoned                   │
│         (no connected players)                  │
│                                                  │
│  lobby ──> returning                           │
│     (explicit leaveRoom with no players)       │
│                                                  │
└─────────────────────────────────────────────────┘
```

### 2.2 When Rooms Are Marked Abandoned

**Location 1: Socket Disconnect** (`/server/index.js`, lines 3548-3567)

```javascript
// Line 3548-3567
socket.on('disconnect', async () => {
  if (connection.roomId && room) {
    const connectedPlayers = updatedRoom?.participants?.filter(p => p.is_connected) || [];
    if (connectedPlayers.length === 0) {
      console.log(`🗑️ [ROOM CLEANUP] Room ${room.room_code} has no connected players`);

      // Mark room as abandoned
      const { error: updateError } = await db.adminClient
        .from('rooms')
        .update({
          status: 'abandoned',
          updated_at: new Date().toISOString()
        })
        .eq('id', room.id);
    }
  }
});
```

**Location 2: Explicit Leave** (`/server/index.js`, lines 2973-2979)

```javascript
// Line 2973-2979
socket.on('leaveRoom', async (data) => {
  const connectedPlayers = allPlayers.filter(p => p.isConnected);
  if (connectedPlayers.length === 0) {
    await db.updateRoom(connection.roomId, {
      status: 'returning'  // ← NOTE: Uses 'returning', not 'abandoned'
    });
  }
});
```

**INCONSISTENCY FOUND:** 
- Socket disconnect marks room as `'abandoned'`
- Explicit leave marks room as `'returning'`
- These should be consistent!

### 2.3 Auto-Cleanup of Empty Rooms

**Periodic Cleanup Jobs** (`/server/index.js`, lines 3866-3915)

```javascript
// Line 3866-3892: Every 10 minutes
setInterval(async () => {
  console.log('🧹 Running periodic cleanup...');
  const roomCleanup = await db.cleanupInactiveRooms({
    maxAgeHours: 24,
    maxIdleMinutes: 30,
    includeAbandoned: true,
    includeCompleted: true,
    dryRun: false
  });
  console.log(`Periodic cleanup: ${roomCleanup.cleaned} rooms cleaned`);
}, 10 * 60 * 1000);

// Line 3893-3915: More aggressive off-peak (once per hour, 2-6 AM)
setInterval(async () => {
  const hour = new Date().getHours();
  if (hour >= 2 && hour < 6) {
    console.log('🌙 Running off-peak aggressive cleanup...');
    const roomCleanup = await db.cleanupInactiveRooms({
      maxAgeHours: 2,       // Much more aggressive
      maxIdleMinutes: 15,   // Much more aggressive
      includeAbandoned: true,
      includeCompleted: true
    });
  }
}, 60 * 60 * 1000);
```

**API Endpoints for Cleanup:**

```javascript
// Line 3606-3638: Manual cleanup trigger
app.post('/api/admin/cleanup-rooms', async (req, res) => {
  const result = await db.cleanupInactiveRooms({...});
  res.json({ success: true, cleaned: result.cleaned });
});

// Line 3833-3857: Immediate cleanup trigger
app.post('/api/admin/cleanup-now', async (req, res) => {
  const roomCleanup = await db.cleanupInactiveRooms({
    maxAgeHours: 2,
    maxIdleMinutes: 15,
    dryRun: false
  });
});
```

---

## 3. POTENTIAL ISSUES & PROBLEMS

### 3.1 CRITICAL: Stale Player Data Not Cleaned from Database

**Issue:** When a socket disconnects, `connectionManager` removes it from memory but `room_members.is_connected` is NOT reliably updated.

**Evidence:**
- Line 119-149 in `connectionManager.js`: Stale cleanup only touches memory
- No database query to reset stale `room_members` records
- Players appear online indefinitely

**Impact:**
- Public room listings show ghost players
- Room participation counts are incorrect
- Cannot identify truly active rooms

**Example Scenario:**
```
1. Player joins room → is_connected = true
2. Network drops (no graceful disconnect)
3. Server removes connection from memory (but only memory!)
4. room_members.is_connected still = true
5. Player appears in room forever
6. Next cleanup cycle checks is_connected=true and protects room from deletion
```

### 3.2 CRITICAL: Race Condition in Status Updates

**Issue:** Multiple status update endpoints can conflict

**Evidence:** `/server/index.js`, lines 1013-1078 (single player) and 1323-1418 (bulk update)

```javascript
// Line 1024-1058: Single player disconnect handling
case 'disconnected':
  const graceUntil = roomMeta?.metadata?.return_in_progress_until;
  if (graceUntil && Date.now() < new Date(graceUntil).getTime()) {
    // Skip disconnect if grace window active
    return;
  }
  updateData.is_connected = false;
  updateData.current_location = 'disconnected';
  break;

// Line 1381-1394: Bulk update disconnect handling
if (graceUntil && Date.now() < new Date(graceUntil).getTime()) {
  // Different grace window check in bulk update
  results.push({ playerId, success: true, skipped: true });
  break;
}
```

**Problem:** `return_in_progress_until` is checked but NEVER SET in the codebase.
- Search result: Only 4 occurrences, all reading, NONE writing
- This grace window feature is incomplete!

### 3.3 MEDIUM: Inconsistent Room Status Transitions

**Issue:** Two different code paths mark rooms differently when empty:

```javascript
// Path 1: Socket disconnect (Line 3557)
status: 'abandoned'

// Path 2: Explicit leave (Line 2977)
status: 'returning'

// Path 3: Host location change (Line 1734)
targetStatus = 'in_game'
```

**This causes:**
- Room status doesn't reliably reflect actual state
- Cleanup logic must handle multiple "empty room" statuses
- Confusing status lifecycle

### 3.4 MEDIUM: Missing Graceful Host Handoff

**Evidence:** `/server/index.js`, lines 3470-3509

```javascript
// Line 3478-3490: No grace period for host transfer
if (isDisconnectingHost && room) {
  const otherConnectedPlayers = room.participants?.filter(p => 
    p.user_id !== connection.userId && p.is_connected === true
  ) || [];
  
  if (otherConnectedPlayers.length > 0) {
    // Transfer host IMMEDIATELY
    newHost = await db.autoTransferHost(connection.roomId, connection.userId);
  }
}
```

**Problem:** 
- Host transfers instantly on disconnect
- No chance for host to reconnect within grace period
- If host's connection is unstable, room becomes uncontrollable

### 3.5 MEDIUM: Incomplete Disconnect Grace Window

**Evidence:** Lines 1032, 1034, 1383, 1385 all check `return_in_progress_until` but it's never written.

```javascript
// Multiple locations check but never write
const graceUntil = roomMeta?.metadata?.return_in_progress_until;
if (graceUntil && Date.now() < new Date(graceUntil).getTime()) {
  // Skip disconnect... but this never happens because graceUntil is never set!
}
```

**Should write here but doesn't:** When players return from external game (status 'returning'), should set:
```javascript
metadata.return_in_progress_until = new Date(Date.now() + 30000); // 30 second grace
```

### 3.6 MEDIUM: Last Ping Not Updated on Reconnect

**Evidence:** `/server/index.js`, lines 2200-2230

```javascript
// When rejoining, only calls updateParticipantConnection
await db.updateParticipantConnection(user.id, socket.id, 'connected');
```

This DOES update `last_ping` (see supabase.js line 281), so this is actually OK.

### 3.7 LOW: StatusSyncManager Heartbeat May Not Persist

**Evidence:** `/server/lib/statusSyncManager.js`, lines 86-120

```javascript
// Line 97-99: Only updates DB every ~10th heartbeat
const shouldUpdateDb = Date.now() % 10 === 0;
if (shouldUpdateDb) {
  // Update last_ping in database
}
```

**Issue:** 
- Client heartbeats happen frequently (~10/second?)
- But only every 10th one updates database
- `last_ping` may not accurately reflect actual activity

### 3.8 LOW: Host Transfer Doesn't Check is_connected Status Carefully

**Evidence:** `/server/lib/supabase.js`, lines 411-421

```javascript
// Line 419-421: Selects oldest connected participant
.eq('is_connected', true)
.order('joined_at', { ascending: true }); // Oldest first
```

**Potential Issue:** 
- If a "connected" player's connection is actually stale (not updated)
- They could become host even though actually disconnected

---

## 4. RECOMMENDATIONS

### 4.1 URGENT: Implement Database-Level Stale Connection Cleanup

**Current Problem:** Stale connections only cleaned from memory

**Solution:** Create database job to mark stale players as disconnected

```sql
-- Add to Supabase migrations
CREATE OR REPLACE FUNCTION cleanup_stale_players()
RETURNS void AS $$
BEGIN
  -- Mark players as disconnected if last_ping older than 5 minutes
  UPDATE room_members
  SET 
    is_connected = false,
    current_location = 'disconnected'
  WHERE 
    is_connected = true 
    AND (last_ping IS NULL OR last_ping < NOW() - INTERVAL '5 minutes');
  
  -- Also log this cleanup
  INSERT INTO room_events (room_id, event_type, event_data, created_at)
  SELECT DISTINCT room_id, 'stale_player_cleanup', 
         jsonb_build_object('count', COUNT(*)), NOW()
  FROM room_members
  WHERE is_connected = false;
END;
$$ LANGUAGE plpgsql;

-- Run every 5 minutes
SELECT cron.schedule('cleanup_stale_players', '*/5 * * * *', 'SELECT cleanup_stale_players()');
```

**Implementation in Node.js:**
```javascript
// Add to index.js periodically
setInterval(async () => {
  try {
    const { data, error } = await db.adminClient.rpc('cleanup_stale_players');
    if (error) throw error;
    console.log('✅ Stale players cleaned from database');
  } catch (error) {
    console.error('❌ Stale player cleanup failed:', error);
  }
}, 5 * 60 * 1000); // Every 5 minutes
```

### 4.2 URGENT: Fix Inconsistent Room Abandonment Status

**Current Problem:** Different code paths use 'abandoned' vs 'returning'

**Solution:** Standardize on single status, update cleanup logic

```javascript
// In /server/index.js

// CHANGE: Line 2977 from 'returning' to 'abandoned'
socket.on('leaveRoom', async (data) => {
  if (connectedPlayers.length === 0) {
    await db.updateRoom(connection.roomId, {
      status: 'abandoned'  // ← Was 'returning', now consistent
    });
  }
});

// Update cleanup logic to handle only 'abandoned'
async cleanupInactiveRooms(options = {}) {
  // Remove 'returning' from status transitions
  // Just use 'abandoned' for all empty rooms
}
```

### 4.3 URGENT: Implement Proper Disconnect Grace Window

**Current Problem:** `return_in_progress_until` is checked but never set

**Solution:** Set grace window when players return from external game

```javascript
// In /server/index.js, where players return from game

socket.on('playerReturnToLobby', async (data) => {
  // After updating player status to 'lobby'...
  
  // Set grace window to ignore disconnects for 30 seconds
  await db.updateRoom(room.id, {
    metadata: {
      ...room.metadata,
      return_in_progress_until: new Date(Date.now() + 30000).toISOString()
    }
  });
  
  // Clear grace window after 30 seconds
  setTimeout(async () => {
    const currentRoom = await db.getRoomById(room.id);
    if (currentRoom?.metadata?.return_in_progress_until) {
      await db.updateRoom(room.id, {
        metadata: {
          ...currentRoom.metadata,
          return_in_progress_until: null
        }
      });
    }
  }, 30000);
});
```

### 4.4 HIGH: Add Host Reconnection Grace Period

**Current Problem:** Host transfers immediately on disconnect

**Solution:** Wait before transferring if host might return

```javascript
// In /server/index.js socket.on('disconnect')

const HOST_GRACE_PERIOD = 30000; // 30 seconds

socket.on('disconnect', async () => {
  if (isDisconnectingHost && room) {
    console.log(`⏳ Host disconnected - starting ${HOST_GRACE_PERIOD}ms grace period`);
    
    // Store pending host transfer in room metadata
    const hostTransferPending = {
      originalHostId: connection.userId,
      initiatedAt: Date.now(),
      graceUntilMs: HOST_GRACE_PERIOD
    };
    
    await db.updateRoom(room.id, {
      metadata: {
        ...room.metadata,
        hostTransferPending
      }
    });
    
    // If host reconnects within grace period, cancel transfer
    const graceTimer = setTimeout(async () => {
      const currentRoom = await db.getRoomById(room.id);
      const hostStillOffline = !currentRoom.participants
        .find(p => p.user_id === connection.userId)?.is_connected;
      
      if (hostStillOffline) {
        console.log(`👑 Grace period expired - transferring host`);
        const newHost = await db.autoTransferHost(room.id, connection.userId);
        
        // Clear pending flag
        await db.updateRoom(room.id, {
          metadata: {
            ...currentRoom.metadata,
            hostTransferPending: null
          }
        });
      }
    }, HOST_GRACE_PERIOD);
    
    // Store timeout ID for cleanup
    hostTransferTimers.set(room.id, graceTimer);
  }
});
```

### 4.5 HIGH: Add Maximum Session Age

**Current Problem:** Players can rejoin after hours/days without restriction

**Solution:** Implement session expiration

```javascript
// In /server/lib/supabase.js

const MAX_SESSION_AGE_HOURS = 24;

async addParticipant(roomId, userId, socketId, role = 'player', customLobbyName = null) {
  // Check if player is rejoining after too long
  const { data: existing } = await this.adminClient
    .from('room_members')
    .select('joined_at')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .single();
  
  if (existing) {
    const sessionAge = (Date.now() - new Date(existing.joined_at).getTime()) / (1000 * 60 * 60);
    if (sessionAge > MAX_SESSION_AGE_HOURS) {
      throw new Error(`Session expired. Original join was ${sessionAge.toFixed(1)} hours ago`);
    }
  }
  
  // Continue with normal add...
}
```

### 4.6 MEDIUM: Improve StatusSyncManager Heartbeat Update Frequency

**Current Problem:** Only updates DB every 10th heartbeat

**Solution:** Use debouncing instead of random probability

```javascript
// In /server/lib/statusSyncManager.js

async handleHeartbeat(playerId, roomCode, socketId, metadata = {}) {
  const heartbeatKey = `${playerId}_${roomCode}`;
  const now = Date.now();
  
  const heartbeat = this.heartbeats.get(heartbeatKey) || {};
  
  // Only update DB if last update was more than 10 seconds ago
  const lastUpdate = heartbeat.lastDbUpdate || 0;
  if (now - lastUpdate > 10000) {
    await this.db.adminClient
      .from('room_members')
      .update({ last_ping: new Date().toISOString() })
      .eq('user_id', playerId)
      .eq('room_id', roomId);
    
    heartbeat.lastDbUpdate = now;
  }
  
  this.heartbeats.set(heartbeatKey, {
    ...heartbeat,
    lastHeartbeat: now,
    socketId,
    metadata
  });
}
```

### 4.7 MEDIUM: Add Room Status Validation on Queries

**Current Problem:** Can't trust room status consistency

**Solution:** Add view or stored procedure to compute status

```sql
-- Add to migrations
CREATE OR REPLACE VIEW room_status_computed AS
SELECT 
  r.id,
  r.room_code,
  CASE 
    WHEN COUNT(CASE WHEN rm.is_connected = true THEN 1 END) = 0 
    THEN 'abandoned'
    
    WHEN COUNT(CASE WHEN rm.in_game = true THEN 1 END) > 0 
      AND COUNT(CASE WHEN rm.current_location = 'game' THEN 1 END) > 0
    THEN 'in_game'
    
    ELSE 'lobby'
  END AS computed_status,
  r.status AS stored_status,
  COUNT(CASE WHEN rm.is_connected = true THEN 1 END) AS connected_count,
  COUNT(CASE WHEN rm.in_game = true THEN 1 END) AS in_game_count,
  COUNT(*) AS total_members
FROM rooms r
LEFT JOIN room_members rm ON r.id = rm.room_id
GROUP BY r.id, r.room_code, r.status;
```

### 4.8 MEDIUM: Add Audit Trail for Status Changes

**Already Partially Implemented:** `room_events` table exists (line 113-125 in migration)

**Enhancement:** Automatically log all status changes

```javascript
// In supabase.js updateRoom method

async updateRoom(roomId, updates) {
  const room = await this.getRoomById(roomId);
  const oldStatus = room?.status;
  const newStatus = updates.status;
  
  // Perform update
  const updated = await this.adminClient
    .from('rooms')
    .update({...updates, last_activity: new Date().toISOString()})
    .eq('id', roomId)
    .select().single();
  
  // Log status change if it occurred
  if (oldStatus !== newStatus && newStatus) {
    await this.logEvent(roomId, null, 'room_status_changed', {
      old_status: oldStatus,
      new_status: newStatus,
      changed_by: 'system',
      timestamp: new Date().toISOString()
    });
  }
  
  return updated;
}
```

### 4.9 LOW: Add Configuration for Cleanup Thresholds

**Current Problem:** Cleanup thresholds hardcoded in 3 places

**Solution:** Centralize in configuration

```javascript
// Create config file
const ROOM_CLEANUP_CONFIG = {
  periodic: {
    interval: 10 * 60 * 1000,  // 10 minutes
    maxAgeHours: 24,
    maxIdleMinutes: 30
  },
  offPeak: {
    interval: 60 * 60 * 1000,  // 1 hour
    hours: [2, 3, 4, 5],        // 2-6 AM
    maxAgeHours: 2,
    maxIdleMinutes: 15
  },
  manual: {
    maxAgeHours: 2,
    maxIdleMinutes: 15
  },
  disconnectionThreshold: 5 * 60 * 1000,  // 5 minutes
  hostGracePeriod: 30 * 1000  // 30 seconds
};
```

---

## 5. SUMMARY TABLE

| Issue | Severity | Type | Location | Impact |
|-------|----------|------|----------|--------|
| Stale connections not cleaned from DB | CRITICAL | Data Consistency | supabase.js:119 | Ghost players in rooms |
| Race condition in status updates | CRITICAL | Race Condition | index.js:1024 | Conflicting player states |
| Missing grace window for returns | URGENT | Logic Error | index.js:1032 | Premature disconnects during return |
| Inconsistent room abandonment | URGENT | Status Transition | index.js:2977 vs 3557 | Unclear room lifecycle |
| No host reconnection grace | HIGH | Missing Feature | index.js:3478 | Rooms uncontrollable if host drops |
| Missing session age limits | HIGH | Data Growth | supabase.js:219 | Memory bloat, stale rejoin attempts |
| Heartbeat DB update frequency | MEDIUM | Performance | statusSyncManager.js:98 | Inaccurate last_ping times |
| Hardcoded cleanup thresholds | MEDIUM | Maintainability | index.js:3841 | Hard to reconfigure |
| Return grace window incomplete | MEDIUM | Logic Error | index.js:1383 | Grace window never actually works |
| Status computation not trusted | LOW | Data Quality | All queries | Possible status desync |

---

## 6. CODE SNIPPETS FOR QUICK REFERENCE

### Current Player Status Check Pattern
```javascript
// This pattern appears throughout the code
const connectedPlayers = room.participants?.filter(p => p.is_connected) || [];
const totalPlayers = room.participants?.length || 0;
```

### Current Room Cleanup Check Pattern
```javascript
// Room protection logic (line 665)
if (room.status === 'in_game' && hasConnectedPlayers && room.current_game !== 'lobby') {
  return false; // Don't cleanup
}
```

### Current Status Update Pattern
```javascript
// Typical pattern (line 1015-1078)
switch (status) {
  case 'connected':
    updateData.is_connected = true;
    break;
  case 'in_game':
    updateData.is_connected = true;
    updateData.in_game = true;
    break;
  case 'disconnected':
    updateData.is_connected = false;
    updateData.current_location = 'disconnected';
    break;
}
```

---

**Report Generated:** 2025-11-20
**Total Files Analyzed:** 4
**Total Lines Analyzed:** 5,675
**Critical Issues Found:** 3
**Recommended Actions:** 9
