#!/usr/bin/env node
/**
 * Simple Socket.IO Test Runner
 * Runs tests without requiring Playwright browsers
 */

const io = require('socket.io-client');

const SERVER_URL = 'http://localhost:3033';
let testsPassed = 0;
let testsFailed = 0;

// Helper to wait for socket event
function waitForEvent(socket, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for event: ${event}`));
    }, timeout);

    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

// Helper to connect socket
async function connectSocket(socket) {
  return new Promise((resolve, reject) => {
    socket.on('connect', () => resolve());
    socket.on('connect_error', (error) => reject(error));
    socket.connect();
    setTimeout(() => reject(new Error('Connection timeout')), 5000);
  });
}

// Test runner
async function runTest(name, testFn) {
  try {
    console.log(`\n🧪 Testing: ${name}`);
    await testFn();
    console.log(`✅ PASS: ${name}`);
    testsPassed++;
  } catch (error) {
    console.log(`❌ FAIL: ${name}`);
    console.log(`   Error: ${error.message}`);
    testsFailed++;
  }
}

// Main test suite
async function runTests() {
  console.log('\n========================================');
  console.log('🚀 GameBuddies Socket.IO E2E Tests');
  console.log('========================================\n');

  // Test 1: Socket Connection
  await runTest('Socket.IO connection', async () => {
    const socket = io(SERVER_URL, { transports: ['websocket'], autoConnect: false });
    await connectSocket(socket);
    if (!socket.connected) throw new Error('Socket not connected');
    socket.disconnect();
  });

  // Test 2: Create Basic Lobby
  await runTest('Create basic lobby', async () => {
    const socket = io(SERVER_URL, { transports: ['websocket'], autoConnect: false });
    await connectSocket(socket);

    socket.emit('createRoom', {
      playerName: 'TestHost',
      maxPlayers: 10,
      streamerMode: false,
    });

    const data = await waitForEvent(socket, 'roomCreated');

    if (!data.roomCode) throw new Error('No room code returned');
    if (!data.roomCode.match(/^[A-Z0-9]{6}$/)) throw new Error('Invalid room code format');
    if (!data.isHost) throw new Error('User should be host');
    if (data.room.players.length !== 1) throw new Error('Should have 1 player');

    socket.disconnect();
  });

  // Test 3: Create Lobby with Streamer Mode
  await runTest('Create lobby with streamer mode', async () => {
    const socket = io(SERVER_URL, { transports: ['websocket'], autoConnect: false });
    await connectSocket(socket);

    socket.emit('createRoom', {
      playerName: 'StreamerHost',
      maxPlayers: 10,
      streamerMode: true,
    });

    const data = await waitForEvent(socket, 'roomCreated');

    if (data.room.streamer_mode !== true) throw new Error('Streamer mode not enabled');

    socket.disconnect();
  });

  // Test 4: Create Public Lobby
  await runTest('Create public lobby', async () => {
    const socket = io(SERVER_URL, { transports: ['websocket'], autoConnect: false });
    await connectSocket(socket);

    socket.emit('createRoom', {
      playerName: 'PublicHost',
      maxPlayers: 8,
      isPublic: true,
      streamerMode: false,
    });

    const data = await waitForEvent(socket, 'roomCreated');

    if (data.room.is_public !== true) throw new Error('Room should be public');
    if (data.room.max_players !== 8) throw new Error('Max players should be 8');

    socket.disconnect();
  });

  // Test 5: Create Private Lobby
  await runTest('Create private lobby', async () => {
    const socket = io(SERVER_URL, { transports: ['websocket'], autoConnect: false });
    await connectSocket(socket);

    socket.emit('createRoom', {
      playerName: 'PrivateHost',
      maxPlayers: 4,
      isPublic: false,
      streamerMode: false,
    });

    const data = await waitForEvent(socket, 'roomCreated');

    if (data.room.is_public !== false) throw new Error('Room should be private');
    if (data.room.max_players !== 4) throw new Error('Max players should be 4');

    socket.disconnect();
  });

  // Test 6: Player Joins Room
  await runTest('Player joins room', async () => {
    const hostSocket = io(SERVER_URL, { transports: ['websocket'], autoConnect: false });
    const playerSocket = io(SERVER_URL, { transports: ['websocket'], autoConnect: false });

    await connectSocket(hostSocket);

    hostSocket.emit('createRoom', {
      playerName: 'RoomHost',
      maxPlayers: 10,
      streamerMode: false,
    });

    const createData = await waitForEvent(hostSocket, 'roomCreated');
    const roomCode = createData.roomCode;

    await connectSocket(playerSocket);

    playerSocket.emit('joinRoom', {
      playerName: 'Player1',
      roomCode,
    });

    const joinData = await waitForEvent(playerSocket, 'roomJoined');

    if (joinData.roomCode !== roomCode) throw new Error('Room codes do not match');
    if (joinData.isHost === true) throw new Error('Joined player should not be host');
    if (joinData.room.players.length !== 2) throw new Error('Should have 2 players');

    hostSocket.disconnect();
    playerSocket.disconnect();
  });

  // Test 7: Multiple Players Join
  await runTest('Multiple players join room', async () => {
    const hostSocket = io(SERVER_URL, { transports: ['websocket'], autoConnect: false });
    await connectSocket(hostSocket);

    hostSocket.emit('createRoom', {
      playerName: 'MultiHost',
      maxPlayers: 10,
      streamerMode: false,
    });

    const createData = await waitForEvent(hostSocket, 'roomCreated');
    const roomCode = createData.roomCode;

    const players = [];
    for (let i = 1; i <= 3; i++) {
      const player = io(SERVER_URL, { transports: ['websocket'], autoConnect: false });
      await connectSocket(player);

      player.emit('joinRoom', {
        playerName: `Player${i}`,
        roomCode,
      });

      const joinData = await waitForEvent(player, 'roomJoined');
      if (joinData.room.players.length !== i + 1) throw new Error(`Should have ${i + 1} players`);

      players.push(player);
    }

    players.forEach(p => p.disconnect());
    hostSocket.disconnect();
  });

  // Test 8: Select Game
  await runTest('Select game in room', async () => {
    const socket = io(SERVER_URL, { transports: ['websocket'], autoConnect: false });
    await connectSocket(socket);

    socket.emit('createRoom', {
      playerName: 'GameHost',
      maxPlayers: 10,
      streamerMode: false,
    });

    const createData = await waitForEvent(socket, 'roomCreated');
    const roomCode = createData.roomCode;

    socket.emit('selectGame', {
      roomCode,
      gameType: 'skribbl',
    });

    const gameData = await waitForEvent(socket, 'gameSelected', 10000);

    if (gameData.gameType !== 'skribbl') throw new Error('Game type should be skribbl');
    if (gameData.roomCode !== roomCode) throw new Error('Room codes do not match');

    socket.disconnect();
  });

  // Test 9: Invalid Room Code Error
  await runTest('Invalid room code error', async () => {
    const socket = io(SERVER_URL, { transports: ['websocket'], autoConnect: false });
    await connectSocket(socket);

    socket.emit('joinRoom', {
      playerName: 'TestPlayer',
      roomCode: 'INVALID',
    });

    const error = await waitForEvent(socket, 'error');

    if (!error.code) throw new Error('Error should have code');
    if (!error.error) throw new Error('Error should have message');

    socket.disconnect();
  });

  // Test 10: Player Leaves Room
  await runTest('Player leaves room', async () => {
    const hostSocket = io(SERVER_URL, { transports: ['websocket'], autoConnect: false });
    const playerSocket = io(SERVER_URL, { transports: ['websocket'], autoConnect: false });

    await connectSocket(hostSocket);

    hostSocket.emit('createRoom', {
      playerName: 'LeaveHost',
      maxPlayers: 10,
      streamerMode: false,
    });

    const createData = await waitForEvent(hostSocket, 'roomCreated');
    const roomCode = createData.roomCode;

    await connectSocket(playerSocket);

    playerSocket.emit('joinRoom', {
      playerName: 'LeavingPlayer',
      roomCode,
    });

    await waitForEvent(playerSocket, 'roomJoined');

    playerSocket.emit('leaveRoom', {
      roomCode,
    });

    await waitForEvent(playerSocket, 'leftRoom');

    hostSocket.disconnect();
    playerSocket.disconnect();
  });

  // Summary
  console.log('\n========================================');
  console.log('📊 Test Summary');
  console.log('========================================');
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  console.log(`📈 Total:  ${testsPassed + testsFailed}`);
  console.log(`🎯 Success Rate: ${Math.round((testsPassed / (testsPassed + testsFailed)) * 100)}%`);
  console.log('========================================\n');

  process.exit(testsFailed > 0 ? 1 : 0);
}

// Run tests
runTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
