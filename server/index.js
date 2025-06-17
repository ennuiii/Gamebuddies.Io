const express = require('express');
const path = require('path');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const { createProxyMiddleware } = require('http-proxy-middleware');
const http = require('http');
const socketIo = require('socket.io');
const { db } = require('./lib/supabase');
const HeartbeatManager = require('./lib/heartbeat');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Enhanced CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'https://gamebuddies.io',
    'https://gamebuddies-client.onrender.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Socket.io setup with enhanced configuration
const io = socketIo(server, {
  cors: corsOptions,
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6,
  transports: ['websocket', 'polling']
});

// Game proxy configuration
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
  }
};

// Setup game proxies
Object.values(gameProxies).forEach(proxy => {
  app.use(proxy.path, createProxyMiddleware({
    target: proxy.target,
    changeOrigin: true,
    pathRewrite: proxy.pathRewrite,
    timeout: 30000,
    proxyTimeout: 30000,
    onError: (err, req, res) => {
      console.error(`Proxy error for ${proxy.path}:`, err.message);
      res.status(502).json({ 
        error: 'Game service temporarily unavailable',
        message: 'Please try again in a few moments'
      });
    }
  }));
});

// Serve static files from React build
app.use(express.static(path.join(__dirname, '../client/build')));

// Serve screenshots
app.use('/screenshots', express.static(path.join(__dirname, 'screenshots')));

// ===== NEW API ENDPOINTS =====

// Games endpoint - returns available games
app.get('/api/games', (req, res) => {
  const games = [
    {
      id: 'ddf',
      name: 'Der dümmste fliegt',
      description: 'A fun quiz game where the worst player gets eliminated each round!',
      path: '/ddf',
      screenshot: '/screenshots/DDF.png',
      available: true,
      maxPlayers: 8
    },
    {
      id: 'schooled',
      name: 'School Quiz Game',
      description: 'Test your knowledge in this educational quiz game!',
      path: '/schooled',
      screenshot: '/screenshots/schooled.png',
      available: true,
      maxPlayers: 6
    }
  ];
  
  res.json(games);
});

// ===== GAMEBUDDIES API FOR EXTERNAL GAMES =====

// Middleware for API key validation
async function validateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  
  console.log(`🔐 [API AUTH] API key validation attempt:`, {
    endpoint: req.path,
    method: req.method,
    hasApiKey: !!apiKey,
    apiKeyPrefix: apiKey ? `${apiKey.substring(0, 8)}...` : 'none',
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });
  
  if (!apiKey) {
    console.log(`❌ [API AUTH] No API key provided for ${req.method} ${req.path}`);
    return res.status(401).json({ error: 'API key required' });
  }
  
  try {
    const { data: key, error } = await db.adminClient
      .from('api_keys')
      .select('*')
      .eq('key_hash', apiKey)
      .eq('is_active', true)
      .single();
    
    if (error || !key) {
      console.log(`❌ [API AUTH] Invalid API key:`, {
        apiKeyPrefix: `${apiKey.substring(0, 8)}...`,
        error: error?.message,
        endpoint: req.path,
        ip: req.ip || req.connection?.remoteAddress
      });
      return res.status(401).json({ error: 'Invalid API key' });
    }

    console.log(`✅ [API AUTH] Valid API key:`, {
      service: key.name || key.service_name,
      keyId: key.id,
      endpoint: req.path,
      lastUsed: key.last_used
    });
    
    // Update last used
    await db.adminClient
      .from('api_keys')
      .update({ last_used: new Date().toISOString() })
      .eq('id', key.id);
    
    // Log API request
    await db.adminClient
      .from('api_requests')
      .insert({
        api_key_id: key.id,
        endpoint: req.path,
        method: req.method,
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      });
    
    req.apiKey = key;
    next();
  } catch (error) {
    console.error('❌ [API AUTH] API key validation error:', {
      error: error.message,
      stack: error.stack,
      endpoint: req.path,
      method: req.method,
      ip: req.ip || req.connection?.remoteAddress
    });
    res.status(500).json({ error: 'Server error' });
  }
}

// Room validation endpoint
app.get('/api/game/rooms/:roomCode/validate', validateApiKey, async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { playerName, playerId } = req.query;
    
    console.log(`🔍 [API] Validating room ${roomCode} for ${playerName} (service: ${req.apiKey.service_name})`);
    
    // Get room with all related data
    const { data: room, error } = await db.adminClient
      .from('rooms')
      .select(`
        *,
        participants:room_members(
          *,
          user:users(*)
        )
      `)
      .eq('room_code', roomCode)
      .single();
    
    if (error || !room) {
      console.log(`❌ [API] Room ${roomCode} not found`);
      return res.status(404).json({ 
        valid: false, 
        error: 'Room not found',
        code: 'ROOM_NOT_FOUND'
      });
    }
    
    // Check room status - V2 Schema uses 'lobby', 'in_game', 'returning'
    if (!['lobby', 'in_game', 'returning'].includes(room.status)) {
      console.log(`❌ [API] Room ${roomCode} has invalid status: ${room.status}`);
      return res.status(400).json({ 
        valid: false, 
        error: `Room is ${room.status}`,
        code: 'ROOM_NOT_AVAILABLE',
        status: room.status
      });
    }
    
    // Check if game type matches or room is in lobby state
    if (room.current_game && room.current_game !== req.apiKey.service_name) {
      console.log(`❌ [API] Room ${roomCode} is for game ${room.current_game}, not ${req.apiKey.service_name}`);
      return res.status(400).json({ 
        valid: false, 
        error: 'Room is for a different game',
        code: 'WRONG_GAME_TYPE',
        gameType: room.current_game
      });
    }
    
    // Find participant if playerName or playerId provided
    let participant = null;
    if (playerName || playerId) {
      participant = room.participants?.find(p => 
        (playerName && p.user?.username === playerName) || 
        (playerId && p.user_id === playerId)
      );
    }
    
    // Get latest game state if exists
    const { data: gameState } = await db.adminClient
      .from('game_states')
      .select('*')
      .eq('room_id', room.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    console.log(`✅ [API] Room ${roomCode} validated successfully`);
    
    res.json({
      valid: true,
      room: {
        id: room.id,
        code: room.room_code,
        gameType: room.current_game,
        status: room.status,
        currentPlayers: room.participants?.filter(p => p.is_connected === true).length || 0,
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
        ?.filter(p => p.is_connected === true)
        .map(p => ({
          id: p.user_id,
          name: p.user?.display_name || p.user?.username,
          role: p.role,
          isReady: p.is_ready,
          status: p.is_connected ? 'connected' : 'disconnected'
        })),
      gameState: gameState ? {
        id: gameState.id,
        data: gameState.state_data,
        version: gameState.state_version,
        createdAt: gameState.created_at
      } : null
    });
    
  } catch (error) {
    console.error('❌ [API] Room validation error:', error);
    res.status(500).json({ 
      valid: false, 
      error: 'Server error',
      code: 'SERVER_ERROR'
    });
  }
});

// Player join/register endpoint
app.post('/api/game/rooms/:roomCode/join', validateApiKey, async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { playerName, playerId } = req.body;
    
    console.log(`🚪 [API] Player ${playerName} joining room ${roomCode} (service: ${req.apiKey.service_name})`);
    
    // Get room
    const { data: room, error: roomError } = await db.adminClient
      .from('rooms')
      .select('*')
      .eq('room_code', roomCode)
      .single();
    
    if (roomError || !room) {
      console.log(`❌ [API] Room ${roomCode} not found for join`);
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Check if room is full - calculate current players from connected members
    const currentPlayers = room.participants?.filter(p => p.is_connected === true).length || 0;
    if (currentPlayers >= room.max_players) {
      console.log(`❌ [API] Room ${roomCode} is full (${currentPlayers}/${room.max_players})`);
      return res.status(400).json({ 
        error: 'Room is full',
        code: 'ROOM_FULL'
      });
    }
    
    // Get or create user
    const externalId = playerId || `${req.apiKey.service_name}_${playerName}_${Date.now()}`;
    const user = await db.getOrCreateUser(externalId, playerName, playerName);
    
    // Check if already in room
    const { data: existingParticipant } = await db.adminClient
      .from('room_members')
      .select('*')
      .eq('room_id', room.id)
      .eq('user_id', user.id)
      .single();
    
    if (existingParticipant) {
      console.log(`🔄 [API] Player ${playerName} rejoining room ${roomCode}`);
      // Update connection status
      await db.adminClient
        .from('room_members')
        .update({
          is_connected: true,
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
      .from('room_members')
      .insert({
        room_id: room.id,
        user_id: user.id,
        role: 'player',
        is_connected: true
      });
    
    if (joinError) throw joinError;
    
    // Update room to current game if it doesn't have one
    if (!room.current_game) {
      await db.adminClient
        .from('rooms')
        .update({ 
          current_game: req.apiKey.service_name,
          last_activity: new Date().toISOString()
        })
        .eq('id', room.id);
    }
    
    // Log event
    await db.logEvent(room.id, user.id, 'player_joined_via_api', { 
      playerName, 
      service: req.apiKey.service_name 
    });
    
    console.log(`✅ [API] Player ${playerName} joined room ${roomCode} successfully`);
    
    res.json({
      success: true,
      playerId: user.id,
      role: 'player',
      isRejoining: false
    });
    
  } catch (error) {
    console.error('❌ [API] Player join error:', error);
    res.status(500).json({ error: 'Failed to join room' });
  }
});

// Game state sync endpoint
app.post('/api/game/rooms/:roomCode/state', validateApiKey, async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { playerId, gameState, stateType = 'full' } = req.body;
    
    console.log(`📊 [API] Syncing game state for room ${roomCode} by player ${playerId}`);
    
    // Get room
    const { data: room, error: roomError } = await db.adminClient
      .from('rooms')
      .select('id, status')
      .eq('room_code', roomCode)
      .single();
    
    if (roomError || !room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Verify player is in room
    const { data: participant } = await db.adminClient
      .from('room_members')
      .select('id, role')
      .eq('room_id', room.id)
      .eq('user_id', playerId)
      .single();
    
    if (!participant) {
      return res.status(403).json({ error: 'Player not in room' });
    }
    
    // Save new state using existing method
    const savedState = await db.saveGameState(room.id, req.apiKey.service_name, gameState, playerId);
    
    // Update room activity
    await db.adminClient
      .from('rooms')
      .update({ 
        last_activity: new Date().toISOString(),
        status: 'in_game' // Mark room as in_game when game state is synced
      })
      .eq('id', room.id);
    
    // Broadcast via Socket.io if available
    if (io) {
      io.to(roomCode).emit('gameStateUpdated', {
        stateId: savedState.id,
        version: savedState.state_version,
        updatedBy: playerId,
        stateType,
        timestamp: savedState.created_at
      });
    }
    
    console.log(`✅ [API] Game state synced for room ${roomCode}, version ${savedState.state_version}`);
    
    res.json({
      success: true,
      stateId: savedState.id,
      version: savedState.state_version
    });
    
  } catch (error) {
    console.error('❌ [API] State sync error:', error);
    res.status(500).json({ error: 'Failed to sync state' });
  }
});

// Get latest game state
app.get('/api/game/rooms/:roomCode/state', validateApiKey, async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { version } = req.query;
    
    // Get room
    const { data: room, error: roomError } = await db.adminClient
      .from('rooms')
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
    console.error('❌ [API] Get state error:', error);
    res.status(500).json({ error: 'Failed to get state' });
  }
});

