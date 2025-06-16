# DDF Server Update Required - Critical Fix

## Issue
The DDF server is still using Socket.io session IDs (`Oe8UDJqxDVWPr_wyAAAE`) instead of GameBuddies user UUIDs for API calls, causing "Player not found in room" errors.

## What Changed in GameBuddies
GameBuddies now sends the correct user UUID in the URL parameter `playerId`. The DDF server must use this instead of generating its own player IDs.

## Required Changes in DDF Server

### 1. Update URL Parameter Parsing
The DDF server now receives a `playerId` parameter that contains the GameBuddies user UUID:

```javascript
// OLD CODE (remove this)
const playerId = `player_${socket.id}`; // ❌ Wrong!

// NEW CODE (add this)
const urlParams = new URLSearchParams(window.location.search);
const playerId = urlParams.get('playerId'); // ✅ Correct GameBuddies UUID

// Validate the playerId exists
if (!playerId) {
  console.error('❌ Missing playerId parameter from GameBuddies');
  // Handle error appropriately
  return;
}

console.log('✅ Using GameBuddies playerId:', playerId);
```

### 2. Update All API Calls
Replace all instances where you use your own generated player IDs with the GameBuddies `playerId`:

```javascript
// Example: Player status update
async function updatePlayerStatus(status, reason) {
  // Use the playerId from URL parameters, not socket.id or generated IDs
  const response = await fetch(
    `https://gamebuddies.io/api/game/rooms/${roomCode}/players/${playerId}/status`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'your_api_key'
      },
      body: JSON.stringify({
        status: status,
        location: status === 'connected' ? 'game' : 'disconnected',
        reason: reason,
        gameData: {
          playerName: playerName,
          timestamp: new Date().toISOString()
        }
      })
    }
  );
}
```

### 3. Update Player Connection Tracking
If you're tracking players internally, use the GameBuddies playerId as the key:

```javascript
// OLD CODE
const players = new Map(); // keyed by socket.id

// NEW CODE  
const players = new Map(); // keyed by GameBuddies playerId

// When a player connects
players.set(playerId, {
  socketId: socket.id,
  playerName: playerName,
  gamebuddiesId: playerId, // Store the GameBuddies UUID
  connectedAt: new Date()
});
```

### 4. Update Disconnect Handling
Make sure disconnection events use the correct playerId:

```javascript
// When a player disconnects
socket.on('disconnect', async () => {
  // Find the player by socket ID to get their GameBuddies playerId
  const player = Array.from(players.values()).find(p => p.socketId === socket.id);
  
  if (player) {
    // Use the GameBuddies playerId for the API call
    await updatePlayerStatus('disconnected', 'socket_disconnect');
    players.delete(player.gamebuddiesId);
  }
});
```

## Example URL Format
Your DDF server now receives URLs like:
```
https://ddf-server.onrender.com/?room=879238&players=2&name=asdsa&playerId=5d8ce922-8fce-421d-91ce-29a8613c9432
```

The `playerId` parameter (`5d8ce922-8fce-421d-91ce-29a8613c9432`) is what you must use for all GameBuddies API calls.

## Testing the Fix
1. **Check URL parsing**: Log the `playerId` parameter to ensure it's a UUID format
2. **Test API calls**: Verify that status updates return success instead of 404 errors
3. **Check GameBuddies logs**: No more "Player not found in room" errors should appear

## Expected Results After Fix
- ✅ Player status updates will succeed (200 response instead of 404)
- ✅ GameBuddies lobby will show correct player status (connected/disconnected)
- ✅ Real-time synchronization between DDF and GameBuddies will work
- ✅ No more "Player not found in room" errors in logs

## Debugging
If you're still getting errors after the update:

1. **Log the playerId**: Make sure it's a UUID format like `5d8ce922-8fce-421d-91ce-29a8613c9432`
2. **Check the room code**: Ensure you're using the correct room code in API calls
3. **Verify API key**: Make sure your API key is still valid
4. **Test with a fresh room**: Create a new GameBuddies room and test the flow

## Contact
If you need help implementing these changes, the GameBuddies team can assist with the integration. 