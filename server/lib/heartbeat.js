const EventEmitter = require('events');

class HeartbeatManager extends EventEmitter {
  constructor(db, io) {
    super();
    this.db = db;
    this.io = io;
    this.heartbeats = new Map(); // socketId -> { userId, roomId, lastPing, roomCode }
    this.recentHostTransfers = new Map(); // userId -> timestamp of when they became host
    this.heartbeatInterval = 5000; // 5 seconds (changed from 30 seconds to match client)
    this.timeoutThreshold = 10000; // 10 seconds (unchanged - gives 2x heartbeat interval tolerance)
    this.hostGracePeriod = 20000; // 20 seconds grace period for new hosts
    this.cleanupInterval = 5000; // Check every 5 seconds (unchanged)
    
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
    }, 15000); // Every 15 seconds (changed from 30 seconds)
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

  // Refresh heartbeat for a specific user (useful during host transfers)
  refreshHeartbeatForUser(userId) {
    for (const [socketId, heartbeat] of this.heartbeats.entries()) {
      if (heartbeat.userId === userId) {
        heartbeat.lastPing = Date.now();
        console.log(`💓 [HEARTBEAT] Refreshed for user ${userId} (socket: ${socketId})`);
        return true;
      }
    }
    return false;
  }

  // Mark a user as recently becoming host (gives them grace period)
  markRecentHostTransfer(userId) {
    this.recentHostTransfers.set(userId, Date.now());
    console.log(`👑 [HEARTBEAT] Marked ${userId} as recent host transfer - grace period active`);
    
    // Clean up after grace period
    setTimeout(() => {
      this.recentHostTransfers.delete(userId);
      console.log(`👑 [HEARTBEAT] Grace period expired for ${userId}`);
    }, this.hostGracePeriod);
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
      
      // Check if this user recently became host and is in grace period
      const recentHostTransfer = this.recentHostTransfers.get(heartbeat.userId);
      const isInGracePeriod = recentHostTransfer && (now - recentHostTransfer) < this.hostGracePeriod;
      
      // Use extended timeout for recent host transfers
      const effectiveTimeout = isInGracePeriod ? this.hostGracePeriod : this.timeoutThreshold;
      
      if (timeSinceLastPing > effectiveTimeout) {
        staleConnections.push({ socketId, heartbeat });
      } else if (isInGracePeriod) {
        console.log(`👑 [HEARTBEAT] Grace period active for ${heartbeat.userId} (${Math.round((this.hostGracePeriod - (now - recentHostTransfer)) / 1000)}s remaining)`);
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
        
        // Refresh the new host's heartbeat and mark grace period
        if (newHost) {
          this.refreshHeartbeatForUser(newHost.user_id);
          this.markRecentHostTransfer(newHost.user_id);
        }
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
      
      // Find players marked as connected but with old last_ping (15 seconds ago)
      const staleThreshold = new Date(Date.now() - 15000); // 15 seconds ago (changed from 30 seconds)
      
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
            
            // Refresh the new host's heartbeat and mark grace period
            if (newHost) {
              this.refreshHeartbeatForUser(newHost.user_id);
              this.markRecentHostTransfer(newHost.user_id);
            }
            
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