export type PremiumTier = 'free' | 'monthly' | 'lifetime';
export type UserRole = 'user' | 'admin' | 'moderator';
export type PlayerLocation = 'lobby' | 'game' | 'disconnected';
export interface User {
    id: string;
    username: string;
    display_name: string;
    email?: string | null;
    avatar_url: string | null;
    avatar_style: string | null;
    avatar_seed: string | null;
    avatar_options: Record<string, unknown> | null;
    premium_tier: PremiumTier;
    role: UserRole;
    level: number;
    xp?: number;
    last_seen: string;
    is_guest?: boolean;
}
export interface Player {
    id: string;
    name: string;
    isHost: boolean;
    isConnected: boolean;
    inGame: boolean;
    currentLocation: PlayerLocation;
    lastPing: string;
    premiumTier: PremiumTier;
    role: UserRole;
    avatarUrl: string | null;
    avatarStyle: string | null;
    avatarSeed: string | null;
    avatarOptions: Record<string, unknown> | null;
    level: number;
    socketId?: string;
}
export type RoomStatus = 'waiting_for_players' | 'selecting_game' | 'starting' | 'in_game' | 'paused' | 'finished' | 'abandoned';
export interface Room {
    id: string;
    room_code: string;
    host_id: string;
    host: {
        username: string;
        display_name: string;
    };
    status: RoomStatus;
    current_game: string | null;
    game_settings: Record<string, unknown>;
    is_public: boolean;
    max_players: number;
    streamer_mode: boolean;
    participants: RoomMember[];
    metadata: RoomMetadata;
    created_at: string;
    updated_at: string;
    last_activity: string;
    game_started_at?: string;
}
export interface RoomMember {
    id: string;
    user_id: string;
    room_id: string;
    role: 'host' | 'player';
    is_connected: boolean;
    is_ready: boolean;
    in_game: boolean;
    current_location: PlayerLocation;
    last_ping: string;
    joined_at: string;
    custom_lobby_name: string | null;
    socket_id: string;
    user: User;
}
export interface RoomMetadata {
    created_by_name: string;
    created_from: string;
    original_host_id: string;
}
export interface GameConfig {
    id: string;
    name: string;
    display_name: string;
    description: string;
    icon: string;
    thumbnailUrl: string;
    max_players: number;
    min_players: number;
    is_active: boolean;
    maintenance_mode: boolean;
    base_url?: string;
    is_external?: boolean;
    supports_spectators?: boolean;
    settings_schema?: Record<string, unknown>;
    default_settings?: Record<string, unknown>;
}
//# sourceMappingURL=entities.d.ts.map