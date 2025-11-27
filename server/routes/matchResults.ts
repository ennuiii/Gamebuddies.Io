import express, { Request, Response, NextFunction, Router } from 'express';
import { Server } from 'socket.io';
import { DatabaseService } from '../lib/supabase';
import { validateApiKey } from '../lib/validation';
import ConnectionManager from '../lib/connectionManager';
import { SERVER_EVENTS } from '@shared/constants/socket-events';

// Type definitions
interface ApiKeyRequest extends Request {
  apiKey: {
    service_name: string;
    [key: string]: unknown;
  };
}

interface PlayerResult {
  user_id: string;
  rank?: number;
  score?: number;
  won: boolean;
  metrics?: Record<string, number | { op: 'increment' | 'set' | 'max'; value: number }>;
}

interface MatchResultRequest {
  room_id?: string;
  game_id: string;
  players: PlayerResult[];
  duration_seconds?: number;
  metadata?: Record<string, unknown>;
}

interface ProcessedResult {
  user_id: string;
  stats_updated: {
    total_games_played: number;
    total_games_won: number;
    current_win_streak: number;
    best_win_streak: number;
  } | null;
  metrics_updated: Record<string, number> | null;
  achievements_unlocked: Array<{
    id: string;
    name: string;
    xp_reward: number;
    points: number;
    rarity: string;
  }>;
  error?: string;
}

const apiKeyMiddleware = typeof validateApiKey === 'function'
  ? validateApiKey
  : (req: Request, res: Response, next: NextFunction) => next();

/**
 * Create the match results router
 * Handles game match result reporting from external game servers
 */
