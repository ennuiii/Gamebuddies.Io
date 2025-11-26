import express, { Request, Response, NextFunction, Router } from 'express';
import crypto from 'crypto';
import { Server as SocketIOServer } from 'socket.io';
import { validateApiKey, rateLimits } from '../lib/validation';
import { DatabaseService } from '../lib/supabase';
import { ConnectionManager } from '../lib/connectionManager';
import LobbyManager from '../lib/lobbyManager';
import StatusSyncManager from '../lib/statusSyncManager';

// Type definitions
interface ApiKeyRequest extends Request {
  apiKey: {
    service_name: string;
    [key: string]: unknown;
  };
}

interface RoomData {
  id: string;
  room_code: string;
  host_id: string | null;
  status: string;
  current_game: string | null;
  metadata: Record<string, unknown> | null;
  streamer_mode: boolean;
  max_players: number;
}

interface RoomParticipant {
  user_id: string;
  role: string;
  is_connected: boolean;
  in_game: boolean;
  current_location: string | null;
  last_ping: string | null;
  joined_at: string;
  user: {
    username: string;
    display_name: string | null;
  } | null;
  session: Array<{
    session_token: string;
    status: string;
    expires_at: string;
  }>;
}

interface RoomWithParticipants extends RoomData {
  participants: RoomParticipant[];
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  code?: string;
  status?: number;
  roomStatus?: string;
  allowedStatuses?: string[];
  room?: {
    id: string;
    code: string;
    status: string;
    currentPlayers: number;
    maxPlayers: number;
  };
  participant?: {
    id: string;
    role: string;
    isHost: boolean;
    isConnected: boolean;
  } | null;
}

// Rate limiter type
type RateLimiterMiddleware = (req: Request, res: Response, next: NextFunction) => void;

const apiKeyMiddleware = typeof validateApiKey === 'function'
  ? validateApiKey
  : (req: Request, res: Response, next: NextFunction) => next();

