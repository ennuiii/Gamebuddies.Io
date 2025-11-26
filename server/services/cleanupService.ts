import type { DatabaseService } from '../lib/supabase';
import type ConnectionManager from '../lib/connectionManager';

interface CleanupIntervals {
  periodic: NodeJS.Timeout | null;
  offPeak: NodeJS.Timeout | null;
  staleConnections: NodeJS.Timeout | null;
}

const intervals: CleanupIntervals = {
  periodic: null,
  offPeak: null,
  staleConnections: null,
};

/**
 * Start periodic cleanup of stale connections and inactive rooms
 * Runs every 15 minutes
 */
export function startPeriodicCleanup(db: DatabaseService): void {
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
        maxAgeHours: 24,     // Rooms older than 24 hours
        maxIdleMinutes: 60,  // Rooms idle for 1 hour
        includeAbandoned: true,
        includeCompleted: true,
        dryRun: false
      });

      if (roomCleanup.cleaned > 0) {
        console.log(`🧹 Periodic cleanup: ${roomCleanup.cleaned} rooms cleaned`);
      }

    } catch (error) {
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
export function startOffPeakCleanup(db: DatabaseService): void {
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
          maxAgeHours: 12,     // More aggressive: 12 hours
          maxIdleMinutes: 30,  // More aggressive: 30 minutes
          includeAbandoned: true,
          includeCompleted: true,
          dryRun: false
        });

        if (roomCleanup.cleaned > 0) {
          console.log(`🌙 Off-peak cleanup: ${roomCleanup.cleaned} rooms cleaned`);
        }
      }
    } catch (error) {
      console.error('❌ Off-peak cleanup error:', error);
    }
  }, 60 * 60 * 1000); // Every hour

  console.log('✅ Off-peak cleanup scheduled (hourly check)');
}

/**
 * Start stale connection cleanup
 * Runs every minute to clean up disconnected socket connections
 */
export function startStaleConnectionCleanup(connectionManager: ConnectionManager): void {
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
export function startAllCleanupServices(
  db: DatabaseService,
  connectionManager: ConnectionManager
): void {
  startPeriodicCleanup(db);
  startOffPeakCleanup(db);
  startStaleConnectionCleanup(connectionManager);
}

/**
 * Stop all cleanup services
 */
export function stopAllCleanupServices(): void {
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
