import crypto from 'crypto';
import ConnectionManager, { ConnectionData } from './connectionManager';

interface SessionInfo {
  sessionToken: string | null;
  addedAt: Date;
}

interface RecoveryData {
  userId: string;
  roomId: string | null;
  roomCode: string | null;
  metadata: Record<string, unknown>;
  disconnectedAt?: Date;
  createdAt?: Date;
  persistedAt?: Date;
  recoverable: boolean;
}

interface EnhancedConnectionData extends ConnectionData {
  sessionToken: string | null;
  connectionType: 'websocket' | 'api' | 'recovered';
  metadata: Record<string, unknown>;
  isPrimary?: boolean;
  supersededBy?: string;
  supersededAt?: Date;
  markedForTermination?: boolean;
  terminationReason?: string;
  primaryConnection?: string;
}

interface MultipleConnectionResult {
  multipleConnections: boolean;
  strategy?: string;
  totalConnections?: number;
  primary?: string;
  secondary?: string[];
}

interface ConsolidationResult {
  consolidated: boolean;
  reason?: string;
  primaryConnection?: string;
  terminatedConnections?: string[];
  consolidatedAt?: Date;
}

interface EnhancedStats {
  totalConnections: number;
  activeRooms: number;
  activeUsers: number;
  activeLocks: number;
  averageConnectionAge: number;
  connectionsByRoom: Record<string, number>;
  sessionTokens: number;
  recoverableSessions: number;
  multiUserConnections: number;
  connectionTypes: Record<string, number>;
  averageSessionAge: number;
  recoveryStats: {
    totalRecoverable: number;
    oldestRecovery: number;
    newestRecovery: number;
  };
}

class EnhancedConnectionManager extends ConnectionManager {
  private sessionTokens: Map<string, string>; // Session token to connection mapping
  private userSessions: Map<string, Map<string, SessionInfo>>; // User ID to active sessions mapping
  private connectionRecovery: Map<string, RecoveryData>; // Recovery data for failed connections

  constructor() {
    super();
    this.sessionTokens = new Map();
    this.userSessions = new Map();
    this.connectionRecovery = new Map();
  }

  // Enhanced connection tracking with session support
  addConnection(socketId: string, initialData: Partial<EnhancedConnectionData> = {}): EnhancedConnectionData {
    const connection: EnhancedConnectionData = {
      socketId,
      connectedAt: new Date(),
      lastActivity: new Date(),
      userId: null,
      username: null,
      roomId: null,
      roomCode: null,
      sessionToken: null,
      connectionType: 'websocket',
      metadata: {},
      ...initialData
    };

    this.activeConnections.set(socketId, connection);

    // Track session token if provided
    if (connection.sessionToken) {
      this.sessionTokens.set(connection.sessionToken, socketId);
    }

    // Track user session
    if (connection.userId) {
      this.addUserSession(connection.userId, socketId, connection.sessionToken);
    }

    console.log(`📈 [CONNECTION] Added connection ${socketId} for user ${connection.userId}`);
    return connection;
  }

  // Update connection with session management
  updateConnection(socketId: string, updates: Partial<EnhancedConnectionData>): boolean {
    const connection = this.activeConnections.get(socketId) as EnhancedConnectionData | undefined;
    if (!connection) return false;

    // Handle session token changes
    if (updates.sessionToken && updates.sessionToken !== connection.sessionToken) {
      // Remove old token mapping
      if (connection.sessionToken) {
        this.sessionTokens.delete(connection.sessionToken);
      }
      // Add new token mapping
      this.sessionTokens.set(updates.sessionToken, socketId);
    }

    // Handle user ID changes
    if (updates.userId && updates.userId !== connection.userId) {
      // Remove from old user session
      if (connection.userId) {
        this.removeUserSession(connection.userId, socketId);
      }
      // Add to new user session
      this.addUserSession(updates.userId, socketId, updates.sessionToken || null);
    }

    // Apply updates
    Object.assign(connection, updates, {
      lastActivity: new Date()
    });

    console.log(`📝 [CONNECTION] Updated connection ${socketId}`);
    return true;
  }

