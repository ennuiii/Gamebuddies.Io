import type { Player, Room, RoomStatus } from './entities';
export interface ClientToServerEvents {
    'user:identify': (userId: string) => void;
    createRoom: (data: CreateRoomPayload) => void;
    joinRoom: (data: JoinRoomPayload) => void;
    leaveRoom: (data: LeaveRoomPayload) => void;
    joinSocketRoom: (data: {
        roomCode: string;
    }) => void;
    selectGame: (data: SelectGamePayload) => void;
    startGame: (data: {
        roomCode: string;
    }) => void;
    getPublicRooms: (data?: {
        gameType?: string;
    }) => void;
    playerReturnToLobby: (data: {
        roomCode: string;
    }) => void;
    transferHost: (data: TransferHostPayload) => void;
    kickPlayer: (data: KickPlayerPayload) => void;
    changeRoomStatus: (data: ChangeRoomStatusPayload) => void;
    autoUpdateRoomStatus: (data: {
        roomCode: string;
    }) => void;
    'chat:message': (data: ChatMessagePayload) => void;
    'game:invite': (data: GameInvitePayload) => void;
    heartbeat: () => void;
    profile_updated: (data: ProfileUpdatePayload) => void;
}
export interface CreateRoomPayload {
    playerName: string;
    gameType?: string;
    maxPlayers?: number;
    isPublic?: boolean;
    customLobbyName?: string;
    streamerMode?: boolean;
    supabaseUserId?: string;
}
export interface JoinRoomPayload {
    playerName: string;
    roomCode: string;
    customLobbyName?: string;
    supabaseUserId?: string;
    isHostHint?: boolean;
}
export interface LeaveRoomPayload {
    roomCode?: string;
}
export interface SelectGamePayload {
    gameType: string;
    settings?: Record<string, unknown>;
}
export interface TransferHostPayload {
    roomCode: string;
    targetPlayerId?: string;
    targetUserId?: string;
}
export interface KickPlayerPayload {
    roomCode: string;
    targetPlayerId?: string;
    targetUserId?: string;
    reason?: string;
}
export interface ChangeRoomStatusPayload {
    roomCode: string;
    status: RoomStatus;
}
export interface ChatMessagePayload {
    message: string;
    playerName: string;
}
export interface GameInvitePayload {
    targetUserId: string;
    roomCode: string;
    gameName?: string;
    gameThumbnail?: string;
}
export interface ProfileUpdatePayload {
    avatarUrl?: string;
    avatarStyle?: string;
    avatarSeed?: string;
    avatarOptions?: Record<string, unknown>;
    displayName?: string;
    roomCode?: string;
    userId?: string;
}
export interface ServerToClientEvents {
    roomCreated: (data: RoomCreatedPayload) => void;
    roomJoined: (data: RoomJoinedPayload) => void;
    playerJoined: (data: PlayerJoinedPayload) => void;
    playerLeft: (data: PlayerLeftPayload) => void;
    playerDisconnected: (data: PlayerDisconnectedPayload) => void;
    playerStatusUpdated: (data: PlayerStatusUpdatedPayload) => void;
    roomStatusChanged: (data: RoomStatusChangedPayload) => void;
    publicRoomsList: (data: {
        rooms: Room[];
    }) => void;
    gameSelected: (data: GameSelectedPayload) => void;
    gameStarted: (data: GameStartedPayload) => void;
    hostTransferred: (data: HostTransferredPayload) => void;
    playerKicked: (data: PlayerKickedPayload) => void;
    kickFailed: (data: KickFailedPayload) => void;
    'friend:list-online': (data: {
        onlineUserIds: string[];
    }) => void;
    'friend:online': (data: {
        userId: string;
    }) => void;
    'friend:offline': (data: {
        userId: string;
    }) => void;
    'friend:request_received': (data: FriendRequestPayload) => void;
    'friend:accepted': (data: FriendAcceptPayload) => void;
    'game:invite_received': (data: GameInviteReceivedPayload) => void;
    'chat:message': (data: ChatMessageReceivedPayload) => void;
    error: (data: SocketErrorPayload) => void;
}
export interface RoomCreatedPayload {
    roomCode: string;
    isHost: boolean;
    room: Room;
}
export interface RoomJoinedPayload {
    roomCode: string;
    isHost: boolean;
    players: Player[];
    room: Room;
    roomVersion: number;
}
export interface PlayerJoinedPayload {
    player: Player;
    players: Player[];
    room: Room;
    roomVersion: number;
}
export interface PlayerLeftPayload {
    playerId: string;
    playerName: string;
    players: Player[];
    room: Room;
    roomVersion: number;
}
export interface PlayerDisconnectedPayload {
    playerId: string;
    playerName: string;
    players: Player[];
    room: Room;
    roomVersion: number;
}
export interface PlayerStatusUpdatedPayload {
    status: 'game' | 'lobby' | 'disconnected';
    reason: string;
    players: Player[];
    room: Room;
    source: string;
    timestamp: string;
    roomVersion: number;
}
export interface RoomStatusChangedPayload {
    status: RoomStatus;
    roomVersion: number;
    room?: Room;
}
export interface GameSelectedPayload {
    gameType: string;
    settings: Record<string, unknown>;
    roomVersion: number;
}
export interface GameStartedPayload {
    gameUrl: string;
    gameType: string;
    isHost: boolean;
    roomCode: string;
    roomVersion: number;
}
export interface HostTransferredPayload {
    oldHostId: string;
    newHostId: string;
    newHostName: string;
    reason: 'manual_transfer' | 'original_host_returned';
    roomVersion: number;
}
export interface PlayerKickedPayload {
    reason: string;
    kickedBy: string;
    roomCode?: string;
    targetUserId?: string;
    targetName?: string;
    players?: Player[];
    room?: Room;
    roomVersion?: number;
}
export interface KickFailedPayload {
    reason: string;
    code: string;
    targetUserId?: string;
}
export interface FriendRequestPayload {
    id: string;
    from_user_id: string;
    from_username: string;
    from_display_name: string;
    from_avatar_url: string | null;
}
export interface FriendAcceptPayload {
    friendshipId: string;
    userId: string;
    username: string;
    displayName: string;
}
export interface GameInviteReceivedPayload {
    fromUserId: string;
    fromUserName: string;
    roomCode: string;
    roomId?: string;
    gameName: string;
    gameThumbnail: string;
    hostName?: string;
    id?: string | number;
}
export interface ChatMessageReceivedPayload {
    playerName: string;
    message: string;
    timestamp: string;
    type: 'chat' | 'system' | 'game';
}
export interface SocketErrorPayload {
    message: string;
    code: string;
    debug?: Record<string, unknown>;
}
//# sourceMappingURL=socket-events.d.ts.map