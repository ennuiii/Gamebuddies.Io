const express = require('express');
const router = express.Router();
const { db } = require('../lib/supabase');

// Simple in-memory cache
let gamesCache = {
  data: null,
  timestamp: 0,
  duration: 60 * 1000 // 60 seconds
};

/**
 * GET /api/games
 * Fetch all active games from the database
 * Returns games that are active and not in maintenance mode
 */
router.get('/', async (req, res) => {
  try {
    // Check cache
    if (gamesCache.data && (Date.now() - gamesCache.timestamp < gamesCache.duration)) {
      // console.log('[Games API] 📦 Using cached games list');
      return res.json(gamesCache.data);
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
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch games',
        code: 'DATABASE_ERROR'
      });
    }

    console.log(`[Games API] ✅ Found ${games.length} games`);

    // Transform data to match frontend expectations
    const transformedGames = games.map(game => ({
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
router.get('/:gameId', async (req, res) => {
  const { gameId } = req.params;

  try {
    const { data: game, error } = await db.client
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single();

    if (error || !game) {
      return res.status(404).json({
        success: false,
        error: 'Game not found',
        code: 'GAME_NOT_FOUND'
      });
    }

    if (!game.is_active || game.maintenance_mode) {
      return res.status(503).json({
        success: false,
        error: 'Game is currently unavailable',
        code: 'GAME_UNAVAILABLE',
        maintenance: game.maintenance_mode
      });
    }

    res.json({
      success: true,
      game: {
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

module.exports = router;
