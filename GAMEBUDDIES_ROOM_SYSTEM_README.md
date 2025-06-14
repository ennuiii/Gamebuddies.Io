# GameBuddies Room Code System & Game Integration Guide

## Overview

GameBuddies is a multiplayer game platform that uses a sophisticated room code system to manage player sessions across different games. This guide explains how the system works and provides step-by-step instructions for integrating your game with the platform.

## System Architecture

### 1. Room Lifecycle
```
gamebuddies.io → Create/Join Room → Select Game → Launch Game → Return to GameBuddies
```

### 2. Database Structure (Supabase)
- **game_rooms**: Stores room information, settings, and metadata
- **users**: Player profiles with unique external_id per connection
- **room_participants**: Links users to rooms with roles and connection status
- **Active connections**: Tracked in-memory with Socket.IO

### 3. Key Components
- **Room Codes**: 6-character unique identifiers (e.g., `ABC123`)
- **User Management**: Unique `external_id` format: `${socket.id}_${playerName}`
- **Host System**: Original room creator becomes host when rejoining
- **Proxy System**: Games are served through GameBuddies proxy endpoints

## How the Room Code System Works

### Room Creation Flow
1. Player enters name and clicks "Create Room"
2. Server generates unique 6-character room code
3. Room stored in database with status `waiting_for_players`
4. Creator becomes host and joins Socket.IO room
5. Room lobby displays with game selection interface

### Player Joining Flow
1. Player enters room code and name
2. Server validates room exists and isn't full
3. Duplicate name check within room
4. Player added to database and Socket.IO room
5. All players notified of new participant

### Game Launch Flow
1. Host selects game from available options
2. Server updates room with selected game type
3. Host clicks "Start Game" 
4. Server generates game URLs with parameters for each player
5. Players redirected to game with 2-second delay (host goes first)

### Return Flow
1. Game stores return URL in sessionStorage
2. **GM/Host clicks "Return to GameBuddies Lobby" button** (only visible to GM)
3. **Server sends return command to ALL players in the room**
4. **All players automatically redirected to GameBuddies lobby**
5. **Players automatically rejoin their original room** with same names and roles

## Game Integration Steps

### Step 1: Add Your Game to GameBuddies Server

#### 1.1 Update Game Proxy Configuration
Edit `server/index.js` and add your game to the `gameProxies` object:

```javascript
const gameProxies = {
  ddf: {
    path: '/ddf',
    target: process.env.DDF_URL || 'https://ddf-game.onrender.com',
    pathRewrite: { '^/ddf': '' }
  },
  schooled: {
    path: '/schooled', 
    target: process.env.SCHOOLED_URL || 'https://schooled-game.onrender.com',
    pathRewrite: { '^/schooled': '' }
  },
  // ADD YOUR GAME HERE
  yourgame: {
    path: '/yourgame',
    target: process.env.YOURGAME_URL || 'https://yourgame.com',
    pathRewrite: { '^/yourgame': '' }
  }
};
```

#### 1.2 Update Games API Endpoint
In the same file, add your game to the `/api/games` endpoint:

```javascript
app.get('/api/games', (req, res) => {
  const games = [
    // ... existing games ...
    {
      id: 'yourgame',
      name: 'Your Game Name',
      description: 'A brief description of your game',
      path: '/yourgame',
      screenshot: '/screenshots/yourgame.png',
      available: true,
      maxPlayers: 8
    }
  ];
  
  res.json(games);
});
```

#### 1.3 Add Game Screenshot
Place a screenshot file at `server/screenshots/yourgame.png` (recommended size: 400x300px)

### Step 2: Implement GameBuddies Integration in Your Game

#### 2.1 Read URL Parameters
When GameBuddies launches your game, it passes these URL parameters:

```javascript
// Parse URL parameters
const urlParams = new URLSearchParams(window.location.search);
const roomCode = urlParams.get('room');        // 6-character room code
const playerCount = urlParams.get('players');  // Total players in room
const playerName = urlParams.get('name');      // Player's name (URL decoded)
const isHost = urlParams.get('role') === 'gm'; // true if player is host/GM
```

