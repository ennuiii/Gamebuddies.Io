// Simple in-memory fallback storage for when Supabase is not configured
class FallbackStorage {
  constructor() {
    this.rooms = new Map();
    this.users = new Map();
    this.participants = new Map();
    this.events = [];
    console.log('🔄 Using in-memory fallback storage (data will not persist)');
  }

  // Generate simple room code
  generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    // Ensure uniqueness
    if (this.rooms.has(result)) {
      return this.generateRoomCode();
    }
    
    return result;
  }

  // Room management
  async createRoom(roomData) {
    const roomCode = this.generateRoomCode();
    const room = {
      id: `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      room_code: roomCode,
      creator_id: roomData.creator_id,
      game_type: roomData.game_type || 'lobby',
      status: 'waiting_for_players',
      visibility: 'public',
      max_players: 10,
      current_players: 0,
      settings: roomData.settings || {},
      metadata: roomData.metadata || {},
      created_from: roomData.created_from || 'web_client',
      created_at: new Date().toISOString(),
      last_activity: new Date().toISOString(),
      participants: []
    };
    
    this.rooms.set(roomCode, room);
    this.logEvent(room.id, roomData.creator_id, 'room_created', {
      game_type: room.game_type,
      created_from: room.created_from
    });
    
    return room;
  }

  async getRoomByCode(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return null;
    
    // Add participants data
    const participants = Array.from(this.participants.values())
      .filter(p => p.room_id === room.id && p.connection_status === 'connected')
      .map(p => ({
        ...p,
        user: this.users.get(p.user_id)
      }));
    
    return {
      ...room,
      participants
    };
  }

  async updateRoom(roomId, updates) {
    for (const [code, room] of this.rooms.entries()) {
      if (room.id === roomId) {
        const updatedRoom = {
          ...room,
          ...updates,
          last_activity: new Date().toISOString()
        };
        this.rooms.set(code, updatedRoom);
        return updatedRoom;
      }
    }
    throw new Error('Room not found');
  }

  // User management
  async getOrCreateUser(externalId, username, displayName) {
    // Check if user exists
    for (const user of this.users.values()) {
      if (user.external_id === externalId) {
        // Update last seen
        user.last_seen = new Date().toISOString();
        return user;
      }
    }
    
    // Create new user
    const user = {
      id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      external_id: externalId,
      username: username.toLowerCase().replace(/\s+/g, '_'),
      display_name: displayName,
      created_at: new Date().toISOString(),
      last_seen: new Date().toISOString()
    };
    
    this.users.set(user.id, user);
    return user;
  }

  // Participant management
  async addParticipant(roomId, userId, socketId, role = 'player') {
    const participantId = `participant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const participant = {
      id: participantId,
      room_id: roomId,
      user_id: userId,
      socket_id: socketId,
      role: role,
      connection_status: 'connected',
      is_ready: false,
      joined_at: new Date().toISOString(),
      last_ping: new Date().toISOString(),
      user: this.users.get(userId)
    };
    
    this.participants.set(participantId, participant);
    
    // Update room participant count
    for (const [code, room] of this.rooms.entries()) {
      if (room.id === roomId) {
        room.current_players = Array.from(this.participants.values())
          .filter(p => p.room_id === roomId && p.connection_status === 'connected').length;
        break;
      }
    }
    
    this.logEvent(roomId, userId, 'player_joined', {
      role: role,
      socket_id: socketId
    });
    
    return participant;
  }

  async removeParticipant(roomId, userId) {
    for (const [id, participant] of this.participants.entries()) {
      if (participant.room_id === roomId && participant.user_id === userId) {
        this.participants.delete(id);
        
        // Update room participant count
        for (const [code, room] of this.rooms.entries()) {
          if (room.id === roomId) {
            room.current_players = Array.from(this.participants.values())
              .filter(p => p.room_id === roomId && p.connection_status === 'connected').length;
            break;
          }
        }
        
        this.logEvent(roomId, userId, 'player_left');
        return true;
      }
    }
    return false;
  }

  async updateParticipantConnection(userId, socketId, status = 'connected') {
    for (const participant of this.participants.values()) {
      if (participant.user_id === userId) {
        participant.socket_id = socketId;
        participant.connection_status = status;
        participant.last_ping = new Date().toISOString();
        return true;
      }
    }
    return false;
  }

  // Event logging
  async logEvent(roomId, userId, eventType, eventData = {}) {
    this.events.push({
      id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      room_id: roomId,
      user_id: userId,
      event_type: eventType,
      event_data: eventData,
      created_at: new Date().toISOString()
    });
    
    // Keep only last 1000 events to prevent memory issues
    if (this.events.length > 1000) {
      this.events = this.events.slice(-1000);
    }
  }

  // Game state management (simplified)
  async saveGameState(roomId, gameType, stateData, createdBy) {
    // In fallback mode, we don't persist game states
    return {
      id: `state_${Date.now()}`,
      room_id: roomId,
      game_type: gameType,
      state_data: stateData,
      created_by: createdBy,
      created_at: new Date().toISOString()
    };
  }

  async getLatestGameState(roomId) {
    // In fallback mode, no persistent game states
    return null;
  }

  // Utility methods
  generateChecksum(data) {
    // Simple checksum for fallback
    return Date.now().toString();
  }

  async cleanupStaleConnections() {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    for (const participant of this.participants.values()) {
      if (participant.connection_status === 'connected' && 
          new Date(participant.last_ping) < fiveMinutesAgo) {
        participant.connection_status = 'disconnected';
      }
    }
    
    // Mark rooms as abandoned if no activity for 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    for (const room of this.rooms.values()) {
      if (room.status === 'waiting_for_players' && 
          new Date(room.last_activity) < twentyFourHoursAgo) {
        room.status = 'abandoned';
      }
    }
  }

  async refreshActiveRoomsView() {
    // No-op for fallback storage
  }

  async getActiveRooms(filters = {}) {
    const rooms = Array.from(this.rooms.values())
      .filter(room => room.status === 'waiting_for_players')
      .slice(0, 50); // Limit to 50 rooms
    
    return rooms.map(room => ({
      ...room,
      participant_count: Array.from(this.participants.values())
        .filter(p => p.room_id === room.id && p.connection_status === 'connected').length
    }));
  }
}

module.exports = FallbackStorage; 