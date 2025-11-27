import http from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';

// Load environment variables first
dotenv.config();

// Import managers and services
import ConnectionManager from './lib/connectionManager';
import LobbyManager from './lib/lobbyManager';
import StatusSyncManager from './lib/statusSyncManager';
import RoomLifecycleManager from './lib/roomLifecycleManager';
import ProxyManager from './lib/proxyManager';
import gameKeepAlive from './services/gameKeepAlive';
import { db } from './lib/supabase';

// Import app factory and socket setup
import { createApp, setupFinalRoutes } from './app';
import { registerAllHandlers } from './sockets';
import type { ServerContext } from './types';

// Import cleanup and error handling
import { startAllCleanupServices, stopAllCleanupServices } from './services/cleanupService';
import { setupGlobalErrorHandlers, setupGracefulShutdown } from './middleware/errorHandler';

// Server configuration
const PORT = process.env.PORT || 3033;

/**
 * Main server startup function
 */
async function startServer(): Promise<void> {
  try {
    console.log('🚀 Starting GameBuddies Server v2.1.0...');
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);

    // 1. Create HTTP Server
    const server = http.createServer();

    // 2. Create Socket.IO Server
    const io = new Server(server, {
      cors: {
        origin: (origin, callback) => {
          // Allow all gamebuddies.io and onrender.com origins
          if (!origin) {
            callback(null, true);
            return;
          }
          try {
            const { hostname } = new URL(origin);
            if (
              hostname === 'localhost' ||
              hostname === 'gamebuddies.io' ||
              hostname.endsWith('.gamebuddies.io') ||
              hostname.endsWith('.onrender.com')
            ) {
              callback(null, true);
              return;
            }
          } catch {
            // Invalid URL
          }
          callback(new Error('Not allowed by CORS'));
        },
        credentials: true
      },
      pingTimeout: 60000,
      pingInterval: 25000
    });

    // 3. Initialize Managers (with fully initialized io)
    console.log('📦 Initializing managers...');
    const connectionManager = new ConnectionManager();
    const lobbyManager = new LobbyManager(io, db as any, connectionManager);
    const statusSyncManager = new StatusSyncManager(db as any, io, lobbyManager as any);
    const roomLifecycleManager = new RoomLifecycleManager(io);
    const proxyManager = new ProxyManager();

    // 4. Construct Server Context
    const ctx: ServerContext = {
      io,
      db,
      connectionManager,
      lobbyManager,
      statusSyncManager,
      roomLifecycleManager,
      proxyManager
    };

    // 5. Register Socket Handlers (now has full context with lobbyManager)
    registerAllHandlers(io, ctx);

    // 6. Create Express App
    const app = createApp(io, db, connectionManager);

    // 7. Attach App to Server
    server.on('request', app);

    // Load and setup game proxies from database
    console.log('🎮 Setting up game proxies...');
    await proxyManager.setupGameProxies(app, server);

    // Setup final routes (must come after proxies)
    setupFinalRoutes(app);

    // Setup global error handlers
    setupGlobalErrorHandlers(server);

    // Setup graceful shutdown
    setupGracefulShutdown(server, async () => {
      console.log('🛑 Running cleanup before shutdown...');
      stopAllCleanupServices();
      gameKeepAlive.stop();
    });

    // Start listening
    server.listen(PORT, () => {
      console.log(`🚀 GameBuddies Server v2.1.0 running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🗄️ Storage: SUPABASE (Persistent)`);
      console.log(`🎮 Game proxies loaded from database`);
      console.log(`✅ Supabase configured - using persistent database storage`);

      // Run initial cleanup on startup
      db.cleanupStaleData().then(() => {
        console.log('✅ Initial stale data cleanup completed');
      }).catch((err: Error) => {
        console.error('❌ Initial cleanup failed:', err.message);
      });

      // Start cleanup services
      startAllCleanupServices(db, connectionManager);
      console.log('🕐 Cleanup services started');

      // Start game keep-alive service (prevents Render.com free tier spin-down)
      gameKeepAlive.start();
      console.log('🔇 WebSocket navigation errors suppressed for clean logs');
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

// Export for testing
export { db };
