/**
 * Socket.IO Event Handlers
 *
 * Centralized Socket.IO event handling with TypeScript type safety.
 * Extracted from monolithic index.js for better maintainability.
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import logger from './lib/logger';
import {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
  GameBuddiesSocket,
  DatabaseService,
  Room,
  User,
  RoomMember
} from './types';
import {
  RoomNotFoundError,
  RoomFullError,
  RoomNotAvailableError,
  ValidationError,
  RateLimitError,
  handleSocketError
} from './lib/errors';

// Import legacy modules (to be converted to TypeScript)
const ConnectionManager = require('./lib/connectionManager');
const { validators, sanitize, rateLimits } = require('./lib/validation');

/**
 * Initialize Socket.IO event handlers
 *
 * @param io - Socket.IO server instance
 * @param db - Database service
 * @param connectionManager - Connection manager instance
 */
export function initializeSocketHandlers(
  io: SocketIOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
  db: DatabaseService,
  connectionManager: any // TODO: Type this when connectionManager is converted to TS
): void {

  io.on('connection', async (socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>) => {
    logger.socket('User connected', { socketId: socket.id });

    // Store connection info
    connectionManager.addConnection(socket.id);

    /**
     * Handle room creation
     */
    socket.on('createRoom', async (data) => {
      try {
        // Validate input
        const validation = await validators.createRoom(data);
        if (!validation.isValid) {
          throw new ValidationError(validation.message);
        }

        // Check rate limiting
        if (connectionManager.isRateLimited(socket.id, 'createRoom', rateLimits.createRoom.max)) {
          throw new RateLimitError();
        }

        // Sanitize input
        const playerName = sanitize.playerName(data.playerName);
        const streamerMode = data.streamerMode || false;

        logger.room('Creating room', { playerName, streamerMode, socketId: socket.id });

        // Get or create user profile
        const user: User = await db.getOrCreateUser(
          `${socket.id}_${playerName}`,
          playerName,
          playerName
        );
        logger.db('User created/found', { userId: user.id, username: user.username });

        // Create room in database
        const room: Room = await db.createRoom({
          host_id: user.id,
          current_game: null,
          status: 'lobby',
          is_public: true,
          max_players: data.maxPlayers || 10,
          streamer_mode: streamerMode,
          game_settings: {},
          metadata: {
            created_by_name: playerName,
            created_from: 'web_client'
          }
        });
        logger.room('Room created', {
          roomId: room.id,
          roomCode: room.room_code,
          hostId: room.host_id
        });

        // Add creator as participant
        const participant: RoomMember = await db.addParticipant(room.id, user.id, socket.id, 'host');
        logger.db('Participant added', { participantId: participant.id, role: participant.role });

        // Handle host promotion if needed
        try {
          const clientIsHostHint = data && (data as any).isHostHint === true;
          const roomHasHost = Array.isArray(room.participants) &&
                             room.participants.some((p: RoomMember) => p.role === 'host');

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

            logger.room('Promoted user to host', { userId: user.id, roomCode: room.room_code });
          }
        } catch (e) {
          logger.error('Failed to promote host from hint', { error: (e as Error).message });
        }

        // Join socket room
        socket.join(room.room_code);
        logger.socket('Joined socket room', { roomCode: room.room_code, socketId: socket.id });

        // Update connection tracking
        connectionManager.updateConnection(socket.id, {
          userId: user.id,
          username: playerName,
          roomId: room.id,
          roomCode: room.room_code
        });

        // Send success response
        socket.emit('roomCreated', {
          roomCode: room.room_code,
          isHost: true,
          room: {
            ...room,
            players: [{
              id: user.id,
              name: playerName,
              isHost: true,
              isConnected: true,
              inGame: false,
              currentLocation: 'lobby',
              lastPing: new Date().toISOString(),
              socketId: socket.id
            }]
          }
        });

        logger.room('Room creation successful', {
          roomCode: room.room_code,
          playerName,
          socketId: socket.id
        });

      } catch (error) {
        logger.error('Room creation failed', {
          error: (error as Error).message,
          socketId: socket.id,
          data
        });
        handleSocketError(socket, error as Error, logger);
      }
    });

    /**
     * Handle socket room joining (for listening only)
     */
    socket.on('joinSocketRoom', (data) => {
      try {
        logger.socket('Joining socket room for listening', { roomCode: data.roomCode, socketId: socket.id });
        socket.join(data.roomCode);
        logger.socket('Successfully joined socket room', { roomCode: data.roomCode });
      } catch (error) {
        logger.error('Error joining socket room', {
          error: (error as Error).message,
          roomCode: data.roomCode
        });
      }
    });

    /**
     * Handle room joining
     */
    socket.on('joinRoom', async (data) => {
      try {
        // Validate input
        const validation = await validators.joinRoom(data);
        if (!validation.isValid) {
          throw new ValidationError(validation.message);
        }

        // Check rate limiting
        if (connectionManager.isRateLimited(socket.id, 'joinRoom', rateLimits.joinRoom.max)) {
          throw new RateLimitError();
        }

        // Sanitize input
        const playerName = sanitize.playerName(data.playerName);
        const roomCode = sanitize.roomCode(data.roomCode);

        // Acquire connection lock to prevent race conditions
        if (!connectionManager.acquireLock(playerName, roomCode, socket.id)) {
          socket.emit('error', {
            error: 'Another connection attempt is in progress. Please wait.',
            code: 'CONNECTION_IN_PROGRESS',
            timestamp: new Date().toISOString()
          });
          return;
        }

        try {
          logger.room('Join room request', {
            socketId: socket.id,
            playerName,
            roomCode,
            timestamp: new Date().toISOString()
          });

          // Get room from database
          const room: Room = await db.getRoomByCode(roomCode);
          if (!room) {
            throw new RoomNotFoundError(roomCode);
          }

          logger.room('Room found', {
            roomId: room.id,
            roomCode: room.room_code,
            status: room.status,
            participantsCount: room.participants?.length || 0
          });

          // Check if room is full
          const connectedPlayers = room.participants?.filter((p: RoomMember) => p.is_connected === true).length || 0;
          if (connectedPlayers >= room.max_players) {
            throw new RoomFullError(roomCode, room.max_players);
          }

          // Check if room is accepting players
          const isOriginalCreator = room.metadata?.created_by_name === playerName;
          if (room.status !== 'lobby' && room.status !== 'in_game' && !isOriginalCreator) {
            throw new RoomNotAvailableError(roomCode, room.status, ['lobby', 'in_game']);
          }

          // Get or create user
          const user: User = await db.getOrCreateUser(
            `${socket.id}_${playerName}`,
            playerName,
            playerName
          );

          // Check if user is already in room
          const existingParticipant = room.participants?.find((p: RoomMember) =>
            p.user_id === user.id || p.user?.username === playerName
          );

          let participant: RoomMember;
          let isRejoining = false;

          if (existingParticipant) {
            // Rejoin scenario
            isRejoining = true;
            participant = await db.updateParticipant(existingParticipant.id, {
              socket_id: socket.id,
              is_connected: true,
              last_ping: new Date().toISOString()
            });
            logger.room('Player rejoining', {
              userId: user.id,
              roomCode,
              wasHost: existingParticipant.role === 'host'
            });
          } else {
            // New join
            participant = await db.addParticipant(room.id, user.id, socket.id, 'player');
            logger.room('New player joined', { userId: user.id, roomCode });
          }

          // Join socket room
          socket.join(roomCode);

          // Update connection tracking
          connectionManager.updateConnection(socket.id, {
            userId: user.id,
            username: playerName,
            roomId: room.id,
            roomCode: room.room_code
          });

          // Release connection lock
          connectionManager.releaseLock(playerName, roomCode);

          // Get updated room with all participants
          const updatedRoom = await db.getRoomByCode(roomCode);

          // Send success response
          socket.emit('roomJoined', {
            roomCode: room.room_code,
            isHost: participant.role === 'host',
            room: updatedRoom,
            player: participant
          });

          // Notify other players
          socket.to(roomCode).emit('playerJoined', participant);

          logger.room('Player joined successfully', {
            roomCode,
            playerName,
            isRejoining,
            isHost: participant.role === 'host'
          });

        } finally {
          // Always release lock
          connectionManager.releaseLock(playerName, roomCode);
        }

      } catch (error) {
        logger.error('Join room failed', {
          error: (error as Error).message,
          socketId: socket.id,
          data
        });
        handleSocketError(socket, error as Error, logger);
      }
    });

    /**
     * Handle game selection
     */
    socket.on('selectGame', async (data) => {
      try {
        logger.room('Game selection request', {
          roomCode: data.roomCode,
          gameType: data.gameType,
          socketId: socket.id
        });

        const room = await db.getRoomByCode(data.roomCode);
        if (!room) {
          throw new RoomNotFoundError(data.roomCode);
        }

        // Update room with selected game
        await db.adminClient
          .from('rooms')
          .update({ current_game: data.gameType })
          .eq('id', room.id);

        // Notify all players
        io.to(data.roomCode).emit('gameSelected', {
          gameType: data.gameType
        });

        logger.room('Game selected', { roomCode: data.roomCode, gameType: data.gameType });

      } catch (error) {
        logger.error('Game selection failed', {
          error: (error as Error).message,
          data
        });
        handleSocketError(socket, error as Error, logger);
      }
    });

    /**
     * Handle game start
     */
    socket.on('startGame', async (data) => {
      try {
        logger.room('Start game request', {
          roomCode: data.roomCode,
          socketId: socket.id
        });

        const room = await db.getRoomByCode(data.roomCode);
        if (!room) {
          throw new RoomNotFoundError(data.roomCode);
        }

        // Update room status
        await db.adminClient
          .from('rooms')
          .update({
            status: 'in_game',
            game_settings: data.gameSettings || {}
          })
          .eq('id', room.id);

        // Build game URL
        const gameUrl = `/${room.current_game}?roomCode=${data.roomCode}`;

        // Notify all players
        io.to(data.roomCode).emit('gameStarted', {
          gameUrl,
          settings: data.gameSettings || {}
        });

        logger.room('Game started', { roomCode: data.roomCode, gameUrl });

      } catch (error) {
        logger.error('Start game failed', {
          error: (error as Error).message,
          data
        });
        handleSocketError(socket, error as Error, logger);
      }
    });

    /**
     * Handle player leaving room
     */
    socket.on('leaveRoom', async (data) => {
      try {
        const roomCode = data?.roomCode;
        if (!roomCode) {
          logger.warn('Leave room without room code', { socketId: socket.id });
          return;
        }

        logger.room('Leave room request', { roomCode, socketId: socket.id });

        const room = await db.getRoomByCode(roomCode);
        if (!room) {
          return; // Room already gone, silently return
        }

        // Find participant
        const participant = room.participants?.find((p: RoomMember) => p.socket_id === socket.id);
        if (participant) {
          // Mark as disconnected
          await db.updateParticipant(participant.id, {
            is_connected: false,
            last_ping: new Date().toISOString()
          });

          // Leave socket room
          socket.leave(roomCode);

          // Notify other players
          socket.to(roomCode).emit('playerLeft', {
            playerId: participant.user_id,
            username: participant.user?.username || 'Unknown'
          });

          logger.room('Player left', { roomCode, playerId: participant.user_id });
        }

      } catch (error) {
        logger.error('Leave room failed', {
          error: (error as Error).message,
          data
        });
      }
    });

    /**
     * Handle player returning to lobby
     */
    socket.on('playerReturnToLobby', async (data) => {
      try {
        logger.room('Return to lobby request', { roomCode: data.roomCode, socketId: socket.id });

        const room = await db.getRoomByCode(data.roomCode);
        if (!room) {
          throw new RoomNotFoundError(data.roomCode);
        }

        const participant = room.participants?.find((p: RoomMember) => p.socket_id === socket.id);
        if (participant) {
          // Notify other players
          socket.to(data.roomCode).emit('playerReturnedToLobby', {
            playerId: participant.user_id
          });

          logger.room('Player returned to lobby', {
            roomCode: data.roomCode,
            playerId: participant.user_id
          });
        }

      } catch (error) {
        logger.error('Return to lobby failed', {
          error: (error as Error).message,
          data
        });
        handleSocketError(socket, error as Error, logger);
      }
    });

    /**
     * Handle host transfer
     */
    socket.on('transferHost', async (data) => {
      try {
        logger.room('Transfer host request', {
          roomCode: data.roomCode,
          targetPlayerId: data.targetPlayerId,
          socketId: socket.id
        });

        const room = await db.getRoomByCode(data.roomCode);
        if (!room) {
          throw new RoomNotFoundError(data.roomCode);
        }

        // Update old host
        await db.adminClient
          .from('room_members')
          .update({ role: 'player' })
          .eq('room_id', room.id)
          .eq('role', 'host');

        // Update new host
        await db.adminClient
          .from('room_members')
          .update({ role: 'host' })
          .eq('room_id', room.id)
          .eq('user_id', data.targetPlayerId);

        // Update room host_id
        await db.adminClient
          .from('rooms')
          .update({ host_id: data.targetPlayerId })
          .eq('id', room.id);

        // Notify all players
        io.to(data.roomCode).emit('hostTransferred', {
          oldHostId: room.host_id,
          newHostId: data.targetPlayerId
        });

        logger.room('Host transferred', {
          roomCode: data.roomCode,
          oldHostId: room.host_id,
          newHostId: data.targetPlayerId
        });

      } catch (error) {
        logger.error('Transfer host failed', {
          error: (error as Error).message,
          data
        });
        handleSocketError(socket, error as Error, logger);
      }
    });

    /**
     * Handle player kick
     */
    socket.on('kickPlayer', async (data) => {
      try {
        logger.room('Kick player request', {
          roomCode: data.roomCode,
          targetPlayerId: data.targetPlayerId,
          socketId: socket.id
        });

        const room = await db.getRoomByCode(data.roomCode);
        if (!room) {
          throw new RoomNotFoundError(data.roomCode);
        }

        // Remove participant
        await db.adminClient
          .from('room_members')
          .delete()
          .eq('room_id', room.id)
          .eq('user_id', data.targetPlayerId);

        // Notify all players
        io.to(data.roomCode).emit('playerKicked', {
          playerId: data.targetPlayerId,
          reason: data.reason
        });

        logger.room('Player kicked', {
          roomCode: data.roomCode,
          playerId: data.targetPlayerId,
          reason: data.reason
        });

      } catch (error) {
        logger.error('Kick player failed', {
          error: (error as Error).message,
          data
        });
        handleSocketError(socket, error as Error, logger);
      }
    });

    /**
     * Handle disconnect
     */
    socket.on('disconnect', async () => {
      try {
        logger.socket('User disconnected', { socketId: socket.id });

        const connection = connectionManager.getConnection(socket.id);
        if (connection && connection.roomCode) {
          const room = await db.getRoomByCode(connection.roomCode);
          if (room) {
            const participant = room.participants?.find((p: RoomMember) => p.socket_id === socket.id);
            if (participant) {
              // Mark as disconnected
              await db.updateParticipant(participant.id, {
                is_connected: false,
                last_ping: new Date().toISOString()
              });

              // Notify other players
              socket.to(connection.roomCode).emit('playerLeft', {
                playerId: participant.user_id,
                username: participant.user?.username || 'Unknown'
              });

              logger.room('Player disconnected from room', {
                roomCode: connection.roomCode,
                playerId: participant.user_id
              });
            }
          }
        }

        // Remove connection
        connectionManager.removeConnection(socket.id);

      } catch (error) {
        logger.error('Disconnect handler error', {
          error: (error as Error).message,
          socketId: socket.id
        });
      }
    });

    logger.socket('All socket event handlers registered', { socketId: socket.id });
  });

  logger.info('Socket.IO handlers initialized');
}

export default initializeSocketHandlers;
