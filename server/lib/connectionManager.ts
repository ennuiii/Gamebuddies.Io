// Connection Manager - Handles connection state and prevents race conditions

export interface ConnectionData {
  socketId: string;
  connectedAt: Date;
  lastActivity: Date;
  userId: string | null;
  username: string | null;
  roomId: string | null;
  roomCode: string | null;
  [key: string]: unknown;
}

interface ConnectionLock {
  socketId: string;
  timestamp: number;
}

interface ConnectionStats {
  totalConnections: number;
  activeRooms: number;
  activeUsers: number;
  activeLocks: number;
  averageConnectionAge: number;
  connectionsByRoom: Record<string, number>;
}

class ConnectionManager {
  protected activeConnections: Map<string, ConnectionData>;
  protected connectionLocks: Map<string, ConnectionLock>;
  protected connectionAttempts: Map<string, number[]>;

  constructor() {
    this.activeConnections = new Map();
    this.connectionLocks = new Map();
    this.connectionAttempts = new Map();
  }

  // Track a new connection
  addConnection(socketId: string, initialData: Partial<ConnectionData> = {}): void {
    this.activeConnections.set(socketId, {
      socketId,
      connectedAt: new Date(),
      lastActivity: new Date(),
      userId: null,
      username: null,
      roomId: null,
      roomCode: null,
      ...initialData
    });
  }

  // Update connection data
  updateConnection(socketId: string, updates: Partial<ConnectionData>): void {
    const connection = this.activeConnections.get(socketId);
    if (connection) {
      Object.assign(connection, updates, {
        lastActivity: new Date()
      });
    }
  }

  // Get connection by socket ID
  getConnection(socketId: string): ConnectionData | undefined {
    return this.activeConnections.get(socketId);
  }

  // Get all connections for a room by ID
  getRoomConnections(roomId: string): ConnectionData[] {
    return Array.from(this.activeConnections.values())
      .filter(conn => conn.roomId === roomId);
  }

  // Get all connections for a room by Code
  getRoomConnectionsByCode(roomCode: string): ConnectionData[] {
    return Array.from(this.activeConnections.values())
      .filter(conn => conn.roomCode === roomCode);
  }

  // Get all connections for a user
  getUserConnections(userId: string): ConnectionData[] {
    return Array.from(this.activeConnections.values())
      .filter(conn => conn.userId === userId);
  }

  // Remove a connection
  removeConnection(socketId: string): ConnectionData | undefined {
    const connection = this.activeConnections.get(socketId);
    this.activeConnections.delete(socketId);

    // Clean up any locks
    if (connection) {
      const lockKey = this.getLockKey(connection.username, connection.roomCode);
      this.connectionLocks.delete(lockKey);
    }

    return connection;
  }

  // Check and acquire a connection lock
  acquireLock(username: string | null, roomCode: string | null, socketId: string): boolean {
    const lockKey = this.getLockKey(username, roomCode);

    // Check if already locked
    const existingLock = this.connectionLocks.get(lockKey);
    if (existingLock && existingLock.socketId !== socketId) {
      // Check if the lock is stale (older than 5 seconds)
      const lockAge = Date.now() - existingLock.timestamp;
      if (lockAge < 5000) {
        return false; // Lock is held by another connection
      }
    }

    // Acquire the lock
    this.connectionLocks.set(lockKey, {
      socketId,
      timestamp: Date.now()
    });

    return true;
  }

  // Release a connection lock
  releaseLock(username: string | null, roomCode: string | null): void {
    const lockKey = this.getLockKey(username, roomCode);
    this.connectionLocks.delete(lockKey);
  }

  // Get lock key
  getLockKey(username: string | null, roomCode: string | null): string {
    return `${username}_${roomCode}`.toLowerCase();
  }

  // Track connection attempts (for rate limiting)
  trackConnectionAttempt(socketId: string, action: string): number {
    const key = `${socketId}_${action}`;
    const attempts = this.connectionAttempts.get(key) || [];
    const now = Date.now();

    // Keep only attempts from the last minute
    const recentAttempts = attempts.filter(timestamp => now - timestamp < 60000);
    recentAttempts.push(now);

    this.connectionAttempts.set(key, recentAttempts);
    return recentAttempts.length;
  }

  // Check if rate limit exceeded
  isRateLimited(socketId: string, action: string, limit: number = 10): boolean {
    const attempts = this.trackConnectionAttempt(socketId, action);
    return attempts > limit;
  }

  // Clean up stale connections
  cleanupStaleConnections(maxIdleMs: number = 300000): string[] { // 5 minutes default
    const now = Date.now();
    const staleConnections: string[] = [];

    for (const [socketId, connection] of this.activeConnections) {
      const idleTime = now - connection.lastActivity.getTime();
      if (idleTime > maxIdleMs) {
        staleConnections.push(socketId);
        this.activeConnections.delete(socketId);
      }
    }

    // Clean up old locks
    for (const [lockKey, lock] of this.connectionLocks) {
      if (now - lock.timestamp > 10000) { // 10 seconds
        this.connectionLocks.delete(lockKey);
      }
    }

    // Clean up old rate limit data
    for (const [key, attempts] of this.connectionAttempts) {
      const recentAttempts = attempts.filter(t => now - t < 60000);
      if (recentAttempts.length === 0) {
        this.connectionAttempts.delete(key);
      } else {
        this.connectionAttempts.set(key, recentAttempts);
      }
    }

    return staleConnections;
  }

  // Get statistics
  getStats(): ConnectionStats {
    const connections = Array.from(this.activeConnections.values());
    const now = Date.now();

    return {
      totalConnections: connections.length,
      activeRooms: new Set(connections.map(c => c.roomId).filter(Boolean)).size,
      activeUsers: new Set(connections.map(c => c.userId).filter(Boolean)).size,
      activeLocks: this.connectionLocks.size,
      averageConnectionAge: connections.length > 0
        ? connections.reduce((sum, c) => sum + (now - c.connectedAt.getTime()), 0) / connections.length / 1000
        : 0,
      connectionsByRoom: connections.reduce((acc: Record<string, number>, conn) => {
        if (conn.roomCode) {
          acc[conn.roomCode] = (acc[conn.roomCode] || 0) + 1;
        }
        return acc;
      }, {})
    };
  }

  // Check if a user is already in a room
  isUserInRoom(userId: string, roomId: string): boolean {
    return Array.from(this.activeConnections.values()).some(
      conn => conn.userId === userId && conn.roomId === roomId
    );
  }

  // Get or create a connection
  getOrCreateConnection(socketId: string, initialData: Partial<ConnectionData> = {}): ConnectionData | undefined {
    let connection = this.activeConnections.get(socketId);
    if (!connection) {
      this.addConnection(socketId, initialData);
      connection = this.activeConnections.get(socketId);
    }
    return connection;
  }
}

export { ConnectionManager };
export default ConnectionManager;
