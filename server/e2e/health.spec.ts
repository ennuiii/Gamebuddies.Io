/**
 * E2E Tests for Server Health Check
 */

import { test, expect } from '@playwright/test';

test.describe('Server Health', () => {
  test('should return healthy status', async ({ request }) => {
    const response = await request.get('/health');

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.status).toBe('ok');
    expect(data.timestamp).toBeDefined();
    expect(data.uptime).toBeGreaterThan(0);
    expect(data.version).toBe('2.0.0');
  });

  test('should return connection stats', async ({ request }) => {
    const response = await request.get('/api/connection-stats');

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data).toBeDefined();
    expect(data.data.socketConnections).toBeDefined();
    expect(data.data.rooms).toBeDefined();
    expect(data.data.timestamp).toBeDefined();
  });
});
