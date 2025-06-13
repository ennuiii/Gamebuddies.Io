const express = require('express');
const path = require('path');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const { createProxyMiddleware } = require('http-proxy-middleware');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? ["https://gamebuddies.io", "https://www.gamebuddies.io", "https://gamebuddies-homepage.onrender.com"]
      : "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: 60000,  // 60 seconds before considering connection dead
  pingInterval: 25000, // Ping every 25 seconds
  connectTimeout: 10000, // 10 seconds to establish connection
  allowUpgrades: true,
  transports: ['websocket', 'polling'],
  // Additional production settings
  ...(process.env.NODE_ENV === 'production' && {
    path: '/socket.io/',
    serveClient: false,
    // Ensure no request entity too large errors
    maxHttpBufferSize: 1e6 // 1MB
  })
});

const PORT = process.env.PORT || 3033;

// Security and optimization middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for game iframes
}));
app.use(compression());
app.use(cors());
app.use(express.json()); // Add JSON body parser

// Request logging middleware for debugging in production
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - Origin: ${req.headers.origin || 'none'}`);
  }
  next();
});

// Room Management System
// In-memory storage for rooms
const rooms = new Map();

// Available games configuration
const AVAILABLE_GAMES = {
  'schoolquiz': {
    name: 'School Quiz Game',
    url: process.env.SCHOOLED_URL || 'https://schoolquizgame.onrender.com',
    description: 'Educational quiz game',
    maxPlayers: 50,
    icon: '🎓',
    path: '/schooled'
  },
  'ddf': {
    name: 'Der dümmste fliegt',
    url: process.env.DDF_URL || 'https://ddf-game.onrender.com',
    description: 'A fun quiz game where knowledge and quick thinking are key!',
    maxPlayers: 30,
    icon: '🎮',
    path: '/ddf'
  }
};

// Generate random room code
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Clean up expired rooms
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (room.expiresAt < now) {
      // Notify all players in the room
      io.to(code).emit('roomExpired');
      rooms.delete(code);
      console.log(`Room ${code} expired and was deleted`);
    }
  }
}, 60000); // Check every minute

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id, 'from:', socket.handshake.headers.origin || 'unknown origin');
  
  // Handle errors
  socket.on('error', (error) => {
    console.error('Socket error:', socket.id, error);
  });
  
  // Handle disconnect
  socket.on('disconnect', (reason) => {
    console.log('Client disconnected:', socket.id, 'Reason:', reason);
    handlePlayerLeave(socket);
  });
  
  // Join a room
  socket.on('joinRoom', ({ roomCode, playerName }) => {
    try {
      console.log(`[joinRoom] Attempt to join room ${roomCode} by ${playerName} (socket: ${socket.id})`);
      
      const room = rooms.get(roomCode);
      
      if (!room) {
        console.error(`[joinRoom] Room ${roomCode} not found`);
        socket.emit('joinError', 'Room not found');
        return;
      }
      
      if (room.players.length >= room.maxPlayers && room.maxPlayers) {
        socket.emit('joinError', 'Room is full');
        return;
      }
      
      // Check if player is already in room (prevent duplicates)
      const existingPlayer = room.players.find(p => p.id === socket.id);
      if (existingPlayer) {
        // Player already in room, just send current state
        socket.emit('roomJoined', {
          room,
          playerId: socket.id,
          isHost: existingPlayer.isHost
        });
        return;
      }
      
      // Add player to room
      const player = {
        id: socket.id,
        name: playerName,
        isHost: room.players.length === 0, // First player is host
        joinedAt: Date.now()
      };
      
      room.players.push(player);
      socket.join(roomCode);
      socket.roomCode = roomCode;
      socket.playerId = socket.id;
      
      // Send room info to the joining player
      socket.emit('roomJoined', {
        room,
        playerId: socket.id,
        isHost: player.isHost
      });
      
      // Notify all players in the room (including the new player)
      io.to(roomCode).emit('playerJoined', {
        player,
        players: room.players
      });
      
      console.log(`Player ${playerName} joined room ${roomCode} (${room.players.length} players now)`);
    } catch (error) {
      console.error('Error in joinRoom:', error);
      socket.emit('joinError', 'Internal server error');
    }
  });
  
  // Leave room
  socket.on('leaveRoom', () => {
    handlePlayerLeave(socket);
  });
  
  // Host selects/changes game
  socket.on('selectGame', ({ roomCode, gameType }) => {
    const room = rooms.get(roomCode);
    
    if (!room) {
      socket.emit('error', 'Room not found');
      return;
    }
    
    // Check if player is host
    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.isHost) {
      socket.emit('error', 'Only host can select game');
      return;
    }
    
    if (!AVAILABLE_GAMES[gameType]) {
      socket.emit('error', 'Invalid game type');
      return;
    }
    
    const game = AVAILABLE_GAMES[gameType];
    room.gameType = gameType;
    room.gameServerUrl = game.url;
    room.maxPlayers = game.maxPlayers;
    room.selectedGame = game;
    room.status = 'in_lobby';
    
    // Notify all players
    io.to(roomCode).emit('gameSelected', {
      gameType,
      game: room.selectedGame
    });
    
    console.log(`Room ${roomCode} selected game: ${gameType}`);
  });
  
  // Host starts the game
  socket.on('startGame', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    
    if (!room) {
      socket.emit('error', 'Room not found');
      return;
    }
    
    // Check if player is host
    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.isHost) {
      socket.emit('error', 'Only host can start game');
      return;
    }
    
    if (!room.gameType) {
      socket.emit('error', 'No game selected');
      return;
    }
    
    room.status = 'in_game';
    
    // Send different URLs to each player based on their role
    room.players.forEach(p => {
      // Encode player name for URL
      const encodedName = encodeURIComponent(p.name);
      const baseUrl = `${room.selectedGame.path}?room=${roomCode}&players=${room.players.length}&name=${encodedName}`;
      const gameUrl = p.isHost ? `${baseUrl}&role=gm` : baseUrl;
      
      // Send personalized game URL to each player
      io.to(p.id).emit('gameStarted', {
        gameUrl,
        gameType: room.gameType,
        isHost: p.isHost
      });
    });
    
    console.log(`Room ${roomCode} started game: ${room.gameType}`);
  });
});

// Helper function to handle player leaving
function handlePlayerLeave(socket) {
  try {
    const roomCode = socket.roomCode;
    if (!roomCode) return;
    
    const room = rooms.get(roomCode);
    if (!room) return;
    
    // Remove player from room
    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;
    
    const leavingPlayer = room.players[playerIndex];
    room.players.splice(playerIndex, 1);
    
    socket.leave(roomCode);
    
    // If room is empty, delete it
    if (room.players.length === 0) {
      rooms.delete(roomCode);
      console.log(`Room ${roomCode} deleted (empty)`);
      return;
    }
    
    // If host left, assign new host
    if (leavingPlayer.isHost && room.players.length > 0) {
      room.players[0].isHost = true;
      io.to(roomCode).emit('hostChanged', {
        newHostId: room.players[0].id,
        newHostName: room.players[0].name
      });
    }
    
    // Notify remaining players
    io.to(roomCode).emit('playerLeft', {
      playerId: socket.id,
      playerName: leavingPlayer.name,
      players: room.players
    });
    
    console.log(`Player ${leavingPlayer.name} left room ${roomCode}`);
  } catch (error) {
    console.error('Error in handlePlayerLeave:', error);
  }
}

// Room API endpoints
// Create a new room
app.post('/api/rooms', (req, res) => {
  const { creatorName, isPrivate } = req.body;
  
  if (!creatorName || creatorName.trim().length === 0) {
    return res.status(400).json({ error: 'Creator name is required' });
  }
  
  // Generate unique room code
  let roomCode;
  do {
    roomCode = generateRoomCode();
  } while (rooms.has(roomCode));
  
  const room = {
    roomCode,
    creatorName: creatorName.trim(),
    gameType: null,
    gameServerUrl: null,
    selectedGame: null,
    status: 'waiting_for_players',
    createdAt: Date.now(),
    expiresAt: Date.now() + (2 * 60 * 60 * 1000), // 2 hours
    isPrivate: isPrivate || false,
    players: [],
    maxPlayers: null
  };
  
  rooms.set(roomCode, room);
  console.log(`Room ${roomCode} created by ${creatorName}`);
  
  res.json(room);
});

// Select game for a room
app.post('/api/rooms/:code/select-game', (req, res) => {
  const { code } = req.params;
  const { gameType } = req.body;
  
  const room = rooms.get(code);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  
  if (!AVAILABLE_GAMES[gameType]) {
    return res.status(400).json({ error: 'Invalid game type' });
  }
  
  const game = AVAILABLE_GAMES[gameType];
  room.gameType = gameType;
  room.gameServerUrl = game.url;
  room.maxPlayers = game.maxPlayers;
  room.status = 'waiting_for_players';
  
  console.log(`Room ${code} selected game: ${gameType}`);
  
  res.json(room);
});

// Get room details
app.get('/api/rooms/:code', (req, res) => {
  const { code } = req.params;
  const room = rooms.get(code);
  
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  
  res.json(room);
});

// This endpoint is handled later with better formatting

// Delete a room (optional)
app.delete('/api/rooms/:code', (req, res) => {
  const { code } = req.params;
  
  if (!rooms.has(code)) {
    return res.status(404).json({ error: 'Room not found' });
  }
  
  rooms.delete(code);
  console.log(`Room ${code} was deleted`);
  
  res.json({ message: 'Room deleted successfully' });
});

// Game configurations - Add your game URLs here
const gameProxies = {
  '/ddf': {
    target: process.env.DDF_URL || 'http://localhost:3001',
    changeOrigin: true,
    ws: true,
    pathRewrite: {
      '^/ddf': '',
    },
    onError: (err, req, res) => {
      console.error('Proxy error for /ddf:', err.message);
      res.status(500).send('Proxy error: ' + err.message);
    },
    onProxyReq: (proxyReq, req, res) => {
      console.log('Proxying request to DDF:', req.url, '->', process.env.DDF_URL);
    },
    secure: false,
    timeout: 5000,
    proxyTimeout: 5000
  },
  '/schooled': {
    target: process.env.SCHOOLED_URL || 'http://localhost:3002',
    changeOrigin: true,
    ws: true,
    pathRewrite: {
      '^/schooled': '',
    },
    onError: (err, req, res) => {
      console.error('Proxy error for /schooled:', err.message);
      res.status(500).send('Proxy error: ' + err.message);
    },
    onProxyReq: (proxyReq, req, res) => {
      console.log('Proxying request to Schooled:', req.url, '->', process.env.SCHOOLED_URL);
    },
    secure: false,
    timeout: 5000,
    proxyTimeout: 5000
  }
};

// IMPORTANT: API routes MUST be defined BEFORE static file serving
// This ensures API routes are not intercepted by the static file middleware

// Add health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Add games endpoint
app.get('/api/games/available', (req, res) => {
  try {
    const games = Object.entries(AVAILABLE_GAMES).map(([type, game]) => ({
      type,
      name: game.name,
      description: game.description,
      maxPlayers: game.maxPlayers,
      path: game.path
    }));
    res.json(games);
  } catch (error) {
    console.error('Error fetching available games:', error);
    res.status(500).json({ error: 'Failed to fetch available games' });
  }
});

// API endpoint to get game list (for the homepage)
app.get('/api/games', (req, res) => {
  res.json([
    {
      id: 'ddf',
      name: 'Der dümmste fliegt',
      description: 'A fun quiz game where knowledge and quick thinking are key!',
      screenshot: '/screenshots/DDF.png',
      path: '/ddf',
      available: true,
    },
    {
      id: 'schooled',
      name: 'Schooled',
      description: 'Test your knowledge with questions from the German school system',
      screenshot: '/screenshots/schooled.png',
      path: '/schooled',
      available: true,
    }
  ]);
});

// Set up reverse proxies for each game
// These must come BEFORE static file serving
Object.entries(gameProxies).forEach(([path, config]) => {
  app.use(path, createProxyMiddleware(config));
});

// Screenshots should be served before the React app
app.use('/screenshots', express.static(path.join(__dirname, 'screenshots')));

// Serve static files from React build
// This MUST come AFTER all API routes and proxies
// Handle both development (server run from server/) and production (server run from root) paths
const isDevelopment = process.env.NODE_ENV !== 'production';
const clientBuildPath = isDevelopment 
  ? path.join(__dirname, '../client/build')
  : path.join(__dirname, '../client/build');

// Check if we're running from root directory (production) or server directory (development)
const isRunFromRoot = __dirname.endsWith('server');
const actualClientBuildPath = isRunFromRoot 
  ? path.join(__dirname, '../client/build')
  : path.join(__dirname, 'client/build');

console.log('Current directory:', __dirname);
console.log('Client build path:', actualClientBuildPath);
console.log('Screenshots path:', path.join(__dirname, 'screenshots'));

// Static files for the React app - MUST be last before catch-all
app.use(express.static(actualClientBuildPath));

// Add error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Catch all handler - send React app for any route not handled above
app.get('*', (req, res) => {
  res.sendFile(path.join(actualClientBuildPath, 'index.html'));
});

// Add timeout configuration for Render.com
server.keepAliveTimeout = 120000; // 120 seconds
server.headersTimeout = 120000; // 120 seconds

server.listen(PORT, '0.0.0.0', () => {
  console.log(`GameBuddies server running on port ${PORT}`);
  console.log('Game proxies configured:', Object.keys(gameProxies));
  console.log('Environment variables:');
  console.log('DDF_URL:', process.env.DDF_URL);
  console.log('SCHOOLED_URL:', process.env.SCHOOLED_URL);
}); 