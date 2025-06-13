const express = require('express');
const path = require('path');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const { createProxyMiddleware } = require('http-proxy-middleware');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3033;

// Security and optimization middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for game iframes
}));
app.use(compression());
app.use(cors());
app.use(express.json()); // Add JSON body parser

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
      rooms.delete(code);
      console.log(`Room ${code} expired and was deleted`);
    }
  }
}, 60000); // Check every minute

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
    status: 'selecting_game',
    createdAt: Date.now(),
    expiresAt: Date.now() + (2 * 60 * 60 * 1000), // 2 hours
    isPrivate: isPrivate || false,
    playerCount: 0,
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

// List available games
app.get('/api/games/available', (req, res) => {
  res.json(AVAILABLE_GAMES);
});

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
// IMPORTANT: Update these with your actual Render.com game URLs
const gameProxies = {
  '/ddf': {
    target: process.env.DDF_URL || 'http://localhost:3001',
    changeOrigin: true,
    ws: true, // Enable WebSocket support
    pathRewrite: {
      '^/ddf': '', // Remove /ddf prefix when forwarding
    },
    onError: (err, req, res) => {
      console.error('Proxy error for /ddf:', err.message);
      res.status(500).send('Proxy error: ' + err.message);
    },
    onProxyReq: (proxyReq, req, res) => {
      console.log('Proxying request to DDF:', req.url, '->', process.env.DDF_URL);
    },
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
  },
  // Add more games here as needed
  // Example:
  // '/snake': {
  //   target: process.env.SNAKE_GAME_URL || 'https://snake-game.onrender.com',
  //   changeOrigin: true,
  //   ws: true,
  //   pathRewrite: {
  //     '^/snake': '',
  //   },
  // },
};

// Set up reverse proxies for each game
Object.entries(gameProxies).forEach(([path, config]) => {
  app.use(path, createProxyMiddleware(config));
});

// API endpoint to get game list (for the homepage)
// IMPORTANT: Update this with your actual game names, descriptions, and paths
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
    },
    // Add more games here
    // Example:
    // {
    //   id: 'snake',
    //   name: 'Snake Game',
    //   description: 'Classic snake game with modern graphics',
    //   screenshot: '/screenshots/snake.jpg',
    //   path: '/snake',
    //   available: true,
    // },
  ]);
});

// Serve static files from React build
app.use(express.static(path.join(__dirname, '../client/build')));
app.use('/screenshots', express.static(path.join(__dirname, 'screenshots')));

// Catch all handler - send React app for any route not handled above
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`GameBuddies server running on port ${PORT}`);
  console.log('Game proxies configured:', Object.keys(gameProxies));
  console.log('Environment variables:');
  console.log('DDF_URL:', process.env.DDF_URL);
  console.log('SCHOOLED_URL:', process.env.SCHOOLED_URL);
}); 