# GameBuddies API Implementation for DDF Integration

## Overview
Based on your Supabase schema, here's the complete implementation needed to connect DDF through GameBuddies API.

## Part 1: GameBuddies API Endpoints (Add to index.js)

### 1.1 Room Validation with API Key Authentication

```javascript
// Middleware for API key validation
async function validateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }
  
  try {
    const { data: key, error } = await db.adminClient
      .from('api_keys')
      .select('*')
      .eq('api_key', apiKey)
      .eq('is_active', true)
      .single();
    
    if (error || !key) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    
    // Update last used
    await db.adminClient
      .from('api_keys')
      .update({ last_used: new Date().toISOString() })
      .eq('id', key.id);
    
    // Log API request
    await db.adminClient
      .from('api_requests')
      .insert({
        api_key: apiKey,
        endpoint: req.path
      });
    
    req.apiKey = key;
    next();
  } catch (error) {
    console.error('API key validation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

// Room validation endpoint
app.get('/api/game/rooms/:roomCode/validate', validateApiKey, async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { playerName, playerId } = req.query;
    
    // Get room with all related data
    const { data: room, error } = await db.adminClient
      .from('game_rooms')
      .select(`
        *,
        participants:room_participants(
          *,
          user:user_profiles(*)
        )
      `)
      .eq('room_code', roomCode)
      .single();
    
    if (error || !room) {
      return res.status(404).json({ 
        valid: false, 
        error: 'Room not found',
        code: 'ROOM_NOT_FOUND'
      });
    }
    
    // Check room status
    if (!['waiting_for_players', 'active', 'launching'].includes(room.status)) {
      return res.status(400).json({ 
        valid: false, 
        error: `Room is ${room.status}`,
        code: 'ROOM_NOT_AVAILABLE',
        status: room.status
      });
    }
    
    // Check if game type matches
    if (room.game_type !== req.apiKey.service_name) {
      return res.status(400).json({ 
        valid: false, 
        error: 'Room is for a different game',
        code: 'WRONG_GAME_TYPE',
        gameType: room.game_type
      });
    }
    
    // Find participant
    const participant = room.participants?.find(p => 
      p.user?.username === playerName || 
      p.user_id === playerId
    );
    
    // Get latest game state if exists
    const { data: gameState } = await db.adminClient
      .from('game_states')
      .select('*')
      .eq('room_id', room.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    res.json({
      valid: true,
      room: {
        id: room.id,
        code: room.room_code,
        gameType: room.game_type,
        status: room.status,
        currentPlayers: room.current_players,
        maxPlayers: room.max_players,
        settings: room.settings,
        metadata: room.metadata,
        createdAt: room.created_at,
        startedAt: room.started_at
      },
      participant: participant ? {
        id: participant.user_id,
        role: participant.role,
        isHost: participant.role === 'host',
        isReady: participant.is_ready,
        gameData: participant.game_specific_data
      } : null,
      participants: room.participants
        ?.filter(p => p.connection_status !== 'disconnected')
        .map(p => ({
          id: p.user_id,
          name: p.user?.display_name || p.user?.username,
          role: p.role,
          isReady: p.is_ready,
          status: p.connection_status
        })),
      gameState: gameState ? {
        id: gameState.id,
        data: gameState.state_data,
        version: gameState.state_version,
        createdAt: gameState.created_at
      } : null
    });
    
  } catch (error) {
    console.error('Room validation error:', error);
    res.status(500).json({ 
      valid: false, 
      error: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
});
```

### 1.2 Player Join/Register Endpoint

