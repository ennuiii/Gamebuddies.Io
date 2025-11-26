"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const http_1 = __importDefault(require("http"));
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables first
dotenv_1.default.config();
// Import managers and services
const connectionManager_1 = __importDefault(require("./lib/connectionManager"));
const lobbyManager_1 = __importDefault(require("./lib/lobbyManager"));
const statusSyncManager_1 = __importDefault(require("./lib/statusSyncManager"));
const roomLifecycleManager_1 = __importDefault(require("./lib/roomLifecycleManager"));
const proxyManager_1 = __importDefault(require("./lib/proxyManager"));
const gameKeepAlive_1 = __importDefault(require("./services/gameKeepAlive"));
const supabase_1 = require("./lib/supabase");
Object.defineProperty(exports, "db", { enumerable: true, get: function () { return supabase_1.db; } });
// Import app factory and socket setup
const app_1 = require("./app");
const sockets_1 = require("./sockets");
// Import cleanup and error handling
const cleanupService_1 = require("./services/cleanupService");
const errorHandler_1 = require("./middleware/errorHandler");
// Server configuration
const PORT = process.env.PORT || 3033;
/**
 * Main server startup function
 */
async function startServer() {
    try {
        console.log('🚀 Starting GameBuddies Server v2.1.0...');
        console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
        // Create HTTP server
        const server = http_1.default.createServer();
        // Create proxy manager instance
        const proxyManager = new proxyManager_1.default();
        // Initialize connection manager first (no dependencies)
        console.log('📦 Initializing managers...');
        const connectionManager = new connectionManager_1.default();
        // Create placeholder for roomLifecycleManager (will be updated with io)
        const roomLifecycleManager = new roomLifecycleManager_1.default(null);
        // Initialize Socket.IO with handlers
        // Note: LobbyManager and StatusSyncManager need io, so they're created inside initializeSocketIO
        // For now, pass null placeholders - the socket handlers create what they need
        const io = (0, sockets_1.initializeSocketIO)(server, {
            db: supabase_1.db,
            connectionManager,
            lobbyManager: null, // Created internally if needed
            statusSyncManager: null, // Created internally if needed
            roomLifecycleManager
        });
        // Update roomLifecycleManager with actual io instance
        roomLifecycleManager.io = io;
        // Create managers that depend on io
        // Note: These managers are created but not used directly - socket handlers create their own as needed
        const lobbyManager = new lobbyManager_1.default(io, supabase_1.db, connectionManager);
        const statusSyncManager = new statusSyncManager_1.default(supabase_1.db, io, lobbyManager);
        // Create Express app with io for routes that need it
        const app = (0, app_1.createApp)(io, supabase_1.db, connectionManager);
        // Attach app to server
        server.on('request', app);
        // Load and setup game proxies from database
        console.log('🎮 Setting up game proxies...');
        await proxyManager.setupGameProxies(app, server);
        // Setup final routes (must come after proxies)
        (0, app_1.setupFinalRoutes)(app);
        // Setup global error handlers
        (0, errorHandler_1.setupGlobalErrorHandlers)(server);
        // Setup graceful shutdown
        (0, errorHandler_1.setupGracefulShutdown)(server, async () => {
            console.log('🛑 Running cleanup before shutdown...');
            (0, cleanupService_1.stopAllCleanupServices)();
            gameKeepAlive_1.default.stop();
        });
        // Start listening
        server.listen(PORT, () => {
            console.log(`🚀 GameBuddies Server v2.1.0 running on port ${PORT}`);
            console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`🗄️ Storage: SUPABASE (Persistent)`);
            console.log(`🎮 Game proxies loaded from database`);
            console.log(`✅ Supabase configured - using persistent database storage`);
            // Run initial cleanup on startup
            supabase_1.db.cleanupStaleData().then(() => {
                console.log('✅ Initial stale data cleanup completed');
            }).catch((err) => {
                console.error('❌ Initial cleanup failed:', err.message);
            });
            // Start cleanup services
            (0, cleanupService_1.startAllCleanupServices)(supabase_1.db, connectionManager);
            console.log('🕐 Cleanup services started');
            // Start game keep-alive service (prevents Render.com free tier spin-down)
            gameKeepAlive_1.default.start();
            console.log('🔇 WebSocket navigation errors suppressed for clean logs');
        });
    }
    catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}
// Start the server
startServer();
//# sourceMappingURL=index.js.map