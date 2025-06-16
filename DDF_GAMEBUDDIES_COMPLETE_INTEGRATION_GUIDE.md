# DDF GameBuddies Integration - Complete Guide

## Overview

This guide contains everything the DDF project needs to integrate with GameBuddies. DDF is hosted separately on Render.com and connects to GameBuddies via URL parameters and API calls.

## Table of Contents

1. [How Players Arrive at DDF](#how-players-arrive-at-ddf)
2. [URL Parameters Reference](#url-parameters-reference)
3. [Session Storage Values](#session-storage-values)
4. [Return to Lobby Implementation](#return-to-lobby-implementation)
5. [Complete Integration Code](#complete-integration-code)
6. [API Endpoints](#api-endpoints)
7. [Testing Checklist](#testing-checklist)

---

## How Players Arrive at DDF

When GameBuddies starts a DDF game, it redirects all players to your DDF URL with specific parameters:

```
https://your-ddf-url.com/?room=ABC123&players=4&name=John%20Doe&role=gm
```

Players arrive with:
- Room information
- Player count
- Their name (URL encoded)
- Their role (only "gm" for gamemaster/host)

---

## URL Parameters Reference

### Required Parameters

| Parameter | Description | Example | Notes |
|-----------|-------------|---------|-------|
| `room` | 6-character room code | `ABC123` | Always uppercase |
| `players` | Total players in room | `4` | Number string |
| `name` | Player's display name | `John%20Doe` | URL encoded |
| `playerId` | GameBuddies user UUID | `525d340d-ae36-4544-810a-45ca348a96e6` | Use for API calls |

### Optional Parameters

| Parameter | Description | Example | Notes |
|-----------|-------------|---------|-------|
| `role` | Player's role | `gm` | Only present for host |

### Example URLs

```bash
# Gamemaster/Host
https://ddf.render.com/?room=ABC123&players=4&name=Alice&playerId=525d340d-ae36-4544-810a-45ca348a96e6&role=gm

# Regular Player
https://ddf.render.com/?room=ABC123&players=4&name=Bob&playerId=5d8ce922-8fce-421d-91ce-29a8613c9432
```

---

## Session Storage Values

GameBuddies also sets session storage values before redirecting:

```javascript
// Available in sessionStorage
sessionStorage.getItem('gamebuddies_roomCode')    // "ABC123"
sessionStorage.getItem('gamebuddies_playerName')  // "John Doe"
sessionStorage.getItem('gamebuddies_playerId')    // "525d340d-ae36-4544-810a-45ca348a96e6"
sessionStorage.getItem('gamebuddies_isHost')      // "true" or "false"
sessionStorage.getItem('gamebuddies_gameType')    // "ddf"
sessionStorage.getItem('gamebuddies_returnUrl')   // "https://gamebuddies.io"
```

---

## Return to Lobby Implementation

### Important: Only the HOST can trigger return to lobby for all players!

Regular players who leave individually just navigate back to GameBuddies. The host uses a special API endpoint to return ALL players at once.

---

## Complete Integration Code

### 1. Create GameBuddiesIntegration.js

```javascript
// GameBuddiesIntegration.js
class GameBuddiesIntegration {
  constructor() {
    // Parse URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    
    // Required parameters
    this.roomCode = urlParams.get('room');
    this.playerName = decodeURIComponent(urlParams.get('name') || '');
    this.playerCount = parseInt(urlParams.get('players') || '0');
    this.playerId = urlParams.get('playerId'); // GameBuddies user UUID
    
    // Optional parameters
    this.isHost = urlParams.get('role') === 'gm';
    
    // Session storage fallbacks
    if (!this.roomCode) {
      this.roomCode = sessionStorage.getItem('gamebuddies_roomCode');
    }
    if (!this.playerName) {
      this.playerName = sessionStorage.getItem('gamebuddies_playerName');
    }
    if (this.isHost === false) {
      this.isHost = sessionStorage.getItem('gamebuddies_isHost') === 'true';
    }
    
    // Get return URL
    this.returnUrl = sessionStorage.getItem('gamebuddies_returnUrl') || 'https://gamebuddies.io';
    
    // Validate we have required data
    if (!this.roomCode || !this.playerName || !this.playerId) {
      console.error('Missing GameBuddies integration data');
      this.handleMissingData();
    }
    
    // Log integration data (for debugging)
    console.log('GameBuddies Integration:', {
      roomCode: this.roomCode,
      playerName: this.playerName,
      playerId: this.playerId,
      playerCount: this.playerCount,
      isHost: this.isHost,
      returnUrl: this.returnUrl
    });
  }
  
  /**
   * Returns all players to GameBuddies lobby
   * ONLY WORKS FOR HOST!
   */
  async returnAllToLobby() {
    if (!this.isHost) {
      console.error('Only the host can return all players to lobby');
      return false;
    }
    
    try {
      // Show loading state
      this.showReturnMessage('Returning to GameBuddies lobby...');
      
      // Make API call to trigger return for all players
      const response = await fetch('https://gamebuddies.io/api/returnToLobby', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          roomCode: this.roomCode,
          isHost: true
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to return to lobby');
      }
      
      // The server will handle redirecting all players
      // Host will also be redirected via WebSocket
      return true;
      
    } catch (error) {
      console.error('Error returning to lobby:', error);
      
      // Fallback: redirect just the host
      this.redirectToGameBuddies();
      return false;
    }
  }
  
  /**
   * Individual player leaves the game
   * (Not a group return)
   */
  leaveGame() {
    this.redirectToGameBuddies();
  }
  
  /**
   * Redirect to GameBuddies
   */
  redirectToGameBuddies() {
    const url = `${this.returnUrl}?rejoin=${this.roomCode}&name=${encodeURIComponent(this.playerName)}`;
    window.location.href = url;
  }
  
  /**
   * Handle missing integration data
   */
  handleMissingData() {
    // If we're missing data, redirect back to GameBuddies home
    alert('Missing game data. Returning to GameBuddies...');
    window.location.href = this.returnUrl || 'https://gamebuddies.io';
  }
  
  /**
   * Show return message to users
   */
  showReturnMessage(message) {
    // Create or update overlay message
    let overlay = document.getElementById('gamebuddies-return-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'gamebuddies-return-overlay';
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        z-index: 99999;
      `;
      document.body.appendChild(overlay);
    }
    overlay.textContent = message;
    overlay.style.display = 'flex';
  }
  
  /**
   * Get player information
   */
  getPlayerInfo() {
    return {
      roomCode: this.roomCode,
      name: this.playerName,
      playerId: this.playerId,
      isHost: this.isHost,
      playerCount: this.playerCount
    };
  }
  
  /**
   * Check if this is a valid GameBuddies session
   */
  isValidSession() {
    return !!(this.roomCode && this.playerName && this.playerId);
  }
}

// Initialize and export
const gamebuddies = new GameBuddiesIntegration();

// Make it globally available
window.GameBuddies = gamebuddies;

// Also export for module systems
export default gamebuddies;
```

### 2. Integration in Your Game

```javascript
// In your main game file
import gamebuddies from './GameBuddiesIntegration.js';

// Or if not using modules:
// <script src="GameBuddiesIntegration.js"></script>

// Check if this is a GameBuddies session
if (gamebuddies.isValidSession()) {
  // Show player info in UI
  document.getElementById('player-name').textContent = gamebuddies.playerName;
  document.getElementById('room-code').textContent = gamebuddies.roomCode;
  
  // Show/hide host controls
  if (gamebuddies.isHost) {
    document.getElementById('host-controls').style.display = 'block';
  }
}

// Return to lobby button (HOST ONLY)
document.getElementById('return-to-lobby-btn')?.addEventListener('click', async () => {
  if (gamebuddies.isHost) {
    await gamebuddies.returnAllToLobby();
  }
});

// Individual leave button (ANY PLAYER)
document.getElementById('leave-game-btn')?.addEventListener('click', () => {
  if (confirm('Leave the game and return to GameBuddies?')) {
    gamebuddies.leaveGame();
  }
});
```

### 3. HTML Example

```html
<!DOCTYPE html>
<html>
<head>
  <title>DDF Game</title>
</head>
<body>
  <!-- Game UI -->
  <div id="game-container">
    <div id="game-info">
      <span>Player: <span id="player-name"></span></span>
      <span>Room: <span id="room-code"></span></span>
    </div>
    
    <!-- Host-only controls -->
    <div id="host-controls" style="display: none;">
      <button id="return-to-lobby-btn">
        Return All Players to Lobby
      </button>
    </div>
    
    <!-- Available to all players -->
    <button id="leave-game-btn">Leave Game</button>
  </div>
  
  <!-- Include integration script -->
  <script src="GameBuddiesIntegration.js"></script>
  <script src="your-game.js"></script>
</body>
</html>
```

---

## Player Status API Integration

### Important: Use the playerId for API calls!

The `playerId` parameter contains the GameBuddies user UUID that you MUST use when making API calls to update player status. Do NOT generate your own player IDs.

```javascript
// ✅ CORRECT - Use the playerId from URL parameters
const urlParams = new URLSearchParams(window.location.search);
const playerId = urlParams.get('playerId'); // e.g., "525d340d-ae36-4544-810a-45ca348a96e6"

// Update player status using the correct GameBuddies user ID
await fetch(`https://gamebuddies.io/api/game/rooms/${roomCode}/players/${playerId}/status`, {
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

// ❌ WRONG - Don't generate your own IDs
const wrongId = `player_${Date.now()}`; // This will fail!
```

### Example Integration with Status Updates

```javascript
class DDFGameBuddiesIntegration extends GameBuddiesIntegration {
  constructor() {
    super();
    this.apiKey = 'your_ddf_api_key_here';
    this.gamebuddiesUrl = 'https://gamebuddies.io';
  }

  // Call this when player connects to your game
  async notifyPlayerConnected() {
    if (!this.playerId) {
      console.error('No playerId available for API call');
      return;
    }

    try {
      const response = await fetch(
        `${this.gamebuddiesUrl}/api/game/rooms/${this.roomCode}/players/${this.playerId}/status`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.apiKey
          },
          body: JSON.stringify({
            status: 'connected',
            location: 'game',
            reason: 'joined_game',
            gameData: {
              playerName: this.playerName,
              connectedAt: new Date().toISOString()
            }
          })
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      console.log('✅ Player status updated: connected');
    } catch (error) {
      console.error('❌ Failed to update player status:', error);
    }
  }

  // Call this when player disconnects from your game
  async notifyPlayerDisconnected(reason = 'left_game') {
    if (!this.playerId) {
      console.error('No playerId available for API call');
      return;
    }

    try {
      const response = await fetch(
        `${this.gamebuddiesUrl}/api/game/rooms/${this.roomCode}/players/${this.playerId}/status`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.apiKey
          },
          body: JSON.stringify({
            status: 'disconnected',
            location: 'disconnected',
            reason: reason,
            gameData: {
              playerName: this.playerName,
              disconnectedAt: new Date().toISOString()
            }
          })
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      console.log('✅ Player status updated: disconnected');
    } catch (error) {
      console.error('❌ Failed to update player status:', error);
    }
  }
}
```

---

## API Endpoints

### Return to Lobby Endpoint

**Endpoint:** `POST https://gamebuddies.io/api/returnToLobby`

**Purpose:** Triggers return to lobby for ALL players in the room

**Request Body:**
```json
{
  "roomCode": "ABC123",
  "isHost": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Return to lobby initiated"
}
```

**Important Notes:**
- Only works when called by the host
- Server will disconnect all players from the game
- All players will receive a WebSocket event to redirect them
- Players will automatically rejoin the GameBuddies lobby

---

## Testing Checklist

### 1. Initial Integration
- [ ] URL parameters are parsed correctly
- [ ] Player name is decoded properly (handles spaces, special chars)
- [ ] Room code is captured
- [ ] Player ID (UUID) is captured
- [ ] Host role is identified
- [ ] Session storage values are available

### 2. Player Display
- [ ] Player name shows in game UI
- [ ] Room code is visible
- [ ] Host controls only show for host
- [ ] Player count is accurate

### 3. Return to Lobby (Host)
- [ ] Return button only visible to host
- [ ] API call succeeds
- [ ] Loading message appears
- [ ] All players are redirected together

### 4. Individual Leave
- [ ] Leave button works for all players
- [ ] Confirmation dialog appears
- [ ] Player returns to GameBuddies with rejoin params

### 5. Edge Cases
- [ ] Missing URL parameters handled gracefully
- [ ] Direct navigation (no GameBuddies data) redirects appropriately
- [ ] Network errors show fallback behavior
- [ ] Special characters in names work correctly
- [ ] API calls use correct GameBuddies user ID (not generated IDs)

---

## Common Issues & Solutions

### Issue: Players not receiving return signal
**Solution:** The host must use the return API. Individual players leaving won't trigger group return.

### Issue: URL parameters missing
**Solution:** Check session storage as fallback. If both are missing, redirect to GameBuddies home.

### Issue: Special characters in player names
**Solution:** Always use `decodeURIComponent()` for the name parameter.

### Issue: Host controls showing for all players
**Solution:** Check for `role=gm` parameter, not just any role value.

### Issue: API calls failing with "Player not found in room"
**Solution:** Make sure you're using the `playerId` parameter from the URL, not generating your own player IDs. The playerId must be the exact GameBuddies user UUID.

```javascript
// ❌ WRONG - Don't generate IDs
const playerId = `player_${socket.id}`;

// ✅ CORRECT - Use the URL parameter
const urlParams = new URLSearchParams(window.location.search);
const playerId = urlParams.get('playerId');
```

---

## Quick Reference

```javascript
// Get integration data
const roomCode = gamebuddies.roomCode;        // "ABC123"
const playerName = gamebuddies.playerName;    // "John Doe"
const playerId = gamebuddies.playerId;        // "525d340d-ae36-4544-810a-45ca348a96e6"
const isHost = gamebuddies.isHost;            // true/false
const playerCount = gamebuddies.playerCount;  // 4

// Return all to lobby (HOST ONLY)
if (gamebuddies.isHost) {
  await gamebuddies.returnAllToLobby();
}

// Individual leave
gamebuddies.leaveGame();

// Check valid session
if (gamebuddies.isValidSession()) {
  // We have GameBuddies data
}
```

---

## Support

If you encounter issues:

1. Check browser console for error messages
2. Verify URL parameters are present
3. Test with the example code first
4. Ensure your game is served over HTTPS in production

Remember: DDF is a separate project that receives players FROM GameBuddies. It doesn't need to manage rooms or validate players - GameBuddies handles all of that.

---

## GameBuddies V2 API Integration (Optional)

If your DDF instance needs to validate rooms or get additional information from GameBuddies, you can use the V2 API endpoints.

### API Base URL

```
https://gamebuddies.io/api/v2
```

### Authentication

The V2 API uses JWT tokens. For DDF as an internal game, you typically won't need authentication as players arrive pre-validated. However, if you need to make API calls:

```javascript
// Token is available in session storage
const token = sessionStorage.getItem('gamebuddies_token');

// Use in API calls
fetch('https://gamebuddies.io/api/v2/rooms/ABC123', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

### Available Endpoints

#### 1. Get Room Information

```javascript
// GET /api/v2/rooms/:roomCode
const response = await fetch(`https://gamebuddies.io/api/v2/rooms/${roomCode}`);
const room = await response.json();

/* Response:
{
  "id": "uuid",
  "room_code": "ABC123",
  "status": "in_game",
  "current_game": "ddf",
  "host": {
    "id": "uuid",
    "username": "Alice",
    "display_name": "Alice"
  },
  "members": [
    {
      "id": "uuid",
      "username": "Alice",
      "display_name": "Alice",
      "role": "host",
      "is_ready": true,
      "is_connected": true,
      "in_game": true
    },
    {
      "id": "uuid",
      "username": "Bob",
      "display_name": "Bob",
      "role": "player",
      "is_ready": true,
      "is_connected": true,
      "in_game": true
    }
  ],
  "settings": {
    "max_players": 10,
    "is_public": true
  }
}
*/
```

#### 2. Return to Lobby (V2 Endpoint)

```javascript
// POST /api/v2/rooms/:roomCode/return-to-lobby
const response = await fetch(
  `https://gamebuddies.io/api/v2/rooms/${roomCode}/return-to-lobby`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  }
);

/* Response:
{
  "success": true,
  "status": "returning"
}
*/
```

#### 3. Update Game State (If Needed)

```javascript
// POST /api/v2/rooms/:roomCode/game-state
const response = await fetch(
  `https://gamebuddies.io/api/v2/rooms/${roomCode}/game-state`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      state: {
        currentRound: 3,
        scores: {
          "Alice": 150,
          "Bob": 120
        }
      }
    })
  }
);
```

### Complete V2 Integration Example

```javascript
// Enhanced GameBuddiesIntegration.js with API support
class GameBuddiesIntegrationV2 extends GameBuddiesIntegration {
  constructor() {
    super();
    
    // Get JWT token for API calls
    this.token = sessionStorage.getItem('gamebuddies_token');
    
    // API base URL
    this.apiUrl = 'https://gamebuddies.io/api/v2';
  }
  
  /**
   * Get current room information from API
   */
  async getRoomInfo() {
    try {
      const response = await fetch(`${this.apiUrl}/rooms/${this.roomCode}`, {
        headers: this.token ? {
          'Authorization': `Bearer ${this.token}`
        } : {}
      });
      
      if (!response.ok) {
        throw new Error('Failed to get room info');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error getting room info:', error);
      return null;
    }
  }
  
  /**
   * Return all players to lobby (V2 API)
   */
  async returnAllToLobbyV2() {
    if (!this.isHost) {
      console.error('Only the host can return all players to lobby');
      return false;
    }
    
    if (!this.token) {
      console.warn('No auth token, falling back to V1 endpoint');
      return this.returnAllToLobby();
    }
    
    try {
      this.showReturnMessage('Returning to GameBuddies lobby...');
      
      const response = await fetch(
        `${this.apiUrl}/rooms/${this.roomCode}/return-to-lobby`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to return to lobby');
      }
      
      // Players will be redirected via WebSocket
      return true;
      
    } catch (error) {
      console.error('Error returning to lobby:', error);
      this.redirectToGameBuddies();
      return false;
    }
  }
  
  /**
   * Update game state (optional)
   */
  async updateGameState(state) {
    if (!this.token) {
      console.warn('No auth token for game state update');
      return false;
    }
    
    try {
      const response = await fetch(
        `${this.apiUrl}/rooms/${this.roomCode}/game-state`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ state })
        }
      );
      
      return response.ok;
    } catch (error) {
      console.error('Error updating game state:', error);
      return false;
    }
  }
}

