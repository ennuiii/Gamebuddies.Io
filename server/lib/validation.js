// Input validation schemas for GameBuddies
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const { db } = require('./supabase');

// Player name validation
const playerNameSchema = Joi.string()
  .min(1)
  .max(20)
  .pattern(/^[a-zA-Z0-9_\-\s]+$/)
  .trim()
  .messages({
    'string.pattern.base': 'Player name can only contain letters, numbers, spaces, underscores, and hyphens',
    'string.min': 'Player name must be at least 1 character',
    'string.max': 'Player name cannot exceed 20 characters'
  });

// Room code validation
const roomCodeSchema = Joi.string()
  .length(6)
  .uppercase()
  .alphanum()
  .messages({
    'string.length': 'Room code must be exactly 6 characters',
    'string.alphanum': 'Room code must contain only letters and numbers'
  });

// Game type validation - now dynamic from database
// Cache valid game types for 5 minutes to avoid hitting DB on every validation
let validGameTypesCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function getValidGameTypes() {
  const now = Date.now();

  // Return cached values if still fresh
  if (validGameTypesCache && (now - cacheTimestamp) < CACHE_DURATION) {
    return validGameTypesCache;
  }

  try {
    const { data: games, error } = await db.client
      .from('games')
      .select('id')
      .eq('is_active', true)
      .eq('maintenance_mode', false);

    if (error) {
      console.error('[Validation] Error fetching game types:', error);
      // Fallback to last known cache or basic types
      return validGameTypesCache || ['ddf', 'schooled', 'susd', 'bingo', 'lobby'];
    }

    // Update cache
    validGameTypesCache = [...games.map(g => g.id), 'lobby']; // 'lobby' is always valid
    cacheTimestamp = now;

    return validGameTypesCache;
  } catch (err) {
    console.error('[Validation] Unexpected error fetching game types:', err);
    // Fallback to last known cache or basic types
    return validGameTypesCache || ['ddf', 'schooled', 'susd', 'bingo', 'lobby'];
  }
}

// Dynamic game type schema with async validation
const gameTypeSchema = Joi.string()
  .external(async (value) => {
    // Skip validation if value is undefined/null/empty (for optional fields)
    if (!value) {
      return value;
    }

    const validTypes = await getValidGameTypes();
    if (!validTypes.includes(value)) {
      throw new Error('Invalid game type selected');
    }
    return value;
  })
  .messages({
    'any.invalid': 'Invalid game type selected',
    'external': 'Invalid game type selected'
  });

// Validation schemas for different socket events
const schemas = {
  // Create room validation
  createRoom: Joi.object({
    playerName: playerNameSchema.required(),
    gameType: gameTypeSchema.optional(),
    maxPlayers: Joi.number().min(2).max(20).optional(),
    isPublic: Joi.boolean().optional()
  }),

  // Join room validation
  joinRoom: Joi.object({
    playerName: playerNameSchema.required(),
    roomCode: roomCodeSchema.required()
  }),

  // Select game validation
  selectGame: Joi.object({
    roomCode: roomCodeSchema.required(),
    gameType: gameTypeSchema.required()
  }),

  // Start game validation
  startGame: Joi.object({
    roomCode: roomCodeSchema.required(),
    gameSettings: Joi.object().optional()
  }),

  // Transfer host validation
  transferHost: Joi.object({
    roomCode: roomCodeSchema.required(),
    targetPlayerId: Joi.string().uuid().required()
  }),

  // Kick player validation
  kickPlayer: Joi.object({
    roomCode: roomCodeSchema.required(),
    targetPlayerId: Joi.string().uuid().required(),
    reason: Joi.string().max(100).optional()
  }),

  // Change room status validation
  changeRoomStatus: Joi.object({
    roomCode: roomCodeSchema.required(),
    status: Joi.string().valid('lobby', 'selecting_game', 'starting', 'in_game', 'ended').required()
  }),

  // Leave room validation
  leaveRoom: Joi.object({
    roomCode: roomCodeSchema.optional()
  }),

  // Player ready validation
  playerReady: Joi.object({
    roomCode: roomCodeSchema.required(),
    isReady: Joi.boolean().required()
  }),

  // Chat message validation
  sendMessage: Joi.object({
    roomCode: roomCodeSchema.required(),
    message: Joi.string().min(1).max(500).required(),
    type: Joi.string().valid('chat', 'system', 'game').optional()
  }),

  // Return to lobby validation
  returnToLobby: Joi.object({
    roomCode: roomCodeSchema.required(),
    fromGame: gameTypeSchema.optional()
  }),

  // Auto update room status validation
  autoUpdateRoomStatus: Joi.object({
    roomCode: roomCodeSchema.required()
  })
};

// Validation middleware factory (now supports async validation)
function createValidator(schemaName) {
  return async (data) => {
    const schema = schemas[schemaName];
    if (!schema) {
      throw new Error(`No validation schema found for: ${schemaName}`);
    }

    try {
      // Use validateAsync to support external async validators
      const value = await schema.validateAsync(data, {
        abortEarly: false,
        stripUnknown: true
      });

      return {
        isValid: true,
        value
      };
    } catch (error) {
      const errors = error.details ? error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      })) : [{ field: 'unknown', message: error.message }];

      return {
        isValid: false,
        errors,
        message: errors.map(e => e.message).join(', ')
      };
    }
  };
}