// Player status update (enhanced for external games)
app.post('/api/game/rooms/:roomCode/players/:playerId/status', validateApiKey, async (req, res) => {
  try {
    const { roomCode, playerId } = req.params;
    const { status, gameData, location, reason } = req.body;
    
    console.log(`🎮 [API] External game status update:`, {
      roomCode,
      playerId,
      status,
      location,
      reason,
      gameData: gameData ? 'present' : 'none',
      apiService: req.apiKey?.name || req.apiKey?.service_name,
      requestIP: req.ip || req.connection?.remoteAddress,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });
    
    // Debug request headers and body
    console.log(`🔍 [API DEBUG] Request details:`, {
      headers: {
        'content-type': req.get('Content-Type'),
        'x-api-key': req.apiKey?.service_name ? `${req.apiKey.service_name} (valid)` : 'invalid',
        'user-agent': req.get('User-Agent'),
        'origin': req.get('Origin'),
        'referer': req.get('Referer')
      },
      body: {
        status,
        location,
        reason,
        gameDataKeys: gameData ? Object.keys(gameData) : null,
        gameDataSize: gameData ? JSON.stringify(gameData).length : 0
      },
      params: { roomCode, playerId }
    });
    
    // Get room
    const { data: room, error: roomError } = await db.adminClient
      .from('rooms')
      .select('id, room_code, status')
      .eq('room_code', roomCode)
      .single();
    
    console.log(`🔍 [API DEBUG] Room query result:`, {
      roomCode,
      hasData: !!room,
      hasError: !!roomError,
      error: roomError?.message,
      errorCode: roomError?.code,
      errorDetails: roomError?.details
    });
    
    if (!room) {
      console.log(`❌ [API] Room not found: ${roomCode}`);
      
      // Debug: Check if room exists but with different status
      const { data: anyRoom } = await db.adminClient
        .from('rooms')
        .select('id, room_code, status, created_at, last_activity')
        .eq('room_code', roomCode)
        .single();
      
      if (anyRoom) {
        console.log(`🔍 [API DEBUG] Room ${roomCode} exists but wasn't returned:`, {
          id: anyRoom.id,
          status: anyRoom.status,
          created_at: anyRoom.created_at,
          last_activity: anyRoom.last_activity
        });
      } else {
        console.log(`🔍 [API DEBUG] Room ${roomCode} does not exist in database at all`);
      }
      
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Get current participant data
    const { data: participant } = await db.adminClient
      .from('room_members')
      .select('user_id, in_game, current_location, is_connected')
      .eq('room_id', room.id)
      .eq('user_id', playerId)
      .single();
    
    if (!participant) {
      console.log(`❌ [API] Player not found in room: ${playerId}`);
      return res.status(404).json({ error: 'Player not found in room' });
    }
    
    console.log(`🔍 [API] Current participant status:`, {
      user_id: participant.user_id,
      in_game: participant.in_game,
      current_location: participant.current_location,
      is_connected: participant.is_connected
    });
    
    // Debug room context
    console.log(`🏠 [API DEBUG] Room context:`, {
      room_id: room.id,
      room_code: room.room_code,
      room_status: room.status,
      total_participants: await db.adminClient
        .from('room_members')
        .select('user_id', { count: 'exact' })
        .eq('room_id', room.id)
        .then(({ count }) => count),
      connected_participants: await db.adminClient
        .from('room_members')
        .select('user_id', { count: 'exact' })
        .eq('room_id', room.id)
        .eq('is_connected', true)
        .then(({ count }) => count),
      in_game_participants: await db.adminClient
        .from('room_members')
        .select('user_id', { count: 'exact' })
        .eq('room_id', room.id)
        .eq('in_game', true)
        .then(({ count }) => count)
    });
    
    // Determine new status based on input
    let updateData = {
      last_ping: new Date().toISOString(),
      game_data: gameData || null
    };
    
    // Handle different status types
    switch (status) {
      case 'connected':
        updateData.is_connected = true;
        updateData.current_location = location || 'lobby'; // Default to lobby, not game
        updateData.in_game = false; // Don't assume they're in game just because connected
        break;
        
      case 'disconnected':
        updateData.is_connected = false;
        updateData.current_location = 'disconnected';
        updateData.in_game = false;
        break;
        
      case 'returned_to_lobby':
        updateData.is_connected = true;
        updateData.current_location = 'lobby';
        updateData.in_game = false;
        break;
        
      case 'in_game':
        updateData.is_connected = true;
        updateData.current_location = 'game';
        updateData.in_game = true;
        break;
        
      default:
        updateData.is_connected = status === 'connected';
        updateData.current_location = location || (status === 'connected' ? 'lobby' : 'disconnected');
        updateData.in_game = false; // Don't assume in game for unknown status
    }
    
    console.log(`📝 [API] Status change analysis:`, {
      before: {
        is_connected: participant.is_connected,
        current_location: participant.current_location,
        in_game: participant.in_game
      },
      after: {
        is_connected: updateData.is_connected,
        current_location: updateData.current_location,
        in_game: updateData.in_game
      },
      changes: {
        connection_changed: participant.is_connected !== updateData.is_connected,
        location_changed: participant.current_location !== updateData.current_location,
        game_status_changed: participant.in_game !== updateData.in_game
      }
    });
    
    console.log(`📝 [API] Updating participant with:`, updateData);
    
    // Update participant
    const { error: updateError } = await db.adminClient
      .from('room_members')
      .update(updateData)
      .eq('room_id', room.id)
      .eq('user_id', playerId);
    
    if (updateError) {
      console.error(`❌ [API] Database update error:`, updateError);
      throw updateError;
    }
    
    // Log event
    await db.logEvent(room.id, playerId, 'external_game_status_update', { 
      status, 
      location: updateData.current_location,
      reason,
      gameData,
      service: req.apiKey?.service_name
    });
    
    // Get updated room data for broadcasting
    const updatedRoom = await db.getRoomByCode(roomCode);
    
    // Broadcast to GameBuddies lobby with complete player data
    if (io) {
      const allPlayers = updatedRoom.participants?.map(p => ({
        id: p.user_id,
        name: p.user?.display_name || p.user?.username,
        isHost: p.role === 'host',
        isConnected: p.is_connected,
        inGame: p.in_game,
        currentLocation: p.current_location || (p.is_connected ? 'lobby' : 'disconnected'), // Provide default
        lastPing: p.last_ping,
        socketId: null
      })) || [];
      
      // Debug broadcast details
      console.log(`📡 [API DEBUG] Broadcasting details:`, {
        roomCode,
        socketRoomExists: io.sockets.adapter.rooms.has(roomCode),
        socketRoomSize: io.sockets.adapter.rooms.get(roomCode)?.size || 0,
        connectedSockets: Array.from(io.sockets.sockets.keys()).length,
        playersInUpdate: allPlayers.length,
        targetPlayerId: playerId,
        newStatus: updateData.current_location
      });
      
      // Debug player status summary
      const statusSummary = allPlayers.reduce((acc, p) => {
        const status = p.currentLocation || 'unknown';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});
      
      console.log(`👥 [API DEBUG] Player status summary after update:`, statusSummary);
      
      console.log(`📡 [API] Broadcasting status update to room ${roomCode}`);
      io.to(roomCode).emit('playerStatusUpdated', {
        playerId,
        status: updateData.current_location,
        reason,
        players: allPlayers,
        room: updatedRoom,
        source: 'external_game',
        timestamp: new Date().toISOString()
      });
      
      // Confirm broadcast was sent
      console.log(`✅ [API DEBUG] Broadcast sent to ${io.sockets.adapter.rooms.get(roomCode)?.size || 0} connected clients`);
    } else {
      console.log(`⚠️ [API DEBUG] Socket.io not available - cannot broadcast status update`);
    }
    
    console.log(`✅ [API] Successfully updated player ${playerId} status to ${status} (location: ${updateData.current_location})`);
    
    res.json({ 
      success: true,
      updated: {
        status: updateData.current_location,
        is_connected: updateData.is_connected,
        in_game: updateData.in_game
      }
    });
    
  } catch (error) {
    console.error('❌ [API] Status update error:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Bulk player status update (for multiple players at once)
app.post('/api/game/rooms/:roomCode/players/bulk-status', validateApiKey, async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { players, reason } = req.body;
    
    console.log(`🎮 [API] Bulk status update for room ${roomCode}:`, {
      playerCount: players?.length || 0,
      reason,
      apiService: req.apiKey?.name || req.apiKey?.service_name,
      requestIP: req.ip || req.connection?.remoteAddress,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    });
    
    // Debug request details
    console.log(`🔍 [API DEBUG] Bulk request details:`, {
      headers: {
        'content-type': req.get('Content-Type'),
        'x-api-key': req.apiKey?.service_name ? `${req.apiKey.service_name} (valid)` : 'invalid',
        'user-agent': req.get('User-Agent'),
        'origin': req.get('Origin'),
        'referer': req.get('Referer')
      },
      body: {
        reason,
        playerCount: players?.length || 0,
        playerIds: players?.map(p => p.playerId) || [],
        statusTypes: players?.reduce((acc, p) => {
          acc[p.status] = (acc[p.status] || 0) + 1;
          return acc;
        }, {}) || {},
        bodySize: JSON.stringify(req.body).length
      },
      params: { roomCode }
    });
    
    if (!players || !Array.isArray(players) || players.length === 0) {
      return res.status(400).json({ error: 'Players array is required' });
    }
    
    // Get room
    const { data: room } = await db.adminClient
      .from('rooms')
      .select('id, room_code, status')
      .eq('room_code', roomCode)
      .single();
    
    if (!room) {
      console.log(`❌ [API] Room not found: ${roomCode}`);
      return res.status(404).json({ error: 'Room not found' });
    }
    
    const results = [];
    
    // Debug room context for bulk update
    const roomParticipants = await db.adminClient
      .from('room_members')
      .select('user_id, is_connected, current_location, in_game')
      .eq('room_id', room.id);
    
    console.log(`🏠 [API DEBUG] Room context before bulk update:`, {
      room_id: room.id,
      room_code: room.room_code,
      room_status: room.status,
      total_participants: roomParticipants.data?.length || 0,
      current_status_breakdown: roomParticipants.data?.reduce((acc, p) => {
        const status = p.current_location || 'unknown';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {}) || {}
    });
    
    // Process each player update
    for (const playerUpdate of players) {
      const { playerId, status, gameData, location } = playerUpdate;
      
      console.log(`👤 [API DEBUG] Processing player ${playerId}:`, {
        playerId,
        requestedStatus: status,
        requestedLocation: location,
        hasGameData: !!gameData
      });
      
      try {
        // Determine update data
        let updateData = {
          last_ping: new Date().toISOString(),
          game_data: gameData || null
        };
        
        switch (status) {
          case 'connected':
            updateData.is_connected = true;
            updateData.current_location = location || 'lobby'; // Default to lobby, not game
            updateData.in_game = false; // Don't assume they're in game just because connected
            break;
            
          case 'disconnected':
            updateData.is_connected = false;
            updateData.current_location = 'disconnected';
            updateData.in_game = false;
            break;
            
          case 'returned_to_lobby':
            updateData.is_connected = true;
            updateData.current_location = 'lobby';
            updateData.in_game = false;
            break;
            
          case 'in_game':
            updateData.is_connected = true;
            updateData.current_location = 'game';
            updateData.in_game = true;
            break;
            
          default:
            updateData.is_connected = status === 'connected';
            updateData.current_location = location || (status === 'connected' ? 'game' : 'disconnected');
        }
        
        // Update participant
        const { error: updateError } = await db.adminClient
          .from('room_members')
          .update(updateData)
          .eq('room_id', room.id)
          .eq('user_id', playerId);
        
        if (updateError) {
          console.error(`❌ [API] Failed to update player ${playerId}:`, {
            playerId,
            error: updateError.message,
            code: updateError.code,
            details: updateError.details,
            hint: updateError.hint
          });
          results.push({ playerId, success: false, error: updateError.message });
        } else {
          console.log(`✅ [API DEBUG] Successfully updated player ${playerId}:`, {
            playerId,
            newStatus: updateData.current_location,
            newConnection: updateData.is_connected,
            newInGame: updateData.in_game
          });
          
          // Log event
          await db.logEvent(room.id, playerId, 'external_game_bulk_status_update', { 
            status, 
            location: updateData.current_location,
            reason,
            gameData,
            service: req.apiKey?.service_name
          });
          
          results.push({ 
            playerId, 
            success: true, 
            updated: {
              status: updateData.current_location,
              is_connected: updateData.is_connected,
              in_game: updateData.in_game
            }
          });
        }
        
      } catch (playerError) {
        console.error(`❌ [API] Error updating player ${playerId}:`, {
          playerId,
          error: playerError.message,
          stack: playerError.stack,
          requestedStatus: status,
          requestedLocation: location
        });
        results.push({ playerId, success: false, error: playerError.message });
      }
    }
    
    // Get updated room data and broadcast
    const updatedRoom = await db.getRoomByCode(roomCode);
    
    if (io) {
      const allPlayers = updatedRoom.participants?.map(p => ({
        id: p.user_id,
        name: p.user?.display_name || p.user?.username,
        isHost: p.role === 'host',
        isConnected: p.is_connected,
        inGame: p.in_game,
        currentLocation: p.current_location || (p.is_connected ? 'lobby' : 'disconnected'), // Provide default
        lastPing: p.last_ping,
        socketId: null
      })) || [];
      
      // Debug bulk broadcast details
      const finalStatusSummary = allPlayers.reduce((acc, p) => {
        const status = p.currentLocation || 'unknown';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});
      
      console.log(`📡 [API DEBUG] Bulk broadcast details:`, {
        roomCode,
        socketRoomExists: io.sockets.adapter.rooms.has(roomCode),
        socketRoomSize: io.sockets.adapter.rooms.get(roomCode)?.size || 0,
        connectedSockets: Array.from(io.sockets.sockets.keys()).length,
        playersInUpdate: allPlayers.length,
        finalStatusSummary,
        successfulUpdates: results.filter(r => r.success).length,
        failedUpdates: results.filter(r => !r.success).length
      });
      
      console.log(`📡 [API] Broadcasting bulk status update to room ${roomCode}`);
      io.to(roomCode).emit('playerStatusUpdated', {
        reason,
        players: allPlayers,
        room: updatedRoom,
        source: 'external_game_bulk',
        timestamp: new Date().toISOString()
      });
      
      // Confirm bulk broadcast was sent
      console.log(`✅ [API DEBUG] Bulk broadcast sent to ${io.sockets.adapter.rooms.get(roomCode)?.size || 0} connected clients`);
    } else {
      console.log(`⚠️ [API DEBUG] Socket.io not available - cannot broadcast bulk status update`);
    }
    
    const successCount = results.filter(r => r.success).length;
    console.log(`✅ [API] Bulk update completed: ${successCount}/${results.length} players updated successfully`);
    
    res.json({ 
      success: true,
      results,
      summary: {
        total: results.length,
        successful: successCount,
        failed: results.length - successCount
      }
    });
    
  } catch (error) {
    console.error('❌ [API] Bulk status update error:', error);
    res.status(500).json({ error: 'Failed to update player statuses' });
  }
});

// Game events endpoint
app.post('/api/game/rooms/:roomCode/events', validateApiKey, async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { playerId, eventType, eventData } = req.body;
    
    // Get room
    const { data: room } = await db.adminClient
      .from('rooms')
      .select('id')
      .eq('room_code', roomCode)
      .single();
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Log event
    await db.logEvent(room.id, playerId, `game_${eventType}`, {
      ...eventData,
      service: req.apiKey.service_name,
      timestamp: new Date().toISOString()
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
    console.error('❌ [API] Event logging error:', error);
    res.status(500).json({ error: 'Failed to log event' });
  }
});

// Room discovery endpoint
app.get('/api/rooms', async (req, res) => {
  try {
    const filters = {
      gameType: req.query.gameType || 'all',
      status: req.query.status || 'lobby',
      showFull: req.query.showFull === 'true',
      visibility: req.query.visibility || 'public'
    };

    const rooms = await db.getActiveRooms(filters);
    res.json({ success: true, rooms });
  } catch (error) {
    console.error('Error fetching rooms:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch rooms' 
    });
  }
});

// Get specific room details
app.get('/api/rooms/:code', async (req, res) => {
  try {
    const room = await db.getRoomByCode(req.params.code);
    if (!room) {
      return res.status(404).json({ 
        success: false, 
        error: 'Room not found' 
      });
    }
    res.json({ success: true, room });
  } catch (error) {
    console.error('Error fetching room:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch room details' 
    });
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Test database connection
    await db.adminClient.from('rooms').select('id').limit(1);
    
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      version: '2.1.0',
      storage: {
        type: 'SUPABASE',
        persistent: true,
        description: 'Using Supabase database'
      }
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy', 
      error: error.message,
      storage: {
        type: 'SUPABASE',
        persistent: true
      }
    });
  }
});

