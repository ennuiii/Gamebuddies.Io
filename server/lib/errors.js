/**
 * Unified Error Handling System for GameBuddies
 *
 * Provides consistent error handling across HTTP and Socket.IO interfaces.
 * All errors extend from GameBuddiesError base class.
 */

const constants = require('../config/constants');

/**
 * Base error class for GameBuddies
 */
class GameBuddiesError extends Error {
  /**
   * @param {string} message - Human-readable error message
   * @param {string} code - Machine-readable error code
   * @param {number} statusCode - HTTP status code
   * @param {object} details - Additional error details
   */
  constructor(message, code, statusCode = constants.HTTP_INTERNAL_ERROR, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to JSON response format
   */
  toJSON() {
    return {
      success: false,
      error: this.message,
      code: this.code,
      timestamp: this.timestamp,
      ...(Object.keys(this.details).length > 0 && { details: this.details }),
    };
  }

  /**
   * Convert error to Socket.IO event format
   */
  toSocketEvent() {
    return {
      error: this.message,
      code: this.code,
      timestamp: this.timestamp,
      ...(Object.keys(this.details).length > 0 && { details: this.details }),
    };
  }
}

// ===== ROOM ERRORS =====

class RoomNotFoundError extends GameBuddiesError {
  constructor(roomCode) {
    super(
      `Room ${roomCode} not found`,
      constants.ERROR_CODES.ROOM_NOT_FOUND,
      constants.HTTP_NOT_FOUND,
      { roomCode }
    );
  }
}

class RoomFullError extends GameBuddiesError {
  constructor(roomCode, maxPlayers) {
    super(`Room ${roomCode} is full`, constants.ERROR_CODES.ROOM_FULL, constants.HTTP_CONFLICT, {
      roomCode,
      maxPlayers,
    });
  }
}

class RoomNotAvailableError extends GameBuddiesError {
  constructor(roomCode, currentStatus, allowedStatuses) {
    super(
      `Room ${roomCode} is ${currentStatus}`,
      constants.ERROR_CODES.ROOM_NOT_AVAILABLE,
      constants.HTTP_BAD_REQUEST,
      { roomCode, currentStatus, allowedStatuses }
    );
  }
}

class InvalidRoomCodeError extends GameBuddiesError {
  constructor(roomCode) {
    super(
      'Invalid room code format',
      constants.ERROR_CODES.INVALID_ROOM_CODE,
      constants.HTTP_BAD_REQUEST,
      { roomCode, expectedFormat: '6 alphanumeric characters' }
    );
  }
}

// ===== PLAYER ERRORS =====

class PlayerNotFoundError extends GameBuddiesError {
  constructor(playerId) {
    super(
      `Player ${playerId} not found`,
      constants.ERROR_CODES.PLAYER_NOT_FOUND,
      constants.HTTP_NOT_FOUND,
      { playerId }
    );
  }
}

class InvalidPlayerNameError extends GameBuddiesError {
  constructor(playerName, reason) {
    super(
      `Invalid player name: ${reason}`,
      constants.ERROR_CODES.INVALID_PLAYER_NAME,
      constants.HTTP_BAD_REQUEST,
      { playerName, reason }
    );
  }
}

// ===== AUTHENTICATION ERRORS =====

class UnauthorizedError extends GameBuddiesError {
  constructor(message = 'Unauthorized') {
    super(message, constants.ERROR_CODES.UNAUTHORIZED, constants.HTTP_UNAUTHORIZED);
  }
}

class ForbiddenError extends GameBuddiesError {
  constructor(message = 'Forbidden', action) {
    super(message, constants.ERROR_CODES.FORBIDDEN, constants.HTTP_FORBIDDEN, { action });
  }
}

class ApiKeyRequiredError extends GameBuddiesError {
  constructor() {
    super('API key required', constants.ERROR_CODES.API_KEY_REQUIRED, constants.HTTP_UNAUTHORIZED);
  }
}

class InvalidApiKeyError extends GameBuddiesError {
  constructor() {
    super('Invalid API key', constants.ERROR_CODES.INVALID_API_KEY, constants.HTTP_UNAUTHORIZED);
  }
}

// ===== VALIDATION ERRORS =====

class ValidationError extends GameBuddiesError {
  constructor(errors) {
    const errorMessages = Array.isArray(errors) ? errors.map(e => e.message).join(', ') : errors;

    super(
      `Validation failed: ${errorMessages}`,
      constants.ERROR_CODES.VALIDATION_ERROR,
      constants.HTTP_BAD_REQUEST,
      { validationErrors: errors }
    );
  }
}

// ===== RATE LIMITING ERRORS =====

class RateLimitError extends GameBuddiesError {
  constructor(retryAfter = 60) {
    super(
      'Too many requests',
      constants.ERROR_CODES.RATE_LIMITED,
      constants.HTTP_TOO_MANY_REQUESTS,
      { retryAfter }
    );
  }
}

// ===== GAME ERRORS =====

class WrongGameTypeError extends GameBuddiesError {
  constructor(expectedGame, actualGame) {
    super(
      'Room is for a different game',
      constants.ERROR_CODES.WRONG_GAME_TYPE,
      constants.HTTP_BAD_REQUEST,
      { expectedGame, actualGame }
    );
  }
}

// ===== SERVER ERRORS =====

class DatabaseError extends GameBuddiesError {
  constructor(message, originalError) {
    super('Database error', constants.ERROR_CODES.DATABASE_ERROR, constants.HTTP_INTERNAL_ERROR, {
      originalMessage: message,
      ...(process.env.NODE_ENV !== 'production' && {
        stack: originalError?.stack,
      }),
    });
  }
}

class InternalServerError extends GameBuddiesError {
  constructor(message = 'Internal server error', originalError) {
    super(
      message,
      constants.ERROR_CODES.INTERNAL_ERROR,
      constants.HTTP_INTERNAL_ERROR,
      process.env.NODE_ENV !== 'production' && originalError ? { stack: originalError.stack } : {}
    );
  }
}

// ===== ERROR HANDLER MIDDLEWARE =====

/**
 * Express error handling middleware
 */
function errorHandler(logger) {
  return (err, req, res, next) => {
    // If response already sent, delegate to default Express error handler
    if (res.headersSent) {
      return next(err);
    }

    // Log the error with context
    const logContext = {
      error: err.message,
      code: err.code,
      statusCode: err.statusCode,
      url: req.url,
      method: req.method,
      ip: req.ip,
      ...(req.id && { requestId: req.id }),
      ...(err.details && { details: err.details }),
    };

    if (err instanceof GameBuddiesError) {
      // Known error types
      if (err.statusCode >= 500) {
        logger.error('Server error', logContext);
      } else {
        logger.warn('Client error', logContext);
      }

      return res.status(err.statusCode).json(err.toJSON());
    }

    // Unknown error - log with full stack trace
    logger.error('Unexpected error', {
      ...logContext,
      stack: err.stack,
    });

    // Don't expose internal errors in production
    const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;

    res.status(constants.HTTP_INTERNAL_ERROR).json({
      success: false,
      error: message,
      code: constants.ERROR_CODES.INTERNAL_ERROR,
      timestamp: new Date().toISOString(),
    });
  };
}

/**
 * Socket.IO error handler
 * Emits error event to client
 */
function handleSocketError(socket, error, logger) {
  const logContext = {
    socketId: socket.id,
    error: error.message,
    code: error.code,
    ...(error.details && { details: error.details }),
  };

  if (error instanceof GameBuddiesError) {
    logger.warn('Socket error', logContext);
    socket.emit('error', error.toSocketEvent());
  } else {
    logger.error('Unexpected socket error', {
      ...logContext,
      stack: error.stack,
    });

    // Don't expose internal errors
    const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message;

    socket.emit('error', {
      error: message,
      code: constants.ERROR_CODES.INTERNAL_ERROR,
      timestamp: new Date().toISOString(),
    });
  }
}

// Export all error classes
module.exports = {
  GameBuddiesError,
  RoomNotFoundError,
  RoomFullError,
  RoomNotAvailableError,
  InvalidRoomCodeError,
  PlayerNotFoundError,
  InvalidPlayerNameError,
  UnauthorizedError,
  ForbiddenError,
  ApiKeyRequiredError,
  InvalidApiKeyError,
  ValidationError,
  RateLimitError,
  WrongGameTypeError,
  DatabaseError,
  InternalServerError,
  errorHandler,
  handleSocketError,
};
