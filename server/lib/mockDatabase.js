/**
 * Mock Database Service for E2E Testing
 * Provides in-memory storage without requiring real Supabase
 */

// In-memory storage
const rooms = new Map();
const users = new Map();
const roomMembers = new Map();
const roomEvents = [];
const gameSessions = new Map();

// Helper to generate room codes
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Helper to generate UUIDs
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

class MockDatabaseService {
  constructor() {
    this.isSupabase = false;
    this.isMock = true;
    console.log('🧪 Mock Database Service initialized for testing');
  }

  // Room management
  async createRoom(roomData) {
    const roomCode = generateRoomCode();
    const room = {
      id: generateUUID(),
      room_code: roomCode,
      created_at: new Date().toISOString(),
      last_activity: new Date().toISOString(),
      status: 'lobby',
      current_game: roomData.current_game || 'lobby',
      max_players: roomData.max_players || 10,
      is_public: roomData.is_public !== undefined ? roomData.is_public : false,
      streamer_mode: roomData.streamer_mode || false,
      host_id: roomData.host_id,
      ...roomData,
      room_code: roomCode,
    };

    rooms.set(room.id, room);
    console.log(`✅ Mock: Created room ${roomCode}`);
    return room;
  }

  async getRoomByCode(roomCode) {
    for (const room of rooms.values()) {
      if (room.room_code === roomCode) {
        // Attach participants
        const participants = Array.from(roomMembers.values())
          .filter(m => m.room_id === room.id)
          .map(m => ({
            ...m,
            user: users.get(m.user_id)
          }));

        return {
          ...room,
          participants,
          players: participants.map(p => ({
            id: p.id,
            name: p.user?.display_name || p.user?.username || 'Unknown',
            is_host: p.role === 'host',
            is_ready: p.is_ready || false,
            is_connected: p.is_connected || false,
          }))
        };
      }
    }
    return null;
  }

  async getRoomById(roomId) {
    const room = rooms.get(roomId);
    if (!room) return null;

    // Attach participants
    const participants = Array.from(roomMembers.values())
      .filter(m => m.room_id === roomId)
      .map(m => ({
        ...m,
        user: users.get(m.user_id)
      }));

    return {
      ...room,
      participants,
      players: participants.map(p => ({
        id: p.id,
        name: p.user?.display_name || p.user?.username || 'Unknown',
        is_host: p.role === 'host',
        is_ready: p.is_ready || false,
        is_connected: p.is_connected || false,
      }))
    };
  }

  async updateRoom(roomId, updates) {
    const room = rooms.get(roomId);
    if (!room) throw new Error('Room not found');

    const updated = {
      ...room,
      ...updates,
      last_activity: new Date().toISOString()
    };
    rooms.set(roomId, updated);
    return updated;
  }

  async deleteRoom(roomId) {
    // Delete related data
    for (const [key, member] of roomMembers.entries()) {
      if (member.room_id === roomId) {
        roomMembers.delete(key);
      }
    }
    rooms.delete(roomId);
    return true;
  }

  // User management
  async getOrCreateUser(externalId, username, displayName) {
    // Check if user exists
    for (const user of users.values()) {
      if (user.username === username) {
        user.last_seen = new Date().toISOString();
        return user;
      }
    }

    // Create new user
    const user = {
      id: generateUUID(),
      username,
      display_name: displayName || username,
      created_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
    };

    users.set(user.id, user);
    console.log(`✅ Mock: Created user ${username}`);
    return user;
  }

  // Participant management
  async addParticipant(roomId, userId, socketId, role = 'player') {
    const participant = {
      id: generateUUID(),
      room_id: roomId,
      user_id: userId,
      role,
      is_connected: true,
      is_ready: false,
      in_game: false,
      current_location: 'lobby',
      last_ping: new Date().toISOString(),
      joined_at: new Date().toISOString(),
      socket_id: socketId,
    };

    roomMembers.set(participant.id, participant);
    console.log(`✅ Mock: Added participant to room (role: ${role})`);

    return {
      ...participant,
      user: users.get(userId)
    };
  }

  async removeParticipant(roomId, userId) {
    for (const [key, member] of roomMembers.entries()) {
      if (member.room_id === roomId && member.user_id === userId) {
        roomMembers.delete(key);
        console.log(`✅ Mock: Removed participant from room`);
        return true;
      }
    }
    return false;
  }

