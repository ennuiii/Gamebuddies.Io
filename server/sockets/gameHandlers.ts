import crypto from 'crypto';
import type { Socket } from 'socket.io';
import type { ServerContext } from '../types';
import { validators, sanitize } from '../lib/validation';
import ProxyManager from '../lib/proxyManager';

// Create singleton proxy manager instance for game handlers
const proxyManager = new ProxyManager();

interface RoomParticipant {
  user_id: string;
  role: 'host' | 'player';
  is_connected: boolean;
  in_game: boolean;
  current_location: string;
  custom_lobby_name: string | null;
  user?: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    avatar_style: string | null;
    avatar_seed: string | null;
    avatar_options: Record<string, unknown> | null;
    premium_tier: string;
    level: number;
    role: string;
  };
}

interface RoomWithParticipants {
  id: string;
  room_code: string;
  current_game: string | null;
  status: string;
  streamer_mode: boolean;
  participants?: RoomParticipant[];
}

/**
 * Register game-related handlers
 */
export function registerGameHandlers(
  socket: Socket,
  ctx: ServerContext
): void {
  const { io, db, connectionManager } = ctx;

  // Handle game selection
  socket.on('selectGame', async (data) => {
    try {
      const connection = connectionManager.getConnection(socket.id);
      console.log(`🎮 [DEBUG] Game selection from socket: ${socket.id}`);

      if (!connection?.roomId) {
        socket.emit('error', { message: 'Not in a room', code: 'NOT_IN_ROOM' });
        return;
      }

      // Validate gameType
      const validation = await validators.selectGame({
        roomCode: connection.roomCode || 'AAAAAA',
        gameType: data?.gameType
      });

      if (!validation.isValid) {
        return socket.emit('error', { message: validation.message, code: 'INVALID_INPUT' });
      }

      const validatedData = validation.value as { roomCode: string; gameType: string };

      // Sanitize game settings
      const cleanSettings = sanitize.gameSettings(data?.settings || {});

      // Update room with selected game
      const updatedRoom = await db.updateRoom(connection.roomId, {
        current_game: validatedData.gameType,
        game_settings: cleanSettings
      });

      // Notify all players
      io.to(updatedRoom.room_code).emit('gameSelected', {
        gameType: validatedData.gameType,
        settings: cleanSettings,
        roomVersion: Date.now()
      });

      console.log(`🎮 Game selected: ${validatedData.gameType} for room ${updatedRoom.room_code}`);

    } catch (error) {
      console.error('❌ Error selecting game:', error);
      socket.emit('error', { message: 'Failed to select game', code: 'SELECT_GAME_ERROR' });
    }
  });

  // Handle game start
  socket.on('startGame', async (data) => {
    console.log(`🚀 [START GAME] ============ START GAME EVENT RECEIVED ============`);
    console.log(`🚀 [START GAME] Socket ID: ${socket.id}, Timestamp: ${new Date().toISOString()}`);

    try {
      const connection = connectionManager.getConnection(socket.id);

      if (!connection?.roomId) {
        console.error(`❌ [START GAME] Connection has no roomId`);
        socket.emit('error', { message: 'Not in a room' });
        return;
      }

      // Get room data
      const room = await db.getRoomByCode(data.roomCode) as RoomWithParticipants | null;
      if (!room) {
        console.error(`❌ [START GAME] Room not found for code: ${data.roomCode}`);
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      console.log(`✅ [START GAME] Room found:`, {
        id: room.id,
        room_code: room.room_code,
        status: room.status,
        current_game: room.current_game,
        participants_count: room.participants?.length || 0
      });

      // Verify user is host
      const userParticipant = room.participants?.find(p =>
        p.user_id === connection.userId && p.role === 'host'
      );

      if (!userParticipant) {
        console.error(`❌ [START GAME] User is not host or not found in room`);
        socket.emit('error', { message: 'Only the host can start the game' });
        return;
      }

      console.log(`✅ [START GAME] Host validation passed`);

      // Update room status
      await db.updateRoom(room.id, {
        status: 'in_game',
        game_started_at: new Date().toISOString()
      });

      // Mark all connected participants as in_game
      const connectedParticipants = room.participants?.filter(p => p.is_connected === true) || [];
      const connectedUserIds = connectedParticipants.map(p => p.user_id);

      if (connectedUserIds.length > 0) {
        await db.adminClient
          .from('room_members')
          .update({ in_game: true, current_location: 'game' })
          .eq('room_id', room.id)
          .in('user_id', connectedUserIds);
      }

      console.log(`🎮 [START GAME] Marked ${connectedParticipants.length} participants as in_game`);

      // Broadcast player status update
      const updatedRoomForBroadcast = await db.getRoomByCode(room.room_code) as RoomWithParticipants;
      const allPlayersForBroadcast = updatedRoomForBroadcast.participants?.map(p => ({
        id: p.user_id,
        name: p.custom_lobby_name || p.user?.display_name || 'Player',
        isHost: p.role === 'host',
        isConnected: p.is_connected,
        inGame: p.in_game,
        currentLocation: p.current_location,
        premiumTier: p.user?.premium_tier || 'free',
        role: p.user?.role || 'user',
        avatarUrl: p.user?.avatar_url,
        avatarStyle: p.user?.avatar_style,
        avatarSeed: p.user?.avatar_seed,
        avatarOptions: p.user?.avatar_options,
        level: p.user?.level || 1
      })) || [];

      io.to(room.room_code).emit('playerStatusUpdated', {
        status: 'game',
        reason: 'game_started',
        players: allPlayersForBroadcast,
        room: updatedRoomForBroadcast,
        source: 'startGame',
        timestamp: new Date().toISOString(),
        roomVersion: Date.now()
      });

      // Get game proxy configuration
      const gameProxy = proxyManager.gameProxies[room.current_game || ''];
      if (!gameProxy) {
        socket.emit('error', { message: 'Game not supported' });
        return;
      }

      const participants = room.participants?.filter(p => p.is_connected === true) || [];
      const isStreamerMode = room.streamer_mode || false;

      // Generate session tokens for all players
      const sessionTokens: Record<string, string> = {};
      const sessionInserts: any[] = [];

      for (const participant of participants) {
        const sessionToken = crypto.randomBytes(32).toString('hex');
        sessionTokens[participant.user_id] = sessionToken;

        sessionInserts.push({
          session_token: sessionToken,
          room_id: room.id,
          room_code: room.room_code,
          player_id: participant.user_id,
          game_type: room.current_game,
          streamer_mode: isStreamerMode,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          metadata: {
            player_name: participant.custom_lobby_name || participant.user?.display_name || 'Player',
            is_host: participant.role === 'host',
            total_players: participants.length,
            premium_tier: participant.user?.premium_tier || 'free',
            avatar_url: participant.user?.avatar_url,
            avatar_style: participant.user?.avatar_style,
            avatar_seed: participant.user?.avatar_seed,
            avatar_options: participant.user?.avatar_options
          }
        });

        console.log(`🔐 [SECURE SESSION] Generated token for ${participant.user?.username}`);
      }

      // Batch insert sessions
      if (sessionInserts.length > 0) {
        const { error: sessionInsertError } = await db.adminClient
          .from('game_sessions')
          .insert(sessionInserts);

        if (sessionInsertError) {
          console.error(`❌ [SECURE SESSION] Failed to batch insert sessions:`, sessionInsertError);
        } else {
          console.log(`✅ [SECURE SESSION] Batch inserted ${sessionInserts.length} session tokens`);
        }
      }

      // Send game URLs to participants
      participants.forEach(p => {
        const sessionToken = sessionTokens[p.user_id];
        const roleParam = p.role === 'host' ? '&role=gm' : '';
        const gameUrl = `${gameProxy.path}?session=${sessionToken}${roleParam}`;

        const delay = p.role === 'host' ? 0 : 2000;

        // Find socket ID for this user
        const userConnections = connectionManager.getUserConnections(p.user_id);
        const userConnection = userConnections.length > 0 ? userConnections[0] : null;
        const currentSocketId = userConnection?.socketId;

        console.log(`🚀 [START GAME] Sending game event to ${p.user?.username}:`, {
          user_id: p.user_id,
          role: p.role,
          hasUserConnection: !!userConnection,
          selectedSocketId: currentSocketId,
          delay
        });

        if (currentSocketId) {
          setTimeout(() => {
            console.log(`📤 [START GAME] Emitting gameStarted to ${p.user?.username} (${currentSocketId})`);
            io.to(currentSocketId).emit('gameStarted', {
              gameUrl,
              gameType: room.current_game,
              isHost: p.role === 'host',
              roomCode: room.room_code,
              roomVersion: Date.now()
            });
          }, delay);
        } else {
          console.error(`❌ [START GAME] No socket connection found for ${p.user?.username}`);
        }
      });

      console.log(`🚀 [START GAME] Game start complete for room ${room.room_code}`);
      console.log(`🚀 [START GAME] ============ END START GAME PROCESSING ============`);

    } catch (error) {
      console.error('❌ [START GAME] CRITICAL ERROR:', error);
      socket.emit('error', { message: 'Failed to start game' });
    }
  });
}
