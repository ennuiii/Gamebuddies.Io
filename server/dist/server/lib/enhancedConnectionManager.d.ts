import ConnectionManager, { ConnectionData } from './connectionManager';
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
declare class EnhancedConnectionManager extends ConnectionManager {
    private sessionTokens;
    private userSessions;
    private connectionRecovery;
    constructor();
    addConnection(socketId: string, initialData?: Partial<EnhancedConnectionData>): EnhancedConnectionData;
    updateConnection(socketId: string, updates: Partial<EnhancedConnectionData>): boolean;
    removeConnection(socketId: string): EnhancedConnectionData | undefined;
    recoverSession(sessionToken: string, newSocketId: string): Promise<EnhancedConnectionData>;
    createSessionToken(userId: string, roomId: string): string;
    validateSession(sessionToken: string): EnhancedConnectionData | null;
    handleMultipleConnections(userId: string, newSocketId: string): Promise<MultipleConnectionResult>;
    consolidateConnections(userId: string): Promise<ConsolidationResult>;
    persistConnectionState(socketId: string): Promise<boolean>;
    restoreConnectionState(socketId: string): Promise<EnhancedConnectionData | null>;
    private addUserSession;
    private removeUserSession;
    getEnhancedStats(): EnhancedStats;
    cleanupStaleConnections(maxIdleMs?: number): string[];
}
export default EnhancedConnectionManager;
//# sourceMappingURL=enhancedConnectionManager.d.ts.map