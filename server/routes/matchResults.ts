import express, { Request, Response, NextFunction, Router } from 'express';
import { DatabaseService } from '../lib/supabase';
import { validateApiKey } from '../lib/validation';

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
export default function createMatchResultsRouter(db: DatabaseService): Router {
  const router: Router = express.Router();

  /**
   * POST /api/game/match-result
   *
   * Report match results for all players in a game.
   * Updates stats, win streaks, and triggers achievement checking.
   *
   * Request body:
   * {
   *   room_id?: string,       // Optional room UUID
   *   game_id: string,        // Game identifier (e.g., "schooled", "ddf")
   *   players: [
   *     { user_id: string, rank?: number, score?: number, won: boolean },
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
              });

              if (error) {
                console.error(`❌ [MATCH] Error processing result for ${player.user_id}:`, error);
                return {
                  user_id: player.user_id,
                  stats_updated: null,
                  achievements_unlocked: [],
                  error: error.message,
                };
              }

              // Check if the function returned an error
              if (data && data.success === false) {
                return {
                  user_id: player.user_id,
                  stats_updated: null,
                  achievements_unlocked: [],
                  error: data.error || 'Unknown error',
                };
              }

              const stats = data?.stats || null;
              const achievements = data?.achievements?.unlocked || [];

              // Log achievement unlocks
              if (achievements.length > 0) {
                console.log(`🏆 [MATCH] ${player.user_id} unlocked ${achievements.length} achievement(s)!`);
              }

              return {
                user_id: player.user_id,
                stats_updated: stats,
                achievements_unlocked: achievements,
              };
            } catch (err) {
              console.error(`❌ [MATCH] Exception processing ${player.user_id}:`, err);
              return {
                user_id: player.user_id,
                stats_updated: null,
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