  // Remove connection with cleanup
  removeConnection(socketId: string): EnhancedConnectionData | undefined {
    const connection = this.activeConnections.get(socketId) as EnhancedConnectionData | undefined;
    if (!connection) return undefined;

    // Store recovery data for potential reconnection
    if (connection.userId && connection.sessionToken) {
      this.connectionRecovery.set(connection.sessionToken, {
        userId: connection.userId,
        roomId: connection.roomId,
        roomCode: connection.roomCode,
        metadata: connection.metadata,
        disconnectedAt: new Date(),
        recoverable: true
      });

      // Auto-expire recovery data after 5 minutes
      setTimeout(() => {
        this.connectionRecovery.delete(connection.sessionToken!);
      }, 5 * 60 * 1000);
    }

    // Clean up session mappings
    if (connection.sessionToken) {
      this.sessionTokens.delete(connection.sessionToken);
    }

    if (connection.userId) {
      this.removeUserSession(connection.userId, socketId);
    }

    // Clean up connection locks
    if (connection.username && connection.roomCode) {
      const lockKey = this.getLockKey(connection.username, connection.roomCode);
      this.connectionLocks.delete(lockKey);
    }

    this.activeConnections.delete(socketId);

    console.log(`📉 [CONNECTION] Removed connection ${socketId} for user ${connection.userId}`);
    return connection;
  }

  // Session recovery
  async recoverSession(sessionToken: string, newSocketId: string): Promise<EnhancedConnectionData> {
    console.log(`🔄 [CONNECTION] Attempting session recovery for token ${sessionToken.substring(0, 8)}...`);

    const recoveryData = this.connectionRecovery.get(sessionToken);
    if (!recoveryData || !recoveryData.recoverable) {
      throw new Error('No recoverable session found');
    }

    // Check if session is too old (more than 24 hours)
    const sessionAge = Date.now() - (recoveryData.disconnectedAt?.getTime() || 0);
    if (sessionAge > 24 * 60 * 60 * 1000) {
      this.connectionRecovery.delete(sessionToken);
      throw new Error('Session expired');
    }

    // Create new connection with recovered data
    const recoveredConnection = this.addConnection(newSocketId, {
      userId: recoveryData.userId,
      roomId: recoveryData.roomId,
      roomCode: recoveryData.roomCode,
      sessionToken: sessionToken,
      connectionType: 'recovered',
      metadata: {
        ...recoveryData.metadata,
        recoveredAt: new Date(),
        originalDisconnect: recoveryData.disconnectedAt,
        recoveryDuration: sessionAge
      }
    });

    // Mark recovery as used
    this.connectionRecovery.delete(sessionToken);

    console.log(`✅ [CONNECTION] Session recovered successfully for user ${recoveryData.userId}`);
    return recoveredConnection;
  }

  // Create session token for connection
  createSessionToken(userId: string, roomId: string): string {
    const token = crypto.randomBytes(32).toString('hex');

    // Store session info for potential recovery
    this.connectionRecovery.set(token, {
      userId,
      roomId,
      roomCode: null,
      metadata: {},
      createdAt: new Date(),
      recoverable: true
    });

    return token;
  }

  // Validate session token
  validateSession(sessionToken: string): EnhancedConnectionData | null {
    const socketId = this.sessionTokens.get(sessionToken);
    if (!socketId) return null;

    const connection = this.activeConnections.get(socketId) as EnhancedConnectionData | undefined;
    return connection || null;
  }

