import { Application } from 'express';
import { Server } from 'socket.io';
import { db, DatabaseService } from './lib/supabase';
import ConnectionManager from './lib/connectionManager';
/**
 * Create and configure the Express application
 */
export declare function createApp(io: Server, dbService: DatabaseService, connectionManager: ConnectionManager): Application;
/**
 * Setup final routes that must come after proxies
 * (game static routes and catch-all)
 */
export declare function setupFinalRoutes(app: Application): void;
export { db };
//# sourceMappingURL=app.d.ts.map