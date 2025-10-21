/**
 * Tests for Error Handling System
 */

import {
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
} from '../../lib/errors';

describe('GameBuddiesError', () => {
  it('should create error with message, code, and status', () => {
    const error = new GameBuddiesError('Test error', 'TEST_ERROR', 400, { detail: 'test' });

    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_ERROR');
    expect(error.statusCode).toBe(400);
    expect(error.details).toEqual({ detail: 'test' });
    expect(error.timestamp).toBeDefined();
  });

  it('should convert to JSON format', () => {
    const error = new GameBuddiesError('Test error', 'TEST_ERROR', 400, { detail: 'test' });
    const json = error.toJSON();

    expect(json).toEqual({
      success: false,
      error: 'Test error',
      code: 'TEST_ERROR',
      timestamp: error.timestamp,
      details: { detail: 'test' },
    });
  });

  it('should convert to Socket.IO event format', () => {
    const error = new GameBuddiesError('Test error', 'TEST_ERROR', 400, { detail: 'test' });
    const socketEvent = error.toSocketEvent();

    expect(socketEvent).toEqual({
      error: 'Test error',
      code: 'TEST_ERROR',
      timestamp: error.timestamp,
      details: { detail: 'test' },
    });
  });
});

describe('Room Errors', () => {
  describe('RoomNotFoundError', () => {
    it('should create room not found error', () => {
      const error = new RoomNotFoundError('ABC123');

      expect(error.message).toBe('Room ABC123 not found');
      expect(error.code).toBe('ROOM_NOT_FOUND');
      expect(error.statusCode).toBe(404);
      expect(error.details).toEqual({ roomCode: 'ABC123' });
    });
  });

  describe('RoomFullError', () => {
    it('should create room full error', () => {
      const error = new RoomFullError('ABC123', 10);

      expect(error.message).toBe('Room ABC123 is full');
      expect(error.code).toBe('ROOM_FULL');
      expect(error.statusCode).toBe(409);
      expect(error.details).toEqual({ roomCode: 'ABC123', maxPlayers: 10 });
    });
  });

  describe('RoomNotAvailableError', () => {
    it('should create room not available error', () => {
      const error = new RoomNotAvailableError('ABC123', 'in_game', ['lobby']);

      expect(error.message).toBe('Room ABC123 is in_game');
      expect(error.code).toBe('ROOM_NOT_AVAILABLE');
      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual({
        roomCode: 'ABC123',
        currentStatus: 'in_game',
        allowedStatuses: ['lobby'],
      });
    });
  });

  describe('InvalidRoomCodeError', () => {
    it('should create invalid room code error', () => {
      const error = new InvalidRoomCodeError('XYZ');

      expect(error.message).toBe('Invalid room code format');
      expect(error.code).toBe('INVALID_ROOM_CODE');
      expect(error.statusCode).toBe(400);
      expect(error.details.roomCode).toBe('XYZ');
    });
  });
});

describe('Player Errors', () => {
  describe('PlayerNotFoundError', () => {
    it('should create player not found error', () => {
      const error = new PlayerNotFoundError('player123');

      expect(error.message).toBe('Player player123 not found');
      expect(error.code).toBe('PLAYER_NOT_FOUND');
      expect(error.statusCode).toBe(404);
    });
  });

  describe('InvalidPlayerNameError', () => {
    it('should create invalid player name error', () => {
      const error = new InvalidPlayerNameError('Test@Player', 'Contains invalid characters');

      expect(error.message).toBe('Invalid player name: Contains invalid characters');
      expect(error.code).toBe('INVALID_PLAYER_NAME');
      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual({
        playerName: 'Test@Player',
        reason: 'Contains invalid characters',
      });
    });
  });
});

describe('Authentication Errors', () => {
  describe('UnauthorizedError', () => {
    it('should create unauthorized error with default message', () => {
      const error = new UnauthorizedError();

      expect(error.message).toBe('Unauthorized');
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.statusCode).toBe(401);
    });

    it('should create unauthorized error with custom message', () => {
      const error = new UnauthorizedError('Custom unauthorized message');

      expect(error.message).toBe('Custom unauthorized message');
    });
  });

  describe('ForbiddenError', () => {
    it('should create forbidden error', () => {
      const error = new ForbiddenError('Not allowed', 'delete_room');

      expect(error.message).toBe('Not allowed');
      expect(error.code).toBe('FORBIDDEN');
      expect(error.statusCode).toBe(403);
      expect(error.details).toEqual({ action: 'delete_room' });
    });
  });

  describe('ApiKeyRequiredError', () => {
    it('should create API key required error', () => {
      const error = new ApiKeyRequiredError();

      expect(error.message).toBe('API key required');
      expect(error.code).toBe('API_KEY_REQUIRED');
      expect(error.statusCode).toBe(401);
    });
  });

  describe('InvalidApiKeyError', () => {
    it('should create invalid API key error', () => {
      const error = new InvalidApiKeyError();

      expect(error.message).toBe('Invalid API key');
      expect(error.code).toBe('INVALID_API_KEY');
      expect(error.statusCode).toBe(401);
    });
  });
});

describe('Validation Errors', () => {
  describe('ValidationError', () => {
    it('should create validation error from string', () => {
      const error = new ValidationError('Field is required');

      expect(error.message).toBe('Validation failed: Field is required');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
    });

    it('should create validation error from array of errors', () => {
      const errors = [
        { message: 'Name is required' },
        { message: 'Email is invalid' },
      ];
      const error = new ValidationError(errors);

      expect(error.message).toBe('Validation failed: Name is required, Email is invalid');
      expect(error.details.validationErrors).toEqual(errors);
    });
  });
});

describe('Rate Limiting Errors', () => {
  describe('RateLimitError', () => {
    it('should create rate limit error with default retry time', () => {
      const error = new RateLimitError();

      expect(error.message).toBe('Too many requests');
      expect(error.code).toBe('RATE_LIMITED');
      expect(error.statusCode).toBe(429);
      expect(error.details).toEqual({ retryAfter: 60 });
    });

    it('should create rate limit error with custom retry time', () => {
      const error = new RateLimitError(120);

      expect(error.details).toEqual({ retryAfter: 120 });
    });
  });
});

describe('Game Errors', () => {
  describe('WrongGameTypeError', () => {
    it('should create wrong game type error', () => {
      const error = new WrongGameTypeError('ddf', 'schooled');

      expect(error.message).toBe('Room is for a different game');
      expect(error.code).toBe('WRONG_GAME_TYPE');
      expect(error.statusCode).toBe(400);
      expect(error.details).toEqual({
        expectedGame: 'ddf',
        actualGame: 'schooled',
      });
    });
  });
});

describe('Server Errors', () => {
  describe('DatabaseError', () => {
    it('should create database error', () => {
      const error = new DatabaseError('Connection failed');

      expect(error.message).toBe('Database error');
      expect(error.code).toBe('DATABASE_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.details.originalMessage).toBe('Connection failed');
    });

    it('should include stack in non-production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const originalError = new Error('Original error');
      const error = new DatabaseError('Connection failed', originalError);

      expect(error.details.stack).toBeDefined();

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('InternalServerError', () => {
    it('should create internal server error', () => {
      const error = new InternalServerError();

      expect(error.message).toBe('Internal server error');
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.statusCode).toBe(500);
    });

    it('should accept custom message', () => {
      const error = new InternalServerError('Custom error message');

      expect(error.message).toBe('Custom error message');
    });
  });
});
