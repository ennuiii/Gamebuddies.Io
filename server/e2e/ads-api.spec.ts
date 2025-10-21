/**
 * E2E Tests for Ad Management API
 */

import { test, expect } from '@playwright/test';

test.describe('Ad Management API', () => {
  test.describe('GET /api/ads/config', () => {
    test('should return ad config for valid placement', async ({ request }) => {
      const response = await request.get('/api/ads/config?placement=banner');

      expect(response.ok()).toBeTruthy();
      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(data.data.showAd).toBe(true);
      expect(data.data.adData).toEqual({
        type: 'display',
        network: 'adsense',
        placement: 'banner',
      });
    });

    test('should reject invalid placement', async ({ request }) => {
      const response = await request.get('/api/ads/config?placement=invalid');

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.showAd).toBe(false);
      expect(data.data.reason).toBe('invalid_placement');
    });

    test('should return error for missing placement', async ({ request }) => {
      const response = await request.get('/api/ads/config');

      expect(response.status()).toBe(500);
    });
  });

  test.describe('GET /api/ads/should-show', () => {
    test('should indicate ads should show for non-premium users', async ({ request }) => {
      const response = await request.get('/api/ads/should-show');

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.showAds).toBe(true);
      expect(data.data.isPremium).toBe(false);
    });
  });

  test.describe('POST /api/ads/impression', () => {
    test('should track ad impression', async ({ request }) => {
      const response = await request.post('/api/ads/impression', {
        data: {
          placement: 'banner',
          ad_type: 'display',
          ad_network: 'adsense',
        },
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toBe('Impression tracked');
    });

    test('should reject impression without required fields', async ({ request }) => {
      const response = await request.post('/api/ads/impression', {
        data: {
          placement: 'banner',
          // Missing ad_type and ad_network
        },
      });

      expect(response.status()).toBe(500);
    });
  });
});