// Debug endpoint to check storage status
app.get('/api/debug/storage', (req, res) => {
  res.json({
    storage_type: 'SUPABASE',
    is_persistent: true,
    supabase_configured: true,
    environment_vars: {
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      SUPABASE_ANON_KEY: !!process.env.SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY
    }
  });
});

// ===== SOCKET.IO EVENT HANDLERS =====

// Track active connections
const activeConnections = new Map();

// Initialize heartbeat manager
const heartbeatManager = new HeartbeatManager(db, io);

io.on('connection', async (socket) => {
  console.log(`🔌 User connected: ${socket.id}`);
  
  // Store connection info
  activeConnections.set(socket.id, {
    socketId: socket.id,
    connectedAt: new Date(),
    userId: null,
    roomId: null
  });

  // Handle room creation
  socket.on('createRoom', async (data) => {
    try {
      console.log(`🏠 [SUPABASE] Creating room for ${data.playerName}`);
      console.log(`🔍 [DEBUG] Socket ID: ${socket.id}`);
      
      // Get or create user profile
      console.log(`👤 [DEBUG] Creating/getting user profile...`);
      const user = await db.getOrCreateUser(
        `${socket.id}_${data.playerName}`, // Unique per connection to prevent conflicts
        data.playerName,
        data.playerName
      );
      console.log(`✅ [DEBUG] User created/found:`, { id: user.id, username: user.username });

      // Create room in database
      console.log(`🏗️ [DEBUG] Creating room in database...`);
      const room = await db.createRoom({
        host_id: user.id,
        current_game: null, // Will be updated when game is selected
        status: 'lobby',
        is_public: true,
        max_players: 10,
        game_settings: {},
        metadata: {
          created_by_name: data.playerName,
          created_from: 'web_client'
        }
      });
      console.log(`✅ [DEBUG] Room created:`, { 
        id: room.id, 
        room_code: room.room_code, 
        host_id: room.host_id
      });

      // Add creator as participant
      console.log(`👥 [DEBUG] Adding creator as participant...`);
      const participant = await db.addParticipant(room.id, user.id, socket.id, 'host');
      console.log(`✅ [DEBUG] Participant added:`, { 
        participant_id: participant.id, 
        role: participant.role
      });

      // Join socket room
      console.log(`🔗 [DEBUG] Joining socket room: ${room.room_code}`);
      socket.join(room.room_code);
      
      // Update connection tracking
      const connection = activeConnections.get(socket.id);
      if (connection) {
        connection.userId = user.id;
        connection.roomId = room.id;
      }

      // Register heartbeat
      heartbeatManager.registerHeartbeat(socket.id, user.id, room.id, room.room_code);

      // Send success response
      socket.emit('roomCreated', {
        roomCode: room.room_code,
        isHost: true,
        room: {
          ...room,
          players: [{
            id: user.id,
            name: data.playerName,
            isHost: true,
            isConnected: true,
            inGame: false,
            currentLocation: 'lobby',
            lastPing: new Date().toISOString(),
            socketId: socket.id
          }]
        }
      });

      console.log(`🎉 [SUCCESS] Room ${room.room_code} created by ${data.playerName} using SUPABASE storage`);

    } catch (error) {
      console.error('❌ [ERROR] Room creation failed:', error);
      console.error('🔍 [DEBUG] Error details:', {
        message: error.message,
        stack: error.stack
      });
      socket.emit('error', { 
        message: 'Failed to create room. Please try again.',
        code: 'ROOM_CREATION_FAILED',
        debug: {
          error_message: error.message
        }
      });
    }
  });

  // Handle socket room joining for listening only (used by return handler)
  socket.on('joinSocketRoom', (data) => {
    try {
      console.log(`🔗 [SOCKET ROOM] Joining socket room for listening: ${data.roomCode}`);
      socket.join(data.roomCode);
      console.log(`✅ [SOCKET ROOM] Successfully joined socket room ${data.roomCode} for listening`);
    } catch (error) {
      console.error('❌ [SOCKET ROOM] Error joining socket room:', error);
    }
  });

  // Handle room joining
  socket.on('joinRoom', async (data) => {
    try {
      const debugData = {
        socketId: socket.id,
        playerName: data.playerName,
        roomCode: data.roomCode,
        timestamp: new Date().toISOString(),
        connectionCount: activeConnections.size
      };
      
      console.log(`🚪 [REJOINING DEBUG] Join request received:`, debugData);
      
      // Check if this is a potential rejoin scenario
      const existingConnection = activeConnections.get(socket.id);
      const isReconnection = existingConnection?.userId !== null;
      
      console.log(`🔍 [REJOINING DEBUG] Connection analysis:`, {
        hasExistingConnection: !!existingConnection,
        isReconnection,
        existingUserId: existingConnection?.userId,
        existingRoomId: existingConnection?.roomId
      });

      // Get room from database
      console.log(`🔍 [REJOINING DEBUG] Looking up room in database...`);
      const room = await db.getRoomByCode(data.roomCode);
      if (!room) {
        console.log(`❌ [REJOINING DEBUG] Room ${data.roomCode} not found in database`);
        console.log(`🔍 [REJOINING DEBUG] Database search details:`, {
          searchCode: data.roomCode,
          codeLength: data.roomCode?.length,
          codeType: typeof data.roomCode
        });
        socket.emit('error', { 
          message: 'Room not found. The room may have been cleaned up or expired.',
          code: 'ROOM_NOT_FOUND',
          debug: {
            room_code: data.roomCode,
            search_timestamp: new Date().toISOString()
          }
        });
        return;
      }
      
      console.log(`✅ [REJOINING DEBUG] Room found:`, { 
        id: room.id, 
        room_code: room.room_code, 
        status: room.status,
        connected_players: room.participants?.filter(p => p.is_connected === true).length || 0,
        max_players: room.max_players,
        created_at: room.created_at,
        last_activity: room.last_activity,
        current_game: room.current_game,
        participants_count: room.participants?.length || 0
      });

      // Enhanced participant debugging
      console.log(`👥 [REJOINING DEBUG] Current participants:`, 
        room.participants?.map(p => ({
          user_id: p.user_id,
          username: p.user?.username,
          role: p.role,
          is_connected: p.is_connected,
          last_ping: p.last_ping,
          joined_at: p.joined_at
        })) || []
      );

      // Check if room is full - calculate from connected members
      const connectedPlayers = room.participants?.filter(p => p.is_connected === true).length || 0;
      if (connectedPlayers >= room.max_players) {
        console.log(`❌ [REJOINING DEBUG] Room is full:`, {
          connected: connectedPlayers,
          max: room.max_players
        });
        socket.emit('error', { 
          message: 'Room is full. Cannot join.',
          code: 'ROOM_FULL'
        });
        return;
      }
      
      // Check if room is still accepting players
      const isOriginalCreator = room.metadata?.created_by_name === data.playerName;
      console.log(`🔍 [REJOINING DEBUG] Creator check:`, {
        playerName: data.playerName,
        createdByName: room.metadata?.created_by_name,
        isOriginalCreator,
        roomStatus: room.status
      });
      
      // V2 Schema: Accept players when room status is 'lobby' or 'in_game', or if original creator is rejoining
      if (room.status !== 'lobby' && room.status !== 'in_game' && !isOriginalCreator) {
        console.log(`❌ [REJOINING DEBUG] Room not accepting players:`, {
          status: room.status,
          isOriginalCreator
        });
        socket.emit('error', { 
          message: `Room is ${room.status} and not accepting new players.`,
          code: 'ROOM_NOT_ACCEPTING',
          debug: {
            room_status: room.status,
            is_original_creator: isOriginalCreator
          }
        });
        return;
      }
      
      // Note: We no longer automatically reset in_game rooms to lobby when original creator rejoins
      // This allows players and GMs to join ongoing games
      
      // Check for existing participant (disconnected or connected) to handle rejoining
      const existingParticipant = room.participants?.find(p => 
        p.user?.username === data.playerName
      );
      
      console.log(`🔍 [REJOINING DEBUG] Checking for existing participant:`, {
        searchingFor: data.playerName,
        existingParticipant: existingParticipant ? {
          user_id: existingParticipant.user_id,
          username: existingParticipant.user?.username,
          is_connected: existingParticipant.is_connected,
          role: existingParticipant.role
        } : null
      });
      
      let user;
      let userRole;
      
      // Handle rejoining scenario
      if (existingParticipant) {
        console.log(`🔄 [REJOINING DEBUG] Rejoining as existing participant:`, {
          participant_id: existingParticipant.id,
          user_id: existingParticipant.user_id,
          original_role: existingParticipant.role,
          current_connection: existingParticipant.is_connected
        });
        
        // DON'T create a new user - use the original user data
        user = {
          id: existingParticipant.user_id,
          username: data.playerName,
          external_id: existingParticipant.user?.external_id
        };
        userRole = existingParticipant.role;
        
        // Clean up any existing connections for this user before creating new one
        const staleConnections = Array.from(activeConnections.entries())
          .filter(([socketId, conn]) => 
            conn.userId === existingParticipant.user_id && socketId !== socket.id
          );
        
        staleConnections.forEach(([staleSocketId, staleConn]) => {
          console.log(`🧹 [CLEANUP] Removing stale connection for user ${existingParticipant.user_id}: ${staleSocketId}`);
          activeConnections.delete(staleSocketId);
        });
        
        // Update connection tracking with the ORIGINAL user ID IMMEDIATELY
        const connection = activeConnections.get(socket.id);
        if (connection) {
          connection.userId = existingParticipant.user_id; // Use original user ID
          connection.roomId = room.id;
          console.log(`🔗 [REJOINING DEBUG] Updated connection tracking with original user ID:`, {
            socketId: socket.id,
            userId: existingParticipant.user_id, // Original user ID
            roomId: room.id,
            username: data.playerName,
            playerRole: existingParticipant.role
          });
        }
        
        // Update connection status for existing participant (set to connected with new socket)
        await db.updateParticipantConnection(existingParticipant.user_id, socket.id, 'connected');
        console.log(`✅ [REJOINING DEBUG] Updated existing participant connection status to connected`);
        
        // If rejoining the lobby (not in a game), ensure in_game is false
        if (room.status === 'lobby' || room.status === 'in_game') {
          await db.adminClient
            .from('room_members')
            .update({ 
              in_game: false,
              current_location: 'lobby'
            })
            .eq('user_id', existingParticipant.user_id)
            .eq('room_id', room.id);
          console.log(`🔄 [REJOINING DEBUG] Reset rejoining participant to lobby status (in_game: false)`);
        }
      } else {
        // Get or create user profile for new participants
        console.log(`👤 [REJOINING DEBUG] Getting/creating user profile for new participant...`);
        user = await db.getOrCreateUser(
          `${socket.id}_${data.playerName}`, // Unique per connection to prevent conflicts
          data.playerName,
          data.playerName
        );
        console.log(`✅ [REJOINING DEBUG] User profile:`, {
          id: user.id,
          username: user.username,
          external_id: user.external_id
        });
        
        // Check for duplicate connected participants (only for truly new participants)
        const duplicateConnectedParticipant = room.participants?.find(p => 
          p.user?.username === data.playerName && 
          p.is_connected === true &&
          p.user_id !== existingParticipant?.user_id // Don't flag the same user as duplicate
        );
        
        console.log(`🔍 [REJOINING DEBUG] Duplicate check for new participants:`, {
          searchingFor: data.playerName,
          duplicateConnectedParticipant: duplicateConnectedParticipant ? {
            user_id: duplicateConnectedParticipant.user_id,
            username: duplicateConnectedParticipant.user?.username,
            is_connected: duplicateConnectedParticipant.is_connected,
            role: duplicateConnectedParticipant.role
          } : null,
          excludedUserId: existingParticipant?.user_id
        });
        
        if (duplicateConnectedParticipant) {
          console.log(`❌ [REJOINING DEBUG] Duplicate name blocked: ${data.playerName} already in room ${data.roomCode}`);
          socket.emit('error', { 
            message: 'A player with this name is already in the room. Please choose a different name.',
            code: 'DUPLICATE_PLAYER',
            debug: {
              existing_user_id: duplicateConnectedParticipant.user_id,
              existing_connection_status: duplicateConnectedParticipant.is_connected
            }
          });
          return;
        }
        
        // Determine role: original room creator becomes host, others are players
        userRole = isOriginalCreator ? 'host' : 'player';
        console.log(`👥 [REJOINING DEBUG] Adding new participant with role: ${userRole}`);
        await db.addParticipant(room.id, user.id, socket.id, userRole);
        
        // If joining an in_game room, mark new player as NOT in_game and in 'lobby' location
        if (room.status === 'in_game') {
          await db.adminClient
            .from('room_members')
            .update({ 
              in_game: false,
              current_location: 'lobby'
            })
            .eq('user_id', user.id)
            .eq('room_id', room.id);
          console.log(`🎮 [REJOINING DEBUG] Marked new participant as NOT in_game and in 'lobby' location`);
        }
        
        console.log(`✅ [REJOINING DEBUG] Added new participant`);
        
        // Update connection tracking
        // Clean up any existing connections for this user before creating new one
        const staleConnections = Array.from(activeConnections.entries())
          .filter(([socketId, conn]) => 
            conn.userId === user.id && socketId !== socket.id
          );
        
        staleConnections.forEach(([staleSocketId, staleConn]) => {
          console.log(`🧹 [CLEANUP] Removing stale connection for user ${user.id}: ${staleSocketId}`);
          activeConnections.delete(staleSocketId);
        });
        
        const connection = activeConnections.get(socket.id);
        if (connection) {
          connection.userId = user.id;
          connection.roomId = room.id;
          console.log(`🔗 [REJOINING DEBUG] Updated connection tracking:`, {
            socketId: socket.id,
            userId: user.id,
            roomId: room.id,
            username: user.username,
            playerRole: userRole
          });
        }
      }

      // Join socket room
      console.log(`🔗 [REJOINING DEBUG] Joining socket room: ${data.roomCode}`);
      socket.join(data.roomCode);

      // Register heartbeat
      heartbeatManager.registerHeartbeat(socket.id, user.id, room.id, data.roomCode);

      // Get updated room data
      console.log(`🔄 [REJOINING DEBUG] Fetching updated room data...`);
      const updatedRoom = await db.getRoomByCode(data.roomCode);
      
      // Prepare player list - include ALL participants with their status
              const players = updatedRoom.participants?.map(p => ({
          id: p.user_id,
          name: p.user?.display_name || p.user?.username,
          isHost: p.role === 'host',
          isConnected: p.is_connected,
          inGame: p.in_game,
          currentLocation: p.current_location || (p.is_connected ? 'lobby' : 'disconnected'),
          lastPing: p.last_ping,
          socketId: null // Socket IDs are tracked in activeConnections, not stored in DB
      })) || [];

      console.log(`👥 [REJOINING DEBUG] Final player list:`, players);

      // Notify all players in room
      const isHost = userRole === 'host';
      const joinEventData = {
        player: {
          id: user.id,
          name: data.playerName,
          isHost: isHost,
          socketId: socket.id
        },
        players: players,
        room: updatedRoom
      };
      
      console.log(`📢 [REJOINING DEBUG] Broadcasting playerJoined event:`, {
        playerId: joinEventData.player.id,
        playerName: joinEventData.player.name,
        isHost: joinEventData.player.isHost,
        totalPlayers: players.length,
        roomCode: data.roomCode
      });
      
      io.to(data.roomCode).emit('playerJoined', joinEventData);

      // Send success response to joining player
      const joinSuccessData = {
        roomCode: data.roomCode,
        isHost: isHost,
        players: players,
        room: updatedRoom
      };
      
      console.log(`✅ [REJOINING DEBUG] Sending roomJoined success:`, {
        roomCode: joinSuccessData.roomCode,
        isHost: joinSuccessData.isHost,
        playerCount: joinSuccessData.players.length,
        roomStatus: updatedRoom.status,
        gameType: updatedRoom.current_game
      });
      
      socket.emit('roomJoined', joinSuccessData);

      console.log(`🎉 [REJOINING SUCCESS] ${data.playerName} ${existingParticipant ? 'rejoined' : 'joined'} room ${data.roomCode}`);

    } catch (error) {
      console.error('❌ [REJOINING ERROR] Room join/rejoin failed:', {
        error: error.message,
        stack: error.stack,
        socketId: socket.id,
        playerName: data?.playerName,
        roomCode: data?.roomCode,
        timestamp: new Date().toISOString()
      });
      socket.emit('error', { 
        message: 'Failed to join room. Please try again.',
        code: 'JOIN_FAILED',
        debug: {
          error_message: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }
  });

  // Handle game selection
  socket.on('selectGame', async (data) => {
    try {
      const connection = activeConnections.get(socket.id);
      console.log(`🎮 [DEBUG] Game selection from socket: ${socket.id}`);
      console.log(`🎮 [DEBUG] Connection data:`, { 
        userId: connection?.userId, 
        roomId: connection?.roomId 
      });
      
      if (!connection?.roomId) {
        socket.emit('error', { message: 'Not in a room' });
      return;
    }
    
      // Update room with selected game
      const updatedRoom = await db.updateRoom(connection.roomId, {
        current_game: data.gameType,
        game_settings: data.settings || {}
      });

      // Notify all players in room
      io.to(updatedRoom.room_code).emit('gameSelected', {
        gameType: data.gameType,
        settings: data.settings
      });

      console.log(`🎮 Game selected: ${data.gameType} for room ${updatedRoom.room_code}`);

    } catch (error) {
      console.error('❌ Error selecting game:', error);
      socket.emit('error', { message: 'Failed to select game' });
    }
  });

  // Handle game start
  socket.on('startGame', async (data) => {
    console.log(`🚀 [START GAME SERVER] ============ START GAME EVENT RECEIVED ============`);
    console.log(`🚀 [START GAME SERVER] Socket ID: ${socket.id}`);
    console.log(`🚀 [START GAME SERVER] Event data:`, data);
    console.log(`🚀 [START GAME SERVER] Timestamp:`, new Date().toISOString());
    
    try {
      const connection = activeConnections.get(socket.id);
              console.log(`🚀 [START GAME SERVER] Connection lookup:`, {
          socketId: socket.id,
          hasConnection: !!connection,
          userId: connection?.userId,
          roomId: connection?.roomId,
          totalActiveConnections: activeConnections.size
        });
        
        console.log(`🚀 [START GAME SERVER] All active connections:`, Array.from(activeConnections.entries()).map(([socketId, conn]) => ({
          socketId,
          userId: conn.userId,
          username: conn.username,
          roomId: conn.roomId,
          isCurrentSocket: socketId === socket.id
        })));
      
      if (!connection?.roomId) {
        console.error(`❌ [START GAME SERVER] Connection has no roomId - cannot start game`);
        socket.emit('error', { message: 'Not in a room' });
        return;
      }
    
      console.log(`🔍 [START GAME SERVER] Getting room data for code: ${data.roomCode}`);
      // Get room data
      const room = await db.getRoomByCode(data.roomCode);
      if (!room) {
        console.error(`❌ [START GAME SERVER] Room not found for code: ${data.roomCode}`);
        socket.emit('error', { message: 'Room not found' });
        return;
      }
      
      console.log(`✅ [START GAME SERVER] Room found:`, {
        id: room.id,
        room_code: room.room_code,
        status: room.status,
        current_game: room.current_game,
        participants_count: room.participants?.length || 0
      });
    
      console.log(`🚀 [DEBUG] Room participants:`, room.participants?.map(p => ({
        user_id: p.user_id,
        role: p.role,
        is_connected: p.is_connected,
        username: p.user?.username
      })));
      
      // Verify user is host
      const userParticipant = room.participants?.find(p => 
        p.user_id === connection.userId && p.role === 'host'
      );
      
      console.log(`🚀 [START GAME DEBUG] Looking for host with userId: ${connection.userId}`);
      console.log(`🚀 [START GAME DEBUG] Found participant:`, userParticipant ? {
        user_id: userParticipant.user_id,
        role: userParticipant.role,
        username: userParticipant.user?.username,
        is_connected: userParticipant.is_connected
      } : 'NOT FOUND');
      
      console.log(`🚀 [START GAME DEBUG] All participants:`, room.participants?.map(p => ({
        user_id: p.user_id,
        role: p.role,
        username: p.user?.username,
        is_connected: p.is_connected,
        isCurrentUser: p.user_id === connection.userId
      })));
      
      if (!userParticipant) {
        console.error(`❌ [START GAME SERVER] User is not host or not found in room`);
        socket.emit('error', { message: 'Only the host can start the game' });
        return;
      }
      
      console.log(`✅ [START GAME SERVER] Host validation passed - proceeding with game start`);
    
      // Update room status and mark all connected participants as in_game
      await db.updateRoom(room.id, {
        status: 'in_game',
        game_started_at: new Date().toISOString()
      });

      // Mark all connected participants as in_game and in 'game' location
      const connectedParticipants = room.participants?.filter(p => p.is_connected === true) || [];
      for (const participant of connectedParticipants) {
        await db.adminClient
          .from('room_members')
          .update({ 
            in_game: true,
            current_location: 'game'
          })
          .eq('user_id', participant.user_id)
          .eq('room_id', room.id);
      }
      
      console.log(`🎮 [START GAME DEBUG] Marked ${connectedParticipants.length} participants as in_game and in 'game' location`);

      // Get game proxy configuration
      const gameProxy = gameProxies[room.current_game];
      if (!gameProxy) {
        socket.emit('error', { message: 'Game not supported' });
      return;
    }
    
      // Send game URLs to participants with delay for non-hosts
      const participants = room.participants?.filter(p => 
        p.is_connected === true
      ) || [];

      participants.forEach(p => {
        const encodedName = encodeURIComponent(p.user?.display_name || p.user?.username);
        const baseUrl = `${gameProxy.path}?room=${room.room_code}&players=${participants.length}&name=${encodedName}&playerId=${p.user_id}`;
        const gameUrl = p.role === 'host' ? `${baseUrl}&role=gm` : baseUrl;
        
        const delay = p.role === 'host' ? 0 : 2000; // 2 second delay for players
        
        // Find the MOST RECENT socket ID for this user from activeConnections
        const userConnections = Array.from(activeConnections.entries())
          .filter(([socketId, conn]) => conn.userId === p.user_id);
        
        // Sort by connection timestamp (most recent first) or use the last one in the array
        const userConnection = userConnections.length > 0 ? userConnections[userConnections.length - 1] : null;
        
        const currentSocketId = userConnection ? userConnection[0] : null;
        const connectionData = userConnection ? userConnection[1] : null;
        
        console.log(`🚀 [START GAME DEBUG] Sending game event to ${p.user?.username}:`, {
          user_id: p.user_id,
          role: p.role,
          username: p.user?.username,
          is_connected: p.is_connected,
          hasUserConnection: !!userConnection,
          totalUserConnections: userConnections.length,
          allUserSocketIds: userConnections.map(([socketId]) => socketId), 
          selectedSocketId: currentSocketId,
          gameUrl,
          delay
        });
        
        if (currentSocketId) {
          setTimeout(() => {
            console.log(`📤 [START GAME DEBUG] Emitting gameStarted to ${p.user?.username} (${currentSocketId})`);
            io.to(currentSocketId).emit('gameStarted', {
              gameUrl,
              gameType: room.current_game,
              isHost: p.role === 'host',
              roomCode: room.room_code
            });
          }, delay);
        } else {
          console.error(`❌ [START GAME DEBUG] No socket connection found for ${p.user?.username} (${p.user_id})`);
          console.error(`❌ [START GAME DEBUG] ActiveConnections dump:`, Array.from(activeConnections.entries()).map(([socketId, conn]) => ({
            socketId,
            userId: conn.userId,
            username: conn.username,
            roomId: conn.roomId
          })));
        }
      });

      console.log(`🚀 [START GAME SERVER] Game start complete: ${room.current_game} for room ${room.room_code}`);
      console.log(`🚀 [START GAME SERVER] Total participants processed: ${participants.length}`);
      console.log(`🚀 [START GAME SERVER] ============ END START GAME PROCESSING ============`);

    } catch (error) {
      console.error('❌ [START GAME SERVER] CRITICAL ERROR starting game:', error);
      console.error('❌ [START GAME SERVER] Error stack:', error.stack);
      console.log(`❌ [START GAME SERVER] ============ START GAME FAILED ============`);
      socket.emit('error', { message: 'Failed to start game' });
    }
  });

  // Handle leaving room
  socket.on('leaveRoom', async (data) => {
    try {
      const connection = activeConnections.get(socket.id);
      if (!connection?.roomId || !connection?.userId) {
        return;
      }

      // Check if leaving player is the host
      const room = await db.getRoomByCode(data.roomCode);
      const leavingParticipant = room?.participants?.find(p => p.user_id === connection.userId);
      const isLeavingHost = leavingParticipant?.role === 'host';

      // Remove participant from database
      await db.removeParticipant(connection.roomId, connection.userId);

      // Leave socket room
      socket.leave(data.roomCode);

      // Handle INSTANT host transfer if the host is leaving
      let newHost = null;
      if (isLeavingHost && room) {
        console.log(`👑 [LEAVE] Host ${connection.userId} leaving - transferring host instantly`);
        newHost = await db.autoTransferHost(connection.roomId, connection.userId);
      }

      // Get updated room data
      const updatedRoom = await db.getRoomByCode(data.roomCode);
      if (updatedRoom) {
        // Include ALL participants with their complete status (not just connected ones)
        const allPlayers = updatedRoom.participants?.map(p => ({
          id: p.user_id,
          name: p.user?.display_name || p.user?.username,
          isHost: p.role === 'host',
          isConnected: p.is_connected,
          inGame: p.in_game,
          currentLocation: p.current_location || (p.is_connected ? 'lobby' : 'disconnected'),
          lastPing: p.last_ping,
          socketId: null // Socket IDs are tracked in activeConnections, not stored in DB
        })) || [];

        // Send appropriate events based on whether host was transferred
        if (newHost) {
          // Send host transfer event first
          io.to(data.roomCode).emit('hostTransferred', {
            oldHostId: connection.userId,
            newHostId: newHost.user_id,
            newHostName: newHost.user?.display_name || newHost.user?.username,
            reason: 'original_host_left',
            players: allPlayers,
            room: updatedRoom
          });
          console.log(`👑 [LEAVE] Instantly transferred host to ${newHost.user?.display_name || newHost.user?.username}`);
        }

        // Then send player left event
        io.to(data.roomCode).emit('playerLeft', {
          playerId: connection.userId,
          players: allPlayers,
          room: updatedRoom,
          wasHost: isLeavingHost
        });

        // If no connected players left, mark room as returning (closest equivalent to abandoned)
        const connectedPlayers = allPlayers.filter(p => p.isConnected);
        if (connectedPlayers.length === 0) {
          await db.updateRoom(connection.roomId, {
            status: 'returning'
          });
        }
      }

      // Clear connection tracking
      connection.roomId = null;
      connection.userId = null;

      console.log(`👋 Player left room ${data.roomCode}${isLeavingHost ? ' (was host)' : ''}`);

    } catch (error) {
      console.error('❌ Error leaving room:', error);
    }
  });

  // Handle GM-initiated return to lobby
  socket.on('returnToLobby', async (data) => {
    try {
      console.log(`🔄 GM initiating return to lobby for room ${data.roomCode}`);
      
      const connection = activeConnections.get(socket.id);
      if (!connection?.roomId || !connection?.userId) {
        socket.emit('error', { message: 'Not in a room' });
        return;
      }

      // Get room and verify user is host
      const room = await db.getRoomByCode(data.roomCode);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      // Check if user is host
      const participant = room.participants?.find(p => p.user_id === connection.userId);
      if (!participant || participant.role !== 'host') {
        socket.emit('error', { message: 'Only the host can return everyone to lobby' });
        return;
      }

      // IMPORTANT: Disconnect all players from the room BEFORE updating room status
      // This prevents duplicate name errors when players try to rejoin
      console.log(`🔄 Disconnecting all players from room ${data.roomCode} before return`);
      const participants = room.participants?.filter(p => 
        p.is_connected === true
      ) || [];

      // Mark all participants as disconnected and not in_game FIRST
      for (const p of participants) {
        await db.updateParticipantConnection(p.user_id, null, 'disconnected');
        // Also mark as not in_game
        await db.adminClient
          .from('room_members')
          .update({ in_game: false })
          .eq('user_id', p.user_id)
          .eq('room_id', room.id);
        console.log(`🔌 Disconnected player ${p.user?.username} from room ${data.roomCode} and marked as not in_game`);
      }

      // Update room status back to lobby
      await db.updateRoom(room.id, {
        status: 'lobby',
        current_game: null
      });

      // Send return to lobby event to all participants
      participants.forEach(p => {
        const userConnection = Array.from(activeConnections.values())
          .find(conn => conn.userId === p.user_id);
        
        if (userConnection?.socketId) {
          console.log(`📤 Sending returnToLobbyInitiated to ${p.user?.username}`);
          io.to(userConnection.socketId).emit('returnToLobbyInitiated', {
            roomCode: room.room_code,
            playerName: p.user?.display_name || p.user?.username,
            isHost: p.role === 'host',
            returnUrl: process.env.NODE_ENV === 'production' 
              ? 'https://gamebuddies.io' 
              : 'http://localhost:3000'
          });
        }
      });

      console.log(`🔄 Return to lobby initiated for ${participants.length} players in room ${room.room_code}`);

    } catch (error) {
      console.error('❌ Error returning to lobby:', error);
      socket.emit('error', { message: 'Failed to return to lobby' });
    }
  });

  // Handle individual player return to lobby
  socket.on('playerReturnToLobby', async (data) => {
    try {
      console.log(`🔄 Player returning to lobby: ${data.playerName} in room ${data.roomCode}`);
      
      const connection = activeConnections.get(socket.id);
      if (!connection?.roomId || !connection?.userId) {
        socket.emit('error', { message: 'Not in a room' });
        return;
      }

      // Get room
      const room = await db.getRoomByCode(data.roomCode);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      // Mark this player as not in_game, connected to lobby, and in 'lobby' location
      await db.adminClient
        .from('room_members')
        .update({ 
          in_game: false,
          is_connected: true,
          current_location: 'lobby',
          last_ping: new Date().toISOString()
        })
        .eq('user_id', connection.userId)
        .eq('room_id', room.id);

      // Get updated room data with all participants
      const updatedRoom = await db.getRoomByCode(data.roomCode);
      
      // Notify all players about the status update
      io.to(data.roomCode).emit('playerStatusUpdated', {
        playerId: connection.userId,
        playerName: data.playerName,
        status: 'lobby',
        room: updatedRoom
      });

      console.log(`✅ Player ${data.playerName} marked as returned to lobby`);

    } catch (error) {
      console.error('❌ Error handling player return to lobby:', error);
      socket.emit('error', { message: 'Failed to update status' });
    }
  });

  // Handle manual host transfer
  socket.on('transferHost', async (data) => {
    try {
      console.log(`👑 Host transfer requested: ${data.targetUserId} in room ${data.roomCode}`);
      
      const connection = activeConnections.get(socket.id);
      if (!connection?.roomId || !connection?.userId) {
        socket.emit('error', { message: 'Not in a room' });
        return;
      }

      // Get room and verify current user is host
      const room = await db.getRoomByCode(data.roomCode);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      // Check if current user is host
      const currentParticipant = room.participants?.find(p => p.user_id === connection.userId);
      if (!currentParticipant || currentParticipant.role !== 'host') {
        socket.emit('error', { message: 'Only the host can transfer host privileges' });
        return;
      }

      // Verify target user is in the room
      const targetParticipant = room.participants?.find(p => p.user_id === data.targetUserId);
      if (!targetParticipant) {
        socket.emit('error', { message: 'Target player not found in room' });
        return;
      }

      // Perform the host transfer
      await db.transferHost(room.id, connection.userId, data.targetUserId);

      // Get updated room data
      const updatedRoom = await db.getRoomByCode(data.roomCode);
      
      // Include ALL participants with their complete status (not just connected ones)
      const allPlayers = updatedRoom.participants?.map(p => ({
        id: p.user_id,
        name: p.user?.display_name || p.user?.username,
        isHost: p.role === 'host',
        isConnected: p.is_connected,
        inGame: p.in_game,
        currentLocation: p.current_location || (p.is_connected ? 'lobby' : 'disconnected'),
        lastPing: p.last_ping,
        socketId: null
      })) || [];

      // Notify all players about the host change
      io.to(data.roomCode).emit('hostTransferred', {
        oldHostId: connection.userId,
        newHostId: data.targetUserId,
        newHostName: targetParticipant.user?.display_name || targetParticipant.user?.username,
        players: allPlayers,
        room: updatedRoom
      });

      console.log(`👑 Host transferred from ${currentParticipant.user?.display_name} to ${targetParticipant.user?.display_name}`);

    } catch (error) {
      console.error('❌ Error transferring host:', error);
      socket.emit('error', { message: 'Failed to transfer host' });
    }
  });

  // Handle player kick
  socket.on('kickPlayer', async (data) => {
    try {
      console.log(`👢 [KICK DEBUG] Kick player requested:`, {
        targetUserId: data.targetUserId,
        roomCode: data.roomCode,
        kickedBy: socket.id,
        timestamp: new Date().toISOString()
      });
      
      const connection = activeConnections.get(socket.id);
      if (!connection?.roomId || !connection?.userId) {
        console.log(`❌ [KICK DEBUG] Kicker not in a room:`, {
          socketId: socket.id,
          hasConnection: !!connection,
          roomId: connection?.roomId,
          userId: connection?.userId
        });
        socket.emit('error', { message: 'Not in a room' });
        return;
      }

      // Get room and verify current user is host
      const room = await db.getRoomByCode(data.roomCode);
      if (!room) {
        console.log(`❌ [KICK DEBUG] Room not found: ${data.roomCode}`);
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      console.log(`🔍 [KICK DEBUG] Room participants:`, room.participants?.map(p => ({
        user_id: p.user_id,
        username: p.user?.username,
        role: p.role,
        is_connected: p.is_connected
      })));

      // Check if current user is host
      const currentParticipant = room.participants?.find(p => p.user_id === connection.userId);
      if (!currentParticipant || currentParticipant.role !== 'host') {
        console.log(`❌ [KICK DEBUG] User is not host:`, {
          userId: connection.userId,
          participant: currentParticipant ? {
            role: currentParticipant.role,
            username: currentParticipant.user?.username
          } : 'NOT_FOUND'
        });
        socket.emit('kickFailed', { 
          reason: 'Only the host can kick players',
          error: 'NOT_HOST',
          targetUserId: data.targetUserId
        });
        return;
      }

      // Verify target user is in the room and is not the host
      const targetParticipant = room.participants?.find(p => p.user_id === data.targetUserId);
      if (!targetParticipant) {
        console.log(`❌ [KICK DEBUG] Target player not found:`, {
          targetUserId: data.targetUserId,
          availableParticipants: room.participants?.map(p => p.user_id)
        });
        socket.emit('kickFailed', { 
          reason: 'Target player not found in room',
          error: 'PLAYER_NOT_FOUND',
          targetUserId: data.targetUserId
        });
        return;
      }

      if (targetParticipant.role === 'host') {
        console.log(`❌ [KICK DEBUG] Cannot kick host:`, {
          targetUserId: data.targetUserId,
          targetRole: targetParticipant.role
        });
        socket.emit('kickFailed', { 
          reason: 'Cannot kick the host',
          error: 'CANNOT_KICK_HOST',
          targetUserId: data.targetUserId
        });
        return;
      }

      // Find the target player's socket connection
      const targetConnection = Array.from(activeConnections.values())
        .find(conn => conn.userId === data.targetUserId);

      console.log(`👢 [KICK DEBUG] Kicking player:`, {
        targetUserId: data.targetUserId,
        targetUsername: targetParticipant.user?.username,
        targetSocketId: targetConnection?.socketId,
        kickedBy: currentParticipant.user?.username
      });

      // Remove participant from database
      await db.removeParticipant(room.id, data.targetUserId);

      // Notify the kicked player
      if (targetConnection?.socketId) {
        console.log(`📤 [KICK DEBUG] Notifying kicked player on socket: ${targetConnection.socketId}`);
        io.to(targetConnection.socketId).emit('playerKicked', {
          reason: 'You have been removed from the room by the host',
          kickedBy: currentParticipant.user?.display_name || currentParticipant.user?.username,
          roomCode: data.roomCode
        });

        // Remove from socket room
        const kickedSocket = io.sockets.sockets.get(targetConnection.socketId);
        if (kickedSocket) {
          kickedSocket.leave(data.roomCode);
        }
      }

      // Get updated room data with complete player information
      const updatedRoom = await db.getRoomByCode(data.roomCode);
      
      // Include ALL participants with their complete status (not just connected ones)
      const allPlayers = updatedRoom.participants?.map(p => ({
        id: p.user_id,
        name: p.user?.display_name || p.user?.username,
        isHost: p.role === 'host',
        isConnected: p.is_connected,
        inGame: p.in_game,
        currentLocation: p.current_location || (p.is_connected ? 'lobby' : 'disconnected'),
        lastPing: p.last_ping,
        socketId: null
      })) || [];

      console.log(`👥 [KICK DEBUG] All players after kick:`, allPlayers.map(p => ({
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        isConnected: p.isConnected,
        currentLocation: p.currentLocation
      })));

      // Notify remaining players about the kick with complete player data
      io.to(data.roomCode).emit('playerKicked', {
        targetUserId: data.targetUserId,
        targetName: targetParticipant.user?.display_name || targetParticipant.user?.username,
        kickedBy: currentParticipant.user?.display_name || currentParticipant.user?.username,
        players: allPlayers, // Send complete player data
        room: updatedRoom, // Also send updated room data
        isNotification: true // Flag to distinguish from personal kick notification
      });

      // Clear connection tracking for kicked player
      if (targetConnection) {
        // Remove from heartbeat tracking
        heartbeatManager.removeHeartbeat(targetConnection.socketId);
        
        targetConnection.roomId = null;
        targetConnection.userId = null;
      }

      console.log(`✅ [KICK DEBUG] Successfully kicked ${targetParticipant.user?.username} from room ${data.roomCode}`);

    } catch (error) {
      console.error('❌ [KICK ERROR] Error kicking player:', {
        error: error.message,
        stack: error.stack,
        socketId: socket.id,
        targetUserId: data?.targetUserId,
        roomCode: data?.roomCode,
        timestamp: new Date().toISOString()
      });
      socket.emit('kickFailed', { 
        reason: 'Failed to kick player due to server error',
        error: 'SERVER_ERROR',
        targetUserId: data?.targetUserId
      });
    }
  });

  // Handle room status change
  socket.on('changeRoomStatus', async (data) => {
    try {
      console.log(`🔄 Room status change requested: ${data.newStatus} for room ${data.roomCode}`);
      
      const connection = activeConnections.get(socket.id);
      if (!connection?.roomId || !connection?.userId) {
        socket.emit('error', { message: 'Not in a room' });
        return;
      }

      // Get room and verify user is host
      const room = await db.getRoomByCode(data.roomCode);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      // Check if user is host
      const participant = room.participants?.find(p => p.user_id === connection.userId);
      if (!participant || participant.role !== 'host') {
        socket.emit('error', { message: 'Only the host can change room status' });
        return;
      }

      // Validate the new status - V2 Schema
      const validStatuses = ['lobby', 'in_game', 'returning'];
      if (!validStatuses.includes(data.newStatus)) {
        socket.emit('error', { message: 'Invalid room status' });
        return;
      }

      // Update room status in database
      const updateData = { status: data.newStatus };
      
      // If changing back to lobby, also reset current game
      if (data.newStatus === 'lobby') {
        updateData.current_game = null;
      }

      await db.updateRoom(room.id, updateData);

      // Get updated room data
      const updatedRoom = await db.getRoomByCode(data.roomCode);
      
      // Notify all players about the status change
      io.to(data.roomCode).emit('roomStatusChanged', {
        oldStatus: room.status,
        newStatus: data.newStatus,
        room: updatedRoom,
        changedBy: participant.user?.display_name || participant.user?.username
      });

      console.log(`🔄 Room ${room.room_code} status changed from '${room.status}' to '${data.newStatus}' by ${participant.user?.display_name}`);

    } catch (error) {
      console.error('❌ Error changing room status:', error);
      socket.emit('error', { message: 'Failed to change room status' });
    }
  });

  // Handle heartbeat ping
  socket.on('heartbeat', () => {
    heartbeatManager.updateHeartbeat(socket.id);
  });

  // Handle disconnection
  socket.on('disconnect', async () => {
    try {
      console.log(`🔌 User disconnected: ${socket.id}`);
      
      // Remove from heartbeat tracking
      const heartbeatData = heartbeatManager.removeHeartbeat(socket.id);
      
      const connection = activeConnections.get(socket.id);
      if (connection?.userId) {
        // Check if disconnecting user is the host
        let isDisconnectingHost = false;
        let room = null;
        let disconnectingParticipant = null;
        
        if (connection.roomId) {
          room = await db.getRoomById(connection.roomId);
          disconnectingParticipant = room?.participants?.find(p => p.user_id === connection.userId);
          isDisconnectingHost = disconnectingParticipant?.role === 'host';
        }

        // Determine appropriate status based on room and player status
        let connectionStatus = 'disconnected';
        
        if (room && disconnectingParticipant) {
          // If room is in_game and player is marked as in_game, they're likely in the external game
          if (room.status === 'in_game' && disconnectingParticipant.in_game === true) {
            connectionStatus = 'game';
            console.log(`🎮 Player ${disconnectingParticipant.user?.username} disconnected but room is in_game - marking as 'game' status`);
          } else {
            connectionStatus = 'disconnected';
            console.log(`🔌 Player ${disconnectingParticipant.user?.username} disconnected - marking as 'disconnected' status`);
          }
        }

        // Update participant connection status (this will also set the appropriate location)
        await db.updateParticipantConnection(
          connection.userId, 
          socket.id, 
          connectionStatus
        );

        // Handle INSTANT host transfer if host disconnected (no grace period)
        let newHost = null;
        if (isDisconnectingHost && room) {
          // Only auto-transfer host if there are other connected players
          const otherConnectedPlayers = room.participants?.filter(p => 
            p.user_id !== connection.userId && p.is_connected === true
          ) || [];
          
          if (otherConnectedPlayers.length > 0) {
            console.log(`👑 [DISCONNECT] Host ${connection.userId} disconnected - transferring host instantly`);
            console.log(`👑 [DISCONNECT] Other connected players available:`, 
              otherConnectedPlayers.map(p => ({
                user_id: p.user_id,
                username: p.user?.username,
                is_connected: p.is_connected,
                joined_at: p.joined_at
              }))
            );
            
            // Transfer host immediately (no grace period)
            newHost = await db.autoTransferHost(connection.roomId, connection.userId);
            
            if (newHost) {
              console.log(`👑 [DISCONNECT] Host transfer completed:`, {
                oldHostId: connection.userId,
                newHostId: newHost.user_id,
                newHostName: newHost.user?.display_name || newHost.user?.username
              });
              
              // Refresh the new host's heartbeat and mark grace period
              const heartbeatRefreshed = await heartbeatManager.refreshHeartbeatForUser(newHost.user_id);
              heartbeatManager.markRecentHostTransfer(newHost.user_id);
              
              console.log(`👑 [DISCONNECT] Post-transfer protection applied:`, {
                newHostId: newHost.user_id,
                heartbeatRefreshed,
                gracePeriodActive: true
              });
            } else {
              console.log(`❌ [DISCONNECT] Host transfer failed - no suitable replacement found`);
            }
          } else {
            console.log(`⚠️ Host disconnected but no other connected players - keeping host role`);
          }
        }

        // If in a room, notify other players about disconnection with updated player list
        if (connection.roomId && room) {
          // Get updated room data to send complete player list
          const updatedRoom = await db.getRoomById(connection.roomId);
          const allPlayers = updatedRoom?.participants?.map(p => ({
            id: p.user_id,
            name: p.user?.display_name || p.user?.username,
            isHost: p.role === 'host',
            isConnected: p.is_connected,
            inGame: p.in_game,
            currentLocation: p.current_location || (p.is_connected ? 'lobby' : 'disconnected'),
            lastPing: p.last_ping,
            socketId: null
          })) || [];

          // Send host transfer event first if host was transferred
          if (newHost) {
            io.to(room.room_code).emit('hostTransferred', {
              oldHostId: connection.userId,
              newHostId: newHost.user_id,
              newHostName: newHost.user?.display_name || newHost.user?.username,
              reason: 'original_host_disconnected',
              players: allPlayers,
              room: updatedRoom
            });
          }

          // Then send player disconnected event
          socket.to(room.room_code).emit('playerDisconnected', {
            playerId: connection.userId,
            wasHost: isDisconnectingHost,
            players: allPlayers,
            room: updatedRoom
          });
        }
      }

      // Remove from active connections
      activeConnections.delete(socket.id);

    } catch (error) {
      console.error('❌ Error handling disconnect:', error);
    }
  });
});

// ===== API ENDPOINTS =====

// Supabase config endpoint for frontend
app.get('/api/supabase-config', (req, res) => {
  try {
    const config = {
      url: process.env.SUPABASE_URL,
      anonKey: process.env.SUPABASE_ANON_KEY
    };
    
    console.log('📡 [API] Providing Supabase config to frontend:', {
      url: config.url ? `${config.url.substring(0, 20)}...` : 'MISSING',
      anonKey: config.anonKey ? `${config.anonKey.substring(0, 20)}...` : 'MISSING'
    });
    
    res.json(config);
  } catch (error) {
    console.error('❌ Error providing Supabase config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get Supabase configuration'
    });
  }
});

// Room cleanup API endpoint
app.post('/api/admin/cleanup-rooms', async (req, res) => {
  try {
    const {
      maxAgeHours = 24,
      maxIdleMinutes = 30,
      includeAbandoned = true,
      includeCompleted = true,
      dryRun = false
    } = req.body;

    const result = await db.cleanupInactiveRooms({
      maxAgeHours,
      maxIdleMinutes,
      includeAbandoned,
      includeCompleted,
      dryRun
    });

    res.json({
      success: true,
      ...result,
      message: dryRun 
        ? `Would clean ${result.wouldClean} rooms` 
        : `Cleaned ${result.cleaned} rooms`
    });
  } catch (error) {
    console.error('❌ Room cleanup API error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Room stats API endpoint
app.get('/api/admin/room-stats', async (req, res) => {
  try {
    const stats = await db.getRoomStats();
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('❌ Room stats API error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Heartbeat stats endpoint
app.get('/api/admin/heartbeat-stats', (req, res) => {
  try {
    const stats = heartbeatManager.getStats();
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('❌ Heartbeat stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Manual cleanup trigger
app.post('/api/admin/cleanup-now', async (req, res) => {
  try {
    console.log('🧹 Manual cleanup triggered');
    
    // Run all cleanup tasks
    await db.cleanupStaleConnections();
    await db.refreshActiveRoomsView();
    
    const roomCleanup = await db.cleanupInactiveRooms({
      maxAgeHours: 2,      // More aggressive for manual cleanup
      maxIdleMinutes: 15,  // More aggressive for manual cleanup
      includeAbandoned: true,
      includeCompleted: true,
      dryRun: false
    });

    res.json({
      success: true,
      roomsCleanedUp: roomCleanup.cleaned,
      cleanedRooms: roomCleanup.rooms,
      message: `Manual cleanup completed: ${roomCleanup.cleaned} rooms cleaned`
    });
  } catch (error) {
    console.error('❌ Manual cleanup error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ===== CLEANUP AND MAINTENANCE =====

// Periodic cleanup of stale connections and inactive rooms
setInterval(async () => {
  try {
    console.log('🧹 Running periodic cleanup...');
    
    // Clean up stale connections
    await db.cleanupStaleConnections();
    await db.refreshActiveRoomsView();
    
    // Clean up inactive rooms (less aggressive than manual)
    const roomCleanup = await db.cleanupInactiveRooms({
      maxAgeHours: 24,     // Rooms older than 24 hours
      maxIdleMinutes: 60,  // Rooms idle for 1 hour
      includeAbandoned: true,
      includeCompleted: true,
      dryRun: false
    });
    
    if (roomCleanup.cleaned > 0) {
      console.log(`🧹 Periodic cleanup: ${roomCleanup.cleaned} rooms cleaned`);
    }
    
  } catch (error) {
    console.error('❌ Periodic cleanup error:', error);
  }
}, 15 * 60 * 1000); // Every 15 minutes

// More aggressive cleanup during off-peak hours (runs once per hour)
setInterval(async () => {
  try {
    const hour = new Date().getHours();
    
    // Run more aggressive cleanup during off-peak hours (2 AM - 6 AM)
    if (hour >= 2 && hour <= 6) {
      console.log('🌙 Running off-peak aggressive cleanup...');
      
      const roomCleanup = await db.cleanupInactiveRooms({
        maxAgeHours: 12,     // More aggressive: 12 hours
        maxIdleMinutes: 30,  // More aggressive: 30 minutes
        includeAbandoned: true,
        includeCompleted: true,
        dryRun: false
      });
      
      if (roomCleanup.cleaned > 0) {
        console.log(`🌙 Off-peak cleanup: ${roomCleanup.cleaned} rooms cleaned`);
      }
    }
  } catch (error) {
    console.error('❌ Off-peak cleanup error:', error);
  }
}, 60 * 60 * 1000); // Every hour

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  
  // Close all socket connections
  io.close();
  
  // Close server
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// Catch-all handler: send back React's index.html file for non-API routes
app.get('*', (req, res) => {
  // Don't serve index.html for API routes or socket.io
  if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  
  res.sendFile(path.join(__dirname, '../client/build/index.html'));
});

// Start server
const PORT = process.env.PORT || 3033;
server.listen(PORT, () => {
  console.log(`🚀 GameBuddies Server v2.1.0 running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🗄️ Storage: SUPABASE (Persistent)`);
  console.log(`🎮 Game proxies configured: ${Object.keys(gameProxies).join(', ')}`);
  console.log(`✅ Supabase configured - using persistent database storage`);
});

module.exports = { app, server, io }; 