#### 2.2 Read SessionStorage Values
GameBuddies also stores additional data in sessionStorage:

```javascript
const gamebuddiesData = {
  roomCode: sessionStorage.getItem('gamebuddies_roomCode'),
  playerName: sessionStorage.getItem('gamebuddies_playerName'),
  isHost: sessionStorage.getItem('gamebuddies_isHost') === 'true',
  gameType: sessionStorage.getItem('gamebuddies_gameType'),
  returnUrl: sessionStorage.getItem('gamebuddies_returnUrl')
};
```

#### 2.3 Initialize Your Game
Use the parameters to set up your multiplayer session:

```javascript
function initializeFromGameBuddies() {
  const urlParams = new URLSearchParams(window.location.search);
  const roomCode = urlParams.get('room');
  const playerName = urlParams.get('name');
  const isHost = urlParams.get('role') === 'gm';
  
  if (!roomCode || !playerName) {
    // Not coming from GameBuddies - handle direct access
    showMainMenu();
    return;
  }
  
  console.log('Initializing from GameBuddies:', {
    roomCode,
    playerName,
    isHost,
    totalPlayers: urlParams.get('players')
  });
  
  if (isHost) {
    // Host creates the game room
    createMultiplayerRoom(roomCode, playerName);
  } else {
    // Players join existing room
    joinMultiplayerRoom(roomCode, playerName);
  }
}

// Call on page load
document.addEventListener('DOMContentLoaded', initializeFromGameBuddies);
```

#### 2.4 Implement GM-Controlled Return to GameBuddies

**IMPORTANT**: Only the GM/Host should have the return button. When clicked, ALL players return to lobby automatically.

##### Option A: Use the Pre-built React Component (Recommended)

```javascript
import GameBuddiesGMReturnButton from './path/to/GameBuddiesGMReturnButton';
import GameBuddiesReturnHandler from './path/to/GameBuddiesReturnHandler';

function YourGameComponent() {
  return (
    <div>
      {/* Your game content */}
      
      {/* GM Return Button - only shows for host */}
      <GameBuddiesGMReturnButton />
      
      {/* Return Handler - handles automatic return for all players */}
      <GameBuddiesReturnHandler />
    </div>
  );
}
```

##### Option B: Custom Implementation

```javascript
import io from 'socket.io-client';

class GameBuddiesReturnSystem {
  constructor() {
    this.socket = null;
    this.isHost = sessionStorage.getItem('gamebuddies_isHost') === 'true';
    this.roomCode = sessionStorage.getItem('gamebuddies_roomCode');
    this.playerName = sessionStorage.getItem('gamebuddies_playerName');
    
    this.initializeSocket();
    this.addReturnButton();
  }
  
  initializeSocket() {
    if (!this.roomCode || !this.playerName) return;
    
    const serverUrl = this.getGameBuddiesServerUrl();
    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: true
    });
    
    this.socket.on('connect', () => {
      console.log('🔄 Connected to GameBuddies for return handling');
      this.socket.emit('joinRoom', {
        roomCode: this.roomCode,
        playerName: this.playerName
      });
    });
    
    // Listen for GM-initiated return (all players receive this)
    this.socket.on('returnToLobbyInitiated', (data) => {
      console.log('🔄 GM initiated return to lobby:', data);
      
      // Update session storage
      sessionStorage.setItem('gamebuddies_roomCode', data.roomCode);
      sessionStorage.setItem('gamebuddies_playerName', data.playerName);
      sessionStorage.setItem('gamebuddies_isHost', data.isHost.toString());
      sessionStorage.setItem('gamebuddies_returnUrl', data.returnUrl);
      
      // Automatically redirect to GameBuddies lobby
      window.location.href = `${data.returnUrl}?autorejoin=${data.roomCode}&name=${encodeURIComponent(data.playerName)}&host=${data.isHost}`;
    });
  }
  
  getGameBuddiesServerUrl() {
    // Determine GameBuddies server URL based on environment
    if (process.env.REACT_APP_SERVER_URL) {
      return process.env.REACT_APP_SERVER_URL;
    }
    
    if (window.location.hostname.includes('onrender.com')) {
      return 'https://gamebuddies-io.onrender.com';
    }
    
    if (window.location.hostname !== 'localhost') {
      return 'https://gamebuddies.io';
    }
    
    return 'http://localhost:3000';
  }
  
  addReturnButton() {
    // Only show button for GM/Host
    if (!this.isHost || !this.roomCode) return;
    
    const button = document.createElement('button');
    button.innerHTML = '← Return to GameBuddies Lobby';
    button.onclick = () => this.initiateReturnToLobby();
    button.style.cssText = `
      position: fixed;
      top: 20px;
      left: 20px;
      z-index: 1000;
      padding: 12px 20px;
      background: #4CAF50;
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    button.title = 'Return all players to GameBuddies lobby to select another game';
    document.body.appendChild(button);
  }
  
  initiateReturnToLobby() {
    if (!this.socket || !this.roomCode || !this.isHost) {
      console.error('Cannot return to lobby: missing requirements');
      return;
    }
    
    console.log('🔄 GM initiating return to lobby for all players');
    this.socket.emit('returnToLobby', { roomCode: this.roomCode });
    
    // The server will send returnToLobbyInitiated to all players
    // including this GM, triggering automatic redirect
  }
}

