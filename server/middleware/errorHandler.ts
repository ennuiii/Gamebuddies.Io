import type { Request, Response, NextFunction, Application } from 'express';
import type http from 'http';

/**
 * Check if an error is a navigation-related WebSocket error that should be suppressed
 */
export function isNavigationError(err: Error & { code?: string }): boolean {
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
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
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
}

/**
 * 404 handler for API routes
 */
export function apiNotFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
    code: 'NOT_FOUND'
  });
}

/**
 * Setup global error handlers for process and server
 */
export function setupGlobalErrorHandlers(server: http.Server): void {
  // Uncaught exception handler
  process.on('uncaughtException', (err: Error) => {
    if (!isNavigationError(err)) {
      console.error('Uncaught Exception:', err);
      // Don't exit on navigation errors - they're expected during game-to-lobby navigation
      if (!isNavigationError(err)) {
        process.exit(1);
      }
    }
  });

  // Unhandled rejection handler
  process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    if (reason && !isNavigationError(reason as Error)) {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    }
  });

  // Server-level error handling
  server.on('error', (err: Error) => {
    if (!isNavigationError(err)) {
      console.error('Server error:', err);
    }
  });

  console.log('✅ Global error handlers configured');
}

/**
 * Setup error middleware on Express app
 */
export function setupErrorMiddleware(app: Application): void {
  // Error handling middleware - must be registered after all routes
  app.use(errorHandler);

  // 404 handler for API routes
  app.use('/api/*', apiNotFoundHandler);

  console.log('✅ Error middleware configured');
}

/**
 * Setup graceful shutdown handlers
 */
export function setupGracefulShutdown(
  server: http.Server,
  cleanup?: () => Promise<void>
): void {
  const handleShutdown = async (signal: string) => {
    console.log(`\n🛑 Received ${signal} - shutting down gracefully...`);

    // Run custom cleanup if provided
    if (cleanup) {
      try {
        await cleanup();
      } catch (error) {
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
