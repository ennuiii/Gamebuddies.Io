/**
 * Tests for API Key Manager
 */

import {
  generateApiKey,
  hashApiKey,
  verifyApiKey,
  isValidApiKeyFormat,
  extractServiceFromKey,
} from '../../lib/apiKeyManager';

describe('API Key Manager', () => {
  describe('generateApiKey', () => {
    it('should generate API key with correct format', () => {
      const apiKey = generateApiKey('ddf');

      expect(apiKey).toMatch(/^gb_ddf_[a-f0-9]{64}$/);
    });

    it('should generate unique keys', () => {
      const key1 = generateApiKey('ddf');
      const key2 = generateApiKey('ddf');

      expect(key1).not.toBe(key2);
    });

    it('should include service name in key', () => {
      const apiKey = generateApiKey('schooled');

      expect(apiKey).toContain('gb_schooled_');
    });
  });

  describe('hashApiKey', () => {
    it('should hash an API key', async () => {
      const apiKey = generateApiKey('ddf');
      const hash = await hashApiKey(apiKey);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(apiKey);
      expect(hash.length).toBeGreaterThan(50); // bcrypt hashes are long
    });

    it('should generate different hashes for same key', async () => {
      const apiKey = generateApiKey('ddf');
      const hash1 = await hashApiKey(apiKey);
      const hash2 = await hashApiKey(apiKey);

      // bcrypt uses salt, so hashes should be different
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyApiKey', () => {
    it('should verify correct API key', async () => {
      const apiKey = generateApiKey('ddf');
      const hash = await hashApiKey(apiKey);
      const isValid = await verifyApiKey(apiKey, hash);

      expect(isValid).toBe(true);
    });

    it('should reject incorrect API key', async () => {
      const apiKey = generateApiKey('ddf');
      const hash = await hashApiKey(apiKey);
      const wrongKey = generateApiKey('ddf'); // Different key
      const isValid = await verifyApiKey(wrongKey, hash);

      expect(isValid).toBe(false);
    });

    it('should handle invalid hash gracefully', async () => {
      const apiKey = generateApiKey('ddf');
      const isValid = await verifyApiKey(apiKey, 'invalid-hash');

      expect(isValid).toBe(false);
    });
  });

  describe('isValidApiKeyFormat', () => {
    it('should validate correct API key format', () => {
      const validKey = 'gb_ddf_' + 'a'.repeat(64);
      const isValid = isValidApiKeyFormat(validKey);

      expect(isValid).toBe(true);
    });

    it('should reject keys without gb_ prefix', () => {
      const invalidKey = 'ddf_' + 'a'.repeat(64);
      const isValid = isValidApiKeyFormat(invalidKey);

      expect(isValid).toBe(false);
    });

    it('should reject keys with wrong hex length', () => {
      const invalidKey = 'gb_ddf_abc123';
      const isValid = isValidApiKeyFormat(invalidKey);

      expect(isValid).toBe(false);
    });

    it('should reject keys with non-hex characters', () => {
      const invalidKey = 'gb_ddf_' + 'z'.repeat(64);
      const isValid = isValidApiKeyFormat(invalidKey);

      expect(isValid).toBe(false);
    });

    it('should reject null or undefined', () => {
      expect(isValidApiKeyFormat(null as any)).toBe(false);
      expect(isValidApiKeyFormat(undefined as any)).toBe(false);
    });

    it('should reject keys that are too short', () => {
      const shortKey = 'gb_ddf_abc';
      const isValid = isValidApiKeyFormat(shortKey);

      expect(isValid).toBe(false);
    });
  });

  describe('extractServiceFromKey', () => {
    it('should extract service name from valid key', () => {
      const validKey = 'gb_ddf_' + 'a'.repeat(64);
      const service = extractServiceFromKey(validKey);

      expect(service).toBe('ddf');
    });

    it('should extract different service names', () => {
      const schooledKey = 'gb_schooled_' + 'a'.repeat(64);
      const service = extractServiceFromKey(schooledKey);

      expect(service).toBe('schooled');
    });

    it('should return null for invalid key', () => {
      const invalidKey = 'invalid-key';
      const service = extractServiceFromKey(invalidKey);

      expect(service).toBeNull();
    });

    it('should return null for malformed key', () => {
      const malformedKey = 'gb_';
      const service = extractServiceFromKey(malformedKey);

      expect(service).toBeNull();
    });
  });
});
