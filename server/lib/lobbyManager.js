const crypto = require('crypto');
const constants = require('../config/constants');
const logger = require('./logger');

class LobbyManager {
  constructor(io, db, connectionManager) {
    this.io = io;
    this.db = db;
    this.connectionManager = connectionManager;
    this.roomStates = new Map(); // In-memory room state cache
    this.playerSessions = new Map(); // Player session tracking
    this.statusQueue = new Map(); // Pending status updates queue

    // Initialize cleanup interval
    this.setupCleanupInterval();
  }

  /**
   * Setup periodic cleanup of in-memory caches to prevent memory leaks
   */
  setupCleanupInterval() {
    setInterval(() => {
      this.cleanupStaleCaches();
    }, constants.CLEANUP_INTERVAL);

    logger.info('LobbyManager cleanup interval initialized', {
      interval: constants.CLEANUP_INTERVAL,
    });
  }

  /**
   * Clean up stale entries from in-memory caches
   */
  cleanupStaleCaches() {
    const now = Date.now();
    let cleanedRooms = 0;
    let cleanedSessions = 0;
    let cleanedQueue = 0;

    // Clean up stale room states (older than 1 hour)
    for (const [roomCode, state] of this.roomStates.entries()) {
      if (now - state.lastUpdate > constants.ROOM_STATE_CACHE_TTL) {
        this.roomStates.delete(roomCode);
        cleanedRooms++;
      }
    }

    // Clean up expired player sessions (older than 30 minutes)
    for (const [sessionId, session] of this.playerSessions.entries()) {
      if (now - (session.lastActivity || 0) > constants.PLAYER_SESSION_TTL) {
        this.playerSessions.delete(sessionId);
        cleanedSessions++;
      }
    }

    // Clean up old status queue entries (older than 1 minute)
    for (const [key, timestamp] of this.statusQueue.entries()) {
      if (now - timestamp > constants.STATUS_QUEUE_TTL) {
        this.statusQueue.delete(key);
        cleanedQueue++;
      }
    }

    if (cleanedRooms > 0 || cleanedSessions > 0 || cleanedQueue > 0) {
      logger.info('Cleaned up stale cache entries', {
        roomStates: cleanedRooms,
        playerSessions: cleanedSessions,
        statusQueue: cleanedQueue,
        remainingRooms: this.roomStates.size,
        remainingSessions: this.playerSessions.size,
        remainingQueue: this.statusQueue.size,
      });
    }
  }

  // Generate unique room code
  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Create a new room
  async createRoom(hostId, gameType = 'lobby', settings = {}) {
    try {
      const roomCode = this.generateRoomCode();

      // Ensure unique room code
      const existing = await this.db.adminClient
        .from('rooms')
        .select('id')
        .eq('room_code', roomCode)
        .single();

      if (existing.data) {
        return this.createRoom(hostId, gameType, settings); // Retry with new code
      }

      // Create room in database
      const { data: room, error: roomError } = await this.db.adminClient
        .from('rooms')
        .insert({
          room_code: roomCode,
          host_id: hostId,
          status: 'lobby',
          current_game: gameType === 'lobby' ? null : gameType,
          game_settings: settings,
          max_players: settings.maxPlayers || 10,
          streamer_mode: settings.streamerMode || false,
          metadata: {
            created_by_host: true,
            version: '2.0',
          },
        })
        .select()
        .single();

      if (roomError) throw roomError;

      // Add host as room member
      const { error: memberError } = await this.db.adminClient.from('room_members').insert({
        room_id: room.id,
        user_id: hostId,
        role: 'host',
        is_connected: true,
        current_location: 'lobby',
      });

      if (memberError) throw memberError;

      // Initialize room state cache
      this.roomStates.set(roomCode, {
        id: room.id,
        code: roomCode,
        hostId: hostId,
        status: 'lobby',
        gameType: gameType,
        players: new Map(),
        lastUpdate: Date.now(),
      });

      // Log event
      await this.db.logEvent(room.id, hostId, 'room_created', {
        roomCode,
        gameType,
        version: '2.0',
      });

      console.log(`✅ [LOBBY] Room ${roomCode} created by host ${hostId}`);
      return { room, roomCode };
    } catch (error) {
      console.error('❌ [LOBBY] Failed to create room:', error);
      throw error;
    }
  }

