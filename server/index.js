
const gameApiV2Router = require('./routes/gameApiV2');
const gameApiV2DDFRouter = require('./routes/gameApiV2_DDFCompatibility');
const gamesRouter = require('./routes/games');
const authRouter = require('./routes/auth');
const friendsRouter = require('./routes/friends');
const adminRouter = require('./routes/admin');
const stripeRouter = require('./routes/stripe');
const avatarsRouter = require('./routes/avatars');
const express = require('express');
const path = require('path');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { createProxyMiddleware } = require('http-proxy-middleware');
const http = require('http');
const socketIo = require('socket.io');
const { db } = require('./lib/supabase');
require('dotenv').config();
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const ConnectionManager = require('./lib/connectionManager');
const LobbyManager = require('./lib/lobbyManager');
const StatusSyncManager = require('./lib/statusSyncManager');
const { validators, sanitize, rateLimits, validateApiKey } = require('./lib/validation');
const gameKeepAlive = require('./services/gameKeepAlive');

const app = express();
const server = http.createServer(app);

// Behind Render/other proxies, respect X-Forwarded-* for IPs and protocol
app.set('trust proxy', 1);

// Enhanced CORS configuration (robust parsing + sensible defaults)
const parseOrigins = (val) =>
  (val || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const defaultOrigins = [
  'http://localhost:3000',
  'http://localhost:3033',
  'https://gamebuddies.io',
  'https://gamebuddies-homepage.onrender.com',
  'https://gamebuddies-client.onrender.com',
];

const envOrigins = parseOrigins(process.env.CORS_ORIGINS);
const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));

const isAllowedOrigin = (origin) => {
  if (!origin) return true; // allow non-browser clients
  if (allowedOrigins.includes(origin)) return true;
  try {
    const { hostname } = new URL(origin);
    // Permit our known host families
    if (hostname === 'gamebuddies.io' || hostname.endsWith('.gamebuddies.io')) return true;
    if (hostname.endsWith('.onrender.com')) return true;
  } catch (_) {}
  return false;
};

const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // unsafe-eval needed for React dev
      styleSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline needed for styled-components
      imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: [
        "'self'",
        'wss:', 'ws:', // WebSocket for Socket.io
        'https://*.supabase.co', // Supabase real-time
        'https://*.onrender.com', // External games
      ],
      frameSrc: [
        "'self'",
        'https://ddf-game.onrender.com',
        'https://schoolquizgame.onrender.com',
        'https://susd-1.onrender.com',
        'https://bingobuddies.onrender.com',
        'https://bumperballarenaclient.onrender.com',
      ],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false // Keep disabled for iframe compatibility
}));
app.use(compression());
app.use(cookieParser()); // Parse cookies for secure session management
app.use(cors(corsOptions));

