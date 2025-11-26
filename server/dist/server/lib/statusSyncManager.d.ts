import { Server as SocketIOServer } from 'socket.io';
interface DatabaseService {
    adminClient: any;
    logEvent: (roomId: string | undefined, userId: string | null, eventType: string, data: Record<string, unknown>) => Promise<void>;
}
interface LobbyManager {
    getRoomWithParticipants: (roomCode: string) => Promise<{
        room: Record<string, unknown>;
        players: Player[];
    } | null>;
    updatePlayerStatus: (playerId: string, roomCode: string, status: string, location: string, metadata?: Record<string, unknown>) => Promise<void>;
    updateRoomStatus: (roomCode: string, status: string, reason: string) => Promise<void>;
}
interface Player {
    id: string;
    name: string;
    isConnected: boolean;
    currentLocation: string;
    [key: string]: unknown;
}
interface StatusMapping {
    status: string;
    location: string;
    isConnected?: boolean;
    inGame?: boolean;
    timestamp?: string;
}
interface ConflictResolution {
    strategy: string;
    resolvedStatus: StatusMapping;
    updateRequired: boolean;
    requiresClientAction: boolean;
}
interface BulkUpdatePlayer {
    playerId: string;
    location: string;
    reason?: string;
    gameData?: Record<string, unknown>;
}
interface BulkUpdateResult {
    success: boolean;
    results: {
        playerId: string;
        success: boolean;
    }[];
    errors: {
        playerId: string;
        error: string;
    }[];
    summary: {
        total: number;
        successful: number;
        failed: number;
    };
}
declare class StatusSyncManager {
    private db;
    private io;
    private lobbyManager;
    private statusQueue;
    private heartbeats;
    private syncInterval;
    constructor(db: DatabaseService, io: SocketIOServer, lobbyManager: LobbyManager);
    updatePlayerLocation(playerId: string, roomCode: string, location: string, metadata?: Record<string, unknown>): Promise<{
        success: boolean;
        queued: boolean;
    }>;
    syncRoomStatus(roomCode: string): Promise<{
        success: boolean;
        playersCount: number;
    }>;
    handleHeartbeat(playerId: string, roomCode: string, socketId: string, metadata?: Record<string, unknown>): Promise<{
        success: boolean;
        nextHeartbeat: number;
    }>;
    detectDisconnections(): Promise<number>;
    reconcileStatusConflicts(playerId: string, roomCode: string, serverStatus: StatusMapping, clientStatus: StatusMapping): Promise<ConflictResolution>;
    processStatusUpdates(): Promise<{
        processed: number;
        failed: number;
    }>;
    private processStatusUpdate;
    private resolveConflict;
    private isSignificantDifference;
    private mapDbStateToStatus;
    private setupHeartbeatSystem;
    private setupStatusSyncLoop;
    bulkUpdatePlayerStatus(roomCode: string, players: BulkUpdatePlayer[], reason?: string): Promise<BulkUpdateResult>;
    private chunkArray;
    handleGameEnd(roomCode: string, gameResult?: Record<string, unknown>): Promise<{
        success: boolean;
        playersReturned: number;
    }>;
    cleanup(): void;
}
export default StatusSyncManager;
//# sourceMappingURL=statusSyncManager.d.ts.map