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

  // Handle room joining
  socket.on('joinRoom', async (data) => {
    try {
      console.log(`🚪 [SUPABASE] ${data.playerName} attempting to join room ${data.roomCode}`);
      console.log(`🔍 [DEBUG] Socket ID: ${socket.id}`);

      // Get room from database
      console.log(`🔍 [DEBUG] Looking up room in database...`);
      const room = await db.getRoomByCode(data.roomCode);
      if (!room) {
        console.log(`❌ [DEBUG] Room ${data.roomCode} not found in SUPABASE storage`);
        socket.emit('error', { 
          message: 'Room not found. Please check the room code.',
          code: 'ROOM_NOT_FOUND',
          debug: {
            room_code: data.roomCode
          }
        });
        return;
      }
      console.log(`✅ [DEBUG] Room found:`, { 
        id: room.id, 
        room_code: room.room_code, 
        status: room.status,
        current_players: room.current_players,
        max_players: room.max_players
      });

      // Check if room is full
      if (room.current_players >= room.max_players) {
        socket.emit('error', { 
          message: 'Room is full. Cannot join.',
          code: 'ROOM_FULL'
        });
        return;
      }
      
      // Check if room is still accepting players
      if (room.status !== 'waiting_for_players') {
        socket.emit('error', { 
          message: 'Room is no longer accepting players.',
          code: 'ROOM_NOT_ACCEPTING'
        });
        return;
      }
      
      // Get or create user profile
      const user = await db.getOrCreateUser(
        `${socket.id}_${data.playerName}`, // Unique per connection to prevent conflicts
        data.playerName,
        data.playerName
      );

      // Check if this is the room creator trying to rejoin
      const isOriginalCreator = room.metadata?.created_by_name === data.playerName;
      
      console.log(`🚪 [DEBUG] User joining room:`, {
        userId: user.id,
        username: user.username,
        roomCode: data.roomCode,
        isOriginalCreator: isOriginalCreator
      });

      // Check for duplicate player names in room
      const existingParticipant = room.participants?.find(p => 
        p.user?.username === data.playerName && 
        p.connection_status === 'connected'
      );
      
      if (existingParticipant) {
        console.log(`❌ [DEBUG] Duplicate name blocked: ${data.playerName} already in room ${data.roomCode}`);
        socket.emit('error', { 
          message: 'A player with this name is already in the room. Please choose a different name.',
          code: 'DUPLICATE_PLAYER'
        });
        return;
      }
      
      // Determine role: original room creator becomes host, others are players
      const userRole = isOriginalCreator ? 'host' : 'player';
      await db.addParticipant(room.id, user.id, socket.id, userRole);

      // Join socket room
      socket.join(data.roomCode);

      // Update connection tracking
      const connection = activeConnections.get(socket.id);
      if (connection) {
        connection.userId = user.id;
        connection.roomId = room.id;
        console.log(`🚪 [DEBUG] Updated connection tracking for socket ${socket.id}:`, {
          userId: user.id,
          roomId: room.id,
          username: user.username,
          playerRole: userRole
        });
      }

      // Get updated room data
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

      // Notify all players in room
      io.to(data.roomCode).emit('playerJoined', {
        player: {
          id: user.id,
          name: data.playerName,
          isHost: isOriginalCreator,
          socketId: socket.id
        },
        players: players,
        room: updatedRoom
      });

      // Send success response to joining player
      socket.emit('roomJoined', {
        roomCode: data.roomCode,
        isHost: isOriginalCreator,
        players: players,
        room: updatedRoom
      });

      console.log(`✅ ${data.playerName} joined room ${data.roomCode}`);

    } catch (error) {
      console.error('❌ Error joining room:', error);
      socket.emit('error', { 
        message: 'Failed to join room. Please try again.',
        code: 'JOIN_FAILED'
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
        status: 'launching',
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

      // Remove participant from database
      await db.removeParticipant(connection.roomId, connection.userId);

      // Leave socket room
      socket.leave(data.roomCode);

      // Get updated room data
      const room = await db.getRoomByCode(data.roomCode);
      if (room) {
        const remainingPlayers = room.participants
          ?.filter(p => p.connection_status === 'connected')
          .map(p => ({
            id: p.user_id,
            name: p.user?.display_name || p.user?.username,
            isHost: p.role === 'host',
            socketId: null // Socket IDs are tracked in activeConnections, not stored in DB
          })) || [];

        // Notify remaining players
        io.to(data.roomCode).emit('playerLeft', {
          playerId: connection.userId,
          players: remainingPlayers
        });

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

      console.log(`👋 Player left room ${data.roomCode}`);

    } catch (error) {
      console.error('❌ Error leaving room:', error);
    }
  });

  // Handle disconnection
  socket.on('disconnect', async () => {
    try {
      console.log(`🔌 User disconnected: ${socket.id}`);
      
      const connection = activeConnections.get(socket.id);
      if (connection?.userId) {
        // Update participant connection status
        await db.updateParticipantConnection(
          connection.userId, 
          socket.id, 
          'disconnected'
        );

        // If in a room, notify other players
        if (connection.roomId) {
          const room = await db.getRoomById(connection.roomId);
          if (room) {
            socket.to(room.room_code).emit('playerDisconnected', {
              playerId: connection.userId
            });
          }
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