// Initialize the return system
const gameBuddiesReturn = new GameBuddiesReturnSystem();
```

### Step 3: Handle Edge Cases

#### 3.1 Direct Access (Not from GameBuddies)
```javascript
function handleDirectAccess() {
  const urlParams = new URLSearchParams(window.location.search);
  
  if (!urlParams.get('room')) {
    // Player accessed game directly
    console.log('Direct access - showing main menu');
    showMainMenu();
    return true;
  }
  return false;
}
```

#### 3.2 Missing Parameters
```javascript
function validateGameBuddiesParams() {
  const urlParams = new URLSearchParams(window.location.search);
  const required = ['room', 'players', 'name'];
  
  for (const param of required) {
    if (!urlParams.get(param)) {
      console.error(`Missing required parameter: ${param}`);
      showError(`Invalid game link. Missing ${param} parameter.`);
      return false;
    }
  }
  return true;
}
```

#### 3.3 Room State Management
```javascript
// Ensure host creates room before players join
function createMultiplayerRoom(roomCode, hostName) {
  console.log(`Creating room ${roomCode} as host: ${hostName}`);
  
  // Your room creation logic here
  // Make sure to use the provided roomCode, don't generate a new one
  
  // Store room state for reconnection
  localStorage.setItem('currentRoom', JSON.stringify({
    code: roomCode,
    host: hostName,
    createdAt: Date.now()
  }));
}

function joinMultiplayerRoom(roomCode, playerName) {
  console.log(`Joining room ${roomCode} as player: ${playerName}`);
  
  // Add delay to ensure host has created room
  setTimeout(() => {
    // Your room joining logic here
  }, 1000);
}
```

## Complete Integration Example

Here's a complete example of GameBuddies integration:

```javascript
class GameBuddiesIntegration {
  constructor() {
    this.roomCode = null;
    this.playerName = null;
    this.isHost = false;
    this.returnUrl = null;
  }
  
  initialize() {
    // Check if coming from GameBuddies
    if (!this.parseGameBuddiesParams()) {
      this.handleDirectAccess();
      return;
    }
    
    // Add return button
    this.addReturnButton();
    
    // Initialize multiplayer
    if (this.isHost) {
      this.createRoom();
    } else {
      this.joinRoom();
    }
  }
  
  parseGameBuddiesParams() {
    const urlParams = new URLSearchParams(window.location.search);
    
    this.roomCode = urlParams.get('room');
    this.playerName = urlParams.get('name');
    this.isHost = urlParams.get('role') === 'gm';
    
    // Also read from sessionStorage
    this.returnUrl = sessionStorage.getItem('gamebuddies_returnUrl');
    
    return this.roomCode && this.playerName;
  }
  