  // Handle multiple connections for same user
  async handleMultipleConnections(userId: string, newSocketId: string): Promise<MultipleConnectionResult> {
    const existingSessions = this.userSessions.get(userId);
    if (!existingSessions || existingSessions.size === 0) {
      return { multipleConnections: false };
    }

    const existingConnections = Array.from(existingSessions.keys())
      .map(socketId => this.activeConnections.get(socketId) as EnhancedConnectionData | undefined)
      .filter((conn): conn is EnhancedConnectionData => conn !== undefined);

    console.log(`🔀 [CONNECTION] Handling multiple connections for user ${userId}: ${existingConnections.length} existing`);

    // Strategy: Allow multiple connections but mark older ones as secondary
    const strategies = {
      // Keep newest, mark others as secondary
      'newest-primary': () => {
        existingConnections.forEach(conn => {
          this.updateConnection(conn.socketId, {
            isPrimary: false,
            supersededBy: newSocketId,
            supersededAt: new Date()
          });
        });
        return { primary: newSocketId, secondary: existingConnections.map(c => c.socketId) };
      },

      // Keep oldest, mark new as secondary
      'oldest-primary': () => {
        const oldestConnection = existingConnections.reduce((oldest, current) =>
          current.connectedAt < oldest.connectedAt ? current : oldest
        );
        return { primary: oldestConnection.socketId, secondary: [newSocketId] };
      },

      // Allow all (for different devices/tabs)
      'allow-all': () => {
        return { primary: newSocketId, secondary: existingConnections.map(c => c.socketId) };
      }
    };

    // Use newest-primary strategy by default
    const result = strategies['newest-primary']();

    return {
      multipleConnections: true,
      strategy: 'newest-primary',
      totalConnections: existingConnections.length + 1,
      ...result
    };
  }

  // Consolidate user connections
  async consolidateConnections(userId: string): Promise<ConsolidationResult> {
    const userSessions = this.userSessions.get(userId);
    if (!userSessions || userSessions.size <= 1) {
      return { consolidated: false, reason: 'No multiple connections found' };
    }

    const connections = Array.from(userSessions.keys())
      .map(socketId => this.activeConnections.get(socketId) as EnhancedConnectionData | undefined)
      .filter((conn): conn is EnhancedConnectionData => conn !== undefined)
      .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime()); // Sort by most recent activity

    if (connections.length <= 1) {
      return { consolidated: false, reason: 'Only one active connection' };
    }

    // Keep the most recently active connection, close others
    const primaryConnection = connections[0];
    const secondaryConnections = connections.slice(1);

    console.log(`🔧 [CONNECTION] Consolidating ${connections.length} connections for user ${userId}`);

    // Mark secondary connections for termination
    secondaryConnections.forEach(conn => {
      this.updateConnection(conn.socketId, {
        markedForTermination: true,
        terminationReason: 'Connection consolidated',
        primaryConnection: primaryConnection.socketId
      });
    });

