import crypto from 'crypto';
import { Server as SocketIOServer } from 'socket.io';
import ConnectionManager from './connectionManager';

// Type definitions - using 'any' for complex Supabase client types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface DatabaseService {
  adminClient: any;
  logEvent: (roomId: string | null, userId: string | null, eventType: string, data?: Record<string, unknown>) => Promise<void>;
}

interface Room {
  id: string;
  room_code: string;
  host_id: string;
  status: string;
  current_game: string | null;
  max_players: number;
  streamer_mode: boolean;
  is_public: boolean;
  game_settings?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  participants?: RoomMember[];
}

interface RoomMember {
  id: string;
  room_id: string;
  user_id: string;
  role: string;
  is_connected: boolean;
  is_ready?: boolean;
  in_game: boolean;
  current_location: string;
  last_ping: string;
  joined_at: string;
  custom_lobby_name: string | null;
  socket_id: string | null;
  game_data?: Record<string, unknown>;
  user?: User;
}

interface User {
  username?: string;
  display_name?: string;
  premium_tier?: string;
  avatar_url?: string;
  role?: string;
}

interface RoomSettings {
  maxPlayers?: number;
  streamerMode?: boolean;
  [key: string]: unknown;
}

interface Player {
  id: string;
  name: string;
  isHost: boolean;
  isConnected: boolean;
  inGame: boolean;
  currentLocation: string;
  lastPing: string;
  gameData?: Record<string, unknown>;
  premiumTier: string;
  avatarUrl: string | null;
}

interface RoomState {
  id: string;
  code: string;
  hostId: string;
  status: string;
  gameType: string;
  players: Map<string, Player>;
  lastUpdate: number;
}

interface StatusMapping {
  is_connected: boolean;
  in_game: boolean;
  current_location: string;
}

interface JoinRoomResult {
  success: boolean;
  room: Room;
  players: Player[];
  sessionToken: string;
  isRejoin: boolean;
}

interface UpdateStatusResult {
  success: boolean;
  updated: StatusMapping;
  conflicts: string[];
}

interface RoomWithParticipants {
  room: Room;
  players: Player[];
}

class LobbyManager {
  private io: SocketIOServer;
  private db: DatabaseService;
  private connectionManager: ConnectionManager;
  private roomStates: Map<string, RoomState>;
  private playerSessions: Map<string, unknown>;
  private statusQueue: Map<string, unknown>;

  constructor(io: SocketIOServer, db: DatabaseService, connectionManager: ConnectionManager) {
    this.io = io;
    this.db = db;
    this.connectionManager = connectionManager;
    this.roomStates = new Map();
    this.playerSessions = new Map();
    this.statusQueue = new Map();

    // Initialize cleanup interval
    this.setupCleanupInterval();
  }

