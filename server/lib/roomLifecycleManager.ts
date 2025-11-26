import { Server as SocketIOServer } from 'socket.io';
import { db } from './supabase';

// [ABANDON] Grace period before marking rooms abandoned
const abandonmentTimers = new Map<string, NodeJS.Timeout>();
const ABANDONMENT_GRACE_PERIOD_MS = 10000; // 10 seconds

// [HOST] Grace period before transferring host
interface HostTransferTimer {
  timer: NodeJS.Timeout;
  originalHostUserId: string;
}
const hostTransferTimers = new Map<string, HostTransferTimer>();
const HOST_TRANSFER_GRACE_PERIOD_MS = 30000; // 30 seconds

class RoomLifecycleManager {
  private io: SocketIOServer;

  constructor(io: SocketIOServer) {
    this.io = io;
  }

  startAbandonmentGracePeriod(roomId: string, roomCode: string): void {
    // Clear any existing timer for this room
    if (abandonmentTimers.has(roomId)) {
      clearTimeout(abandonmentTimers.get(roomId)!);
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

        interface RoomMember {
          is_connected: boolean;
          in_game?: boolean;
          current_location?: string;
        }

        // Count players who are connected OR in game (in_game players don't have active sockets)
        const activeCount = (room?.room_members as RoomMember[] | undefined)?.filter((m: RoomMember) =>
          m.is_connected || m.in_game || m.current_location === 'game'
        ).length || 0;

        if (activeCount === 0 && room?.status !== 'abandoned') {
          console.log(`🗑️ [ABANDON] Grace period expired, no reconnections - marking room ${roomCode} as abandoned`);
          await db.adminClient
            .from('rooms')
            .update({ status: 'abandoned', updated_at: new Date().toISOString() })
            .eq('id', roomId);
          console.log(`✅ [ABANDON] Room ${roomCode} marked as abandoned`);
        } else {
          console.log(`✅ [ABANDON] Grace period: Room ${roomCode} has ${activeCount} active players, not abandoning`);
        }
      } catch (err) {
        console.error(`❌ [ABANDON] Exception during grace period check for room ${roomCode}:`, err);
      }
    }, ABANDONMENT_GRACE_PERIOD_MS);

    abandonmentTimers.set(roomId, timer);
  }

  cancelAbandonmentGracePeriod(roomId: string, roomCode: string): void {
    if (abandonmentTimers.has(roomId)) {
      console.log(`✅ [ABANDON] Cancelled grace period for room ${roomCode} - player reconnected`);
      clearTimeout(abandonmentTimers.get(roomId)!);
      abandonmentTimers.delete(roomId);
    }
  }

  startHostTransferGracePeriod(roomId: string, roomCode: string, originalHostUserId: string): void {
    // Clear any existing timer for this room
    if (hostTransferTimers.has(roomId)) {
      clearTimeout(hostTransferTimers.get(roomId)!.timer);
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

        interface RoomMemberWithUser {
          user_id: string;
          is_connected: boolean;
          user?: {
            display_name?: string;
          };
        }

        const originalHost = (room?.room_members as RoomMemberWithUser[] | undefined)?.find((m: RoomMemberWithUser) => m.user_id === originalHostUserId);
        const isOriginalHostConnected = originalHost?.is_connected === true;

        if (isOriginalHostConnected) {
          console.log(`✅ [HOST] Grace period: Original host ${originalHostUserId} reconnected, keeping host status`);
          return;
        }

        // Original host didn't reconnect - transfer to another player
        const otherConnectedPlayers = (room?.room_members as RoomMemberWithUser[] | undefined)?.filter((m: RoomMemberWithUser) =>
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

  cancelHostTransferGracePeriod(roomId: string, roomCode: string, reconnectingUserId: string): boolean {
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

export default RoomLifecycleManager;
