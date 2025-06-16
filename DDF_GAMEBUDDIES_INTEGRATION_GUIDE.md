# DDF GameBuddies Integration Guide

This guide explains how to integrate your separate DDF project (hosted on Render.com) with the GameBuddies API system.

## Overview

- **GameBuddies**: Central platform that manages rooms, players, and game state
- **DDF**: Your separate game project that connects TO GameBuddies via API
- **Integration**: DDF will validate rooms, sync game state, and handle multiplayer through GameBuddies

## Part 1: GameBuddies Setup (Already Done ✅)

The GameBuddies server now has the following API endpoints:
- `GET /api/game/rooms/:roomCode/validate` - Validate room and get data
- `POST /api/game/rooms/:roomCode/join` - Join room as player
- `POST /api/game/rooms/:roomCode/state` - Sync game state
- `GET /api/game/rooms/:roomCode/state` - Get game state
- `POST /api/game/rooms/:roomCode/players/:playerId/status` - Update player status
- `POST /api/game/rooms/:roomCode/events` - Send game events

## Part 2: Database Setup

**Run this SQL in your Supabase SQL Editor:**

```sql
-- Copy and paste the contents of server/scripts/setup_api_keys.sql
-- This creates the API keys table and generates your DDF API key
```

After running the SQL, **copy your DDF API key** from the results!

## Part 3: DDF Project Integration

Add these files to your **DDF project** (not GameBuddies):

### 3.1 Create `src/services/gamebuddies-api-client.js`

```javascript
// gamebuddies-api-client.js
class GameBuddiesAPIClient {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.REACT_APP_GAMEBUDDIES_API_KEY;
    this.baseUrl = this.getServerUrl();
  }
  
  getServerUrl() {
    if (process.env.REACT_APP_GAMEBUDDIES_API_URL) {
      return process.env.REACT_APP_GAMEBUDDIES_API_URL;
    }
    
    if (window.location.hostname.includes('onrender.com')) {
      return window.location.origin.replace(/\/ddf.*$/, '');
    }
    
    if (window.location.hostname !== 'localhost') {
      return 'https://gamebuddies.io';
    }
    
    return 'http://localhost:3033';
  }
  
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
        ...options.headers
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `Request failed: ${response.status}`);
    }
    
    return response.json();
  }
  
  // Validate room and get initial data
  async validateRoom(roomCode, playerName) {
    return this.request(`/api/game/rooms/${roomCode}/validate?playerName=${encodeURIComponent(playerName)}`);
  }
  
  // Join room (register player)
  async joinRoom(roomCode, playerName, playerId = null) {
    return this.request(`/api/game/rooms/${roomCode}/join`, {
      method: 'POST',
      body: JSON.stringify({ playerName, playerId })
    });
  }
  
  // Sync game state
  async syncGameState(roomCode, playerId, gameState, stateType = 'full') {
    return this.request(`/api/game/rooms/${roomCode}/state`, {
      method: 'POST',
      body: JSON.stringify({ playerId, gameState, stateType })
    });
  }
  
  // Get latest game state
  async getGameState(roomCode, version = null) {
    const query = version ? `?version=${version}` : '';
    return this.request(`/api/game/rooms/${roomCode}/state${query}`);
  }
  
  // Update player status
  async updatePlayerStatus(roomCode, playerId, status, gameData = {}) {
    return this.request(`/api/game/rooms/${roomCode}/players/${playerId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, gameData })
    });
  }
  
  // Send game event
  async sendGameEvent(roomCode, playerId, eventType, eventData) {
    return this.request(`/api/game/rooms/${roomCode}/events`, {
      method: 'POST',
      body: JSON.stringify({ playerId, eventType, eventData })
    });
  }
}

export default GameBuddiesAPIClient;
```

### 3.2 Create `src/services/ddf-gamebuddies-service.js`

```javascript
// ddf-gamebuddies-service.js
import GameBuddiesAPIClient from './gamebuddies-api-client';
import io from 'socket.io-client';

class DDFGameBuddiesService {
  constructor() {
    this.apiClient = new GameBuddiesAPIClient(process.env.REACT_APP_DDF_API_KEY);
    this.socket = null;
    this.roomCode = null;
    this.playerId = null;
    this.playerName = null;
    this.isHost = false;
    this.syncInterval = null;
  }
  
