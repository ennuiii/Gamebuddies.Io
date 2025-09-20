const express = require('express');
const router = express.Router();
const LobbyManager = require('../lib/lobbyManager');
const StatusSyncManager = require('../lib/statusSyncManager');
const { validateApiKey, rateLimits } = require('../lib/validation');

module.exports = (io, db, connectionManager) => {
  const lobbyManager = new LobbyManager(io, db, connectionManager);
  const statusSyncManager = new StatusSyncManager(db, io, lobbyManager);

  // V2 Room validation with enhanced session support
  router.get('/rooms/:roomCode/validate', validateApiKey, rateLimits.apiCalls, async (req, res) => {
    try {
      const { roomCode } = req.params;
      const { playerName, playerId, sessionToken } = req.query;

      console.log(`🔍 [API V2] Validating room ${roomCode} for service ${req.apiKey.service_name}`);

      // Get room with enhanced participant data
      const { data: room, error } = await db.adminClient
        .from('rooms')
        .select(`
          *,
          participants:room_members(
            *,
            user:users(*),
            session:player_sessions(*)
          )
        `)
        .eq('room_code', roomCode)
        .single();

      if (error || !room) {
        return res.status(404).json({
          valid: false,
          error: 'Room not found',
          code: 'ROOM_NOT_FOUND'
        });
      }

      // Enhanced room status validation
      const validStatuses = ['lobby', 'in_game', 'returning'];
      if (!validStatuses.includes(room.status)) {
        return res.status(400).json({
          valid: false,
          error: `Room is ${room.status}`,
          code: 'ROOM_NOT_AVAILABLE',
          status: room.status,
          allowedStatuses: validStatuses
        });
      }

      // Game type compatibility check
      if (room.current_game && room.current_game !== req.apiKey.service_name) {
        return res.status(400).json({
          valid: false,
          error: 'Room is for a different game',
          code: 'WRONG_GAME_TYPE',
          expectedGame: req.apiKey.service_name,
          actualGame: room.current_game
        });
      }

      // Find participant and validate session if provided
      let participant = null;
      let sessionValid = false;

      if (playerName || playerId) {
        participant = room.participants?.find(p =>
          (playerName && p.user?.username === playerName) ||
          (playerId && p.user_id === playerId)
        );

        // Session validation
        if (sessionToken && participant?.session?.length > 0) {
          const activeSession = participant.session.find(s =>
            s.session_token === sessionToken &&
            s.status === 'active' &&
            new Date(s.expires_at) > new Date()
          );
          sessionValid = !!activeSession;
        }
      }

      // Get latest game state
      const { data: gameState } = await db.adminClient
        .from('game_states')
        .select('*')
        .eq('room_id', room.id)
        .eq('game_name', req.apiKey.service_name)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      console.log(`✅ [API V2] Room ${roomCode} validated successfully`);

      res.json({
        valid: true,
        version: '2.0',
        room: {
          id: room.id,
          code: room.room_code,
          gameType: room.current_game,
          status: room.status,
          currentPlayers: room.participants?.filter(p => p.is_connected === true).length || 0,
          maxPlayers: room.max_players,
          settings: room.game_settings,
          metadata: room.metadata,
          createdAt: room.created_at,
          lastActivity: room.last_activity
        },
        participant: participant ? {
          id: participant.user_id,
          role: participant.role,
          isHost: participant.role === 'host',
          isConnected: participant.is_connected,
          currentLocation: participant.current_location,
          inGame: participant.in_game,
          sessionValid,
          gameData: participant.game_data
        } : null,
        participants: room.participants
          ?.filter(p => p.is_connected === true)
          .map(p => ({
            id: p.user_id,
            name: p.user?.display_name || p.user?.username,
            role: p.role,
            isHost: p.role === 'host',
            currentLocation: p.current_location,
            inGame: p.in_game,
            lastPing: p.last_ping
          })),
        gameState: gameState ? {
          id: gameState.id,
          data: gameState.state_data,
          version: gameState.state_version,
          createdAt: gameState.created_at
        } : null,
        sessionInfo: sessionToken ? { valid: sessionValid } : null
      });

    } catch (error) {
      console.error('❌ [API V2] Room validation error:', error);
      res.status(500).json({
        valid: false,
        error: 'Server error',
        code: 'SERVER_ERROR'
      });
    }
  });

  // V2 Enhanced player status update
  router.post('/rooms/:roomCode/players/:playerId/status', validateApiKey, rateLimits.statusUpdates, async (req, res) => {
    try {
      const { roomCode, playerId } = req.params;
      const { status, location, metadata = {}, syncSession = false } = req.body;

      console.log(`🔄 [API V2] Updating player ${playerId} status: ${status}/${location}`);

      // Validate status and location values
      const validStatuses = ['connected', 'disconnected', 'in_game', 'returning', 'lobby'];
      const validLocations = ['game', 'lobby', 'disconnected'];

      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          error: 'Invalid status',
          validStatuses
        });
      }

      if (location && !validLocations.includes(location)) {
        return res.status(400).json({
          error: 'Invalid location',
          validLocations
        });
      }

      // Enhanced metadata
      const enhancedMetadata = {
        ...metadata,
        apiVersion: '2.0',
        service: req.apiKey.service_name,
        timestamp: new Date().toISOString(),
        source: 'external_game_api_v2'
      };

      // Update status using StatusSyncManager
      const result = await statusSyncManager.updatePlayerLocation(
        playerId,
        roomCode,
        location || (status === 'disconnected' ? 'disconnected' : 'game'),
        enhancedMetadata
      );

      // Session sync if requested
      let sessionToken = null;
      if (syncSession) {
        try {
          // Get room ID for session creation
          const { data: room } = await db.adminClient
            .from('rooms')
            .select('id')
            .eq('room_code', roomCode)
            .single();

          if (room) {
            sessionToken = await lobbyManager.createPlayerSession(playerId, room.id, `api_${Date.now()}`);
          }
        } catch (sessionError) {
          console.warn('⚠️ [API V2] Session sync failed:', sessionError);
        }
      }

      console.log(`✅ [API V2] Player ${playerId} status updated successfully`);

      res.json({
        success: true,
        updated: {
          status,
          location,
          timestamp: enhancedMetadata.timestamp
        },
        conflicts: result.conflicts || [],
        sessionToken,
        queued: result.queued || false
      });

    } catch (error) {
      console.error('❌ [API V2] Status update error:', error);
      res.status(500).json({
        error: 'Failed to update status',
        code: 'UPDATE_FAILED'
      });
    }
  });

  // V2 Bulk status update with enhanced features
  router.post('/rooms/:roomCode/bulk-status', validateApiKey, rateLimits.bulkUpdates, async (req, res) => {
    try {
      const { roomCode } = req.params;
      const { reason, players, gameState, returnToLobby = false } = req.body;

      console.log(`📦 [API V2] Bulk updating ${players?.length || 0} players in room ${roomCode}`);

      if (!players || !Array.isArray(players) || players.length === 0) {
        return res.status(400).json({
          error: 'Players array is required and must not be empty'
        });
      }

      // Validate player data
      for (const player of players) {
        if (!player.playerId) {
          return res.status(400).json({
            error: 'Each player must have a playerId'
          });
        }
      }

      // Process bulk update
      const result = await statusSyncManager.bulkUpdatePlayerStatus(
        roomCode,
        players.map(p => ({
          playerId: p.playerId,
          location: p.location || 'lobby',
          reason: p.reason || reason || 'Bulk update',
          gameData: p.gameData
        })),
        reason
      );

      // Handle game state if provided
      if (gameState) {
        try {
          const { data: room } = await db.adminClient
            .from('rooms')
            .select('id')
            .eq('room_code', roomCode)
            .single();

          if (room) {
            await db.saveGameState(room.id, req.apiKey.service_name, gameState, null);
          }
        } catch (stateError) {
          console.warn('⚠️ [API V2] Game state save failed:', stateError);
        }
      }\r\n      // Return-to-lobby handling removed\r\n\r\n    } catch (error) {
      console.log(`✅ [API V2] Bulk update completed: ${result.summary.successful}/${result.summary.total} successful`);

      res.json({
        success: true,
        results: result.results,
        errors: result.errors,
        summary: result.summary,
        gameStateSaved: !!gameState,
        returnInitiated: returnToLobby
      });

    } catch (error) {
      console.error('❌ [API V2] Bulk update error:', error);
      res.status(500).json({
        error: 'Bulk update failed',
        code: 'BULK_UPDATE_FAILED'
      });
    }
  });

  // V2 Session recovery endpoint
  router.post('/sessions/recover', async (req, res) => {
    try {
      const { sessionToken, socketId } = req.body;

      if (!sessionToken) {
        return res.status(400).json({
          error: 'Session token is required'
        });
      }

      console.log(`🔄 [API V2] Attempting session recovery for token: ${sessionToken.substring(0, 8)}...`);

      const result = await lobbyManager.recoverSession(sessionToken, socketId || `api_${Date.now()}`);

      console.log(`✅ [API V2] Session recovered successfully`);

      res.json(result);

    } catch (error) {
      console.error('❌ [API V2] Session recovery error:', error);
      res.status(401).json({
        error: 'Session recovery failed',
        code: 'INVALID_SESSION'
      });
    }
  });

  // V2 Room status sync endpoint
  router.post('/rooms/:roomCode/sync', validateApiKey, rateLimits.apiCalls, async (req, res) => {
    try {
      const { roomCode } = req.params;

      console.log(`🔄 [API V2] Manual room sync requested for ${roomCode}`);

      const result = await statusSyncManager.syncRoomStatus(roomCode);

      res.json({
        success: true,
        synced: result.success,
        playersCount: result.playersCount || 0,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ [API V2] Room sync error:', error);
      res.status(500).json({
        error: 'Room sync failed',
        code: 'SYNC_FAILED'
      });
    }
  });

  // V2 Return all players to lobby (atomic)
  router.post('/rooms/:roomCode/return-all', validateApiKey, rateLimits.apiCalls, async (req, res) => {
    try {
      const { roomCode } = req.params;
      const now = new Date().toISOString();

      console.log(`[API V2] return-all requested for ${roomCode} by ${req.apiKey?.service_name}`);

      // Load room with participants
      const { data: room, error: roomErr } = await db.adminClient
        .from('rooms')
        .select(`
          *,
          participants:room_members(
            user_id,
            role,
            is_connected,
            in_game,
            current_location,
            last_ping,
            joined_at,
            user:users(username, display_name)
          )
        `)
        .eq('room_code', roomCode)
        .single();

      if (roomErr || !room) {
        return res.status(404).json({ error: 'Room not found', code: 'ROOM_NOT_FOUND' });
      }

      // Update room status to lobby and set short grace window for return-in-progress
      const graceUntil = new Date(Date.now() + 15000).toISOString();
      await db.adminClient
        .from('rooms')
        .update({ 
          status: 'lobby', 
          last_activity: now,
          metadata: { 
            ...(room.metadata || {}),
            return_in_progress_until: graceUntil
          }
        })
        .eq('id', room.id);

      // Update all participants to lobby
      const { error: updErr } = await db.adminClient
        .from('room_members')
        .update({
          in_game: false,
          current_location: 'lobby',
          is_connected: true,
          last_ping: now
        })
        .eq('room_id', room.id);

      if (updErr) {
        console.error('[API V2] return-all participant update error:', updErr);
      }

      // Ensure a host exists
      let hasHost = Array.isArray(room.participants) && room.participants.some(p => p.role === 'host');
      if (!hasHost) {
        // Prefer previous room.host_id if present
        let hostUserId = room.host_id;
        if (!hostUserId && room.participants && room.participants.length) {
          // Fallback to oldest participant
          const sorted = [...room.participants].sort((a, b) => new Date(a.joined_at) - new Date(b.joined_at));
          hostUserId = sorted[0]?.user_id;
        }
        if (hostUserId) {
          await db.adminClient
            .from('room_members')
            .update({ role: 'host' })
            .eq('room_id', room.id)
            .eq('user_id', hostUserId);
          await db.adminClient
            .from('rooms')
            .update({ host_id: hostUserId })
            .eq('id', room.id);
          console.log(`[API V2] return-all promoted host: ${hostUserId}`);
        }
      }

      // Fetch updated snapshot
      const updatedRoom = await db.getRoomByCode(roomCode);
      const allPlayers = updatedRoom.participants?.map(p => ({
        id: p.user_id,
        name: p.user?.display_name || p.user?.username,
        isHost: p.role === 'host',
        isConnected: p.is_connected,
        inGame: p.in_game,
        currentLocation: p.current_location || (p.is_connected ? 'lobby' : 'disconnected'),
        lastPing: p.last_ping,
        socketId: null
      })) || [];

      // Broadcast a single authoritative snapshot
      if (io) {
        console.log(`[API V2] Broadcasting return-all snapshot to ${roomCode}`);
        io.to(roomCode).emit('playerStatusUpdated', {
          reason: 'return_all',
          players: allPlayers,
          room: updatedRoom,
          source: 'return_all',
          roomVersion: Date.now(),
          timestamp: now
        });
      }

      return res.json({
        success: true,
        updated: allPlayers.length,
        roomCode,
        roomStatus: updatedRoom.status
      });

    } catch (error) {
      console.error('[API V2] return-all error:', error);
      return res.status(500).json({ error: 'RETURN_ALL_FAILED' });
    }
  });

  // V2 Heartbeat endpoint for external games
  router.post('/rooms/:roomCode/players/:playerId/heartbeat', validateApiKey, rateLimits.heartbeats, async (req, res) => {
    try {
      const { roomCode, playerId } = req.params;
      const { metadata = {} } = req.body;

      const result = await statusSyncManager.handleHeartbeat(
        playerId,
        roomCode,
        `api_${Date.now()}`,
        {
          ...metadata,
          service: req.apiKey.service_name,
          timestamp: new Date().toISOString()
        }
      );

      res.json(result);

    } catch (error) {
      console.error('❌ [API V2] Heartbeat error:', error);
      res.status(500).json({
        error: 'Heartbeat failed',
        nextHeartbeat: 30000
      });
    }
  });

  // V2 Game end handler
  router.post('/rooms/:roomCode/game-end', validateApiKey, rateLimits.apiCalls, async (req, res) => {
    try {
      const { roomCode } = req.params;
      const { gameResult = {}, returnPlayers = true } = req.body;

      console.log(`🎮 [API V2] Game end reported for room ${roomCode}`);

      let result = { success: true, playersReturned: 0 };

      if (returnPlayers) {
        result = await statusSyncManager.handleGameEnd(roomCode, gameResult);
      }

      // Log event
      await db.logEvent(
        (await db.adminClient.from('rooms').select('id').eq('room_code', roomCode).single()).data?.id,
        null,
        'game_ended_api_v2',
        {
          gameResult,
          returnPlayers,
          playersReturned: result.playersReturned,
          service: req.apiKey.service_name
        }
      );

      res.json(result);

    } catch (error) {
      console.error('❌ [API V2] Game end error:', error);
      res.status(500).json({
        error: 'Game end handling failed',
        code: 'GAME_END_FAILED'
      });
    }
  });

  // V2 Connection health check
  router.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      version: '2.0',
      timestamp: new Date().toISOString(),
      features: [
        'enhanced_status_sync',
        'session_recovery',
        'conflict_resolution',
        'bulk_updates',
        'heartbeat_monitoring',
        'optimistic_updates'
      ]
    });
  });

  return router;
};