// Stripe webhook endpoint needs RAW body for signature verification
// Must be mounted BEFORE express.json() middleware
// Only mount the webhook route here, not the entire stripeRouter
console.log('🔌 [SERVER] Mounting Stripe webhook route at /api/stripe/webhook (RAW body)');
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res, next) => {
  // Forward to the stripe router's webhook handler
  req.url = '/webhook';  // Rewrite URL for the router
  req.isWebhookRoute = true;  // Mark this as webhook route
  stripeRouter(req, res, next);
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Normalize direct deep links to DDF routes so they load via home
app.get(
  ['/ddf/game', '/ddf/game/*', '/ddf/lobby', '/ddf/lobby/*'],
  (req, res) => {
  res.redirect(302, '/ddf/');
  }
);

// Socket.io setup with enhanced configuration
const io = socketIo(server, {
  cors: corsOptions,
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6,
  transports: ['websocket', 'polling']
});

// Helpers for environment parsing
const envBool = (name, defaultVal) => {
  const v = process.env[name];
  if (v == null) return defaultVal;
  return /^(1|true|yes|on)$/i.test(String(v).trim());
};

// Game proxy configuration - now loaded dynamically from database
let gameProxies = {};

// Function to load game proxies from database
async function loadGameProxiesFromDatabase() {
  try {
    console.log('[PROXY] 🔄 Loading game configurations from database...');

    const { data: games, error } = await db.client
      .from('games')
      .select('*')
      .eq('is_active', true)
      .eq('is_external', true); // Only external games need proxies

    if (error) {
      console.error('[PROXY] ❌ Error loading games from database:', error);
      return {};
    }

    const proxies = {};

    for (const game of games) {
      const gameId = game.id;
      const gameIdUpper = gameId.toUpperCase();

      // Use environment variable if available, otherwise use base_url from database
      const envVarName = `${gameIdUpper}_URL`;
      const target = process.env[envVarName] || game.base_url;

      proxies[gameId] = {
        path: `/${gameId}`,
        target: target,
        pathRewrite: { [`^/${gameId}`]: '' },
        ws: envBool(`${gameIdUpper}_WS`, false)
      };

      console.log(`[PROXY] ✅ Configured ${gameId}: /${gameId} -> ${target}`);
    }

    console.log(`[PROXY] 🎮 Loaded ${Object.keys(proxies).length} game proxies from database`);
    return proxies;

  } catch (err) {
    console.error('[PROXY] ❌ Unexpected error loading game proxies:', err);
    return {};
  }
}

// DDF routes are handled directly by the proxy - no SPA rewriting needed
// The DDF service has its own SPA catch-all handler to serve index.html
// This allows proper React Router functionality with preserved paths

// Store proxy instances for WebSocket upgrade handling
const proxyInstances = {};

// [ABANDON] Grace period before marking rooms abandoned (prevents false abandonment during return-from-game)
const abandonmentTimers = new Map();
const ABANDONMENT_GRACE_PERIOD_MS = 10000; // 10 seconds

function startAbandonmentGracePeriod(roomId, roomCode) {
  // Clear any existing timer for this room
  if (abandonmentTimers.has(roomId)) {
    clearTimeout(abandonmentTimers.get(roomId));
  }

  console.log(`⏳ [ABANDON] Starting ${ABANDONMENT_GRACE_PERIOD_MS}ms grace period for room ${roomCode}`);

  const timer = setTimeout(async () => {
    abandonmentTimers.delete(roomId);

    try {
      // Re-check connected players after grace period
      const { data: room, error } = await db.adminClient
        .from('rooms')
        .select('*, room_members!inner(*)')
        .eq('id', roomId)
        .single();

      if (error) {
        console.error(`❌ [ABANDON] Error checking room ${roomCode}:`, error);
        return;
      }

      const connectedCount = room?.room_members?.filter(m => m.is_connected).length || 0;

      if (connectedCount === 0 && room?.status !== 'abandoned') {
        console.log(`🗑️ [ABANDON] Grace period expired, no reconnections - marking room ${roomCode} as abandoned`);
        await db.adminClient
          .from('rooms')
          .update({ status: 'abandoned', updated_at: new Date().toISOString() })
          .eq('id', roomId);
        console.log(`✅ [ABANDON] Room ${roomCode} marked as abandoned`);
      } else {
        console.log(`✅ [ABANDON] Grace period: Room ${roomCode} has ${connectedCount} connected players, not abandoning`);
      }
    } catch (err) {
      console.error(`❌ [ABANDON] Exception during grace period check for room ${roomCode}:`, err);
    }
  }, ABANDONMENT_GRACE_PERIOD_MS);

  abandonmentTimers.set(roomId, timer);
}

function cancelAbandonmentGracePeriod(roomId, roomCode) {
  if (abandonmentTimers.has(roomId)) {
    console.log(`✅ [ABANDON] Cancelled grace period for room ${roomCode} - player reconnected`);
    clearTimeout(abandonmentTimers.get(roomId));
    abandonmentTimers.delete(roomId);
  }
}

// [HOST] Grace period before transferring host (prevents false transfer during return-from-game)
const hostTransferTimers = new Map();
const HOST_TRANSFER_GRACE_PERIOD_MS = 30000; // 30 seconds

function startHostTransferGracePeriod(roomId, roomCode, originalHostUserId) {
  // Clear any existing timer for this room
  if (hostTransferTimers.has(roomId)) {
    clearTimeout(hostTransferTimers.get(roomId).timer);
  }

  console.log(`⏳ [HOST] Starting ${HOST_TRANSFER_GRACE_PERIOD_MS}ms grace period for host ${originalHostUserId} in room ${roomCode}`);

  const timer = setTimeout(async () => {
    hostTransferTimers.delete(roomId);

    try {
      // Re-check if original host reconnected
      const { data: room, error } = await db.adminClient
        .from('rooms')
        .select('*, room_members!inner(*)')
        .eq('id', roomId)
        .single();

      if (error) {
        console.error(`❌ [HOST] Error checking room ${roomCode}:`, error);
        return;
      }

      const originalHost = room?.room_members?.find(m => m.user_id === originalHostUserId);
      const isOriginalHostConnected = originalHost?.is_connected === true;

      if (isOriginalHostConnected) {
        console.log(`✅ [HOST] Grace period: Original host ${originalHostUserId} reconnected, keeping host status`);
        return;
      }

      // Original host didn't reconnect - transfer to another player
      const otherConnectedPlayers = room?.room_members?.filter(m =>
        m.user_id !== originalHostUserId && m.is_connected === true
      ) || [];

      if (otherConnectedPlayers.length > 0) {
        console.log(`👑 [HOST] Grace period expired, original host not connected - transferring host`);
        const newHost = await db.autoTransferHost(roomId, originalHostUserId);
        if (newHost) {
          // Broadcast host transfer to all connected clients
          io.to(room.room_code).emit('hostTransferred', {
            oldHostId: originalHostUserId,
            newHostId: newHost.user_id,
            newHostName: newHost.user?.display_name || 'Player',
            reason: 'grace_period_expired',
            roomVersion: Date.now()
          });
          console.log(`👑 [HOST] Host transfer completed after grace period:`, {
            oldHostId: originalHostUserId,
            newHostId: newHost.user_id,
            newHostName: newHost.user?.display_name || 'Player'
          });
        }
      } else {
        console.log(`⚠️ [HOST] Grace period expired, no other connected players - keeping host role for when they return`);
      }
    } catch (err) {
      console.error(`❌ [HOST] Exception during grace period check for room ${roomCode}:`, err);
    }
  }, HOST_TRANSFER_GRACE_PERIOD_MS);

  hostTransferTimers.set(roomId, { timer, originalHostUserId });
}

function cancelHostTransferGracePeriod(roomId, roomCode, reconnectingUserId) {
  const pending = hostTransferTimers.get(roomId);
  if (pending && pending.originalHostUserId === reconnectingUserId) {
    console.log(`✅ [HOST] Cancelled grace period for room ${roomCode} - original host ${reconnectingUserId} reconnected`);
    clearTimeout(pending.timer);
    hostTransferTimers.delete(roomId);
    return true; // Indicates original host reconnected
  }
  return false;
}

// Global WebSocket error suppression function
const isNavigationError = (err) => {
  const suppressedCodes = ['ERR_STREAM_WRITE_AFTER_END', 'ECONNRESET', 'EPIPE', 'ENOTFOUND'];
  const suppressedMessages = [
    'write after end',
    'connection was terminated',
    'socket hang up',
    'read ECONNRESET',
    'write EPIPE'
  ];
  
  return suppressedCodes.includes(err.code) || 
         suppressedMessages.some(msg => err.message?.includes(msg));
};

// Setup game proxies with enhanced error handling
const createFilteredLogger = () => {
  const base = console;
  const suppress = (message, args) => {
    try {
      const text = [message, ...(args || [])]
        .map((a) => (a && a.stack ? a.stack : String(a)))
        .join(' ');
      return (
        text.includes('HPM WebSocket error') ||
        text.includes('ERR_STREAM_WRITE_AFTER_END') ||
        text.includes('ECONNRESET') ||
        text.includes('socket hang up')
      );
    } catch (_) {
      return false;
    }
  };

  return {
    log: (...args) => base.log(...args),
    debug: (...args) => (base.debug ? base.debug(...args) : base.log(...args)),
    info: (...args) => (base.info ? base.info(...args) : base.log(...args)),
    warn: (...args) => (base.warn ? base.warn(...args) : base.log(...args)),
    error: (message, ...args) => {
      if (suppress(message, args)) return;
      base.error(message, ...args);
    },
  };
};
// Function to setup all game proxies
async function setupGameProxies() {
  // Load proxies from database
  gameProxies = await loadGameProxiesFromDatabase();

  // Setup each proxy
  Object.entries(gameProxies).forEach(([key, proxy]) => {
    console.log(`🔗 [PROXY] Setting up ${key.toUpperCase()} proxy: ${proxy.path} -> ${proxy.target}`);

    // Base proxy configuration
    const proxyConfig = {
      target: proxy.target,
      changeOrigin: true,
      pathRewrite: proxy.pathRewrite,
      timeout: 15000,
      proxyTimeout: 15000,
      ws: proxy.ws !== false, // Use individual proxy ws setting, default to true
      logLevel: process.env.PROXY_LOG_LEVEL || 'silent',
      logProvider: () => createFilteredLogger(),

      // Enhanced error handling to prevent connection loops
      onError: (err, req, res) => {
        // Only log real errors, not connection resets from unreachable services
        if (!isNavigationError(err) && err.code !== 'ECONNRESET') {
          console.error(`❌ [PROXY] ${key.toUpperCase()} error: ${err.message}`);
        }

        // Only send response if not already sent and not a WebSocket upgrade
        if (!res.headersSent && !req.headers.upgrade) {
          res.status(503).json({
            error: `${key.toUpperCase()} game service is temporarily unavailable`,
            message: 'The game server may be starting up or temporarily down. Please try again in a few moments.',
            service: key,
            target: proxy.target
          });
        }
      }
    };

    const proxyMiddleware = createProxyMiddleware(proxyConfig);

    proxyInstances[proxy.path] = proxyMiddleware;
    app.use(proxy.path, proxyMiddleware);
  });
}

// Handle WebSocket upgrade requests for proxied game services
server.on('upgrade', (request, socket, head) => {
  const pathname = request.url || '';

  // Never interfere with Socket.IO's own upgrade handling
  if (pathname.startsWith('/socket.io')) {
    return; // Let socket.io's listener handle this entirely
  }

  // Check if this is a request for one of our proxied game services
  for (const [key, proxy] of Object.entries(gameProxies)) {
    if (pathname.startsWith(proxy.path)) {
      // Skip WebSocket upgrades for proxies that have ws disabled
      if (proxy.ws === false) {
        console.log(`🚫 [PROXY] Skipping WebSocket upgrade for ${proxy.path} (ws disabled)`);
        socket.destroy();
        return;
      }
      
      const proxyMiddleware = proxyInstances[proxy.path];
      if (proxyMiddleware && proxyMiddleware.upgrade) {
        try {
          // Attach error logging only for proxied sockets
          socket.on('error', (err) => {
            if (!isNavigationError(err)) {
              console.error('Server upgrade socket error:', err.message);
            }
          });
          // Let the proxy handle the WebSocket upgrade
          proxyMiddleware.upgrade(request, socket, head);
          return;
        } catch (err) {
          if (!isNavigationError(err)) {
            console.error(`WebSocket upgrade error for ${proxy.path}:`, err.message);
          }
          socket.destroy();
          return;
        }
      }
    }
  }
  
  // If not a proxy path, Socket.IO will handle its own upgrades
});

// Serve static files from React build
app.use(express.static(path.join(__dirname, '../client/build')));

// Serve static avatars
app.use('/avatars', express.static(path.join(__dirname, 'public/avatars')));

// Serve screenshots
app.use('/screenshots', express.static(path.join(__dirname, 'screenshots')));

// ===== NEW API ENDPOINTS =====

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const stats = connectionManager.getStats();
    const roomStats = await db.getRoomStats();
    
    const health = {
      status: 'healthy',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      connections: stats,
      rooms: roomStats,
      database: 'connected', // We'll test this
      timestamp: new Date().toISOString()
    };
    
    // Test database connection
    try {
      await db.adminClient.from('users').select('id').limit(1);
    } catch (dbError) {
      health.database = 'error';
      health.status = 'degraded';
      health.errors = [dbError.message];
    }
    
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Connection stats endpoint
app.get('/api/stats', (req, res) => {
  try {
    const stats = connectionManager.getStats();
    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// REMOVED: Old hardcoded games endpoint
// Now using dynamic database-driven endpoint from server/routes/games.js
// registered at line ~1743 as: app.use('/api/games', gamesRouter);

// ===== GAMEBUDDIES API FOR EXTERNAL GAMES =====

// Middleware for API key validation is provided by lib/validation

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
          name: p.custom_lobby_name || p.user?.display_name || 'Player',
          role: p.role,
          isReady: p.is_ready,
          status: p.is_connected ? 'connected' : 'disconnected',
          premiumTier: p.user?.premium_tier || 'free',
          avatarUrl: p.user?.avatar_url,
          avatarStyle: p.user?.avatar_style,
          avatarSeed: p.user?.avatar_seed,
          avatarOptions: p.user?.avatar_options
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

// Session verification endpoint - NO API key required (session token is the auth)
// Games call this to get authenticated player data
app.get('/api/game/session/:token', async (req, res) => {
  try {
    const { token } = req.params;

    console.log(`🔐 [API] Verifying game session token: ${token.substring(0, 8)}...`);

    // Get session data from database
    const { data: session, error } = await db.adminClient
      .from('game_sessions')
      .select(`
        *,
        room:rooms!room_id(
          id,
          room_code,
          current_game,
          status,
          settings,
          max_players,
          participants:room_members(
            user_id,
            role,
            is_connected,
            custom_lobby_name,
            user:users(username, display_name, premium_tier, avatar_url, avatar_style, avatar_seed, avatar_options)
          )
        )
      `)
      .eq('session_token', token)
      .single();

    if (error || !session) {
      console.log(`❌ [API] Session token not found: ${token.substring(0, 8)}...`);
      return res.status(401).json({
        valid: false,
        error: 'Invalid session token',
        code: 'INVALID_TOKEN'
      });
    }

    // Check if session is expired
    const now = new Date();
    const expiresAt = new Date(session.expires_at);
    if (now > expiresAt) {
      console.log(`❌ [API] Session token expired: ${token.substring(0, 8)}...`);
      return res.status(401).json({
        valid: false,
        error: 'Session expired',
        code: 'SESSION_EXPIRED',
        expiredAt: session.expires_at
      });
    }

    // Update last_accessed timestamp
    await db.adminClient
      .from('game_sessions')
      .update({ last_accessed: new Date().toISOString() })
      .eq('session_token', token);

    // Find the player's participant data
    const participant = session.room?.participants?.find(p => p.user_id === session.player_id);

    if (!participant) {
      console.log(`❌ [API] Player not found in room for session: ${token.substring(0, 8)}...`);
      return res.status(404).json({
        valid: false,
        error: 'Player not found in room',
        code: 'PLAYER_NOT_FOUND'
      });
    }

    console.log(`✅ [API] Session verified for player: ${participant.user?.username}`);

    // Return authenticated player data
    res.json({
      valid: true,
      session: {
        id: session.id,
        createdAt: session.created_at,
        expiresAt: session.expires_at,
        gameType: session.game_type,
        streamerMode: session.streamer_mode
      },
      player: {
        id: session.player_id,
        name: participant.custom_lobby_name || participant.user?.display_name || 'Player',
        username: participant.user?.username,
        displayName: participant.user?.display_name,
        customLobbyName: participant.custom_lobby_name,
        premiumTier: participant.user?.premium_tier || 'free',
        avatarUrl: participant.user?.avatar_url,
        avatarStyle: participant.user?.avatar_style,
        avatarSeed: participant.user?.avatar_seed,
        avatarOptions: participant.user?.avatar_options,
        isHost: participant.role === 'host',
        role: participant.role
      },
      room: {
        id: session.room?.id,
        code: session.streamer_mode ? null : session.room_code, // Hide room code in streamer mode
        gameType: session.room?.current_game,
        status: session.room?.status,
        maxPlayers: session.room?.max_players,
        settings: session.room?.settings,
        currentPlayers: session.room?.participants?.filter(p => p.is_connected === true).length || 0
      },
      participants: session.room?.participants
        ?.filter(p => p.is_connected === true)
        .map(p => ({
          id: p.user_id,
          name: p.custom_lobby_name || p.user?.display_name || 'Player',
          role: p.role,
          isHost: p.role === 'host',
          premiumTier: p.user?.premium_tier || 'free',
          avatarUrl: p.user?.avatar_url,
          avatarStyle: p.user?.avatar_style,
          avatarSeed: p.user?.avatar_seed,
          avatarOptions: p.user?.avatar_options
        })) || []
    });

  } catch (error) {
    console.error('❌ [API] Session verification error:', error);
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
        timestamp: savedState.created_at,
        roomVersion: Date.now()
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
    
    // Get current participant data (including role for host transfer logic)
    const { data: participant } = await db.adminClient
      .from('room_members')
      .select('user_id, role, in_game, current_location, is_connected')
      .eq('room_id', room.id)
      .eq('user_id', playerId)
      .single();
    
    if (!participant) {
      console.log(`❌ [API] Player not found in room: ${playerId}`);
      return res.status(404).json({ error: 'Player not found in room' });
    }
    
    console.log(`🔍 [API] Current participant status:`, {
      user_id: participant.user_id,
      role: participant.role,
      in_game: participant.in_game,
      current_location: participant.current_location,
      is_connected: participant.is_connected
    });
    
    // Debug room context (parallel COUNT queries)
    const [totalCount, connectedCount, inGameCount] = await Promise.all([
      db.adminClient
        .from('room_members')
        .select('user_id', { count: 'exact', head: true })
        .eq('room_id', room.id)
        .then(({ count }) => count),
      db.adminClient
        .from('room_members')
        .select('user_id', { count: 'exact', head: true })
        .eq('room_id', room.id)
        .eq('is_connected', true)
        .then(({ count }) => count),
      db.adminClient
        .from('room_members')
        .select('user_id', { count: 'exact', head: true })
        .eq('room_id', room.id)
        .eq('in_game', true)
        .then(({ count }) => count)
    ]);

    console.log(`🏠 [API DEBUG] Room context:`, {
      room_id: room.id,
      room_code: room.room_code,
      room_status: room.status,
      total_participants: totalCount,
      connected_participants: connectedCount,
      in_game_participants: inGameCount
    });
    
    // Determine new status based on input
    let updateData = {
      last_ping: new Date().toISOString(),
      game_data: gameData || null
    };
    
    // Handle different status types
    switch (status) {
      case 'connected': // Player connected to the external game instance
        updateData.is_connected = true;
        updateData.current_location = location || 'game'; // Default to 'game' as per documentation
        updateData.in_game = true; // Assume connected to game means in_game true
        if (location === 'lobby') { // Explicitly in lobby via external game
          updateData.current_location = 'lobby';
          updateData.in_game = false;
        }
        break;
        
          case 'disconnected': // Player disconnected from the external game
            // Room-level grace window: skip disconnects right after return-all
            try {
              const { data: roomMeta } = await db.adminClient
                .from('rooms')
                .select('metadata')
                .eq('room_code', roomCode)
                .single();
              const graceUntil = roomMeta?.metadata?.return_in_progress_until;
              if (graceUntil && new Date(graceUntil) > new Date()) {
                console.log(`⚠️ [API DEBUG] Skipping disconnect for ${playerId} due to active return_in_progress window`);
                break;
              }
            } catch (e) {
              console.warn('[API DEBUG] Grace window check failed (non-fatal):', e?.message || e);
            }
            // Guard: if this player was already in 'lobby' just before this call, don't downgrade
            try {
              const { data: prevParticipant } = await db.adminClient
                .from('room_members')
                .select('current_location')
                .eq('user_id', playerId)
                .eq('room_id', room.id)
                .single();
              if (prevParticipant && prevParticipant.current_location === 'lobby') {
                console.log(`⚠️ [API DEBUG] Skipping disconnect for ${playerId} due to existing lobby state`);
                // Short-circuit this player update; treat as success to avoid failing the whole op
                break;
              }
            } catch (e) {
              // Non-fatal: if guard lookup fails, proceed with disconnect
              console.warn('[API DEBUG] Disconnect guard (single) failed (non-fatal):', e?.message || e);
            }
            updateData.is_connected = false;
            updateData.current_location = 'disconnected';
            updateData.in_game = false;
            break;
        
      case 'returned_to_lobby': // Player explicitly returned to GameBuddies lobby by external game action
        updateData.is_connected = true;
        updateData.current_location = 'lobby';
        updateData.in_game = false;
        break;
        
      case 'in_game': // Player is actively in the external game
        updateData.is_connected = true;
        updateData.current_location = 'game';
        updateData.in_game = true;
        break;
        
      default: // Fallback for unknown status, treat as potentially disconnected or lobby
        updateData.is_connected = false; // Default to not connected for unknown status
        updateData.current_location = location || 'disconnected';
        updateData.in_game = false;
        console.warn(`⚠️ [API] Unknown status type received: '${status}'. Defaulting to disconnected.`);
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
    
    // Check if this player was the host before updating
    const wasHost = participant.role === 'host';
    const isDisconnecting = updateData.is_connected === false;
    
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
    
    // Handle host transfer if host disconnected via external game
    let newHost = null;
    if (wasHost && isDisconnecting) {
      console.log(`👑 [API] Host ${playerId} disconnected via external game - checking for host transfer`);
      
      // Get other connected players who could become host
      const { data: otherConnectedPlayers } = await db.adminClient
        .from('room_members')
        .select('user_id, user:users!inner(username, display_name), role, is_connected')
        .eq('room_id', room.id)
        .eq('is_connected', true)
        .neq('user_id', playerId);
      
      if (otherConnectedPlayers && otherConnectedPlayers.length > 0) {
        // Auto-transfer host to the first connected player
        newHost = await db.autoTransferHost(room.id, playerId);
        
        if (newHost) {
          console.log(`👑 [API] Host transferred from ${playerId} to ${newHost.user_id} (${newHost.user?.username || newHost.user?.display_name}) via external game disconnect`);
        } else {
          console.log(`❌ [API] Failed to transfer host from ${playerId}`);
        }
      } else {
        console.log(`⚠️ [API] Host ${playerId} disconnected but no other connected players - keeping host role`);
      }
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
    // Build consolidated players snapshot once for broadcast and status sync
    const allPlayers = updatedRoom.participants?.map(p => ({
      id: p.user_id,
      name: p.custom_lobby_name || p.user?.display_name || 'Player',
      isHost: p.role === 'host',
      isConnected: p.is_connected,
      inGame: p.in_game,
      currentLocation: p.current_location || (p.is_connected ? 'lobby' : 'disconnected'), // Provide default
      lastPing: p.last_ping,
      premiumTier: p.user?.premium_tier || 'free',
      avatarUrl: p.user?.avatar_url,
      avatarStyle: p.user?.avatar_style,
      avatarSeed: p.user?.avatar_seed,
      avatarOptions: p.user?.avatar_options,
      level: p.user?.level || 1,
      socketId: null
    })) || [];

    if (io) {
      
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
      const broadcastData = {
        playerId,
        status: updateData.current_location,
        reason,
        players: allPlayers,
        room: updatedRoom,
        source: 'external_game',
        timestamp: new Date().toISOString()
      };
      
      // Include host transfer information if it occurred
      if (newHost) {
        broadcastData.hostTransfer = {
          oldHostId: playerId,
          newHostId: newHost.user_id,
          newHostName: newHost.user?.display_name || 'Player',
          reason: 'external_game_disconnect'
        };
        console.log(`👑 [API] Including host transfer in broadcast:`, broadcastData.hostTransfer);
      }
      
      broadcastData.roomVersion = Date.now();
      io.to(roomCode).emit('playerStatusUpdated', broadcastData);
      
      // Confirm broadcast was sent
      console.log(`✅ [API DEBUG] Broadcast sent to ${io.sockets.adapter.rooms.get(roomCode)?.size || 0} connected clients`);
    } else {
      console.log(`⚠️ [API DEBUG] Socket.io not available - cannot broadcast status update`);
    }
    
    // Auto-update room status if this player is the host
    if (wasHost || participant.role === 'host') {
      console.log(`👑 [API] Player ${playerId} is host - checking for auto room status update`);
      autoUpdateRoomStatusByHost(room.id, playerId, updateData.current_location);
    }
    
    // Also check if this update should trigger a smart room status update
    // Get all players for analysis
    const allPlayersForAnalysis = updatedRoom.participants?.map(p => ({
      id: p.user_id,
      isHost: p.role === 'host',
      isConnected: p.is_connected,
      inGame: p.in_game,
      currentLocation: p.current_location
    })) || [];
    
    if (allPlayersForAnalysis.length > 1) {
      await autoUpdateRoomStatusBasedOnPlayerStates(updatedRoom, allPlayersForAnalysis, reason || 'player_status_change');
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
      .select('id, room_code, status, metadata')
      .eq('room_code', roomCode)
      .single();
    
    if (!room) {
      console.log(`❌ [API] Room not found: ${roomCode}`);
      return res.status(404).json({ error: 'Room not found' });
    }
    
    const results = [];
    const lobbyThisBatch = new Set(); // Track players moved to lobby in this bulk request
    
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

        // Guard against immediate regression to 'disconnected' after a lobby return
        // Use the preloaded roomParticipants snapshot taken before processing this bulk request
        try {
          const prevState = roomParticipants?.data?.find?.(p => p.user_id === playerId);
          if (status === 'disconnected' && prevState && prevState.current_location === 'lobby') {
            console.log(`⚠️ [API DEBUG] Skipping disconnect for ${playerId} due to recent lobby state`);
            results.push({ playerId, success: true, skipped: true, reason: 'recent_lobby_state' });
            continue; // Do not apply a downgrade to disconnected
          }
        } catch (guardErr) {
          console.warn('[API DEBUG] Disconnect guard check failed (non-fatal):', guardErr?.message || guardErr);
        }
        
        switch (status) {
      case 'connected': // Player connected to the external game instance
            updateData.is_connected = true;
        updateData.current_location = location || 'game'; // Default to 'game' as per documentation
        updateData.in_game = true; // Assume connected to game means in_game true
        if (location === 'lobby') { // Explicitly in lobby via external game
          updateData.current_location = 'lobby';
          updateData.in_game = false;
        }
            break;
            
          case 'disconnected': // Player disconnected from the external game
            // Global grace window after return-all: suppress disconnects briefly
            try {
              const graceUntil = room?.metadata?.return_in_progress_until;
              if (graceUntil && new Date(graceUntil) > new Date()) {
                console.log(`⚠️ [API DEBUG] Skipping disconnect for ${playerId} due to active return_in_progress window`);
                results.push({ playerId, success: true, skipped: true, reason: 'return_in_progress' });
                break;
              }
            } catch {}
            // If this same bulk request already returned this player to lobby, skip downgrade
            if (lobbyThisBatch.has(playerId)) {
              console.log(`⚠️ [API DEBUG] Skipping disconnect in same bulk for ${playerId} (already returned_to_lobby)`);
              results.push({ playerId, success: true, skipped: true, reason: 'already_returned_in_bulk' });
              break; // Skip applying disconnect
            }
            updateData.is_connected = false;
            updateData.current_location = 'disconnected';
            updateData.in_game = false;
            break;
            
          case 'returned_to_lobby': // Player explicitly returned to GameBuddies lobby by external game action
            updateData.is_connected = true;
            updateData.current_location = 'lobby';
            updateData.in_game = false;
            lobbyThisBatch.add(playerId);
            break;
            
          case 'in_game': // Player is actively in the external game
            updateData.is_connected = true;
            updateData.current_location = 'game';
            updateData.in_game = true;
            break;
            
          default: // Fallback for unknown status, treat as potentially disconnected or lobby
            updateData.is_connected = false; // Default to not connected for unknown status
            updateData.current_location = location || 'disconnected';
            updateData.in_game = false;
            console.warn(`⚠️ [API] Unknown status type received: '${status}'. Defaulting to disconnected.`);
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
    let updatedRoom = await db.getRoomByCode(roomCode);

    // If no host is currently assigned, and this bulk update returned at least one player to lobby,
    // promote the first such player to host so the lobby regains a GM promptly.
    try {
      const hasHost = Array.isArray(updatedRoom.participants) && updatedRoom.participants.some(p => p.role === 'host');
      if (!hasHost) {
        const lobbyReturnCandidate = results.find(r => r.success && r.updated && r.updated.status === 'lobby');
        if (lobbyReturnCandidate && lobbyReturnCandidate.playerId) {
          await db.adminClient
            .from('room_members')
            .update({ role: 'host' })
            .eq('room_id', room.id)
            .eq('user_id', lobbyReturnCandidate.playerId);

          await db.adminClient
            .from('rooms')
            .update({ host_id: lobbyReturnCandidate.playerId })
            .eq('id', room.id);

          console.log(`✅ [API DEBUG] Restored host to ${lobbyReturnCandidate.playerId} based on bulk returned_to_lobby`);
          // Refresh room snapshot after promotion
          const refreshedRoom = await db.getRoomByCode(roomCode);
          if (refreshedRoom) {
            updatedRoom = refreshedRoom;
          }
        }
      }
    } catch (e) {
      console.error('⚠️ [API DEBUG] Failed to restore host after bulk:', e?.message || e);
    }
    
    if (io) {
      const allPlayers = updatedRoom.participants?.map(p => ({
        id: p.user_id,
        name: p.custom_lobby_name || p.user?.display_name || 'Player',
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
        timestamp: new Date().toISOString(),
        roomVersion: Date.now()
      });
      
      // Confirm bulk broadcast was sent
      console.log(`✅ [API DEBUG] Bulk broadcast sent to ${io.sockets.adapter.rooms.get(roomCode)?.size || 0} connected clients`);
    } else {
      console.log(`⚠️ [API DEBUG] Socket.io not available - cannot broadcast bulk status update`);
    }
    
    // Auto-update room status based on player status changes
    await autoUpdateRoomStatusBasedOnPlayerStates(room, allPlayers, reason);
    
    // Also check host-specific updates (legacy behavior)
    const hostUpdates = allPlayers.filter(p => p.isHost);
    if (hostUpdates.length > 0) {
      const host = hostUpdates[0]; // Should only be one host
      console.log(`👑 [API] Host ${host.id} status updated in bulk - checking for auto room status update`);
      autoUpdateRoomStatusByHost(room.id, host.id, host.currentLocation);
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
        timestamp: new Date().toISOString(),
        roomVersion: Date.now()
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

// Helper function to automatically update room status based on host location
async function autoUpdateRoomStatusByHost(roomId, hostUserId, hostLocation) {
  try {
    console.log(`🤖 Checking if room status needs auto-update for host location change:`, {
      roomId,
      hostUserId,
      hostLocation
    });

    // Get current room
    const room = await db.getRoomById(roomId);
    if (!room) {
      console.log(`❌ Room ${roomId} not found for auto status update`);
      return;
    }

    // Determine target status based on host location
    let targetStatus = room.status; // Default to current status
    
    if (hostLocation === 'game' || hostLocation === 'in_game') {
      targetStatus = 'in_game';
    } else if (hostLocation === 'lobby' || hostLocation === 'connected') {
      targetStatus = 'lobby';
    } else if (hostLocation === 'disconnected') {
      // Don't change status when host disconnects - they might return
      console.log(`🔄 Host disconnected but keeping room status as '${room.status}'`);
      return;
    }

    // Only update if status needs to change
    if (room.status === targetStatus) {
      console.log(`🔄 Room ${room.room_code} already has correct status '${targetStatus}' for host location '${hostLocation}'`);
      return;
    }

    console.log(`🤖 Auto-updating room ${room.room_code} status from '${room.status}' to '${targetStatus}' due to host location: ${hostLocation}`);

    // Update room status in database
    const updateData = { status: targetStatus };
    
    // If changing back to lobby, also reset current game
    if (targetStatus === 'lobby') {
      updateData.current_game = null;
    }

    await db.updateRoom(roomId, updateData);

    // Get updated room data
    const updatedRoom = await db.getRoomById(roomId);
    
    // Find host participant for display name
    const hostParticipant = updatedRoom?.participants?.find(p => p.user_id === hostUserId);
    
    // Notify all players about the automatic status change
    io.to(room.room_code).emit('roomStatusChanged', {
      oldStatus: room.status,
      newStatus: targetStatus,
      room: updatedRoom,
      changedBy: `${hostParticipant?.user?.display_name || 'Host'} (auto)`,
      reason: 'host_location_change',
      isAutomatic: true,
      hostLocation: hostLocation,
      roomVersion: Date.now()
    });

    console.log(`🤖 Room ${room.room_code} status auto-updated to '${targetStatus}' due to host location change`);

  } catch (error) {
    console.error('❌ Error auto-updating room status by host location:', error);
  }
}

/**
 * Intelligently update room status based on overall player states
 * This provides more robust room status management than just checking the host
 */
async function autoUpdateRoomStatusBasedOnPlayerStates(room, allPlayers, reason) {
  try {
    console.log(`🧠 [Smart Room Update] Analyzing player states for room ${room.room_code}:`, {
      currentRoomStatus: room.status,
      totalPlayers: allPlayers.length,
      reason
    });

    // Analyze player states
    const playerStats = allPlayers.reduce((stats, player) => {
      const location = player.currentLocation || 'unknown';
      stats[location] = (stats[location] || 0) + 1;
      if (player.inGame) stats.inGameCount++;
      if (player.isConnected) stats.connectedCount++;
      return stats;
    }, { inGameCount: 0, connectedCount: 0 });

    console.log(`📊 [Smart Room Update] Player statistics:`, playerStats);

    let targetStatus = room.status; // Default to current status
    let shouldUpdate = false;
    let updateReason = '';

    // Determine target status based on player distribution
    if (reason === 'game_started' && room.status === 'lobby') {
      // Game explicitly started - if majority of players are in game, switch to in_game
      if (playerStats.inGameCount >= Math.ceil(allPlayers.length * 0.5)) {
        targetStatus = 'in_game';
        shouldUpdate = true;
        updateReason = 'Game started - majority of players in game';
      }
    } else if (reason === 'game_ended' && room.status === 'in_game') {
      // Game explicitly ended - if majority returned to lobby, switch to lobby
      const lobbyCount = playerStats.lobby || 0;
      if (lobbyCount >= Math.ceil(allPlayers.length * 0.5)) {
        targetStatus = 'lobby';
        shouldUpdate = true;
        updateReason = 'Game ended - majority of players returned to lobby';
      }
    } else if (room.status === 'lobby' && playerStats.game >= 2) {
      // Multiple players moved to game from lobby
      targetStatus = 'in_game';
      shouldUpdate = true;
      updateReason = 'Multiple players moved to active game';
    } else if (room.status === 'in_game' && (playerStats.lobby >= Math.ceil(allPlayers.length * 0.5))) {
      // Majority of players returned to lobby from game
      targetStatus = 'lobby';
      shouldUpdate = true;
      updateReason = 'Majority of players returned to lobby';
    } else if (reason === 'player_rejoined' && room.status === 'in_game') {
      // Player rejoined - check if we should transition to lobby
      const lobbyCount = playerStats.lobby || 0;
      const gameCount = playerStats.game || 0;
      const disconnectedCount = playerStats.disconnected || 0;
      
      // If no players are actively in game anymore, switch to lobby
      if (gameCount === 0 && lobbyCount > 0) {
        targetStatus = 'lobby';
        shouldUpdate = true;
        updateReason = 'All active players are in lobby after rejoin';
      }
    }

    if (shouldUpdate && targetStatus !== room.status) {
      console.log(`🔄 [Smart Room Update] Updating room ${room.room_code} status: ${room.status} → ${targetStatus}`);
      console.log(`📝 [Smart Room Update] Reason: ${updateReason}`);

      const updateData = { status: targetStatus };
      
      // If changing back to lobby, reset current game
      if (targetStatus === 'lobby') {
        updateData.current_game = null;
      }

      await db.updateRoom(room.id, updateData);

      // Get updated room data
      const updatedRoom = await db.getRoomById(room.id);
      
      // Notify all players about the automatic status change
      if (io) {
        io.to(room.room_code).emit('roomStatusChanged', {
          oldStatus: room.status,
          newStatus: targetStatus,
          room: updatedRoom,
          changedBy: 'System (Smart Update)',
          reason: 'player_state_analysis',
          isAutomatic: true,
          playerStats,
          updateReason,
          roomVersion: Date.now()
        });
      }

      console.log(`✅ [Smart Room Update] Room ${room.room_code} status updated to '${targetStatus}'`);
    } else {
      console.log(`⏸️ [Smart Room Update] No room status change needed for ${room.room_code}`);
    }

  } catch (error) {
    console.error('❌ Error in smart room status update:', error);
  }
}

// Initialize connection manager
const connectionManager = new ConnectionManager();
const lobbyManager = new LobbyManager(io, db, connectionManager);
const statusSyncManager = new StatusSyncManager(db, io, lobbyManager);

// Expose connectionManager to routes (for admin dashboard stats)
app.set('connectionManager', connectionManager);


// API routers
app.use('/api/v2/game', gameApiV2Router(io, db, connectionManager));
app.use(gameApiV2DDFRouter(io, db, connectionManager, lobbyManager, statusSyncManager));
app.use('/api/games', gamesRouter);
app.use('/api/auth', authRouter); // Auth endpoints
app.use('/api/friends', friendsRouter); // Friend system endpoints
app.use('/api/admin', adminRouter); // Admin endpoints
app.use('/api', authRouter); // Mount /users endpoint at /api/users
app.use('/api/avatars', avatarsRouter); // Mount avatars endpoint
console.log('🔌 [SERVER] Mounting Stripe API routes at /api/stripe');
app.use('/api/stripe', stripeRouter); // Stripe payment endpoints

// Clean up stale connections periodically
setInterval(() => {
  const cleaned = connectionManager.cleanupStaleConnections();
  if (cleaned.length > 0) {
    console.log(`🧹 Cleaned up ${cleaned.length} stale connections`);
  }
}, 60000); // Every minute

// In-memory state for Tug of War (simple, non-persistent)
const tugOfWarState = new Map(); // roomCode -> { position: 50, redWins: 0, blueWins: 0 }
const tugOfWarTeams = new Map(); // roomCode -> Map<playerId, 'red'|'blue'>
const roomActivityCache = new Map(); // roomCode -> timestamp (throttling DB updates)

io.on('connection', async (socket) => {
  console.log(`🔌 User connected: ${socket.id}`);
  
  // Store connection info
  connectionManager.addConnection(socket.id);

  // Chat Handler (Lobby)
  socket.on('chat:message', async (data) => {
    // Validate message exists and is a string
    if (!data.message || typeof data.message !== 'string') {
      return; // Silently ignore invalid messages
    }

    // Enforce message length limit (500 chars) and trim whitespace
    const message = data.message.trim().substring(0, 500);
    if (message.length === 0) {
      return; // Ignore empty messages
    }

    const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
    if (rooms.length > 0) {
      const roomCode = rooms[0];

      // [CHAT] Look up actual player name from database instead of trusting client
      // This ensures we use the proper name chain: custom_lobby_name || display_name || username
      const connection = connectionManager.getConnection(socket.id);
      let playerName = (data.playerName || 'Player').substring(0, 30); // Fallback to client-provided name

      if (connection?.userId && connection?.roomId) {
        try {
          const { data: participant } = await db.adminClient
            .from('room_members')
            .select('custom_lobby_name, user:users(display_name, username)')
            .eq('room_id', connection.roomId)
            .eq('user_id', connection.userId)
            .single();

          if (participant) {
            playerName = participant.custom_lobby_name
              || participant.user?.display_name
              || 'Player';
          }
        } catch (err) {
          // Fall back to client-provided name on error
          console.error('❌ [CHAT] Error looking up player name:', err.message);
        }
      }

      // Update DB activity (throttled to once per minute) to prevent cleanup
      const lastUpdate = roomActivityCache.get(roomCode) || 0;
      if (Date.now() - lastUpdate > 60000) {
        roomActivityCache.set(roomCode, Date.now());
        // Async update, fire and forget
        db.adminClient
          .from('rooms')
          .update({ last_activity: new Date().toISOString() })
          .eq('room_code', roomCode)
          .then(({ error }) => {
             if(error) console.error(`❌ Failed to update activity for room ${roomCode}:`, error);
          });
      }

      io.to(roomCode).emit('chat:message', {
        id: crypto.randomUUID(),
        playerName: playerName,
        message: message,
        timestamp: Date.now(),
        type: 'user'
      });
    }
  });

  // Minigame Handler (Lobby - Reflex)
  socket.on('minigame:click', (data) => {
    // Validate and bound score data to prevent fake scores
    const score = typeof data.score === 'number' ? Math.max(0, Math.min(data.score, 10000)) : 0;
    const time = typeof data.time === 'number' ? Math.max(0, Math.min(data.time, 60000)) : 0;
    const playerName = (data.playerName || 'Player').substring(0, 30);

    const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
    if (rooms.length > 0) {
      const roomCode = rooms[0];
      io.to(roomCode).emit('minigame:leaderboard-update', {
        playerId: data.playerId || socket.id,
        playerName: playerName,
        score: score,
        time: time
      });
    }
  });

  // Tug of War Handler (Lobby - Multiplayer)
  socket.on('tugOfWar:pull', (data) => {
    const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
    if (rooms.length > 0) {
      const roomCode = rooms[0];
      
      const playerConnection = connectionManager.getConnection(socket.id);
      const playerId = playerConnection?.userId;
      
      if (!playerId) return; // Must be an authenticated player in room
      
      let state = tugOfWarState.get(roomCode);
      if (!state) {
        state = { position: 50, redWins: 0, blueWins: 0 };
        tugOfWarState.set(roomCode, state);
      }

      let roomTeams = tugOfWarTeams.get(roomCode);
      if (!roomTeams) {
        roomTeams = new Map();
        tugOfWarTeams.set(roomCode, roomTeams);
      }

      let playerTeam = roomTeams.get(playerId);
      
      // Assign team if not assigned yet
      if (!playerTeam) {
        const redCount = Array.from(roomTeams.values()).filter(t => t === 'red').length;
        const blueCount = Array.from(roomTeams.values()).filter(t => t === 'blue').length;
        playerTeam = redCount <= blueCount ? 'red' : 'blue'; // Assign to smaller team
        roomTeams.set(playerId, playerTeam);
        console.log(`[TOW] Assigned ${playerId} to ${playerTeam} team in room ${roomCode}`);
      }

      // Move bar (Red < 50 < Blue)
      const moveAmount = 1.5; // Difficulty tuning
      if (playerTeam === 'red') state.position = Math.max(0, state.position - moveAmount);
      if (playerTeam === 'blue') state.position = Math.min(100, state.position + moveAmount);

      let winner = null;
      if (state.position <= 0) {
        state.redWins++;
        winner = 'red';
        state.position = 50; // Reset for next round
      } else if (state.position >= 100) {
        state.blueWins++;
        winner = 'blue';
        state.position = 50; // Reset for next round;
      }

      // Broadcast update to everyone (Global State)
      io.to(roomCode).emit('tugOfWar:update', {
        position: state.position,
        redWins: state.redWins,
        blueWins: state.blueWins,
        winner,
        pullTeam: playerTeam, // Who pulled
        teams: Object.fromEntries(roomTeams) // Full team list
      });

      // Tell the specific user their team (Private State)
      socket.emit('tugOfWar:yourTeam', { team: playerTeam });
    }
  });

  // Friend System: Identify User (Central Server Implementation)
  socket.on('user:identify', async (userId) => {
    if (!userId) return;
    
    // console.log(`👤 [Friends] User identified: ${userId} (socket ${socket.id})`);
    
    // Join user-specific room for targeting
    socket.join(`user:${userId}`);
    
    // Store userId on socket and connection manager
    socket.userId = userId;
    const conn = connectionManager.getConnection(socket.id);
    if (conn) conn.userId = userId;

    try {
      // 1. Fetch friends directly from DB
      const { data: friendships, error } = await db.adminClient
        .from('friendships')
        .select('friend_id, user_id')
        .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
        .eq('status', 'accepted');

      if (error) {
        console.error('❌ [Friends] Failed to fetch friends:', error);
        return;
      }

      // 2. Extract Friend IDs
      const friendIds = friendships.map(f => 
        f.user_id === userId ? f.friend_id : f.user_id
      );
      
      // 3. Notify online friends & Build online list
      const onlineFriends = [];

      for (const friendId of friendIds) {
        const friendRoom = `user:${friendId}`;
        // Check if any socket is in this room
        const room = io.sockets.adapter.rooms.get(friendRoom);
        const isOnline = room && room.size > 0;
        
        if (isOnline) {
          onlineFriends.push(friendId);
          // Notify this friend (User B) that User A is online
          io.to(friendRoom).emit('friend:online', { userId });
        }
      }

      // 4. Send online friends list to me
      socket.emit('friend:list-online', { onlineUserIds: onlineFriends });
      
    } catch (error) {
      console.error('Error in user:identify:', error);
    }
  });

  // Friend System: Game Invite
  socket.on('game:invite', (data) => {
    // Validate friendId exists and is a string
    if (!data?.friendId || typeof data.friendId !== 'string') {
      return; // Silently ignore invalid invites
    }

    console.log('📨 [SERVER] game:invite received:', data);
    // Forward invite to specific friend with sanitized data
    const forwardData = {
      roomId: sanitize.roomCode(data.roomId) || '',
      gameName: (data.gameName || '').substring(0, 50),
      gameThumbnail: (data.gameThumbnail || '').substring(0, 200),
      hostName: (data.hostName || 'Host').substring(0, 30),
      senderId: socket.userId
    };
    console.log('📨 [SERVER] Forwarding game:invite_received to user:', data.friendId, 'with data:', forwardData);
    io.to(`user:${data.friendId}`).emit('game:invite_received', forwardData);
  });

  // Handle heartbeat to keep connection active
  socket.on('heartbeat', async () => {
    const connection = connectionManager.getConnection(socket.id);
    if (connection) {
      // Update memory state
      connectionManager.updateConnection(socket.id, {});
      
      // Update Database (Throttle to once per minute to save DB writes)
      const now = Date.now();
      if (!connection.lastDBUpdate || now - connection.lastDBUpdate > 60000) {
        connection.lastDBUpdate = now;
        if (connection.userId && connection.roomId) {
          // Fire and forget DB update
          db.adminClient
            .from('room_members')
            .update({ last_ping: new Date().toISOString(), is_connected: true })
            .eq('user_id', connection.userId)
            .eq('room_id', connection.roomId)
            .then(({ error }) => {
               if(error) console.error(`❌ Failed to update heartbeat for ${connection.username}:`, error);
            });
        }
      }
    }
  });

  // Handle room creation
  socket.on('createRoom', async (data) => {
    try {
      // Validate input
      const validation = await validators.createRoom(data);
      if (!validation.isValid) {
        socket.emit('error', {
          message: validation.message,
          code: 'INVALID_INPUT'
        });
        return;
      }
      
      // Check rate limiting
      if (connectionManager.isRateLimited(socket.id, 'createRoom', rateLimits.createRoom.max)) {
        socket.emit('error', { 
          message: 'Too many room creation attempts. Please wait a moment.',
          code: 'RATE_LIMITED' 
        });
        return;
      }
      
      // Sanitize input
      const playerName = sanitize.playerName(data.playerName);
      const customLobbyName = data.customLobbyName ? sanitize.playerName(data.customLobbyName) : null;
      const streamerMode = data.streamerMode || false;
      const isPublic = data.isPublic !== undefined ? data.isPublic : true; // Default to public if not specified
      const supabaseUserId = data.supabaseUserId || null;

      console.log(`🏠 [SUPABASE] Creating room for ${playerName}`, {
        customLobbyName,
        streamerMode,
        isPublic,
        isAuthenticated: !!supabaseUserId,
        supabaseUserId
      });
      console.log(`🔍 [DEBUG] Socket ID: ${socket.id}`);

      let user;
      if (supabaseUserId) {
        // Authenticated user - get existing user from database
        console.log(`👤 [DEBUG] Getting authenticated user profile for Supabase ID:`, supabaseUserId);
        const { data: existingUser, error } = await db.adminClient
          .from('users')
          .select('*')
          .eq('id', supabaseUserId)
          .single();

        if (error || !existingUser) {
          console.error(`❌ [DEBUG] Failed to find authenticated user:`, error);
          socket.emit('error', {
            message: 'User account not found. Please try logging in again.',
            code: 'USER_NOT_FOUND'
          });
          return;
        }

        user = existingUser;
        console.log(`✅ [DEBUG] Authenticated user found:`, {
          id: user.id,
          username: user.username,
          premium_tier: user.premium_tier
        });
      } else {
        // Guest user - create temporary user profile
        console.log(`👤 [DEBUG] Creating guest user profile...`);
        user = await db.getOrCreateUser(
          `${socket.id}_${playerName}`, // Unique per connection to prevent conflicts
          playerName,
          playerName,
          { is_guest: true }
        );
        console.log(`✅ [DEBUG] Guest user created:`, { id: user.id, username: user.username });
      }

      // Create room in database
      console.log(`🏗️ [DEBUG] Creating room in database...`);
      const room = await db.createRoom({
        host_id: user.id,
        current_game: null, // Will be updated when game is selected
        status: 'lobby',
        is_public: isPublic,
        max_players: 30,
        streamer_mode: streamerMode,
        game_settings: {},
        metadata: {
          created_by_name: playerName,
          created_from: 'web_client',
          original_host_id: user.id // [HOST] Store original host for restoration after return-from-game
        }
      });
      console.log(`✅ [DEBUG] Room created:`, { 
        id: room.id, 
        room_code: room.room_code, 
        host_id: room.host_id
      });

      // Add creator as participant
      console.log(`👥 [DEBUG] Adding creator as participant...`);
      const participant = await db.addParticipant(room.id, user.id, socket.id, 'host', customLobbyName);
      console.log(`✅ [DEBUG] Participant added:`, {
        participant_id: participant.id,
        role: participant.role,
        custom_lobby_name: customLobbyName
      });

      // If client indicates they are the host and no host currently exists, promote them
      try {
        const clientIsHostHint = data && data.isHostHint === true;
        const roomHasHost = Array.isArray(room.participants) && room.participants.some(p => p.role === 'host');
        if (clientIsHostHint && !roomHasHost && user && user.id) {
          await db.adminClient
            .from('room_members')
            .update({ role: 'host' })
            .eq('room_id', room.id)
            .eq('user_id', user.id);

          await db.adminClient
            .from('rooms')
            .update({ host_id: user.id })
            .eq('id', room.id);

          userRole = 'host';
          console.log(`Promoted user ${user.id} to host based on client hint (room had no host)`);
        }
      } catch (e) {
        console.error('[REJOINING DEBUG] Failed to promote host from hint:', e?.message || e);
      }

      // Join socket room
      console.log(`🔗 [DEBUG] Joining socket room: ${room.room_code}`);
      socket.join(room.room_code);
      
      // Update connection tracking
      connectionManager.updateConnection(socket.id, {
        userId: user.id,
        username: playerName,
        roomId: room.id,
        roomCode: room.room_code
      });



      // Send success response
      socket.emit('roomCreated', {
        roomCode: room.room_code,
        isHost: true,
        room: {
          ...room,
          players: [{
            id: user.id,
            name: customLobbyName || user.display_name || playerName,
            isHost: true,
            isConnected: true,
            inGame: false,
            currentLocation: 'lobby',
            lastPing: new Date().toISOString(),
            premiumTier: user.premium_tier || 'free',
            avatarUrl: user.avatar_url,
            avatarStyle: user.avatar_style,
            avatarSeed: user.avatar_seed,
            avatarOptions: user.avatar_options,
            socketId: socket.id
          }]
        }
      });

      console.log(`🎉 [SUCCESS] Room ${room.room_code} created by ${playerName} using SUPABASE storage`);

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

  // Handle getting public rooms for browsing
  socket.on('getPublicRooms', async (data) => {
    try {
      console.log('🔍 [PUBLIC ROOMS] Fetching public rooms...', data);
      const { gameType } = data || {};

      // Query database for public rooms with host info and member counts
      let query = db.adminClient
        .from('rooms')
        .select(`
          id,
          room_code,
          status,
          current_game,
          max_players,
          created_at,
          metadata,
          streamer_mode,
          host:users!host_id(id, username, display_name, avatar_url, premium_tier, role, avatar_style, avatar_seed, avatar_options),
          members:room_members(
            id,
            is_connected,
            role,
            custom_lobby_name,
            last_ping,
            user:users(id, username, display_name, avatar_url, premium_tier, role, avatar_style, avatar_seed, avatar_options)
          )
        `)
        .eq('is_public', true)
        .in('status', ['lobby', 'in_game']);

      // Filter by game type if specified
      if (gameType && gameType !== 'all') {
        query = query.eq('current_game', gameType);
      }

      const { data: rooms, error } = await query
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('❌ [PUBLIC ROOMS] Database error:', error);
        throw error;
      }

      // Filter to only rooms with at least one recently active connected member
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const activeRooms = (rooms || []).filter(room => {
        const connectedMembers = room.members?.filter(m => m.is_connected) || [];
        // Also check that at least one member has pinged recently
        const recentlyActiveMembers = room.members?.filter(m =>
          m.is_connected && new Date(m.last_ping) > fiveMinutesAgo
        ) || [];
        return connectedMembers.length > 0 && recentlyActiveMembers.length > 0;
      });

      console.log(`✅ [PUBLIC ROOMS] Found ${activeRooms.length} active public rooms (filtered from ${(rooms || []).length})`);

      // Log filtered rooms for debugging
      if (rooms && rooms.length > activeRooms.length) {
        const filtered = rooms.filter(r => !activeRooms.includes(r));
        console.log(`🧹 [PUBLIC ROOMS] Filtered out ${filtered.length} stale rooms:`,
          filtered.map(r => r.room_code).join(', '));
      }
      socket.emit('publicRoomsList', { rooms: activeRooms });

    } catch (error) {
      console.error('❌ [PUBLIC ROOMS] Error:', error);
      socket.emit('error', {
        message: 'Failed to load public rooms. Please try again.',
        code: 'PUBLIC_ROOMS_ERROR'
      });
    }
  });

  // Handle socket room joining for listening only (used by return handler)
  socket.on('joinSocketRoom', (data) => {
    try {
      // Sanitize and validate room code
      const roomCode = sanitize.roomCode(data?.roomCode);
      if (!roomCode || roomCode.length !== 6) {
        return socket.emit('error', { message: 'Invalid room code', code: 'INVALID_ROOM_CODE' });
      }

      console.log(`🔗 [SOCKET ROOM] Joining socket room for listening: ${roomCode}`);
      socket.join(roomCode);
      console.log(`✅ [SOCKET ROOM] Successfully joined socket room ${roomCode} for listening`);
    } catch (error) {
      console.error('❌ [SOCKET ROOM] Error joining socket room:', error);
    }
  });

  // Handle room joining
  socket.on('joinRoom', async (data) => {
    try {
      // Validate input
      const validation = await validators.joinRoom(data);
      if (!validation.isValid) {
        socket.emit('error', {
          message: validation.message,
          code: 'INVALID_INPUT'
        });
        return;
      }
      
      // Check rate limiting
      if (connectionManager.isRateLimited(socket.id, 'joinRoom', rateLimits.joinRoom.max)) {
        socket.emit('error', { 
          message: 'Too many join attempts. Please wait a moment.',
          code: 'RATE_LIMITED' 
        });
        return;
      }
      
      // Sanitize input
      const playerName = sanitize.playerName(data.playerName);
      const customLobbyName = data.customLobbyName ? sanitize.playerName(data.customLobbyName) : null;
      const roomCode = sanitize.roomCode(data.roomCode);
      const supabaseUserId = data.supabaseUserId || null;

      console.log(`🚪 [JOIN] Join request:`, {
        playerName,
        roomCode,
        isAuthenticated: !!supabaseUserId,
        supabaseUserId
      });

      // Acquire connection lock to prevent race conditions
      if (!connectionManager.acquireLock(playerName, roomCode, socket.id)) {
        socket.emit('error', { 
          message: 'Another connection attempt is in progress. Please wait.',
          code: 'CONNECTION_IN_PROGRESS' 
        });
        return;
      }
      
      try {
        const debugData = {
          socketId: socket.id,
          playerName: playerName,
          roomCode: roomCode,
          timestamp: new Date().toISOString(),
          connectionCount: connectionManager.getStats().totalConnections
        };
        
        console.log(`🚪 [REJOINING DEBUG] Join request received:`, debugData);
        
        // Check if this is a potential rejoin scenario
        const existingConnection = connectionManager.getConnection(socket.id);
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

      // [ABANDON] Cancel any pending abandonment grace period when a player joins
      cancelAbandonmentGracePeriod(room.id, room.room_code);

      // [HOST] Cancel host transfer grace period if original host reconnects
      if (supabaseUserId) {
        const hostGracePeriodCancelled = cancelHostTransferGracePeriod(room.id, room.room_code, supabaseUserId);
        if (hostGracePeriodCancelled) {
          console.log(`👑 [HOST] Original host reconnected during grace period - preserving host status`);
        }
      }

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

      // [ABANDON] Quick check if this is a previous participant trying to rejoin an abandoned room
      // This check happens BEFORE the full participant lookup to allow previous participants to rejoin
      let isPreviousParticipant = false;
      if (room.status === 'abandoned') {
        // Check by supabaseUserId first (most reliable)
        if (supabaseUserId) {
          isPreviousParticipant = room.participants?.some(p => p.user_id === supabaseUserId) || false;
        }
        // Fallback: Check by name fields
        if (!isPreviousParticipant && data.playerName) {
          isPreviousParticipant = room.participants?.some(p =>
            p.user?.username === data.playerName ||
            p.user?.display_name === data.playerName ||
            p.custom_lobby_name === data.playerName
          ) || false;
        }
        if (isPreviousParticipant) {
          console.log(`🔄 [ABANDON] Previous participant ${data.playerName} rejoining abandoned room ${roomCode}`);
        }
      }

      console.log(`🔍 [REJOINING DEBUG] Creator check:`, {
        playerName: data.playerName,
        createdByName: room.metadata?.created_by_name,
        isOriginalCreator,
        isPreviousParticipant,
        roomStatus: room.status
      });

      // V2 Schema: Accept players when room status is 'lobby' or 'in_game', or if original creator/previous participant is rejoining
      if (room.status !== 'lobby' && room.status !== 'in_game' && !isOriginalCreator && !isPreviousParticipant) {
        console.log(`❌ [ABANDON] Room not accepting players:`, {
          status: room.status,
          isOriginalCreator,
          isPreviousParticipant
        });
        socket.emit('error', {
          message: `Room is ${room.status} and not accepting new players.`,
          code: 'ROOM_NOT_ACCEPTING',
          debug: {
            room_status: room.status,
            is_original_creator: isOriginalCreator,
            is_previous_participant: isPreviousParticipant
          }
        });
        return;
      }
      
      // Note: We no longer automatically reset in_game rooms to lobby when original creator rejoins
      // This allows players and GMs to join ongoing games
      
      // Check for existing participant (disconnected or connected) to handle rejoining
      // Enhanced matching: check user_id, username, display_name, AND custom_lobby_name
      let existingParticipant;
      let matchMethod = null;

      // Primary: Match by authenticated user ID (most reliable)
      if (supabaseUserId) {
        existingParticipant = room.participants?.find(p => p.user_id === supabaseUserId);
        if (existingParticipant) {
          matchMethod = 'supabaseUserId';
          console.log(`[REJOIN] ✅ Matched existing participant by supabaseUserId: ${supabaseUserId}`);
        }
      }

      // Fallback: Match by any name field (for guests or when auth ID not available/race condition)
      if (!existingParticipant && data.playerName) {
        existingParticipant = room.participants?.find(p =>
          p.user?.username === data.playerName ||
          p.user?.display_name === data.playerName ||
          p.custom_lobby_name === data.playerName
        );
        if (existingParticipant) {
          matchMethod = existingParticipant.user?.username === data.playerName ? 'username' :
                        existingParticipant.user?.display_name === data.playerName ? 'display_name' : 'custom_lobby_name';
          console.log(`[REJOIN] ✅ Matched existing participant by ${matchMethod}: ${data.playerName}`);
        }
      }

      // Additional fallback: Check if isHostHint is true and match the host
      if (!existingParticipant && data.isHostHint) {
        existingParticipant = room.participants?.find(p => p.role === 'host');
        if (existingParticipant) {
          matchMethod = 'isHostHint';
          console.log(`[REJOIN] ✅ Matched existing host participant via isHostHint`);
        }
      }

      if (!existingParticipant) {
        console.log(`[REJOIN] ⚠️ No existing participant found for playerName="${data.playerName}", supabaseUserId="${supabaseUserId}", will create new`);
      }

      console.log(`🔍 [REJOINING DEBUG] Checking for existing participant:`, {
        searchingFor: data.playerName,
        supabaseUserId: supabaseUserId || null,
        matchMethod,
        existingParticipant: existingParticipant ? {
          user_id: existingParticipant.user_id,
          username: existingParticipant.user?.username,
          display_name: existingParticipant.user?.display_name,
          custom_lobby_name: existingParticipant.custom_lobby_name,
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

        // [HOST] If original host reconnects after transfer, restore host status
        if (room.metadata?.original_host_id === existingParticipant.user_id && existingParticipant.role !== 'host') {
          const currentHostParticipant = room.participants?.find(p => p.role === 'host');
          if (currentHostParticipant && currentHostParticipant.user_id !== existingParticipant.user_id) {
            console.log(`👑 [HOST] Restoring host status to original host ${existingParticipant.user_id}`);
            // Demote current host
            await db.adminClient
              .from('room_members')
              .update({ role: 'player' })
              .eq('room_id', room.id)
              .eq('user_id', currentHostParticipant.user_id);
            // Promote original host
            await db.adminClient
              .from('room_members')
              .update({ role: 'host' })
              .eq('room_id', room.id)
              .eq('user_id', existingParticipant.user_id);
            // Update room's host_id
            await db.adminClient
              .from('rooms')
              .update({ host_id: existingParticipant.user_id })
              .eq('id', room.id);

            userRole = 'host';

            // Broadcast host restoration
            io.to(room.room_code).emit('hostTransferred', {
              oldHostId: currentHostParticipant.user_id,
              newHostId: existingParticipant.user_id,
              newHostName: existingParticipant.user?.display_name || 'Player' || data.playerName,
              reason: 'original_host_returned',
              roomVersion: Date.now()
            });
            console.log(`👑 [HOST] Host restoration completed:`, {
              oldHostId: currentHostParticipant.user_id,
              newHostId: existingParticipant.user_id
            });
          }
        }

        // Clean up any existing connections for this user before creating new one
        const userConnections = connectionManager.getUserConnections(existingParticipant.user_id)
          .filter(conn => conn.socketId !== socket.id);
        
        userConnections.forEach(staleConn => {
          console.log(`🧹 [CLEANUP] Removing stale connection for user ${existingParticipant.user_id}: ${staleConn.socketId}`);
          connectionManager.removeConnection(staleConn.socketId);
        });
        
        // Update connection tracking with the ORIGINAL user ID IMMEDIATELY
        connectionManager.updateConnection(socket.id, {
          userId: existingParticipant.user_id,
          username: playerName,
          roomId: room.id,
          roomCode: roomCode
        });
          console.log(`🔗 [REJOINING DEBUG] Updated connection tracking with original user ID:`, {
            socketId: socket.id,
            userId: existingParticipant.user_id, // Original user ID
            roomId: room.id,
            username: playerName,
            playerRole: existingParticipant.role
          });
        
        // Update connection status for existing participant (set to connected with new socket)
        await db.updateParticipantConnection(existingParticipant.user_id, socket.id, 'connected', customLobbyName);
        console.log(`✅ [REJOINING DEBUG] Updated existing participant connection status to connected with custom lobby name:`, customLobbyName);
        
        // Auto-update room status if this reconnecting user is the host
        if (existingParticipant.role === 'host') {
          console.log(`👑 [REJOINING DEBUG] Reconnecting host - checking for auto room status update`);
          autoUpdateRoomStatusByHost(room.id, existingParticipant.user_id, 'lobby');
        }
        
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
        if (supabaseUserId) {
          // Authenticated user - get existing user from database
          console.log(`👤 [REJOINING DEBUG] Getting authenticated user profile for Supabase ID:`, supabaseUserId);
          const { data: existingUser, error } = await db.adminClient
            .from('users')
            .select('*')
            .eq('id', supabaseUserId)
            .single();

          if (error || !existingUser) {
            console.error(`❌ [REJOINING DEBUG] Failed to find authenticated user:`, error);
            socket.emit('error', {
              message: 'User account not found. Please try logging in again.',
              code: 'USER_NOT_FOUND'
            });
            return;
          }

          user = existingUser;
          console.log(`✅ [REJOINING DEBUG] Authenticated user found:`, {
            id: user.id,
            username: user.username,
            premium_tier: user.premium_tier
          });
        } else {
          // Guest user - create temporary user profile
          console.log(`👤 [REJOINING DEBUG] Getting/creating guest user profile...`);
          user = await db.getOrCreateUser(
            `${socket.id}_${data.playerName}`, // Unique per connection to prevent conflicts
            data.playerName,
            data.playerName
          );
          console.log(`✅ [REJOINING DEBUG] Guest user profile:`, {
            id: user.id,
            username: user.username,
            external_id: user.external_id
          });
        }
        
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
        console.log(`👥 [REJOINING DEBUG] Adding new participant with role: ${userRole}${customLobbyName ? `, custom name: ${customLobbyName}` : ''}`);
        await db.addParticipant(room.id, user.id, socket.id, userRole, customLobbyName);
        
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
        const userConnections = connectionManager.getUserConnections(user.id)
          .filter(conn => conn.socketId !== socket.id);
        
        userConnections.forEach(staleConn => {
          console.log(`🧹 [CLEANUP] Removing stale connection for user ${user.id}: ${staleConn.socketId}`);
          connectionManager.removeConnection(staleConn.socketId);
        });
        
        // Update connection tracking
        connectionManager.updateConnection(socket.id, {
          userId: user.id,
          username: playerName,
          roomId: room.id,
          roomCode: roomCode
        });
        console.log(`🔗 [REJOINING DEBUG] Updated connection tracking:`, {
          socketId: socket.id,
          userId: user.id,
          roomId: room.id,
          username: user.username,
          playerRole: userRole
        });
      }

      // Join socket room
      console.log(`🔗 [REJOINING DEBUG] Joining socket room: ${data.roomCode}`);
      socket.join(data.roomCode);



      // Get updated room data
      console.log(`🔄 [REJOINING DEBUG] Fetching updated room data...`);
      const updatedRoom = await db.getRoomByCode(data.roomCode);
      
      // Prepare player list - include ALL participants with their status
      const players = updatedRoom.participants?.map(p => ({
          id: p.user_id,
          name: p.custom_lobby_name || p.user?.display_name || 'Player',
          isHost: p.role === 'host',
          isConnected: p.is_connected,
          inGame: p.in_game,
          currentLocation: p.current_location || (p.is_connected ? 'lobby' : 'disconnected'),
          lastPing: p.last_ping,
          premiumTier: p.user?.premium_tier || 'free',
          role: p.user?.role || 'user',
          avatarUrl: p.user?.avatar_url,
          avatarStyle: p.user?.avatar_style,
          avatarSeed: p.user?.avatar_seed,
          avatarOptions: p.user?.avatar_options,
          level: p.user?.level || 1,
          socketId: null // Socket IDs are tracked in activeConnections, not stored in DB
      })) || [];

      console.log(`👥 [REJOINING DEBUG] Final player list:`, players);

      // Notify all players in room
      const isHost = userRole === 'host';
      const joinEventData = {
        player: {
          id: user.id,
          name: customLobbyName || user.display_name || data.playerName,
          isHost: isHost,
          premiumTier: user.premium_tier || 'free',
          role: user.role || 'user',
          avatarUrl: user.avatar_url,
          avatarStyle: user.avatar_style,
          avatarSeed: user.avatar_seed,
          avatarOptions: user.avatar_options,
          level: user.level || 1,
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
      
      io.to(data.roomCode).emit('playerJoined', { ...joinEventData, roomVersion: Date.now() });

      // Send success response to joining player
      const joinSuccessData = {
        roomCode: data.roomCode,
        isHost: isHost,
        players: players,
        room: updatedRoom,
        roomVersion: Date.now()
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
      
      // Auto-update room status based on player states after rejoin
      // This ensures room properly transitions back to lobby when players return from games
      if (updatedRoom.status === 'in_game') {
        console.log(`🔄 [REJOINING] Checking if room should return to lobby after player rejoin`);
        await autoUpdateRoomStatusBasedOnPlayerStates(updatedRoom, players, 'player_rejoined');
      }

      } catch (error) {
        console.error('❌ [REJOINING ERROR] Room join/rejoin failed:', {
          error: error.message,
          stack: error.stack,
          socketId: socket.id,
          playerName: playerName,
          roomCode: roomCode,
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
      } finally {
        // Always release the lock
        connectionManager.releaseLock(playerName, roomCode);
      }
    } catch (error) {
      // Outer catch for validation errors
      console.error('❌ [JOIN ROOM ERROR] Validation or setup error:', error);
      socket.emit('error', { 
        message: 'Invalid request data',
        code: 'VALIDATION_ERROR'
      });
    }
  });

  // Handle game selection
  socket.on('selectGame', async (data) => {
    try {
      const connection = connectionManager.getConnection(socket.id);
      console.log(`🎮 [DEBUG] Game selection from socket: ${socket.id}`);
      console.log(`🎮 [DEBUG] Connection data:`, {
        userId: connection?.userId,
        roomId: connection?.roomId
      });

      if (!connection?.roomId) {
        socket.emit('error', { message: 'Not in a room', code: 'NOT_IN_ROOM' });
        return;
      }

      // Validate gameType and roomCode using existing validator
      const validation = await validators.selectGame({
        roomCode: connection.roomCode || 'AAAAAA', // roomCode needed for validation schema
        gameType: data?.gameType
      });

      if (!validation.isValid) {
        return socket.emit('error', { message: validation.message, code: 'INVALID_INPUT' });
      }

      // Sanitize game settings to prevent prototype pollution
      const cleanSettings = sanitize.gameSettings(data?.settings || {});

      // Update room with selected game
      const updatedRoom = await db.updateRoom(connection.roomId, {
        current_game: validation.value.gameType,
        game_settings: cleanSettings
      });

      // Notify all players in room
      io.to(updatedRoom.room_code).emit('gameSelected', {
        gameType: validation.value.gameType,
        settings: cleanSettings,
        roomVersion: Date.now()
      });

      console.log(`🎮 Game selected: ${validation.value.gameType} for room ${updatedRoom.room_code}`);

    } catch (error) {
      console.error('❌ Error selecting game:', error);
      socket.emit('error', { message: 'Failed to select game', code: 'SELECT_GAME_ERROR' });
    }
  });

  // Handle game start
  socket.on('startGame', async (data) => {
    console.log(`🚀 [START GAME SERVER] ============ START GAME EVENT RECEIVED ============`);
    console.log(`🚀 [START GAME SERVER] Socket ID: ${socket.id}`);
    console.log(`🚀 [START GAME SERVER] Event data:`, data);
    console.log(`🚀 [START GAME SERVER] Timestamp:`, new Date().toISOString());
    
    try {
      const connection = connectionManager.getConnection(socket.id);
              console.log(`🚀 [START GAME SERVER] Connection lookup:`, {
          socketId: socket.id,
          hasConnection: !!connection,
          userId: connection?.userId,
          roomId: connection?.roomId,
          totalActiveConnections: connectionManager.getStats().totalConnections
        });
        
        const allConnections = Array.from(connectionManager.activeConnections.entries());
        console.log(`🚀 [START GAME SERVER] All active connections:`, allConnections.map(([socketId, conn]) => ({
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

      // Mark all connected participants as in_game and in 'game' location (BATCHED)
      const connectedParticipants = room.participants?.filter(p => p.is_connected === true) || [];
      const connectedUserIds = connectedParticipants.map(p => p.user_id);

      if (connectedUserIds.length > 0) {
        await db.adminClient
          .from('room_members')
          .update({
            in_game: true,
            current_location: 'game'
          })
          .eq('room_id', room.id)
          .in('user_id', connectedUserIds);
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

      // Check if room is in streamer mode
      const isStreamerMode = room.streamer_mode || false;

      // ALWAYS generate secure session tokens for ALL players (not just streamer mode)
      const crypto = require('crypto');
      const sessionTokens = {};
      const sessionInserts = [];

      // Generate all session tokens and prepare batch insert data
      for (const participant of participants) {
        const sessionToken = crypto.randomBytes(32).toString('hex');
        sessionTokens[participant.user_id] = sessionToken;

        sessionInserts.push({
          session_token: sessionToken,
          room_id: room.id,
          room_code: room.room_code,
          player_id: participant.user_id,
          game_type: room.current_game,
          streamer_mode: isStreamerMode,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hour expiration
          metadata: {
            player_name: participant.custom_lobby_name || participant.user?.display_name || 'Player',
            is_host: participant.role === 'host',
            total_players: participants.length,
            premium_tier: participant.user?.premium_tier || 'free',
            avatar_url: participant.user?.avatar_url,
            avatar_style: participant.user?.avatar_style,
            avatar_seed: participant.user?.avatar_seed,
            avatar_options: participant.user?.avatar_options
          }
        });

        console.log(`🔐 [SECURE SESSION] Generated session token for ${participant.user?.username}:`, sessionToken.substring(0, 8) + '...');
      }

      // Batch insert all session tokens in single query
      if (sessionInserts.length > 0) {
        const { error: sessionInsertError } = await db.adminClient
          .from('game_sessions')
          .insert(sessionInserts);

        if (sessionInsertError) {
          console.error(`❌ [SECURE SESSION] Failed to batch insert sessions:`, sessionInsertError);
        } else {
          console.log(`✅ [SECURE SESSION] Batch inserted ${sessionInserts.length} session tokens`);
        }
      }

      participants.forEach(p => {
        // SECURE: Only pass session token - games must call API to get player data
        const sessionToken = sessionTokens[p.user_id];
        const roleParam = p.role === 'host' ? '&role=gm' : '';

        // Simple secure URL - only session token + role
        const gameUrl = `${gameProxy.path}?session=${sessionToken}${roleParam}`;

        console.log(`🔐 [SECURE URL] Game URL for ${p.user?.username} - session-based authentication`);
        
        const delay = p.role === 'host' ? 0 : 2000; // 2 second delay for players
        
        // Find the MOST RECENT socket ID for this user from connectionManager
        const userConnections = connectionManager.getUserConnections(p.user_id);
        
        // Get the most recent connection (they're already sorted by activity)
        const userConnection = userConnections.length > 0 ? userConnections[0] : null;
        
        const currentSocketId = userConnection ? userConnection.socketId : null;
        
        console.log(`🚀 [START GAME DEBUG] Sending game event to ${p.user?.username}:`, {
          user_id: p.user_id,
          role: p.role,
          username: p.user?.username,
          is_connected: p.is_connected,
          hasUserConnection: !!userConnection,
          totalUserConnections: userConnections.length,
          allUserSocketIds: userConnections.map(conn => conn.socketId), 
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
            roomCode: room.room_code,
            roomVersion: Date.now()
          });
          }, delay);
        } else {
          console.error(`❌ [START GAME DEBUG] No socket connection found for ${p.user?.username} (${p.user_id})`);
          const allConnections = Array.from(connectionManager.activeConnections.entries());
          console.error(`❌ [START GAME DEBUG] ActiveConnections dump:`, allConnections.map(([socketId, conn]) => ({
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
      const connection = connectionManager.getConnection(socket.id);
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
          name: p.custom_lobby_name || p.user?.display_name || 'Player',
          isHost: p.role === 'host',
          isConnected: p.is_connected,
          inGame: p.in_game,
          currentLocation: p.current_location || (p.is_connected ? 'lobby' : 'disconnected'),
          lastPing: p.last_ping,
          premiumTier: p.user?.premium_tier || 'free',
          role: p.user?.role || 'user',
          avatarUrl: p.user?.avatar_url,
          avatarStyle: p.user?.avatar_style,
          avatarSeed: p.user?.avatar_seed,
          avatarOptions: p.user?.avatar_options,
          level: p.user?.level || 1,
          socketId: null // Socket IDs are tracked in activeConnections, not stored in DB
        })) || [];

        // Send appropriate events based on whether host was transferred
        if (newHost) {
          // Send host transfer event first
      io.to(data.roomCode).emit('hostTransferred', {
        oldHostId: connection.userId,
        newHostId: newHost.user_id,
        newHostName: newHost.user?.display_name || 'Player',
        reason: 'original_host_left',
        players: allPlayers,
        room: updatedRoom,
        roomVersion: Date.now()
      });
          console.log(`👑 [LEAVE] Instantly transferred host to ${newHost.user?.display_name || 'Player'}`);
        }

        // Then send player left event
      io.to(data.roomCode).emit('playerLeft', {
        playerId: connection.userId,
        players: allPlayers,
        room: updatedRoom,
        wasHost: isLeavingHost,
        roomVersion: Date.now()
      });

        // If no connected players left, mark room as abandoned
        const connectedPlayers = allPlayers.filter(p => p.isConnected);
        if (connectedPlayers.length === 0) {
          console.log(`🏚️ [CLEANUP] Room ${data.roomCode} marked as abandoned - no connected players`);
          await db.updateRoom(connection.roomId, {
            status: 'abandoned'
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

  // Return-to-lobby logic removed\r
  // Handle individual player return to lobby
  socket.on('playerReturnToLobby', async (data) => {
    try {
      console.log(`🔄 Player returning to lobby: ${data.playerName} in room ${data.roomCode}`);
      
      const connection = connectionManager.getConnection(socket.id);
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
        room: updatedRoom,
        roomVersion: Date.now()
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
      
      const connection = connectionManager.getConnection(socket.id);
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
        name: p.custom_lobby_name || p.user?.display_name || 'Player',
        isHost: p.role === 'host',
        isConnected: p.is_connected,
        inGame: p.in_game,
        currentLocation: p.current_location || (p.is_connected ? 'lobby' : 'disconnected'),
        lastPing: p.last_ping,
        premiumTier: p.user?.premium_tier || 'free',
        role: p.user?.role || 'user',
        avatarUrl: p.user?.avatar_url,
        avatarStyle: p.user?.avatar_style,
        avatarSeed: p.user?.avatar_seed,
        avatarOptions: p.user?.avatar_options,
        level: p.user?.level || 1,
        socketId: null
      })) || [];

      // Notify all players about the host change
      io.to(data.roomCode).emit('hostTransferred', {
        oldHostId: connection.userId,
        newHostId: data.targetUserId,
        newHostName: targetParticipant.user?.display_name || 'Player',
        players: allPlayers,
        room: updatedRoom,
        roomVersion: Date.now()
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
      
      const connection = connectionManager.getConnection(socket.id);
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
      const targetConnections = connectionManager.getUserConnections(data.targetUserId);
      const targetConnection = targetConnections[0];

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
          kickedBy: currentParticipant.user?.display_name || 'Player',
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
        name: p.custom_lobby_name || p.user?.display_name || 'Player',
        isHost: p.role === 'host',
        isConnected: p.is_connected,
        inGame: p.in_game,
        currentLocation: p.current_location || (p.is_connected ? 'lobby' : 'disconnected'),
        lastPing: p.last_ping,
        premiumTier: p.user?.premium_tier || 'free',
        role: p.user?.role || 'user',
        avatarUrl: p.user?.avatar_url,
        avatarStyle: p.user?.avatar_style,
        avatarSeed: p.user?.avatar_seed,
        avatarOptions: p.user?.avatar_options,
        level: p.user?.level || 1,
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
        targetName: targetParticipant.user?.display_name || 'Player',
        kickedBy: currentParticipant.user?.display_name || 'Player',
        players: allPlayers, // Send complete player data
        room: updatedRoom, // Also send updated room data
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
      
      const connection = connectionManager.getConnection(socket.id);
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
        changedBy: participant.user?.display_name || 'Player',
        roomVersion: Date.now()
      });

      console.log(`🔄 Room ${room.room_code} status changed from '${room.status}' to '${data.newStatus}' by ${participant.user?.display_name}`);

    } catch (error) {
      console.error('❌ Error changing room status:', error);
      socket.emit('error', { message: 'Failed to change room status' });
    }
  });

  // Handle automatic room status updates based on host location
  socket.on('autoUpdateRoomStatus', async (data) => {
    try {
      console.log(`🤖 Auto-updating room status: ${data.newStatus} for room ${data.roomCode} (reason: ${data.reason})`);
      
      const connection = connectionManager.getConnection(socket.id);
      if (!connection?.roomId || !connection?.userId) {
        console.log(`❌ Auto status update failed: socket not in room`);
        return; // Don't emit error, just log
      }

      // Get room and verify user is host
      const room = await db.getRoomByCode(data.roomCode);
      if (!room) {
        console.log(`❌ Auto status update failed: room ${data.roomCode} not found`);
        return;
      }

      // Check if user is host (only host can trigger auto updates)
      const participant = room.participants?.find(p => p.user_id === connection.userId);
      if (!participant || participant.role !== 'host') {
        console.log(`❌ Auto status update failed: user ${connection.userId} is not host`);
        return;
      }

      // Map client status to server status values
      let serverStatus = data.newStatus;
      if (data.newStatus === 'waiting_for_players') {
        serverStatus = 'lobby';
      } else if (data.newStatus === 'in_game') {
        serverStatus = 'in_game';
      }

      // Don't update if status is already correct
      if (room.status === serverStatus) {
        console.log(`🔄 Auto status update skipped: room ${data.roomCode} already has status '${serverStatus}'`);
        return;
      }

      // Validate the new status - V2 Schema
      const validStatuses = ['lobby', 'in_game', 'returning'];
      if (!validStatuses.includes(serverStatus)) {
        console.log(`❌ Auto status update failed: invalid status '${serverStatus}'`);
        return;
      }

      // Update room status in database
      const updateData = { status: serverStatus };
      
      // If changing back to lobby, also reset current game
      if (serverStatus === 'lobby') {
        updateData.current_game = null;
      }

      await db.updateRoom(room.id, updateData);

      // Get updated room data
      const updatedRoom = await db.getRoomByCode(data.roomCode);
      
      // Notify all players about the automatic status change
      io.to(data.roomCode).emit('roomStatusChanged', {
        oldStatus: room.status,
        newStatus: serverStatus,
        room: updatedRoom,
        changedBy: `${participant.user?.display_name || 'Player'} (auto)`,
        reason: data.reason,
        isAutomatic: true,
        roomVersion: Date.now()
      });

      console.log(`🤖 Room ${room.room_code} status auto-changed from '${room.status}' to '${serverStatus}' by ${participant.user?.display_name} (reason: ${data.reason})`);

    } catch (error) {
      console.error('❌ Error auto-updating room status:', error);
      // Don't emit error to client - this is automatic and shouldn't interrupt user flow
    }
  });

  // Handle profile updates (avatar, display name changes from lobby)
  socket.on('profile_updated', async (data) => {
    try {
      // Sanitize room code
      const roomCode = sanitize.roomCode(data?.roomCode);
      if (!roomCode || roomCode.length !== 6) {
        return; // Silently ignore invalid room codes
      }

      // Validate userId exists
      if (!data?.userId || typeof data.userId !== 'string') {
        return;
      }

      // Sanitize all string fields
      const sanitizedData = {
        userId: data.userId,
        displayName: (data.displayName || '').substring(0, 30),
        avatarUrl: (data.avatarUrl || '').substring(0, 500),
        avatarStyle: (data.avatarStyle || '').substring(0, 50),
        avatarSeed: (data.avatarSeed || '').substring(0, 100),
        // Sanitize avatarOptions to prevent prototype pollution
        avatarOptions: sanitize.gameSettings(data.avatarOptions || {})
      };

      console.log(`👤 [PROFILE] Profile update received for user ${sanitizedData.userId} in room ${roomCode}`);

      // Broadcast to all users in the room
      io.to(roomCode).emit('profile_updated', sanitizedData);

      console.log(`👤 [PROFILE] Broadcasted profile update to room ${roomCode}`);
    } catch (error) {
      console.error('❌ Error broadcasting profile update:', error);
    }
  });

  // Handle disconnection
  socket.on('disconnect', async () => {
    try {
      console.log(`🔌 User disconnected: ${socket.id}`);
      
      // Get and remove connection from manager
      const connection = connectionManager.removeConnection(socket.id);
      if (connection?.userId) {
        // Friend System: Notify friends of disconnection (Central Server Implementation)
        try {
          const { data: friendships } = await db.adminClient
            .from('friendships')
            .select('friend_id, user_id')
            .or(`user_id.eq.${connection.userId},friend_id.eq.${connection.userId}`)
            .eq('status', 'accepted');

          if (friendships) {
            const friendIds = friendships.map(f => 
              f.user_id === connection.userId ? f.friend_id : f.user_id
            );
            for (const friendId of friendIds) {
              io.to(`user:${friendId}`).emit('friend:offline', { userId: connection.userId });
            }
          }
        } catch (e) { console.error('❌ Error broadcasting friend offline status:', e); }

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

        // Auto-update room status if this user is the host
        if (isDisconnectingHost && connectionStatus && room) {
          autoUpdateRoomStatusByHost(room.id, connection.userId, connectionStatus);
        }

        // [HOST] Handle host disconnect with grace period (allows host to reconnect before transfer)
        let newHost = null;
        if (isDisconnectingHost && room) {
          // Only start grace period if there are other connected players
          const otherConnectedPlayers = room.participants?.filter(p =>
            p.user_id !== connection.userId && p.is_connected === true
          ) || [];

          if (otherConnectedPlayers.length > 0) {
            // [HOST] Start grace period instead of immediate transfer
            console.log(`⏳ [HOST] Host ${connection.userId} disconnected - starting grace period before transfer`);
            console.log(`⏳ [HOST] Other connected players available:`,
              otherConnectedPlayers.map(p => ({
                user_id: p.user_id,
                username: p.user?.username,
                is_connected: p.is_connected,
                joined_at: p.joined_at
              }))
            );
            startHostTransferGracePeriod(room.id, room.room_code, connection.userId);
            // Don't set newHost - no immediate transfer
          } else {
            console.log(`⚠️ [HOST] Host disconnected but no other connected players - keeping host role`);
          }
        }

        // If in a room, notify other players about disconnection with updated player list
        if (connection.roomId && room) {
          // Get updated room data to send complete player list
          const updatedRoom = await db.getRoomById(connection.roomId);
          const allPlayers = updatedRoom?.participants?.map(p => ({
            id: p.user_id,
            name: p.custom_lobby_name || p.user?.display_name || 'Player',
            isHost: p.role === 'host',
            isConnected: p.is_connected,
            inGame: p.in_game,
            currentLocation: p.current_location || (p.is_connected ? 'lobby' : 'disconnected'),
            lastPing: p.last_ping,
            premiumTier: p.user?.premium_tier || 'free',
            role: p.user?.role || 'user',
            avatarUrl: p.user?.avatar_url,
            avatarStyle: p.user?.avatar_style,
            avatarSeed: p.user?.avatar_seed,
            avatarOptions: p.user?.avatar_options,
            level: p.user?.level || 1,
            socketId: null
          })) || [];

          // Send host transfer event first if host was transferred
          if (newHost) {
          io.to(room.room_code).emit('hostTransferred', {
            oldHostId: connection.userId,
            newHostId: newHost.user_id,
            newHostName: newHost.user?.display_name || 'Player',
            reason: 'original_host_disconnected',
            players: allPlayers,
            room: updatedRoom,
            roomVersion: Date.now()
          });
          }

          // Then send player disconnected event
          socket.to(room.room_code).emit('playerDisconnected', {
            playerId: connection.userId,
            wasHost: isDisconnectingHost,
            players: allPlayers,
            room: updatedRoom,
            roomVersion: Date.now()
          });

          // Check if room is now empty (no connected players) - start grace period instead of immediate abandonment
          const connectedPlayers = updatedRoom?.participants?.filter(p => p.is_connected) || [];
          if (connectedPlayers.length === 0) {
            // [ABANDON] Start grace period instead of immediate abandonment
            // This allows time for players to reconnect after returning from a game
            console.log(`⏳ [ABANDON] Room ${room.room_code} has no connected players - starting grace period`);
            startAbandonmentGracePeriod(room.id, room.room_code);
          }
        }
      }

      // Remove from active connections
      // Connection already removed by connectionManager.removeConnection(socket.id) above

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

// Generate invite token for streamer mode room
app.post('/api/rooms/:roomCode/generate-invite', async (req, res) => {
  try {
    const { roomCode } = req.params;

    // Get room and verify it's in streamer mode
    const { data: room, error: roomError } = await db.adminClient
      .from('rooms')
      .select('id, streamer_mode, host_id')
      .eq('room_code', roomCode)
      .single();

    if (roomError || !room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (!room.streamer_mode) {
      return res.status(400).json({ error: 'Room is not in streamer mode' });
    }

    // Generate unique invite token
    const crypto = require('crypto');
    const inviteToken = crypto.randomBytes(16).toString('hex');

    // Insert invite token into database
    const { error: inviteError } = await db.adminClient
      .from('room_invites')
      .insert({
        room_id: room.id,
        token: inviteToken,
        created_by: room.host_id,
        uses_remaining: null // Unlimited uses
      });

    if (inviteError) {
      console.error('Error creating invite:', inviteError);
      return res.status(500).json({ error: 'Failed to generate invite' });
    }

    // Construct invite URL using request origin
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
    const host = req.get('host');
    const baseUrl = process.env.BASE_URL || `${protocol}://${host}`;
    const inviteUrl = `${baseUrl}/?invite=${inviteToken}`;

    res.json({
      success: true,
      inviteUrl,
      token: inviteToken
    });

  } catch (error) {
    console.error('❌ Generate invite error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Resolve invite token to room code
app.post('/api/invites/resolve', async (req, res) => {
  try {
    const { inviteToken } = req.body;

    if (!inviteToken) {
      return res.status(400).json({ error: 'Invite token is required' });
    }

    // Look up invite token
    const { data: invite, error: inviteError } = await db.adminClient
      .from('room_invites')
      .select(`
        *,
        room:rooms(*)
      `)
      .eq('token', inviteToken)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (inviteError || !invite) {
      return res.status(404).json({ error: 'Invalid or expired invite' });
    }

    // Check if invite has uses remaining
    if (invite.uses_remaining !== null && invite.uses_remaining <= 0) {
      return res.status(403).json({ error: 'Invite link has been fully used' });
    }

    // Decrement uses if limited
    if (invite.uses_remaining !== null) {
      await db.adminClient
        .from('room_invites')
        .update({ uses_remaining: invite.uses_remaining - 1 })
        .eq('id', invite.id);
    }

    // Return room information
    res.json({
      success: true,
      roomCode: invite.room.room_code,
      roomData: invite.room
    });

  } catch (error) {
    console.error('❌ Resolve invite error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Resolve game session token (for external games)
app.get('/api/game-sessions/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const now = new Date().toISOString();

    console.log('🔍 [SESSION LOOKUP] Incoming request:', {
      token: token ? token.substring(0, 8) + '...' : 'null',
      timestamp: now
    });

    if (!token) {
      return res.status(400).json({ error: 'Session token is required' });
    }

    // Look up session token
    const { data: session, error: sessionError } = await db.adminClient
      .from('game_sessions')
      .select('*')
      .eq('session_token', token)
      .gt('expires_at', now)
      .single();

    if (sessionError || !session) {
      console.log('❌ [SESSION LOOKUP] Not found or expired:', {
        token: token.substring(0, 8) + '...',
        error: sessionError?.message || 'No session returned',
        errorCode: sessionError?.code,
        currentTime: now
      });
      return res.status(404).json({ error: 'Session not found or expired' });
    }

    console.log('✅ [SESSION LOOKUP] Found session:', {
      token: token.substring(0, 8) + '...',
      roomCode: session.room_code,
      expiresAt: session.expires_at,
      createdAt: session.created_at,
      playerId: session.player_id
    });

    // Fetch player name if playerId is available
    let playerName = null;
    if (session.player_id) {
      const { data: user } = await db.adminClient
        .from('users')
        .select('username, display_name')
        .eq('id', session.player_id)
        .single();

      playerName = user?.display_name || 'Player';
    }

    // Update last accessed timestamp
    await db.adminClient
      .from('game_sessions')
      .update({ last_accessed: new Date().toISOString() })
      .eq('session_token', token);

    console.log('✅ Session resolved:', {
      token: token.substring(0, 8) + '...',
      roomCode: session.room_code,
      gameType: session.game_type,
      playerName
    });

    // Return session information
    res.json({
      success: true,
      roomCode: session.room_code,
      gameType: session.game_type,
      streamerMode: session.streamer_mode,
      playerId: session.player_id,
      playerName: playerName,
      metadata: session.metadata,
      expiresAt: session.expires_at
    });

  } catch (error) {
    console.error('❌ Resolve game session error:', error);
    res.status(500).json({ error: 'Internal server error' });
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

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('💥 Unhandled error:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });
  
  if (req.path.startsWith('/api/')) {
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  } else {
    res.status(500).send('Internal server error');
  }
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
    code: 'NOT_FOUND'
  });
});

// NOTE: Catch-all route moved to startServer() to ensure it's registered AFTER game proxies

// Global error handlers to suppress navigation-related WebSocket errors
process.on('uncaughtException', (err) => {
  if (!isNavigationError(err)) {
    console.error('Uncaught Exception:', err);
    // Don't exit on navigation errors - they're expected during game-to-lobby navigation
    if (!isNavigationError(err)) {
      process.exit(1);
    }
  }
});

process.on('unhandledRejection', (reason, promise) => {
  if (reason && !isNavigationError(reason)) {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  }
});

// Server-level error handling
server.on('error', (err) => {
  if (!isNavigationError(err)) {
    console.error('Server error:', err);
  }
});

// Start server - now async to load game proxies from database first
const PORT = process.env.PORT || 3033;

async function startServer() {
  try {
    // Load and setup game proxies from database
    await setupGameProxies();

    // ===== GAME-SPECIFIC STATIC FILE SERVING & CATCH-ALL ROUTES =====
    // These must come BEFORE the main catch-all route to properly serve React apps

    // DDF Game
    const ddfBuildPath = path.join(__dirname, '../../DDF/client/dist');
    try {
      app.use('/ddf', express.static(ddfBuildPath));
      app.get('/ddf/*', (req, res) => {
        res.sendFile(path.join(ddfBuildPath, 'index.html'));
      });
      console.log('✅ DDF routes configured');
    } catch (err) {
      console.warn('⚠️  DDF build not found, will use proxy fallback:', err.message);
    }

    // BingoBuddies Game
    const bingoBuildPath = path.join(__dirname, '../../BingoBuddies/client/dist');
    try {
      app.use('/bingo', express.static(bingoBuildPath));
      app.get('/bingo/*', (req, res) => {
        res.sendFile(path.join(bingoBuildPath, 'index.html'));
      });
      console.log('✅ BingoBuddies routes configured');
    } catch (err) {
      console.warn('⚠️  BingoBuddies build not found, will use proxy fallback:', err.message);
    }

    // SUSD Game (single page app)
    const susdBuildPath = path.join(__dirname, '../../SUSD/dist');
    try {
      app.use('/susd', express.static(susdBuildPath));
      app.get('/susd/*', (req, res) => {
        res.sendFile(path.join(susdBuildPath, 'index.html'));
      });
      console.log('✅ SUSD routes configured');
    } catch (err) {
      console.warn('⚠️  SUSD build not found, will use proxy fallback:', err.message);
    }

    // ClueScale Game
    const clueScaleBuildPath = path.join(__dirname, '../../ClueScale/client/dist');
    try {
      app.use('/cluescale', express.static(clueScaleBuildPath));
      app.get('/cluescale/*', (req, res) => {
        res.sendFile(path.join(clueScaleBuildPath, 'index.html'));
      });
      console.log('✅ ClueScale routes configured');
    } catch (err) {
      console.warn('⚠️  ClueScale build not found, will use proxy fallback:', err.message);
    }

    // ThinkAlike Game
    const thinkAlikeBuildPath = path.join(__dirname, '../../ThinkAlike/client/dist');
    try {
      app.use('/thinkalike', express.static(thinkAlikeBuildPath));
      app.get('/thinkalike/*', (req, res) => {
        res.sendFile(path.join(thinkAlikeBuildPath, 'index.html'));
      });
      console.log('✅ ThinkAlike routes configured');
    } catch (err) {
      console.warn('⚠️  ThinkAlike build not found, will use proxy fallback:', err.message);
    }

    // Now that proxies are set up, register catch-all route
    // This MUST come after game routes and proxies so they can intercept game URLs
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '../client/build/index.html'));
    });
    console.log('✅ Catch-all route registered (after game routes & proxies)');

    // Start listening
    server.listen(PORT, () => {
      console.log(`🚀 GameBuddies Server v2.1.0 running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🗄️ Storage: SUPABASE (Persistent)`);
      console.log(`🎮 Game proxies configured: ${Object.keys(gameProxies).join(',')}`);
      console.log(`✅ Supabase configured - using persistent database storage`);

      // Run initial cleanup on startup
      db.cleanupStaleData().then(() => {
        console.log('✅ Initial stale data cleanup completed');
      });

      // Start periodic cleanup interval (every 2 minutes)
      setInterval(async () => {
        await db.cleanupStaleData();
      }, 2 * 60 * 1000); // 2 minutes
      console.log('🕐 Periodic cleanup interval started (every 2 minutes)');
      console.log(`🔇 WebSocket navigation errors suppressed for clean logs`);

      // Start game keep-alive service (prevents Render.com free tier spin-down)
      gameKeepAlive.start();
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

module.exports = { app, server, io }; 