  async initialize(roomCode, playerName, isGM) {
    try {
      // Validate room
      console.log('🔍 [DDF-GameBuddies] Validating room with GameBuddies...', { roomCode, playerName });
      const validation = await this.apiClient.validateRoom(roomCode, playerName);
      
      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid room');
      }
      
      console.log('✅ [DDF-GameBuddies] Room validated successfully:', validation);
      
      this.roomCode = roomCode;
      this.playerName = playerName;
      
      // Join or rejoin room
      if (validation.participant) {
        // Player already in room
        this.playerId = validation.participant.id;
        this.isHost = validation.participant.isHost;
        console.log('🔄 [DDF-GameBuddies] Rejoining as existing participant:', {
          playerId: this.playerId,
          isHost: this.isHost
        });
      } else {
        // New player
        console.log('🚪 [DDF-GameBuddies] Joining room as new player...');
        const joinResult = await this.apiClient.joinRoom(roomCode, playerName);
        this.playerId = joinResult.playerId;
        this.isHost = isGM || joinResult.role === 'host';
        console.log('✅ [DDF-GameBuddies] Joined successfully:', {
          playerId: this.playerId,
          isHost: this.isHost
        });
      }
      
      // Connect to Socket.io for real-time updates
      this.connectSocket();
      
      // Start periodic status updates
      this.startHeartbeat();
      
      const result = {
        room: validation.room,
        participants: validation.participants,
        gameState: validation.gameState,
        playerId: this.playerId,
        isHost: this.isHost
      };
      
      console.log('🎉 [DDF-GameBuddies] Initialization complete:', result);
      return result;
      
    } catch (error) {
      console.error('❌ [DDF-GameBuddies] Failed to initialize GameBuddies connection:', error);
      throw error;
    }
  }
  
  connectSocket() {
    const serverUrl = this.apiClient.baseUrl;
    console.log('🔌 [DDF-GameBuddies] Connecting to Socket.io at:', serverUrl);
    
    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling']
    });
    
    this.socket.on('connect', () => {
      console.log('✅ [DDF-GameBuddies] Connected to GameBuddies real-time');
      // Join room for updates
      this.socket.emit('joinRoom', {
        roomCode: this.roomCode,
        playerName: this.playerName
      });
    });
    
    this.socket.on('disconnect', () => {
      console.log('📡 [DDF-GameBuddies] Disconnected from GameBuddies real-time');
    });
    
    this.socket.on('gameStateUpdated', (data) => {
      console.log('📊 [DDF-GameBuddies] Game state updated:', data);
      window.dispatchEvent(new CustomEvent('gamebuddies:stateUpdated', { 
        detail: data 
      }));
    });
    
    this.socket.on('playerStatusUpdated', (data) => {
      console.log('👤 [DDF-GameBuddies] Player status updated:', data);
      window.dispatchEvent(new CustomEvent('gamebuddies:playerStatusUpdated', { 
        detail: data 
      }));
    });
    
    this.socket.on('gameEvent', (data) => {
      console.log('🎮 [DDF-GameBuddies] Game event received:', data);
      window.dispatchEvent(new CustomEvent('gamebuddies:gameEvent', { 
        detail: data 
      }));
    });
    
    this.socket.on('playerJoined', (data) => {
      console.log('🚪 [DDF-GameBuddies] Player joined:', data);
      window.dispatchEvent(new CustomEvent('gamebuddies:playerJoined', { 
        detail: data 
      }));
    });
    
    this.socket.on('playerLeft', (data) => {
      console.log('👋 [DDF-GameBuddies] Player left:', data);
      window.dispatchEvent(new CustomEvent('gamebuddies:playerLeft', { 
        detail: data 
      }));
    });
    
    this.socket.on('error', (error) => {
      console.error('❌ [DDF-GameBuddies] Socket error:', error);
    });
  }
  
  startHeartbeat() {
    // Send heartbeat every 30 seconds
    this.syncInterval = setInterval(async () => {
      try {
        if (this.roomCode && this.playerId) {
          await this.apiClient.updatePlayerStatus(
            this.roomCode, 
            this.playerId, 
            'connected',
            { lastPing: Date.now() }
          );
          console.log('💓 [DDF-GameBuddies] Heartbeat sent');
        }
      } catch (error) {
        console.error('❌ [DDF-GameBuddies] Heartbeat failed:', error);
      }
    }, 30000);
    
    console.log('💓 [DDF-GameBuddies] Heartbeat started');
  }
  
  async syncGameState(gameState) {
    try {
      if (!this.roomCode || !this.playerId) {
        throw new Error('Not initialized - missing room or player ID');
      }
      
      console.log('📊 [DDF-GameBuddies] Syncing game state:', {
        roomCode: this.roomCode,
        playerId: this.playerId,
        stateSize: JSON.stringify(gameState).length
      });
      
      const result = await this.apiClient.syncGameState(
        this.roomCode,
        this.playerId,
        gameState
      );
      
      console.log('✅ [DDF-GameBuddies] Game state synced:', result);
      return result;
    } catch (error) {
      console.error('❌ [DDF-GameBuddies] Failed to sync game state:', error);
      throw error;
    }
  }
  
  async getGameState() {
    try {
      if (!this.roomCode) {
        throw new Error('Not initialized - missing room code');
      }
      
      const state = await this.apiClient.getGameState(this.roomCode);
      console.log('📥 [DDF-GameBuddies] Retrieved game state:', {
        version: state?.version,
        dataSize: state?.data ? JSON.stringify(state.data).length : 0
      });
      
      return state;
    } catch (error) {
      console.error('❌ [DDF-GameBuddies] Failed to get game state:', error);
      throw error;
    }
  }
  
  async sendEvent(eventType, eventData) {
    try {
      if (!this.roomCode || !this.playerId) {
        throw new Error('Not initialized - missing room or player ID');
      }
      
      console.log('🎮 [DDF-GameBuddies] Sending event:', { eventType, eventData });
      
      const result = await this.apiClient.sendGameEvent(
        this.roomCode,
        this.playerId,
        eventType,
        eventData
      );
      
      console.log('✅ [DDF-GameBuddies] Event sent successfully');
      return result;
    } catch (error) {
      console.error('❌ [DDF-GameBuddies] Failed to send event:', error);
      // Don't throw - events are often non-critical
    }
  }
  
  async updateStatus(status, gameData = {}) {
    try {
      if (!this.roomCode || !this.playerId) {
        return;
      }
      
      await this.apiClient.updatePlayerStatus(
        this.roomCode,
        this.playerId,
        status,
        gameData
      );
      
      console.log('📋 [DDF-GameBuddies] Status updated:', { status, gameData });
    } catch (error) {
      console.error('❌ [DDF-GameBuddies] Failed to update status:', error);
    }
  }
  
  disconnect() {
    console.log('🔌 [DDF-GameBuddies] Disconnecting from GameBuddies...');
    
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('💓 [DDF-GameBuddies] Heartbeat stopped');
    }
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      console.log('📡 [DDF-GameBuddies] Socket disconnected');
    }
    
    // Send disconnect status
    if (this.roomCode && this.playerId) {
      this.apiClient.updatePlayerStatus(
        this.roomCode,
        this.playerId,
        'disconnected'
      ).catch(error => {
        console.error('❌ [DDF-GameBuddies] Failed to send disconnect status:', error);
      });
    }
    
    // Reset state
    this.roomCode = null;
    this.playerId = null;
    this.playerName = null;
    this.isHost = false;
    
    console.log('✅ [DDF-GameBuddies] Disconnection complete');
  }
  
  // Utility methods for DDF integration
  isInitialized() {
    return !!(this.roomCode && this.playerId);
  }
  
  getConnectionInfo() {
    return {
      roomCode: this.roomCode,
      playerId: this.playerId,
      playerName: this.playerName,
      isHost: this.isHost,
      isConnected: this.socket?.connected || false
    };
  }
}

