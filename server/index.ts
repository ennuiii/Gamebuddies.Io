import http from 'http';
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
import { initializeSocketIO } from './sockets';

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

    // Create HTTP server
    const server = http.createServer();

    // Create proxy manager instance
    const proxyManager = new ProxyManager();

    // Initialize connection manager first (no dependencies)
    console.log('📦 Initializing managers...');
    const connectionManager = new ConnectionManager();

    // Create placeholder for roomLifecycleManager (will be updated with io)
    const roomLifecycleManager = new RoomLifecycleManager(null as any);

    // Initialize Socket.IO with handlers
    // Note: LobbyManager and StatusSyncManager need io, so they're created inside initializeSocketIO
    // For now, pass null placeholders - the socket handlers create what they need
    const io = initializeSocketIO(server, {
      db,
      connectionManager,
      lobbyManager: null as any, // Created internally if needed
      statusSyncManager: null as any, // Created internally if needed
      roomLifecycleManager
    });

    // Update roomLifecycleManager with actual io instance
    (roomLifecycleManager as any).io = io;

    // Create managers that depend on io
    // Note: These managers are created but not used directly - socket handlers create their own as needed
    const lobbyManager = new LobbyManager(io, db as any, connectionManager);
    const statusSyncManager = new StatusSyncManager(db as any, io, lobbyManager as any);

    // Create Express app with io for routes that need it
    const app = createApp(io, db, connectionManager);

    // Attach app to server
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
