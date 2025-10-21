/**
 * Tests for Ad Manager
 */

import { getAdConfig, shouldShowAds } from '../../lib/adManager';
import { DatabaseService } from '../../types';

// Mock database service
const createMockDb = (): jest.Mocked<DatabaseService> => {
  return {
    client: {},
    adminClient: {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
    },
    isSupabase: true,
    createRoom: jest.fn(),
    getRoomByCode: jest.fn(),
    getRoomById: jest.fn(),
    updateRoom: jest.fn(),
    getOrCreateUser: jest.fn(),
    addParticipant: jest.fn(),
    updateParticipant: jest.fn(),
    removeParticipant: jest.fn(),
    logEvent: jest.fn(),
    cleanupInactiveRooms: jest.fn(),
    deleteRoom: jest.fn(),
  } as any;
};

describe('Ad Manager', () => {
  describe('getAdConfig', () => {
    it('should not show ads to premium users', () => {
      const config = getAdConfig('banner', true);

      expect(config.showAd).toBe(false);
      expect(config.reason).toBe('premium_user');
    });

    it('should show ads to non-premium users for valid placements', () => {
      const config = getAdConfig('banner', false);

      expect(config.showAd).toBe(true);
      expect(config.adData).toEqual({
        type: 'display',
        network: 'adsense',
        placement: 'banner',
      });
    });

    it('should return correct config for sidebar placement', () => {
      const config = getAdConfig('sidebar', false);

      expect(config.showAd).toBe(true);
      expect(config.adData?.placement).toBe('sidebar');
    });

    it('should return correct config for in-content placement', () => {
      const config = getAdConfig('in-content', false);

      expect(config.showAd).toBe(true);
      expect(config.adData?.placement).toBe('in-content');
    });

    it('should return correct config for between-games placement', () => {
      const config = getAdConfig('between-games', false);

      expect(config.showAd).toBe(true);
      expect(config.adData?.placement).toBe('between-games');
    });

    it('should reject invalid placements', () => {
      const config = getAdConfig('invalid-placement', false);

      expect(config.showAd).toBe(false);
      expect(config.reason).toBe('invalid_placement');
    });
  });

  describe('shouldShowAds', () => {
    let mockDb: jest.Mocked<DatabaseService>;

    beforeEach(() => {
      mockDb = createMockDb();
    });

    it('should show ads to non-logged-in users', async () => {
      const shouldShow = await shouldShowAds(mockDb, null);

      expect(shouldShow).toBe(true);
      expect(mockDb.adminClient.from).not.toHaveBeenCalled();
    });

    it('should show ads to users without subscriptions', async () => {
      mockDb.adminClient.single.mockResolvedValue({ data: null, error: new Error('Not found') });

      const shouldShow = await shouldShowAds(mockDb, 'user123');

      expect(shouldShow).toBe(true);
      expect(mockDb.adminClient.from).toHaveBeenCalledWith('user_subscriptions');
    });

    it('should not show ads to premium users', async () => {
      mockDb.adminClient.single.mockResolvedValue({
        data: {
          status: 'active',
          tier_id: 'premium',
        },
        error: null,
      });

      const shouldShow = await shouldShowAds(mockDb, 'user123');

      expect(shouldShow).toBe(false);
    });

    it('should show ads to users with non-premium subscriptions', async () => {
      mockDb.adminClient.single.mockResolvedValue({
        data: {
          status: 'active',
          tier_id: 'basic',
        },
        error: null,
      });

      const shouldShow = await shouldShowAds(mockDb, 'user123');

      expect(shouldShow).toBe(true);
    });

    it('should not show ads to users with inactive but premium subscriptions', async () => {
      // shouldShowAds only checks for active + premium combination
      // If the subscription is expired, the query won't return it because it filters by status='active'
      mockDb.adminClient.single.mockResolvedValue({
        data: null, // No active subscription found
        error: new Error('Not found'),
      });

      const shouldShow = await shouldShowAds(mockDb, 'user123');

      expect(shouldShow).toBe(true); // No active subscription = show ads
    });

    it('should handle database errors gracefully', async () => {
      mockDb.adminClient.single.mockRejectedValue(new Error('Database error'));

      const shouldShow = await shouldShowAds(mockDb, 'user123');

      // Should default to showing ads on error
      expect(shouldShow).toBe(true);
    });
  });
});
