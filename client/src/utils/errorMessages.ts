/**
 * Centralized error message definitions for consistent user-facing error handling.
 * Maps error codes to user-friendly messages with optional actions.
 */

export interface ErrorMessage {
  /** Short title for the error */
  title: string;
  /** Detailed user-friendly message */
  message: string;
  /** Suggested action the user can take */
  action?: string;
  /** Whether this is a recoverable error */
  recoverable?: boolean;
}

/**
 * Socket/Room related error codes
 */
export const SOCKET_ERROR_CODES = {
  // Room errors
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_FULL: 'ROOM_FULL',
  ROOM_NOT_ACCEPTING: 'ROOM_NOT_ACCEPTING',
  ROOM_CLOSED: 'ROOM_CLOSED',
  ROOM_CREATION_FAILED: 'ROOM_CREATION_FAILED',

  // Player errors
  DUPLICATE_PLAYER: 'DUPLICATE_PLAYER',
  DUPLICATE_PLAYER_NAME: 'DUPLICATE_PLAYER_NAME',
  PLAYER_NOT_FOUND: 'PLAYER_NOT_FOUND',
  NOT_HOST: 'NOT_HOST',
  ALREADY_IN_ROOM: 'ALREADY_IN_ROOM',

  // Connection errors
  CONNECTION_TIMEOUT: 'CONNECTION_TIMEOUT',
  CONNECTION_LOST: 'CONNECTION_LOST',
  RECONNECTION_FAILED: 'RECONNECTION_FAILED',
  SERVER_UNAVAILABLE: 'SERVER_UNAVAILABLE',

  // Game errors
  GAME_NOT_SELECTED: 'GAME_NOT_SELECTED',
  GAME_START_FAILED: 'GAME_START_FAILED',
  PLAYERS_NOT_READY: 'PLAYERS_NOT_READY',

  // Auth errors
  UNAUTHORIZED: 'UNAUTHORIZED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',

  // Generic
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
} as const;

export type ErrorCode = (typeof SOCKET_ERROR_CODES)[keyof typeof SOCKET_ERROR_CODES];

/**
 * Error message mappings
 */
