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

// ===== NEW API ENDPOINTS =====

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
    await db.client.from('game_rooms').select('id').limit(1);
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      version: '2.0.0'
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy', 
      error: error.message 
    });
  }
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
      console.log(`🏠 Creating room for ${data.playerName}`);
      
      // Get or create user profile
      const user = await db.getOrCreateUser(
        socket.id, // Using socket.id as external_id for now
        data.playerName,
        data.playerName
      );

      // Create room in database
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

      // Add creator as participant
      await db.addParticipant(room.id, user.id, socket.id, 'host');

      // Join socket room
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

      console.log(`✅ Room created: ${room.room_code} by ${data.playerName}`);

    } catch (error) {
      console.error('❌ Error creating room:', error);
      socket.emit('error', { 
        message: 'Failed to create room. Please try again.',
        code: 'ROOM_CREATION_FAILED'
      });
    }
  });

  // Handle room joining
  socket.on('joinRoom', async (data) => {
    try {
      console.log(`🚪 ${data.playerName} attempting to join room ${data.roomCode}`);

      // Get room from database
      const room = await db.getRoomByCode(data.roomCode);
      if (!room) {
        socket.emit('error', { 
          message: 'Room not found. Please check the room code.',
          code: 'ROOM_NOT_FOUND'
        });
        return;
      }

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
        socket.id,
        data.playerName,
        data.playerName
      );

      // Check for duplicate player names in room
      const existingParticipant = room.participants?.find(p => 
        p.user?.username === user.username && p.connection_status === 'connected'
      );
      
      if (existingParticipant) {
        socket.emit('error', { 
          message: 'A player with this name is already in the room.',
          code: 'DUPLICATE_PLAYER'
        });
        return;
      }

      // Add participant to room
      await db.addParticipant(room.id, user.id, socket.id, 'player');

      // Join socket room
      socket.join(data.roomCode);

      // Update connection tracking
      const connection = activeConnections.get(socket.id);
      if (connection) {
        connection.userId = user.id;
        connection.roomId = room.id;
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
          socketId: p.socket_id
        })) || [];

      // Notify all players in room
      io.to(data.roomCode).emit('playerJoined', {
        player: {
          id: user.id,
          name: data.playerName,
          isHost: false,
          socketId: socket.id
        },
        players: players,
        room: updatedRoom
      });

      // Send success response to joining player
      socket.emit('roomJoined', {
        roomCode: data.roomCode,
        isHost: false,
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

      // Verify user is host
      const userParticipant = room.participants?.find(p => 
        p.user_id === connection.userId && p.role === 'host'
      );
      
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
        
        setTimeout(() => {
          io.to(p.socket_id).emit('gameStarted', {
            gameUrl,
            gameType: room.game_type,
            isHost: p.role === 'host',
            roomCode: room.room_code
          });
        }, delay);
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
            socketId: p.socket_id
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
          const room = await db.getRoomByCode(connection.roomCode);
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

// ===== CLEANUP AND MAINTENANCE =====

// Periodic cleanup of stale connections
setInterval(async () => {
  try {
    await db.cleanupStaleConnections();
    await db.refreshActiveRoomsView();
  } catch (error) {
    console.error('❌ Cleanup error:', error);
  }
}, 5 * 60 * 1000); // Every 5 minutes

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

// Start server
const PORT = process.env.PORT || 3033;
server.listen(PORT, () => {
  console.log(`🚀 GameBuddies Server v2.0.0 running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🎮 Game proxies configured: ${Object.keys(gameProxies).join(', ')}`);
});

module.exports = { app, server, io }; 