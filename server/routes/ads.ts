/**
 * Ad Management API Routes
 *
 * Handles ad impression tracking, revenue reporting, and ad configuration.
 */

import { Router } from 'express';
import { AuthenticatedRequest } from '../types';
import adManager from '../lib/adManager';
import logger from '../lib/logger';
import { ValidationError } from '../lib/errors';

const router = Router();

/**
 * POST /api/ads/impression
 * Track an ad impression
 */
router.post('/impression', async (req: AuthenticatedRequest, res) => {
  try {
    const { placement, ad_type, ad_network, session_id } = req.body;

    if (!placement || !ad_type || !ad_network) {
      throw new ValidationError('Missing required fields: placement, ad_type, ad_network');
    }

    const userId = req.user?.id || null;

    await adManager.trackAdImpression(
      (req as any).db,
      userId,
      {
        type: ad_type,
        network: ad_network,
        placement,
        session_id,
      }
    );

    res.json({
      success: true,
      message: 'Impression tracked',
    });
  } catch (error) {
    logger.error('Failed to track ad impression', {
      error: (error as Error).message,
      body: req.body,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to track impression',
    });
  }
});

/**
 * GET /api/ads/config
 * Get ad configuration for a specific placement
 */
router.get('/config', async (req: AuthenticatedRequest, res) => {
  try {
    const { placement } = req.query;

    if (!placement || typeof placement !== 'string') {
      throw new ValidationError('Missing or invalid placement parameter');
    }

    const isPremium = req.isPremium || false;
    const adConfig = adManager.getAdConfig(placement, isPremium);

    res.json({
      success: true,
      data: adConfig,
    });
  } catch (error) {
    logger.error('Failed to get ad config', {
      error: (error as Error).message,
      query: req.query,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get ad configuration',
    });
  }
});

/**
 * GET /api/ads/should-show
 * Check if the current user should see ads
 */
router.get('/should-show', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || null;
    const shouldShow = await adManager.shouldShowAds((req as any).db, userId);

    res.json({
      success: true,
      data: {
        showAds: shouldShow,
        isPremium: !shouldShow,
      },
    });
  } catch (error) {
    logger.error('Failed to check ad eligibility', {
      error: (error as Error).message,
      userId: req.user?.id,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to check ad eligibility',
    });
  }
});

/**
 * GET /api/ads/revenue
 * Get ad revenue statistics (admin only)
 */
router.get('/revenue', async (req: AuthenticatedRequest, res) => {
  try {
    // TODO: Add admin authentication check
    const { startDate, endDate } = req.query;

    const start = startDate
      ? new Date(startDate as string)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

    const end = endDate
      ? new Date(endDate as string)
      : new Date();

    const stats = await adManager.getAdRevenue((req as any).db, start, end);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Failed to get ad revenue stats', {
      error: (error as Error).message,
      query: req.query,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get revenue statistics',
    });
  }
});

/**
 * POST /api/ads/cleanup
 * Clean up old ad impressions (admin only)
 */
router.post('/cleanup', async (req: AuthenticatedRequest, res) => {
  try {
    // TODO: Add admin authentication check
    const { retentionDays } = req.body;

    const result = await adManager.cleanupOldImpressions(
      (req as any).db,
      retentionDays || 90
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Failed to cleanup ad impressions', {
      error: (error as Error).message,
      body: req.body,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to cleanup impressions',
    });
  }
});

export default router;
