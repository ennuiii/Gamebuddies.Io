import type { DatabaseService } from '../lib/supabase';
import type ConnectionManager from '../lib/connectionManager';
/**
 * Start periodic cleanup of stale connections and inactive rooms
 * Runs every 15 minutes
 */
export declare function startPeriodicCleanup(db: DatabaseService): void;
/**
 * Start off-peak aggressive cleanup
 * Runs more aggressive cleanup during off-peak hours (2 AM - 6 AM)
 * Checks every hour
 */
export declare function startOffPeakCleanup(db: DatabaseService): void;
/**
 * Start stale connection cleanup
 * Runs every minute to clean up disconnected socket connections
 */
export declare function startStaleConnectionCleanup(connectionManager: ConnectionManager): void;
/**
 * Start all cleanup services
 */
export declare function startAllCleanupServices(db: DatabaseService, connectionManager: ConnectionManager): void;
/**
 * Stop all cleanup services
 */
export declare function stopAllCleanupServices(): void;
//# sourceMappingURL=cleanupService.d.ts.map