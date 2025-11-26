import type { Socket } from 'socket.io';
import type { ServerContext } from '../types';
import { validators, sanitize, rateLimits } from '../lib/validation';
import { autoUpdateRoomStatusByHost, autoUpdateRoomStatusBasedOnPlayerStates } from '../services/roomStatusService';
import { SOCKET_EVENTS, SERVER_EVENTS } from '../../shared/constants';

interface RoomParticipant {
  id: string;
  user_id: string;
  role: 'host' | 'player';
  is_connected: boolean;
  in_game: boolean;
  current_location: string;
  last_ping: string;
  custom_lobby_name: string | null;
  joined_at: string;
  user?: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    avatar_style: string | null;
    avatar_seed: string | null;
    avatar_options: Record<string, unknown> | null;
    premium_tier: string;
    level: number;
    role: string;
    external_id?: string;
    is_guest?: boolean;
  };
}

interface RoomWithParticipants {
  id: string;
  room_code: string;
  host_id: string;
  status: string;
  current_game: string | null;
  max_players: number;
  streamer_mode: boolean;
  is_public: boolean;
  metadata?: {
    created_by_name?: string;
    original_host_id?: string;
  };
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
    isGuest: p.user?.is_guest ?? false,
    socketId: null
  })) || [];
}

/**
 * Register room-related handlers
 */
