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
        .from('rooms')
        .insert([{
          room_code: roomCode,
          ...roomData
        }])
        .select()
        .single();

      if (roomError) throw roomError;

      // Log room creation event
      await this.logEvent(room.id, roomData.host_id, 'room_created', {
        current_game: roomData.current_game,
        created_from: roomData.metadata?.created_from || 'unknown'
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
        .from('rooms')
        .select(`
          *,
          host:users!host_id(username, display_name),
          participants:room_members(
            id,
            user_id,
            role,
            is_connected,
            is_ready,
            in_game,
            current_location,
            last_ping,
            joined_at,
            custom_lobby_name,
            user:users(username, display_name, premium_tier, role, avatar_url, avatar_style, avatar_seed, avatar_options)
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
        .from('rooms')
        .select(`
          *,
          host:users!host_id(username, display_name),
          participants:room_members(
            id,
            user_id,
            role,
            is_connected,
            is_ready,
            in_game,
            current_location,
            last_ping,
            joined_at,
            custom_lobby_name,
            user:users(username, display_name, premium_tier, role, avatar_url, avatar_style, avatar_seed, avatar_options)
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
        .from('rooms')
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
  async getOrCreateUser(externalId, username, displayName, additionalFields = {}) {
    try {
      // Always check by username first (since users table uses username as unique)
      let { data: user, error } = await this.adminClient
        .from('users')
        .select('*')
        .eq('username', username)
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 means no rows found, which is ok
        throw error;
      }

      if (user) {
        console.log('✅ Found existing user:', user.username);
        // Update last_seen
        await this.adminClient
          .from('users')
          .update({ last_seen: new Date().toISOString() })
          .eq('id', user.id);
        
        return user;
      }

      // Create new user - try with original username first
      try {
        const { data: newUser, error: createError } = await this.adminClient
          .from('users')
          .insert({
            username: username,
            display_name: displayName || username,
            ...additionalFields
          })
          .select()
          .single();

        if (createError) throw createError;

        console.log('✅ Created new user:', newUser.username);
        return newUser;
      } catch (createError) {
        // If username exists, try with timestamp suffix
        if (createError.code === '23505') { // unique constraint violation
          const uniqueUsername = `${username}_${Date.now()}`;
          const { data: newUser, error: retryError } = await this.adminClient
            .from('users')
            .insert({
              username: uniqueUsername,
              display_name: displayName || username,
              ...additionalFields
            })
            .select()
            .single();

          if (retryError) throw retryError;

          console.log('✅ Created new user with unique username:', newUser.username);
          return newUser;
        }
        throw createError;
      }

    } catch (error) {
      console.error('Error in getOrCreateUser:', error);
      throw error;
    }
  }

  // Participant management
  async addParticipant(roomId, userId, socketId, role = 'player', customLobbyName = null) {
    try {
      const { data: participant, error } = await this.adminClient
        .from('room_members')
        .upsert({
          room_id: roomId,
          user_id: userId,
          role: role,
          is_connected: true,
          current_location: 'lobby',
          last_ping: new Date().toISOString(),
          socket_id: socketId,
          custom_lobby_name: customLobbyName
        }, {
          onConflict: 'room_id, user_id'
        })
        .select(`
          *,
          user:users(username, display_name, role)
        `)
        .single();

      if (error) throw error;

      // Log join event
      await this.logEvent(roomId, userId, 'player_joined', {
        role: role,
        socket_id: socketId,
        custom_lobby_name: customLobbyName
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
        .from('room_members')
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

  async updateParticipantConnection(userId, socketId, status = 'connected', customLobbyName = null) {
    try {
      const updateData = {
        is_connected: status === 'connected',
        last_ping: new Date().toISOString(),
        socket_id: status === 'connected' ? socketId : null
      };

      // Update custom lobby name if provided
      if (customLobbyName !== null) {
        updateData.custom_lobby_name = customLobbyName;
      }

      // Update location based on connection status
      if (status === 'disconnected') {
        updateData.current_location = 'disconnected';
      } else if (status === 'connected') {
        updateData.current_location = 'lobby';
      } else if (status === 'game') {
        // Player is in external game - keep them connected but mark location as 'game'
        updateData.is_connected = true;
        updateData.current_location = 'game';
        updateData.socket_id = null; // No socket connection while in external game
      }

      const { error } = await this.adminClient
        .from('room_members')
        .update(updateData)
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
        .from('room_members')
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
        .from('room_members')
        .select('*')
        .eq('room_id', roomId)
        .eq('user_id', newHostUserId)
        .single();

      if (newHostError || !newHost) {
        throw new Error('Target user is not in this room');
      }

      // Update current host to player
      const { error: demoteError } = await this.adminClient
        .from('room_members')
        .update({ role: 'player' })
        .eq('room_id', roomId)
        .eq('user_id', currentHostUserId);

      if (demoteError) throw demoteError;

      // Update new user to host
      const { error: promoteError } = await this.adminClient
        .from('room_members')
        .update({ role: 'host' })
        .eq('room_id', roomId)
        .eq('user_id', newHostUserId);

      if (promoteError) {
        // Rollback: restore original host
        await this.adminClient
          .from('room_members')
          .update({ role: 'host' })
          .eq('room_id', roomId)
          .eq('user_id', currentHostUserId);
        throw promoteError;
      }

      // Update room host_id
      await this.adminClient
        .from('rooms')
        .update({ host_id: newHostUserId })
        .eq('id', roomId);

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

      // First, demote the old host to player role (essential to prevent multiple hosts)
      const { error: demoteError } = await this.adminClient
        .from('room_members')
        .update({ role: 'player' })
        .eq('room_id', roomId)
        .eq('user_id', leavingHostUserId);

      if (demoteError) {
        console.error('❌ Failed to demote old host:', demoteError);
        // Continue anyway - the old host might already be removed
      } else {
        console.log(`✅ Demoted old host ${leavingHostUserId} to player role`);
      }

      // Find the next suitable host (longest-connected player)
      const { data: participants, error } = await this.adminClient
        .from('room_members')
        .select(`
          *,
          user:users(username, display_name, role)
        `)
        .eq('room_id', roomId)
        .eq('is_connected', true)
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
        .from('room_members')
        .update({ role: 'host' })
        .eq('room_id', roomId)
        .eq('user_id', newHost.user_id);

      if (updateError) throw updateError;

      // Update room host_id
      await this.adminClient
        .from('rooms')
        .update({ host_id: newHost.user_id })
        .eq('id', roomId);

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
          event_data: eventData
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
        .from('game_sessions')
        .select('id')
        .eq('room_id', roomId)
        .order('started_at', { ascending: false })
        .limit(1)
        .single();

      const { data: gameState, error } = await this.adminClient
        .from('game_sessions')
        .insert([{
          room_id: roomId,
          game_id: gameType,
          game_state: stateData,
          participants: [{ user_id: createdBy }]
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
        .from('game_sessions')
        .select('*')
        .eq('room_id', roomId)
        .order('started_at', { ascending: false })
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
      const { error } = await this.adminClient.rpc('cleanup_inactive_rooms');
      if (error) throw error;
    } catch (error) {
      console.error('Error cleaning up stale connections:', error);
    }
  }

  async refreshActiveRoomsView() {
    try {
      // This would refresh a materialized view if we had one
      console.log('✅ Active rooms refreshed');
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

      console.log('🧹 [CLEANUP DEBUG] Starting room cleanup...', {
        maxAgeHours,
        maxIdleMinutes,
        includeAbandoned,
        includeCompleted,
        dryRun,
        timestamp: new Date().toISOString()
      });

      // Calculate cutoff times
      const maxAgeDate = new Date(Date.now() - (maxAgeHours * 60 * 60 * 1000));
      const maxIdleDate = new Date(Date.now() - (maxIdleMinutes * 60 * 1000));

      console.log('🧹 [CLEANUP DEBUG] Cutoff times:', {
        maxAgeDate: maxAgeDate.toISOString(),
        maxIdleDate: maxIdleDate.toISOString(),
        currentTime: new Date().toISOString()
      });

      // Build query for rooms to cleanup
      let query = this.adminClient
        .from('rooms')
        .select(`
          id,
          room_code,
          status,
          created_at,
          last_activity,
          current_game,
          participants:room_members(
            id,
            user_id,
            is_connected,
            last_ping,
            user:users(username, display_name)
          )
        `);

      // Get rooms matching cleanup conditions
      const { data: roomsToCleanup, error: queryError } = await this.adminClient
        .from('rooms')
        .select(`
          id,
          room_code,
          status,
          created_at,
          last_activity,
          current_game,
          participants:room_members(
            id,
            user_id,
            is_connected,
            last_ping,
            user:users(username, display_name)
          )
        `)
        .or(`created_at.lt.${maxAgeDate.toISOString()},last_activity.lt.${maxIdleDate.toISOString()}`);

      if (queryError) throw queryError;

      console.log(`🧹 [CLEANUP DEBUG] Initial query found ${roomsToCleanup?.length || 0} rooms`);

      if (!roomsToCleanup || roomsToCleanup.length === 0) {
        console.log('✅ [CLEANUP DEBUG] No rooms need cleanup');
        return { cleaned: 0, rooms: [] };
      }

      // Filter rooms that actually need cleanup
      const roomsNeedingCleanup = roomsToCleanup.filter(room => {
        const roomAge = Date.now() - new Date(room.created_at).getTime();
        const roomIdle = Date.now() - new Date(room.last_activity || room.created_at).getTime();
        const hasConnectedPlayers = room.participants?.some(p => p.is_connected);
        const connectedPlayerCount = room.participants?.filter(p => p.is_connected).length || 0;

        const shouldCleanup = (
          // Too old
          roomAge > (maxAgeHours * 60 * 60 * 1000) ||
          // Too idle and no connected players
          (roomIdle > (maxIdleMinutes * 60 * 1000) && !hasConnectedPlayers)
        );

        // Enhanced debugging for each room
        console.log(`🧹 [CLEANUP DEBUG] Room analysis: ${room.room_code}`, {
          status: room.status,
          current_game: room.current_game,
          ageHours: Math.round(roomAge / (60 * 60 * 1000) * 100) / 100,
          idleMinutes: Math.round(roomIdle / (60 * 1000) * 100) / 100,
          connectedPlayers: connectedPlayerCount,
          hasConnectedPlayers,
          shouldCleanup,
          reasons: {
            tooOld: roomAge > (maxAgeHours * 60 * 60 * 1000),
            tooIdle: roomIdle > (maxIdleMinutes * 60 * 1000),
            noConnectedPlayers: !hasConnectedPlayers
          }
        });

        // Special protection for active game rooms with connected players
        if (room.status === 'in_game' && hasConnectedPlayers && room.current_game !== 'lobby') {
          console.log(`⚠️ [CLEANUP PROTECTION] Protecting active game room: ${room.room_code}`, {
            status: room.status,
            current_game: room.current_game,
            connected_players: connectedPlayerCount,
            participants: room.participants?.map(p => ({
              username: p.user?.username || p.user?.display_name,
              is_connected: p.is_connected,
              last_ping: p.last_ping
            }))
          });
          return false; // Don't cleanup active game rooms with connected players
        }

        return shouldCleanup;
      });

      console.log(`🔍 [CLEANUP DEBUG] Found ${roomsNeedingCleanup.length} rooms to cleanup:`, 
        roomsNeedingCleanup.map(r => ({
          code: r.room_code,
          status: r.status,
          current_game: r.current_game,
          age: Math.round((Date.now() - new Date(r.created_at).getTime()) / (60 * 60 * 1000)) + 'h',
          idle: Math.round((Date.now() - new Date(r.last_activity || r.created_at).getTime()) / (60 * 1000)) + 'm',
          connected_players: r.participants?.filter(p => p.is_connected).length || 0
        }))
      );

      if (dryRun) {
        console.log('🧹 [CLEANUP DEBUG] Dry run mode - no rooms will be deleted');
        return { 
          cleaned: 0, 
          rooms: roomsNeedingCleanup.map(r => r.room_code),
          wouldClean: roomsNeedingCleanup.length
        };
      }

      // Actually delete the rooms
      let cleanedCount = 0;
      const cleanedRooms = [];
      const failedCleanups = [];

      for (const room of roomsNeedingCleanup) {
        try {
          console.log(`🗑️ [CLEANUP DEBUG] Deleting room: ${room.room_code}`, {
            status: room.status,
            current_game: room.current_game,
            participants: room.participants?.length || 0
          });
          
          await this.deleteRoom(room.id);
          cleanedCount++;
          cleanedRooms.push(room.room_code);
          console.log(`✅ [CLEANUP DEBUG] Successfully cleaned up room: ${room.room_code}`);
        } catch (error) {
          console.error(`❌ [CLEANUP ERROR] Failed to cleanup room ${room.room_code}:`, {
            error: error.message,
            room_id: room.id,
            status: room.status
          });
          failedCleanups.push({
            room_code: room.room_code,
            error: error.message
          });
        }
      }

      console.log(`✅ [CLEANUP DEBUG] Room cleanup completed:`, {
        attempted: roomsNeedingCleanup.length,
        successful: cleanedCount,
        failed: failedCleanups.length,
        cleanedRooms,
        failedCleanups
      });
      
      return { cleaned: cleanedCount, rooms: cleanedRooms, failed: failedCleanups };

    } catch (error) {
      console.error('❌ [CLEANUP ERROR] Error during room cleanup:', {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  async deleteRoom(roomId) {
    try {
      // Delete in order due to foreign key constraints
      
      // 1. Delete game sessions
      await this.adminClient
        .from('game_sessions')
        .delete()
        .eq('room_id', roomId);

      // 2. Delete room events
      await this.adminClient
        .from('room_events')
        .delete()
        .eq('room_id', roomId);

      // 3. Delete room members
      await this.adminClient
        .from('room_members')
        .delete()
        .eq('room_id', roomId);

      // 4. Delete the room itself
      const { error } = await this.adminClient
        .from('rooms')
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
        .from('rooms')
        .select('status, created_at, last_activity');

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
        .from('rooms')
        .select(`
          *,
          host:users!host_id(username, display_name, premium_tier, role),
          members:room_members(
            id,
            user_id,
            role,
            is_connected,
            custom_lobby_name,
            user:users(username, display_name, premium_tier, role)
          )
        `);

      if (filters.gameType && filters.gameType !== 'all') {
        query = query.eq('current_game', filters.gameType);
      }

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.isPublic !== undefined) {
        query = query.eq('is_public', filters.isPublic);
      }

      const { data: rooms, error } = await query
        .eq('is_public', true)
        .in('status', ['lobby', 'in_game'])
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      if (rooms && rooms.length > 0) {
        console.log('🔍 [DEBUG] getActiveRooms sample data:', {
          count: rooms.length,
          firstRoomHost: rooms[0].host,
          firstRoomHostRole: rooms[0].host?.role,
          firstRoomMembers: rooms[0].members?.map(m => ({ uid: m.user_id, role: m.user?.role }))
        });
      }

      return rooms || [];
    } catch (error) {
      console.error('Error getting active rooms:', error);
      return [];
    }
  }

  // Cleanup stale players and rooms
  async cleanupStaleData() {
    try {
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

      console.log('🧹 [CLEANUP] Running stale data cleanup...');

      // Mark players as disconnected if no ping for 5 minutes
      const { data: stalePlayers, error: staleError } = await this.adminClient
        .from('room_members')
        .update({
          is_connected: false,
          current_location: 'disconnected'
        })
        .eq('is_connected', true)
        .lt('last_ping', fiveMinutesAgo.toISOString())
        .select('user_id, room_id');

      if (staleError) {
        console.error('❌ [CLEANUP] Error marking stale players:', staleError);
      } else if (stalePlayers && stalePlayers.length > 0) {
        console.log(`🧹 [CLEANUP] Marked ${stalePlayers.length} stale players as disconnected`);
      }

      // Find rooms with no connected players and mark as abandoned
      const { data: emptyRooms, error: emptyError } = await this.adminClient
        .from('rooms')
        .select(`
          id,
          room_code,
          status,
          room_members!inner(is_connected)
        `)
        .in('status', ['lobby', 'in_game']);

      if (emptyError) {
        console.error('❌ [CLEANUP] Error finding empty rooms:', emptyError);
      } else if (emptyRooms) {
        // Check each room for connected members
        for (const room of emptyRooms) {
          const connectedCount = room.room_members?.filter(m => m.is_connected).length || 0;
          if (connectedCount === 0) {
            await this.adminClient
              .from('rooms')
              .update({ status: 'abandoned' })
              .eq('id', room.id);
            console.log(`🏚️ [CLEANUP] Room ${room.room_code} marked as abandoned - no connected players`);
          }
        }
      }

      // Also check rooms that have NO members at all
      const { data: orphanRooms, error: orphanError } = await this.adminClient
        .from('rooms')
        .select(`
          id,
          room_code,
          room_members(id)
        `)
        .in('status', ['lobby', 'in_game']);

      if (!orphanError && orphanRooms) {
        for (const room of orphanRooms) {
          if (!room.room_members || room.room_members.length === 0) {
            await this.adminClient
              .from('rooms')
              .update({ status: 'abandoned' })
              .eq('id', room.id);
            console.log(`🏚️ [CLEANUP] Room ${room.room_code} marked as abandoned - no members`);
          }
        }
      }

      console.log('✅ [CLEANUP] Stale data cleanup completed');
      return { success: true };
    } catch (error) {
      console.error('❌ [CLEANUP] Cleanup failed:', error);
      return { success: false, error };
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