/**
 * GameBuddies Server - Main Entry Point
 *
 * TypeScript-powered server with Socket.IO, Express, and Supabase integration.
 */

import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import compression from 'compression';
import helmet from 'helmet';
import { createProxyMiddleware } from 'http-proxy-middleware';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';
// import rateLimit from 'express-rate-limit';
// import crypto from 'crypto';

// Import our TypeScript modules
import logger from './lib/logger';
import constants from './config/constants';
import { corsOptions } from './config/cors';
import { errorHandler } from './lib/errors';
import requestIdMiddleware from './middlewares/requestId';
import { db } from './lib/supabase';
import { AuthenticatedRequest, ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData } from './types';

// Import routes
import adsRouter from './routes/ads';

// Import legacy JavaScript modules (to be converted)
const gameApiV2Router = require('./routes/gameApiV2');
const gameApiV2DDFRouter = require('./routes/gameApiV2_DDFCompatibility');
const gamesRouter = require('./routes/games');
// const ConnectionManager = require('./lib/connectionManager');
// const LobbyManager = require('./lib/lobbyManager');
// const StatusSyncManager = require('./lib/statusSyncManager');
// const { validators, sanitize, rateLimits, validateApiKey } = require('./lib/validation');
const gameKeepAlive = require('./services/gameKeepAlive');

// Load environment variables
dotenv.config();

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Behind Render/other proxies, respect X-Forwarded-* for IPs and protocol
app.set('trust proxy', 1);

// ===== MIDDLEWARE =====

// Security and compression
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(compression());

// CORS
app.use(require('cors')(corsOptions));

// Request parsing
app.use(express.json({ limit: constants.MAX_REQUEST_SIZE }));
app.use(express.urlencoded({ extended: true, limit: constants.MAX_REQUEST_SIZE }));

// Request ID tracking
app.use(requestIdMiddleware);

// Attach database to requests
app.use((req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  req.db = db;
  next();
});

// ===== SOCKET.IO SETUP =====

const io = new SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(server, {
  cors: corsOptions as any,
  pingTimeout: constants.PING_TIMEOUT,
  pingInterval: constants.PING_INTERVAL,
  maxHttpBufferSize: constants.MAX_HTTP_BUFFER_SIZE,
  transports: ['websocket', 'polling']
});

// ===== HELPER FUNCTIONS =====

/**
 * Parse boolean from environment variable
 */
function envBool(name: string, defaultVal: boolean = false): boolean {
  const v = process.env[name];
  if (v == null) return defaultVal;
  return /^(1|true|yes|on)$/i.test(String(v).trim());
}

/**
 * Game proxy configuration
 */
interface GameProxyConfig {
  path: string;
  target: string;
  pathRewrite: Record<string, string>;
  ws: boolean;
}

let gameProxies: Record<string, GameProxyConfig> = {};

/**
 * Load game proxies from database
 */
async function loadGameProxiesFromDatabase(): Promise<Record<string, GameProxyConfig>> {
  try {
    logger.info('Loading game configurations from database...');

    const { data: games, error } = await db.client
      .from('games')
      .select('*')
      .eq('is_active', true)
      .eq('is_external', true); // Only external games need proxies

    if (error) {
      logger.error('Error loading games from database', { error: error.message });
      return {};
    }

    const proxies: Record<string, GameProxyConfig> = {};

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

      logger.info(`Configured ${gameId}: /${gameId} -> ${target}`);
    }

    logger.info(`Loaded ${Object.keys(proxies).length} game proxies from database`);
    return proxies;

  } catch (err) {
    logger.error('Unexpected error loading game proxies', { error: (err as Error).message });
    return {};
  }
}

// Store proxy instances for WebSocket upgrade handling
const proxyInstances: Record<string, any> = {};

/**
 * Check if error should be suppressed (navigation errors, etc.)
 */
function isNavigationError(err: any): boolean {
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
}

/**
 * Create filtered logger for proxy (suppresses navigation errors)
 */
