/**
 * Comprehensive E2E Tests for Socket.IO Handlers
 * Tests real user workflows: lobby creation, streamer mode, game selection, etc.
 */

import { test, expect } from '@playwright/test';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3033';
const SOCKET_OPTIONS = {
  transports: ['websocket'],
  autoConnect: false,
};

// Helper function to wait for socket event
function waitForEvent<T>(socket: Socket, event: string, timeout = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for event: ${event}`));
    }, timeout);

    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

// Helper function to connect socket
async function connectSocket(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.on('connect', () => resolve());
    socket.on('connect_error', (error) => reject(error));
    socket.connect();
    setTimeout(() => reject(new Error('Connection timeout')), 5000);
  });
}

test.describe('Socket.IO Connection', () => {
  let socket: Socket;

  test.beforeEach(() => {
    socket = io(SERVER_URL, SOCKET_OPTIONS);
  });

  test.afterEach(() => {
    if (socket.connected) {
      socket.disconnect();
    }
  });

  test('should connect to Socket.IO server', async () => {
    await connectSocket(socket);
    expect(socket.connected).toBe(true);
    expect(socket.id).toBeDefined();
  });

  test('should handle disconnect gracefully', async () => {
    await connectSocket(socket);

    const disconnectPromise = waitForEvent(socket, 'disconnect');
    socket.disconnect();

    const reason = await disconnectPromise;
    expect(reason).toBe('io client disconnect');
  });
});

test.describe('Lobby Creation', () => {
  let socket: Socket;

  test.beforeEach(() => {
    socket = io(SERVER_URL, SOCKET_OPTIONS);
  });

  test.afterEach(() => {
    if (socket.connected) {
      socket.disconnect();
    }
  });

  test('should create a basic lobby successfully', async () => {
    await connectSocket(socket);

    socket.emit('createRoom', {
      playerName: 'TestHost',
      maxPlayers: 10,
      streamerMode: false,
    });

    const data = await waitForEvent<any>(socket, 'roomCreated');

    expect(data.roomCode).toBeDefined();
    expect(data.roomCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(data.isHost).toBe(true);
    expect(data.room).toBeDefined();
    expect(data.room.room_code).toBe(data.roomCode);
    expect(data.room.max_players).toBe(10);
    expect(data.room.players).toBeDefined();
    expect(data.room.players.length).toBe(1);
    expect(data.room.players[0].name).toBe('TestHost');
    expect(data.room.players[0].is_host).toBe(true);
  });

  test('should create a public lobby', async () => {
    await connectSocket(socket);

    socket.emit('createRoom', {
      playerName: 'PublicHost',
      maxPlayers: 8,
      isPublic: true,
      streamerMode: false,
    });

    const data = await waitForEvent<any>(socket, 'roomCreated');

    expect(data.room.is_public).toBe(true);
    expect(data.room.max_players).toBe(8);
  });

  test('should create a private lobby', async () => {
    await connectSocket(socket);

    socket.emit('createRoom', {
      playerName: 'PrivateHost',
      maxPlayers: 4,
      isPublic: false,
      streamerMode: false,
    });

    const data = await waitForEvent<any>(socket, 'roomCreated');

    expect(data.room.is_public).toBe(false);
    expect(data.room.max_players).toBe(4);
  });

  test('should create lobby with custom max players', async () => {
    await connectSocket(socket);

    socket.emit('createRoom', {
      playerName: 'CustomHost',
      maxPlayers: 20,
      streamerMode: false,
    });

    const data = await waitForEvent<any>(socket, 'roomCreated');

    expect(data.room.max_players).toBe(20);
  });
});

test.describe('Streamer Mode', () => {
  let socket: Socket;

  test.beforeEach(() => {
    socket = io(SERVER_URL, SOCKET_OPTIONS);
  });

  test.afterEach(() => {
    if (socket.connected) {
      socket.disconnect();
    }
  });

  test('should create lobby with streamer mode enabled', async () => {
    await connectSocket(socket);

    socket.emit('createRoom', {
      playerName: 'StreamerHost',
      maxPlayers: 10,
      streamerMode: true,
    });

    const data = await waitForEvent<any>(socket, 'roomCreated');

    expect(data.room.streamer_mode).toBe(true);
    expect(data.isHost).toBe(true);
  });

  test('should create lobby with streamer mode disabled', async () => {
    await connectSocket(socket);

    socket.emit('createRoom', {
      playerName: 'NormalHost',
      maxPlayers: 10,
      streamerMode: false,
    });

    const data = await waitForEvent<any>(socket, 'roomCreated');

    expect(data.room.streamer_mode).toBe(false);
  });
});

test.describe('Game Selection', () => {
  let hostSocket: Socket;
  let roomCode: string;

  test.beforeEach(async () => {
    hostSocket = io(SERVER_URL, SOCKET_OPTIONS);
    await connectSocket(hostSocket);

    // Create a room first
    hostSocket.emit('createRoom', {
      playerName: 'GameHost',
      maxPlayers: 10,
      streamerMode: false,
    });

    const data = await waitForEvent<any>(hostSocket, 'roomCreated');
    roomCode = data.roomCode;
  });

  test.afterEach(() => {
    if (hostSocket.connected) {
      hostSocket.disconnect();
    }
  });

  test('should select a game for the room', async () => {
    hostSocket.emit('selectGame', {
      roomCode,
      gameType: 'skribbl',
    });

    const data = await waitForEvent<any>(hostSocket, 'gameSelected', 10000);

    expect(data.gameType).toBe('skribbl');
    expect(data.roomCode).toBe(roomCode);
  });

  test('should handle multiple game type selections', async () => {
    const gameTypes = ['skribbl', 'gartic', 'geoguessr'];

    for (const gameType of gameTypes) {
      hostSocket.emit('selectGame', {
        roomCode,
        gameType,
      });

      const data = await waitForEvent<any>(hostSocket, 'gameSelected', 10000);
      expect(data.gameType).toBe(gameType);
    }
  });

  test('should start game after selection', async () => {
    // Select a game
    hostSocket.emit('selectGame', {
      roomCode,
      gameType: 'skribbl',
    });

    await waitForEvent<any>(hostSocket, 'gameSelected', 10000);

    // Start the game
    hostSocket.emit('startGame', {
      roomCode,
    });

    const startData = await waitForEvent<any>(hostSocket, 'gameStarted', 10000);

    expect(startData.roomCode).toBe(roomCode);
    expect(startData.gameUrl).toBeDefined();
  });
});

test.describe('Player Join and Leave', () => {
  let hostSocket: Socket;
  let playerSocket: Socket;
  let roomCode: string;

  test.beforeEach(async () => {
    hostSocket = io(SERVER_URL, SOCKET_OPTIONS);
    await connectSocket(hostSocket);

    // Create a room
    hostSocket.emit('createRoom', {
      playerName: 'RoomHost',
      maxPlayers: 10,
      streamerMode: false,
    });

    const data = await waitForEvent<any>(hostSocket, 'roomCreated');
    roomCode = data.roomCode;
  });

  test.afterEach(() => {
    if (hostSocket.connected) {
      hostSocket.disconnect();
    }
    if (playerSocket?.connected) {
      playerSocket.disconnect();
    }
  });

  test('should allow player to join room', async () => {
    playerSocket = io(SERVER_URL, SOCKET_OPTIONS);
    await connectSocket(playerSocket);

    // Listen for room updates on host socket
    const hostUpdatePromise = waitForEvent<any>(hostSocket, 'roomUpdated');

    // Player joins
    playerSocket.emit('joinRoom', {
      playerName: 'Player1',
      roomCode,
    });

    const joinData = await waitForEvent<any>(playerSocket, 'roomJoined');

    expect(joinData.roomCode).toBe(roomCode);
    expect(joinData.isHost).toBe(false);
    expect(joinData.room.players.length).toBe(2);
    expect(joinData.room.players[1].name).toBe('Player1');

    // Host should receive update
    const hostUpdate = await hostUpdatePromise;
    expect(hostUpdate.room.players.length).toBe(2);
  });

  test('should allow multiple players to join', async () => {
    const players: Socket[] = [];

    for (let i = 1; i <= 3; i++) {
      const player = io(SERVER_URL, SOCKET_OPTIONS);
      await connectSocket(player);

      player.emit('joinRoom', {
        playerName: `Player${i}`,
        roomCode,
      });

      const joinData = await waitForEvent<any>(player, 'roomJoined');
      expect(joinData.room.players.length).toBe(i + 1); // +1 for host

      players.push(player);
    }

    // Cleanup
    players.forEach(p => p.disconnect());
  });

  test('should allow player to leave room', async () => {
    playerSocket = io(SERVER_URL, SOCKET_OPTIONS);
    await connectSocket(playerSocket);

    // Player joins
    playerSocket.emit('joinRoom', {
      playerName: 'LeavingPlayer',
      roomCode,
    });

    await waitForEvent<any>(playerSocket, 'roomJoined');

    // Player leaves
    const hostUpdatePromise = waitForEvent<any>(hostSocket, 'roomUpdated');

    playerSocket.emit('leaveRoom', {
      roomCode,
    });

    await waitForEvent<any>(playerSocket, 'leftRoom');

    // Host should receive update
    const hostUpdate = await hostUpdatePromise;
    expect(hostUpdate.room.players.length).toBe(1); // Only host remains
  });

  test('should handle player disconnect', async () => {
    playerSocket = io(SERVER_URL, SOCKET_OPTIONS);
    await connectSocket(playerSocket);

    // Player joins
    playerSocket.emit('joinRoom', {
      playerName: 'DisconnectingPlayer',
      roomCode,
    });

    await waitForEvent<any>(playerSocket, 'roomJoined');

    // Listen for room update on host
    const hostUpdatePromise = waitForEvent<any>(hostSocket, 'roomUpdated', 10000);

    // Player disconnects abruptly
    playerSocket.disconnect();

    // Host should receive update about player leaving
    const hostUpdate = await hostUpdatePromise;
    expect(hostUpdate.room.players.length).toBe(1); // Only host remains
  });

  test('should prevent joining full room', async () => {
    // Create a small room
    const smallRoomSocket = io(SERVER_URL, SOCKET_OPTIONS);
    await connectSocket(smallRoomSocket);

    smallRoomSocket.emit('createRoom', {
      playerName: 'SmallRoomHost',
      maxPlayers: 2,
      streamerMode: false,
    });

    const createData = await waitForEvent<any>(smallRoomSocket, 'roomCreated');
    const smallRoomCode = createData.roomCode;

    // First player joins successfully
    const player1 = io(SERVER_URL, SOCKET_OPTIONS);
    await connectSocket(player1);

    player1.emit('joinRoom', {
      playerName: 'Player1',
      roomCode: smallRoomCode,
    });

    await waitForEvent<any>(player1, 'roomJoined');

    // Second player tries to join (should fail - room is full)
    const player2 = io(SERVER_URL, SOCKET_OPTIONS);
    await connectSocket(player2);

    player2.emit('joinRoom', {
      playerName: 'Player2',
      roomCode: smallRoomCode,
    });

    const error = await waitForEvent<any>(player2, 'error');
    expect(error.code).toBeDefined();

    // Cleanup
    player1.disconnect();
    player2.disconnect();
    smallRoomSocket.disconnect();
  });
});

test.describe('Host Management', () => {
  let hostSocket: Socket;
  let playerSocket: Socket;
  let roomCode: string;

  test.beforeEach(async () => {
    hostSocket = io(SERVER_URL, SOCKET_OPTIONS);
    await connectSocket(hostSocket);

    hostSocket.emit('createRoom', {
      playerName: 'OriginalHost',
      maxPlayers: 10,
      streamerMode: false,
    });

    const data = await waitForEvent<any>(hostSocket, 'roomCreated');
    roomCode = data.roomCode;

    // Add a player
    playerSocket = io(SERVER_URL, SOCKET_OPTIONS);
    await connectSocket(playerSocket);

    playerSocket.emit('joinRoom', {
      playerName: 'Player1',
      roomCode,
    });

    await waitForEvent<any>(playerSocket, 'roomJoined');
  });

  test.afterEach(() => {
    if (hostSocket?.connected) {
      hostSocket.disconnect();
    }
    if (playerSocket?.connected) {
      playerSocket.disconnect();
    }
  });

  test('should transfer host to another player', async () => {
    // Get player's participant ID
    playerSocket.emit('joinSocketRoom', { roomCode });
    await new Promise(resolve => setTimeout(resolve, 500)); // Wait for join

    // Transfer host
    const playerUpdatePromise = waitForEvent<any>(playerSocket, 'roomUpdated');

    hostSocket.emit('transferHost', {
      roomCode,
      newHostName: 'Player1',
    });

    const hostUpdate = await waitForEvent<any>(hostSocket, 'hostTransferred');
    expect(hostUpdate.newHost).toBe('Player1');

    // Player should receive update
    const playerUpdate = await playerUpdatePromise;
    const newHost = playerUpdate.room.players.find((p: any) => p.name === 'Player1');
    expect(newHost?.is_host).toBe(true);
  });

  test('should allow host to kick player', async () => {
    // Join socket room to receive updates
    playerSocket.emit('joinSocketRoom', { roomCode });
    await new Promise(resolve => setTimeout(resolve, 500));

    // Host kicks player
    const playerKickPromise = waitForEvent<any>(playerSocket, 'kicked');

    hostSocket.emit('kickPlayer', {
      roomCode,
      playerName: 'Player1',
    });

    const kickData = await playerKickPromise;
    expect(kickData.roomCode).toBe(roomCode);

    // Host should receive room update
    const hostUpdate = await waitForEvent<any>(hostSocket, 'roomUpdated');
    expect(hostUpdate.room.players.length).toBe(1); // Only host remains
  });
});

test.describe('Error Handling', () => {
  let socket: Socket;

  test.beforeEach(() => {
    socket = io(SERVER_URL, SOCKET_OPTIONS);
  });

  test.afterEach(() => {
    if (socket.connected) {
      socket.disconnect();
    }
  });

  test('should receive error for invalid room code', async () => {
    await connectSocket(socket);

    socket.emit('joinRoom', {
      playerName: 'TestPlayer',
      roomCode: 'INVALID',
    });

    const error = await waitForEvent<any>(socket, 'error');
    expect(error.code).toBeDefined();
    expect(error.error).toBeDefined();
  });

  test('should handle missing player name', async () => {
    await connectSocket(socket);

    socket.emit('createRoom', {
      playerName: '',
      maxPlayers: 10,
      streamerMode: false,
    });

    const error = await waitForEvent<any>(socket, 'error');
    expect(error.code).toBeDefined();
  });
});

test.describe('Socket Room Subscription', () => {
  let socket: Socket;

  test.beforeEach(() => {
    socket = io(SERVER_URL, SOCKET_OPTIONS);
  });

  test.afterEach(() => {
    if (socket.connected) {
      socket.disconnect();
    }
  });

  test('should join socket room for real-time updates', async () => {
    await connectSocket(socket);

    // Create a room first
    socket.emit('createRoom', {
      playerName: 'SubscribeHost',
      maxPlayers: 10,
      streamerMode: false,
    });

    const createData = await waitForEvent<any>(socket, 'roomCreated');
    const roomCode = createData.roomCode;

    // Join socket room for updates
    socket.emit('joinSocketRoom', { roomCode });

    // Give it a moment to join
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Any room updates should now be received
    expect(socket.connected).toBe(true);
  });
});