```javascript
app.post('/api/game/rooms/:roomCode/join', validateApiKey, async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { playerName, playerId } = req.body;
    
    // Get room
    const { data: room, error: roomError } = await db.adminClient
      .from('game_rooms')
      .select('*')
      .eq('room_code', roomCode)
      .single();
    
    if (roomError || !room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Check if room is full
    if (room.current_players >= room.max_players) {
      return res.status(400).json({ 
        error: 'Room is full',
        code: 'ROOM_FULL'
      });
    }
    
    // Get or create user
    const externalId = playerId || `${req.apiKey.service_name}_${playerName}_${Date.now()}`;
    const { data: user } = await db.adminClient
      .rpc('get_or_create_user', {
        p_external_id: externalId,
        p_username: playerName,
        p_display_name: playerName
      });
    
    // Check if already in room
    const { data: existingParticipant } = await db.adminClient
      .from('room_participants')
      .select('*')
      .eq('room_id', room.id)
      .eq('user_id', user.id)
      .single();
    
    if (existingParticipant) {
      // Update connection status
      await db.adminClient
        .from('room_participants')
        .update({
          connection_status: 'connected',
          last_ping: new Date().toISOString()
        })
        .eq('id', existingParticipant.id);
        
      return res.json({
        success: true,
        playerId: user.id,
        role: existingParticipant.role,
        isRejoining: true
      });
    }
    
    // Add as new participant
    const { error: joinError } = await db.adminClient
      .from('room_participants')
      .insert({
        room_id: room.id,
        user_id: user.id,
        role: 'player',
        connection_status: 'connected'
      });
    
    if (joinError) throw joinError;
    
    // Log event
    await db.adminClient
      .from('room_events')
      .insert({
        room_id: room.id,
        user_id: user.id,
        event_type: 'player_joined_via_api',
        event_data: { 
          playerName, 
          service: req.apiKey.service_name 
        }
      });
    
    res.json({
      success: true,
      playerId: user.id,
      role: 'player',
      isRejoining: false
    });
    
  } catch (error) {
    console.error('Player join error:', error);
    res.status(500).json({ error: 'Failed to join room' });
  }
});
```

### 1.3 Game State Sync Endpoint

```javascript
app.post('/api/game/rooms/:roomCode/state', validateApiKey, async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { playerId, gameState, stateType = 'full' } = req.body;
    
    // Get room
    const { data: room, error: roomError } = await db.adminClient
      .from('game_rooms')
      .select('id, status')
      .eq('room_code', roomCode)
      .single();
    
    if (roomError || !room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Verify player is in room
    const { data: participant } = await db.adminClient
      .from('room_participants')
      .select('id, role')
      .eq('room_id', room.id)
      .eq('user_id', playerId)
      .single();
    
    if (!participant) {
      return res.status(403).json({ error: 'Player not in room' });
    }
    
    // Get current state version
    const { data: currentState } = await db.adminClient
      .from('game_states')
      .select('state_version')
      .eq('room_id', room.id)
      .order('state_version', { ascending: false })
      .limit(1)
      .single();
    
    const newVersion = (currentState?.state_version || 0) + 1;
    
    // Save new state
    const { data: savedState, error: saveError } = await db.adminClient
      .from('game_states')
      .insert({
        room_id: room.id,
        game_type: req.apiKey.service_name,
        state_data: gameState,
        state_version: newVersion,
        created_by: playerId
      })
      .select()
      .single();
    
    if (saveError) throw saveError;
    
    // Update room activity
    await db.adminClient
      .from('game_rooms')
      .update({ last_activity: new Date().toISOString() })
      .eq('id', room.id);
    
    // Broadcast via Socket.io if available
    if (io) {
      io.to(roomCode).emit('gameStateUpdated', {
        stateId: savedState.id,
        version: newVersion,
        updatedBy: playerId,
        stateType,
        timestamp: savedState.created_at
      });
    }
    
    res.json({
      success: true,
      stateId: savedState.id,
      version: newVersion
    });
    
  } catch (error) {
    console.error('State sync error:', error);
    res.status(500).json({ error: 'Failed to sync state' });
  }
});
```

### 1.4 Get Latest Game State

```javascript
app.get('/api/game/rooms/:roomCode/state', validateApiKey, async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { version } = req.query;
    
    // Get room
    const { data: room, error: roomError } = await db.adminClient
      .from('game_rooms')
      .select('id')
      .eq('room_code', roomCode)
      .single();
    
    if (roomError || !room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Get state by version or latest
    let query = db.adminClient
      .from('game_states')
      .select('*')
      .eq('room_id', room.id);
    
    if (version) {
      query = query.eq('state_version', version);
    } else {
      query = query.order('state_version', { ascending: false }).limit(1);
    }
    
    const { data: gameState, error } = await query.single();
    
    if (error || !gameState) {
      return res.status(404).json({ error: 'No game state found' });
    }
    
    res.json({
      id: gameState.id,
      version: gameState.state_version,
      data: gameState.state_data,
      createdBy: gameState.created_by,
      createdAt: gameState.created_at
    });
    
  } catch (error) {
    console.error('Get state error:', error);
    res.status(500).json({ error: 'Failed to get state' });
  }
});
```

