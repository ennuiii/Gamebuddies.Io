import { Server as SocketIOServer, Socket } from 'socket.io';

// Type definitions - using 'any' for complex Supabase client types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface DatabaseService {
  adminClient: any;
  logEvent: (roomId: string | undefined, userId: string | null, eventType: string, data: Record<string, unknown>) => Promise<void>;
}

interface LobbyManager {
  getRoomWithParticipants: (roomCode: string) => Promise<{ room: Record<string, unknown>; players: Player[] } | null>;
  updatePlayerStatus: (playerId: string, roomCode: string, status: string, location: string, metadata?: Record<string, unknown>) => Promise<void>;
  updateRoomStatus: (roomCode: string, status: string, reason: string) => Promise<void>;
}

interface Player {
  id: string;
  name: string;
  isConnected: boolean;
  currentLocation: string;
  [key: string]: unknown;
}

interface StatusUpdate {
  playerId: string;
  roomCode: string;
  status: string;
  location: string;
  metadata: {
    timestamp: string;
    source: string;
    reason?: string;
    [key: string]: unknown;
  };
  retryCount: number;
  queuedAt: number;
  sequenceNumber: number; // BUG FIX #26: Added for ordering
}

interface Heartbeat {
  playerId: string;
  roomCode: string;
  socketId: string;
  lastHeartbeat: number;
  metadata: Record<string, unknown>;
}

interface StatusMapping {
  status: string;
  location: string;
  isConnected?: boolean;
  inGame?: boolean;
  timestamp?: string;
}

interface DbState {
  is_connected: boolean;
  current_location: string;
  in_game: boolean;
  last_ping: string;
  socket_id?: string;
  room?: Record<string, unknown>;
  user?: Record<string, unknown>;
}

interface ConflictResolution {
  strategy: string;
  resolvedStatus: StatusMapping;
  updateRequired: boolean;
  requiresClientAction: boolean;
}

interface BulkUpdatePlayer {
  playerId: string;
  location: string;
  reason?: string;
  gameData?: Record<string, unknown>;
}

interface BulkUpdateResult {
  success: boolean;
  results: { playerId: string; success: boolean }[];
  errors: { playerId: string; error: string }[];
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}

class StatusSyncManager {
  private db: DatabaseService;
  private io: SocketIOServer;
  private lobbyManager: LobbyManager;
  private statusQueue: Map<string, StatusUpdate>;
  private heartbeats: Map<string, Heartbeat>;
  private syncInterval: NodeJS.Timeout | null;
  private sequenceCounter: number; // BUG FIX #26: Global sequence counter for ordering

  constructor(db: DatabaseService, io: SocketIOServer, lobbyManager: LobbyManager) {
    this.db = db;
    this.io = io;
    this.lobbyManager = lobbyManager;
    this.statusQueue = new Map();
    this.heartbeats = new Map();
    this.syncInterval = null;
    this.sequenceCounter = 0; // BUG FIX #26: Initialize sequence counter

    this.setupHeartbeatSystem();
    this.setupStatusSyncLoop();
  }

  // BUG FIX #26: Get next sequence number for ordering
  private getNextSequence(): number {
    return ++this.sequenceCounter;
  }

  // Update player location with real-time sync
  // BUG FIX #26: All updates now go through the queue with sequence numbers for proper ordering
  async updatePlayerLocation(
    playerId: string,
    roomCode: string,
    location: string,
    metadata: Record<string, unknown> = {}
  ): Promise<{ success: boolean; queued: boolean; sequenceNumber: number }> {
    try {
      const sequenceNumber = this.getNextSequence();
      console.log(`📍 [STATUS] Updating player ${playerId} location: ${location} (seq: ${sequenceNumber})`);

      // Determine status based on location
      let status = 'connected';
      if (location === 'disconnected') {
        status = 'disconnected';
      } else if (location === 'game') {
        status = 'in_game';
      } else if (location === 'lobby') {
        status = 'lobby';
      }

      // BUG FIX #26: Queue ALL updates with sequence number for proper ordering
      const updateKey = `${playerId}_${roomCode}`;
      const existingUpdate = this.statusQueue.get(updateKey);

      // Only replace if this is a newer update (higher sequence number)
      if (!existingUpdate || sequenceNumber > existingUpdate.sequenceNumber) {
        this.statusQueue.set(updateKey, {
          playerId,
          roomCode,
          status,
          location,
          metadata: {
            ...metadata,
            timestamp: new Date().toISOString(),
            source: 'location_update',
            sequenceNumber // Include in metadata for client ordering
          },
          retryCount: 0,
          queuedAt: Date.now(),
          sequenceNumber
        });
      } else {
        console.log(`⏭️ [STATUS] Skipping stale update for ${playerId} (seq: ${sequenceNumber} < ${existingUpdate.sequenceNumber})`);
      }

      // BUG FIX #26: Still process critical updates immediately, but through the queue
      // This ensures ordering is maintained even for immediate updates
      if (location === 'disconnected' || metadata.immediate) {
        await this.processStatusUpdate(updateKey);
      }

      return { success: true, queued: !metadata.immediate, sequenceNumber };

    } catch (error) {
      console.error(`❌ [STATUS] Failed to update player location:`, error);
      throw error;
    }
  }