export function registerRoomHandlers(
  socket: Socket,
  ctx: ServerContext
): void {
  const { io, db, connectionManager, roomLifecycleManager } = ctx;

  // Handle room creation
  socket.on(SOCKET_EVENTS.ROOM.CREATE, async (data) => {
    try {
      // Validate input
      const validation = await validators.createRoom(data);
      if (!validation.isValid) {
        socket.emit('error', {
          message: validation.message,
          code: 'INVALID_INPUT'
        });
        return;
      }

      // Check rate limiting
      const createRoomLimit = rateLimits.createRoom as { max: number; window: number };
      if (connectionManager.isRateLimited(socket.id, 'createRoom', createRoomLimit.max)) {
        socket.emit('error', {
          message: 'Too many room creation attempts. Please wait a moment.',
          code: 'RATE_LIMITED'
        });
        return;
      }

      // Sanitize input
      const playerName = sanitize.playerName(data.playerName);
      const customLobbyName = data.customLobbyName ? sanitize.playerName(data.customLobbyName) : null;
      const streamerMode = data.streamerMode || false;
      const isPublic = data.isPublic !== undefined ? data.isPublic : true;
      const supabaseUserId = data.supabaseUserId || null;

      console.log(`🏠 [SUPABASE] Creating room for ${playerName}`, {
        customLobbyName,
        streamerMode,
        isPublic,
        isAuthenticated: !!supabaseUserId,
        supabaseUserId
      });

      let user;
      if (supabaseUserId) {
        // Authenticated user - get existing user from database
        const { data: existingUser, error } = await db.adminClient
          .from('users')
          .select('*')
          .eq('id', supabaseUserId)
          .single();

        if (error || !existingUser) {
          console.error(`❌ Failed to find authenticated user:`, error);
          socket.emit('error', {
            message: 'User account not found. Please try logging in again.',
            code: 'USER_NOT_FOUND'
          });
          return;
        }

        user = existingUser;
      } else {
        // Guest user - create temporary user profile
        user = await db.getOrCreateUser(
          `${socket.id}_${playerName}`,
          playerName,
          playerName,
          { is_guest: true }
        );
      }

      // Create room in database
      const room = await db.createRoom({
        host_id: user.id,
        current_game: null,
        status: 'lobby',
        is_public: isPublic,
        max_players: 30,
        streamer_mode: streamerMode,
        game_settings: {},
        metadata: {
          created_by_name: playerName,
          created_from: 'web_client',
          original_host_id: user.id
        }
      } as any);

      // Add creator as participant
      await db.addParticipant(room.id, user.id, socket.id, 'host', customLobbyName);

      // Handle isHostHint for host promotion
      let userRole = 'host';
      try {
        const clientIsHostHint = data && data.isHostHint === true;
        const roomHasHost = Array.isArray(room.participants) && room.participants.some((p: any) => p.role === 'host');
        if (clientIsHostHint && !roomHasHost && user && user.id) {
          await db.adminClient
            .from('room_members')
            .update({ role: 'host' })
            .eq('room_id', room.id)
            .eq('user_id', user.id);

          await db.adminClient
            .from('rooms')
            .update({ host_id: user.id })
            .eq('id', room.id);

          userRole = 'host';
        }
      } catch (e) {
        console.error('[REJOINING DEBUG] Failed to promote host from hint:', (e as Error)?.message || e);
      }

      // Join socket room
      socket.join(room.room_code);

      // Update connection tracking
      connectionManager.updateConnection(socket.id, {
        userId: user.id,
        username: playerName,
        roomId: room.id,
        roomCode: room.room_code
      });

      // Send success response
      socket.emit(SERVER_EVENTS.ROOM.CREATED, {
        roomCode: room.room_code,
        isHost: true,
        room: {
          ...room,
          players: [{
            id: user.id,
            name: customLobbyName || user.display_name || playerName,
            isHost: true,
            isConnected: true,
            inGame: false,
            currentLocation: 'lobby',
            lastPing: new Date().toISOString(),
            premiumTier: user.premium_tier || 'free',
            avatarUrl: user.avatar_url,
            avatarStyle: user.avatar_style,
            avatarSeed: user.avatar_seed,
            avatarOptions: user.avatar_options,
            socketId: socket.id
          }]
        }
      });

      console.log(`🎉 [SUCCESS] Room ${room.room_code} created by ${playerName}`);

    } catch (error) {
      console.error('❌ [ERROR] Room creation failed:', error);
      socket.emit('error', {
        message: 'Failed to create room. Please try again.',
        code: 'ROOM_CREATION_FAILED',
        debug: { error_message: (error as Error).message }
      });
    }
  });

  // Handle getting public rooms for browsing
  socket.on(SOCKET_EVENTS.ROOM.GET_PUBLIC, async (data) => {
    try {
      console.log('🔍 [PUBLIC ROOMS] Fetching public rooms...', data);
      const { gameType } = data || {};

      let query = db.adminClient
        .from('rooms')
        .select(`
          id,
          room_code,
          status,
          current_game,
          max_players,
          created_at,
          metadata,
          streamer_mode,
          host:users!host_id(id, username, display_name, avatar_url, premium_tier, role, avatar_style, avatar_seed, avatar_options),
          members:room_members(
            id,
            is_connected,
            role,
            custom_lobby_name,
            last_ping,
            user:users(id, username, display_name, avatar_url, premium_tier, role, avatar_style, avatar_seed, avatar_options)
          )
        `)
        .eq('is_public', true)
        .in('status', ['lobby', 'in_game']);

      if (gameType && gameType !== 'all') {
        query = query.eq('current_game', gameType);
      }

      const { data: rooms, error } = await query
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('❌ [PUBLIC ROOMS] Database error:', error);
        throw error;
      }

      // Filter to only rooms with at least one recently active connected member
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const activeRooms = (rooms || []).filter((room: any) => {
        const connectedMembers = room.members?.filter((m: any) => m.is_connected) || [];
        const recentlyActiveMembers = room.members?.filter((m: any) =>
          m.is_connected && new Date(m.last_ping) > fiveMinutesAgo
        ) || [];
        return connectedMembers.length > 0 && recentlyActiveMembers.length > 0;
      });

      console.log(`✅ [PUBLIC ROOMS] Found ${activeRooms.length} active public rooms`);
      socket.emit(SERVER_EVENTS.ROOM.PUBLIC_LIST, { rooms: activeRooms });

    } catch (error) {
      console.error('❌ [PUBLIC ROOMS] Error:', error);
      socket.emit('error', {
        message: 'Failed to load public rooms. Please try again.',
        code: 'PUBLIC_ROOMS_ERROR'
      });
    }
  });

  // Handle socket room joining for listening only
  socket.on(SOCKET_EVENTS.ROOM.JOIN_SOCKET, (data) => {
    try {
      const roomCode = sanitize.roomCode(data?.roomCode);
      if (!roomCode || roomCode.length !== 6) {
        return socket.emit('error', { message: 'Invalid room code', code: 'INVALID_ROOM_CODE' });
      }

      console.log(`🔗 [SOCKET ROOM] Joining socket room: ${roomCode}`);
      socket.join(roomCode);

      const existingConnection = connectionManager.getConnection(socket.id);
      if (existingConnection) {
        connectionManager.updateConnection(socket.id, {
          ...existingConnection,
          roomCode: roomCode
        });
        console.log(`✅ [SOCKET ROOM] Joined room ${roomCode} and updated connectionManager`);
      }
    } catch (error) {
      console.error('❌ [SOCKET ROOM] Error joining socket room:', error);
    }
  });

  // Handle room joining
  socket.on(SOCKET_EVENTS.ROOM.JOIN, async (data) => {
    try {
      // Validate input
      const validation = await validators.joinRoom(data);
      if (!validation.isValid) {
        socket.emit('error', {
          message: validation.message,
          code: 'INVALID_INPUT'
        });
        return;
      }

      // Check rate limiting
      const joinRoomLimit = rateLimits.joinRoom as { max: number; window: number };
      if (connectionManager.isRateLimited(socket.id, 'joinRoom', joinRoomLimit.max)) {
        socket.emit('error', {
          message: 'Too many join attempts. Please wait a moment.',
          code: 'RATE_LIMITED'
        });
        return;
      }

      // Sanitize input
      const playerName = sanitize.playerName(data.playerName);
      let customLobbyName = data.customLobbyName ? sanitize.playerName(data.customLobbyName) : null;
      const roomCode = sanitize.roomCode(data.roomCode);
      const supabaseUserId = data.supabaseUserId || null;

      console.log(`🚪 [JOIN] Join request:`, { playerName, roomCode, isAuthenticated: !!supabaseUserId });

      // Acquire connection lock
      if (!connectionManager.acquireLock(playerName, roomCode, socket.id)) {
        socket.emit('error', {
          message: 'Another connection attempt is in progress. Please wait.',
          code: 'CONNECTION_IN_PROGRESS'
        });
        return;
      }

      try {
        // Get room from database
        const room = await db.getRoomByCode(data.roomCode) as RoomWithParticipants | null;
        if (!room) {
          socket.emit('error', {
            message: 'Room not found. The room may have been cleaned up or expired.',
            code: 'ROOM_NOT_FOUND'
          });
          return;
        }

        // Cancel abandonment grace period when a player joins
        roomLifecycleManager.cancelAbandonmentGracePeriod(room.id, room.room_code);

        // Cancel host transfer grace period if original host reconnects
        if (supabaseUserId) {
          roomLifecycleManager.cancelHostTransferGracePeriod(room.id, room.room_code, supabaseUserId);
        }

        // Check if room is full
        const connectedPlayers = room.participants?.filter(p => p.is_connected === true).length || 0;
        if (connectedPlayers >= room.max_players) {
          socket.emit('error', { message: 'Room is full. Cannot join.', code: 'ROOM_FULL' });
          return;
        }

        // Check if room is accepting players
        const isOriginalCreator = room.metadata?.created_by_name === data.playerName;
        let isPreviousParticipant = false;

        if (room.status === 'abandoned') {
          if (supabaseUserId) {
            isPreviousParticipant = room.participants?.some(p => p.user_id === supabaseUserId) || false;
          }
          if (!isPreviousParticipant && data.playerName) {
            isPreviousParticipant = room.participants?.some(p =>
              p.user?.username === data.playerName ||
              p.user?.display_name === data.playerName ||
              p.custom_lobby_name === data.playerName
            ) || false;
          }
        }

        if (room.status !== 'lobby' && room.status !== 'in_game' && !isOriginalCreator && !isPreviousParticipant) {
          socket.emit('error', {
            message: `Room is ${room.status} and not accepting new players.`,
            code: 'ROOM_NOT_ACCEPTING'
          });
          return;
        }

        // Check for existing participant (for rejoining)
        let existingParticipant: RoomParticipant | undefined;
        let matchMethod: string | null = null;

        if (supabaseUserId) {
          existingParticipant = room.participants?.find(p => p.user_id === supabaseUserId);
          if (existingParticipant) matchMethod = 'supabaseUserId';
        }

        if (!existingParticipant && data.playerName) {
          existingParticipant = room.participants?.find(p =>
            p.user?.username === data.playerName ||
            p.user?.display_name === data.playerName ||
            p.custom_lobby_name === data.playerName
          );
          if (existingParticipant) {
            matchMethod = existingParticipant.user?.username === data.playerName ? 'username' :
              existingParticipant.user?.display_name === data.playerName ? 'display_name' : 'custom_lobby_name';
          }
        }

        if (!existingParticipant && data.isHostHint) {
          existingParticipant = room.participants?.find(p => p.role === 'host');
          if (existingParticipant) matchMethod = 'isHostHint';
        }

        let user: any;
        let userRole: string;

        // Handle rejoining scenario
        if (existingParticipant) {
          console.log(`🔄 [REJOIN] Rejoining as existing participant via ${matchMethod}`);

          user = {
            id: existingParticipant.user_id,
            username: existingParticipant.user?.username,
            display_name: existingParticipant.user?.display_name,
            premium_tier: existingParticipant.user?.premium_tier,
            avatar_url: existingParticipant.user?.avatar_url,
            avatar_style: existingParticipant.user?.avatar_style,
            avatar_seed: existingParticipant.user?.avatar_seed,
            avatar_options: existingParticipant.user?.avatar_options,
            level: existingParticipant.user?.level,
            role: existingParticipant.user?.role,
            external_id: existingParticipant.user?.external_id
          };
          userRole = existingParticipant.role;

          // Use stored custom_lobby_name for rejoining players
          if (!customLobbyName && existingParticipant.custom_lobby_name) {
            customLobbyName = existingParticipant.custom_lobby_name;
          }

          // Restore host status if original host reconnects
          if (room.metadata?.original_host_id === existingParticipant.user_id && existingParticipant.role !== 'host') {
            const currentHostParticipant = room.participants?.find(p => p.role === 'host');
            if (currentHostParticipant && currentHostParticipant.user_id !== existingParticipant.user_id) {
              await db.adminClient
                .from('room_members')
                .update({ role: 'player' })
                .eq('room_id', room.id)
                .eq('user_id', currentHostParticipant.user_id);

              await db.adminClient
                .from('room_members')
                .update({ role: 'host' })
                .eq('room_id', room.id)
                .eq('user_id', existingParticipant.user_id);

              await db.adminClient
                .from('rooms')
                .update({ host_id: existingParticipant.user_id })
                .eq('id', room.id);

              userRole = 'host';

              io.to(room.room_code).emit(SERVER_EVENTS.HOST.TRANSFERRED, {
                oldHostId: currentHostParticipant.user_id,
                newHostId: existingParticipant.user_id,
                newHostName: existingParticipant.user?.display_name || 'Player',
                reason: 'original_host_returned',
                roomVersion: Date.now()
              });
            }
          }

          // Clean up stale connections
          const userConnections = connectionManager.getUserConnections(existingParticipant.user_id)
            .filter(conn => conn.socketId !== socket.id);
          userConnections.forEach(staleConn => {
            connectionManager.removeConnection(staleConn.socketId);
          });

          // Update connection tracking
          connectionManager.updateConnection(socket.id, {
            userId: existingParticipant.user_id,
            username: playerName,
            roomId: room.id,
            roomCode: roomCode
          });

          // Update connection status
          await db.updateParticipantConnection(existingParticipant.user_id, socket.id, 'connected', customLobbyName);

          // Auto-update room status if host
          if (existingParticipant.role === 'host') {
            await autoUpdateRoomStatusByHost(io, db, room.id, existingParticipant.user_id, 'lobby');
          }

          // Reset to lobby status
          if (room.status === 'lobby' || room.status === 'in_game') {
            await db.adminClient
              .from('room_members')
              .update({ in_game: false, current_location: 'lobby' })
              .eq('user_id', existingParticipant.user_id)
              .eq('room_id', room.id);
          }

        } else {
          // New participant
          if (supabaseUserId) {
            const { data: existingUser, error } = await db.adminClient
              .from('users')
              .select('*')
              .eq('id', supabaseUserId)
              .single();

            if (error || !existingUser) {
              socket.emit('error', {
                message: 'User account not found. Please try logging in again.',
                code: 'USER_NOT_FOUND'
              });
              return;
            }
            user = existingUser;
          } else {
            user = await db.getOrCreateUser(
              `${socket.id}_${data.playerName}`,
              data.playerName,
              data.playerName
            );
          }

          // Check for duplicate connected participants
          const duplicateConnectedParticipant = room.participants?.find(p =>
            p.user?.username === data.playerName &&
            p.is_connected === true &&
            p.user_id !== existingParticipant?.user_id
          );

          if (duplicateConnectedParticipant) {
            socket.emit('error', {
              message: 'A player with this name is already in the room. Please choose a different name.',
              code: 'DUPLICATE_PLAYER'
            });
            return;
          }

          // Determine role
          userRole = isOriginalCreator ? 'host' : 'player';
          await db.addParticipant(room.id, user.id, socket.id, userRole, customLobbyName);

          // If joining in_game room, mark as in_game
          if (room.status === 'in_game') {
            await db.adminClient
              .from('room_members')
              .update({ in_game: true, current_location: 'game' })
              .eq('user_id', user.id)
              .eq('room_id', room.id);
          }

          // Clean up stale connections
          const userConnections = connectionManager.getUserConnections(user.id)
            .filter(conn => conn.socketId !== socket.id);
          userConnections.forEach(staleConn => {
            connectionManager.removeConnection(staleConn.socketId);
          });

          // Update connection tracking
          connectionManager.updateConnection(socket.id, {
            userId: user.id,
            username: playerName,
            roomId: room.id,
            roomCode: roomCode
          });
        }

        // Join socket room
        socket.join(data.roomCode);

        // Get updated room data
        const updatedRoom = await db.getRoomByCode(data.roomCode) as RoomWithParticipants;
        const players = mapParticipantsToPlayers(updatedRoom.participants);

        // Notify all players
        const isHost = userRole === 'host';
        const joinEventData = {
          player: {
            id: user.id,
            name: customLobbyName || user.display_name || 'Player',
            isHost: isHost,
            premiumTier: user.premium_tier || 'free',
            role: user.role || 'user',
            avatarUrl: user.avatar_url,
            avatarStyle: user.avatar_style,
            avatarSeed: user.avatar_seed,
            avatarOptions: user.avatar_options,
            level: user.level || 1,
            socketId: socket.id
          },
          players: players,
          room: updatedRoom
        };

        // Broadcast to other players
        socket.to(data.roomCode).emit(SERVER_EVENTS.PLAYER.JOINED, { ...joinEventData, roomVersion: Date.now() });

        // Send success response to joining player
        socket.emit(SERVER_EVENTS.ROOM.JOINED, {
          roomCode: data.roomCode,
          isHost: isHost,
          players: players,
          room: updatedRoom,
          roomVersion: Date.now()
        });

        console.log(`🎉 [SUCCESS] ${data.playerName} ${existingParticipant ? 'rejoined' : 'joined'} room ${data.roomCode}`);

        // Auto-update room status after rejoin
        if (updatedRoom.status === 'in_game') {
          await autoUpdateRoomStatusBasedOnPlayerStates(io, db, updatedRoom as any, players as any, 'player_rejoined');
        }

      } catch (error) {
        console.error('❌ [JOIN ERROR] Room join/rejoin failed:', error);
        socket.emit('error', {
          message: 'Failed to join room. Please try again.',
          code: 'JOIN_FAILED'
        });
      } finally {
        connectionManager.releaseLock(playerName, roomCode);
      }
    } catch (error) {
      console.error('❌ [JOIN ROOM ERROR] Validation error:', error);
      socket.emit('error', { message: 'Invalid request data', code: 'VALIDATION_ERROR' });
    }
  });

  // Handle leaving room
  socket.on(SOCKET_EVENTS.ROOM.LEAVE, async (data) => {
    try {
      const connection = connectionManager.getConnection(socket.id);
      if (!connection?.roomId || !connection?.userId) {
        return;
      }

      const room = await db.getRoomByCode(data.roomCode) as RoomWithParticipants | null;
      const leavingParticipant = room?.participants?.find(p => p.user_id === connection.userId);
      const isLeavingHost = leavingParticipant?.role === 'host';

      // Remove participant from database
      await db.removeParticipant(connection.roomId, connection.userId);

      // Leave socket room
      socket.leave(data.roomCode);

      // Handle host transfer if host is leaving
      let newHost = null;
      if (isLeavingHost && room) {
        console.log(`👑 [LEAVE] Host ${connection.userId} leaving - transferring host instantly`);
        newHost = await db.autoTransferHost(connection.roomId, connection.userId);
      }

      // Get updated room data
      const updatedRoom = await db.getRoomByCode(data.roomCode) as RoomWithParticipants | null;
      if (updatedRoom) {
        const allPlayers = mapParticipantsToPlayers(updatedRoom.participants);

        // Send host transfer event if applicable
        if (newHost) {
          io.to(data.roomCode).emit(SERVER_EVENTS.HOST.TRANSFERRED, {
            oldHostId: connection.userId,
            newHostId: newHost.user_id,
            newHostName: newHost.user?.display_name || 'Player',
            reason: 'original_host_left',
            players: allPlayers,
            room: updatedRoom,
            roomVersion: Date.now()
          });
        }

        // Send player left event
        io.to(data.roomCode).emit(SERVER_EVENTS.PLAYER.LEFT, {
          playerId: connection.userId,
          players: allPlayers,
          room: updatedRoom,
          wasHost: isLeavingHost,
          roomVersion: Date.now()
        });

        // If no connected players left, mark room as abandoned
        const connectedPlayers = allPlayers.filter(p => p.isConnected);
        if (connectedPlayers.length === 0) {
          console.log(`🏚️ [CLEANUP] Room ${data.roomCode} marked as abandoned`);
          await db.updateRoom(connection.roomId, { status: 'abandoned' });
        }
      }

      // Clear connection tracking
      connection.roomId = null;
      connection.userId = null;

      console.log(`👋 Player left room ${data.roomCode}${isLeavingHost ? ' (was host)' : ''}`);

    } catch (error) {
      console.error('❌ Error leaving room:', error);
    }
  });
}
