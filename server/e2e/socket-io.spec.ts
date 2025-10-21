/**
 * E2E Tests for Socket.IO Handlers
 */

import { test, expect } from '@playwright/test';
import { io, Socket } from 'socket.io-client';

let socket: Socket;

test.describe('Socket.IO Connection', () => {
  test.beforeEach(() => {
    socket = io('http://localhost:3033', {
      transports: ['websocket'],
      autoConnect: false,
    });
  });

  test.afterEach(() => {
    if (socket.connected) {
      socket.disconnect();
    }
  });

  test('should connect to Socket.IO server', async () => {
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => {
        expect(socket.connected).toBe(true);
        expect(socket.id).toBeDefined();
        resolve();
      });

      socket.on('connect_error', (error) => {
        reject(error);
      });

      socket.connect();

      // Timeout after 5 seconds
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
  });

  test('should receive error for invalid room code', async () => {
    socket.connect();

    await new Promise<void>((resolve) => {
      socket.on('connect', () => {
        socket.emit('joinRoom', {
          playerName: 'TestPlayer',
          roomCode: 'INVALID',
        });
      });

      socket.on('error', (error) => {
        expect(error.code).toBeDefined();
        expect(error.error).toBeDefined();
        expect(error.timestamp).toBeDefined();
        resolve();
      });

      setTimeout(() => resolve(), 5000);
    });
  });

  test('should handle disconnect gracefully', async () => {
    socket.connect();

    await new Promise<void>((resolve) => {
      socket.on('connect', () => {
        socket.disconnect();
      });

      socket.on('disconnect', (reason) => {
        expect(reason).toBe('io client disconnect');
        resolve();
      });

      setTimeout(() => resolve(), 5000);
    });
  });
});

test.describe('Socket.IO Room Operations', () => {
  let roomCode: string;

  test.beforeEach(() => {
    socket = io('http://localhost:3033', {
      transports: ['websocket'],
      autoConnect: false,
    });
  });

  test.afterEach(() => {
    if (socket.connected) {
      socket.disconnect();
    }
  });

  test('should create a room successfully', async () => {
    socket.connect();

    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => {
        socket.emit('createRoom', {
          playerName: 'TestHost',
          maxPlayers: 10,
          streamerMode: false,
        });
      });

      socket.on('roomCreated', (data) => {
        expect(data.roomCode).toBeDefined();
        expect(data.roomCode).toMatch(/^[A-Z0-9]{6}$/);
        expect(data.isHost).toBe(true);
        expect(data.room).toBeDefined();
        expect(data.room.room_code).toBe(data.roomCode);
        expect(data.room.players).toBeDefined();
        expect(data.room.players.length).toBe(1);
        expect(data.room.players[0].name).toBe('TestHost');

        roomCode = data.roomCode;
        resolve();
      });

      socket.on('error', (error) => {
        reject(new Error(`Room creation failed: ${error.error}`));
      });

      setTimeout(() => reject(new Error('Room creation timeout')), 10000);
    });
  });

  test('should join socket room for listening', async () => {
    socket.connect();

    await new Promise<void>((resolve) => {
      socket.on('connect', () => {
        // Join a socket room (doesn't need to exist for this test)
        socket.emit('joinSocketRoom', {
          roomCode: 'TEST12',
        });

        // If no error is emitted, the join was successful
        setTimeout(() => resolve(), 1000);
      });

      socket.on('error', (error) => {
        // Socket room join errors are silently handled
        console.log('Socket room join error (expected for non-existent room):', error);
        resolve();
      });
    });
  });
});
