import type { Socket } from 'socket.io';
import type { ServerContext } from '../types';
import { sanitize } from '../lib/validation';
import { SOCKET_EVENTS, SERVER_EVENTS } from '../../shared/constants';

// Extend Socket type to include userId
declare module 'socket.io' {
  interface Socket {
    userId?: string;
  }
}

/**
 * Register friend system handlers
 */
export function registerFriendHandlers(
  socket: Socket,
  ctx: ServerContext
): void {
  const { io, db, connectionManager } = ctx;

  // Friend System: Identify User (Central Server Implementation)
  socket.on(SOCKET_EVENTS.USER.IDENTIFY, async (userId: string) => {
    if (!userId) return;

    // Join user-specific room for targeting
    socket.join(`user:${userId}`);

    // Store userId on socket and connection manager
    socket.userId = userId;
    const conn = connectionManager.getConnection(socket.id);
    if (conn) conn.userId = userId;

    try {
      // Fetch friends directly from DB
      const { data: friendships, error } = await db.adminClient
        .from('friendships')
        .select('friend_id, user_id')
        .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
        .eq('status', 'accepted');

      if (error) {
        console.error('❌ [Friends] Failed to fetch friends:', error);
        return;
      }

      // Extract Friend IDs
      const friendIds = (friendships || []).map(f =>
        f.user_id === userId ? f.friend_id : f.user_id
      );

      // Notify online friends & Build online list
      const onlineFriends: string[] = [];

      for (const friendId of friendIds) {
        const friendRoom = `user:${friendId}`;
        const room = io.sockets.adapter.rooms.get(friendRoom);
        const isOnline = room && room.size > 0;

        if (isOnline) {
          onlineFriends.push(friendId);
          // Notify this friend that user is online
          io.to(friendRoom).emit(SERVER_EVENTS.FRIEND.ONLINE, { userId });
        }
      }

      // Send online friends list to this user
      socket.emit(SERVER_EVENTS.FRIEND.LIST_ONLINE, { onlineUserIds: onlineFriends });

    } catch (error) {
      console.error('Error in user:identify:', error);
    }
  });

  // Friend System: Game Invite
  socket.on(SOCKET_EVENTS.GAME.INVITE, (data) => {
    // Validate targetUserId exists and is a string (client sends targetUserId, not friendId)
    if (!data?.targetUserId || typeof data.targetUserId !== 'string') {
      return;
    }

    console.log('📨 [SERVER] game:invite received:', data);

    // Forward invite to specific friend with sanitized data
    // Note: client sends roomCode, we forward as roomId for consistency
    const forwardData = {
      roomId: sanitize.roomCode(data.roomCode) || '',
      gameName: (data.gameName || '').substring(0, 50),
      gameThumbnail: (data.gameThumbnail || '').substring(0, 200),
      hostName: (data.hostName || 'Host').substring(0, 30),
      senderId: socket.userId
    };

    console.log('📨 [SERVER] Forwarding game:invite_received to user:', data.targetUserId, 'with data:', forwardData);
    io.to(`user:${data.targetUserId}`).emit(SERVER_EVENTS.GAME.INVITE_RECEIVED, forwardData);
  });
}

/**
 * Handle friend offline notification on disconnect
 */
export async function notifyFriendsOffline(
  ctx: ServerContext,
  userId: string
): Promise<void> {
  const { io, db } = ctx;

  try {
    const { data: friendships } = await db.adminClient
      .from('friendships')
      .select('friend_id, user_id')
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
      .eq('status', 'accepted');

    if (friendships) {
      const friendIds = friendships.map(f =>
        f.user_id === userId ? f.friend_id : f.user_id
      );
      for (const friendId of friendIds) {
        io.to(`user:${friendId}`).emit(SERVER_EVENTS.FRIEND.OFFLINE, { userId });
      }
    }
  } catch (e) {
    console.error('❌ Error broadcasting friend offline status:', e);
  }
}
