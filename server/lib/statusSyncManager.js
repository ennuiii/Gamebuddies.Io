class StatusSyncManager {
  constructor(db, io, lobbyManager) {
    this.db = db;
    this.io = io;
    this.lobbyManager = lobbyManager;
    this.statusQueue = new Map(); // Pending status updates
    this.heartbeats = new Map(); // Player heartbeat tracking
    this.syncInterval = null;

    this.setupHeartbeatSystem();
    this.setupStatusSyncLoop();
  }

  // Update player location with real-time sync
  async updatePlayerLocation(playerId, roomCode, location, metadata = {}) {
    try {
      console.log(`📍 [STATUS] Updating player ${playerId} location: ${location}`);

      // Determine status based on location
      let status = 'connected';
      if (location === 'disconnected') {
        status = 'disconnected';
      } else if (location === 'game') {
        status = 'in_game';
      } else if (location === 'lobby') {
        status = 'lobby';
      }

      // Queue the update for batch processing
      const updateKey = `${playerId}_${roomCode}`;
      this.statusQueue.set(updateKey, {
        playerId,
        roomCode,
        status,
        location,
        metadata: {
          ...metadata,
          timestamp: new Date().toISOString(),
          source: 'location_update',
        },
        retryCount: 0,
        queuedAt: Date.now(),
      });

      // Process immediately for critical updates
      if (location === 'disconnected' || metadata.immediate) {
        await this.processStatusUpdate(updateKey);
      }

      return { success: true, queued: !metadata.immediate };
    } catch (error) {
      console.error(`❌ [STATUS] Failed to update player location:`, error);
      throw error;
    }
  }

  // Sync entire room status
  async syncRoomStatus(roomCode) {
    try {
      console.log(`🔄 [STATUS] Syncing room status for ${roomCode}`);

      const roomData = await this.lobbyManager.getRoomWithParticipants(roomCode);
      if (!roomData) {
        throw new Error('Room not found');
      }

      // Broadcast complete room state
      this.io.to(roomCode).emit('roomStatusSync', {
        roomCode,
        room: roomData.room,
        players: roomData.players,
        timestamp: new Date().toISOString(),
        syncType: 'full',
      });

      return { success: true, playersCount: roomData.players.length };
    } catch (error) {
      console.error(`❌ [STATUS] Failed to sync room status:`, error);
      throw error;
    }
  }

  // Handle player heartbeat
  async handleHeartbeat(playerId, roomCode, socketId, metadata = {}) {
    const heartbeatKey = `${playerId}_${roomCode}`;

    this.heartbeats.set(heartbeatKey, {
      playerId,
      roomCode,
      socketId,
      lastHeartbeat: Date.now(),
      metadata,
    });

    // Update last ping in database periodically (not every heartbeat)
    const shouldUpdateDb = Date.now() % 10 === 0; // Every ~10th heartbeat
    if (shouldUpdateDb) {
      try {
        await this.db.adminClient
          .from('room_members')
          .update({
            last_ping: new Date().toISOString(),
          })
          .eq('user_id', playerId)
          .eq(
            'room_id',
            (
              await this.db.adminClient
                .from('rooms')
                .select('id')
                .eq('room_code', roomCode)
                .single()
            ).data?.id
          );
      } catch (error) {
        console.error(`❌ [STATUS] Heartbeat DB update failed:`, error);
      }
    }

    return { success: true, nextHeartbeat: 30000 }; // 30 seconds
  }

  // Detect disconnected players
  async detectDisconnections() {
    const now = Date.now();
    const disconnectionThreshold = 60000; // 60 seconds
    const disconnectedPlayers = [];

    for (const [heartbeatKey, heartbeat] of this.heartbeats.entries()) {
      if (now - heartbeat.lastHeartbeat > disconnectionThreshold) {
        disconnectedPlayers.push(heartbeat);
        this.heartbeats.delete(heartbeatKey);
      }
    }

    // Process disconnections
    for (const player of disconnectedPlayers) {
      try {
        console.log(
          `💔 [STATUS] Player ${player.playerId} detected as disconnected (no heartbeat)`
        );

        await this.updatePlayerLocation(player.playerId, player.roomCode, 'disconnected', {
          reason: 'Heartbeat timeout',
          lastHeartbeat: new Date(player.lastHeartbeat).toISOString(),
          immediate: true,
        });
      } catch (error) {
        console.error(`❌ [STATUS] Failed to handle disconnection:`, error);
      }
    }

    return disconnectedPlayers.length;
  }

  // Reconcile status conflicts between server and client
  async reconcileStatusConflicts(playerId, roomCode, serverStatus, clientStatus) {
    try {
      console.log(`🔧 [STATUS] Reconciling status conflict for player ${playerId}`);
      console.log(`Server status:`, serverStatus);
      console.log(`Client status:`, clientStatus);

      // Get authoritative state from database
      const { data: currentState, error } = await this.db.adminClient
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

      if (error || !currentState) {
        throw new Error('Player state not found in database');
      }

      // Determine resolution strategy
      const resolution = this.resolveConflict(currentState, serverStatus, clientStatus);

      // Apply resolution
      if (resolution.updateRequired) {
        await this.lobbyManager.updatePlayerStatus(
          playerId,
          roomCode,
          resolution.resolvedStatus.status,
          resolution.resolvedStatus.location,
          {
            reason: 'Conflict resolution',
            originalServer: serverStatus,
            originalClient: clientStatus,
            resolutionStrategy: resolution.strategy,
          }
        );
      }

      // Notify client of resolution
      const socket = this.io.sockets.sockets.get(currentState.socket_id);
      if (socket) {
        socket.emit('statusConflictResolved', {
          playerId,
          roomCode,
          resolvedStatus: resolution.resolvedStatus,
          strategy: resolution.strategy,
          requiresAction: resolution.requiresClientAction,
        });
      }

      return resolution;
    } catch (error) {
      console.error(`❌ [STATUS] Failed to reconcile status conflicts:`, error);
      throw error;
    }
  }

  // Process queued status updates
  async processStatusUpdates() {
    const processedUpdates = [];
    const failedUpdates = [];

    for (const [updateKey, update] of this.statusQueue.entries()) {
      try {
        await this.processStatusUpdate(updateKey);
        processedUpdates.push(updateKey);
      } catch (error) {
        console.error(`❌ [STATUS] Failed to process update ${updateKey}:`, error);

        // Retry logic
        update.retryCount++;
        if (update.retryCount >= 3) {
          failedUpdates.push(updateKey);
          this.statusQueue.delete(updateKey);
        }
      }
    }

    // Remove processed updates
    processedUpdates.forEach(key => this.statusQueue.delete(key));

    if (processedUpdates.length > 0) {
      console.log(`✅ [STATUS] Processed ${processedUpdates.length} status updates`);
    }
    if (failedUpdates.length > 0) {
      console.log(
        `❌ [STATUS] Failed to process ${failedUpdates.length} status updates after retries`
      );
    }

    return { processed: processedUpdates.length, failed: failedUpdates.length };
  }

  // Process individual status update
  async processStatusUpdate(updateKey) {
    const update = this.statusQueue.get(updateKey);
    if (!update) return;

    await this.lobbyManager.updatePlayerStatus(
      update.playerId,
      update.roomCode,
      update.status,
      update.location,
      update.metadata
    );
  }

  // Resolve status conflicts using various strategies
  resolveConflict(dbState, serverStatus, clientStatus) {
    // Strategy 1: Trust database state (most conservative)
    if (
      this.isSignificantDifference(dbState, serverStatus) &&
      this.isSignificantDifference(dbState, clientStatus)
    ) {
      return {
        strategy: 'trust_database',
        resolvedStatus: this.mapDbStateToStatus(dbState),
        updateRequired: false,
        requiresClientAction: true,
      };
    }

    // Strategy 2: Prefer connection status from client, game status from server
    if (clientStatus.isConnected !== undefined && serverStatus.inGame !== undefined) {
      return {
        strategy: 'hybrid_preference',
        resolvedStatus: {
          status: clientStatus.isConnected ? 'connected' : 'disconnected',
          location: serverStatus.inGame ? 'game' : 'lobby',
        },
        updateRequired: true,
        requiresClientAction: false,
      };
    }

    // Strategy 3: Most recent update wins (timestamp-based)
    const serverTime = new Date(serverStatus.timestamp || 0).getTime();
    const clientTime = new Date(clientStatus.timestamp || 0).getTime();

    const newerStatus = serverTime > clientTime ? serverStatus : clientStatus;
    return {
      strategy: 'most_recent',
      resolvedStatus: newerStatus,
      updateRequired: true,
      requiresClientAction: false,
    };
  }

  // Check if there's a significant difference in states
  isSignificantDifference(dbState, compareState) {
    if (!compareState) return false;

    const dbConnected = dbState.is_connected;
    const compareConnected = compareState.isConnected;

    const dbLocation = dbState.current_location;
    const compareLocation = compareState.location;

    return dbConnected !== compareConnected || dbLocation !== compareLocation;
  }

  // Map database state to status format
  mapDbStateToStatus(dbState) {
    return {
      status: dbState.is_connected ? 'connected' : 'disconnected',
      location: dbState.current_location,
      isConnected: dbState.is_connected,
      inGame: dbState.in_game,
      timestamp: dbState.last_ping,
    };
  }

  // Setup heartbeat monitoring system
  setupHeartbeatSystem() {
    // Check for disconnections every 30 seconds
    setInterval(async () => {
      try {
        await this.detectDisconnections();
      } catch (error) {
        console.error(`❌ [STATUS] Heartbeat check failed:`, error);
      }
    }, 30000);
  }

  // Setup status sync processing loop
  setupStatusSyncLoop() {
    // Process status queue every 5 seconds
    this.syncInterval = setInterval(async () => {
      try {
        await this.processStatusUpdates();
      } catch (error) {
        console.error(`❌ [STATUS] Status sync loop failed:`, error);
      }
    }, 5000);
  }

  // Bulk status update for external games
  async bulkUpdatePlayerStatus(roomCode, players, reason = 'Bulk update') {
    try {
      console.log(`📦 [STATUS] Bulk updating ${players.length} players in room ${roomCode}`);

      const results = [];
      const errors = [];

      // Process updates in parallel with concurrency limit
      const concurrencyLimit = 5;
      const chunks = this.chunkArray(players, concurrencyLimit);

      for (const chunk of chunks) {
        const chunkPromises = chunk.map(async player => {
          try {
            await this.updatePlayerLocation(player.playerId, roomCode, player.location, {
              reason: `${reason} - ${player.reason || 'No specific reason'}`,
              bulkUpdate: true,
              gameData: player.gameData,
            });
            results.push({ playerId: player.playerId, success: true });
          } catch (error) {
            console.error(`❌ [STATUS] Bulk update failed for player ${player.playerId}:`, error);
            errors.push({ playerId: player.playerId, error: error.message });
          }
        });

        await Promise.all(chunkPromises);
      }

      // Sync room status after bulk update
      await this.syncRoomStatus(roomCode);

      console.log(
        `✅ [STATUS] Bulk update completed: ${results.length} success, ${errors.length} errors`
      );
      return {
        success: true,
        results,
        errors,
        summary: {
          total: players.length,
          successful: results.length,
          failed: errors.length,
        },
      };
    } catch (error) {
      console.error(`❌ [STATUS] Bulk status update failed:`, error);
      throw error;
    }
  }

  // Utility method to chunk arrays
  chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  // Handle game end - return all players to lobby
  async handleGameEnd(roomCode, gameResult = {}) {
    try {
      console.log(`🎮 [STATUS] Handling game end for room ${roomCode}`);

      // Get all players currently in game
      const { data: playersInGame } = await this.db.adminClient
        .from('room_members')
        .select(
          `
          user_id,
          user:users(username, display_name)
        `
        )
        .eq(
          'room_id',
          (await this.db.adminClient.from('rooms').select('id').eq('room_code', roomCode).single())
            .data?.id
        )
        .eq('current_location', 'game')
        .eq('is_connected', true);

      if (!playersInGame || playersInGame.length === 0) {
        console.log(`ℹ️ [STATUS] No players in game for room ${roomCode}`);
        return { success: true, playersReturned: 0 };
      }

      // Return all players to lobby
      const returnPlayers = playersInGame.map(player => ({
        playerId: player.user_id,
        location: 'lobby',
        reason: 'Game ended',
        gameData: gameResult,
      }));

      const result = await this.bulkUpdatePlayerStatus(
        roomCode,
        returnPlayers,
        'Game ended - returning players to lobby'
      );

      // Update room status
      await this.lobbyManager.updateRoomStatus(roomCode, 'lobby', 'Game ended');

      // Log game end event
      await this.db.logEvent(
        (await this.db.adminClient.from('rooms').select('id').eq('room_code', roomCode).single())
          .data?.id,
        null,
        'game_ended',
        {
          playersReturned: result.summary.successful,
          gameResult,
        }
      );

      console.log(
        `✅ [STATUS] Game end handled: ${result.summary.successful} players returned to lobby`
      );
      return { success: true, playersReturned: result.summary.successful };
    } catch (error) {
      console.error(`❌ [STATUS] Failed to handle game end:`, error);
      throw error;
    }
  }

  // Cleanup method
  cleanup() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    this.statusQueue.clear();
    this.heartbeats.clear();
  }
}

module.exports = StatusSyncManager;
