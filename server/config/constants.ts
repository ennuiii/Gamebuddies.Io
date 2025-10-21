/**
 * GameBuddies Configuration Constants
 *
 * Centralized configuration to avoid magic numbers and strings throughout the codebase.
 * All time values are in milliseconds unless otherwise specified.
 */

import type { Constants } from '../types';

const constants: Constants = {
  // ===== REQUEST LIMITS =====
  MAX_REQUEST_SIZE: '100kb',           // Default max request body size
  MAX_UPLOAD_SIZE: '1mb',              // Max upload size for specific routes
  MAX_JSON_SIZE: '100kb',              // Max JSON payload size

  // ===== CONNECTION LIMITS =====
  MAX_SOCKET_LISTENERS: 50,            // Max event listeners per socket
  PING_TIMEOUT: 60000,                 // 60 seconds - socket.io ping timeout
  PING_INTERVAL: 25000,                // 25 seconds - socket.io ping interval
  MAX_HTTP_BUFFER_SIZE: 1000000,       // 1MB - max WebSocket message size

  // ===== ROOM CONFIGURATION =====
  ROOM_CODE_LENGTH: 6,                 // Length of room codes (e.g., ABC123)
  ROOM_CODE_CHARS: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', // Excluded confusing chars: I, O, 0, 1
  MIN_PLAYERS: 2,                      // Minimum players per room
  MAX_PLAYERS: 50,                     // Maximum players per room
  DEFAULT_MAX_PLAYERS: 10,             // Default max players if not specified
  ROOM_EXPIRY_HOURS: 24,               // Hours before inactive rooms are cleaned up

  // ===== SESSION CONFIGURATION =====
  SESSION_TIMEOUT_MINUTES: 30,         // Minutes before session expires
  SESSION_TOKEN_LENGTH: 64,            // Length of session tokens (in chars)
  SESSION_EXPIRY_HOURS: 24,            // Hours before session token expires

  // ===== PLAYER CONFIGURATION =====
  MIN_PLAYER_NAME_LENGTH: 1,           // Minimum player name length
  MAX_PLAYER_NAME_LENGTH: 20,          // Maximum player name length
  PLAYER_NAME_REGEX: /^[a-zA-Z0-9_\-\s]+$/, // Allowed characters in player names

  // ===== RATE LIMITING =====
  RATE_LIMIT_WINDOW_MS: 60000,         // 1 minute - rate limit window
  RATE_LIMIT_MAX_REQUESTS: 100,        // Default max requests per window

  // Specific rate limits per action
  CREATE_ROOM_LIMIT: 5,                // Max room creations per minute
  JOIN_ROOM_LIMIT: 10,                 // Max room joins per minute
  SEND_MESSAGE_LIMIT: 30,              // Max messages per minute
  START_GAME_LIMIT: 3,                 // Max game starts per minute

  // API rate limits
  API_CALLS_LIMIT: 120,                // Max API calls per minute
  STATUS_UPDATES_LIMIT: 180,           // Max status updates per minute
  BULK_UPDATES_LIMIT: 30,              // Max bulk updates per minute
  POLLING_LIMIT: 60,                   // Max polling requests per minute
  HEARTBEATS_LIMIT: 300,               // Max heartbeats per minute

  // ===== TIMEOUT CONFIGURATION =====
  RECONNECTION_WINDOW: 10000,          // 10 seconds - time to reconnect before considered disconnected
  CONNECTION_LOCK_TIMEOUT: 5000,       // 5 seconds - timeout for connection locks
  PROXY_TIMEOUT: 15000,                // 15 seconds - proxy request timeout

  // ===== CLEANUP INTERVALS =====
  CLEANUP_INTERVAL: 300000,            // 5 minutes - interval for cleanup tasks
  STALE_CONNECTION_TIMEOUT: 300000,    // 5 minutes - timeout for stale connections
  ROOM_STATE_CACHE_TTL: 3600000,       // 1 hour - time to keep room state in cache
  PLAYER_SESSION_TTL: 1800000,         // 30 minutes - player session cache TTL
  STATUS_QUEUE_TTL: 60000,             // 1 minute - status queue entry TTL

  // ===== DATABASE RETENTION =====
  STATUS_HISTORY_RETENTION_DAYS: 90,   // Days to keep player status history
  ROOM_EVENTS_RETENTION_DAYS: 90,      // Days to keep room events
  API_REQUESTS_RETENTION_DAYS: 30,     // Days to keep API request logs
  CONNECTION_METRICS_RETENTION_DAYS: 7, // Days to keep connection metrics
  SOFT_DELETE_CLEANUP_DAYS: 90,        // Days before permanently deleting soft-deleted records

  // ===== VALIDATION CONSTRAINTS =====
  ROOM_CODE_REGEX: /^[A-Z0-9]{6}$/,    // Room code format validation
  MIN_USERNAME_LENGTH: 3,              // Minimum username length
  MAX_USERNAME_LENGTH: 50,             // Maximum username length
  MAX_DISPLAY_NAME_LENGTH: 100,        // Maximum display name length
  MAX_MESSAGE_LENGTH: 500,             // Maximum chat message length
  MAX_METADATA_SIZE: 10000,            // Maximum JSONB metadata size (chars)
  MAX_NESTED_DEPTH: 5,                 // Maximum nesting depth for JSONB objects

  // ===== GAME CONFIGURATION =====
  DEFAULT_GAME_TYPE: 'lobby',          // Default game type for new rooms
  GAME_CACHE_DURATION: 300000,         // 5 minutes - cache duration for game types

  // ===== LOGGING =====
  LOG_LEVEL_PRODUCTION: 'info',        // Log level in production
  LOG_LEVEL_DEVELOPMENT: 'debug',      // Log level in development
  MAX_LOG_FILE_SIZE: 10485760,         // 10MB - max log file size before rotation
  MAX_LOG_FILES: 5,                    // Number of log files to keep

  // ===== SECURITY =====
  JWT_MIN_SECRET_LENGTH: 32,           // Minimum length for JWT secret
  API_KEY_MIN_LENGTH: 20,              // Minimum length for API keys
  BCRYPT_SALT_ROUNDS: 12,              // Bcrypt salt rounds for hashing

  // ===== HTTP STATUS CODES =====
  HTTP_OK: 200,
  HTTP_CREATED: 201,
  HTTP_BAD_REQUEST: 400,
  HTTP_UNAUTHORIZED: 401,
  HTTP_FORBIDDEN: 403,
  HTTP_NOT_FOUND: 404,
  HTTP_CONFLICT: 409,
  HTTP_TOO_MANY_REQUESTS: 429,
  HTTP_INTERNAL_ERROR: 500,
  HTTP_SERVICE_UNAVAILABLE: 503,

  // ===== ERROR CODES =====
  ERROR_CODES: {
    ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
    ROOM_FULL: 'ROOM_FULL',
    ROOM_NOT_AVAILABLE: 'ROOM_NOT_AVAILABLE',
    INVALID_ROOM_CODE: 'INVALID_ROOM_CODE',
    INVALID_PLAYER_NAME: 'INVALID_PLAYER_NAME',
    PLAYER_NOT_FOUND: 'PLAYER_NOT_FOUND',
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    RATE_LIMITED: 'RATE_LIMITED',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    DATABASE_ERROR: 'DATABASE_ERROR',
    API_KEY_REQUIRED: 'API_KEY_REQUIRED',
    INVALID_API_KEY: 'INVALID_API_KEY',
    WRONG_GAME_TYPE: 'WRONG_GAME_TYPE',
    SERVER_ERROR: 'SERVER_ERROR',
  },

  // ===== ROOM STATUSES =====
  ROOM_STATUS: {
    LOBBY: 'lobby',
    IN_GAME: 'in_game',
    RETURNING: 'returning',
    ABANDONED: 'abandoned',
    FINISHED: 'finished',
  },

  // ===== PLAYER LOCATIONS =====
  PLAYER_LOCATION: {
    LOBBY: 'lobby',
    GAME: 'game',
    DISCONNECTED: 'disconnected',
  },

  // ===== PLAYER ROLES =====
  PLAYER_ROLE: {
    HOST: 'host',
    PLAYER: 'player',
    SPECTATOR: 'spectator',
  },

  // ===== SESSION STATUSES =====
  SESSION_STATUS: {
    ACTIVE: 'active',
    EXPIRED: 'expired',
    REVOKED: 'revoked',
  },
};

export default constants;
