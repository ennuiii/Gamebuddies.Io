import { Server as SocketIOServer } from 'socket.io';
import ConnectionManager from './connectionManager';
interface DatabaseService {
    adminClient: any;
    logEvent: (roomId: string | null, userId: string | null, eventType: string, data?: Record<string, unknown>) => Promise<void>;
}
interface Room {
    id: string;
    room_code: string;
    host_id: string;
    status: string;
    current_game: string | null;
    max_players: number;
    streamer_mode: boolean;
    is_public: boolean;
    game_settings?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    participants?: RoomMember[];
}
interface RoomMember {
    id: string;
    room_id: string;
    user_id: string;
    role: string;
    is_connected: boolean;
    is_ready?: boolean;
    in_game: boolean;
    current_location: string;
    last_ping: string;
    joined_at: string;
    custom_lobby_name: string | null;
    socket_id: string | null;
    game_data?: Record<string, unknown>;
    user?: User;
}
interface User {
    username?: string;
    display_name?: string;
    premium_tier?: string;
    avatar_url?: string;
    role?: string;
}
interface RoomSettings {
    maxPlayers?: number;
    streamerMode?: boolean;
    [key: string]: unknown;
}
interface Player {
    id: string;
    name: string;
    isHost: boolean;
    isConnected: boolean;
    inGame: boolean;
    currentLocation: string;
    lastPing: string;
    gameData?: Record<string, unknown>;
    premiumTier: string;
    avatarUrl: string | null;
}
interface StatusMapping {
    is_connected: boolean;
    in_game: boolean;
    current_location: string;
}
interface JoinRoomResult {
    success: boolean;
    room: Room;
    players: Player[];
    sessionToken: string;
    isRejoin: boolean;
}
interface UpdateStatusResult {
    success: boolean;
    updated: StatusMapping;
    conflicts: string[];
}
interface RoomWithParticipants {
    room: Room;
    players: Player[];
}
declare class LobbyManager {
    private io;
    private db;
    private connectionManager;
    private roomStates;
    private playerSessions;
    private statusQueue;
    constructor(io: SocketIOServer, db: DatabaseService, connectionManager: ConnectionManager);
    generateRoomCode(): string;
    createRoom(hostId: string, gameType?: string, settings?: RoomSettings, customLobbyName?: string | null): Promise<{
        room: Room;
        roomCode: string;
    }>;
    joinRoom(playerId: string, roomCode: string, playerName: string, socketId: string, sessionToken?: string | null, customLobbyName?: string | null): Promise<JoinRoomResult>;
    updatePlayerStatus(playerId: string, roomCode: string, status: string, location: string, metadata?: Record<string, unknown>): Promise<UpdateStatusResult>;
    handlePlayerReturn(playerId: string, roomCode: string, fromGame?: boolean): Promise<{
        success: boolean;
    }>;
    initiateGroupReturn(hostId: string, roomCode: string): Promise<{
        success: boolean;
        playersReturning: number;
    }>;
    createPlayerSession(playerId: string, roomId: string, socketId: string): Promise<string>;
    recoverSession(sessionToken: string, newSocketId: string): Promise<{
        success: boolean;
        playerId: string;
        roomCode: string;
        playerState: RoomMember;
    }>;
    private mapStatusToDatabase;
    private detectStatusConflicts;
    private resolveStatusConflicts;
    private updateRoomStateCache;
    getRoomWithParticipants(roomCode: string): Promise<RoomWithParticipants | null>;
    updateRoomStatus(roomCode: string, status: string, reason: string): Promise<void>;
    broadcastRoomUpdate(roomCode: string, eventType: string, data: Record<string, unknown>): Promise<void>;
    private setupCleanupInterval;
}
export default LobbyManager;
//# sourceMappingURL=lobbyManager.d.ts.map