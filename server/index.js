const express = require('express');
const path = require('path');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const { createProxyMiddleware } = require('http-proxy-middleware');
const http = require('http');
const socketIo = require('socket.io');
const { db } = require('./lib/supabase');
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
        endpoint: req.path,
        method: req.method,
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
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
    
    console.log(`🔍 [API] Validating room ${roomCode} for ${playerName} (service: ${req.apiKey.service_name})`);
    
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
      console.log(`❌ [API] Room ${roomCode} not found`);
      return res.status(404).json({ 
        valid: false, 
        error: 'Room not found',
        code: 'ROOM_NOT_FOUND'
      });
    }
    
    // Check room status
    if (!['waiting_for_players', 'active', 'launching'].includes(room.status)) {
      console.log(`❌ [API] Room ${roomCode} has invalid status: ${room.status}`);
      return res.status(400).json({ 
        valid: false, 
        error: `Room is ${room.status}`,
        code: 'ROOM_NOT_AVAILABLE',
        status: room.status
      });
    }
    
    // Check if game type matches or room is in lobby state
    if (room.game_type !== 'lobby' && room.game_type !== req.apiKey.service_name) {
      console.log(`❌ [API] Room ${roomCode} is for game ${room.game_type}, not ${req.apiKey.service_name}`);
      return res.status(400).json({ 
        valid: false, 
        error: 'Room is for a different game',
        code: 'WRONG_GAME_TYPE',
        gameType: room.game_type
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
      .from('game_rooms')
      .select('*')
      .eq('room_code', roomCode)
      .single();
    
    if (roomError || !room) {
      console.log(`❌ [API] Room ${roomCode} not found for join`);
      return res.status(404).json({ error: 'Room not found' });
    }
    
    // Check if room is full
    if (room.current_players >= room.max_players) {
      console.log(`❌ [API] Room ${roomCode} is full (${room.current_players}/${room.max_players})`);
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
      .from('room_participants')
      .select('*')
      .eq('room_id', room.id)
      .eq('user_id', user.id)
      .single();
    
    if (existingParticipant) {
      console.log(`🔄 [API] Player ${playerName} rejoining room ${roomCode}`);
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
    
    // Update room to game type if it's still lobby
    if (room.game_type === 'lobby') {
      await db.adminClient
        .from('game_rooms')
        .update({ 
          game_type: req.apiKey.service_name,
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
    
    // Save new state using existing method
    const savedState = await db.saveGameState(room.id, req.apiKey.service_name, gameState, playerId);
    
    // Update room activity
    await db.adminClient
      .from('game_rooms')
      .update({ 
        last_activity: new Date().toISOString(),
        status: 'active' // Mark room as active when game state is synced
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
    console.error('❌ [API] Get state error:', error);
    res.status(500).json({ error: 'Failed to get state' });
  }
});

// Player status update
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
    await db.logEvent(room.id, playerId, 'player_status_update', { status, gameData });
    
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
    console.error('❌ [API] Status update error:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Game events endpoint
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
      status: req.query.status || 'waiting_for_players',
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
    await db.adminClient.from('game_rooms').select('id').limit(1);
    
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
        creator_id: user.id,
        game_type: 'lobby', // Will be updated when game is selected
        status: 'waiting_for_players',
        visibility: 'public',
        max_players: 10,
        settings: {},
        metadata: {
          created_by_name: data.playerName
        },
        created_from: 'web_client'
      });
      console.log(`✅ [DEBUG] Room created:`, { 
        id: room.id, 
        room_code: room.room_code, 
        creator_id: room.creator_id
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
        current_players: room.current_players,
        max_players: room.max_players,
        created_at: room.created_at,
        last_activity: room.last_activity,
        game_type: room.game_type,
        participants_count: room.participants?.length || 0
      });

      // Enhanced participant debugging
      console.log(`👥 [REJOINING DEBUG] Current participants:`, 
        room.participants?.map(p => ({
          user_id: p.user_id,
          username: p.user?.username,
          role: p.role,
          connection_status: p.connection_status,
          last_ping: p.last_ping,
          joined_at: p.joined_at
        })) || []
      );

      // Check if room is full
      if (room.current_players >= room.max_players) {
        console.log(`❌ [REJOINING DEBUG] Room is full:`, {
          current: room.current_players,
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
      
      if (room.status !== 'waiting_for_players' && !isOriginalCreator) {
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
      
      // If original creator is rejoining an active room, reset it to lobby
      if (room.status === 'active' && isOriginalCreator) {
        console.log(`🔄 [REJOINING DEBUG] Original creator rejoining active room, resetting to lobby`);
        await db.updateRoom(room.id, {
          status: 'waiting_for_players',
          game_type: 'lobby'
        });
        console.log(`✅ [REJOINING DEBUG] Room status reset to waiting_for_players`);
      }
      
      // Check for disconnected participant FIRST to avoid creating unnecessary user
      // Also check for 'connected' participants if they might be stale connections
      const disconnectedParticipant = room.participants?.find(p => 
        p.user?.username === data.playerName && 
        (p.connection_status === 'disconnected' || p.connection_status === 'connected')
      );
      
      console.log(`🔍 [REJOINING DEBUG] Checking for existing participant (disconnected or potentially stale):`, {
        searchingFor: data.playerName,
        disconnectedParticipant: disconnectedParticipant ? {
          user_id: disconnectedParticipant.user_id,
          username: disconnectedParticipant.user?.username,
          connection_status: disconnectedParticipant.connection_status,
          role: disconnectedParticipant.role
        } : null
      });
      
      let user;
      let userRole;
      
      // Handle rejoining scenario
      if (disconnectedParticipant) {
        console.log(`🔄 [REJOINING DEBUG] Rejoining as existing participant:`, {
          participant_id: disconnectedParticipant.id,
          user_id: disconnectedParticipant.user_id,
          original_role: disconnectedParticipant.role,
          current_status: disconnectedParticipant.connection_status
        });
        
        // DON'T create a new user - use the original user data
        user = {
          id: disconnectedParticipant.user_id,
          username: data.playerName,
          external_id: disconnectedParticipant.user?.external_id
        };
        userRole = disconnectedParticipant.role;
        
        // Update connection tracking with the ORIGINAL user ID IMMEDIATELY
        const connection = activeConnections.get(socket.id);
        if (connection) {
          connection.userId = disconnectedParticipant.user_id; // Use original user ID
          connection.roomId = room.id;
          console.log(`🔗 [REJOINING DEBUG] Updated connection tracking with original user ID:`, {
            socketId: socket.id,
            userId: disconnectedParticipant.user_id, // Original user ID
            roomId: room.id,
            username: data.playerName,
            playerRole: disconnectedParticipant.role
          });
        }
        
        // Update connection status for existing participant (always set to connected with new socket)
        await db.updateParticipantConnection(disconnectedParticipant.user_id, socket.id, 'connected');
        console.log(`✅ [REJOINING DEBUG] Updated existing participant connection status to connected`);
        
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
        
        // Only check for duplicate participants if this is truly a new participant
        // (not handled by the disconnectedParticipant logic above)
        const existingConnectedParticipant = room.participants?.find(p => 
          p.user?.username === data.playerName && 
          p.connection_status === 'connected' &&
          p.user_id !== disconnectedParticipant?.user_id // Don't flag the same user as duplicate
        );
        
        console.log(`🔍 [REJOINING DEBUG] Duplicate check for truly new participants:`, {
          searchingFor: data.playerName,
          existingConnectedParticipant: existingConnectedParticipant ? {
            user_id: existingConnectedParticipant.user_id,
            username: existingConnectedParticipant.user?.username,
            connection_status: existingConnectedParticipant.connection_status,
            role: existingConnectedParticipant.role
          } : null,
          excludedUserId: disconnectedParticipant?.user_id
        });
        
        if (existingConnectedParticipant) {
          console.log(`❌ [REJOINING DEBUG] Duplicate name blocked: ${data.playerName} already in room ${data.roomCode}`);
          socket.emit('error', { 
            message: 'A player with this name is already in the room. Please choose a different name.',
            code: 'DUPLICATE_PLAYER',
            debug: {
              existing_user_id: existingConnectedParticipant.user_id,
              existing_connection_status: existingConnectedParticipant.connection_status
            }
          });
          return;
        }
        
        // Determine role: original room creator becomes host, others are players
        userRole = isOriginalCreator ? 'host' : 'player';
        console.log(`👥 [REJOINING DEBUG] Adding new participant with role: ${userRole}`);
        await db.addParticipant(room.id, user.id, socket.id, userRole);
        console.log(`✅ [REJOINING DEBUG] Added new participant`);
        
        // Update connection tracking
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

      // Get updated room data
      console.log(`🔄 [REJOINING DEBUG] Fetching updated room data...`);
      const updatedRoom = await db.getRoomByCode(data.roomCode);
      
      // Prepare player list
      const players = updatedRoom.participants
        ?.filter(p => p.connection_status === 'connected')
        .map(p => ({
          id: p.user_id,
          name: p.user?.display_name || p.user?.username,
          isHost: p.role === 'host',
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
        gameType: updatedRoom.game_type
      });
      
      socket.emit('roomJoined', joinSuccessData);

      console.log(`🎉 [REJOINING SUCCESS] ${data.playerName} ${disconnectedParticipant ? 'rejoined' : 'joined'} room ${data.roomCode}`);

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
        game_type: data.gameType,
        settings: data.settings || {}
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
    try {
      const connection = activeConnections.get(socket.id);
      console.log(`🚀 [DEBUG] Start game request from socket: ${socket.id}`);
      console.log(`🚀 [DEBUG] Connection data:`, { 
        userId: connection?.userId, 
        roomId: connection?.roomId 
      });
      
      if (!connection?.roomId) {
        socket.emit('error', { message: 'Not in a room' });
      return;
    }
    
      // Get room data
      const room = await db.getRoomByCode(data.roomCode);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
      return;
    }
    
      console.log(`🚀 [DEBUG] Room participants:`, room.participants?.map(p => ({
        user_id: p.user_id,
        role: p.role,
        connection_status: p.connection_status,
        username: p.user?.username
      })));
      
      // Verify user is host
      const userParticipant = room.participants?.find(p => 
        p.user_id === connection.userId && p.role === 'host'
      );
      
      console.log(`🚀 [DEBUG] Looking for host with userId: ${connection.userId}`);
      console.log(`🚀 [DEBUG] Found participant:`, userParticipant ? {
        user_id: userParticipant.user_id,
        role: userParticipant.role,
        username: userParticipant.user?.username
      } : 'NOT FOUND');
      
      if (!userParticipant) {
        socket.emit('error', { message: 'Only the host can start the game' });
      return;
    }
    
      // Update room status
      await db.updateRoom(room.id, {
        status: 'active',
        started_at: new Date().toISOString()
      });

      // Get game proxy configuration
      const gameProxy = gameProxies[room.game_type];
      if (!gameProxy) {
        socket.emit('error', { message: 'Game not supported' });
      return;
    }
    
      // Send game URLs to participants with delay for non-hosts
      const participants = room.participants?.filter(p => 
        p.connection_status === 'connected'
      ) || [];

      participants.forEach(p => {
        const encodedName = encodeURIComponent(p.user?.display_name || p.user?.username);
        const baseUrl = `${gameProxy.path}?room=${room.room_code}&players=${participants.length}&name=${encodedName}`;
        const gameUrl = p.role === 'host' ? `${baseUrl}&role=gm` : baseUrl;
        
        const delay = p.role === 'host' ? 0 : 2000; // 2 second delay for players
        
        // Find the socket ID from activeConnections
        const userConnection = Array.from(activeConnections.values())
          .find(conn => conn.userId === p.user_id);
        
        if (userConnection?.socketId) {
          setTimeout(() => {
            io.to(userConnection.socketId).emit('gameStarted', {
              gameUrl,
              gameType: room.game_type,
              isHost: p.role === 'host',
              roomCode: room.room_code
            });
          }, delay);
        }
      });

      console.log(`🚀 Game started: ${room.game_type} for room ${room.room_code}`);

    } catch (error) {
      console.error('❌ Error starting game:', error);
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

      // Handle host transfer if the host is leaving
      let newHost = null;
      if (isLeavingHost && room) {
        newHost = await db.autoTransferHost(connection.roomId, connection.userId);
      }

      // Get updated room data
      const updatedRoom = await db.getRoomByCode(data.roomCode);
      if (updatedRoom) {
        const remainingPlayers = updatedRoom.participants
          ?.filter(p => p.connection_status === 'connected')
          .map(p => ({
            id: p.user_id,
            name: p.user?.display_name || p.user?.username,
            isHost: p.role === 'host',
            socketId: null // Socket IDs are tracked in activeConnections, not stored in DB
          })) || [];

        // Notify remaining players
        const eventData = {
          playerId: connection.userId,
          players: remainingPlayers
        };

        // Add host transfer info if applicable
        if (newHost) {
          eventData.hostTransferred = {
            newHostId: newHost.user_id,
            newHostName: newHost.user?.display_name || newHost.user?.username,
            reason: 'original_host_left'
          };
        }

        io.to(data.roomCode).emit('playerLeft', eventData);

        // If no players left, mark room as abandoned
        if (remainingPlayers.length === 0) {
          await db.updateRoom(connection.roomId, {
            status: 'abandoned'
          });
        }
      }

      // Clear connection tracking
      connection.roomId = null;
      connection.userId = null;

      console.log(`👋 Player left room ${data.roomCode}${isLeavingHost ? ' (was host)' : ''}`);
      if (newHost) {
        console.log(`👑 Auto-transferred host to ${newHost.user?.display_name || newHost.user?.username}`);
      }

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
        p.connection_status === 'connected'
      ) || [];

      // Mark all participants as disconnected FIRST
      for (const p of participants) {
        await db.updateParticipantConnection(p.user_id, null, 'disconnected');
        console.log(`🔌 Disconnected player ${p.user?.username} from room ${data.roomCode}`);
      }

      // Update room status back to waiting for players
      await db.updateRoom(room.id, {
        status: 'waiting_for_players',
        game_type: 'lobby'
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
      const updatedPlayers = updatedRoom.participants
        ?.filter(p => p.connection_status === 'connected')
        .map(p => ({
          id: p.user_id,
          name: p.user?.display_name || p.user?.username,
          isHost: p.role === 'host',
          socketId: null
        })) || [];

      // Notify all players about the host change
      io.to(data.roomCode).emit('hostTransferred', {
        oldHostId: connection.userId,
        newHostId: data.targetUserId,
        newHostName: targetParticipant.user?.display_name || targetParticipant.user?.username,
        players: updatedPlayers
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
        connection_status: p.connection_status
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

      // Get updated room data
      const updatedRoom = await db.getRoomByCode(data.roomCode);
      const remainingPlayers = updatedRoom.participants
        ?.filter(p => p.connection_status === 'connected')
        .map(p => ({
          id: p.user_id,
          name: p.user?.display_name || p.user?.username,
          isHost: p.role === 'host',
          socketId: null
        })) || [];

      console.log(`👥 [KICK DEBUG] Remaining players after kick:`, remainingPlayers.map(p => ({
        id: p.id,
        name: p.name,
        isHost: p.isHost
      })));

      // Notify remaining players about the kick
      io.to(data.roomCode).emit('playerKicked', {
        targetUserId: data.targetUserId,
        targetName: targetParticipant.user?.display_name || targetParticipant.user?.username,
        kickedBy: currentParticipant.user?.display_name || currentParticipant.user?.username,
        players: remainingPlayers,
        isNotification: true // Flag to distinguish from personal kick notification
      });

      // Clear connection tracking for kicked player
      if (targetConnection) {
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

      // Validate the new status
      const validStatuses = ['waiting_for_players', 'launching', 'active', 'paused', 'finished', 'abandoned'];
      if (!validStatuses.includes(data.newStatus)) {
        socket.emit('error', { message: 'Invalid room status' });
        return;
      }

      // Update room status in database
      const updateData = { status: data.newStatus };
      
      // If changing back to waiting_for_players, also reset game type to lobby
      if (data.newStatus === 'waiting_for_players') {
        updateData.game_type = 'lobby';
      }
      
      // If finishing the room, set finished_at timestamp
      if (data.newStatus === 'finished') {
        updateData.finished_at = new Date().toISOString();
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

  // Handle disconnection
  socket.on('disconnect', async () => {
    try {
      console.log(`🔌 User disconnected: ${socket.id}`);
      
      const connection = activeConnections.get(socket.id);
      if (connection?.userId) {
        // Check if disconnecting user is the host
        let isDisconnectingHost = false;
        let room = null;
        
        if (connection.roomId) {
          room = await db.getRoomById(connection.roomId);
          const disconnectingParticipant = room?.participants?.find(p => p.user_id === connection.userId);
          isDisconnectingHost = disconnectingParticipant?.role === 'host';
        }

        // Update participant connection status
        await db.updateParticipantConnection(
          connection.userId, 
          socket.id, 
          'disconnected'
        );

        // Handle host transfer if host disconnected
        let newHost = null;
        if (isDisconnectingHost && room) {
          // Give host a grace period to reconnect (30 seconds)
          setTimeout(async () => {
            try {
              // Check if original host reconnected
              const updatedRoom = await db.getRoomById(connection.roomId);
              const originalHost = updatedRoom?.participants?.find(p => 
                p.user_id === connection.userId && p.connection_status === 'connected'
              );

              if (!originalHost) {
                // Host didn't reconnect, transfer to someone else
                newHost = await db.autoTransferHost(connection.roomId, connection.userId);
                
                if (newHost && updatedRoom) {
                  // Get updated player list
                  const updatedPlayers = updatedRoom.participants
                    ?.filter(p => p.connection_status === 'connected')
                    .map(p => ({
                      id: p.user_id,
                      name: p.user?.display_name || p.user?.username,
                      isHost: p.role === 'host' || p.user_id === newHost.user_id,
                      socketId: null
                    })) || [];

                  // Notify remaining players about host transfer
                  io.to(updatedRoom.room_code).emit('hostTransferred', {
                    oldHostId: connection.userId,
                    newHostId: newHost.user_id,
                    newHostName: newHost.user?.display_name || newHost.user?.username,
                    reason: 'original_host_disconnected',
                    players: updatedPlayers
                  });

                  console.log(`👑 Auto-transferred host to ${newHost.user?.display_name} after disconnect timeout`);
                }
              }
            } catch (error) {
              console.error('❌ Error in delayed host transfer:', error);
            }
          }, 30000); // 30 second grace period
        }

        // If in a room, notify other players about disconnection
        if (connection.roomId && room) {
          socket.to(room.room_code).emit('playerDisconnected', {
            playerId: connection.userId,
            wasHost: isDisconnectingHost
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