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
declare class ConnectionManager {
    protected activeConnections: Map<string, ConnectionData>;
    protected connectionLocks: Map<string, ConnectionLock>;
    protected connectionAttempts: Map<string, number[]>;
    constructor();
    addConnection(socketId: string, initialData?: Partial<ConnectionData>): void;
    updateConnection(socketId: string, updates: Partial<ConnectionData>): void;
    getConnection(socketId: string): ConnectionData | undefined;
    getRoomConnections(roomId: string): ConnectionData[];
    getRoomConnectionsByCode(roomCode: string): ConnectionData[];
    getUserConnections(userId: string): ConnectionData[];
    removeConnection(socketId: string): ConnectionData | undefined;
    acquireLock(username: string | null, roomCode: string | null, socketId: string): boolean;
    releaseLock(username: string | null, roomCode: string | null): void;
    getLockKey(username: string | null, roomCode: string | null): string;
    trackConnectionAttempt(socketId: string, action: string): number;
    isRateLimited(socketId: string, action: string, limit?: number): boolean;
    cleanupStaleConnections(maxIdleMs?: number): string[];
    getStats(): ConnectionStats;
    isUserInRoom(userId: string, roomId: string): boolean;
    getOrCreateConnection(socketId: string, initialData?: Partial<ConnectionData>): ConnectionData | undefined;
}
export { ConnectionManager };
export default ConnectionManager;
//# sourceMappingURL=connectionManager.d.ts.map