#!/usr/bin/env node
/**
 * Live Site Testing for gamebuddies.io
 * Tests the production website using Socket.IO client
 */

const io = require('socket.io-client');
const https = require('https');

const LIVE_URL = 'https://gamebuddies.io';
let testsPassed = 0;
let testsFailed = 0;

// Helper to make HTTP requests
function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: data, headers: res.headers });
        }
      });
    }).on('error', reject);
  });
}

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
    setTimeout(() => reject(new Error('Connection timeout')), 10000);
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
  console.log('🌐 GameBuddies.io LIVE SITE TESTS');
  console.log('========================================\n');

  // Test 1: Health Check
  await runTest('Health endpoint responds', async () => {
    const result = await httpGet(`${LIVE_URL}/health`);
    if (result.status !== 200) throw new Error(`Status ${result.status}`);
    if (!result.data.status) throw new Error('No status field');
    console.log(`   Server version: ${result.data.version || 'unknown'}`);
    console.log(`   Uptime: ${result.data.uptime ? Math.round(result.data.uptime) + 's' : 'unknown'}`);
  });

  // Test 2: Homepage loads
  await runTest('Homepage loads successfully', async () => {
    const result = await httpGet(LIVE_URL);
    if (result.status !== 200) throw new Error(`Status ${result.status}`);
    if (typeof result.data !== 'string') throw new Error('No HTML content');
    if (!result.data.includes('GameBuddies') && !result.data.includes('gamebuddies')) {
      console.log(`   Warning: 'GameBuddies' not found in HTML, but page loaded`);
    }
  });

  // Test 3: Socket.IO Connection
  await runTest('Socket.IO connection to live site', async () => {
    const socket = io(LIVE_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: false,
      reconnection: false
    });

    await connectSocket(socket);
    if (!socket.connected) throw new Error('Socket not connected');
    console.log(`   Socket ID: ${socket.id}`);
    socket.disconnect();
  });

  // Test 4: Create Lobby on Live Site
  await runTest('Create lobby on live site', async () => {
    const socket = io(LIVE_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: false,
      reconnection: false
    });

    await connectSocket(socket);

    socket.emit('createRoom', {
      playerName: 'E2E_Test_Host',
      maxPlayers: 10,
      streamerMode: false,
    });

    const data = await waitForEvent(socket, 'roomCreated', 15000);

    if (!data.roomCode) throw new Error('No room code returned');
    if (!data.roomCode.match(/^[A-Z0-9]{6}$/)) throw new Error('Invalid room code format');
    if (!data.isHost) throw new Error('User should be host');

    console.log(`   ✅ Created room: ${data.roomCode}`);
    console.log(`   Players in room: ${data.room.players?.length || 0}`);

    socket.disconnect();
  });

  // Test 5: Create Lobby with Streamer Mode
  await runTest('Create lobby with streamer mode on live site', async () => {
    const socket = io(LIVE_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: false,
      reconnection: false
    });

    await connectSocket(socket);

    socket.emit('createRoom', {
      playerName: 'E2E_Streamer_Test',
      maxPlayers: 10,
      streamerMode: true,
    });

    const data = await waitForEvent(socket, 'roomCreated', 15000);

    if (!data.roomCode) throw new Error('No room code');
    console.log(`   ✅ Streamer room: ${data.roomCode}`);
    console.log(`   Streamer mode: ${data.room.streamer_mode ? 'enabled' : 'disabled'}`);

    socket.disconnect();
  });

  // Test 6: Join Existing Room
  await runTest('Player joins existing room on live site', async () => {
    const hostSocket = io(LIVE_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: false,
      reconnection: false
    });
    const playerSocket = io(LIVE_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: false,
      reconnection: false
    });

    await connectSocket(hostSocket);

    hostSocket.emit('createRoom', {
      playerName: 'E2E_Join_Host',
      maxPlayers: 10,
      streamerMode: false,
    });

    const createData = await waitForEvent(hostSocket, 'roomCreated', 15000);
    const roomCode = createData.roomCode;
    console.log(`   Room created: ${roomCode}`);

    await connectSocket(playerSocket);

    playerSocket.emit('joinRoom', {
      playerName: 'E2E_Join_Player',
      roomCode,
    });

    const joinData = await waitForEvent(playerSocket, 'roomJoined', 15000);

    if (joinData.roomCode !== roomCode) throw new Error('Room codes do not match');
    console.log(`   ✅ Player joined: ${roomCode}`);
    console.log(`   Total players: ${joinData.room.players?.length || 0}`);

    hostSocket.disconnect();
    playerSocket.disconnect();
  });

  // Test 7: Invalid Room Code Error
  await runTest('Invalid room code returns error', async () => {
    const socket = io(LIVE_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: false,
      reconnection: false
    });

    await connectSocket(socket);

    socket.emit('joinRoom', {
      playerName: 'E2E_Error_Test',
      roomCode: 'INVALID123',
    });

    const error = await waitForEvent(socket, 'error', 15000);

    if (!error.code && !error.error) throw new Error('No error returned');
    console.log(`   ✅ Error handled: ${error.error || error.code}`);

    socket.disconnect();
  });

  // Summary
  console.log('\n========================================');
  console.log('📊 Live Site Test Summary');
  console.log('========================================');
  console.log(`🌐 Site: ${LIVE_URL}`);
  console.log(`✅ Passed: ${testsPassed}`);
  console.log(`❌ Failed: ${testsFailed}`);
  console.log(`📈 Total:  ${testsPassed + testsFailed}`);
  console.log(`🎯 Success Rate: ${Math.round((testsPassed / (testsPassed + testsFailed)) * 100)}%`);
  console.log('========================================\n');

  process.exit(testsFailed > 0 ? 1 : 0);
}

// Run tests
console.log(`\n🚀 Starting live site tests for ${LIVE_URL}...`);
console.log(`⏰ ${new Date().toISOString()}\n`);

runTests().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
