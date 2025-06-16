class HeartbeatClient {
  constructor(socket, interval = 30000) { // 30 seconds
    this.socket = socket;
    this.interval = interval;
    this.heartbeatTimer = null;
    this.isActive = false;
  }

  start() {
    if (this.isActive) {
      console.log('💓 [HEARTBEAT CLIENT] Already active');
      return;
    }

    console.log(`💓 [HEARTBEAT CLIENT] Starting heartbeat (${this.interval}ms interval)`);
    this.isActive = true;
    
    // Send initial heartbeat
    this.sendHeartbeat();
    
    // Set up periodic heartbeat
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.interval);
  }

  stop() {
    if (!this.isActive) {
      return;
    }

    console.log('💓 [HEARTBEAT CLIENT] Stopping heartbeat');
    this.isActive = false;
    
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  sendHeartbeat() {
    if (this.socket && this.socket.connected) {
      console.log('💓 [HEARTBEAT CLIENT] Sending heartbeat');
      this.socket.emit('heartbeat');
    } else {
      console.log('💓 [HEARTBEAT CLIENT] Socket not connected, skipping heartbeat');
    }
  }

  // Update interval (useful for different game states)
  setInterval(newInterval) {
    if (newInterval !== this.interval) {
      console.log(`💓 [HEARTBEAT CLIENT] Updating interval: ${this.interval}ms → ${newInterval}ms`);
      this.interval = newInterval;
      
      if (this.isActive) {
        this.stop();
        this.start();
      }
    }
  }
}

export default HeartbeatClient; 