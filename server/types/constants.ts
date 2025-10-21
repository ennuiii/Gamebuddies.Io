/**
 * Type definition for constants
 */

export interface Constants {
  // Request limits
  MAX_REQUEST_SIZE: string;
  MAX_UPLOAD_SIZE: string;
  MAX_JSON_SIZE: string;

  // Connection limits
  MAX_SOCKET_LISTENERS: number;
  PING_TIMEOUT: number;
  PING_INTERVAL: number;
  MAX_HTTP_BUFFER_SIZE: number;

  // Room configuration
  ROOM_CODE_LENGTH: number;
  ROOM_CODE_CHARS: string;
  MIN_PLAYERS: number;
  MAX_PLAYERS: number;
  DEFAULT_MAX_PLAYERS: number;
  ROOM_EXPIRY_HOURS: number;

  // Session configuration
  SESSION_TIMEOUT_MINUTES: number;
  SESSION_TOKEN_LENGTH: number;
  SESSION_EXPIRY_HOURS: number;

  // Player configuration
  MIN_PLAYER_NAME_LENGTH: number;
  MAX_PLAYER_NAME_LENGTH: number;
  PLAYER_NAME_REGEX: RegExp;

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
  CREATE_ROOM_LIMIT: number;
  JOIN_ROOM_LIMIT: number;
  SEND_MESSAGE_LIMIT: number;
  START_GAME_LIMIT: number;
  API_CALLS_LIMIT: number;
  STATUS_UPDATES_LIMIT: number;
  BULK_UPDATES_LIMIT: number;
  POLLING_LIMIT: number;
  HEARTBEATS_LIMIT: number;

  // Timeout configuration
  RECONNECTION_WINDOW: number;
  CONNECTION_LOCK_TIMEOUT: number;
  PROXY_TIMEOUT: number;

  // Cleanup intervals
  CLEANUP_INTERVAL: number;
  STALE_CONNECTION_TIMEOUT: number;
  ROOM_STATE_CACHE_TTL: number;
  PLAYER_SESSION_TTL: number;
  STATUS_QUEUE_TTL: number;

  // Database retention
  STATUS_HISTORY_RETENTION_DAYS: number;
  ROOM_EVENTS_RETENTION_DAYS: number;
  API_REQUESTS_RETENTION_DAYS: number;
  CONNECTION_METRICS_RETENTION_DAYS: number;
  SOFT_DELETE_CLEANUP_DAYS: number;

  // Validation constraints
  ROOM_CODE_REGEX: RegExp;
  MIN_USERNAME_LENGTH: number;
  MAX_USERNAME_LENGTH: number;
  MAX_DISPLAY_NAME_LENGTH: number;
  MAX_MESSAGE_LENGTH: number;
  MAX_METADATA_SIZE: number;
  MAX_NESTED_DEPTH: number;

  // Game configuration
  DEFAULT_GAME_TYPE: string;
  GAME_CACHE_DURATION: number;

  // Logging
  LOG_LEVEL_PRODUCTION: string;
  LOG_LEVEL_DEVELOPMENT: string;
  MAX_LOG_FILE_SIZE: number;
  MAX_LOG_FILES: number;

  // Security
  JWT_MIN_SECRET_LENGTH: number;
  API_KEY_MIN_LENGTH: number;
  BCRYPT_SALT_ROUNDS: number;

  // HTTP status codes
  HTTP_OK: number;
  HTTP_CREATED: number;
  HTTP_BAD_REQUEST: number;
  HTTP_UNAUTHORIZED: number;
  HTTP_FORBIDDEN: number;
  HTTP_NOT_FOUND: number;
  HTTP_CONFLICT: number;
  HTTP_TOO_MANY_REQUESTS: number;
  HTTP_INTERNAL_ERROR: number;
  HTTP_SERVICE_UNAVAILABLE: number;

  // Error codes
  ERROR_CODES: {
    ROOM_NOT_FOUND: string;
    ROOM_FULL: string;
    ROOM_NOT_AVAILABLE: string;
    INVALID_ROOM_CODE: string;
    INVALID_PLAYER_NAME: string;
    PLAYER_NOT_FOUND: string;
    UNAUTHORIZED: string;
    FORBIDDEN: string;
    RATE_LIMITED: string;
    VALIDATION_ERROR: string;
    INTERNAL_ERROR: string;
    DATABASE_ERROR: string;
    API_KEY_REQUIRED: string;
    INVALID_API_KEY: string;
    WRONG_GAME_TYPE: string;
    SERVER_ERROR: string;
  };

  // Room statuses
  ROOM_STATUS: {
    LOBBY: 'lobby';
    IN_GAME: 'in_game';
    RETURNING: 'returning';
    ABANDONED: 'abandoned';
    FINISHED: 'finished';
  };

  // Player locations
  PLAYER_LOCATION: {
    LOBBY: 'lobby';
    GAME: 'game';
    DISCONNECTED: 'disconnected';
  };

  // Player roles
  PLAYER_ROLE: {
    HOST: 'host';
    PLAYER: 'player';
    SPECTATOR: 'spectator';
  };

  // Session statuses
  SESSION_STATUS: {
    ACTIVE: 'active';
    EXPIRED: 'expired';
    REVOKED: 'revoked';
  };
}
