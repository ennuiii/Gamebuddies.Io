import { Server } from 'socket.io';
import type http from 'http';
import type { ServerContext, GameState } from '../types';
import { registerChatHandlers } from './chatHandlers';
import { registerFriendHandlers, notifyFriendsOffline } from './friendHandlers';
import { registerConnectionHandlers } from './connectionHandlers';
import { registerRoomHandlers } from './roomHandlers';
import { registerGameHandlers } from './gameHandlers';
import { registerPlayerHandlers } from './playerHandlers';
import { autoUpdateRoomStatusByHost } from '../services/roomStatusService';

// In-memory game state (shared across handlers)
const gameState: GameState = {
  tugOfWarState: new Map(),
  tugOfWarTeams: new Map(),
  roomActivityCache: new Map()
};

// Host transfer grace period tracking
const hostTransferGracePeriods = new Map<string, NodeJS.Timeout>();

/**
 * Start a grace period before transferring host after disconnect
 */
function startHostTransferGracePeriod(
  ctx: ServerContext,
  roomId: string,
  roomCode: string,
  disconnectedHostId: string
): void {
  const { io, db, roomLifecycleManager } = ctx;
  const gracePeriodMs = 30000; // 30 seconds

  // Clear any existing grace period for this room
  const existingTimeout = hostTransferGracePeriods.get(roomId);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  console.log(`⏳ [HOST] Starting ${gracePeriodMs / 1000}s grace period for host transfer in room ${roomCode}`);

  const timeout = setTimeout(async () => {
    try {
      // Check if original host reconnected
      const room = await db.getRoomById(roomId);
      if (!room) {
        console.log(`⏳ [HOST] Grace period expired but room ${roomCode} no longer exists`);
        hostTransferGracePeriods.delete(roomId);
        return;
      }

      const originalHostParticipant = room.participants?.find(
        (p: { user_id: string; is_connected: boolean }) => p.user_id === disconnectedHostId
      );

      // If original host reconnected, don't transfer
      if (originalHostParticipant?.is_connected) {
        console.log(`⏳ [HOST] Original host ${disconnectedHostId} reconnected - cancelling transfer`);
        hostTransferGracePeriods.delete(roomId);
        return;
      }

      // Transfer host to next eligible player
      console.log(`⏳ [HOST] Grace period expired - transferring host for room ${roomCode}`);
      const newHost = await db.autoTransferHost(roomId, disconnectedHostId);

      if (newHost) {
        // Get updated room data
        const updatedRoom = await db.getRoomById(roomId);
        const allPlayers = updatedRoom?.participants?.map((p: any) => ({
          id: p.user_id,
          name: p.custom_lobby_name || p.user?.display_name || 'Player',
          isHost: p.role === 'host',
          isConnected: p.is_connected,
          inGame: p.in_game,
          currentLocation: p.current_location || (p.is_connected ? 'lobby' : 'disconnected'),
          lastPing: p.last_ping,
          premiumTier: p.user?.premium_tier || 'free',
          role: p.user?.role || 'user',
          avatarUrl: p.user?.avatar_url,
          avatarStyle: p.user?.avatar_style,
          avatarSeed: p.user?.avatar_seed,
          avatarOptions: p.user?.avatar_options,
          level: p.user?.level || 1,
          socketId: null
        })) || [];

        // Broadcast host transfer
        io.to(roomCode).emit('hostTransferred', {
          oldHostId: disconnectedHostId,
          newHostId: newHost.user_id,
          newHostName: newHost.user?.display_name || 'Player',
          reason: 'host_disconnect_grace_period_expired',
          players: allPlayers,
          room: updatedRoom,
          roomVersion: Date.now()
        });

        console.log(`👑 [HOST] Host transferred to ${newHost.user?.display_name || 'Player'} after grace period`);
      }

      hostTransferGracePeriods.delete(roomId);

    } catch (error) {
      console.error('❌ [HOST] Error during grace period host transfer:', error);
      hostTransferGracePeriods.delete(roomId);
    }
  }, gracePeriodMs);

  hostTransferGracePeriods.set(roomId, timeout);
}

/**
 * Initialize Socket.IO with all handlers
 */
