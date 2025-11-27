import express, { Request, Response, Router } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middlewares/auth';
import { achievementService } from '../services/achievementService';
import type { AchievementFilter } from '../../shared/types/achievements';

const router: Router = express.Router();

/**
 * GET /api/achievements
 * Get all achievement definitions
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const filter: AchievementFilter = {
      category: (req.query.category as AchievementFilter['category']) || 'all',
      rarity: (req.query.rarity as AchievementFilter['rarity']) || 'all',
    };

    const achievements = await achievementService.getAllAchievements(filter);

    res.json({
      success: true,
      achievements,
      count: achievements.length,
    });
  } catch (error) {
    console.error('[Achievements] Error fetching achievements:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch achievements',
    });
  }
});

/**
 * GET /api/achievements/me
 * Get current user's achievements with progress
 */
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const filter: AchievementFilter = {
      category: (req.query.category as AchievementFilter['category']) || 'all',
      rarity: (req.query.rarity as AchievementFilter['rarity']) || 'all',
      status: (req.query.status as AchievementFilter['status']) || 'all',
      sort: (req.query.sort as AchievementFilter['sort']) || 'display_order',
    };

    const achievements = await achievementService.getUserAchievements(userId, filter);
    const stats = await achievementService.getAchievementStats(userId);

    res.json({
      success: true,
      achievements,
      stats,
    });
  } catch (error) {
    console.error('[Achievements] Error fetching user achievements:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user achievements',
    });
  }
});

/**
 * GET /api/achievements/user/:userId
 * Get a user's achievements (public profile view)
 */
router.get('/user/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const filter: AchievementFilter = {
      category: (req.query.category as AchievementFilter['category']) || 'all',
      rarity: (req.query.rarity as AchievementFilter['rarity']) || 'all',
      status: 'unlocked', // Only show unlocked achievements for public view
      sort: (req.query.sort as AchievementFilter['sort']) || 'recent',
    };

    const achievements = await achievementService.getUserAchievements(userId, filter);
    const stats = await achievementService.getAchievementStats(userId);

    res.json({
      success: true,
      achievements,
      stats,
    });
  } catch (error) {
    console.error('[Achievements] Error fetching user achievements:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user achievements',
    });
  }
});

/**
 * GET /api/achievements/stats
 * Get achievement statistics for current user
 */
router.get('/stats', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const stats = await achievementService.getAchievementStats(userId);

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('[Achievements] Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch achievement stats',
    });
  }
});

/**
 * GET /api/profile/:userId
 * Get public user profile with achievements
 */
router.get('/profile/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const profile = await achievementService.getUserProfile(userId);

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    res.json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error('[Achievements] Error fetching profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user profile',
    });
  }
});

/**
 * GET /api/profile/username/:username
 * Get public user profile by username
 */
router.get('/profile/username/:username', async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    const profile = await achievementService.getUserProfileByUsername(username);

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    res.json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error('[Achievements] Error fetching profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user profile',
    });
  }
});

/**
 * POST /api/achievements/check
 * Manually trigger achievement check (internal use)
 * Requires API key or admin auth
 */
router.post('/check', async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers['x-api-key'];
    const expectedKey = process.env.GAMEBUDDIES_API_KEY;

    // Require API key for this endpoint
    if (!apiKey || apiKey !== expectedKey) {
      return res.status(403).json({
        success: false,
        error: 'Invalid API key',
      });
    }

    const { user_id, event_type, event_data } = req.body;

    if (!user_id || !event_type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: user_id, event_type',
      });
    }

    const result = await achievementService.checkAchievements({
      user_id,
      type: event_type,
      game_id: event_data?.game_id,
      room_id: event_data?.room_id,
      won: event_data?.won,
      score: event_data?.score,
      win_streak: event_data?.win_streak,
      metadata: event_data,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[Achievements] Error checking achievements:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check achievements',
    });
  }
});

export default router;