  // Enhanced room joining with session management
  async joinRoom(playerId, roomCode, playerName, socketId, sessionToken = null) {
    try {
      console.log(`🚪 [LOBBY] Player ${playerName} joining room ${roomCode}`);

      // Acquire connection lock to prevent race conditions
      if (!this.connectionManager.acquireLock(playerName, roomCode, socketId)) {
        throw new Error('Another connection is already joining this room');
      }

      // Get room from database
      const { data: room, error: roomError } = await this.db.adminClient
        .from('rooms')
        .select(
          `
          *,
          participants:room_members(
            *,
            user:users(*)
          )
        `
        )
        .eq('room_code', roomCode)
        .single();

      if (roomError || !room) {
        throw new Error('Room not found');
      }

      // Validate room status
      if (!['lobby', 'in_game', 'returning'].includes(room.status)) {
        throw new Error(`Room is ${room.status}`);
      }

      // Check if player is already in room
      const existingParticipant = room.participants?.find(p => p.user_id === playerId);

      if (existingParticipant) {
        // Rejoin - update connection status
        await this.db.adminClient
          .from('room_members')
          .update({
            is_connected: true,
            socket_id: socketId,
            current_location: 'lobby',
            last_ping: new Date().toISOString(),
          })
          .eq('id', existingParticipant.id);

        console.log(`🔄 [LOBBY] Player ${playerName} rejoined room ${roomCode}`);
      } else {
        // Check room capacity
        const connectedCount = room.participants?.filter(p => p.is_connected).length || 0;
        if (connectedCount >= room.max_players) {
          throw new Error('Room is full');
        }

        // Add as new participant
        await this.db.adminClient.from('room_members').insert({
          room_id: room.id,
          user_id: playerId,
          role: 'player',
          is_connected: true,
          socket_id: socketId,
          current_location: 'lobby',
        });

        console.log(`✅ [LOBBY] Player ${playerName} joined room ${roomCode}`);
      }

      // Create/update session
      const sessionTokenValue = await this.createPlayerSession(playerId, room.id, socketId);

      // Update connection manager
      this.connectionManager.updateConnection(socketId, {
        userId: playerId,
        username: playerName,
        roomId: room.id,
        roomCode: roomCode,
        sessionToken: sessionTokenValue,
      });

      // Update room state cache
      await this.updateRoomStateCache(roomCode);

      // Get updated room data for response
      const roomData = await this.getRoomWithParticipants(roomCode);

      // Broadcast to room
      await this.broadcastRoomUpdate(roomCode, 'playerJoined', {
        player: { id: playerId, name: playerName },
        room: roomData.room,
        players: roomData.players,
      });

      // Log event
      await this.db.logEvent(room.id, playerId, 'player_joined_v2', {
        playerName,
        isRejoin: !!existingParticipant,
        sessionToken: sessionTokenValue,
      });

      return {
        success: true,
        room: roomData.room,
        players: roomData.players,
        sessionToken: sessionTokenValue,
        isRejoin: !!existingParticipant,
      };
    } catch (error) {
      console.error(`❌ [LOBBY] Failed to join room ${roomCode}:`, error);
      this.connectionManager.releaseLock(playerName, roomCode);
      throw error;
    }
  }

  // Enhanced player status update with conflict resolution
  async updatePlayerStatus(playerId, roomCode, status, location, metadata = {}) {
    try {
      console.log(`🔄 [LOBBY] Updating player ${playerId} status: ${status}/${location}`);

      // Get current state from database
      const { data: currentMember, error } = await this.db.adminClient
        .from('room_members')
        .select(
          `
          *,
          room:rooms(*),
          user:users(*)
        `
        )
        .eq('user_id', playerId)
        .eq(
          'room_id',
          (await this.db.adminClient.from('rooms').select('id').eq('room_code', roomCode).single())
            .data?.id
        )
        .single();

      if (error || !currentMember) {
        throw new Error('Player not found in room');
      }

      // Determine status mapping
      const statusMapping = this.mapStatusToDatabase(status, location);

      // Check for conflicts
      const conflicts = this.detectStatusConflicts(currentMember, statusMapping);

      // Resolve conflicts if any
      const resolvedStatus =
        conflicts.length > 0
          ? this.resolveStatusConflicts(currentMember, statusMapping, conflicts)
          : statusMapping;

      // Update database
      const { error: updateError } = await this.db.adminClient
        .from('room_members')
        .update({
          ...resolvedStatus,
          last_ping: new Date().toISOString(),
          game_data: { ...currentMember.game_data, ...metadata },
        })
        .eq('id', currentMember.id);

      if (updateError) throw updateError;

      // Log status history
      await this.db.adminClient.from('player_status_history').insert({
        user_id: playerId,
        room_id: currentMember.room_id,
        old_location: currentMember.current_location,
        new_location: resolvedStatus.current_location,
        old_status: currentMember.is_connected ? 'connected' : 'disconnected',
        new_status: resolvedStatus.is_connected ? 'connected' : 'disconnected',
        reason: metadata.reason || `Status update: ${status}`,
        metadata: { conflicts, originalRequest: { status, location }, ...metadata },
      });

      // Update room state cache
      await this.updateRoomStateCache(roomCode);

      // Broadcast update
      const roomData = await this.getRoomWithParticipants(roomCode);
      await this.broadcastRoomUpdate(roomCode, 'playerStatusUpdated', {
        playerId,
        status: resolvedStatus,
        room: roomData.room,
        players: roomData.players,
        conflicts,
      });

      console.log(`✅ [LOBBY] Player ${playerId} status updated successfully`);
      return { success: true, updated: resolvedStatus, conflicts };
    } catch (error) {
      console.error(`❌ [LOBBY] Failed to update player status:`, error);
      throw error;
    }
  }