function createFilteredLogger() {
  const suppress = (message: any, args?: any[]): boolean => {
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
    log: (...args: any[]) => logger.info(args.join(' ')),
    debug: (...args: any[]) => logger.debug(args.join(' ')),
    info: (...args: any[]) => logger.info(args.join(' ')),
    warn: (...args: any[]) => logger.warn(args.join(' ')),
    error: (message: any, ...args: any[]) => {
      if (suppress(message, args)) return;
      logger.error(message, { args });
    },
  };
}

/**
 * Setup all game proxies
 */
async function setupGameProxies(): Promise<void> {
  // Load proxies from database
  gameProxies = await loadGameProxiesFromDatabase();

  // Setup each proxy
  for (const [gameId, config] of Object.entries(gameProxies)) {
    try {
      const proxy = createProxyMiddleware({
        target: config.target,
        changeOrigin: true,
        pathRewrite: config.pathRewrite,
        ws: config.ws,
        logLevel: 'silent',
        logProvider: createFilteredLogger as any,
        timeout: constants.PROXY_TIMEOUT,
        proxyTimeout: constants.PROXY_TIMEOUT,
        on: {
          proxyReq: (proxyReq, req, res) => {
            proxyReq.setHeader('X-Proxied-By', 'GameBuddies');
            proxyReq.setHeader('X-Game-ID', gameId);
          },
          error: (err, req, res) => {
            if (!isNavigationError(err)) {
              logger.error(`Proxy error for ${gameId}`, {
                error: err.message,
                code: (err as any).code,
                url: (req as Request).url
              });
            }

            if (!res.headersSent) {
              (res as Response).status(502).json({
                success: false,
                error: 'Game service temporarily unavailable',
                code: 'PROXY_ERROR'
              });
            }
          }
        }
      } as any);

      app.use(config.path, proxy);
      proxyInstances[gameId] = proxy;

      logger.info(`Proxy setup complete for ${gameId}`);
    } catch (err) {
      logger.error(`Failed to setup proxy for ${gameId}`, { error: (err as Error).message });
    }
  }
}

// ===== STATIC FILES =====

// Serve static files from React build
app.use(express.static(path.join(__dirname, '../client/build')));

// Serve screenshots
app.use('/screenshots', express.static(path.join(__dirname, '../screenshots')));

// ===== API ROUTES =====

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '2.0.0',
  });
});

// Connection stats
app.get('/api/connection-stats', async (req, res) => {
  try {
    const stats = {
      socketConnections: io.engine.clientsCount,
      rooms: io.sockets.adapter.rooms.size,
      timestamp: new Date().toISOString()
    };
    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error('Failed to get connection stats', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to retrieve stats' });
  }
});

// Register API routers
app.use('/api/ads', adsRouter);
app.use('/api/v2/game', gameApiV2Router);
app.use('/api/v2/ddf', gameApiV2DDFRouter);
app.use('/api/games', gamesRouter);

// ===== ERROR HANDLING =====

// Global error handler (must be last)
app.use(errorHandler(logger));

// ===== WEBSOCKET UPGRADE HANDLING =====

// Handle WebSocket upgrade requests for proxied game services
server.on('upgrade', (req, socket, head) => {
  const url = req.url || '';

  // Find matching proxy
  for (const [gameId, proxyInstance] of Object.entries(proxyInstances)) {
    const config = gameProxies[gameId];
    if (url.startsWith(config.path) && config.ws) {
      logger.socket('WebSocket upgrade request', { gameId, url });
      proxyInstance.upgrade(req, socket, head);
      return;
    }
  }

  // No matching proxy found
  logger.warn('WebSocket upgrade request with no matching proxy', { url });
  socket.destroy();
});

// ===== SERVER STARTUP =====

const PORT = process.env.PORT || 3033;

async function startServer(): Promise<void> {
  try {
    // Setup game proxies
    await setupGameProxies();

    // Initialize services
    logger.info('Initializing services...');

    // Start game keep-alive service
    gameKeepAlive.start();

    // Start server
    server.listen(PORT, () => {
      logger.info(`🚀 GameBuddies server started`, {
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
      });
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully...`);

      gameKeepAlive.stop();

      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });

      // Force close after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server', {
      error: (error as Error).message,
      stack: (error as Error).stack
    });
    process.exit(1);
  }
}

// Start the server
startServer();

// Export for testing
export { app, server, io };