  async updateParticipant(participantId, updates) {
    const participant = roomMembers.get(participantId);
    if (!participant) throw new Error('Participant not found');

    const updated = {
      ...participant,
      ...updates,
      last_ping: new Date().toISOString()
    };

    roomMembers.set(participantId, updated);
    return {
      ...updated,
      user: users.get(updated.user_id)
    };
  }

  async updateParticipantConnection(userId, socketId, status = 'connected') {
    for (const [key, member] of roomMembers.values()) {
      if (member.user_id === userId) {
        member.is_connected = status === 'connected';
        member.socket_id = status === 'connected' ? socketId : null;
        member.current_location = status === 'connected' ? 'lobby' : 'disconnected';
        member.last_ping = new Date().toISOString();
        roomMembers.set(key, member);
      }
    }
    return true;
  }

  // Host transfer functionality
  async transferHost(roomId, currentHostUserId, newHostUserId) {
    // Find and demote current host
    for (const member of roomMembers.values()) {
      if (member.room_id === roomId && member.user_id === currentHostUserId) {
        member.role = 'player';
      }
      if (member.room_id === roomId && member.user_id === newHostUserId) {
        member.role = 'host';
      }
    }

    // Update room host_id
    const room = rooms.get(roomId);
    if (room) {
      room.host_id = newHostUserId;
    }

    console.log(`✅ Mock: Transferred host in room`);
    return true;
  }

  async autoTransferHost(roomId, leavingHostUserId) {
    // Find next suitable host
    const participants = Array.from(roomMembers.values())
      .filter(m => m.room_id === roomId && m.user_id !== leavingHostUserId && m.is_connected)
      .sort((a, b) => new Date(a.joined_at) - new Date(b.joined_at));

    if (participants.length === 0) {
      return null;
    }

    const newHost = participants[0];
    newHost.role = 'host';

    // Update room
    const room = rooms.get(roomId);
    if (room) {
      room.host_id = newHost.user_id;
    }

    console.log(`✅ Mock: Auto-transferred host`);
    return {
      ...newHost,
      user: users.get(newHost.user_id)
    };
  }

  // Event logging
  async logEvent(roomId, userId, eventType, eventData = {}) {
    roomEvents.push({
      room_id: roomId,
      user_id: userId,
      event_type: eventType,
      event_data: eventData,
      created_at: new Date().toISOString()
    });
  }

  // Game state management
  async saveGameState(roomId, gameType, stateData, createdBy) {
    const gameState = {
      id: generateUUID(),
      room_id: roomId,
      game_id: gameType,
      game_state: stateData,
      participants: [{ user_id: createdBy }],
      started_at: new Date().toISOString()
    };

    gameSessions.set(gameState.id, gameState);
    return gameState;
  }

  async getLatestGameState(roomId) {
    for (const session of Array.from(gameSessions.values()).reverse()) {
      if (session.room_id === roomId) {
        return session;
      }
    }
    return null;
  }

  // Utility methods
  generateChecksum(data) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  }

  async cleanupStaleConnections() {
    console.log('✅ Mock: Cleanup stale connections (no-op)');
  }

  async refreshActiveRoomsView() {
    console.log('✅ Mock: Refresh active rooms (no-op)');
  }

  async cleanupInactiveRooms(options = {}) {
    console.log('✅ Mock: Cleanup inactive rooms (no-op)');
    return { cleaned: 0, rooms: [] };
  }

  async getRoomStats() {
    return {
      total: rooms.size,
      byStatus: {},
      byAge: {},
      byActivity: {}
    };
  }

  async getActiveRooms(filters = {}) {
    return Array.from(rooms.values())
      .filter(r => r.is_public && r.status !== 'completed')
      .slice(0, 50);
  }

  // Mock client properties for compatibility
  get client() {
    return {
      from: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) })
    };
  }

  get adminClient() {
    return {
      from: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
      rpc: async () => ({ data: null, error: null }),
      single: async () => ({ data: null, error: null })
    };
  }
}

module.exports = {
  MockDatabaseService,
  supabase: null, // Mock doesn't provide real Supabase clients
  supabaseAdmin: null,
  db: new MockDatabaseService()
};
