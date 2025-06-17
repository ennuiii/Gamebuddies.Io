const EventEmitter = require('events');

class HeartbeatManager extends EventEmitter {
  constructor(db, io) {
    super();
    this.db = db;
    this.io = io;
    this.heartbeats = new Map(); // socketId -> { userId, roomId, lastPing, roomCode }
    this.heartbeatInterval = 30000; // 30 seconds
    this.timeoutThreshold = 10000; // 10 seconds (changed from 60 seconds)
    this.cleanupInterval = 5000; // Check every 5 seconds (changed from 15 seconds)
    
    this.startHeartbeatSystem();
  }

  startHeartbeatSystem() {
    console.log('💓 Starting heartbeat system...');
    
    // Periodic cleanup of stale connections
    setInterval(() => {
      this.checkStaleConnections();
    }, this.cleanupInterval);

    // Database-based cleanup (for connections that weren't properly cleaned up)
    setInterval(() => {
      this.cleanupStaleDatabase();
    }, 30000); // Every 30 seconds (changed from 60 seconds)
  }

  // Register a player's heartbeat
  registerHeartbeat(socketId, userId, roomId, roomCode) {
    this.heartbeats.set(socketId, {
      userId,
      roomId,
      roomCode,
      lastPing: Date.now()
    });
    
    console.log(`💓 [HEARTBEAT] Registered: ${socketId} (User: ${userId}, Room: ${roomCode})`);
  }

  // Update heartbeat timestamp
  updateHeartbeat(socketId) {
    const heartbeat = this.heartbeats.get(socketId);
    if (heartbeat) {
      heartbeat.lastPing = Date.now();
      console.log(`💓 [HEARTBEAT] Updated: ${socketId}`);
      return true;
    }
    return false;
  }

  // Remove heartbeat when socket disconnects
  removeHeartbeat(socketId) {
    const heartbeat = this.heartbeats.get(socketId);
    if (heartbeat) {
      console.log(`💓 [HEARTBEAT] Removed: ${socketId} (User: ${heartbeat.userId})`);
      this.heartbeats.delete(socketId);
      return heartbeat;
    }
    return null;
  }

  // Check for stale connections and mark as disconnected
  async checkStaleConnections() {
    const now = Date.now();
    const staleConnections = [];

    for (const [socketId, heartbeat] of this.heartbeats.entries()) {
      const timeSinceLastPing = now - heartbeat.lastPing;
      
      if (timeSinceLastPing > this.timeoutThreshold) {
        staleConnections.push({ socketId, heartbeat });
      }
    }

    if (staleConnections.length > 0) {
      console.log(`💓 [HEARTBEAT] Found ${staleConnections.length} stale connections`);
      
      for (const { socketId, heartbeat } of staleConnections) {
        await this.handleStaleConnection(socketId, heartbeat);
      }
    }
  }

  // Handle a stale connection
  async handleStaleConnection(socketId, heartbeat) {
    try {
      console.log(`💓 [HEARTBEAT] Handling stale connection: ${socketId} (User: ${heartbeat.userId})`);
      
      // Remove from heartbeat tracking
      this.heartbeats.delete(socketId);

      // Get room data to check current status
      const room = await this.db.getRoomById(heartbeat.roomId);
      if (!room) {
        console.log(`💓 [HEARTBEAT] Room ${heartbeat.roomId} no longer exists`);
        return;
      }

      const participant = room.participants?.find(p => p.user_id === heartbeat.userId);
      if (!participant) {
        console.log(`💓 [HEARTBEAT] User ${heartbeat.userId} no longer in room`);
        return;
      }

      // Check if this is the host
      const isHost = participant.role === 'host';

      // Mark player as disconnected (but keep in database)
      await this.db.updateParticipantConnection(heartbeat.userId, null, 'disconnected');

      // Handle instant host transfer if host disconnected
      let newHost = null;
      if (isHost) {
        console.log(`👑 [HEARTBEAT] Host ${heartbeat.userId} disconnected - transferring host instantly`);
        newHost = await this.db.autoTransferHost(heartbeat.roomId, heartbeat.userId);
      }

      // Get updated room data
      const updatedRoom = await this.db.getRoomById(heartbeat.roomId);
      
      // Notify other players in the room
      const allPlayers = updatedRoom?.participants?.map(p => ({
        id: p.user_id,
        name: p.user?.display_name || p.user?.username,
        isHost: p.role === 'host',
        isConnected: p.is_connected,
        inGame: p.in_game,
        currentLocation: p.current_location,
        lastPing: p.last_ping
      })) || [];

      // Emit different events based on whether host was transferred
      if (newHost) {
        this.io.to(heartbeat.roomCode).emit('hostTransferred', {
          oldHostId: heartbeat.userId,
          newHostId: newHost.user_id,
          newHostName: newHost.user?.display_name || newHost.user?.username,
          reason: 'original_host_disconnected',
          players: allPlayers,
          room: updatedRoom
        });
        console.log(`👑 [HEARTBEAT] Instantly transferred host to ${newHost.user?.display_name || newHost.user?.username}`);
      } else {
        this.io.to(heartbeat.roomCode).emit('playerDisconnected', {
          playerId: heartbeat.userId,
          wasHost: isHost,
          reason: 'heartbeat_timeout',
          players: allPlayers,
          room: updatedRoom
        });
      }

      console.log(`💓 [HEARTBEAT] Player ${heartbeat.userId} marked as disconnected after 10s timeout`);

    } catch (error) {
      console.error(`💓 [HEARTBEAT] Error handling stale connection:`, error);
    }
  }