// Export singleton instance
export default new DDFGameBuddiesService();
```

### 3.3 Install Dependencies in DDF Project

Add Socket.io client to your DDF project:

```bash
npm install socket.io-client
```

### 3.4 Add Environment Variables to DDF Project

Add to your DDF project's `.env` file:

```env
# GameBuddies Integration
REACT_APP_GAMEBUDDIES_API_URL=https://your-gamebuddies-domain.onrender.com
REACT_APP_DDF_API_KEY=your_ddf_api_key_from_database
```

For local development:
```env
REACT_APP_GAMEBUDDIES_API_URL=http://localhost:3033
REACT_APP_DDF_API_KEY=your_ddf_api_key_from_database
```

### 3.5 Integrate into Your DDF Game Component

```javascript
// In your main DDF game component
import ddfGameBuddies from './services/ddf-gamebuddies-service';

function DDFGame() {
  const [gameData, setGameData] = useState(null);
  const [players, setPlayers] = useState([]);
  const [gameState, setGameState] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    initializeGame();
    
    // Listen for GameBuddies events
    window.addEventListener('gamebuddies:stateUpdated', handleStateUpdate);
    window.addEventListener('gamebuddies:playerJoined', handlePlayerJoined);
    window.addEventListener('gamebuddies:playerLeft', handlePlayerLeft);
    window.addEventListener('gamebuddies:gameEvent', handleGameEvent);
    
    return () => {
      ddfGameBuddies.disconnect();
      window.removeEventListener('gamebuddies:stateUpdated', handleStateUpdate);
      window.removeEventListener('gamebuddies:playerJoined', handlePlayerJoined);
      window.removeEventListener('gamebuddies:playerLeft', handlePlayerLeft);
      window.removeEventListener('gamebuddies:gameEvent', handleGameEvent);
    };
  }, []);
  
  async function initializeGame() {
    const params = new URLSearchParams(window.location.search);
    const roomCode = params.get('room');
    const playerName = params.get('name');
    const isGM = params.get('role') === 'gm';
    
    if (!roomCode || !playerName) {
      // Show normal DDF UI (not connected to GameBuddies)
      setLoading(false);
      return;
    }
    
    try {
      const data = await ddfGameBuddies.initialize(roomCode, playerName, isGM);
      
      setGameData({
        roomCode: data.room.code,
        playerId: data.playerId,
        isHost: data.isHost,
        settings: data.room.settings
      });
      
      setPlayers(data.participants || []);
      
      if (data.gameState && data.gameState.data) {
        setGameState(data.gameState.data);
      } else if (data.isHost) {
        // Initialize new game state
        const initialState = createInitialGameState(data.participants);
        await ddfGameBuddies.syncGameState(initialState);
        setGameState(initialState);
      }
      
      setLoading(false);
      
    } catch (error) {
      console.error('Failed to initialize GameBuddies:', error);
      alert(`Failed to join game: ${error.message}`);
      // Could redirect back to GameBuddies here
    }
  }
  
  function handleStateUpdate(event) {
    // Reload state from GameBuddies
    ddfGameBuddies.getGameState()
      .then(state => {
        if (state && state.data) {
          setGameState(state.data);
        }
      })
      .catch(console.error);
  }
  
  function handlePlayerJoined(event) {
    const { player } = event.detail;
    setPlayers(prev => [...prev, player]);
    
    // Send current state to new player if host
    if (gameData?.isHost && gameState) {
      ddfGameBuddies.syncGameState(gameState);
    }
  }
  
  function handlePlayerLeft(event) {
    const { playerId } = event.detail;
    setPlayers(prev => prev.filter(p => p.id !== playerId));
  }
  
  function handleGameEvent(event) {
    const { eventType, eventData, playerId } = event.detail;
    
    switch (eventType) {
      case 'answer_submitted':
        handleAnswerSubmitted(playerId, eventData.answer);
        break;
      case 'round_started':
        handleRoundStarted(eventData);
        break;
      // Handle other events...
    }
  }
  
  // Game actions that sync with GameBuddies
  async function submitAnswer(answer) {
    // Send event
    await ddfGameBuddies.sendEvent('answer_submitted', { answer });
    
    // Update local state
    const newState = {
      ...gameState,
      answers: {
        ...gameState.answers,
        [gameData.playerId]: answer
      }
    };
    
    setGameState(newState);
    
    // Sync if host
    if (gameData.isHost) {
      await ddfGameBuddies.syncGameState(newState);
    }
  }
  
  // ... rest of your DDF game logic
}
```

## Part 4: URL Parameters

GameBuddies will launch your DDF game with these URL parameters:

- `room` - Room code (6 characters)
- `name` - Player name (URL encoded)
- `players` - Number of players
- `role` - "gm" for gamemaster/host (optional)

**Example URLs:**
- Host: `https://your-ddf-game.onrender.com?room=ABC123&players=4&name=Alice&role=gm`
- Player: `https://your-ddf-game.onrender.com?room=ABC123&players=4&name=Bob`

