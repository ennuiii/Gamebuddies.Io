const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Check if Supabase is configured
const isSupabaseConfigured = process.env.SUPABASE_URL && 
                             process.env.SUPABASE_ANON_KEY && 
                             process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!isSupabaseConfigured) {
  console.warn('⚠️  Supabase not configured - falling back to in-memory storage');
  console.warn('   Set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY to enable database persistence');
}

// Regular Supabase client (for public operations)
const supabase = isSupabaseConfigured ? createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true
    },
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    }
  }
) : null;

// Admin Supabase client (for server operations)
const supabaseAdmin = isSupabaseConfigured ? createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
) : null;

// Import fallback storage
const FallbackStorage = require('./fallback-storage');

// Database helper functions
class DatabaseService {
  constructor() {
    if (isSupabaseConfigured) {
      this.client = supabaseAdmin;
      this.isSupabase = true;
    } else {
      this.client = new FallbackStorage();
      this.isSupabase = false;
    }
  }

  // Room management
  async createRoom(roomData) {
    try {
      if (!this.isSupabase) {
        return await this.client.createRoom(roomData);
      }

      // Generate room code using database function
      const { data: roomCode, error: codeError } = await this.client
        .rpc('generate_room_code');

      if (codeError) throw codeError;

      // Create the room
      const { data: room, error: roomError } = await this.client
        .from('game_rooms')
        .insert([{
          room_code: roomCode,
          ...roomData
        }])
        .select()
        .single();

      if (roomError) throw roomError;

      // Log room creation event
      await this.logEvent(room.id, roomData.creator_id, 'room_created', {
        game_type: roomData.game_type,
        created_from: roomData.created_from
      });

      return room;
    } catch (error) {
      console.error('Error creating room:', error);
      throw error;
    }
  }

  async getRoomByCode(roomCode) {
    try {
      if (!this.isSupabase) {
        return await this.client.getRoomByCode(roomCode);
      }

      const { data: room, error } = await this.client
        .from('game_rooms')
        .select(`
          *,
          creator:user_profiles!creator_id(username, display_name),
          participants:room_participants(
            id,
            user_id,
            socket_id,
            role,
            connection_status,
            is_ready,
            joined_at,
            user:user_profiles(username, display_name)
          )
        `)
        .eq('room_code', roomCode)
        .single();

      if (error) throw error;
      return room;
    } catch (error) {
      console.error('Error getting room:', error);
      return null;
    }
  }

  async updateRoom(roomId, updates) {
    try {
      const { data: room, error } = await this.client
        .from('game_rooms')
        .update({
          ...updates,
          last_activity: new Date().toISOString()
        })
        .eq('id', roomId)
        .select()
        .single();

      if (error) throw error;
      return room;
    } catch (error) {
      console.error('Error updating room:', error);
      throw error;
    }
  }

  // User management
  async getOrCreateUser(externalId, username, displayName) {
    try {
      if (!this.isSupabase) {
        return await this.client.getOrCreateUser(externalId, username, displayName);
      }

      // Try to get existing user
      let { data: user, error: getUserError } = await this.client
        .from('user_profiles')
        .select('*')
        .eq('external_id', externalId)
        .single();

      if (getUserError && getUserError.code !== 'PGRST116') {
        throw getUserError;
      }

      // Create user if doesn't exist
      if (!user) {
        const { data: newUser, error: createError } = await this.client
          .from('user_profiles')
          .insert([{
            external_id: externalId,
            username: username.toLowerCase().replace(/\s+/g, '_'),
            display_name: displayName
          }])
          .select()
          .single();

        if (createError) throw createError;
        user = newUser;
      } else {
        // Update last seen
        await this.client
          .from('user_profiles')
          .update({ last_seen: new Date().toISOString() })
          .eq('id', user.id);
      }

      return user;
    } catch (error) {
      console.error('Error getting/creating user:', error);
      throw error;
    }
  }

