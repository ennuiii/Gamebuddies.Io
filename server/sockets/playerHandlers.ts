import type { Socket } from 'socket.io';
import type { ServerContext } from '../types';
import { sanitize } from '../lib/validation';

interface RoomParticipant {
  user_id: string;
  role: 'host' | 'player';
  is_connected: boolean;
  in_game: boolean;
  current_location: string;
  last_ping: string;
  custom_lobby_name: string | null;
  user?: {
    display_name: string | null;
    avatar_url: string | null;
    avatar_style: string | null;
    avatar_seed: string | null;
    avatar_options: Record<string, unknown> | null;
    premium_tier: string;
    level: number;
    role: string;
    username: string;
  };
}

interface RoomWithParticipants {
  id: string;
  room_code: string;
  status: string;
  participants?: RoomParticipant[];
}

/**
 * Map participants to player format for client
 */
function mapParticipantsToPlayers(participants: RoomParticipant[] | undefined) {
  return participants?.map(p => ({
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
}

/**
 * Register player-related handlers
 */
export function registerPlayerHandlers(
  socket: Socket,
  ctx: ServerContext
): void {
  const { io, db, connectionManager } = ctx;

  // Handle individual player return to lobby
  socket.on('playerReturnToLobby', async (data) => {
    try {
      console.log(`🔄 Player returning to lobby: ${data.playerName} in room ${data.roomCode}`);

      const connection = connectionManager.getConnection(socket.id);
      if (!connection?.roomId || !connection?.userId) {
        socket.emit('error', { message: 'Not in a room' });
        return;
      }

      const room = await db.getRoomByCode(data.roomCode);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      // Mark player as in lobby
      await db.adminClient
        .from('room_members')
        .update({
          in_game: false,
          is_connected: true,
          current_location: 'lobby',
          last_ping: new Date().toISOString()
        })
        .eq('user_id', connection.userId)
        .eq('room_id', room.id);

      const updatedRoom = await db.getRoomByCode(data.roomCode);

      io.to(data.roomCode).emit('playerStatusUpdated', {
        playerId: connection.userId,
        playerName: data.playerName,
        status: 'lobby',
        room: updatedRoom,
        roomVersion: Date.now()
      });

      console.log(`✅ Player ${data.playerName} marked as returned to lobby`);

    } catch (error) {
      console.error('❌ Error handling player return to lobby:', error);
      socket.emit('error', { message: 'Failed to update status' });
    }
  });

  // Handle manual host transfer
  socket.on('transferHost', async (data) => {
    try {
      console.log(`👑 Host transfer requested: ${data.targetUserId} in room ${data.roomCode}`);

      const connection = connectionManager.getConnection(socket.id);
      if (!connection?.roomId || !connection?.userId) {
        socket.emit('error', { message: 'Not in a room' });
        return;
      }

      const room = await db.getRoomByCode(data.roomCode) as RoomWithParticipants | null;
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      // Verify current user is host
      const currentParticipant = room.participants?.find(p => p.user_id === connection.userId);
      if (!currentParticipant || currentParticipant.role !== 'host') {
        socket.emit('error', { message: 'Only the host can transfer host privileges' });
        return;
      }

      // Verify target is in room
      const targetParticipant = room.participants?.find(p => p.user_id === data.targetUserId);
      if (!targetParticipant) {
        socket.emit('error', { message: 'Target player not found in room' });
        return;
      }

      // Perform transfer
      await db.transferHost(room.id, connection.userId, data.targetUserId);

      const updatedRoom = await db.getRoomByCode(data.roomCode) as RoomWithParticipants;
      const allPlayers = mapParticipantsToPlayers(updatedRoom.participants);

      io.to(data.roomCode).emit('hostTransferred', {
        oldHostId: connection.userId,
        newHostId: data.targetUserId,
        newHostName: targetParticipant.user?.display_name || 'Player',
        players: allPlayers,
        room: updatedRoom,
        roomVersion: Date.now()
      });

      console.log(`👑 Host transferred from ${currentParticipant.user?.display_name} to ${targetParticipant.user?.display_name}`);

    } catch (error) {
      console.error('❌ Error transferring host:', error);
      socket.emit('error', { message: 'Failed to transfer host' });
    }
  });

  // Handle player kick
  socket.on('kickPlayer', async (data) => {
    try {
      console.log(`👢 [KICK] Kick player requested:`, {
        targetUserId: data.targetUserId,
        roomCode: data.roomCode
      });

      const connection = connectionManager.getConnection(socket.id);
      if (!connection?.roomId || !connection?.userId) {
        socket.emit('error', { message: 'Not in a room' });
        return;
      }

      const room = await db.getRoomByCode(data.roomCode) as RoomWithParticipants | null;
      if (!room) {
        socket.emit('kickFailed', {
          reason: 'Room not found',
          error: 'ROOM_NOT_FOUND',
          targetUserId: data.targetUserId
        });
        return;
      }

      // Verify kicker is host
      const currentParticipant = room.participants?.find(p => p.user_id === connection.userId);
      if (!currentParticipant || currentParticipant.role !== 'host') {
        socket.emit('kickFailed', {
          reason: 'Only the host can kick players',
          error: 'NOT_HOST',
          targetUserId: data.targetUserId
        });
        return;
      }

      // Verify target exists and is not host
      const targetParticipant = room.participants?.find(p => p.user_id === data.targetUserId);
      if (!targetParticipant) {
        socket.emit('kickFailed', {
          reason: 'Target player not found in room',
          error: 'PLAYER_NOT_FOUND',
          targetUserId: data.targetUserId
        });
        return;
      }

      if (targetParticipant.role === 'host') {
        socket.emit('kickFailed', {
          reason: 'Cannot kick the host',
          error: 'CANNOT_KICK_HOST',
          targetUserId: data.targetUserId
        });
        return;
      }

      // Find target's socket connection
      const targetConnections = connectionManager.getUserConnections(data.targetUserId);
      const targetConnection = targetConnections[0];

      console.log(`👢 [KICK] Kicking player:`, {
        targetUserId: data.targetUserId,
        targetUsername: targetParticipant.user?.username,
        targetSocketId: targetConnection?.socketId
      });

      // Remove participant from database
      await db.removeParticipant(room.id, data.targetUserId);

      // Notify kicked player
      if (targetConnection?.socketId) {
        io.to(targetConnection.socketId).emit('playerKicked', {
          reason: 'You have been removed from the room by the host',
          kickedBy: currentParticipant.user?.display_name || 'Player',
          roomCode: data.roomCode
        });

        // Remove from socket room
        const kickedSocket = io.sockets.sockets.get(targetConnection.socketId);
        if (kickedSocket) {
          kickedSocket.leave(data.roomCode);
        }
      }

      const updatedRoom = await db.getRoomByCode(data.roomCode) as RoomWithParticipants;
      const allPlayers = mapParticipantsToPlayers(updatedRoom.participants);

      // Notify remaining players
      io.to(data.roomCode).emit('playerKicked', {
        targetUserId: data.targetUserId,
        targetName: targetParticipant.user?.display_name || 'Player',
        kickedBy: currentParticipant.user?.display_name || 'Player',
        players: allPlayers,
        room: updatedRoom,
        isNotification: true,
        roomVersion: Date.now()
      });

      // Clear target connection tracking
      if (targetConnection) {
        targetConnection.roomId = null;
        targetConnection.userId = null;
      }

      console.log(`✅ [KICK] Successfully kicked ${targetParticipant.user?.username}`);

    } catch (error) {
      console.error('❌ [KICK ERROR] Error kicking player:', error);
      socket.emit('kickFailed', {
        reason: 'Failed to kick player due to server error',
        error: 'SERVER_ERROR',
        targetUserId: data?.targetUserId
      });
    }
  });

  // Handle room status change
  socket.on('changeRoomStatus', async (data) => {
    try {
      console.log(`🔄 Room status change requested: ${data.newStatus} for room ${data.roomCode}`);

      const connection = connectionManager.getConnection(socket.id);
      if (!connection?.roomId || !connection?.userId) {
        socket.emit('error', { message: 'Not in a room' });
        return;
      }

      const room = await db.getRoomByCode(data.roomCode) as RoomWithParticipants | null;
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      const participant = room.participants?.find(p => p.user_id === connection.userId);
      if (!participant || participant.role !== 'host') {
        socket.emit('error', { message: 'Only the host can change room status' });
        return;
      }

      const validStatuses = ['lobby', 'in_game', 'returning'];
      if (!validStatuses.includes(data.newStatus)) {
        socket.emit('error', { message: 'Invalid room status' });
        return;
      }

      const updateData: Record<string, unknown> = { status: data.newStatus };
      if (data.newStatus === 'lobby') {
        updateData.current_game = null;
      }

      await db.updateRoom(room.id, updateData);

      const updatedRoom = await db.getRoomByCode(data.roomCode);

      io.to(data.roomCode).emit('roomStatusChanged', {
        oldStatus: room.status,
        newStatus: data.newStatus,
        room: updatedRoom,
        changedBy: participant.user?.display_name || 'Player',
        roomVersion: Date.now()
      });

      console.log(`🔄 Room ${room.room_code} status changed to '${data.newStatus}'`);

    } catch (error) {
      console.error('❌ Error changing room status:', error);
      socket.emit('error', { message: 'Failed to change room status' });
    }
  });

  // Handle automatic room status updates
  socket.on('autoUpdateRoomStatus', async (data) => {
    try {
      console.log(`🤖 Auto-updating room status: ${data.newStatus} for room ${data.roomCode}`);

      const connection = connectionManager.getConnection(socket.id);
      if (!connection?.roomId || !connection?.userId) {
        console.log(`❌ Auto status update failed: socket not in room`);
        return;
      }

      const room = await db.getRoomByCode(data.roomCode) as RoomWithParticipants | null;
      if (!room) {
        console.log(`❌ Auto status update failed: room not found`);
        return;
      }

      const participant = room.participants?.find(p => p.user_id === connection.userId);
      if (!participant || participant.role !== 'host') {
        console.log(`❌ Auto status update failed: user is not host`);
        return;
      }

      // Map client status to server status
      let serverStatus = data.newStatus;
      if (data.newStatus === 'waiting_for_players') {
        serverStatus = 'lobby';
      } else if (data.newStatus === 'in_game') {
        serverStatus = 'in_game';
      }

      if (room.status === serverStatus) {
        return;
      }

      const validStatuses = ['lobby', 'in_game', 'returning'];
      if (!validStatuses.includes(serverStatus)) {
        return;
      }

      const updateData: Record<string, unknown> = { status: serverStatus };
      if (serverStatus === 'lobby') {
        updateData.current_game = null;
      }

      await db.updateRoom(room.id, updateData);

      const updatedRoom = await db.getRoomByCode(data.roomCode);

      io.to(data.roomCode).emit('roomStatusChanged', {
        oldStatus: room.status,
        newStatus: serverStatus,
        room: updatedRoom,
        changedBy: `${participant.user?.display_name || 'Player'} (auto)`,
        reason: data.reason,
        isAutomatic: true,
        roomVersion: Date.now()
      });

      console.log(`🤖 Room ${room.room_code} status auto-changed to '${serverStatus}'`);

    } catch (error) {
      console.error('❌ Error auto-updating room status:', error);
    }
  });

  // Handle profile updates
  socket.on('profile_updated', async (data) => {
    try {
      const roomCode = sanitize.roomCode(data?.roomCode);
      if (!roomCode || roomCode.length !== 6) {
        return;
      }

      if (!data?.userId || typeof data.userId !== 'string') {
        return;
      }

      const sanitizedData = {
        userId: data.userId,
        displayName: (data.displayName || '').substring(0, 30),
        avatarUrl: (data.avatarUrl || '').substring(0, 500),
        avatarStyle: (data.avatarStyle || '').substring(0, 50),
        avatarSeed: (data.avatarSeed || '').substring(0, 100),
        avatarOptions: sanitize.gameSettings(data.avatarOptions || {})
      };

      console.log(`👤 [PROFILE] Profile update for user ${sanitizedData.userId} in room ${roomCode}`);

      io.to(roomCode).emit('profile_updated', sanitizedData);

      console.log(`👤 [PROFILE] Broadcasted profile update to room ${roomCode}`);
    } catch (error) {
      console.error('❌ Error broadcasting profile update:', error);
    }
  });
}
