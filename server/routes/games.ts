import express, { Request, Response, Router } from 'express';
import { db } from '../lib/supabase';

const router: Router = express.Router();

// Type definitions
interface Game {
  id: string;
  name: string;
  display_name: string;
  description: string;
  icon: string;
  thumbnail_url: string | null;
  is_active: boolean;
  maintenance_mode: boolean;
  max_players: number;
  min_players: number;
  base_url: string;
  is_external: boolean;
  supports_spectators: boolean;
  settings_schema: Record<string, unknown>;
  default_settings: Record<string, unknown>;
}

interface TransformedGame {
  id: string;
  name: string;
  displayName: string;
  description: string;
  icon: string;
  screenshot: string | null;
  thumbnailUrl: string | null;
  path: string;
  available: boolean;
  maxPlayers: number;
  minPlayers: number;
  baseUrl: string;
  isExternal: boolean;
  supportsSpectators: boolean;
  settingsSchema: Record<string, unknown>;
  defaultSettings: Record<string, unknown>;
}

interface GamesCache {
  data: { success: boolean; games: TransformedGame[] } | null;
  timestamp: number;
  duration: number;
}

// Simple in-memory cache
let gamesCache: GamesCache = {
  data: null,
  timestamp: 0,
  duration: 60 * 1000 // 60 seconds
};

/**
 * GET /api/games
 * Fetch all active games from the database
 * Returns games that are active and not in maintenance mode
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    // Check cache
    if (gamesCache.data && (Date.now() - gamesCache.timestamp < gamesCache.duration)) {
      // console.log('[Games API] 📦 Using cached games list');
      res.json(gamesCache.data);
      return;
    }

    console.log('[Games API] 🎮 Fetching games from database...');

    const { data: games, error } = await db.client
      .from('games')
      .select('*')
      .eq('is_active', true)
      .eq('maintenance_mode', false)
      .order('name');

    if (error) {
      console.error('[Games API] ❌ Error fetching games:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch games',
        code: 'DATABASE_ERROR'
      });
      return;
    }

    console.log(`[Games API] ✅ Found ${games?.length || 0} games`);

    // Transform data to match frontend expectations
    const transformedGames: TransformedGame[] = (games as Game[] || []).map((game: Game) => ({
      id: game.id,
      name: game.display_name || game.name,
      displayName: game.display_name,
      description: game.description || '',
      icon: game.icon || '🎮',
      screenshot: game.thumbnail_url,
      thumbnailUrl: game.thumbnail_url,
      path: `/${game.id}`,
      available: game.is_active && !game.maintenance_mode,
      maxPlayers: game.max_players || 10,
      minPlayers: game.min_players || 2,
      baseUrl: game.base_url,
      isExternal: game.is_external,
      supportsSpectators: game.supports_spectators,
      settingsSchema: game.settings_schema || {},
      defaultSettings: game.default_settings || {}
    }));

    const responseData = {
      success: true,
      games: transformedGames
    };

    // Update cache
    gamesCache = {
      data: responseData,
      timestamp: Date.now(),
      duration: 60 * 1000
    };

    res.json(responseData);

  } catch (err) {
    console.error('[Games API] Unexpected error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      code: 'SERVER_ERROR'
    });
  }
});

/**
 * GET /api/games/:gameId
 * Fetch a specific game by ID
 */
router.get('/:gameId', async (req: Request, res: Response): Promise<void> => {
  const { gameId } = req.params;

  try {
    const { data: game, error } = await db.client
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single();

    if (error || !game) {
      res.status(404).json({
        success: false,
        error: 'Game not found',
        code: 'GAME_NOT_FOUND'
      });
      return;
    }

    const typedGame = game as Game;

    if (!typedGame.is_active || typedGame.maintenance_mode) {
      res.status(503).json({
        success: false,
        error: 'Game is currently unavailable',
        code: 'GAME_UNAVAILABLE',
        maintenance: typedGame.maintenance_mode
      });
      return;
    }

    res.json({
      success: true,
      game: {
        id: typedGame.id,
        name: typedGame.display_name || typedGame.name,
        displayName: typedGame.display_name,
        description: typedGame.description || '',
        icon: typedGame.icon || '🎮',
        screenshot: typedGame.thumbnail_url,
        thumbnailUrl: typedGame.thumbnail_url,
        path: `/${typedGame.id}`,
        available: typedGame.is_active && !typedGame.maintenance_mode,
        maxPlayers: typedGame.max_players || 10,
        minPlayers: typedGame.min_players || 2,
        baseUrl: typedGame.base_url,
        isExternal: typedGame.is_external,
        supportsSpectators: typedGame.supports_spectators,
        settingsSchema: typedGame.settings_schema || {},
        defaultSettings: typedGame.default_settings || {}
      }
    });

  } catch (err) {
    console.error('[Games API] Unexpected error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      code: 'SERVER_ERROR'
    });
  }
});

export default router;