export function initializeSocketIO(
  httpServer: http.Server,
  ctx: Omit<ServerContext, 'io'>
): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Allow all gamebuddies.io and onrender.com origins
        if (!origin) {
          callback(null, true);
          return;
        }
        try {
          const { hostname } = new URL(origin);
          if (
            hostname === 'localhost' ||
            hostname === 'gamebuddies.io' ||
            hostname.endsWith('.gamebuddies.io') ||
            hostname.endsWith('.onrender.com')
          ) {
            callback(null, true);
            return;
          }
        } catch {
          // Invalid URL
        }
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Create full context with io
  const fullCtx: ServerContext = { ...ctx, io };

  // Handle new connections
  io.on('connection', async (socket) => {
    console.log(`🔌 User connected: ${socket.id}`);

    // Store connection info
    fullCtx.connectionManager.addConnection(socket.id);

    // Register all handlers
    registerChatHandlers(socket, fullCtx, gameState);
    registerFriendHandlers(socket, fullCtx);
    registerConnectionHandlers(socket, fullCtx);
    registerRoomHandlers(socket, fullCtx);
    registerGameHandlers(socket, fullCtx);
    registerPlayerHandlers(socket, fullCtx);

    // Handle disconnection
    socket.on('disconnect', async () => {
      try {
        console.log(`🔌 User disconnected: ${socket.id}`);

        const connection = fullCtx.connectionManager.removeConnection(socket.id);
        if (connection?.userId) {
          // Notify friends of disconnection
          await notifyFriendsOffline(fullCtx, connection.userId);

          // Check if disconnecting user is the host
          let isDisconnectingHost = false;
          let room: any = null;
          let disconnectingParticipant: any = null;

          if (connection.roomId) {
            room = await fullCtx.db.getRoomById(connection.roomId);
            disconnectingParticipant = room?.participants?.find(
              (p: { user_id: string }) => p.user_id === connection.userId
            );
            isDisconnectingHost = disconnectingParticipant?.role === 'host';
          }

          // Determine connection status
          let connectionStatus = 'disconnected';
          if (room && disconnectingParticipant) {
            if (room.status === 'in_game' && disconnectingParticipant.in_game === true) {
              connectionStatus = 'game';
              console.log(`🎮 Player ${disconnectingParticipant.user?.username} disconnected but in game`);
            } else {
              console.log(`🔌 Player ${disconnectingParticipant.user?.username} disconnected`);
            }
          }

          // Update participant connection status
          await fullCtx.db.updateParticipantConnection(
            connection.userId,
            socket.id,
            connectionStatus
          );

          // Auto-update room status if host
          if (isDisconnectingHost && connectionStatus && room) {
            await autoUpdateRoomStatusByHost(io, fullCtx.db, room.id, connection.userId, connectionStatus);
          }

          // Handle host disconnect with grace period
          if (isDisconnectingHost && room) {
            const otherConnectedPlayers = room.participants?.filter(
              (p: { user_id: string; is_connected: boolean }) =>
                p.user_id !== connection.userId && p.is_connected === true
            ) || [];

            if (otherConnectedPlayers.length > 0) {
              console.log(`⏳ [HOST] Host ${connection.userId} disconnected - starting grace period`);
              startHostTransferGracePeriod(fullCtx, room.id, room.room_code, connection.userId);
            }
          }

          // Notify other players about disconnection
          if (connection.roomId && room) {
            const updatedRoom = await fullCtx.db.getRoomById(connection.roomId);
            const allPlayers = updatedRoom?.participants?.map((p: any) => ({
              id: p.user_id,
              name: p.custom_lobby_name || p.user?.display_name || 'Player',
              isHost: p.role === 'host',
              isConnected: p.is_connected,
              inGame: p.in_game,
              currentLocation: p.current_location || (p.is_connected ? 'lobby' : 'disconnected'),
              lastPing: p.last_ping,
              premiumTier: p.user?.premium_tier || 'free',
              role: p.user?.role || 'user',
              avatarUrl: p.user?.avatar_url,
              avatarStyle: p.user?.avatar_style,
              avatarSeed: p.user?.avatar_seed,
              avatarOptions: p.user?.avatar_options,
              level: p.user?.level || 1,
              socketId: null
            })) || [];

            // Send player disconnected event
            socket.to(room.room_code).emit('playerDisconnected', {
              playerId: connection.userId,
              wasHost: isDisconnectingHost,
              players: allPlayers,
              room: updatedRoom,
              roomVersion: Date.now()
            });

            // Check if room is now empty - start grace period
            const connectedPlayers = updatedRoom?.participants?.filter(
              (p: { is_connected: boolean }) => p.is_connected
            ) || [];
            if (connectedPlayers.length === 0) {
              console.log(`⏳ [ABANDON] Room ${room.room_code} has no connected players - starting grace period`);
              fullCtx.roomLifecycleManager.startAbandonmentGracePeriod(room.id, room.room_code);
            }
          }
        }

      } catch (error) {
        console.error('❌ Error handling disconnect:', error);
      }
    });
  });

  console.log('✅ Socket.IO initialized with all handlers');

  return io;
}

/**
 * Get the game state (for testing or debugging)
 */
export function getGameState(): GameState {
  return gameState;
}

/**
 * Clear host transfer grace period (for cleanup)
 */
export function clearHostTransferGracePeriod(roomId: string): void {
  const timeout = hostTransferGracePeriods.get(roomId);
  if (timeout) {
    clearTimeout(timeout);
    hostTransferGracePeriods.delete(roomId);
  }
}
