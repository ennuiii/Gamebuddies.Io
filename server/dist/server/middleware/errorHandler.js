"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isNavigationError = isNavigationError;
exports.errorHandler = errorHandler;
exports.apiNotFoundHandler = apiNotFoundHandler;
exports.setupGlobalErrorHandlers = setupGlobalErrorHandlers;
exports.setupErrorMiddleware = setupErrorMiddleware;
exports.setupGracefulShutdown = setupGracefulShutdown;
/**
 * Check if an error is a navigation-related WebSocket error that should be suppressed
 */
function isNavigationError(err) {
    const suppressedCodes = ['ERR_STREAM_WRITE_AFTER_END', 'ECONNRESET', 'EPIPE', 'ENOTFOUND'];
    const suppressedMessages = [
        'write after end',
        'connection was terminated',
        'socket hang up',
        'read ECONNRESET',
        'write EPIPE'
    ];
    return suppressedCodes.includes(err.code || '') ||
        suppressedMessages.some(msg => err.message?.includes(msg));
}
/**
 * Express error handling middleware
 */
function errorHandler(err, req, res, _next) {
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
    }
    else {
        res.status(500).send('Internal server error');
    }
}
/**
 * 404 handler for API routes
 */
function apiNotFoundHandler(req, res) {
    res.status(404).json({
        success: false,
        error: 'API endpoint not found',
        code: 'NOT_FOUND'
    });
}
/**
 * Setup global error handlers for process and server
 */
function setupGlobalErrorHandlers(server) {
    // Uncaught exception handler
    process.on('uncaughtException', (err) => {
        if (!isNavigationError(err)) {
            console.error('Uncaught Exception:', err);
            // Don't exit on navigation errors - they're expected during game-to-lobby navigation
            if (!isNavigationError(err)) {
                process.exit(1);
            }
        }
    });
    // Unhandled rejection handler
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
    console.log('✅ Global error handlers configured');
}
/**
 * Setup error middleware on Express app
 */
function setupErrorMiddleware(app) {
    // Error handling middleware - must be registered after all routes
    app.use(errorHandler);
    // 404 handler for API routes
    app.use('/api/*', apiNotFoundHandler);
    console.log('✅ Error middleware configured');
}
/**
 * Setup graceful shutdown handlers
 */
function setupGracefulShutdown(server, cleanup) {
    const handleShutdown = async (signal) => {
        console.log(`\n🛑 Received ${signal} - shutting down gracefully...`);
        // Run custom cleanup if provided
        if (cleanup) {
            try {
                await cleanup();
            }
            catch (error) {
                console.error('❌ Error during cleanup:', error);
            }
        }
        // Close server
        server.close(() => {
            console.log('✅ Server closed');
            process.exit(0);
        });
        // Force exit after timeout
        setTimeout(() => {
            console.error('❌ Forced shutdown after timeout');
            process.exit(1);
        }, 10000);
    };
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));
    console.log('✅ Graceful shutdown handlers configured');
}
//# sourceMappingURL=errorHandler.js.map