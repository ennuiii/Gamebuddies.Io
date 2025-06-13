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
  },
  '/schooled': {
    target: process.env.SCHOOLED_URL || 'http://localhost:3002',
    changeOrigin: true,
    ws: true,
    pathRewrite: {
      '^/schooled': '',
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
}); 