### 1.5 Player Status Update

```javascript
app.post('/api/game/rooms/:roomCode/players/:playerId/status', validateApiKey, async (req, res) => {
  try {
    const { roomCode, playerId } = req.params;
    const { status, gameData } = req.body;
    
    // Get room
    const { data: room } = await db.adminClient
      .from('game_rooms')
      .select('id')
      .eq('room_code', roomCode)
      .single();
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Update participant
    const { error: updateError } = await db.adminClient
      .from('room_participants')
      .update({
        connection_status: status,
        game_specific_data: gameData,
        last_ping: new Date().toISOString()
      })
      .eq('room_id', room.id)
      .eq('user_id', playerId);
    
    if (updateError) throw updateError;
    
    // Log event
    await db.adminClient
      .from('room_events')
      .insert({
        room_id: room.id,
        user_id: playerId,
        event_type: 'player_status_update',
        event_data: { status, gameData }
      });
    
    // Broadcast if needed
    if (io) {
      io.to(roomCode).emit('playerStatusUpdated', {
        playerId,
        status,
        gameData,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Status update error:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});
```

### 1.6 Game Events Endpoint

```javascript
app.post('/api/game/rooms/:roomCode/events', validateApiKey, async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { playerId, eventType, eventData } = req.body;
    
    // Get room
    const { data: room } = await db.adminClient
      .from('game_rooms')
      .select('id')
      .eq('room_code', roomCode)
      .single();
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Log event
    await db.adminClient
      .from('room_events')
      .insert({
        room_id: room.id,
        user_id: playerId,
        event_type: `game_${eventType}`,
        event_data: eventData,
        client_info: {
          service: req.apiKey.service_name,
          timestamp: new Date().toISOString()
        }
      });
    
    // Broadcast event
    if (io) {
      io.to(roomCode).emit('gameEvent', {
        playerId,
        eventType,
        eventData,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Event logging error:', error);
    res.status(500).json({ error: 'Failed to log event' });
  }
});
```

## Part 2: DDF Client Implementation

### 2.1 GameBuddies API Client for DDF

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

### 2.2 DDF Integration Service

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
      console.log('Validating room with GameBuddies...');
      const validation = await this.apiClient.validateRoom(roomCode, playerName);
      
      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid room');
      }
      
      this.roomCode = roomCode;
      this.playerName = playerName;
      
      // Join or rejoin room
      if (validation.participant) {
        // Player already in room
        this.playerId = validation.participant.id;
        this.isHost = validation.participant.isHost;
        console.log('Rejoining as existing participant');
      } else {
        // New player
        console.log('Joining room as new player...');
        const joinResult = await this.apiClient.joinRoom(roomCode, playerName);
        this.playerId = joinResult.playerId;
        this.isHost = isGM || joinResult.role === 'host';
      }
      
      // Connect to Socket.io for real-time updates
      this.connectSocket();
      
      // Start periodic status updates
      this.startHeartbeat();
      
      return {
        room: validation.room,
        participants: validation.participants,
        gameState: validation.gameState,
        playerId: this.playerId,
        isHost: this.isHost
      };
      
    } catch (error) {
      console.error('Failed to initialize GameBuddies connection:', error);
      throw error;
    }
  }
  
  connectSocket() {
    const serverUrl = this.apiClient.baseUrl;
    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling']
    });
    
    this.socket.on('connect', () => {
      console.log('Connected to GameBuddies real-time');
      // Join room for updates
      this.socket.emit('joinRoom', {
        roomCode: this.roomCode,
        playerName: this.playerName
      });
    });
    
    this.socket.on('gameStateUpdated', (data) => {
      window.dispatchEvent(new CustomEvent('gamebuddies:stateUpdated', { 
        detail: data 
      }));
    });
    
    this.socket.on('playerStatusUpdated', (data) => {
      window.dispatchEvent(new CustomEvent('gamebuddies:playerStatusUpdated', { 
        detail: data 
      }));
    });
    
    this.socket.on('gameEvent', (data) => {
      window.dispatchEvent(new CustomEvent('gamebuddies:gameEvent', { 
        detail: data 
      }));
    });
    
    this.socket.on('playerJoined', (data) => {
      window.dispatchEvent(new CustomEvent('gamebuddies:playerJoined', { 
        detail: data 
      }));
    });
    
    this.socket.on('playerLeft', (data) => {
      window.dispatchEvent(new CustomEvent('gamebuddies:playerLeft', { 
        detail: data 
      }));
    });
  }
  
  startHeartbeat() {
    // Send heartbeat every 30 seconds
    this.syncInterval = setInterval(async () => {
      try {
        await this.apiClient.updatePlayerStatus(
          this.roomCode, 
          this.playerId, 
          'connected',
          { lastPing: Date.now() }
        );
      } catch (error) {
        console.error('Heartbeat failed:', error);
      }
    }, 30000);
  }
  
  async syncGameState(gameState) {
    try {
      return await this.apiClient.syncGameState(
        this.roomCode,
        this.playerId,
        gameState
      );
    } catch (error) {
      console.error('Failed to sync game state:', error);
      throw error;
    }
  }
  
  async sendEvent(eventType, eventData) {
    try {
      return await this.apiClient.sendGameEvent(
        this.roomCode,
        this.playerId,
        eventType,
        eventData
      );
    } catch (error) {
      console.error('Failed to send event:', error);
    }
  }
  
  disconnect() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    
    if (this.socket) {
      this.socket.disconnect();
    }
    
    // Send disconnect status
    this.apiClient.updatePlayerStatus(
      this.roomCode,
      this.playerId,
      'disconnected'
    ).catch(console.error);
  }
}