export const ERROR_MESSAGES: Record<ErrorCode, ErrorMessage> = {
  // Room errors
  [SOCKET_ERROR_CODES.ROOM_NOT_FOUND]: {
    title: 'Room Not Found',
    message: 'This room may have expired or been closed by the host.',
    action: 'Browse public rooms or create a new one.',
    recoverable: true,
  },
  [SOCKET_ERROR_CODES.ROOM_FULL]: {
    title: 'Room Full',
    message: 'This room has reached its maximum player capacity.',
    action: 'Try joining a different room or create your own.',
    recoverable: true,
  },
  [SOCKET_ERROR_CODES.ROOM_NOT_ACCEPTING]: {
    title: 'Room Closed',
    message: 'This room is no longer accepting new players.',
    action: 'The game may have already started. Try a different room.',
    recoverable: true,
  },
  [SOCKET_ERROR_CODES.ROOM_CLOSED]: {
    title: 'Room Closed',
    message: 'This room has been closed by the host.',
    action: 'Create a new room or join another one.',
    recoverable: true,
  },
  [SOCKET_ERROR_CODES.ROOM_CREATION_FAILED]: {
    title: 'Failed to Create Room',
    message: 'We couldn\'t create your room. Please try again.',
    action: 'Check your connection and try again.',
    recoverable: true,
  },

  // Player errors
  [SOCKET_ERROR_CODES.DUPLICATE_PLAYER]: {
    title: 'Name Already Taken',
    message: 'A player with this name is already in the room.',
    action: 'Choose a different display name.',
    recoverable: true,
  },
  [SOCKET_ERROR_CODES.DUPLICATE_PLAYER_NAME]: {
    title: 'Name Already Taken',
    message: 'This name is already in use in this room.',
    action: 'Please choose a different name to join.',
    recoverable: true,
  },
  [SOCKET_ERROR_CODES.PLAYER_NOT_FOUND]: {
    title: 'Player Not Found',
    message: 'Could not find player information.',
    action: 'Try rejoining the room.',
    recoverable: true,
  },
  [SOCKET_ERROR_CODES.NOT_HOST]: {
    title: 'Permission Denied',
    message: 'Only the room host can perform this action.',
    recoverable: false,
  },
  [SOCKET_ERROR_CODES.ALREADY_IN_ROOM]: {
    title: 'Already in Room',
    message: 'You\'re already in this room on another device or tab.',
    action: 'Close other tabs or wait a moment before trying again.',
    recoverable: true,
  },

  // Connection errors
  [SOCKET_ERROR_CODES.CONNECTION_TIMEOUT]: {
    title: 'Connection Timeout',
    message: 'The server took too long to respond.',
    action: 'Check your internet connection and try again.',
    recoverable: true,
  },
  [SOCKET_ERROR_CODES.CONNECTION_LOST]: {
    title: 'Connection Lost',
    message: 'Lost connection to the server.',
    action: 'We\'re trying to reconnect automatically.',
    recoverable: true,
  },
  [SOCKET_ERROR_CODES.RECONNECTION_FAILED]: {
    title: 'Reconnection Failed',
    message: 'Unable to reconnect to the server after multiple attempts.',
    action: 'Click retry or refresh the page.',
    recoverable: true,
  },
  [SOCKET_ERROR_CODES.SERVER_UNAVAILABLE]: {
    title: 'Server Unavailable',
    message: 'The game server is currently unavailable.',
    action: 'Please try again in a few minutes.',
    recoverable: true,
  },

  // Game errors
  [SOCKET_ERROR_CODES.GAME_NOT_SELECTED]: {
    title: 'No Game Selected',
    message: 'Please select a game before starting.',
    recoverable: false,
  },
  [SOCKET_ERROR_CODES.GAME_START_FAILED]: {
    title: 'Failed to Start Game',
    message: 'Something went wrong while starting the game.',
    action: 'Try selecting a different game or restart the room.',
    recoverable: true,
  },
  [SOCKET_ERROR_CODES.PLAYERS_NOT_READY]: {
    title: 'Players Not Ready',
    message: 'All players must be ready before starting.',
    action: 'Wait for everyone to click the Ready button.',
    recoverable: false,
  },

  // Auth errors
  [SOCKET_ERROR_CODES.UNAUTHORIZED]: {
    title: 'Unauthorized',
    message: 'You need to be logged in to perform this action.',
    action: 'Please log in and try again.',
    recoverable: true,
  },
  [SOCKET_ERROR_CODES.SESSION_EXPIRED]: {
    title: 'Session Expired',
    message: 'Your session has expired.',
    action: 'Please log in again.',
    recoverable: true,
  },

  // Generic
  [SOCKET_ERROR_CODES.UNKNOWN_ERROR]: {
    title: 'Something Went Wrong',
    message: 'An unexpected error occurred.',
    action: 'Please try again or refresh the page.',
    recoverable: true,
  },
  [SOCKET_ERROR_CODES.RATE_LIMITED]: {
    title: 'Slow Down',
    message: 'You\'re doing that too quickly.',
    action: 'Please wait a moment before trying again.',
    recoverable: true,
  },
};

/**
 * Get error message by code
 */
export function getErrorMessage(code: string | ErrorCode): ErrorMessage {
  return ERROR_MESSAGES[code as ErrorCode] || ERROR_MESSAGES[SOCKET_ERROR_CODES.UNKNOWN_ERROR];
}

/**
 * Get user-friendly error string from error code
 */
export function getErrorString(code: string | ErrorCode): string {
  const error = getErrorMessage(code);
  return error.action ? `${error.message} ${error.action}` : error.message;
}

/**
 * Parse error from various sources (socket error, API response, etc.)
 */
export function parseError(error: unknown): ErrorMessage {
  if (typeof error === 'string') {
    return ERROR_MESSAGES[error as ErrorCode] || {
      title: 'Error',
      message: error,
      recoverable: true,
    };
  }

  if (error && typeof error === 'object') {
    const err = error as { code?: string; message?: string };
    if (err.code && ERROR_MESSAGES[err.code as ErrorCode]) {
      return ERROR_MESSAGES[err.code as ErrorCode];
    }
    if (err.message) {
      return {
        title: 'Error',
        message: err.message,
        recoverable: true,
      };
    }
  }

  return ERROR_MESSAGES[SOCKET_ERROR_CODES.UNKNOWN_ERROR];
}