  // Handle player returning from game
  async handlePlayerReturn(playerId, roomCode, fromGame = true) {
    console.log(
      `🔄 [LOBBY] Player ${playerId} returning to lobby from ${fromGame ? 'game' : 'unknown'}`
    );

    try {
      // Update status to lobby
      await this.updatePlayerStatus(playerId, roomCode, 'lobby', 'lobby', {
        reason: `Player returned from ${fromGame ? 'game' : 'external source'}`,
        returnTimestamp: new Date().toISOString(),
      });

      // Check if all players have returned and update room status if needed
      const roomData = await this.getRoomWithParticipants(roomCode);
      const connectedPlayers = roomData.players.filter(p => p.isConnected);
      const playersInLobby = connectedPlayers.filter(p => p.currentLocation === 'lobby');

      if (playersInLobby.length === connectedPlayers.length && connectedPlayers.length > 0) {
        // All connected players are back in lobby
        await this.updateRoomStatus(roomCode, 'lobby', `All players returned to lobby`);
      }

      return { success: true };
    } catch (error) {
      console.error(`❌ [LOBBY] Failed to handle player return:`, error);
      throw error;
    }
  }

  // Initiate group return (host only)
  async initiateGroupReturn(hostId, roomCode) {
    console.log(`👑 [LOBBY] Host ${hostId} initiating group return for room ${roomCode}`);

    try {
      // Verify host permissions
      const { data: room } = await this.db.adminClient
        .from('rooms')
        .select('host_id')
        .eq('room_code', roomCode)
        .single();

      if (!room || room.host_id !== hostId) {
        throw new Error('Only the host can initiate group return');
      }

      // Update room status to returning
      await this.updateRoomStatus(roomCode, 'returning', 'Host initiated group return');

      // Get all players in game
      const { data: members } = await this.db.adminClient
        .from('room_members')
        .select(
          `
          *,
          user:users(*)
        `
        )
        .eq('room_id', room.id)
        .eq('is_connected', true)
        .eq('current_location', 'game');

      // Update all players to returning status
      if (members && members.length > 0) {
        await Promise.all(
          members.map(member =>
            this.updatePlayerStatus(member.user_id, roomCode, 'returning', 'lobby', {
              reason: 'Group return initiated by host',
              groupReturn: true,
            })
          )
        );
      }

      // Broadcast group return signal removed

      console.log(`✅ [LOBBY] Group return initiated for ${members?.length || 0} players`);
      return { success: true, playersReturning: members?.length || 0 };
    } catch (error) {
      console.error(`❌ [LOBBY] Failed to initiate group return:`, error);
      throw error;
    }
  }

  // Create player session
  async createPlayerSession(playerId, roomId, socketId) {
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await this.db.adminClient.from('player_sessions').upsert(
      {
        user_id: playerId,
        room_id: roomId,
        session_token: sessionToken,
        socket_id: socketId,
        status: 'active',
        expires_at: expiresAt.toISOString(),
      },
      {
        onConflict: 'user_id,room_id',
      }
    );

    return sessionToken;
  }

