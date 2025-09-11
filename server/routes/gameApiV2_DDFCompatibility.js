const express = require('express');
const router = express.Router();
const { validateApiKey, rateLimits } = require('../lib/validation');

module.exports = (io, db, connectionManager, lobbyManager, statusSyncManager) => {
  
  // =====================================================
  // DDF COMPATIBILITY ENDPOINTS
  // These endpoints provide backward compatibility for existing DDF implementation
  // =====================================================

  // Legacy return endpoint that DDF currently calls
  router.post('/api/returnToLobby', validateApiKey, rateLimits.apiCalls, async (req, res) => {
    try {
      const { roomCode, isHost } = req.body;
      
      console.log(`🔄 [DDF Compat] Return to lobby requested for room ${roomCode}, isHost: ${isHost}`);

      if (!roomCode) {
        return res.status(400).json({
          success: false,
          error: 'Room code is required',
          code: 'MISSING_ROOM_CODE'
        });
      }

      // Verify the requester has permission (should be host or have proper API key)
      const { data: room } = await db.adminClient
        .from('rooms')
        .select('id, room_code, host_id, status')
        .eq('room_code', roomCode)
        .single();

      if (!room) {
        return res.status(404).json({
          success: false,
          error: 'Room not found',
          code: 'ROOM_NOT_FOUND'
        });
      }

      // Set return flag for this room - this will be checked by polling endpoint
      await db.adminClient
        .from('rooms')
        .update({
          metadata: { 
            ...room.metadata, 
            pendingReturn: true, 
            returnInitiatedAt: new Date().toISOString(),
            returnInitiatedBy: isHost ? 'host' : 'api'
          }
        })
        .eq('room_code', roomCode);

      // Use existing V2 mechanism to handle the actual return
      const result = await statusSyncManager.handleGameEnd(roomCode, {
        returnedBy: isHost ? 'host' : 'api',
        source: 'ddf_legacy_endpoint',
        timestamp: new Date().toISOString()
      });

      // Log the event
      await db.logEvent(
        room.id,
        null,
        'legacy_return_to_lobby',
        {
          isHost,
          source: 'ddf_compatibility',
          apiKey: req.apiKey.service_name
        }
      );

      console.log(`✅ [DDF Compat] Return to lobby initiated for room ${roomCode}`);

      res.json({
        success: true,
        message: 'Group return to lobby initiated',
        roomCode,
        playersAffected: result.playersReturned || 0,
        returnUrl: `https://gamebuddies.io/lobby/${roomCode}`,
        pollEndpoint: `/api/v2/rooms/${roomCode}/return-status`
      });

    } catch (error) {
      console.error('❌ [DDF Compat] Return to lobby error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to initiate return to lobby',
        code: 'RETURN_FAILED'
      });
    }
  });

  // Polling endpoint for external games to check return status
  router.get('/api/v2/rooms/:roomCode/return-status', validateApiKey, rateLimits.polling, async (req, res) => {
    try {
      const { roomCode } = req.params;
      const { playerId } = req.query;

      // Get room with current metadata
      const { data: room } = await db.adminClient
        .from('rooms')
        .select('id, metadata, status')
        .eq('room_code', roomCode)
        .single();

      if (!room) {
        return res.status(404).json({
          shouldReturn: false,
          error: 'Room not found'
        });
      }

      const shouldReturn = room.metadata?.pendingReturn === true;
      let sessionToken = null;

      // If player should return, generate session token for seamless lobby restoration
      if (shouldReturn && playerId) {
        try {
          sessionToken = await lobbyManager.createPlayerSession(playerId, room.id, `external_return_${Date.now()}`);
        } catch (sessionError) {
          console.warn('⚠️ [DDF Compat] Session creation failed:', sessionError);
        }
      }

      const returnUrl = sessionToken 
        ? `https://gamebuddies.io/lobby/${roomCode}?session=${sessionToken}`
        : `https://gamebuddies.io/lobby/${roomCode}`;

      res.json({
        shouldReturn,
        returnUrl,
        roomCode,
        sessionToken: sessionToken || undefined,
        timestamp: new Date().toISOString(),
        returnInitiatedAt: room.metadata?.returnInitiatedAt || null
      });

      // Clear the pending return flag after first successful poll
      // to prevent infinite returns
      if (shouldReturn) {
        setTimeout(async () => {
          await db.adminClient
            .from('rooms')
            .update({
              metadata: { 
                ...room.metadata, 
                pendingReturn: false,
                lastReturnProcessed: new Date().toISOString()
              }
            })
            .eq('room_code', roomCode);
        }, 5000); // 5 second delay to allow all players to poll
      }

    } catch (error) {
      console.error('❌ [DDF Compat] Return status check error:', error);
      res.status(500).json({
        shouldReturn: false,
        error: 'Failed to check return status'
      });
    }
  });

  // Enhanced room validation endpoint with session token generation
  router.get('/api/v2/rooms/:roomCode/validate-with-session', validateApiKey, rateLimits.apiCalls, async (req, res) => {
    try {
      const { roomCode } = req.params;
      const { playerId, playerName } = req.query;

      // Use existing validation logic
      const validationResult = await validateRoom(roomCode, playerId, playerName, req, db);
      
      if (!validationResult.valid) {
        return res.status(validationResult.status || 400).json(validationResult);
      }

      // Generate session token for external game
      let sessionToken = null;
      if (playerId && validationResult.room.id) {
        try {
          sessionToken = await lobbyManager.createPlayerSession(
            playerId, 
            validationResult.room.id, 
            `external_game_${Date.now()}`
          );
        } catch (sessionError) {
          console.warn('⚠️ [DDF Compat] Session token creation failed:', sessionError);
        }
      }

      res.json({
        ...validationResult,
        sessionToken,
        returnUrl: sessionToken 
          ? `https://gamebuddies.io/lobby/${roomCode}?session=${sessionToken}`
          : `https://gamebuddies.io/lobby/${roomCode}`,
        pollEndpoint: `/api/v2/rooms/${roomCode}/return-status`
      });

    } catch (error) {
      console.error('❌ [DDF Compat] Validation with session error:', error);
      res.status(500).json({
        valid: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR'
      });
    }
  });

  // Heartbeat endpoint for external games to maintain connection awareness
  router.post('/api/v2/external-heartbeat', validateApiKey, rateLimits.heartbeats, async (req, res) => {
    try {
      const { roomCode, playerId, gameData = {} } = req.body;

      if (!roomCode || !playerId) {
        return res.status(400).json({
          error: 'Room code and player ID are required'
        });
      }

      // Update player's external game heartbeat
      const result = await statusSyncManager.handleHeartbeat(
        playerId,
        roomCode,
        `external_${Date.now()}`,
        {
          ...gameData,
          source: 'external_game',
          service: req.apiKey.service_name,
          timestamp: new Date().toISOString()
        }
      );

      // Check if return is pending during heartbeat
      const { data: room } = await db.adminClient
        .from('rooms')
        .select('metadata')
        .eq('room_code', roomCode)
        .single();

      const shouldReturn = room?.metadata?.pendingReturn === true;

      res.json({
        ...result,
        shouldReturn,
        nextHeartbeat: 30000 // 30 seconds
      });

    } catch (error) {
      console.error('❌ [DDF Compat] External heartbeat error:', error);
      res.status(500).json({
        error: 'Heartbeat failed',
        nextHeartbeat: 60000
      });
    }
  });

  return router;
};

// Helper function for room validation (reused from main gameApiV2)
async function validateRoom(roomCode, playerId, playerName, req, db) {
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
    return {
      valid: false,
      error: 'Room not found',
      code: 'ROOM_NOT_FOUND',
      status: 404
    };
  }

  // Enhanced room status validation
  const validStatuses = ['lobby', 'in_game', 'returning'];
  if (!validStatuses.includes(room.status)) {
    return {
      valid: false,
      error: `Room is ${room.status}`,
      code: 'ROOM_NOT_AVAILABLE',
      status: 400,
      roomStatus: room.status,
      allowedStatuses: validStatuses
    };
  }

  // Find participant
  let participant = null;
  if (playerName || playerId) {
    participant = room.participants?.find(p =>
      (playerName && p.user?.username === playerName) ||
      (playerId && p.user_id === playerId)
    );
  }

  return {
    valid: true,
    room: {
      id: room.id,
      code: room.room_code,
      status: room.status,
      currentPlayers: room.participants?.filter(p => p.is_connected === true).length || 0,
      maxPlayers: room.max_players
    },
    participant: participant ? {
      id: participant.user_id,
      role: participant.role,
      isHost: participant.role === 'host',
      isConnected: participant.is_connected
    } : null
  };
}