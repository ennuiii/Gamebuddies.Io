const express = require('express');
const router = express.Router();
const { validateApiKey, rateLimits } = require('../lib/validation');

module.exports = (io, db, connectionManager, lobbyManager, statusSyncManager) => {
  // Primary endpoint used by external games (e.g. DDF) to trigger a return flow.
  router.post('/api/v2/external/return', validateApiKey, rateLimits.apiCalls, async (req, res) => {
    try {
      const {
        roomCode,
        playerId,
        initiatedBy,
        reason = 'external_return',
        returnAll = true,
        metadata: extraMetadata = {},
      } = req.body || {};

      if (!roomCode) {
        return res.status(400).json({
          success: false,
          error: 'Room code is required',
          code: 'MISSING_ROOM_CODE',
        });
      }

      const { data: room, error: roomError } = await db.adminClient
        .from('rooms')
        .select('id, room_code, host_id, status, metadata')
        .eq('room_code', roomCode)
        .single();

      if (roomError || !room) {
        return res.status(404).json({
          success: false,
          error: 'Room not found',
          code: 'ROOM_NOT_FOUND',
        });
      }

      const now = new Date();
      const initiatedSource = initiatedBy || req.apiKey?.service_name || 'external_game';
      const updatedMetadata = {
        ...(room.metadata || {}),
        pendingReturn: true,
        returnInitiatedAt: now.toISOString(),
        returnInitiatedBy: initiatedSource,
        returnReason: reason,
      };

      await db.adminClient
        .from('rooms')
        .update({ metadata: updatedMetadata })
        .eq('room_code', roomCode);

      let sessionToken = null;
      if (playerId) {
        try {
          sessionToken = await lobbyManager.createPlayerSession(
            playerId,
            room.id,
            `external_return_${Date.now()}`
          );
        } catch (sessionError) {
          console.warn('[DDF Compat] Session creation failed:', sessionError);
        }
      }

      let playersReturned = 0;
      if (returnAll) {
        try {
          const result = await statusSyncManager.handleGameEnd(roomCode, {
            returnedBy: initiatedSource,
            source: 'external_return_api',
            timestamp: now.toISOString(),
            metadata: extraMetadata,
          });
          playersReturned = result?.playersReturned || result?.summary?.successful || 0;
        } catch (syncError) {
          console.warn('[DDF Compat] handleGameEnd failed:', syncError);
        }
      }

      try {
        await db.logEvent(
          room.id,
          null,
          'external_return_to_lobby',
          {
            initiatedBy: initiatedSource,
            playerId,
            returnAll,
            reason,
            apiKey: req.apiKey?.service_name,
          }
        );
      } catch (logError) {
        console.warn('[DDF Compat] Failed to log external return event:', logError);
      }

      if (returnAll && io) {
        try {
          io.to(roomCode).emit('server:return-to-gb', {
            roomCode,
            mode: 'group',
            initiatedAt: now.toISOString(),
            reason,
          });
        } catch (broadcastError) {
          console.warn('[DDF Compat] Failed to broadcast return-to-gb event:', broadcastError);
        }
      }

      const returnUrl = sessionToken
        ? `https://gamebuddies.io/lobby/${roomCode}?session=${sessionToken}`
        : `https://gamebuddies.io/lobby/${roomCode}`;

      res.json({
        success: true,
        message: 'Return to lobby initiated',
        roomCode,
        returnUrl,
        sessionToken,
        playersReturned,
        pendingReturn: true,
        pollEndpoint: `/api/v2/rooms/${roomCode}/return-status`,
      });
    } catch (error) {
      console.error('[DDF Compat] External return error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to initiate return to lobby',
        code: 'RETURN_FAILED',
      });
    }
  });

  // Polling endpoint for external games to check return status
  router.get('/api/v2/rooms/:roomCode/return-status', validateApiKey, rateLimits.polling, async (req, res) => {
    try {
      const { roomCode } = req.params;
      const { playerId } = req.query;

      const { data: room } = await db.adminClient
        .from('rooms')
        .select('id, metadata, status')
        .eq('room_code', roomCode)
        .single();

      if (!room) {
        return res.status(404).json({
          shouldReturn: false,
          error: 'Room not found',
        });
      }

      const shouldReturn = room.metadata?.pendingReturn === true;
      let sessionToken = null;

      if (shouldReturn && playerId) {
        try {
          sessionToken = await lobbyManager.createPlayerSession(
            playerId,
            room.id,
            `external_return_${Date.now()}`
          );
        } catch (sessionError) {
          console.warn('[DDF Compat] Session creation failed:', sessionError);
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
        returnInitiatedAt: room.metadata?.returnInitiatedAt || null,
      });

      if (shouldReturn) {
        setTimeout(async () => {
          try {
            await db.adminClient
              .from('rooms')
              .update({
                metadata: {
                  ...(room.metadata || {}),
                  pendingReturn: false,
                  lastReturnProcessed: new Date().toISOString(),
                },
              })
              .eq('room_code', roomCode);
          } catch (clearError) {
            console.warn('[DDF Compat] Failed to clear pendingReturn flag:', clearError);
          }
        }, 5000);
      }
    } catch (error) {
      console.error('[DDF Compat] Return status check error:', error);
      res.status(500).json({
        shouldReturn: false,
        error: 'Failed to check return status',
      });
    }
  });

  // Legacy room validation endpoint for backward compatibility
  router.get('/api/rooms/:roomCode/validate', validateApiKey, rateLimits.apiCalls, async (req, res) => {
    try {
      const { roomCode } = req.params;
      const { playerName, playerId } = req.query;

      console.log(`[DDF Legacy] Legacy room validation for ${roomCode}`);
      const validationResult = await validateRoom(roomCode, playerId, playerName, req, db);

      if (!validationResult.valid) {
        return res.status(validationResult.status || 400).json({
          isValid: false,
          error: validationResult.error,
          code: validationResult.code,
        });
      }

      res.json({
        isValid: true,
        roomInfo: {
          roomCode: validationResult.room.code,
          status: validationResult.room.status,
          currentPlayers: validationResult.room.currentPlayers,
          maxPlayers: validationResult.room.maxPlayers,
        },
        playerAssignments: [],
        maxPlayers: validationResult.room.maxPlayers,
        settings: {},
      });
    } catch (error) {
      console.error('[DDF Legacy] Legacy validation error:', error);
      res.status(500).json({
        isValid: false,
        error: 'Room validation failed',
      });
    }
  });

  // Enhanced room validation endpoint with session token generation
  router.get('/api/v2/rooms/:roomCode/validate-with-session', validateApiKey, rateLimits.apiCalls, async (req, res) => {
    try {
      const { roomCode } = req.params;
      const { playerId, playerName } = req.query;

      const validationResult = await validateRoom(roomCode, playerId, playerName, req, db);

      if (!validationResult.valid) {
        return res.status(validationResult.status || 400).json(validationResult);
      }

      let sessionToken = null;
      if (playerId && validationResult.room.id) {
        try {
          sessionToken = await lobbyManager.createPlayerSession(
            playerId,
            validationResult.room.id,
            `external_game_${Date.now()}`
          );
        } catch (sessionError) {
          console.warn('[DDF Compat] Session token creation failed:', sessionError);
        }
      }

      res.json({
        ...validationResult,
        sessionToken,
        returnUrl: sessionToken
          ? `https://gamebuddies.io/lobby/${roomCode}?session=${sessionToken}`
          : `https://gamebuddies.io/lobby/${roomCode}`,
        pollEndpoint: `/api/v2/rooms/${roomCode}/return-status`,
      });
    } catch (error) {
      console.error('[DDF Compat] Validation with session error:', error);
      res.status(500).json({
        valid: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
      });
    }
  });

  // Heartbeat endpoint for external games to maintain connection awareness
  router.post('/api/v2/external-heartbeat', validateApiKey, rateLimits.heartbeats, async (req, res) => {
    try {
      const { roomCode, playerId, gameData = {} } = req.body;

      if (!roomCode || !playerId) {
        return res.status(400).json({
          error: 'Room code and player ID are required',
        });
      }

      const result = await statusSyncManager.handleHeartbeat(
        playerId,
        roomCode,
        `external_${Date.now()}`,
        {
          ...gameData,
          source: 'external_game',
          service: req.apiKey.service_name,
          timestamp: new Date().toISOString(),
        }
      );

      const { data: room } = await db.adminClient
        .from('rooms')
        .select('metadata')
        .eq('room_code', roomCode)
        .single();

      const shouldReturn = room?.metadata?.pendingReturn === true;

      res.json({
        ...result,
        shouldReturn,
        nextHeartbeat: 30000,
      });
    } catch (error) {
      console.error('[DDF Compat] External heartbeat error:', error);
      res.status(500).json({
        error: 'Heartbeat failed',
        nextHeartbeat: 60000,
      });
    }
  });

  return router;
};

// Helper function for room validation (reused from main gameApiV2)
async function validateRoom(roomCode, playerId, playerName, req, db) {
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
      status: 404,
    };
  }

  const validStatuses = ['lobby', 'in_game', 'returning'];
  if (!validStatuses.includes(room.status)) {
    return {
      valid: false,
      error: `Room is ${room.status}`,
      code: 'ROOM_NOT_AVAILABLE',
      status: 400,
      roomStatus: room.status,
      allowedStatuses: validStatuses,
    };
  }

  let participant = null;
  if (playerName || playerId) {
    participant = room.participants?.find((p) =>
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
      currentPlayers: room.participants?.filter((p) => p.is_connected === true).length || 0,
      maxPlayers: room.max_players,
    },
    participant: participant
      ? {
          id: participant.user_id,
          role: participant.role,
          isHost: participant.role === 'host',
          isConnected: participant.is_connected,
        }
      : null,
  };
}