export default new DDFGameBuddiesService();
```

### 2.3 Using in DDF Game Component

```javascript
// In DDF main game component
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
      // Show normal DDF UI
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
      
      setPlayers(data.participants);
      
      if (data.gameState) {
        setGameState(data.gameState.data);
      } else if (data.isHost) {
        // Initialize new game state
        const initialState = createInitialGameState(data.participants);
        await ddfGameBuddies.syncGameState(initialState);
        setGameState(initialState);
      }
      
      setLoading(false);
      
    } catch (error) {
      console.error('Failed to initialize:', error);
      alert(`Failed to join game: ${error.message}`);
      window.location.href = '/';
    }
  }
  
  function handleStateUpdate(event) {
    // Reload state from GameBuddies
    ddfGameBuddies.apiClient.getGameState(gameData.roomCode)
      .then(state => {
        setGameState(state.data);
      })
      .catch(console.error);
  }
  
  function handlePlayerJoined(event) {
    const { player } = event.detail;
    setPlayers(prev => [...prev, player]);
    
    // Send current state to new player
    if (gameData.isHost && gameState) {
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
      // Handle other game events
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
  
  async function startNewRound() {
    if (!gameData.isHost) return;
    
    const newRound = generateNewRound();
    const newState = {
      ...gameState,
      currentRound: newRound,
      answers: {},
      roundStartTime: Date.now()
    };
    
    // Sync state
    await ddfGameBuddies.syncGameState(newState);
    
    // Send event
    await ddfGameBuddies.sendEvent('round_started', {
      round: newRound
    });
    
    setGameState(newState);
  }
}
```

## Part 3: Required Environment Variables

### For GameBuddies:
```env
# Existing variables...
DDF_URL=https://ddf-game.onrender.com
```

### For DDF:
```env
REACT_APP_GAMEBUDDIES_API_URL=https://gamebuddies.io
REACT_APP_DDF_API_KEY=gb_ddf_YOUR_API_KEY_HERE
```

## Part 4: Get Your API Key

Run this SQL in Supabase to get/create your DDF API key:

```sql
-- Get existing DDF API key
SELECT api_key FROM api_keys WHERE service_name = 'ddf';

-- Or create a new one if needed
INSERT INTO api_keys (service_name, api_key, permissions, rate_limit)
VALUES (
  'ddf',
  'gb_ddf_' || replace(gen_random_uuid()::text, '-', ''),
  '["create_room", "join_room", "sync_state", "read_state"]',
  100
)
ON CONFLICT (service_name) DO UPDATE
SET is_active = true
RETURNING api_key;
```

## Data Flow Summary

1. **DDF Start**: URL params → Validate room → Join/Register player → Get initial state
2. **During Game**: Game events → GameBuddies API → Supabase → Broadcast to players
3. **State Sync**: Host syncs full state → Saved with version → Other players notified
4. **Real-time**: Socket.io for instant updates + API for persistence

This implementation ensures DDF never touches Supabase directly - everything goes through GameBuddies API!