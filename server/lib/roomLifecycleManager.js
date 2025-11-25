const { db } = require('./supabase');

// [ABANDON] Grace period before marking rooms abandoned
const abandonmentTimers = new Map();
const ABANDONMENT_GRACE_PERIOD_MS = 10000; // 10 seconds

// [HOST] Grace period before transferring host
const hostTransferTimers = new Map();
const HOST_TRANSFER_GRACE_PERIOD_MS = 30000; // 30 seconds

class RoomLifecycleManager {
  constructor(io) {
    this.io = io;
  }

  startAbandonmentGracePeriod(roomId, roomCode) {
    // Clear any existing timer for this room
    if (abandonmentTimers.has(roomId)) {
      clearTimeout(abandonmentTimers.get(roomId));
    }

    console.log(`⏳ [ABANDON] Starting ${ABANDONMENT_GRACE_PERIOD_MS}ms grace period for room ${roomCode}`);

    const timer = setTimeout(async () => {
      abandonmentTimers.delete(roomId);

      try {
        // Re-check connected players after grace period
        const { data: room, error } = await db.adminClient
          .from('rooms')
          .select('*, room_members!inner(*)')
          .eq('id', roomId)
          .single();

        if (error) {
          console.error(`❌ [ABANDON] Error checking room ${roomCode}:`, error);
          return;
        }

        const connectedCount = room?.room_members?.filter(m => m.is_connected).length || 0;

        if (connectedCount === 0 && room?.status !== 'abandoned') {
          console.log(`🗑️ [ABANDON] Grace period expired, no reconnections - marking room ${roomCode} as abandoned`);
          await db.adminClient
            .from('rooms')
            .update({ status: 'abandoned', updated_at: new Date().toISOString() })
            .eq('id', roomId);
          console.log(`✅ [ABANDON] Room ${roomCode} marked as abandoned`);
        } else {
          console.log(`✅ [ABANDON] Grace period: Room ${roomCode} has ${connectedCount} connected players, not abandoning`);
        }
      } catch (err) {
        console.error(`❌ [ABANDON] Exception during grace period check for room ${roomCode}:`, err);
      }
    }, ABANDONMENT_GRACE_PERIOD_MS);

    abandonmentTimers.set(roomId, timer);
  }

  cancelAbandonmentGracePeriod(roomId, roomCode) {
    if (abandonmentTimers.has(roomId)) {
      console.log(`✅ [ABANDON] Cancelled grace period for room ${roomCode} - player reconnected`);
      clearTimeout(abandonmentTimers.get(roomId));
      abandonmentTimers.delete(roomId);
    }
  }

  startHostTransferGracePeriod(roomId, roomCode, originalHostUserId) {
    // Clear any existing timer for this room
    if (hostTransferTimers.has(roomId)) {
      clearTimeout(hostTransferTimers.get(roomId).timer);
    }

    console.log(`⏳ [HOST] Starting ${HOST_TRANSFER_GRACE_PERIOD_MS}ms grace period for host ${originalHostUserId} in room ${roomCode}`);

    const timer = setTimeout(async () => {
      hostTransferTimers.delete(roomId);

      try {
        // Re-check if original host reconnected
        const { data: room, error } = await db.adminClient
          .from('rooms')
          .select('*, room_members!inner(*)')
          .eq('id', roomId)
          .single();

        if (error) {
          console.error(`❌ [HOST] Error checking room ${roomCode}:`, error);
          return;
        }

        const originalHost = room?.room_members?.find(m => m.user_id === originalHostUserId);
        const isOriginalHostConnected = originalHost?.is_connected === true;

        if (isOriginalHostConnected) {
          console.log(`✅ [HOST] Grace period: Original host ${originalHostUserId} reconnected, keeping host status`);
          return;
        }

        // Original host didn't reconnect - transfer to another player
        const otherConnectedPlayers = room?.room_members?.filter(m =>
          m.user_id !== originalHostUserId && m.is_connected === true
        ) || [];

        if (otherConnectedPlayers.length > 0) {
          console.log(`👑 [HOST] Grace period expired, original host not connected - transferring host`);
          const newHost = await db.autoTransferHost(roomId, originalHostUserId);
          if (newHost) {
            // Broadcast host transfer to all connected clients
            this.io.to(room.room_code).emit('hostTransferred', {
              oldHostId: originalHostUserId,
              newHostId: newHost.user_id,
              newHostName: newHost.user?.display_name || 'Player',
              reason: 'grace_period_expired',
              roomVersion: Date.now()
            });
            console.log(`👑 [HOST] Host transfer completed after grace period:`, {
              oldHostId: originalHostUserId,
              newHostId: newHost.user_id,
              newHostName: newHost.user?.display_name || 'Player'
            });
          }
        } else {
          console.log(`⚠️ [HOST] Grace period expired, no other connected players - keeping host role for when they return`);
        }
      } catch (err) {
        console.error(`❌ [HOST] Exception during grace period check for room ${roomCode}:`, err);
      }
    }, HOST_TRANSFER_GRACE_PERIOD_MS);

    hostTransferTimers.set(roomId, { timer, originalHostUserId });
  }

  cancelHostTransferGracePeriod(roomId, roomCode, reconnectingUserId) {
    const pending = hostTransferTimers.get(roomId);
    if (pending && pending.originalHostUserId === reconnectingUserId) {
      console.log(`✅ [HOST] Cancelled grace period for room ${roomCode} - original host ${reconnectingUserId} reconnected`);
      clearTimeout(pending.timer);
      hostTransferTimers.delete(roomId);
      return true; // Indicates original host reconnected
    }
    return false;
  }
}

module.exports = RoomLifecycleManager;
