const EventEmitter = require('events');

class HeartbeatManager extends EventEmitter {
  constructor(db, io) {
    super();
    this.db = db;
    this.io = io;
    this.heartbeats = new Map(); // socketId -> { userId, roomId, lastPing, roomCode }
    this.heartbeatInterval = 30000; // 30 seconds
    this.timeoutThreshold = 60000; // 60 seconds (2 missed heartbeats)
    this.cleanupInterval = 15000; // Check every 15 seconds
    
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
    }, 60000); // Every minute
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

      // Determine appropriate status based on room and player state
      let newStatus = 'disconnected';
      let newLocation = 'disconnected';

      // If room is in_game and player was in_game, they might be in external game
      if (room.status === 'in_game' && participant.in_game === true) {
        // Check if they've been inactive for a longer period (indicating true disconnect)
        const lastPingTime = new Date(participant.last_ping).getTime();
        const timeSinceLastDbPing = Date.now() - lastPingTime;
        
        if (timeSinceLastDbPing > 120000) { // 2 minutes of no database activity
          newStatus = 'disconnected';
          newLocation = 'disconnected';
          console.log(`💓 [HEARTBEAT] Player ${heartbeat.userId} truly disconnected (no DB activity for 2+ minutes)`);
        } else {
          newStatus = 'game';
          newLocation = 'game';
          console.log(`💓 [HEARTBEAT] Player ${heartbeat.userId} likely in external game`);
        }
      }

      // Update database
      await this.db.updateParticipantConnection(heartbeat.userId, null, newStatus);

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

      this.io.to(heartbeat.roomCode).emit('playerStatusUpdated', {
        playerId: heartbeat.userId,
        status: newLocation,
        reason: 'heartbeat_timeout',
        room: updatedRoom,
        players: allPlayers
      });

      console.log(`💓 [HEARTBEAT] Updated player ${heartbeat.userId} status to ${newStatus}/${newLocation}`);

    } catch (error) {
      console.error(`💓 [HEARTBEAT] Error handling stale connection:`, error);
    }
  }

  // Database cleanup for connections that weren't properly handled
  async cleanupStaleDatabase() {
    try {
      console.log('💓 [HEARTBEAT] Running database cleanup...');
      
      // Find players marked as connected but with old last_ping
      const staleThreshold = new Date(Date.now() - 180000); // 3 minutes ago
      
      const { data: stalePlayers, error } = await this.db.adminClient
        .from('room_members')
        .select(`
          user_id,
          room_id,
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
          // Determine if they should be marked as disconnected or in game
          let newStatus = 'disconnected';
          let newLocation = 'disconnected';
          
          // If room is in_game and player was in_game, they might be in external game
          if (player.room?.status === 'in_game' && player.in_game === true) {
            const timeSinceLastPing = Date.now() - new Date(player.last_ping).getTime();
            
            if (timeSinceLastPing > 300000) { // 5 minutes - definitely disconnected
              newStatus = 'disconnected';
              newLocation = 'disconnected';
            } else {
              newStatus = 'game';
              newLocation = 'game';
            }
          }

          // Update the player's status
          await this.db.updateParticipantConnection(player.user_id, null, newStatus);
          
          console.log(`💓 [HEARTBEAT] Database cleanup: Updated player ${player.user_id} to ${newStatus}/${newLocation}`);
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