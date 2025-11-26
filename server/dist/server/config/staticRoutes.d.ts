import { Application } from 'express';
/**
 * Setup core static file serving routes
 * Must be called early in app setup
 */
export declare function setupCoreStaticRoutes(app: Application): void;
/**
 * Setup game-specific static routes
 * Should be called after proxies are set up
 */
export declare function setupGameStaticRoutes(app: Application): void;
/**
 * Setup catch-all route for SPA
 * MUST be called LAST, after all other routes and proxies
 */
export declare function setupCatchAllRoute(app: Application): void;
//# sourceMappingURL=staticRoutes.d.ts.map