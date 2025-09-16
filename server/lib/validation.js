// Input validation schemas for GameBuddies
const Joi = require('joi');

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

// Game type validation
const gameTypeSchema = Joi.string()
  .valid('ddf', 'schooled', 'susd', 'lobby')
  .messages({
    'any.only': 'Invalid game type selected'
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
  
    fromGame: gameTypeSchema.optional()
  }),

  // Auto update room status validation
  autoUpdateRoomStatus: Joi.object({
    roomCode: roomCodeSchema.required()
  })
};

// Validation middleware factory
function createValidator(schemaName) {
  return (data) => {
    const schema = schemas[schemaName];
    if (!schema) {
      throw new Error(`No validation schema found for: ${schemaName}`);
    }

    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      return {
        isValid: false,
        errors,
        message: errors.map(e => e.message).join(', ')
      };
    }

    return {
      isValid: true,
      value
    };
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

// Export validation utilities
module.exports = {
  schemas,
  createValidator,
  sanitize,
  rateLimits,
  
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