    return {
      consolidated: true,
      primaryConnection: primaryConnection.socketId,
      terminatedConnections: secondaryConnections.map(c => c.socketId),
      consolidatedAt: new Date()
    };
  }

  // Persist connection state for recovery
  async persistConnectionState(socketId: string): Promise<boolean> {
    const connection = this.activeConnections.get(socketId) as EnhancedConnectionData | undefined;
    if (!connection) return false;

    try {
      // Store in a persistent store (Redis, database, etc.)
      // For now, we'll use the recovery map
      if (connection.sessionToken) {
        this.connectionRecovery.set(connection.sessionToken, {
          userId: connection.userId!,
          roomId: connection.roomId,
          roomCode: connection.roomCode,
          metadata: connection.metadata,
          persistedAt: new Date(),
          recoverable: true
        });
      }

      return true;
    } catch (error) {
      console.error(`❌ [CONNECTION] Failed to persist state for ${socketId}:`, error);
      return false;
    }
  }

  // Restore connection state from persistence
  async restoreConnectionState(socketId: string): Promise<EnhancedConnectionData | null> {
    const connection = this.activeConnections.get(socketId) as EnhancedConnectionData | undefined;
    if (!connection || !connection.sessionToken) return null;

    try {
      const recoveryData = this.connectionRecovery.get(connection.sessionToken);
      if (!recoveryData) return null;

      // Restore state to connection
      this.updateConnection(socketId, {
        userId: recoveryData.userId,
        roomId: recoveryData.roomId,
        roomCode: recoveryData.roomCode,
        metadata: {
          ...connection.metadata,
          ...recoveryData.metadata,
          restoredAt: new Date(),
          restoredFrom: 'persistence'
        }
      });

      console.log(`🔄 [CONNECTION] Restored state for connection ${socketId}`);
      return this.activeConnections.get(socketId) as EnhancedConnectionData;

    } catch (error) {
      console.error(`❌ [CONNECTION] Failed to restore state for ${socketId}:`, error);
      return null;
    }
  }

  // Helper methods for user session tracking
  private addUserSession(userId: string, socketId: string, sessionToken: string | null): void {
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, new Map());
    }
    this.userSessions.get(userId)!.set(socketId, {
      sessionToken,
      addedAt: new Date()
    });
  }

  private removeUserSession(userId: string, socketId: string): void {
    const userSessionMap = this.userSessions.get(userId);
    if (userSessionMap) {
      userSessionMap.delete(socketId);
      if (userSessionMap.size === 0) {
        this.userSessions.delete(userId);
      }
    }
  }

  // Enhanced statistics
  getEnhancedStats(): EnhancedStats {
    const baseStats = this.getStats();
    const connections = Array.from(this.activeConnections.values()) as EnhancedConnectionData[];

    const recoveryTimes = Array.from(this.connectionRecovery.values())
      .map(r => Date.now() - (r.disconnectedAt || r.createdAt || new Date()).getTime());

    return {
      ...baseStats,
      sessionTokens: this.sessionTokens.size,
      recoverableSessions: Array.from(this.connectionRecovery.values())
        .filter(r => r.recoverable).length,
      multiUserConnections: Array.from(this.userSessions.values())
        .filter(sessions => sessions.size > 1).length,
      connectionTypes: connections.reduce((acc: Record<string, number>, conn) => {
        acc[conn.connectionType] = (acc[conn.connectionType] || 0) + 1;
        return acc;
      }, {}),
      averageSessionAge: this.sessionTokens.size > 0
        ? connections
          .filter(c => c.sessionToken)
          .reduce((sum, c) => sum + (Date.now() - c.connectedAt.getTime()), 0)
          / this.sessionTokens.size / 1000
        : 0,
      recoveryStats: {
        totalRecoverable: this.connectionRecovery.size,
        oldestRecovery: recoveryTimes.length > 0 ? Math.min(...recoveryTimes) / 1000 : 0,
        newestRecovery: recoveryTimes.length > 0 ? Math.max(...recoveryTimes) / 1000 : 0
      }
    };
  }

  // Enhanced cleanup with session management
  cleanupStaleConnections(maxIdleMs: number = 300000): string[] {
    const staleConnections = super.cleanupStaleConnections(maxIdleMs);

    // Clean up stale recovery data
    const now = Date.now();
    const recoveryThreshold = 24 * 60 * 60 * 1000; // 24 hours

    for (const [token, recovery] of this.connectionRecovery.entries()) {
      const age = now - (recovery.disconnectedAt || recovery.createdAt || new Date()).getTime();
      if (age > recoveryThreshold) {
        this.connectionRecovery.delete(token);
      }
    }

    // Clean up empty user sessions
    for (const [userId, sessions] of this.userSessions.entries()) {
      if (sessions.size === 0) {
        this.userSessions.delete(userId);
      }
    }

    console.log(`🧹 [CONNECTION] Enhanced cleanup: ${staleConnections.length} stale connections, ${this.connectionRecovery.size} recoverable sessions`);

    return staleConnections;
  }
}

export default EnhancedConnectionManager;
