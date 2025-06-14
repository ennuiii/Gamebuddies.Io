const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
  console.error('❌ CRITICAL ERROR: Supabase configuration missing!');
  console.error('   Required environment variables:');
  console.error('   - SUPABASE_URL');
  console.error('   - SUPABASE_ANON_KEY');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  console.error('   GameBuddies now requires Supabase for persistent storage.');
  process.exit(1);
}

// Create Supabase clients
const supabase = createClient(supabaseUrl, supabaseAnonKey);
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

console.log('✅ Supabase clients initialized successfully');

// Database service class
class DatabaseService {
  constructor() {
    this.client = supabase;
    this.adminClient = supabaseAdmin;
    this.isSupabase = true; // Always true now
  }

  // Room management
  async createRoom(roomData) {
    try {
      // Generate room code using database function
      const { data: roomCode, error: codeError } = await this.adminClient
        .rpc('generate_room_code');

      if (codeError) throw codeError;

      // Create the room
      const { data: room, error: roomError } = await this.adminClient
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
      const { data: room, error } = await this.adminClient
        .from('game_rooms')
        .select(`
          *,
          creator:user_profiles!creator_id(username, display_name),
          participants:room_participants(
            id,
            user_id,
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

  async getRoomById(roomId) {
    try {
      const { data: room, error } = await this.adminClient
        .from('game_rooms')
        .select(`
          *,
          creator:user_profiles!creator_id(username, display_name),
          participants:room_participants(
            id,
            user_id,
            role,
            connection_status,
            is_ready,
            joined_at,
            user:user_profiles(username, display_name)
          )
        `)
        .eq('id', roomId)
        .single();

      if (error) throw error;
      return room;
    } catch (error) {
      console.error('Error getting room by ID:', error);
      return null;
    }
  }

  async updateRoom(roomId, updates) {
    try {
      const { data: room, error } = await this.adminClient
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
      // Always check by external_id first
      let { data: user, error } = await this.adminClient
        .from('user_profiles')
        .select('*')
        .eq('external_id', externalId)
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 means no rows found, which is ok
        throw error;
      }

      if (user) {
        console.log('✅ Found existing user:', user.username);
        // Update last_seen
        await this.adminClient
          .from('user_profiles')
          .update({ last_seen: new Date().toISOString() })
          .eq('id', user.id);
        
        return user;
      }

      // Create new user - username doesn't need to be unique anymore
      const { data: newUser, error: createError } = await this.adminClient
        .from('user_profiles')
        .insert({
          external_id: externalId,
          username: username,
          display_name: displayName || username
        })
        .select()
        .single();

      if (createError) throw createError;

      console.log('✅ Created new user:', newUser.username);
      return newUser;

    } catch (error) {
      console.error('Error in getOrCreateUser:', error);
      throw error;
    }
  }

  // Participant management
  async addParticipant(roomId, userId, socketId, role = 'player') {
    try {
      const { data: participant, error } = await this.adminClient
        .from('room_participants')
        .upsert({
          room_id: roomId,
          user_id: userId,
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
      const { error } = await this.adminClient
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
      const { error } = await this.adminClient
        .from('room_participants')
        .update({
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

  // Host transfer functionality
  async transferHost(roomId, currentHostUserId, newHostUserId) {
    try {
      console.log(`🔄 Transferring host in room ${roomId} from ${currentHostUserId} to ${newHostUserId}`);

      // Start a transaction-like operation
      // First, verify current host
      const { data: currentHost, error: currentHostError } = await this.adminClient
        .from('room_participants')
        .select('*')
        .eq('room_id', roomId)
        .eq('user_id', currentHostUserId)
        .eq('role', 'host')
        .single();

      if (currentHostError || !currentHost) {
        throw new Error('Current user is not the host of this room');
      }

      // Verify new host is in the room
      const { data: newHost, error: newHostError } = await this.adminClient
        .from('room_participants')
        .select('*')
        .eq('room_id', roomId)
        .eq('user_id', newHostUserId)
        .single();

      if (newHostError || !newHost) {
        throw new Error('Target user is not in this room');
      }

      // Update current host to player
      const { error: demoteError } = await this.adminClient
        .from('room_participants')
        .update({ role: 'player' })
        .eq('room_id', roomId)
        .eq('user_id', currentHostUserId);

      if (demoteError) throw demoteError;

      // Update new user to host
      const { error: promoteError } = await this.adminClient
        .from('room_participants')
        .update({ role: 'host' })
        .eq('room_id', roomId)
        .eq('user_id', newHostUserId);

      if (promoteError) {
        // Rollback: restore original host
        await this.adminClient
          .from('room_participants')
          .update({ role: 'host' })
          .eq('room_id', roomId)
          .eq('user_id', currentHostUserId);
        throw promoteError;
      }

      // Log the host transfer event
      await this.logEvent(roomId, currentHostUserId, 'host_transferred', {
        old_host_id: currentHostUserId,
        new_host_id: newHostUserId
      });

      console.log(`✅ Host transferred successfully in room ${roomId}`);
      return true;

    } catch (error) {
      console.error('Error transferring host:', error);
      throw error;
    }
  }

  async autoTransferHost(roomId, leavingHostUserId) {
    try {
      console.log(`🔄 Auto-transferring host in room ${roomId} after host ${leavingHostUserId} left`);

      // Find the next suitable host (longest-connected player)
      const { data: participants, error } = await this.adminClient
        .from('room_participants')
        .select(`
          *,
          user:user_profiles(username, display_name)
        `)
        .eq('room_id', roomId)
        .eq('connection_status', 'connected')
        .neq('user_id', leavingHostUserId)
        .order('joined_at', { ascending: true }); // Oldest participant first

      if (error) throw error;

      if (!participants || participants.length === 0) {
        console.log('⚠️ No connected participants left for auto host transfer');
        return null;
      }

      // Select the first (oldest) participant as new host
      const newHost = participants[0];

      // Update their role to host
      const { error: updateError } = await this.adminClient
        .from('room_participants')
        .update({ role: 'host' })
        .eq('room_id', roomId)
        .eq('user_id', newHost.user_id);

      if (updateError) throw updateError;

      // Log the auto host transfer event
      await this.logEvent(roomId, newHost.user_id, 'host_auto_transferred', {
        old_host_id: leavingHostUserId,
        new_host_id: newHost.user_id,
        reason: 'original_host_left'
      });

      console.log(`✅ Auto-transferred host to ${newHost.user?.display_name || newHost.user?.username}`);
      return newHost;

    } catch (error) {
      console.error('Error auto-transferring host:', error);
      throw error;
    }
  }

  // Event logging
  async logEvent(roomId, userId, eventType, eventData = {}) {
    try {
      const { error } = await this.adminClient
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
      const { data: maxVersion } = await this.adminClient
        .from('game_states')
        .select('state_version')
        .eq('room_id', roomId)
        .order('state_version', { ascending: false })
        .limit(1)
        .single();

      const nextVersion = (maxVersion?.state_version || 0) + 1;

      const { data: gameState, error } = await this.adminClient
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
      const { data: gameState, error } = await this.adminClient
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
      const { error } = await this.adminClient.rpc('cleanup_stale_connections');
      if (error) throw error;
    } catch (error) {
      console.error('Error cleaning up stale connections:', error);
    }
  }

  async refreshActiveRoomsView() {
    try {
      const { error } = await this.adminClient.rpc('refresh_active_rooms');
      if (error) throw error;
    } catch (error) {
      console.error('Error refreshing active rooms view:', error);
    }
  }

  // Room cleanup methods
  async cleanupInactiveRooms(options = {}) {
    try {
      const {
        maxAgeHours = 24,        // Rooms older than 24 hours
        maxIdleMinutes = 30,     // Rooms idle for 30 minutes
        includeAbandoned = true, // Include abandoned rooms
        includeCompleted = true, // Include completed games
        dryRun = false          // If true, only return what would be deleted
      } = options;

      console.log('🧹 Starting room cleanup...', {
        maxAgeHours,
        maxIdleMinutes,
        includeAbandoned,
        includeCompleted,
        dryRun
      });

      // Calculate cutoff times
      const maxAgeDate = new Date(Date.now() - (maxAgeHours * 60 * 60 * 1000));
      const maxIdleDate = new Date(Date.now() - (maxIdleMinutes * 60 * 1000));

      // Build query for rooms to cleanup
      let query = this.adminClient
        .from('game_rooms')
        .select(`
          id,
          room_code,
          status,
          created_at,
          last_activity,
          current_players,
          participants:room_participants(
            id,
            user_id,
            connection_status,
            last_ping
          )
        `);

      // Add conditions for cleanup
      const conditions = [];
      
      // Old rooms
      conditions.push(`created_at.lt.${maxAgeDate.toISOString()}`);
      
      // Idle rooms (no activity recently)
      conditions.push(`last_activity.lt.${maxIdleDate.toISOString()}`);
      
      // Abandoned rooms (no connected players)
      if (includeAbandoned) {
        conditions.push(`status.eq.abandoned`);
      }
      
      // Completed games
      if (includeCompleted) {
        conditions.push(`status.eq.completed`);
      }

      // Get rooms matching any of these conditions
      const { data: roomsToCleanup, error: queryError } = await this.adminClient
        .from('game_rooms')
        .select(`
          id,
          room_code,
          status,
          created_at,
          last_activity,
          current_players,
          participants:room_participants(
            id,
            user_id,
            connection_status,
            last_ping
          )
        `)
        .or(`created_at.lt.${maxAgeDate.toISOString()},last_activity.lt.${maxIdleDate.toISOString()},status.eq.abandoned,status.eq.completed`);

      if (queryError) throw queryError;

      if (!roomsToCleanup || roomsToCleanup.length === 0) {
        console.log('✅ No rooms need cleanup');
        return { cleaned: 0, rooms: [] };
      }

      // Filter rooms that actually need cleanup
      const roomsNeedingCleanup = roomsToCleanup.filter(room => {
        const roomAge = Date.now() - new Date(room.created_at).getTime();
        const roomIdle = Date.now() - new Date(room.last_activity || room.created_at).getTime();
        const hasConnectedPlayers = room.participants?.some(p => p.connection_status === 'connected');

        return (
          // Too old
          roomAge > (maxAgeHours * 60 * 60 * 1000) ||
          // Too idle
          roomIdle > (maxIdleMinutes * 60 * 1000) ||
          // Abandoned
          (includeAbandoned && room.status === 'abandoned') ||
          // Completed
          (includeCompleted && room.status === 'completed') ||
          // No connected players and idle
          (!hasConnectedPlayers && roomIdle > (maxIdleMinutes * 60 * 1000))
        );
      });

      console.log(`🔍 Found ${roomsNeedingCleanup.length} rooms to cleanup:`, 
        roomsNeedingCleanup.map(r => ({
          code: r.room_code,
          status: r.status,
          age: Math.round((Date.now() - new Date(r.created_at).getTime()) / (60 * 60 * 1000)) + 'h',
          idle: Math.round((Date.now() - new Date(r.last_activity || r.created_at).getTime()) / (60 * 1000)) + 'm'
        }))
      );

      if (dryRun) {
        return { 
          cleaned: 0, 
          rooms: roomsNeedingCleanup.map(r => r.room_code),
          wouldClean: roomsNeedingCleanup.length
        };
      }

      // Actually delete the rooms
      let cleanedCount = 0;
      const cleanedRooms = [];

      for (const room of roomsNeedingCleanup) {
        try {
          await this.deleteRoom(room.id);
          cleanedCount++;
          cleanedRooms.push(room.room_code);
          console.log(`🗑️ Cleaned up room: ${room.room_code}`);
        } catch (error) {
          console.error(`❌ Failed to cleanup room ${room.room_code}:`, error);
        }
      }

      console.log(`✅ Room cleanup completed: ${cleanedCount} rooms cleaned`);
      return { cleaned: cleanedCount, rooms: cleanedRooms };

    } catch (error) {
      console.error('❌ Error during room cleanup:', error);
      throw error;
    }
  }

  async deleteRoom(roomId) {
    try {
      // Delete in order due to foreign key constraints
      
      // 1. Delete game states
      await this.adminClient
        .from('game_states')
        .delete()
        .eq('room_id', roomId);

      // 2. Delete room events
      await this.adminClient
        .from('room_events')
        .delete()
        .eq('room_id', roomId);

      // 3. Delete participants
      await this.adminClient
        .from('room_participants')
        .delete()
        .eq('room_id', roomId);

      // 4. Delete the room itself
      const { error } = await this.adminClient
        .from('game_rooms')
        .delete()
        .eq('id', roomId);

      if (error) throw error;

      return true;
    } catch (error) {
      console.error('Error deleting room:', error);
      throw error;
    }
  }

  async getRoomStats() {
    try {
      const { data: stats, error } = await this.adminClient
        .from('game_rooms')
        .select('status, created_at, last_activity, current_players');

      if (error) throw error;

      const now = Date.now();
      const oneHourAgo = now - (60 * 60 * 1000);
      const oneDayAgo = now - (24 * 60 * 60 * 1000);
      const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);

      const summary = {
        total: stats.length,
        byStatus: {},
        byAge: {
          lastHour: 0,
          lastDay: 0,
          lastWeek: 0,
          older: 0
        },
        byActivity: {
          active: 0,
          idle: 0,
          stale: 0
        }
      };

      stats.forEach(room => {
        // Count by status
        summary.byStatus[room.status] = (summary.byStatus[room.status] || 0) + 1;

        // Count by age
        const roomAge = now - new Date(room.created_at).getTime();
        if (roomAge < oneHourAgo) summary.byAge.lastHour++;
        else if (roomAge < oneDayAgo) summary.byAge.lastDay++;
        else if (roomAge < oneWeekAgo) summary.byAge.lastWeek++;
        else summary.byAge.older++;

        // Count by activity
        const lastActivity = new Date(room.last_activity || room.created_at).getTime();
        const idleTime = now - lastActivity;
        
        if (idleTime < (10 * 60 * 1000)) summary.byActivity.active++; // Active in last 10 min
        else if (idleTime < (60 * 60 * 1000)) summary.byActivity.idle++; // Idle for less than 1 hour
        else summary.byActivity.stale++; // Stale for more than 1 hour
      });

      return summary;
    } catch (error) {
      console.error('Error getting room stats:', error);
      return null;
    }
  }

  // Get active rooms for discovery
  async getActiveRooms(filters = {}) {
    try {
      let query = this.adminClient
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