export default function createMatchResultsRouter(
  db: DatabaseService,
  io: Server,
  connectionManager: ConnectionManager
): Router {
  const router: Router = express.Router();

  /**
   * Emit achievement unlock notification to user via socket
   */
  function emitAchievementUnlock(
    userId: string,
    achievements: Array<{ id: string; name: string; description?: string; icon_url?: string | null; xp_reward: number; points: number; rarity: string }>
  ): void {
    if (!achievements || achievements.length === 0) return;

    try {
      // Find all socket connections for this user
      const connections = connectionManager.getUserConnections(userId);

      if (connections.length === 0) {
        console.log(`🏆 [ACHIEVEMENT] User ${userId} not connected, cannot emit achievement notification`);
        return;
      }

      // Format achievements for the client
      const formattedAchievements = achievements.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description || '',
        icon_url: a.icon_url || null,
        xp_reward: a.xp_reward,
        points: a.points,
        rarity: a.rarity as 'common' | 'rare' | 'epic' | 'legendary',
        earned_at: new Date().toISOString(),
      }));

      // Emit to each connected socket
      for (const connection of connections) {
        const socket = io.sockets.sockets.get(connection.socketId);
        if (socket) {
          socket.emit(SERVER_EVENTS.ACHIEVEMENT.UNLOCKED, {
            userId,
            achievements: formattedAchievements,
          });
          console.log(`🏆 [ACHIEVEMENT] Emitted ${achievements.length} achievement(s) to user ${userId}`);
        }
      }
    } catch (error) {
      console.error('❌ [ACHIEVEMENT] Error emitting achievement unlock:', error);
    }
  }

  /**
   * POST /api/game/match-result
   *
   * Report match results for all players in a game.
   * Updates stats, win streaks, custom metrics, and triggers achievement checking.
   *
   * Request body:
   * {
   *   room_id?: string,       // Optional room UUID
   *   game_id: string,        // Game identifier (e.g., "schooled", "ddf")
   *   players: [
   *     {
   *       user_id: string,
   *       rank?: number,
   *       score?: number,
   *       won: boolean,
   *       metrics?: {
   *         // Simple increment: { "correct_answers": 5 }
   *         // With operation: { "high_score": { "op": "max", "value": 1500 } }
   *         // Operations: "increment" (default), "set", "max"
   *       }
   *     },
   *     ...
   *   ],
   *   duration_seconds?: number,
   *   metadata?: object
   * }
   *
   * Response:
   * {
   *   success: true,
   *   results: [
   *     {
   *       user_id: string,
   *       stats_updated: { total_games_played, total_games_won, current_win_streak, best_win_streak },
   *       metrics_updated: { correct_answers: 150, high_score: 1500 },
   *       achievements_unlocked: [ { id, name, xp_reward, points, rarity }, ... ]
   *     },
   *     ...
   *   ]
   * }
   */
  router.post(
    '/match-result',
    apiKeyMiddleware,
    async (req: Request, res: Response): Promise<void> => {
      try {
        const apiReq = req as ApiKeyRequest;
        const body = req.body as MatchResultRequest;
        const { room_id, game_id, players, duration_seconds, metadata } = body;

        // Validation
        if (!game_id) {
          res.status(400).json({
            success: false,
            error: 'game_id is required',
          });
          return;
        }

        if (!players || !Array.isArray(players) || players.length === 0) {
          res.status(400).json({
            success: false,
            error: 'players array is required and must not be empty',
          });
          return;
        }

        // Validate each player has required fields
        for (const player of players) {
          if (!player.user_id) {
            res.status(400).json({
              success: false,
              error: 'Each player must have a user_id',
            });
            return;
          }
          if (typeof player.won !== 'boolean') {
            res.status(400).json({
              success: false,
              error: 'Each player must have a won boolean',
            });
            return;
          }
        }

        console.log(`🎮 [MATCH] Processing match result for game: ${game_id}, players: ${players.length}`);

        // Process each player's result
        const results: ProcessedResult[] = await Promise.all(
          players.map(async (player): Promise<ProcessedResult> => {
            try {
              // Call the database function to process the match result
              const { data, error } = await db.adminClient.rpc('process_match_result', {
                p_user_id: player.user_id,
                p_game_id: game_id,
                p_won: player.won,
                p_score: player.score ?? null,
                p_room_id: room_id ?? null,
                p_metrics: player.metrics ?? null,
              });

              if (error) {
                console.error(`❌ [MATCH] Error processing result for ${player.user_id}:`, error);
                return {
                  user_id: player.user_id,
                  stats_updated: null,
                  metrics_updated: null,
                  achievements_unlocked: [],
                  error: error.message,
                };
              }

              // Check if the function returned an error
              if (data && data.success === false) {
                return {
                  user_id: player.user_id,
                  stats_updated: null,
                  metrics_updated: null,
                  achievements_unlocked: [],
                  error: data.error || 'Unknown error',
                };
              }

              const stats = data?.stats || null;
              const metrics = data?.metrics || null;
              const achievements = data?.achievements?.unlocked || [];

              // Log and emit achievement unlocks
              if (achievements.length > 0) {
                console.log(`🏆 [MATCH] ${player.user_id} unlocked ${achievements.length} achievement(s)!`);
                // Emit socket notification for achievement unlock
                emitAchievementUnlock(player.user_id, achievements);
              }

              return {
                user_id: player.user_id,
                stats_updated: stats,
                metrics_updated: metrics,
                achievements_unlocked: achievements,
              };
            } catch (err) {
              console.error(`❌ [MATCH] Exception processing ${player.user_id}:`, err);
              return {
                user_id: player.user_id,
                stats_updated: null,
                metrics_updated: null,
                achievements_unlocked: [],
                error: (err as Error).message,
              };
            }
          })
        );

        // Count successes and failures
        const successCount = results.filter((r) => !r.error).length;
        const failCount = results.filter((r) => r.error).length;

        console.log(
          `✅ [MATCH] Match result processed: ${successCount} success, ${failCount} failed`
        );

        res.json({
          success: true,
          results,
          summary: {
            total: players.length,
            successful: successCount,
            failed: failCount,
          },
        });
      } catch (error) {
        console.error('❌ [MATCH] Error in match-result endpoint:', error);
        res.status(500).json({
          success: false,
          error: 'Internal server error',
        });
      }
    }
  );

  /**
   * GET /api/game/user-stats/:userId
   *
   * Get comprehensive stats for a user.
   * Public endpoint (no API key required for viewing stats).
   */
  router.get('/user-stats/:userId', async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: 'userId is required',
        });
        return;
      }

      const { data, error } = await db.adminClient.rpc('get_user_stats', {
        p_user_id: userId,
      });

      if (error) {
        console.error(`❌ [STATS] Error fetching stats for ${userId}:`, error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch user stats',
        });
        return;
      }

      if (!data) {
        res.status(404).json({
          success: false,
          error: 'User not found',
        });
        return;
      }

      res.json({
        success: true,
        stats: data,
      });
    } catch (error) {
      console.error('❌ [STATS] Error in user-stats endpoint:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  return router;
}