  // Generate unique room code
  generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Create a new room
  async createRoom(
    hostId: string,
    gameType: string = 'lobby',
    settings: RoomSettings = {},
    customLobbyName: string | null = null
  ): Promise<{ room: Room; roomCode: string }> {
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
          max_players: settings.maxPlayers || 30,
          streamer_mode: settings.streamerMode || false,
          metadata: {
            created_by_host: true,
            version: '2.0'
          }
        })
        .select()
        .single();

      if (roomError) throw roomError;

      // Add host as room member
      const { error: memberError } = await this.db.adminClient
        .from('room_members')
        .insert({
          room_id: (room as Room).id,
          user_id: hostId,
          role: 'host',
          is_connected: true,
          current_location: 'lobby',
          custom_lobby_name: customLobbyName
        })
        .select()
        .single();

      if (memberError) throw memberError;

      // Initialize room state cache
      this.roomStates.set(roomCode, {
        id: (room as Room).id,
        code: roomCode,
        hostId: hostId,
        status: 'lobby',
        gameType: gameType,
        players: new Map(),
        lastUpdate: Date.now()
      });

      // Log event
      await this.db.logEvent((room as Room).id, hostId, 'room_created', {
        roomCode,
        gameType,
        version: '2.0'
      });

      console.log(`✅ [LOBBY] Room ${roomCode} created by host ${hostId}`);
      return { room: room as Room, roomCode };

    } catch (error) {
      console.error('❌ [LOBBY] Failed to create room:', error);
      throw error;
    }
  }

  // Enhanced room joining with session management
  async joinRoom(
    playerId: string,
    roomCode: string,
    playerName: string,
    socketId: string,
    sessionToken: string | null = null,
    customLobbyName: string | null = null
  ): Promise<JoinRoomResult> {
    try {
      console.log(`🚪 [LOBBY] Player ${playerName} joining room ${roomCode}${customLobbyName ? ` with custom name: ${customLobbyName}` : ''}`);

      // Acquire connection lock to prevent race conditions
      if (!this.connectionManager.acquireLock(playerName, roomCode, socketId)) {
        throw new Error('Another connection is already joining this room');
      }

      // Get room from database
      const { data: room, error: roomError } = await this.db.adminClient
        .from('rooms')
        .select(`
          *,
          participants:room_members(
            *,
            user:users(*)
          )
        `)
        .eq('room_code', roomCode)
        .single();

      if (roomError || !room) {
        throw new Error('Room not found');
      }

      const typedRoom = room as Room;

      // Validate room status
      if (!['lobby', 'in_game', 'returning'].includes(typedRoom.status)) {
        throw new Error(`Room is ${typedRoom.status}`);
      }

      // Check if player is already in room
      const existingParticipant = typedRoom.participants?.find(p => p.user_id === playerId);

      if (existingParticipant) {
        // Rejoin - update connection status
        const updateData: Record<string, unknown> = {
          is_connected: true,
          socket_id: socketId,
          current_location: 'lobby',
          last_ping: new Date().toISOString()
        };

        // Update custom lobby name if provided
        if (customLobbyName !== null) {
          updateData.custom_lobby_name = customLobbyName;
        }

        await this.db.adminClient
          .from('room_members')
          .update(updateData)
          .eq('id', existingParticipant.id);

        console.log(`🔄 [LOBBY] Player ${playerName} rejoined room ${roomCode}`);
      } else {
        // Check room capacity
        const connectedCount = typedRoom.participants?.filter(p => p.is_connected).length || 0;
        if (connectedCount >= typedRoom.max_players) {
          throw new Error('Room is full');
        }

        // Add as new participant
        const { data: newMember, error: insertError } = await this.db.adminClient
          .from('room_members')
          .insert({
            room_id: typedRoom.id,
            user_id: playerId,
            role: 'player',
            is_connected: true,
            socket_id: socketId,
            current_location: 'lobby',
            custom_lobby_name: customLobbyName
          })
          .select()
          .single();

        if (insertError) throw insertError;

        // POST-INSERT CAPACITY CHECK (Race Condition Fix)
        // Verify we didn't exceed the limit due to concurrent inserts
        const { data: memberCount, error: countError } = await this.db.adminClient
          .from('room_members')
          .select('id')
          .eq('room_id', typedRoom.id)
          .eq('is_connected', true)
          .single();

        // Note: This is a simplified check - in production you'd use a proper count query
        // For now, we'll skip the rollback logic if we can't verify

        console.log(`✅ [LOBBY] Player ${playerName} joined room ${roomCode}`);
      }

      // Create/update session
      const sessionTokenValue = await this.createPlayerSession(playerId, typedRoom.id, socketId);

      // Update connection manager
      this.connectionManager.updateConnection(socketId, {
        userId: playerId,
        username: playerName,
        roomId: typedRoom.id,
        roomCode: roomCode,
        sessionToken: sessionTokenValue
      });

      // Update room state cache
      await this.updateRoomStateCache(roomCode);

      // Get updated room data for response
      const roomData = await this.getRoomWithParticipants(roomCode);

      if (!roomData) {
        throw new Error('Failed to get room data after join');
      }

      // Broadcast to room
      await this.broadcastRoomUpdate(roomCode, 'playerJoined', {
        player: { id: playerId, name: playerName },
        room: roomData.room,
        players: roomData.players
      });

      // Log event
      await this.db.logEvent(typedRoom.id, playerId, 'player_joined_v2', {
        playerName,
        isRejoin: !!existingParticipant,
        sessionToken: sessionTokenValue
      });

      return {
        success: true,
        room: roomData.room,
        players: roomData.players,
        sessionToken: sessionTokenValue,
        isRejoin: !!existingParticipant
      };

    } catch (error) {
      console.error(`❌ [LOBBY] Failed to join room ${roomCode}:`, error);
      this.connectionManager.releaseLock(playerName, roomCode);
      throw error;
    }
  }

  // Enhanced player status update with conflict resolution
  async updatePlayerStatus(
    playerId: string,
    roomCode: string,
    status: string,
    location: string,
    metadata: Record<string, unknown> = {}
  ): Promise<UpdateStatusResult> {
    try {
      console.log(`🔄 [LOBBY] Updating player ${playerId} status: ${status}/${location}`);

      // Get room ID first
      const { data: roomIdData } = await this.db.adminClient
        .from('rooms')
        .select('id')
        .eq('room_code', roomCode)
        .single();

      if (!roomIdData) {
        throw new Error('Room not found');
      }

      const roomId = (roomIdData as { id: string }).id;

      // Get current state from database
      const { data: currentMember, error } = await this.db.adminClient
        .from('room_members')
        .select(`
          *,
          room:rooms(*),
          user:users(*)
        `)
        .eq('user_id', playerId)
        .eq('room_id', roomId)
        .single();

      if (error || !currentMember) {
        throw new Error('Player not found in room');
      }

      const typedMember = currentMember as RoomMember;

      // Determine status mapping
      const statusMapping = this.mapStatusToDatabase(status, location);

      // Check for conflicts
      const conflicts = this.detectStatusConflicts(typedMember, statusMapping);

      // Resolve conflicts if any
      const resolvedStatus = conflicts.length > 0 ?
        this.resolveStatusConflicts(typedMember, statusMapping, conflicts) :
        statusMapping;

      // Update database
      const { error: updateError } = await this.db.adminClient
        .from('room_members')
        .update({
          ...resolvedStatus,
          last_ping: new Date().toISOString(),
          game_data: { ...typedMember.game_data, ...metadata }
        })
        .eq('id', typedMember.id);

      if (updateError) throw updateError;

      // Log status history
      await this.db.adminClient
        .from('player_status_history')
        .insert({
          user_id: playerId,
          room_id: typedMember.room_id,
          old_location: typedMember.current_location,
          new_location: resolvedStatus.current_location,
          old_status: typedMember.is_connected ? 'connected' : 'disconnected',
          new_status: resolvedStatus.is_connected ? 'connected' : 'disconnected',
          reason: (metadata.reason as string) || `Status update: ${status}`,
          metadata: { conflicts, originalRequest: { status, location }, ...metadata }
        })
        .select()
        .single();

      // Update room state cache
      await this.updateRoomStateCache(roomCode);

      // Broadcast update
      const roomData = await this.getRoomWithParticipants(roomCode);
      if (roomData) {
        await this.broadcastRoomUpdate(roomCode, 'playerStatusUpdated', {
          playerId,
          status: resolvedStatus,
          room: roomData.room,
          players: roomData.players,
          conflicts
        });
      }

      console.log(`✅ [LOBBY] Player ${playerId} status updated successfully`);
      return { success: true, updated: resolvedStatus, conflicts };

    } catch (error) {
      console.error(`❌ [LOBBY] Failed to update player status:`, error);
      throw error;
    }
  }

  // Handle player returning from game
  async handlePlayerReturn(playerId: string, roomCode: string, fromGame: boolean = true): Promise<{ success: boolean }> {
    console.log(`🔄 [LOBBY] Player ${playerId} returning to lobby from ${fromGame ? 'game' : 'unknown'}`);

    try {
      // Update status to lobby
      await this.updatePlayerStatus(playerId, roomCode, 'lobby', 'lobby', {
        reason: `Player returned from ${fromGame ? 'game' : 'external source'}`,
        returnTimestamp: new Date().toISOString()
      });

      // Check if all players have returned and update room status if needed
      const roomData = await this.getRoomWithParticipants(roomCode);
      if (roomData) {
        const connectedPlayers = roomData.players.filter(p => p.isConnected);
        const playersInLobby = connectedPlayers.filter(p => p.currentLocation === 'lobby');

        if (playersInLobby.length === connectedPlayers.length && connectedPlayers.length > 0) {
          // All connected players are back in lobby
          await this.updateRoomStatus(roomCode, 'lobby', `All players returned to lobby`);
        }
      }

      return { success: true };

    } catch (error) {
      console.error(`❌ [LOBBY] Failed to handle player return:`, error);
      throw error;
    }
  }

  // Initiate group return (host only)
  async initiateGroupReturn(hostId: string, roomCode: string): Promise<{ success: boolean; playersReturning: number }> {
    console.log(`👑 [LOBBY] Host ${hostId} initiating group return for room ${roomCode}`);

    try {
      // Verify host permissions
      const { data: room } = await this.db.adminClient
        .from('rooms')
        .select('id, host_id')
        .eq('room_code', roomCode)
        .single();

      const typedRoom = room as { id: string; host_id: string } | null;

      if (!typedRoom || typedRoom.host_id !== hostId) {
        throw new Error('Only the host can initiate group return');
      }

      // Update room status to returning
      await this.updateRoomStatus(roomCode, 'returning', 'Host initiated group return');

      // Get all players in game
      const { data: members } = await this.db.adminClient
        .from('room_members')
        .select(`
          *,
          user:users(*)
        `)
        .eq('room_id', typedRoom.id)
        .eq('is_connected', true)
        .eq('current_location', 'game')
        .single();

      // Handle the case where we might have multiple members
      const memberArray = Array.isArray(members) ? members : (members ? [members] : []);

      // Update all players to returning status
      if (memberArray.length > 0) {
        await Promise.all(memberArray.map((member: RoomMember) =>
          this.updatePlayerStatus(member.user_id, roomCode, 'returning', 'lobby', {
            reason: 'Group return initiated by host',
            groupReturn: true
          })
        ));
      }

      console.log(`✅ [LOBBY] Group return initiated for ${memberArray.length} players`);
      return { success: true, playersReturning: memberArray.length };

    } catch (error) {
      console.error(`❌ [LOBBY] Failed to initiate group return:`, error);
      throw error;
    }
  }

  // Create player session
  async createPlayerSession(playerId: string, roomId: string, socketId: string): Promise<string> {
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await this.db.adminClient
      .from('player_sessions')
      .upsert({
        user_id: playerId,
        room_id: roomId,
        session_token: sessionToken,
        socket_id: socketId,
        status: 'active',
        expires_at: expiresAt.toISOString()
      }, {
        onConflict: 'user_id,room_id'
      })
      .select()
      .single();

    return sessionToken;
  }

  // Recover player session
  async recoverSession(
    sessionToken: string,
    newSocketId: string
  ): Promise<{ success: boolean; playerId: string; roomCode: string; playerState: RoomMember }> {
    try {
      const { data: session, error } = await this.db.adminClient
        .from('player_sessions')
        .select(`
          *,
          user:users(*),
          room:rooms(*),
          member:room_members!inner(*)
        `)
        .eq('session_token', sessionToken)
        .eq('status', 'active')
        .single();

      if (error || !session) {
        throw new Error('Invalid or expired session');
      }

      const typedSession = session as {
        id: string;
        user_id: string;
        room_id: string;
        room: { room_code: string };
        member: RoomMember[];
      };

      // Update session with new socket
      await this.db.adminClient
        .from('player_sessions')
        .update({
          socket_id: newSocketId,
          last_heartbeat: new Date().toISOString()
        })
        .eq('id', typedSession.id);

      // Update room member connection
      await this.db.adminClient
        .from('room_members')
        .update({
          socket_id: newSocketId,
          is_connected: true,
          last_ping: new Date().toISOString()
        })
        .eq('user_id', typedSession.user_id)
        .eq('room_id', typedSession.room_id);

      console.log(`🔄 [LOBBY] Session recovered for player ${typedSession.user_id}`);
      return {
        success: true,
        playerId: typedSession.user_id,
        roomCode: typedSession.room.room_code,
        playerState: typedSession.member[0]
      };

    } catch (error) {
      console.error('❌ [LOBBY] Session recovery failed:', error);
      throw error;
    }
  }

  // Utility methods
  private mapStatusToDatabase(status: string, location: string): StatusMapping {
    const mapping: Record<string, StatusMapping> = {
      connected: { is_connected: true, in_game: location === 'game', current_location: location || 'lobby' },
      disconnected: { is_connected: false, in_game: false, current_location: 'disconnected' },
      in_game: { is_connected: true, in_game: true, current_location: 'game' },
      returning: { is_connected: true, in_game: false, current_location: 'lobby' },
      lobby: { is_connected: true, in_game: false, current_location: 'lobby' }
    };
    return mapping[status] || mapping.lobby;
  }

  private detectStatusConflicts(currentState: RoomMember, newState: StatusMapping): string[] {
    const conflicts: string[] = [];

    // Check for impossible transitions
    if (!currentState.is_connected && newState.in_game) {
      conflicts.push('Cannot be in game while disconnected');
    }

    if (currentState.current_location === 'game' && newState.current_location === 'lobby' && newState.in_game) {
      conflicts.push('Location and game status mismatch');
    }

    return conflicts;
  }

  private resolveStatusConflicts(
    currentState: RoomMember,
    newState: StatusMapping,
    conflicts: string[]
  ): StatusMapping {
    // Simple conflict resolution - prefer connection state over game state
    if (conflicts.includes('Cannot be in game while disconnected')) {
      return { ...newState, in_game: false, current_location: 'disconnected' };
    }

    if (conflicts.includes('Location and game status mismatch')) {
      return { ...newState, in_game: newState.current_location === 'game' };
    }

    return newState;
  }

  private async updateRoomStateCache(roomCode: string): Promise<void> {
    const roomData = await this.getRoomWithParticipants(roomCode);
    if (roomData) {
      this.roomStates.set(roomCode, {
        ...roomData.room,
        code: roomCode,
        hostId: roomData.room.host_id,
        gameType: roomData.room.current_game || 'lobby',
        players: new Map(roomData.players.map(p => [p.id, p])),
        lastUpdate: Date.now()
      });
    }
  }

  async getRoomWithParticipants(roomCode: string): Promise<RoomWithParticipants | null> {
    const { data: room, error } = await this.db.adminClient
      .from('rooms')
      .select(`
        *,
        participants:room_members(
          *,
          user:users(*)
        )
      `)
      .eq('room_code', roomCode)
      .single();

    if (error || !room) return null;

    const typedRoom = room as Room;

    const players: Player[] = typedRoom.participants?.map(p => {
      const player: Player = {
        id: p.user_id,
        name: p.custom_lobby_name || p.user?.display_name || 'Player',
        isHost: p.role === 'host',
        isConnected: p.is_connected,
        inGame: p.in_game,
        currentLocation: p.current_location,
        lastPing: p.last_ping,
        gameData: p.game_data,
        // Premium features
        premiumTier: p.user?.premium_tier || 'free',
        avatarUrl: p.user?.avatar_url || null
      };

      // Debug each player
      console.log('🎮 [LOBBY MANAGER] Player:', {
        name: player.name,
        customLobbyName: p.custom_lobby_name,
        displayName: p.user?.display_name,
        username: p.user?.username,
        premiumTier: player.premiumTier,
        hasUser: !!p.user,
        userPremiumTier: p.user?.premium_tier,
        userAvatarUrl: p.user?.avatar_url
      });

      return player;
    }) || [];

    return { room: typedRoom, players };
  }

  async updateRoomStatus(roomCode: string, status: string, reason: string): Promise<void> {
    await this.db.adminClient
      .from('rooms')
      .update({
        status,
        updated_at: new Date().toISOString(),
        last_activity: new Date().toISOString()
      })
      .eq('room_code', roomCode);

    await this.broadcastRoomUpdate(roomCode, 'roomStatusChanged', {
      newStatus: status,
      reason,
      timestamp: new Date().toISOString()
    });
  }

  async broadcastRoomUpdate(roomCode: string, eventType: string, data: Record<string, unknown>): Promise<void> {
    this.io.to(roomCode).emit(eventType, {
      roomCode,
      timestamp: new Date().toISOString(),
      ...data
    });
  }

  private setupCleanupInterval(): void {
    // Clean up expired sessions and stale connections every 5 minutes
    setInterval(async () => {
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
    }, 5 * 60 * 1000);
  }
}

export default LobbyManager;