// Sanitization helpers
const sanitize = {
  // Sanitize player name
  playerName: (name) => {
    if (!name) return '';
    return name
      .trim()
      .replace(/[^a-zA-Z0-9_\-\s]/g, '')
      .substring(0, 20);
  },

  // Sanitize room code
  roomCode: (code) => {
    if (!code) return '';
    return code
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 6);
  },

  // Sanitize message
  message: (message) => {
    if (!message) return '';
    return message
      .trim()
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .substring(0, 500);
  },

  // Sanitize game settings
  gameSettings: (settings) => {
    if (!settings || typeof settings !== 'object') return {};
    
    // Remove any potentially dangerous keys
    const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
    const cleaned = {};
    
    for (const [key, value] of Object.entries(settings)) {
      if (!dangerousKeys.includes(key) && typeof key === 'string') {
        // Recursively clean nested objects
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          cleaned[key] = sanitize.gameSettings(value);
        } else if (Array.isArray(value)) {
          cleaned[key] = value.map(item => 
            typeof item === 'object' ? sanitize.gameSettings(item) : item
          );
        } else {
          cleaned[key] = value;
        }
      }
    }
    
    return cleaned;
  }
};

// Rate limiting configurations
const rateLimits = {
  createRoom: { max: 5, window: 60000 }, // 5 rooms per minute
  joinRoom: { max: 10, window: 60000 }, // 10 join attempts per minute
  sendMessage: { max: 30, window: 60000 }, // 30 messages per minute
  startGame: { max: 3, window: 60000 }, // 3 game starts per minute
  default: { max: 60, window: 60000 } // 60 requests per minute default
};

const apiRateLimiterConfig = {
  apiCalls: { windowMs: 60 * 1000, max: 120 },
  statusUpdates: { windowMs: 60 * 1000, max: 180 },
  bulkUpdates: { windowMs: 60 * 1000, max: 30 },
  polling: { windowMs: 60 * 1000, max: 60 },
  heartbeats: { windowMs: 60 * 1000, max: 300 }
};

const createRateLimiter = (config = {}) => rateLimit({
  windowMs: config.windowMs ?? config.window ?? 60 * 1000,
  max: config.max ?? 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests',
    code: 'RATE_LIMITED'
  }
});

const apiRateLimiters = Object.fromEntries(
  Object.entries(apiRateLimiterConfig).map(([key, config]) => [key, createRateLimiter(config)])
);

Object.assign(rateLimits, apiRateLimiters);


// Export validation utilities
async function validateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API key required',
      code: 'API_KEY_REQUIRED'
    });
  }

  try {
    const { data: keyRecord, error } = await db.adminClient
      .from('api_keys')
      .select('*')
      .eq('key_hash', apiKey)
      .eq('is_active', true)
      .single();

    if (error || !keyRecord) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key',
        code: 'INVALID_API_KEY'
      });
    }

    req.apiKey = keyRecord;

    const nowIso = new Date().toISOString();

    try {
      await db.adminClient
        .from('api_keys')
        .update({ last_used: nowIso })
        .eq('id', keyRecord.id);
    } catch (updateError) {
      console.warn('[API AUTH] Failed to update API key usage timestamp:', updateError);
    }

    try {
      await db.adminClient
        .from('api_requests')
        .insert({
          api_key_id: keyRecord.id,
          endpoint: req.path,
          method: req.method,
          ip_address: req.ip,
          user_agent: req.get('User-Agent') || '',
          created_at: nowIso
        });
    } catch (logError) {
      console.warn('[API AUTH] Failed to log API request:', logError);
    }

    return next();
  } catch (err) {
    console.error('[API AUTH] API key validation error:', err);
    return res.status(500).json({
      success: false,
      error: 'API key validation failed',
      code: 'API_KEY_VALIDATION_FAILED'
    });
  }
}

// Clear game types cache (useful after adding new games)
function clearGameTypesCache() {
  validGameTypesCache = null;
  cacheTimestamp = 0;
  console.log('[Validation] Game types cache cleared');
}

module.exports = {
  schemas,
  createValidator,
  sanitize,
  validateApiKey,
  rateLimits,
  getValidGameTypes,
  clearGameTypesCache,

  // Convenience validators
  validators: {
    createRoom: createValidator('createRoom'),
    joinRoom: createValidator('joinRoom'),
    selectGame: createValidator('selectGame'),
    startGame: createValidator('startGame'),
    transferHost: createValidator('transferHost'),
    kickPlayer: createValidator('kickPlayer'),
    changeRoomStatus: createValidator('changeRoomStatus'),
    leaveRoom: createValidator('leaveRoom'),
    playerReady: createValidator('playerReady'),
    sendMessage: createValidator('sendMessage'),

    autoUpdateRoomStatus: createValidator('autoUpdateRoomStatus')
  }
};