  // Database cleanup for connections that weren't properly handled
  async cleanupStaleDatabase() {
    try {
      console.log('💓 [HEARTBEAT] Running database cleanup...');
      
      // Find players marked as connected but with old last_ping (30 seconds ago)
      const staleThreshold = new Date(Date.now() - 30000); // 30 seconds ago
      
      const { data: stalePlayers, error } = await this.db.adminClient
        .from('room_members')
        .select(`
          user_id,
          room_id,
          role,
          last_ping,
          is_connected,
          in_game,
          current_location,
          room:rooms(room_code, status)
        `)
        .eq('is_connected', true)
        .lt('last_ping', staleThreshold.toISOString());

      if (error) throw error;

      if (stalePlayers && stalePlayers.length > 0) {
        console.log(`💓 [HEARTBEAT] Found ${stalePlayers.length} stale database entries`);
        
        for (const player of stalePlayers) {
          const isHost = player.role === 'host';
          
          // Mark as disconnected (but keep in database)
          await this.db.updateParticipantConnection(player.user_id, null, 'disconnected');
          
          // Handle instant host transfer if host disconnected
          let newHost = null;
          if (isHost) {
            console.log(`👑 [HEARTBEAT] Host ${player.user_id} found stale in database - transferring host instantly`);
            newHost = await this.db.autoTransferHost(player.room_id, player.user_id);
            
            if (newHost && player.room?.room_code) {
              // Get updated room data
              const updatedRoom = await this.db.getRoomById(player.room_id);
              const allPlayers = updatedRoom?.participants?.map(p => ({
                id: p.user_id,
                name: p.user?.display_name || p.user?.username,
                isHost: p.role === 'host',
                isConnected: p.is_connected,
                inGame: p.in_game,
                currentLocation: p.current_location,
                lastPing: p.last_ping
              })) || [];

              this.io.to(player.room.room_code).emit('hostTransferred', {
                oldHostId: player.user_id,
                newHostId: newHost.user_id,
                newHostName: newHost.user?.display_name || newHost.user?.username,
                reason: 'original_host_disconnected',
                players: allPlayers,
                room: updatedRoom
              });
              console.log(`👑 [HEARTBEAT] Database cleanup: Instantly transferred host to ${newHost.user?.display_name || newHost.user?.username}`);
            }
          }
          
          console.log(`💓 [HEARTBEAT] Database cleanup: Updated player ${player.user_id} to disconnected${isHost ? ' (was host)' : ''} - kept in database`);
        }
      }

    } catch (error) {
      console.error('💓 [HEARTBEAT] Error in database cleanup:', error);
    }
  }

  // Get heartbeat stats
  getStats() {
    return {
      activeHeartbeats: this.heartbeats.size,
      heartbeatInterval: this.heartbeatInterval,
      timeoutThreshold: this.timeoutThreshold,
      connections: Array.from(this.heartbeats.entries()).map(([socketId, data]) => ({
        socketId,
        userId: data.userId,
        roomCode: data.roomCode,
        lastPing: new Date(data.lastPing).toISOString(),
        age: Date.now() - data.lastPing
      }))
    };
  }
}

module.exports = HeartbeatManager; 