/**
 * Unified Error Handling System for GameBuddies
 *
 * Provides consistent error handling across HTTP and Socket.IO interfaces.
 * All errors extend from GameBuddiesError base class.
 */

import constants from '@/config/constants';
import { ErrorResponse, ErrorMiddleware, Logger } from '@/types';
import { Response, NextFunction } from 'express';
import { Socket } from 'socket.io';
import { AuthenticatedRequest } from '@/types';

/**
 * Base error class for GameBuddies
 */
export class GameBuddiesError extends Error {
  code: string;
  statusCode: number;
  details: Record<string, any>;
  timestamp: string;

  /**
   * @param message - Human-readable error message
   * @param code - Machine-readable error code
   * @param statusCode - HTTP status code
   * @param details - Additional error details
   */
  constructor(
    message: string,
    code: string,
    statusCode: number = constants.HTTP_INTERNAL_ERROR,
    details: Record<string, any> = {}
  ) {
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
  toJSON(): ErrorResponse {
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
  toSocketEvent(): { error: string; code: string; timestamp: string; details?: Record<string, any> } {
    return {
      error: this.message,
      code: this.code,
      timestamp: this.timestamp,
      ...(Object.keys(this.details).length > 0 && { details: this.details }),
    };
  }
}

// ===== ROOM ERRORS =====

export class RoomNotFoundError extends GameBuddiesError {
  constructor(roomCode: string) {
    super(
      `Room ${roomCode} not found`,
      constants.ERROR_CODES.ROOM_NOT_FOUND,
      constants.HTTP_NOT_FOUND,
      { roomCode }
    );
  }
}

export class RoomFullError extends GameBuddiesError {
  constructor(roomCode: string, maxPlayers: number) {
    super(
      `Room ${roomCode} is full`,
      constants.ERROR_CODES.ROOM_FULL,
      constants.HTTP_CONFLICT,
      { roomCode, maxPlayers }
    );
  }
}

export class RoomNotAvailableError extends GameBuddiesError {
  constructor(roomCode: string, currentStatus: string, allowedStatuses: string[]) {
    super(
      `Room ${roomCode} is ${currentStatus}`,
      constants.ERROR_CODES.ROOM_NOT_AVAILABLE,
      constants.HTTP_BAD_REQUEST,
      { roomCode, currentStatus, allowedStatuses }
    );
  }
}

export class InvalidRoomCodeError extends GameBuddiesError {
  constructor(roomCode: string) {
    super(
      'Invalid room code format',
      constants.ERROR_CODES.INVALID_ROOM_CODE,
      constants.HTTP_BAD_REQUEST,
      { roomCode, expectedFormat: '6 alphanumeric characters' }
    );
  }
}

// ===== PLAYER ERRORS =====

export class PlayerNotFoundError extends GameBuddiesError {
  constructor(playerId: string) {
    super(
      `Player ${playerId} not found`,
      constants.ERROR_CODES.PLAYER_NOT_FOUND,
      constants.HTTP_NOT_FOUND,
      { playerId }
    );
  }
}

export class InvalidPlayerNameError extends GameBuddiesError {
  constructor(playerName: string, reason: string) {
    super(
      `Invalid player name: ${reason}`,
      constants.ERROR_CODES.INVALID_PLAYER_NAME,
      constants.HTTP_BAD_REQUEST,
      { playerName, reason }
    );
  }
}

// ===== AUTHENTICATION ERRORS =====

export class UnauthorizedError extends GameBuddiesError {
  constructor(message: string = 'Unauthorized') {
    super(
      message,
      constants.ERROR_CODES.UNAUTHORIZED,
      constants.HTTP_UNAUTHORIZED
    );
  }
}

export class ForbiddenError extends GameBuddiesError {
  constructor(message: string = 'Forbidden', action?: string) {
    super(
      message,
      constants.ERROR_CODES.FORBIDDEN,
      constants.HTTP_FORBIDDEN,
      action ? { action } : {}
    );
  }
}

export class ApiKeyRequiredError extends GameBuddiesError {
  constructor() {
    super(
      'API key required',
      constants.ERROR_CODES.API_KEY_REQUIRED,
      constants.HTTP_UNAUTHORIZED
    );
  }
}

export class InvalidApiKeyError extends GameBuddiesError {
  constructor() {
    super(
      'Invalid API key',
      constants.ERROR_CODES.INVALID_API_KEY,
      constants.HTTP_UNAUTHORIZED
    );
  }
}

// ===== VALIDATION ERRORS =====

export class ValidationError extends GameBuddiesError {
  constructor(errors: any[] | string) {
    const errorMessages = Array.isArray(errors)
      ? errors.map((e) => e.message).join(', ')
      : errors;

    super(
      `Validation failed: ${errorMessages}`,
      constants.ERROR_CODES.VALIDATION_ERROR,
      constants.HTTP_BAD_REQUEST,
      { validationErrors: errors }
    );
  }
}

// ===== RATE LIMITING ERRORS =====

export class RateLimitError extends GameBuddiesError {
  constructor(retryAfter: number = 60) {
    super(
      'Too many requests',
      constants.ERROR_CODES.RATE_LIMITED,
      constants.HTTP_TOO_MANY_REQUESTS,
      { retryAfter }
    );
  }
}

// ===== GAME ERRORS =====

export class WrongGameTypeError extends GameBuddiesError {
  constructor(expectedGame: string, actualGame: string) {
    super(
      'Room is for a different game',
      constants.ERROR_CODES.WRONG_GAME_TYPE,
      constants.HTTP_BAD_REQUEST,
      { expectedGame, actualGame }
    );
  }
}

// ===== SERVER ERRORS =====

export class DatabaseError extends GameBuddiesError {
  constructor(message: string, originalError?: Error) {
    super(
      'Database error',
      constants.ERROR_CODES.DATABASE_ERROR,
      constants.HTTP_INTERNAL_ERROR,
      {
        originalMessage: message,
        ...(process.env.NODE_ENV !== 'production' && originalError && {
          stack: originalError.stack,
        }),
      }
    );
  }
}

export class InternalServerError extends GameBuddiesError {
  constructor(message: string = 'Internal server error', originalError?: Error) {
    super(
      message,
      constants.ERROR_CODES.INTERNAL_ERROR,
      constants.HTTP_INTERNAL_ERROR,
      process.env.NODE_ENV !== 'production' && originalError
        ? { stack: originalError.stack }
        : {}
    );
  }
}

// ===== ERROR HANDLER MIDDLEWARE =====

/**
 * Express error handling middleware
 */
export function errorHandler(logger: Logger): ErrorMiddleware {
  return (err: Error, req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    // If response already sent, delegate to default Express error handler
    if (res.headersSent) {
      return next(err);
    }

    // Log the error with context
    const logContext: Record<string, any> = {
      error: err.message,
      code: (err as any).code,
      statusCode: (err as any).statusCode,
      url: req.url,
      method: req.method,
      ip: req.ip,
      ...(req.id && { requestId: req.id }),
      ...((err as any).details && { details: (err as any).details }),
    };

    if (err instanceof GameBuddiesError) {
      // Known error types
      if (err.statusCode >= 500) {
        logger.error('Server error', logContext);
      } else {
        logger.warn('Client error', logContext);
      }

      res.status(err.statusCode).json(err.toJSON());
      return;
    }

    // Unknown error - log with full stack trace
    logger.error('Unexpected error', {
      ...logContext,
      stack: err.stack,
    });

    // Don't expose internal errors in production
    const message =
      process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message;

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
export function handleSocketError(socket: Socket, error: Error, logger: Logger): void {
  const logContext: Record<string, any> = {
    socketId: socket.id,
    error: error.message,
    code: (error as any).code,
    ...((error as any).details && { details: (error as any).details }),
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
    const message =
      process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : error.message;

    socket.emit('error', {
      error: message,
      code: constants.ERROR_CODES.INTERNAL_ERROR,
      timestamp: new Date().toISOString(),
    });
  }
}