// Export V2 version
const gamebuddiesV2 = new GameBuddiesIntegrationV2();
window.GameBuddiesV2 = gamebuddiesV2;
export default gamebuddiesV2;
```

### When to Use the API

**Most DDF integrations won't need API calls** because:
- Players arrive pre-validated
- Room information comes via URL parameters
- Return to lobby works without authentication

**Use the API if you need to:**
- Get real-time room member updates
- Store game state in GameBuddies
- Validate room status
- Get additional player information

### Error Handling

```javascript
// Example with proper error handling
async function validateAndStartGame() {
  // Check if we have GameBuddies data
  if (!gamebuddies.isValidSession()) {
    console.error('Not a valid GameBuddies session');
    gamebuddies.handleMissingData();
    return;
  }
  
  // Optional: Validate room via API
  if (gamebuddies.token) {
    const room = await gamebuddies.getRoomInfo();
    if (room && room.status !== 'in_game') {
      console.error('Room is not in game state');
      gamebuddies.redirectToGameBuddies();
      return;
    }
  }
  
  // Start your game
  initializeDDFGame({
    roomCode: gamebuddies.roomCode,
    playerName: gamebuddies.playerName,
    isHost: gamebuddies.isHost,
    playerCount: gamebuddies.playerCount
  });
}
```

### Database Schema Reference

If you need to understand the data structure:

```sql
-- Core tables that affect DDF
CREATE TABLE rooms (
  id UUID PRIMARY KEY,
  room_code VARCHAR(6) UNIQUE NOT NULL,
  status VARCHAR(20) DEFAULT 'lobby', -- 'lobby', 'in_game', 'returning'
  current_game VARCHAR(50),
  host_id UUID REFERENCES users(id)
);

CREATE TABLE room_members (
  id UUID PRIMARY KEY,
  room_id UUID REFERENCES rooms(id),
  user_id UUID REFERENCES users(id),
  role VARCHAR(20) DEFAULT 'player', -- 'host', 'player', 'spectator'
  is_connected BOOLEAN DEFAULT true,
  in_game BOOLEAN DEFAULT false
);

CREATE TABLE game_sessions (
  id UUID PRIMARY KEY,
  room_id UUID REFERENCES rooms(id),
  game_id VARCHAR(50) NOT NULL, -- 'ddf', 'schooled', etc.
  status VARCHAR(20) DEFAULT 'active',
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP,
  game_state JSONB -- Optional: store game-specific data
);
```

### API Rate Limits

- **Guest users**: 100 requests per minute
- **Authenticated users**: 300 requests per minute
- **Return to lobby**: No special limits (reasonable use)

### CORS Configuration

The GameBuddies API allows CORS from:
- `https://*.render.com` (for Render hosted games)
- `http://localhost:*` (for development)
- Your specific domain if whitelisted

For production, ensure your DDF domain is whitelisted. 