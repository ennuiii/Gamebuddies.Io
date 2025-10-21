/**
 * API Key Management with Proper Hashing
 *
 * Provides secure API key generation and validation using bcrypt hashing.
 * Never stores plain-text API keys in the database.
 */

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import constants from '@/config/constants';
import logger from './logger';
import { DatabaseService, ApiKey } from '@/types';

/**
 * Generate a new API key
 * Format: gb_{service}_{random_string}
 *
 * @param service - Service name (e.g., 'ddf', 'schooled')
 * @returns The generated API key (plain text - only shown once)
 */
export function generateApiKey(service: string): string {
  // Generate random bytes for the key
  const randomBytes = crypto.randomBytes(32).toString('hex');

  // Format: gb_servicename_randomstring
  const apiKey = `gb_${service}_${randomBytes}`;

  logger.security('API key generated', {
    service,
    keyLength: apiKey.length,
    prefix: `gb_${service}_`,
  });

  return apiKey;
}

/**
 * Hash an API key for storage
 * Uses bcrypt with configurable salt rounds
 *
 * @param apiKey - The plain-text API key
 * @returns The hashed API key
 */
export async function hashApiKey(apiKey: string): Promise<string> {
  try {
    const hash = await bcrypt.hash(apiKey, constants.BCRYPT_SALT_ROUNDS);

    logger.debug('API key hashed', {
      hashLength: hash.length,
    });

    return hash;
  } catch (error) {
    logger.error('Failed to hash API key', {
      error: (error as Error).message,
    });
    throw new Error('API key hashing failed');
  }
}

/**
 * Verify an API key against a stored hash
 *
 * @param apiKey - The plain-text API key to verify
 * @param hash - The stored hash to compare against
 * @returns True if key matches hash
 */
export async function verifyApiKey(apiKey: string, hash: string): Promise<boolean> {
  try {
    const isValid = await bcrypt.compare(apiKey, hash);

    logger.debug('API key verification', {
      isValid,
    });

    return isValid;
  } catch (error) {
    logger.error('API key verification failed', {
      error: (error as Error).message,
    });
    return false;
  }
}

/**
 * Validate API key format
 * Expected format: gb_{service}_{64-char-hex}
 *
 * @param apiKey - The API key to validate
 * @returns True if format is valid
 */
export function isValidApiKeyFormat(apiKey: string): boolean {
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }

  // Check minimum length
  if (apiKey.length < constants.API_KEY_MIN_LENGTH) {
    return false;
  }

  // Check format: gb_{service}_{hex}
  const formatRegex = /^gb_[a-z]+_[a-f0-9]{64}$/;
  return formatRegex.test(apiKey);
}

/**
 * Extract service name from API key
 *
 * @param apiKey - The API key
 * @returns Service name or null if invalid
 */
export function extractServiceFromKey(apiKey: string): string | null {
  if (!isValidApiKeyFormat(apiKey)) {
    return null;
  }

  // Extract service from gb_{service}_{hex} format
  const parts = apiKey.split('_');
  return parts[1] || null;
}

/**
 * API key data for creation
 */
export interface CreateApiKeyData {
  service: string;
  name: string;
  description?: string;
  gameId?: string | null;
  permissions?: string[];
  rateLimit?: number;
  createdBy?: string | null;
  metadata?: Record<string, any>;
}

/**
 * Create a new API key record in the database
 *
 * @param db - Database client
 * @param keyData - API key data
 * @returns Object with plain-text API key and database record
 */
export async function createApiKeyRecord(
  db: DatabaseService,
  keyData: CreateApiKeyData
): Promise<{ apiKey: string; record: ApiKey }> {
  try {
    // Generate the API key
    const apiKey = generateApiKey(keyData.service);

    // Hash it for storage
    const keyHash = await hashApiKey(apiKey);

    // Insert into database
    const { data: record, error } = await db.adminClient
      .from('api_keys')
      .insert({
        key_hash: keyHash,
        service_name: keyData.service,
        game_id: keyData.gameId || null,
        name: keyData.name,
        description: keyData.description || null,
        permissions: keyData.permissions || ['read', 'write'],
        rate_limit: keyData.rateLimit || 1000,
        is_active: true,
        created_by: keyData.createdBy || null,
        metadata: keyData.metadata || {},
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    logger.security('API key record created', {
      service: keyData.service,
      name: keyData.name,
      gameId: keyData.gameId,
    });

    // Return the plain-text key (only time it's available!) and the record
    return {
      apiKey, // IMPORTANT: This is the only time the plain key is available!
      record,
    };
  } catch (error) {
    logger.error('Failed to create API key record', {
      error: (error as Error).message,
      service: keyData.service,
    });
    throw error;
  }
}

/**
 * Validate an API key against the database
 * Uses bcrypt comparison for security
 *
 * @param db - Database client
 * @param apiKey - The API key to validate
 * @returns API key record if valid, null otherwise
 */
export async function validateApiKey(
  db: DatabaseService,
  apiKey: string
): Promise<ApiKey | null> {
  try {
    // Validate format first
    if (!isValidApiKeyFormat(apiKey)) {
      logger.warn('Invalid API key format', {
        keyLength: apiKey?.length || 0,
      });
      return null;
    }

    // Get all active API keys for this service
    const service = extractServiceFromKey(apiKey);
    if (!service) {
      return null;
    }

    const { data: keys, error } = await db.adminClient
      .from('api_keys')
      .select('*')
      .eq('service_name', service)
      .eq('is_active', true);

    if (error || !keys || keys.length === 0) {
      return null;
    }

    // Check each key hash until we find a match
    for (const keyRecord of keys) {
      const isValid = await verifyApiKey(apiKey, keyRecord.key_hash);

      if (isValid) {
        // Update last_used timestamp
        await db.adminClient
          .from('api_keys')
          .update({ last_used: new Date().toISOString() })
          .eq('id', keyRecord.id);

        logger.auth('API key validated', {
          service: keyRecord.service_name,
          keyId: keyRecord.id,
          name: keyRecord.name,
        });

        return keyRecord as ApiKey;
      }
    }

    // No match found
    logger.warn('API key validation failed - no matching hash', {
      service,
    });
    return null;
  } catch (error) {
    logger.error('API key validation error', {
      error: (error as Error).message,
    });
    return null;
  }
}