  createRoom() {
    console.log(`Host ${this.playerName} creating room ${this.roomCode}`);
    // Your room creation logic
  }
  
  joinRoom() {
    console.log(`Player ${this.playerName} joining room ${this.roomCode}`);
    // Your room joining logic
  }
  
  addReturnButton() {
    const button = document.createElement('button');
    button.innerHTML = '← Return to GameBuddies';
    button.onclick = () => this.returnToGameBuddies();
    button.className = 'gamebuddies-return-btn';
    document.body.appendChild(button);
  }
  
  returnToGameBuddies() {
    if (this.returnUrl && this.roomCode) {
      window.location.href = `${this.returnUrl}?rejoin=${this.roomCode}`;
    } else {
      window.location.href = 'https://gamebuddies.io';
    }
  }
  
  handleDirectAccess() {
    console.log('Game accessed directly - showing main menu');
    // Show your game's main menu
  }
}

// Initialize on page load
const gameBuddies = new GameBuddiesIntegration();
document.addEventListener('DOMContentLoaded', () => {
  gameBuddies.initialize();
});
```

## Testing Your Integration

### 1. Local Testing
```javascript
// Test URL: http://localhost:3000/yourgame?room=TEST01&players=2&name=TestPlayer&role=gm
// This simulates being launched from GameBuddies as host

// Test URL: http://localhost:3000/yourgame?room=TEST01&players=2&name=Player2
// This simulates being launched from GameBuddies as player
```

### 2. SessionStorage Testing
```javascript
// Manually set sessionStorage for testing
sessionStorage.setItem('gamebuddies_roomCode', 'TEST01');
sessionStorage.setItem('gamebuddies_playerName', 'TestPlayer');
sessionStorage.setItem('gamebuddies_isHost', 'true');
sessionStorage.setItem('gamebuddies_gameType', 'yourgame');
sessionStorage.setItem('gamebuddies_returnUrl', 'http://localhost:3000');
```

### 3. Integration Checklist
- [ ] Game reads URL parameters correctly
- [ ] Host can create room with provided room code
- [ ] Players can join room with provided room code
- [ ] **GM return button only shows for host/GM**
- [ ] **GM return button triggers return for ALL players**
- [ ] **All players automatically rejoin lobby with same names**
- [ ] Direct access is handled gracefully
- [ ] Missing parameters don't break the game
- [ ] Room state is preserved for reconnection

## Deployment Considerations

### Environment Variables
Add your game's URL to the server environment:
```bash
YOURGAME_URL=https://yourgame.com
```

### CORS Configuration
Ensure your game allows requests from GameBuddies:
```javascript
// If using Express.js
app.use(cors({
  origin: ['https://gamebuddies.io', 'https://gamebuddies-io.onrender.com'],
  credentials: true
}));
```

### SSL/HTTPS
GameBuddies requires HTTPS in production. Ensure your game is served over HTTPS.

## Troubleshooting

### Common Issues

1. **Players can't join room**
   - Check if host creates room before players try to join
   - Verify room code is used exactly as provided
   - Add delay for players joining after host

2. **Return button doesn't work**
   - Verify sessionStorage values are set
   - Check if returnUrl is valid
   - Test rejoin parameter handling

3. **Host detection fails**
   - Check `role=gm` parameter parsing
   - Verify host logic runs before player logic

4. **Direct access breaks game**
   - Add proper fallback for missing parameters
   - Show main menu when not from GameBuddies

### Debug Information
```javascript
// Add this to your game for debugging
console.log('GameBuddies Debug Info:', {
  urlParams: Object.fromEntries(new URLSearchParams(window.location.search)),
  sessionStorage: {
    roomCode: sessionStorage.getItem('gamebuddies_roomCode'),
    playerName: sessionStorage.getItem('gamebuddies_playerName'),
    isHost: sessionStorage.getItem('gamebuddies_isHost'),
    gameType: sessionStorage.getItem('gamebuddies_gameType'),
    returnUrl: sessionStorage.getItem('gamebuddies_returnUrl')
  },
  currentUrl: window.location.href
});
```

## Complete User Journey Example

Here's exactly how the improved GM-controlled return system works:

### Scenario: GM 'GMTEST' wants to play multiple games with friends

1. **Create Room at GameBuddies:**
   - GM 'GMTEST' goes to `https://gamebuddies.io`
   - Creates room, gets assigned room code `ABC123`
   - Players 'Player1' and 'Player2' join using room code
   - All players are now in room ABC123 lobby

