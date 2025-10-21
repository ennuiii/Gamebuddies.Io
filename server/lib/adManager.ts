/**
 * Ad Manager
 *
 * Server-side ad management for tracking impressions and revenue.
 * Integrates with Google AdSense and handles ad impression logging.
 */

import logger from './logger';
import { DatabaseService, AdImpression, AdData, AdResponse } from '../types';

/**
 * Track an ad impression in the database
 *
 * @param db - Database service
 * @param userId - User ID (optional for guest users)
 * @param adData - Ad impression data
 */
export async function trackAdImpression(
  db: DatabaseService,
  userId: string | null,
  adData: AdData
): Promise<void> {
  try {
    const { error } = await db.adminClient.from('ad_impressions').insert({
      user_id: userId,
      ad_type: adData.type,
      ad_placement: adData.placement || 'unknown',
      ad_network: adData.network || 'adsense',
      cpm_cents: adData.cpm_cents || null,
      revenue_cents: adData.revenue_cents || null,
      session_id: adData.session_id || null,
    });

    if (error) {
      throw error;
    }

    logger.info('Ad impression tracked', {
      userId,
      adType: adData.type,
      placement: adData.placement,
      network: adData.network,
    });
  } catch (error) {
    logger.error('Failed to track ad impression', {
      error: (error as Error).message,
      userId,
      adData,
    });
    // Don't throw - ad tracking failures shouldn't break the app
  }
}

/**
 * Get ad revenue statistics
 *
 * @param db - Database service
 * @param startDate - Start date for statistics
 * @param endDate - End date for statistics
 */
export async function getAdRevenue(
  db: DatabaseService,
  startDate: Date,
  endDate: Date
): Promise<{
  totalImpressions: number;
  totalRevenueCents: number;
  averageCpmCents: number;
  byPlacement: Record<string, { impressions: number; revenue: number }>;
}> {
  try {
    // Get total impressions and revenue
    const { data: stats, error } = await db.adminClient
      .from('ad_impressions')
      .select('ad_placement, revenue_cents, cpm_cents')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (error) {
      throw error;
    }

    if (!stats || stats.length === 0) {
      return {
        totalImpressions: 0,
        totalRevenueCents: 0,
        averageCpmCents: 0,
        byPlacement: {},
      };
    }

    const byPlacement: Record<string, { impressions: number; revenue: number }> = {};
    let totalRevenueCents = 0;
    let totalCpmCents = 0;
    let cpmCount = 0;

    for (const impression of stats) {
      const placement = impression.ad_placement || 'unknown';

      if (!byPlacement[placement]) {
        byPlacement[placement] = { impressions: 0, revenue: 0 };
      }

      byPlacement[placement].impressions++;

      if (impression.revenue_cents) {
        totalRevenueCents += impression.revenue_cents;
        byPlacement[placement].revenue += impression.revenue_cents;
      }

      if (impression.cpm_cents) {
        totalCpmCents += impression.cpm_cents;
        cpmCount++;
      }
    }

    return {
      totalImpressions: stats.length,
      totalRevenueCents,
      averageCpmCents: cpmCount > 0 ? totalCpmCents / cpmCount : 0,
      byPlacement,
    };
  } catch (error) {
    logger.error('Failed to get ad revenue stats', {
      error: (error as Error).message,
    });
    throw error;
  }
}

/**
 * Check if a user should see ads
 * Premium users don't see ads
 *
 * @param db - Database service
 * @param userId - User ID
 * @returns Whether the user should see ads
 */
export async function shouldShowAds(db: DatabaseService, userId: string | null): Promise<boolean> {
  // Always show ads to non-logged-in users
  if (!userId) {
    return true;
  }

  try {
    // Check if user has active premium subscription
    const { data: subscription, error } = await db.adminClient
      .from('user_subscriptions')
      .select('status, tier_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (error || !subscription) {
      // No active subscription = show ads
      return true;
    }

    // Premium tier = no ads
    if (subscription.tier_id === 'premium') {
      return false;
    }

    // Default to showing ads
    return true;
  } catch (error) {
    logger.error('Failed to check ad eligibility', {
      error: (error as Error).message,
      userId,
    });
    // On error, default to showing ads
    return true;
  }
}

/**
 * Get ad configuration for a specific placement
 *
 * @param placement - Ad placement identifier
 * @param isPremium - Whether the user is premium
 * @returns Ad configuration or null if ads shouldn't be shown
 */
export function getAdConfig(placement: string, isPremium: boolean): AdResponse {
  // Don't show ads to premium users
  if (isPremium) {
    return {
      showAd: false,
      reason: 'premium_user',
    };
  }

  // AdSense configuration by placement
  const adConfigs: Record<string, { type: string; network: string }> = {
    banner: { type: 'display', network: 'adsense' },
    sidebar: { type: 'display', network: 'adsense' },
    'in-content': { type: 'display', network: 'adsense' },
    'between-games': { type: 'display', network: 'adsense' },
  };

  const config = adConfigs[placement];

  if (!config) {
    return {
      showAd: false,
      reason: 'invalid_placement',
    };
  }

  return {
    showAd: true,
    adData: {
      type: config.type,
      network: config.network,
      placement,
    },
  };
}

/**
 * Clean up old ad impression records
 * Keep impressions for 90 days by default
 *
 * @param db - Database service
 * @param retentionDays - Number of days to keep impressions
 */
export async function cleanupOldImpressions(
  db: DatabaseService,
  retentionDays: number = 90
): Promise<{ deletedCount: number }> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const { data, error } = await db.adminClient
      .from('ad_impressions')
      .delete()
      .lt('created_at', cutoffDate.toISOString())
      .select('id');

    if (error) {
      throw error;
    }

    const deletedCount = data?.length || 0;

    logger.info('Cleaned up old ad impressions', {
      deletedCount,
      retentionDays,
      cutoffDate: cutoffDate.toISOString(),
    });

    return { deletedCount };
  } catch (error) {
    logger.error('Failed to cleanup old ad impressions', {
      error: (error as Error).message,
    });
    throw error;
  }
}

export default {
  trackAdImpression,
  getAdRevenue,
  shouldShowAds,
  getAdConfig,
  cleanupOldImpressions,
};
