# External Game Status API

This document describes the API endpoints that external games (like DDF) can use to update player status in GameBuddies.

## Authentication

All API endpoints require an API key in the `X-API-Key` header:

```
X-API-Key: your_api_key_here
```

## Endpoints

### 1. Individual Player Status Update

**Endpoint:** `POST /api/game/rooms/:roomCode/players/:playerId/status`

Updates the status of a single player in a GameBuddies room.

#### Parameters
- `roomCode` (URL param): The 6-character room code
- `playerId` (URL param): The user ID of the player

#### Request Body
```json
{
  "status": "connected|disconnected|in_game|returned_to_lobby",
  "location": "game|lobby|disconnected",
  "reason": "Optional reason for status change",
  "gameData": {
    "optional": "game-specific data"
  }
}
```

#### Status Types
- **`connected`**: Player connected to the external game
  - Sets `is_connected: true`, `current_location: 'game'`, `in_game: true`
- **`disconnected`**: Player disconnected from the external game
  - Sets `is_connected: false`, `current_location: 'disconnected'`, `in_game: false`
- **`in_game`**: Player is actively playing in the external game
  - Sets `is_connected: true`, `current_location: 'game'`, `in_game: true`
- **`returned_to_lobby`**: Player returned to GameBuddies lobby
  - Sets `is_connected: true`, `current_location: 'lobby'`, `in_game: false`

#### Example Usage

**Player connects to DDF:**
```javascript
fetch(`${gamebuddiesUrl}/api/game/rooms/${roomCode}/players/${playerId}/status`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your_api_key'
  },
  body: JSON.stringify({
    status: 'connected',
    location: 'game',
    reason: 'Player joined DDF game'
  })
});
```

**Player disconnects from DDF:**
```javascript
fetch(`${gamebuddiesUrl}/api/game/rooms/${roomCode}/players/${playerId}/status`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your_api_key'
  },
  body: JSON.stringify({
    status: 'disconnected',
    reason: 'Player closed DDF game window'
  })
});
```

#### Response
```json
{
  "success": true,
  "updated": {
    "status": "disconnected",
    "is_connected": false,
    "in_game": false
  }
}
```

### 2. Bulk Player Status Update

**Endpoint:** `POST /api/game/rooms/:roomCode/players/bulk-status`

Updates the status of multiple players at once (useful for server shutdowns, game endings, etc.).

#### Parameters
- `roomCode` (URL param): The 6-character room code

#### Request Body
```json
{
  "reason": "Reason for bulk update",
  "players": [
    {
      "playerId": "user_id_1",
      "status": "disconnected",
      "location": "disconnected",
      "gameData": null
    },
    {
      "playerId": "user_id_2", 
      "status": "returned_to_lobby",
      "location": "lobby"
    }
  ]
}
```

#### Example Usage

**DDF server shutting down:**
```javascript
fetch(`${gamebuddiesUrl}/api/game/rooms/${roomCode}/players/bulk-status`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your_api_key'
  },
  body: JSON.stringify({
    reason: 'DDF server maintenance shutdown',
    players: allPlayersInRoom.map(player => ({
      playerId: player.id,
      status: 'disconnected',
      location: 'disconnected'
    }))
  })
});
```

#### Response
```json
{
  "success": true,
  "results": [
    {
      "playerId": "user_id_1",
      "success": true,
      "updated": {
        "status": "disconnected",
        "is_connected": false,
        "in_game": false
      }
    }
  ],
  "summary": {
    "total": 4,
    "successful": 4,
    "failed": 0
  }
}
```

## Integration Patterns

### 1. Player Connection Tracking

Track when players connect/disconnect from your game:

```javascript
// When player joins your game
function onPlayerJoin(playerId) {
  updatePlayerStatus(playerId, 'connected', 'Player joined game');
}

// When player leaves your game  
function onPlayerLeave(playerId) {
  updatePlayerStatus(playerId, 'disconnected', 'Player left game');
}

// When player closes browser/tab
window.addEventListener('beforeunload', () => {
  updatePlayerStatus(currentPlayerId, 'disconnected', 'Browser closed');
});
```

### 2. Heartbeat System

Implement a heartbeat to detect silent disconnections:

```javascript
// Send heartbeat every 30 seconds
setInterval(() => {
  connectedPlayers.forEach(playerId => {
    updatePlayerStatus(playerId, 'in_game', 'Heartbeat ping');
  });
}, 30000);
```

### 3. Game State Changes

Update status based on game state:

```javascript
// Game starts
function onGameStart() {
  allPlayers.forEach(playerId => {
    updatePlayerStatus(playerId, 'in_game', 'Game started');
  });
}

// Game ends - players return to lobby
function onGameEnd() {
  allPlayers.forEach(playerId => {
    updatePlayerStatus(playerId, 'returned_to_lobby', 'Game ended');
  });
}
```

## Real-time Updates

When you update player status via the API, GameBuddies will automatically:

1. **Update the database** with the new status
2. **Broadcast to the lobby** via Socket.io with complete player data
3. **Update the UI** to show correct status badges (🟢 In Lobby, 🎮 In Game, ⚫ Offline)
4. **Log the event** for debugging and analytics

## Error Handling

Always handle API errors gracefully:

```javascript
async function updatePlayerStatus(playerId, status, reason) {
  try {
    const response = await fetch(`${gamebuddiesUrl}/api/game/rooms/${roomCode}/players/${playerId}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      },
      body: JSON.stringify({ status, reason })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log('Status updated:', result);
    
  } catch (error) {
    console.error('Failed to update player status:', error);
    // Consider retrying or queuing for later
  }
}
```

## Best Practices

1. **Always provide a reason** for status changes to help with debugging
2. **Use bulk updates** when updating multiple players simultaneously
3. **Handle network failures** gracefully with retries
4. **Update status immediately** when players connect/disconnect
5. **Use heartbeats** to detect silent disconnections
6. **Clean up on game end** by updating all players to appropriate status

This API ensures that GameBuddies always has accurate, real-time information about player status in external games. 