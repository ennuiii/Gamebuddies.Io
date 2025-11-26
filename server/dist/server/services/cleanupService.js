"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startPeriodicCleanup = startPeriodicCleanup;
exports.startOffPeakCleanup = startOffPeakCleanup;
exports.startStaleConnectionCleanup = startStaleConnectionCleanup;
exports.startAllCleanupServices = startAllCleanupServices;
exports.stopAllCleanupServices = stopAllCleanupServices;
const intervals = {
    periodic: null,
    offPeak: null,
    staleConnections: null,
};
/**
 * Start periodic cleanup of stale connections and inactive rooms
 * Runs every 15 minutes
 */
function startPeriodicCleanup(db) {
    if (intervals.periodic) {
        clearInterval(intervals.periodic);
    }
    intervals.periodic = setInterval(async () => {
        try {
            console.log('🧹 Running periodic cleanup...');
            // Clean up stale connections
            await db.cleanupStaleConnections();
            await db.refreshActiveRoomsView();
            // Clean up inactive rooms (less aggressive than manual)
            const roomCleanup = await db.cleanupInactiveRooms({
                maxAgeHours: 24, // Rooms older than 24 hours
                maxIdleMinutes: 60, // Rooms idle for 1 hour
                includeAbandoned: true,
                includeCompleted: true,
                dryRun: false
            });
            if (roomCleanup.cleaned > 0) {
                console.log(`🧹 Periodic cleanup: ${roomCleanup.cleaned} rooms cleaned`);
            }
        }
        catch (error) {
            console.error('❌ Periodic cleanup error:', error);
        }
    }, 15 * 60 * 1000); // Every 15 minutes
    console.log('✅ Periodic cleanup scheduled (every 15 minutes)');
}
/**
 * Start off-peak aggressive cleanup
 * Runs more aggressive cleanup during off-peak hours (2 AM - 6 AM)
 * Checks every hour
 */
function startOffPeakCleanup(db) {
    if (intervals.offPeak) {
        clearInterval(intervals.offPeak);
    }
    intervals.offPeak = setInterval(async () => {
        try {
            const hour = new Date().getHours();
            // Run more aggressive cleanup during off-peak hours (2 AM - 6 AM)
            if (hour >= 2 && hour <= 6) {
                console.log('🌙 Running off-peak aggressive cleanup...');
                const roomCleanup = await db.cleanupInactiveRooms({
                    maxAgeHours: 12, // More aggressive: 12 hours
                    maxIdleMinutes: 30, // More aggressive: 30 minutes
                    includeAbandoned: true,
                    includeCompleted: true,
                    dryRun: false
                });
                if (roomCleanup.cleaned > 0) {
                    console.log(`🌙 Off-peak cleanup: ${roomCleanup.cleaned} rooms cleaned`);
                }
            }
        }
        catch (error) {
            console.error('❌ Off-peak cleanup error:', error);
        }
    }, 60 * 60 * 1000); // Every hour
    console.log('✅ Off-peak cleanup scheduled (hourly check)');
}
/**
 * Start stale connection cleanup
 * Runs every minute to clean up disconnected socket connections
 */
function startStaleConnectionCleanup(connectionManager) {
    if (intervals.staleConnections) {
        clearInterval(intervals.staleConnections);
    }
    intervals.staleConnections = setInterval(() => {
        const cleaned = connectionManager.cleanupStaleConnections();
        if (cleaned.length > 0) {
            console.log(`🧹 Cleaned up ${cleaned.length} stale connections`);
        }
    }, 60000); // Every minute
    console.log('✅ Stale connection cleanup scheduled (every minute)');
}
/**
 * Start all cleanup services
 */
function startAllCleanupServices(db, connectionManager) {
    startPeriodicCleanup(db);
    startOffPeakCleanup(db);
    startStaleConnectionCleanup(connectionManager);
}
/**
 * Stop all cleanup services
 */
function stopAllCleanupServices() {
    if (intervals.periodic) {
        clearInterval(intervals.periodic);
        intervals.periodic = null;
    }
    if (intervals.offPeak) {
        clearInterval(intervals.offPeak);
        intervals.offPeak = null;
    }
    if (intervals.staleConnections) {
        clearInterval(intervals.staleConnections);
        intervals.staleConnections = null;
    }
    console.log('✅ All cleanup services stopped');
}
//# sourceMappingURL=cleanupService.js.map