export default function createDDFCompatibilityRouter(
  io: SocketIOServer,
  db: DatabaseService,
  connectionManager: ConnectionManager,
  lobbyManager: LobbyManager,
  statusSyncManager: StatusSyncManager
): Router {
  const router: Router = express.Router();

  // Primary endpoint used by external games (e.g. DDF) to trigger a return flow.
  router.post('/api/v2/external/return', apiKeyMiddleware, rateLimits.apiCalls as RateLimiterMiddleware, async (req: Request, res: Response): Promise<void> => {
    try {
      const apiReq = req as ApiKeyRequest;
      const {
        roomCode,
        playerId,
        initiatedBy,
        reason = 'external_return',
        returnAll = true,
        metadata: extraMetadata = {},
      } = req.body || {};

      if (!roomCode) {
        res.status(400).json({
          success: false,
          error: 'Room code is required',
          code: 'MISSING_ROOM_CODE',
        });
        return;
      }

      const { data: room, error: roomError } = await db.adminClient
        .from('rooms')
        .select('id, room_code, host_id, status, metadata, streamer_mode')
        .eq('room_code', roomCode)
        .single();

      console.log('[DDF Compat] 🔍 Room query result:', {
        roomCode,
        found: !!room,
        streamerMode: (room as RoomData | null)?.streamer_mode,
        error: roomError
      });

      if (roomError || !room) {
        res.status(404).json({
          success: false,
          error: 'Room not found',
          code: 'ROOM_NOT_FOUND',
        });
        return;
      }

      const typedRoom = room as RoomData;
      const now = new Date();
      const initiatedSource = initiatedBy || apiReq.apiKey?.service_name || 'external_game';
      const updatedMetadata = {
        ...(typedRoom.metadata || {}),
        pendingReturn: true,
        returnInitiatedAt: now.toISOString(),
        returnInitiatedBy: initiatedSource,
        returnReason: reason,
      };

      await db.adminClient
        .from('rooms')
        .update({ metadata: updatedMetadata })
        .eq('room_code', roomCode);

      let sessionToken: string | null = null;
      // Create session token if:
      // - Individual return (playerId specified), OR
      // - Streamer mode group return (need session to hide room code, but use null player_id)
      const shouldCreateSession = playerId || (typedRoom.streamer_mode && returnAll);
      const targetPlayerId = playerId || null; // null = generic room session for group returns

      console.log('[DDF Compat] 🎫 Session token logic:', {
        hasPlayerId: !!playerId,
        isStreamerMode: typedRoom.streamer_mode,
        isReturnAll: returnAll,
        hostId: typedRoom.host_id,
        targetPlayerId,
        shouldCreateSession,
        isGenericRoomSession: shouldCreateSession && !targetPlayerId
      });

      if (shouldCreateSession) {
        try {
          sessionToken = crypto.randomBytes(32).toString('hex');

          // Insert into game_sessions table for streamer mode compatibility
          await db.adminClient
            .from('game_sessions')
            .insert({
              session_token: sessionToken,
              room_id: typedRoom.id,
              room_code: roomCode,
              player_id: targetPlayerId,
              game_type: typedRoom.current_game || 'lobby',
              streamer_mode: typedRoom.streamer_mode || false,
              metadata: {
                return_flow: true,
                initiated_by: initiatedSource,
                created_at: now.toISOString()
              }
            });

          console.log('[DDF Compat] ✅ Game session token created for return');
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          playersReturned = result?.playersReturned || (result as any)?.summary?.successful || 0;
        } catch (syncError) {
          console.warn('[DDF Compat] handleGameEnd failed:', syncError);
        }
      }

      try {
        await db.logEvent(
          typedRoom.id,
          null,
          'external_return_to_lobby',
          {
            initiatedBy: initiatedSource,
            playerId,
            returnAll,
            reason,
            apiKey: apiReq.apiKey?.service_name,
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

      // For streamer mode, use session-only URL to hide room code
      const returnUrl = typedRoom.streamer_mode && sessionToken
        ? `https://gamebuddies.io/lobby?session=${sessionToken}`
        : sessionToken
          ? `https://gamebuddies.io/lobby/${roomCode}?session=${sessionToken}`
          : `https://gamebuddies.io/lobby/${roomCode}`;

      console.log('[DDF Compat] 🔗 Return URL construction:', {
        streamerMode: typedRoom.streamer_mode,
        hasSessionToken: !!sessionToken,
        sessionTokenPreview: sessionToken ? sessionToken.substring(0, 20) + '...' : null,
        finalUrl: returnUrl,
        urlPattern: typedRoom.streamer_mode && sessionToken ? 'session-only' :
                    sessionToken ? 'room-with-session' : 'room-only'
      });

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
  router.get('/api/v2/rooms/:roomCode/return-status', apiKeyMiddleware, rateLimits.polling as RateLimiterMiddleware, async (req: Request, res: Response): Promise<void> => {
    try {
      const { roomCode } = req.params;
      const { playerId } = req.query as { playerId?: string };

      const { data: room } = await db.adminClient
        .from('rooms')
        .select('id, metadata, status, streamer_mode')
        .eq('room_code', roomCode)
        .single();

      if (!room) {
        res.status(404).json({
          shouldReturn: false,
          error: 'Room not found',
        });
        return;
      }

      const typedRoom = room as RoomData & { metadata: Record<string, unknown> | null };
      const shouldReturn = typedRoom.metadata?.pendingReturn === true;
      let sessionToken: string | null = null;

      if (shouldReturn && playerId) {
        try {
          sessionToken = await lobbyManager.createPlayerSession(
            playerId,
            typedRoom.id,
            `external_return_${Date.now()}`
          );
        } catch (sessionError) {
          console.warn('[DDF Compat] Session creation failed:', sessionError);
        }
      }

      // For streamer mode, use session-only URL to hide room code
      const returnUrl = typedRoom.streamer_mode && sessionToken
        ? `https://gamebuddies.io/lobby?session=${sessionToken}`
        : sessionToken
          ? `https://gamebuddies.io/lobby/${roomCode}?session=${sessionToken}`
          : `https://gamebuddies.io/lobby/${roomCode}`;

      res.json({
        shouldReturn,
        returnUrl,
        roomCode,
        sessionToken: sessionToken || undefined,
        timestamp: new Date().toISOString(),
        returnInitiatedAt: typedRoom.metadata?.returnInitiatedAt || null,
      });

      if (shouldReturn) {
        setTimeout(async () => {
          try {
            await db.adminClient
              .from('rooms')
              .update({
                metadata: {
                  ...(typedRoom.metadata || {}),
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
  router.get('/api/rooms/:roomCode/validate', apiKeyMiddleware, rateLimits.apiCalls as RateLimiterMiddleware, async (req: Request, res: Response): Promise<void> => {
    try {
      const { roomCode } = req.params;
      const { playerName, playerId } = req.query as { playerName?: string; playerId?: string };

      console.log(`[DDF Legacy] Legacy room validation for ${roomCode}`);
      const validationResult = await validateRoom(roomCode, playerId, playerName, req, db);

      if (!validationResult.valid) {
        res.status(validationResult.status || 400).json({
          isValid: false,
          error: validationResult.error,
          code: validationResult.code,
        });
        return;
      }

      res.json({
        isValid: true,
        roomInfo: {
          roomCode: validationResult.room!.code,
          status: validationResult.room!.status,
          currentPlayers: validationResult.room!.currentPlayers,
          maxPlayers: validationResult.room!.maxPlayers,
        },
        playerAssignments: [],
        maxPlayers: validationResult.room!.maxPlayers,
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
  router.get('/api/v2/rooms/:roomCode/validate-with-session', apiKeyMiddleware, rateLimits.apiCalls as RateLimiterMiddleware, async (req: Request, res: Response): Promise<void> => {
    try {
      const { roomCode } = req.params;
      const { playerId, playerName } = req.query as { playerId?: string; playerName?: string };

      const validationResult = await validateRoom(roomCode, playerId, playerName, req, db);

      if (!validationResult.valid) {
        res.status(validationResult.status || 400).json(validationResult);
        return;
      }

      let sessionToken: string | null = null;
      if (playerId && validationResult.room?.id) {
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
  router.post('/api/v2/external-heartbeat', apiKeyMiddleware, rateLimits.heartbeats as RateLimiterMiddleware, async (req: Request, res: Response): Promise<void> => {
    try {
      const apiReq = req as ApiKeyRequest;
      const { roomCode, playerId, gameData = {} } = req.body;

      if (!roomCode || !playerId) {
        res.status(400).json({
          error: 'Room code and player ID are required',
        });
        return;
      }

      const result = await statusSyncManager.handleHeartbeat(
        playerId,
        roomCode,
        `external_${Date.now()}`,
        {
          ...gameData,
          source: 'external_game',
          service: apiReq.apiKey.service_name,
          timestamp: new Date().toISOString(),
        }
      );

      const { data: room } = await db.adminClient
        .from('rooms')
        .select('metadata')
        .eq('room_code', roomCode)
        .single();

      const typedRoom = room as { metadata: Record<string, unknown> | null } | null;
      const shouldReturn = typedRoom?.metadata?.pendingReturn === true;

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
}

// Helper function for room validation (reused from main gameApiV2)
async function validateRoom(
  roomCode: string,
  playerId: string | undefined,
  playerName: string | undefined,
  req: Request,
  db: DatabaseService
): Promise<ValidationResult> {
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

  const typedRoom = room as RoomWithParticipants;

  const validStatuses = ['lobby', 'in_game', 'returning'];
  if (!validStatuses.includes(typedRoom.status)) {
    return {
      valid: false,
      error: `Room is ${typedRoom.status}`,
      code: 'ROOM_NOT_AVAILABLE',
      status: 400,
      roomStatus: typedRoom.status,
      allowedStatuses: validStatuses,
    };
  }

  let participant: RoomParticipant | null = null;
  if (playerName || playerId) {
    participant = typedRoom.participants?.find((p) =>
      (playerName && p.user?.username === playerName) ||
      (playerId && p.user_id === playerId)
    ) || null;
  }

  return {
    valid: true,
    room: {
      id: typedRoom.id,
      code: typedRoom.room_code,
      status: typedRoom.status,
      currentPlayers: typedRoom.participants?.filter((p) => p.is_connected === true).length || 0,
      maxPlayers: typedRoom.max_players,
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