  // Recover player session
  async recoverSession(sessionToken, newSocketId) {
    try {
      const { data: session, error } = await this.db.adminClient
        .from('player_sessions')
        .select(
          `
          *,
          user:users(*),
          room:rooms(*),
          member:room_members!inner(*)
        `
        )
        .eq('session_token', sessionToken)
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .single();

      if (error || !session) {
        throw new Error('Invalid or expired session');
      }

      // Update session with new socket
      await this.db.adminClient
        .from('player_sessions')
        .update({
          socket_id: newSocketId,
          last_heartbeat: new Date().toISOString(),
        })
        .eq('id', session.id);

      // Update room member connection
      await this.db.adminClient
        .from('room_members')
        .update({
          socket_id: newSocketId,
          is_connected: true,
          last_ping: new Date().toISOString(),
        })
        .eq('user_id', session.user_id)
        .eq('room_id', session.room_id);

      console.log(`🔄 [LOBBY] Session recovered for player ${session.user_id}`);
      return {
        success: true,
        playerId: session.user_id,
        roomCode: session.room.room_code,
        playerState: session.member[0],
      };
    } catch (error) {
      console.error('❌ [LOBBY] Session recovery failed:', error);
      throw error;
    }
  }

  // Utility methods
  mapStatusToDatabase(status, location) {
    const mapping = {
      connected: {
        is_connected: true,
        in_game: location === 'game',
        current_location: location || 'lobby',
      },
      disconnected: { is_connected: false, in_game: false, current_location: 'disconnected' },
      in_game: { is_connected: true, in_game: true, current_location: 'game' },
      returning: { is_connected: true, in_game: false, current_location: 'lobby' },
      lobby: { is_connected: true, in_game: false, current_location: 'lobby' },
    };
    return mapping[status] || mapping.lobby;
  }

  detectStatusConflicts(currentState, newState) {
    const conflicts = [];

    // Check for impossible transitions
    if (!currentState.is_connected && newState.in_game) {
      conflicts.push('Cannot be in game while disconnected');
    }

    if (
      currentState.current_location === 'game' &&
      newState.current_location === 'lobby' &&
      newState.in_game
    ) {
      conflicts.push('Location and game status mismatch');
    }

    return conflicts;
  }

  resolveStatusConflicts(currentState, newState, conflicts) {
    // Simple conflict resolution - prefer connection state over game state
    if (conflicts.includes('Cannot be in game while disconnected')) {
      return { ...newState, in_game: false, current_location: 'disconnected' };
    }

    if (conflicts.includes('Location and game status mismatch')) {
      return { ...newState, in_game: newState.current_location === 'game' };
    }

    return newState;
  }

  async updateRoomStateCache(roomCode) {
    const roomData = await this.getRoomWithParticipants(roomCode);
    if (roomData) {
      this.roomStates.set(roomCode, {
        ...roomData.room,
        players: new Map(roomData.players.map(p => [p.id, p])),
        lastUpdate: Date.now(),
      });
    }
  }

  async getRoomWithParticipants(roomCode) {
    const { data: room, error } = await this.db.adminClient
      .from('rooms')
      .select(
        `
        *,
        participants:room_members(
          *,
          user:users(*)
        )
      `
      )
      .eq('room_code', roomCode)
      .single();

    if (error || !room) return null;

    const players =
      room.participants?.map(p => ({
        id: p.user_id,
        name: p.user?.display_name || p.user?.username,
        isHost: p.role === 'host',
        isConnected: p.is_connected,
        inGame: p.in_game,
        currentLocation: p.current_location,
        lastPing: p.last_ping,
        gameData: p.game_data,
      })) || [];

    return { room, players };
  }

  async updateRoomStatus(roomCode, status, reason) {
    await this.db.adminClient
      .from('rooms')
      .update({
        status,
        updated_at: new Date().toISOString(),
        last_activity: new Date().toISOString(),
      })
      .eq('room_code', roomCode);

    await this.broadcastRoomUpdate(roomCode, 'roomStatusChanged', {
      newStatus: status,
      reason,
      timestamp: new Date().toISOString(),
    });
  }

  async broadcastRoomUpdate(roomCode, eventType, data) {
    this.io.to(roomCode).emit(eventType, {
      roomCode,
      timestamp: new Date().toISOString(),
      ...data,
    });
  }

  setupCleanupInterval() {
    // Clean up expired sessions and stale connections every 5 minutes
    setInterval(
      async () => {
        try {
          // Clean up expired sessions
          await this.db.adminClient
            .from('player_sessions')
            .delete()
            .lt('expires_at', new Date().toISOString());

          // Clean up stale room states
          const staleThreshold = Date.now() - 30 * 60 * 1000; // 30 minutes
          for (const [roomCode, state] of this.roomStates.entries()) {
            if (state.lastUpdate < staleThreshold) {
              this.roomStates.delete(roomCode);
            }
          }

          console.log('🧹 [LOBBY] Cleanup completed');
        } catch (error) {
          console.error('❌ [LOBBY] Cleanup failed:', error);
        }
      },
      5 * 60 * 1000
    );
  }
}

module.exports = LobbyManager;
