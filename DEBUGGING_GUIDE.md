# GameBuddies Debugging Guide

This guide helps you debug issues with room creation, joining, and rejoining in GameBuddies.

## Enhanced Debugging Features Added

### 1. Server-Side Debugging

**Room Joining/Rejoining (`server/index.js`)**
- Enhanced logging with `[REJOINING DEBUG]` tags
- Detailed connection analysis and participant tracking
- Room state verification and cleanup protection
- Error handling with debug information

**Room Cleanup (`server/lib/supabase.js`)**
- `[CLEANUP DEBUG]` tags for room cleanup operations
- Protection for active game rooms with connected players
- Detailed analysis of each room before cleanup
- Failed cleanup tracking

### 2. Client-Side Debugging

**Homepage (`client/src/pages/HomePage.js`)**
- `[HOMEPAGE DEBUG]` tags for URL parameter handling
- Session storage tracking during returns from games
- Auto-rejoin flow debugging

**RoomLobby (`client/src/components/RoomLobby.js`)**
- `[LOBBY DEBUG]` tags for socket connections
- Detailed error handling with user-friendly messages
- Session storage setup verification when starting games
- Host status tracking

**Return Handler (`client/src/components/GameBuddiesReturnHandler.js`)**
- `[RETURN HANDLER DEBUG]` tags for GM-initiated returns
- Server URL determination debugging
- Socket connection and event tracking

**Join Room (`client/src/components/JoinRoom.js`)**
- `[JOIN DEBUG]` tags for room joining attempts
- Server connection debugging
- Error code specific handling

### 3. Debug Panel

A new `DebugPanel` component provides real-time system state monitoring:

- **Activation**: Shows in development mode or when URL contains `?debug=true`
- **Features**:
  - Real-time session storage monitoring
  - Current URL and environment info
  - Quick actions to log state or clear session
  - Visual indicator for active GameBuddies sessions

## Common Rejoining Issues & Debugging Steps

### Issue: "Room not found" when returning from game

**Debugging Steps:**

1. **Check Debug Panel**: Add `?debug=true` to your URL to see the debug panel
2. **Monitor Session Storage**: Verify GameBuddies session data is present:
   ```
   gamebuddies_roomCode
   gamebuddies_playerName
   gamebuddies_isHost
   gamebuddies_gameType
   gamebuddies_returnUrl
   ```

3. **Check Server Logs**: Look for `[REJOINING DEBUG]` and `[CLEANUP DEBUG]` messages:
   ```bash
   # Search for room-specific logs
   grep "ABC123" server.log | grep -E "(REJOINING|CLEANUP)"
   
   # Check cleanup operations
   grep "CLEANUP DEBUG" server.log
   ```

4. **Verify Room State**: Check if room was cleaned up:
   ```bash
   # Look for room protection logs
   grep "CLEANUP PROTECTION" server.log
   
   # Check for successful room joins
   grep "REJOINING SUCCESS" server.log
   ```

### Issue: Session storage lost during game play

**Debugging Steps:**

1. **Check Game Start**: Look for session setup logs:
   ```bash
   grep "Session storage verification" browser-console.log
   ```

2. **Monitor Session During Game**: Use browser dev tools to check if session storage persists during game play

3. **Verify Return Handler**: Check if return handler initializes:
   ```bash
   grep "RETURN HANDLER DEBUG" browser-console.log
   ```

### Issue: Connection problems during rejoining

**Debugging Steps:**

1. **Check Server URL Detection**: Look for URL determination logs:
   ```bash
   grep "Determining server URL" browser-console.log
   ```

2. **Monitor Socket Connection**: Check connection status:
   ```bash
   grep -E "(Connected|Connection error)" browser-console.log
   ```

3. **Verify Event Handling**: Check if events are received:
   ```bash
   grep "roomJoined\|error\|returnToLobbyInitiated" browser-console.log
   ```

## Using the Debug Panel

### Enabling Debug Panel

1. **Development Mode**: Automatically shown
2. **Production**: Add `?debug=true` to any URL
3. **Quick Enable**: Add `?debug=1` for shorter URL

### Debug Panel Features

- **System State**: Real-time view of current state
- **Log State**: Dumps complete state to browser console
- **Clear Session**: Removes all GameBuddies session data
- **Session Indicator**: Green box shows active GameBuddies session

### Example Debug Session

```javascript
// Enable detailed logging in browser console
localStorage.setItem('debug', 'true');

// Monitor specific debug categories
console.log('Watching for rejoining issues...');

// Check session storage
Object.keys(sessionStorage).filter(k => k.startsWith('gamebuddies_'))
  .forEach(key => console.log(`${key}: ${sessionStorage.getItem(key)}`));
```

## Server-Side Debugging Commands

### Manual Room Cleanup

```bash
# Check room stats
curl http://localhost:3033/api/admin/room-stats

# Dry run cleanup
curl -X POST http://localhost:3033/api/admin/cleanup-rooms \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true, "maxIdleMinutes": 15}'

# Aggressive cleanup
curl -X POST http://localhost:3033/api/admin/cleanup-now
```

### Database Queries

```sql
-- Check active rooms
SELECT room_code, status, created_at, last_activity, current_players 
FROM game_rooms 
WHERE status = 'active' 
ORDER BY last_activity DESC;

-- Check participants in specific room
SELECT p.*, u.username 
FROM room_participants p 
JOIN user_profiles u ON p.user_id = u.id 
WHERE p.room_id = (SELECT id FROM game_rooms WHERE room_code = 'ABC123');
```

## Key Debug Log Patterns

### Successful Rejoin Flow

```
[HOMEPAGE DEBUG] Found GameBuddies session data
[RETURN HANDLER DEBUG] Initializing with session data
[RETURN HANDLER DEBUG] Connected to GameBuddies server
[REJOINING DEBUG] Join request received
[REJOINING DEBUG] Room found
[REJOINING DEBUG] Rejoining as disconnected participant
[REJOINING SUCCESS] PlayerName rejoined room ABC123
```

### Room Cleanup Protection

```
[CLEANUP DEBUG] Room analysis: ABC123
[CLEANUP PROTECTION] Protecting active game room: ABC123
```

### Failed Rejoin - Room Not Found

```
[REJOINING DEBUG] Room ABC123 not found in database
[CLEANUP DEBUG] Successfully cleaned up room: ABC123
```

## Troubleshooting Tips

1. **Enable Debug Panel**: Always start with `?debug=true` to monitor real-time state
2. **Check Session Storage**: Verify session data persists through game navigation
3. **Monitor Cleanup Logs**: Check if rooms are being cleaned up while playing
4. **Verify Server URLs**: Ensure client connects to correct server
5. **Check Error Codes**: Look for specific error codes in debug logs

## Performance Impact

The debugging features add minimal overhead:
- Debug Panel: Only shows in development or with debug param
- Console Logs: Can be disabled in production builds
- Server Logs: Use structured logging that can be filtered

## Reporting Issues

When reporting rejoining issues, include:

1. Debug Panel screenshot or state dump
2. Browser console logs (filtered for GameBuddies)
3. Server logs around the time of the issue
4. Steps to reproduce the scenario
5. Expected vs actual behavior

This comprehensive debugging system should help identify exactly where the rejoining process fails and allow for targeted fixes. 