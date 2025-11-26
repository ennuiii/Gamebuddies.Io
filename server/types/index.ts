import { Server, Socket } from 'socket.io';
import type { Application, Request, Response, NextFunction } from 'express';
import type ConnectionManager from '../lib/connectionManager';
import type LobbyManager from '../lib/lobbyManager';
import type StatusSyncManager from '../lib/statusSyncManager';
import type RoomLifecycleManager from '../lib/roomLifecycleManager';
import type ProxyManager from '../lib/proxyManager';
import type { DatabaseService } from '../lib/supabase';

// ============ Server Context ============
// Shared context object passed to all socket handlers and services

export interface ServerContext {
  io: Server;
  db: DatabaseService;
  connectionManager: ConnectionManager;
  lobbyManager: LobbyManager;
  statusSyncManager: StatusSyncManager;
  roomLifecycleManager: RoomLifecycleManager;
  proxyManager: ProxyManager;
}

// ============ Socket Handler Types ============

export type SocketHandler = (socket: Socket, ctx: ServerContext) => void;

export interface SocketHandlerModule {
  register: SocketHandler;
}

// ============ In-Memory State Types ============

export interface TugOfWarGameState {
  position: number;
  redWins: number;
  blueWins: number;
}

export type TugOfWarTeam = 'red' | 'blue';

export interface GameState {
  tugOfWarState: Map<string, TugOfWarGameState>;
  tugOfWarTeams: Map<string, Map<string, TugOfWarTeam>>;
  roomActivityCache: Map<string, number>;
}

// ============ External Game API Types ============

export interface ExternalGameRequest extends Request {
  roomCode?: string;
  room?: RoomData;
  gameApiKey?: string;
}

export interface RoomData {
  id: string;
  room_code: string;
  host_id: string;
  status: string;
  current_game: string | null;
  game_settings: Record<string, unknown>;
  is_public: boolean;
  max_players: number;
  streamer_mode: boolean;
  created_at: string;
  updated_at: string;
  last_activity: string;
}

export interface RoomMemberData {
  id: string;
  user_id: string;
  room_id: string;
  role: 'host' | 'player';
  is_connected: boolean;
  is_ready: boolean;
  in_game: boolean;
  current_location: 'lobby' | 'game' | 'disconnected';
  last_ping: string;
  joined_at: string;
  custom_lobby_name: string | null;
  socket_id: string | null;
  user?: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    avatar_style: string | null;
    avatar_seed: string | null;
    avatar_options: Record<string, unknown> | null;
    premium_tier: string;
    level: number;
    role: string;
  };
}

export interface SessionTokenData {
  sessionId: string;
  roomCode: string;
  playerId: string;
  playerName: string;
  isHost: boolean;
  gameType: string;
  createdAt: string;
  expiresAt: string;
}

// ============ Player Status Types ============

export type PlayerLocation = 'lobby' | 'game' | 'disconnected';

export interface PlayerStatusUpdate {
  playerId: string;
  location: PlayerLocation;
  inGame?: boolean;
  isConnected?: boolean;
}

export interface BulkStatusUpdate {
  players: PlayerStatusUpdate[];
  source?: string;
  timestamp?: string;
}

// ============ Cleanup Service Types ============

export interface CleanupResult {
  roomsCleaned: number;
  connectionsCleaned: number;
  errors: string[];
}

// ============ Express Middleware Types ============

export type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void>;

export type ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => void;

// ============ CORS Types ============

export interface CorsOptions {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void;
  credentials: boolean;
  methods: string[];
  allowedHeaders: string[];
}

// ============ Health Check Types ============

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  memory: NodeJS.MemoryUsage;
  connections: {
    totalConnections: number;
    activeRooms: number;
    activeUsers: number;
  };
  rooms: {
    total: number;
    active: number;
    inGame: number;
  };
  database: string;
  timestamp: string;
}