## Part 5: Return to GameBuddies

To return to GameBuddies, use:

```javascript
// Get return URL from sessionStorage
const returnUrl = sessionStorage.getItem('gamebuddies_returnUrl');
if (returnUrl) {
  window.location.href = returnUrl + '?rejoin=' + roomCode;
} else {
  window.location.href = 'https://gamebuddies.io';
}
```

## Part 6: Testing

1. **Run Database Setup**: Execute the SQL script in Supabase
2. **Copy API Key**: Save the generated DDF API key
3. **Deploy GameBuddies**: Make sure your GameBuddies server is running with the new API endpoints
4. **Update DDF Environment**: Add the API key and GameBuddies URL to your DDF project
5. **Test Integration**: Create a room in GameBuddies, then test the DDF game URL manually

## Data Flow

1. **GameBuddies**: User creates room, invites players
2. **Launch**: GameBuddies redirects to DDF with room code and player info
3. **Validation**: DDF validates room with GameBuddies API
4. **Join**: DDF registers player in room
5. **Game Play**: DDF syncs state and events through GameBuddies
6. **Real-time**: Socket.io provides instant updates to all players
7. **Return**: Players can return to GameBuddies lobby

This architecture ensures DDF never directly touches Supabase - everything goes through GameBuddies API! 🎮 