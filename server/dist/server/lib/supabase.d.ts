import { SupabaseClient } from '@supabase/supabase-js';
export declare const supabase: SupabaseClient<any, "public", any>;
export declare const supabaseAdmin: SupabaseClient<any, "public", any>;
interface RoomData {
    host_id: string;
    current_game?: string | null;
    metadata?: Record<string, unknown>;
    max_players?: number;
    streamer_mode?: boolean;
    is_public?: boolean;
    game_settings?: Record<string, unknown>;
}
interface RoomUpdates {
    status?: string;
    current_game?: string | null;
    game_settings?: Record<string, unknown>;
    host_id?: string;
    [key: string]: unknown;
}
interface User {
    id: string;
    username: string;
    display_name?: string;
    premium_tier?: string;
    role?: string;
    avatar_url?: string;
    avatar_style?: string;
    avatar_seed?: string;
    avatar_options?: Record<string, unknown>;
    level?: number;
    last_seen?: string;
    [key: string]: unknown;
}
interface RoomMember {
    id: string;
    room_id: string;
    user_id: string;
    role: string;
    is_connected: boolean;
    is_ready: boolean;
    in_game: boolean;
    current_location: string;
    last_ping: string;
    joined_at: string;
    custom_lobby_name: string | null;
    socket_id: string | null;
    user?: User;
    [key: string]: unknown;
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
    created_at: string;
    last_activity: string;
    metadata?: Record<string, unknown>;
    host?: {
        username?: string;
        display_name?: string;
    };
    participants?: RoomMember[];
    room_members?: RoomMember[];
    [key: string]: unknown;
}
interface GameState {
    id: string;
    room_id: string;
    game_id: string;
    game_state: Record<string, unknown>;
    participants: {
        user_id: string;
    }[];
    started_at: string;
}
interface CleanupOptions {
    maxAgeHours?: number;
    maxIdleMinutes?: number;
    includeAbandoned?: boolean;
    includeCompleted?: boolean;
    dryRun?: boolean;
}
interface CleanupResult {
    cleaned: number;
    rooms: string[];
    wouldClean?: number;
    failed?: {
        room_code: string;
        error: string;
    }[];
}
interface RoomStats {
    total: number;
    byStatus: Record<string, number>;
    byAge: {
        lastHour: number;
        lastDay: number;
        lastWeek: number;
        older: number;
    };
    byActivity: {
        active: number;
        idle: number;
        stale: number;
    };
}
interface ActiveRoomFilters {
    gameType?: string;
    status?: string;
    isPublic?: boolean;
}
declare class DatabaseService {
    client: SupabaseClient;
    adminClient: SupabaseClient;
    isSupabase: boolean;
    constructor();
    createRoom(roomData: RoomData): Promise<Room>;
    getRoomByCode(roomCode: string): Promise<Room | null>;
    getRoomById(roomId: string): Promise<Room | null>;
    updateRoom(roomId: string, updates: RoomUpdates): Promise<Room>;
    getOrCreateUser(externalId: string, username: string, displayName: string, additionalFields?: Partial<User>): Promise<User>;
    addParticipant(roomId: string, userId: string, socketId: string, role?: string, customLobbyName?: string | null): Promise<RoomMember>;
    removeParticipant(roomId: string, userId: string): Promise<boolean>;
    updateParticipantConnection(userId: string, socketId: string | null, status?: string, customLobbyName?: string | null): Promise<boolean>;
    transferHost(roomId: string, currentHostUserId: string, newHostUserId: string): Promise<boolean>;
    autoTransferHost(roomId: string, leavingHostUserId: string): Promise<RoomMember | null>;
    logEvent(roomId: string, userId: string | null, eventType: string, eventData?: Record<string, unknown>): Promise<void>;
    saveGameState(roomId: string, gameType: string, stateData: Record<string, unknown>, createdBy: string): Promise<GameState>;
    getLatestGameState(roomId: string): Promise<GameState | null>;
    generateChecksum(data: unknown): string;
    cleanupStaleConnections(): Promise<void>;
    refreshActiveRoomsView(): Promise<void>;
    cleanupInactiveRooms(options?: CleanupOptions): Promise<CleanupResult>;
    deleteRoom(roomId: string): Promise<boolean>;
    getRoomStats(): Promise<RoomStats | null>;
    getActiveRooms(filters?: ActiveRoomFilters): Promise<Room[]>;
    cleanupStaleData(): Promise<{
        success: boolean;
        error?: Error;
    }>;
}
export { DatabaseService };
export declare const db: DatabaseService;
//# sourceMappingURL=supabase.d.ts.map