  // Sync entire room status
  async syncRoomStatus(roomCode: string): Promise<{ success: boolean; playersCount: number }> {
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
        syncType: 'full'
      });

      return { success: true, playersCount: roomData.players.length };

    } catch (error) {
      console.error(`❌ [STATUS] Failed to sync room status:`, error);
      throw error;
    }
  }

  // Handle player heartbeat
  async handleHeartbeat(
    playerId: string,
    roomCode: string,
    socketId: string,
    metadata: Record<string, unknown> = {}
  ): Promise<{ success: boolean; nextHeartbeat: number }> {
    const heartbeatKey = `${playerId}_${roomCode}`;

    this.heartbeats.set(heartbeatKey, {
      playerId,
      roomCode,
      socketId,
      lastHeartbeat: Date.now(),
      metadata
    });

    // Update last ping in database periodically (not every heartbeat)
    const shouldUpdateDb = Date.now() % 10 === 0; // Every ~10th heartbeat
    if (shouldUpdateDb) {
      try {
        const roomResult = await this.db.adminClient
          .from('rooms')
          .select('id')
          .eq('room_code', roomCode)
          .single();

        if (roomResult.data?.id) {
          await this.db.adminClient
            .from('room_members')
            .update({
              last_ping: new Date().toISOString()
            })
            .eq('user_id', playerId)
            .eq('room_id', roomResult.data.id);
        }
      } catch (error) {
        console.error(`❌ [STATUS] Heartbeat DB update failed:`, error);
      }
    }

    return { success: true, nextHeartbeat: 30000 }; // 30 seconds
  }

  // Detect disconnected players
  async detectDisconnections(): Promise<number> {
    const now = Date.now();
    const disconnectionThreshold = 60000; // 60 seconds
    const disconnectedPlayers: Heartbeat[] = [];

    for (const [heartbeatKey, heartbeat] of this.heartbeats.entries()) {
      if (now - heartbeat.lastHeartbeat > disconnectionThreshold) {
        disconnectedPlayers.push(heartbeat);
        this.heartbeats.delete(heartbeatKey);
      }
    }

    // Process disconnections
    for (const player of disconnectedPlayers) {
      try {
        console.log(`💔 [STATUS] Player ${player.playerId} detected as disconnected (no heartbeat)`);

        await this.updatePlayerLocation(player.playerId, player.roomCode, 'disconnected', {
          reason: 'Heartbeat timeout',
          lastHeartbeat: new Date(player.lastHeartbeat).toISOString(),
          immediate: true
        });
      } catch (error) {
        console.error(`❌ [STATUS] Failed to handle disconnection:`, error);
      }
    }

    return disconnectedPlayers.length;
  }

  // Reconcile status conflicts between server and client
  async reconcileStatusConflicts(
    playerId: string,
    roomCode: string,
    serverStatus: StatusMapping,
    clientStatus: StatusMapping
  ): Promise<ConflictResolution> {
    try {
      console.log(`🔧 [STATUS] Reconciling status conflict for player ${playerId}`);
      console.log(`Server status:`, serverStatus);
      console.log(`Client status:`, clientStatus);

      // Get authoritative state from database
      const roomResult = await this.db.adminClient
        .from('rooms')
        .select('id')
        .eq('room_code', roomCode)
        .single();

      const { data: currentState, error } = await this.db.adminClient
        .from('room_members')
        .select(`
          *,
          room:rooms(*),
          user:users(*)
        `)
        .eq('user_id', playerId)
        .eq('room_id', roomResult.data?.id || '')
        .single();

      if (error || !currentState) {
        throw new Error('Player state not found in database');
      }

      const dbState = currentState as unknown as DbState;

      // Determine resolution strategy
      const resolution = this.resolveConflict(dbState, serverStatus, clientStatus);

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
            resolutionStrategy: resolution.strategy
          }
        );
      }

      // Notify client of resolution
      const socket = this.io.sockets.sockets.get(dbState.socket_id || '');
      if (socket) {
        socket.emit('statusConflictResolved', {
          playerId,
          roomCode,
          resolvedStatus: resolution.resolvedStatus,
          strategy: resolution.strategy,
          requiresAction: resolution.requiresClientAction
        });
      }

      return resolution;

    } catch (error) {
      console.error(`❌ [STATUS] Failed to reconcile status conflicts:`, error);
      throw error;
    }
  }

  // Process queued status updates
  async processStatusUpdates(): Promise<{ processed: number; failed: number }> {
    const processedUpdates: string[] = [];
    const failedUpdates: string[] = [];

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
      console.log(`❌ [STATUS] Failed to process ${failedUpdates.length} status updates after retries`);
    }

    return { processed: processedUpdates.length, failed: failedUpdates.length };
  }

  // Process individual status update
  private async processStatusUpdate(updateKey: string): Promise<void> {
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
  private resolveConflict(
    dbState: DbState,
    serverStatus: StatusMapping,
    clientStatus: StatusMapping
  ): ConflictResolution {
    // Strategy 1: Trust database state (most conservative)
    if (this.isSignificantDifference(dbState, serverStatus) &&
      this.isSignificantDifference(dbState, clientStatus)) {
      return {
        strategy: 'trust_database',
        resolvedStatus: this.mapDbStateToStatus(dbState),
        updateRequired: false,
        requiresClientAction: true
      };
    }

    // Strategy 2: Prefer connection status from client, game status from server
    if ((clientStatus as StatusMapping & { isConnected?: boolean }).isConnected !== undefined &&
        (serverStatus as StatusMapping & { inGame?: boolean }).inGame !== undefined) {
      return {
        strategy: 'hybrid_preference',
        resolvedStatus: {
          status: (clientStatus as StatusMapping & { isConnected?: boolean }).isConnected ? 'connected' : 'disconnected',
          location: (serverStatus as StatusMapping & { inGame?: boolean }).inGame ? 'game' : 'lobby'
        },
        updateRequired: true,
        requiresClientAction: false
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
      requiresClientAction: false
    };
  }

  // Check if there's a significant difference in states
  private isSignificantDifference(dbState: DbState, compareState: StatusMapping | null): boolean {
    if (!compareState) return false;

    const dbConnected = dbState.is_connected;
    const compareConnected = (compareState as StatusMapping & { isConnected?: boolean }).isConnected;

    const dbLocation = dbState.current_location;
    const compareLocation = compareState.location;

    return (dbConnected !== compareConnected) ||
      (dbLocation !== compareLocation);
  }

  // Map database state to status format
  private mapDbStateToStatus(dbState: DbState): StatusMapping {
    return {
      status: dbState.is_connected ? 'connected' : 'disconnected',
      location: dbState.current_location,
      isConnected: dbState.is_connected,
      inGame: dbState.in_game,
      timestamp: dbState.last_ping
    };
  }

  // Setup heartbeat monitoring system
  private setupHeartbeatSystem(): void {
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
  private setupStatusSyncLoop(): void {
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
  // BUG FIX #3: Added transaction-like rollback for bulk operations
  async bulkUpdatePlayerStatus(
    roomCode: string,
    players: BulkUpdatePlayer[],
    reason: string = 'Bulk update'
  ): Promise<BulkUpdateResult> {
    try {
      console.log(`📦 [STATUS] Bulk updating ${players.length} players in room ${roomCode}`);

      const results: { playerId: string; success: boolean; previousLocation?: string }[] = [];
      const errors: { playerId: string; error: string }[] = [];

      // BUG FIX #3: Store previous states for potential rollback
      const previousStates: Map<string, string> = new Map();
      const ROLLBACK_THRESHOLD = 0.5; // Rollback if more than 50% fail

      // Get room ID for queries
      const roomResult = await this.db.adminClient
        .from('rooms')
        .select('id')
        .eq('room_code', roomCode)
        .single();

      if (roomResult.data?.id) {
        // Fetch current states before update
        const { data: currentStates } = await this.db.adminClient
          .from('room_members')
          .select('user_id, current_location')
          .eq('room_id', roomResult.data.id);

        if (currentStates) {
          for (const state of currentStates as { user_id: string; current_location: string }[]) {
            previousStates.set(state.user_id, state.current_location || 'lobby');
          }
        }
      }

      // Process updates in parallel with concurrency limit
      const concurrencyLimit = 5;
      const chunks = this.chunkArray(players, concurrencyLimit);

      for (const chunk of chunks) {
        const chunkPromises = chunk.map(async (player) => {
          try {
            await this.updatePlayerLocation(
              player.playerId,
              roomCode,
              player.location,
              {
                reason: `${reason} - ${player.reason || 'No specific reason'}`,
                bulkUpdate: true,
                gameData: player.gameData
              }
            );
            results.push({
              playerId: player.playerId,
              success: true,
              previousLocation: previousStates.get(player.playerId)
            });
          } catch (error) {
            console.error(`❌ [STATUS] Bulk update failed for player ${player.playerId}:`, error);
            errors.push({ playerId: player.playerId, error: (error as Error).message });
          }
        });

        await Promise.all(chunkPromises);
      }

      // BUG FIX #3: Rollback if too many updates failed
      const failureRate = errors.length / players.length;
      if (failureRate > ROLLBACK_THRESHOLD && results.length > 0) {
        console.warn(`⚠️ [STATUS] Rollback triggered: ${(failureRate * 100).toFixed(1)}% failure rate exceeds threshold`);

        // Rollback successful updates to their previous states
        const rollbackPromises = results.map(async (result) => {
          if (result.success && result.previousLocation) {
            try {
              await this.updatePlayerLocation(
                result.playerId,
                roomCode,
                result.previousLocation,
                {
                  reason: 'Rollback due to bulk update failure',
                  rollback: true,
                  immediate: true
                }
              );
              console.log(`↩️ [STATUS] Rolled back ${result.playerId} to ${result.previousLocation}`);
            } catch (rollbackError) {
              console.error(`❌ [STATUS] Rollback failed for ${result.playerId}:`, rollbackError);
            }
          }
        });

        await Promise.all(rollbackPromises);

        return {
          success: false,
          results: [],
          errors: [
            ...errors,
            { playerId: 'ROLLBACK', error: `Bulk update rolled back due to ${(failureRate * 100).toFixed(1)}% failure rate` }
          ],
          summary: {
            total: players.length,
            successful: 0,
            failed: players.length
          }
        };
      }

      // Sync room status after successful bulk update
      await this.syncRoomStatus(roomCode);

      console.log(`✅ [STATUS] Bulk update completed: ${results.length} success, ${errors.length} errors`);
      return {
        success: true,
        results: results.map(r => ({ playerId: r.playerId, success: r.success })),
        errors,
        summary: {
          total: players.length,
          successful: results.length,
          failed: errors.length
        }
      };

    } catch (error) {
      console.error(`❌ [STATUS] Bulk status update failed:`, error);
      throw error;
    }
  }

  // Utility method to chunk arrays
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  // Handle game end - return all players to lobby
  async handleGameEnd(
    roomCode: string,
    gameResult: Record<string, unknown> = {}
  ): Promise<{ success: boolean; playersReturned: number }> {
    try {
      console.log(`🎮 [STATUS] Handling game end for room ${roomCode}`);

      // Get room ID first
      const roomResult = await this.db.adminClient
        .from('rooms')
        .select('id')
        .eq('room_code', roomCode)
        .single();

      if (!roomResult.data?.id) {
        console.log(`ℹ️ [STATUS] Room ${roomCode} not found`);
        return { success: true, playersReturned: 0 };
      }

      // Get all players currently in game
      const { data: playersInGame } = await this.db.adminClient
        .from('room_members')
        .select(`
          user_id,
          user:users(username, display_name)
        `)
        .eq('room_id', roomResult.data.id)
        .eq('current_location', 'game')
        .eq('is_connected', true);

      if (!playersInGame || playersInGame.length === 0) {
        console.log(`ℹ️ [STATUS] No players in game for room ${roomCode}`);
        return { success: true, playersReturned: 0 };
      }

      // Return all players to lobby
      const returnPlayers: BulkUpdatePlayer[] = (playersInGame as { user_id: string }[]).map(player => ({
        playerId: player.user_id,
        location: 'lobby',
        reason: 'Game ended',
        gameData: gameResult
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
        roomResult.data.id,
        null,
        'game_ended',
        {
          playersReturned: result.summary.successful,
          gameResult
        }
      );

      console.log(`✅ [STATUS] Game end handled: ${result.summary.successful} players returned to lobby`);
      return { success: true, playersReturned: result.summary.successful };

    } catch (error) {
      console.error(`❌ [STATUS] Failed to handle game end:`, error);
      throw error;
    }
  }

  // Cleanup method
  cleanup(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    this.statusQueue.clear();
    this.heartbeats.clear();
  }
}

export default StatusSyncManager;
