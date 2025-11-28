import express, { Request, Response, Router } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middlewares/auth';
import { xpService } from '../services/xpService';

const router: Router = express.Router();

/**
 * POST /api/xp/grant
 * Grant XP to a user (for external games)
 * Requires API key authentication
 */
router.post('/grant', async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    const expectedKey = process.env.GAMEBUDDIES_API_KEY;

    // Validate API key
    if (!apiKey || apiKey !== expectedKey) {
      return res.status(403).json({
        success: false,
        error: 'Invalid API key',
      });
    }

    const { user_id, amount, source } = req.body;

    // Validate required fields
    if (!user_id || typeof user_id !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'user_id is required and must be a string',
      });
    }

    if (amount === undefined || typeof amount !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'amount is required and must be a number',
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'amount must be a positive number',
      });
    }

    const xpSource = source || 'api_grant';

    // Grant XP
    const result = await xpService.addXp(user_id, amount, xpSource);

    console.log(`🎮 [XP API] Granted ${amount} XP to user ${user_id} (source: ${xpSource})`);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[XP] Error granting XP:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to grant XP',
    });
  }
});

/**
 * GET /api/xp/me
 * Get current user's XP and level progress
 */
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const { data: user, error } = await (await import('../lib/supabase')).supabaseAdmin
      .from('users')
      .select('xp, level')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const progress = xpService.getLevelProgress(user.xp || 0);
    const levelCurve = xpService.getLevelCurve();

    res.json({
      success: true,
      xp: user.xp || 0,
      level: user.level || 1,
      progress,
      levelCurve,
      maxLevel: xpService.getMaxLevel(),
    });
  } catch (error) {
    console.error('[XP] Error fetching XP:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch XP data',
    });
  }
});

/**
 * POST /api/xp/recalculate
 * Recalculate current user's level from XP (self-service fix)
 */
router.post('/recalculate', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const result = await xpService.recalculateUserLevel(userId);

    res.json({
      success: true,
      ...result,
      message: result.wasFixed
        ? `Level corrected from ${result.previousLevel} to ${result.newLevel}`
        : 'Level is already correct',
    });
  } catch (error) {
    console.error('[XP] Error recalculating level:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to recalculate level',
    });
  }
});

/**
 * POST /api/xp/recalculate/:userId
 * Admin endpoint to recalculate any user's level
 * Requires admin role
 */
router.post('/recalculate/:userId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Check if user is admin
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
    }

    const { userId } = req.params;

    const result = await xpService.recalculateUserLevel(userId);

    res.json({
      success: true,
      ...result,
      message: result.wasFixed
        ? `Level corrected from ${result.previousLevel} to ${result.newLevel}`
        : 'Level is already correct',
    });
  } catch (error) {
    console.error('[XP] Error recalculating level:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to recalculate level',
    });
  }
});

/**
 * GET /api/xp/level-curve
 * Get the level curve configuration (public)
 */
router.get('/level-curve', (req: Request, res: Response) => {
  res.json({
    success: true,
    levelCurve: xpService.getLevelCurve(),
    maxLevel: xpService.getMaxLevel(),
  });
});

export default router;