  // Participant management
  async addParticipant(roomId, userId, socketId, role = 'player') {
    try {
      if (!this.isSupabase) {
        return await this.client.addParticipant(roomId, userId, socketId, role);
      }

      const { data: participant, error } = await this.client
        .from('room_participants')
        .upsert({
          room_id: roomId,
          user_id: userId,
          socket_id: socketId,
          role: role,
          connection_status: 'connected',
          last_ping: new Date().toISOString()
        }, {
          onConflict: 'room_id, user_id'
        })
        .select(`
          *,
          user:user_profiles(username, display_name)
        `)
        .single();

      if (error) throw error;

      // Log join event
      await this.logEvent(roomId, userId, 'player_joined', {
        role: role,
        socket_id: socketId
      });

      return participant;
    } catch (error) {
      console.error('Error adding participant:', error);
      throw error;
    }
  }

  async removeParticipant(roomId, userId) {
    try {
      const { error } = await this.client
        .from('room_participants')
        .delete()
        .eq('room_id', roomId)
        .eq('user_id', userId);

      if (error) throw error;

      // Log leave event
      await this.logEvent(roomId, userId, 'player_left');

      return true;
    } catch (error) {
      console.error('Error removing participant:', error);
      throw error;
    }
  }

  async updateParticipantConnection(userId, socketId, status = 'connected') {
    try {
      const { error } = await this.client
        .from('room_participants')
        .update({
          socket_id: socketId,
          connection_status: status,
          last_ping: new Date().toISOString()
        })
        .eq('user_id', userId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error updating participant connection:', error);
      throw error;
    }
  }

  // Event logging
  async logEvent(roomId, userId, eventType, eventData = {}) {
    try {
      const { error } = await this.client
        .from('room_events')
        .insert([{
          room_id: roomId,
          user_id: userId,
          event_type: eventType,
          event_data: eventData,
          client_info: {
            timestamp: new Date().toISOString(),
            server_version: '2.0.0'
          }
        }]);

      if (error) throw error;
    } catch (error) {
      console.error('Error logging event:', error);
      // Don't throw - logging failures shouldn't break main functionality
    }
  }

  // Game state management
  async saveGameState(roomId, gameType, stateData, createdBy) {
    try {
      // Get current max version
      const { data: maxVersion } = await this.client
        .from('game_states')
        .select('state_version')
        .eq('room_id', roomId)
        .order('state_version', { ascending: false })
        .limit(1)
        .single();

      const nextVersion = (maxVersion?.state_version || 0) + 1;

      const { data: gameState, error } = await this.client
        .from('game_states')
        .insert([{
          room_id: roomId,
          game_type: gameType,
          state_data: stateData,
          state_version: nextVersion,
          created_by: createdBy,
          checksum: this.generateChecksum(stateData)
        }])
        .select()
        .single();

      if (error) throw error;
      return gameState;
    } catch (error) {
      console.error('Error saving game state:', error);
      throw error;
    }
  }

  async getLatestGameState(roomId) {
    try {
      const { data: gameState, error } = await this.client
        .from('game_states')
        .select('*')
        .eq('room_id', roomId)
        .order('state_version', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return gameState;
    } catch (error) {
      console.error('Error getting game state:', error);
      return null;
    }
  }

  // Utility methods
  generateChecksum(data) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  }

  async cleanupStaleConnections() {
    try {
      const { error } = await this.client.rpc('cleanup_stale_connections');
      if (error) throw error;
    } catch (error) {
      console.error('Error cleaning up stale connections:', error);
    }
  }

  async refreshActiveRoomsView() {
    try {
      const { error } = await this.client.rpc('refresh_active_rooms');
      if (error) throw error;
    } catch (error) {
      console.error('Error refreshing active rooms view:', error);
    }
  }

  // Get active rooms for discovery
  async getActiveRooms(filters = {}) {
    try {
      let query = this.client
        .from('active_rooms_view')
        .select('*');

      if (filters.gameType && filters.gameType !== 'all') {
        query = query.eq('game_type', filters.gameType);
      }

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (!filters.showFull) {
        query = query.filter('current_players', 'lt', 'max_players');
      }

      if (filters.visibility) {
        query = query.eq('visibility', filters.visibility);
      }

      const { data: rooms, error } = await query
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return rooms || [];
    } catch (error) {
      console.error('Error getting active rooms:', error);
      return [];
    }
  }
}

// Export instances
const db = new DatabaseService();

module.exports = {
  supabase,
  supabaseAdmin,
  db
}; 