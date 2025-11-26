import type { Request, Response, NextFunction, Application } from 'express';
import type http from 'http';
/**
 * Check if an error is a navigation-related WebSocket error that should be suppressed
 */
export declare function isNavigationError(err: Error & {
    code?: string;
}): boolean;
/**
 * Express error handling middleware
 */
export declare function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void;
/**
 * 404 handler for API routes
 */
export declare function apiNotFoundHandler(req: Request, res: Response): void;
/**
 * Setup global error handlers for process and server
 */
export declare function setupGlobalErrorHandlers(server: http.Server): void;
/**
 * Setup error middleware on Express app
 */
export declare function setupErrorMiddleware(app: Application): void;
/**
 * Setup graceful shutdown handlers
 */
export declare function setupGracefulShutdown(server: http.Server, cleanup?: () => Promise<void>): void;
//# sourceMappingURL=errorHandler.d.ts.map