2. **Start First Game:**
   - GM selects "DDF" game and clicks "Start Game"
   - **GM redirected to:** `https://gamebuddies.io/ddf?room=ABC123&players=3&name=GMTEST&role=gm`
   - **Player1 redirected to:** `https://gamebuddies.io/ddf?room=ABC123&players=3&name=Player1`
   - **Player2 redirected to:** `https://gamebuddies.io/ddf?room=ABC123&players=3&name=Player2`

3. **Playing DDF Game:**
   - All players play DDF together using room code ABC123
   - Only GM sees "Return to GameBuddies Lobby" button (top-left corner)
   - Players see no return button - they wait for GM's decision

4. **GM Decides to Switch Games:**
   - After playing DDF, GM wants to try "Schooled" game
   - **GM clicks "Return to GameBuddies Lobby" button**
   - Server immediately sends return command to ALL players in room ABC123

5. **Automatic Return (All Players):**
   - **GM automatically redirected to:** `https://gamebuddies.io?autorejoin=ABC123&name=GMTEST&host=true`
   - **Player1 automatically redirected to:** `https://gamebuddies.io?autorejoin=ABC123&name=Player1&host=false`
   - **Player2 automatically redirected to:** `https://gamebuddies.io?autorejoin=ABC123&name=Player2&host=false`

6. **Back in Original Lobby:**
   - **All players automatically rejoin room ABC123**
   - Same room code, same player names, same roles
   - GM is still host, players are still players
   - Room lobby displays with all original participants

7. **Select New Game:**
   - GM can now select "Schooled" game
   - Same room ABC123, same players, different game
   - Process repeats seamlessly for any number of games

### Key Benefits:
- ✅ **No manual rejoining** - everything is automatic
- ✅ **GM controls the flow** - only host can initiate return
- ✅ **All players move together** - no one gets left behind
- ✅ **Preserves room state** - same room code, names, and roles
- ✅ **Seamless game switching** - play multiple games in same session
- ✅ **Host transfer system** - manual and automatic host management

## Host Transfer System

GameBuddies includes a comprehensive host transfer system to ensure rooms always have an active host.

### Manual Host Transfer
- **Current host can promote any player** to become the new host
- **"Make Host" buttons** appear next to each player (only visible to current host)
- **Instant transfer** - no confirmation needed
- **All players notified** when host changes

### Automatic Host Transfer
- **Host leaves room** → Oldest remaining player becomes host automatically
- **Host disconnects** → 30-second grace period, then auto-transfer if not reconnected
- **Seamless transition** - room continues functioning normally
- **Event logging** - all transfers are logged for debugging

### Implementation in Games
Games don't need to implement host transfer logic - it's handled entirely by GameBuddies. However, games should:

1. **Listen for host status changes** via sessionStorage updates
2. **Update UI accordingly** when host privileges change
3. **Handle reconnection gracefully** if original host returns

```javascript
// Example: Listen for host status changes in your game
function checkHostStatus() {
  const isHost = sessionStorage.getItem('gamebuddies_isHost') === 'true';
  
  if (isHost !== previousHostStatus) {
    console.log('Host status changed:', isHost);
    updateGameUI(isHost);
    previousHostStatus = isHost;
  }
}

// Check periodically or on focus events
setInterval(checkHostStatus, 1000);
window.addEventListener('focus', checkHostStatus);
```

## Support

For integration support or questions:
1. Check the existing games (`/ddf`, `/schooled`) for reference implementations
2. Test your integration thoroughly with the provided examples
3. Ensure all edge cases are handled properly

The GameBuddies platform is designed to be flexible and support various types of multiplayer games. Follow this guide carefully, and your game will integrate seamlessly with the room code system. 