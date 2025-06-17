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
    let foundConnections = 0;
    let refreshedConnections = 0;
    
    console.log(`💓 [HEARTBEAT] Attempting to refresh heartbeat for user ${userId}...`);
    console.log(`💓 [HEARTBEAT] Currently tracking ${this.heartbeats.size} heartbeats`);
    
    for (const [socketId, heartbeat] of this.heartbeats.entries()) {
      if (heartbeat.userId === userId) {
        foundConnections++;
        const oldPing = heartbeat.lastPing;
        heartbeat.lastPing = Date.now();
        refreshedConnections++;
        
        console.log(`💓 [HEARTBEAT] Refreshed heartbeat for user ${userId}:`, {
          socketId,
          roomCode: heartbeat.roomCode,
          oldPing: new Date(oldPing).toISOString(),
          newPing: new Date(heartbeat.lastPing).toISOString(),
          timeDiff: heartbeat.lastPing - oldPing
        });
      }
    }
    
    console.log(`💓 [HEARTBEAT] Refresh summary for user ${userId}:`, {
      foundConnections,
      refreshedConnections,
      success: refreshedConnections > 0
    });
    
    // Also log all current heartbeats for debugging
    if (foundConnections === 0) {
      console.log(`❌ [HEARTBEAT] No heartbeats found for user ${userId}. Current heartbeats:`, 
        Array.from(this.heartbeats.entries()).map(([socketId, hb]) => ({
          socketId,
          userId: hb.userId,
          roomCode: hb.roomCode,
          lastPing: new Date(hb.lastPing).toISOString(),
          ageSeconds: Math.round((Date.now() - hb.lastPing) / 1000)
        }))
      );
    }
    
    return refreshedConnections > 0;
  }

  // Mark a user as recently becoming host (gives them grace period)
  markRecentHostTransfer(userId) {
    const now = Date.now();
    this.recentHostTransfers.set(userId, now);
    
    console.log(`👑 [HEARTBEAT] Marked ${userId} as recent host transfer:`, {
      userId,
      timestamp: new Date(now).toISOString(),
      gracePeriodMs: this.hostGracePeriod,
      gracePeriodSeconds: this.hostGracePeriod / 1000,
      expiresAt: new Date(now + this.hostGracePeriod).toISOString()
    });
    
    // Clean up after grace period
    setTimeout(() => {
      const wasRemoved = this.recentHostTransfers.delete(userId);
      console.log(`👑 [HEARTBEAT] Grace period expired for ${userId}:`, {
        userId,
        wasInGracePeriod: wasRemoved,
        expiredAt: new Date().toISOString()
      });
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

    console.log(`💓 [HEARTBEAT] Checking ${this.heartbeats.size} connections for staleness...`);

    for (const [socketId, heartbeat] of this.heartbeats.entries()) {
      const timeSinceLastPing = now - heartbeat.lastPing;
      
      // Check if this user recently became host and is in grace period
      const recentHostTransfer = this.recentHostTransfers.get(heartbeat.userId);
      const isInGracePeriod = recentHostTransfer && (now - recentHostTransfer) < this.hostGracePeriod;
      
      // Use extended timeout for recent host transfers
      const effectiveTimeout = isInGracePeriod ? this.hostGracePeriod : this.timeoutThreshold;
      
      const isStale = timeSinceLastPing > effectiveTimeout;
      
      // Enhanced logging for each connection
      console.log(`💓 [HEARTBEAT] Connection check for ${socketId}:`, {
        userId: heartbeat.userId,
        roomCode: heartbeat.roomCode,
        timeSinceLastPingMs: timeSinceLastPing,
        timeSinceLastPingSeconds: Math.round(timeSinceLastPing / 1000),
        isInGracePeriod,
        gracePeriodRemainingMs: isInGracePeriod ? this.hostGracePeriod - (now - recentHostTransfer) : 0,
        gracePeriodRemainingSeconds: isInGracePeriod ? Math.round((this.hostGracePeriod - (now - recentHostTransfer)) / 1000) : 0,
        effectiveTimeoutMs: effectiveTimeout,
        effectiveTimeoutSeconds: Math.round(effectiveTimeout / 1000),
        isStale,
        lastPing: new Date(heartbeat.lastPing).toISOString()
      });
      
      if (isStale) {
        staleConnections.push({ socketId, heartbeat });
      } else if (isInGracePeriod) {
        console.log(`👑 [HEARTBEAT] Grace period protection active for ${heartbeat.userId}:`, {
          remainingTimeMs: this.hostGracePeriod - (now - recentHostTransfer),
          remainingTimeSeconds: Math.round((this.hostGracePeriod - (now - recentHostTransfer)) / 1000)
        });
      }
    }

    if (staleConnections.length > 0) {
      console.log(`💓 [HEARTBEAT] Found ${staleConnections.length} stale connections:`, 
        staleConnections.map(({ socketId, heartbeat }) => ({
          socketId,
          userId: heartbeat.userId,
          roomCode: heartbeat.roomCode,
          ageSeconds: Math.round((now - heartbeat.lastPing) / 1000)
        }))
      );
      
      for (const { socketId, heartbeat } of staleConnections) {
        await this.handleStaleConnection(socketId, heartbeat);
      }
    } else {
      console.log(`✅ [HEARTBEAT] No stale connections found`);
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
          console.log(`👑 [HEARTBEAT] Host transfer completed:`, {
            oldHostId: heartbeat.userId,
            newHostId: newHost.user_id,
            newHostName: newHost.user?.display_name || newHost.user?.username,
            roomCode: heartbeat.roomCode
          });
          
          const heartbeatRefreshed = this.refreshHeartbeatForUser(newHost.user_id);
          this.markRecentHostTransfer(newHost.user_id);
          
          console.log(`👑 [HEARTBEAT] Post-transfer protection applied:`, {
            newHostId: newHost.user_id,
            heartbeatRefreshed,
            gracePeriodActive: true
          });
        } else {
          console.log(`❌ [HEARTBEAT] Host transfer failed - no suitable replacement found`);
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
        currentLocation: p.current_location || (p.is_connected ? 'lobby' : 'disconnected'),
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
              console.log(`👑 [HEARTBEAT DB] Host transfer completed:`, {
                oldHostId: player.user_id,
                newHostId: newHost.user_id,
                newHostName: newHost.user?.display_name || newHost.user?.username,
                roomCode: player.room?.room_code
              });
              
              const heartbeatRefreshed = this.refreshHeartbeatForUser(newHost.user_id);
              this.markRecentHostTransfer(newHost.user_id);
              
              console.log(`👑 [HEARTBEAT DB] Post-transfer protection applied:`, {
                newHostId: newHost.user_id,
                heartbeatRefreshed,
                gracePeriodActive: true
              });
              
              if (newHost && player.room?.room_code) {
                // Get updated room data
                const updatedRoom = await this.db.getRoomById(player.room_id);
                const allPlayers = updatedRoom?.participants?.map(p => ({
                  id: p.user_id,
                  name: p.user?.display_name || p.user?.username,
                  isHost: p.role === 'host',
                  isConnected: p.is_connected,
                  inGame: p.in_game,
                  currentLocation: p.current_location || (p.is_connected ? 'lobby' : 'disconnected'),
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
            } else {
              console.log(`❌ [HEARTBEAT DB] Host transfer failed - no suitable replacement found`);
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