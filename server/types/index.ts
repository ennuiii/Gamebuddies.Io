/**
 * GameBuddies TypeScript Type Definitions
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { Request, Response, NextFunction } from 'express';

// ===== DATABASE TYPES =====

export interface User {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  last_seen: string;
  is_guest: boolean;
  metadata: Record<string, any>;
}

export interface Game {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  thumbnail_url: string | null;
  base_url: string;
  is_external: boolean;
  requires_api_key: boolean;
  min_players: number;
  max_players: number;
  supports_spectators: boolean;
  settings_schema: Record<string, any>;
  default_settings: Record<string, any>;
  is_active: boolean;
  maintenance_mode: boolean;
  created_at: string;
  updated_at: string;
}

export type RoomStatus = 'lobby' | 'in_game' | 'returning' | 'abandoned' | 'finished';
export type PlayerLocation = 'lobby' | 'game' | 'disconnected';
export type PlayerRole = 'host' | 'player' | 'spectator';
export type SessionStatus = 'active' | 'expired' | 'revoked';
export type SubscriptionStatus = 'active' | 'canceled' | 'expired' | 'past_due' | 'trialing';

export interface Room {
  id: string;
  room_code: string;
  host_id: string;
  status: RoomStatus;
  current_game: string | null;
  game_started_at: string | null;
  game_settings: Record<string, any>;
  max_players: number;
  is_public: boolean;
  allow_spectators: boolean;
  streamer_mode?: boolean;
  created_at: string;
  updated_at: string;
  last_activity: string;
  metadata: Record<string, any>;
  participants?: RoomMember[];
  players?: any[];  // Legacy support
  deleted_at?: string | null;
  deleted_by?: string | null;
}

export interface RoomMember {
  id: string;
  room_id: string;
  user_id: string;
  role: PlayerRole;
  is_connected: boolean;
  last_ping: string;
  socket_id: string | null;
  is_ready: boolean;
  in_game: boolean;
  current_location: PlayerLocation;
  game_data: Record<string, any>;
  joined_at: string;
  left_at: string | null;
  user?: User;
}

export interface PlayerSession {
  id: string;
  user_id: string;
  room_id: string | null;
  session_token: string;
  socket_id: string | null;
  status: SessionStatus;
  last_heartbeat: string;
  metadata: Record<string, any>;
  created_at: string;
  expires_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  tier_id: string;
  status: SubscriptionStatus;
  billing_interval: 'monthly' | 'annual';
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  trial_start: string | null;
  trial_end: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  canceled_at: string | null;
  ended_at: string | null;
  cancel_reason: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface AdImpression {
  id: string;
  user_id: string | null;
  ad_type: string;
  ad_placement: string;
  ad_network: string | null;
  cpm_cents: number | null;
  revenue_cents: number | null;
  session_id: string | null;
  created_at: string;
}

// ===== API TYPES =====

export interface ApiKey {
  id: string;
  key_hash: string;
  service_name: string;
  game_id: string | null;
  name: string;
  description: string | null;
  permissions: string[];
  rate_limit: number;
  is_active: boolean;
  last_used: string | null;
  created_at: string;
  expires_at: string | null;
  created_by: string | null;
  metadata: Record<string, any>;
}

// ===== REQUEST/RESPONSE TYPES =====

export interface AuthenticatedRequest extends Request {
  user?: User;
  id?: string;
  apiKey?: ApiKey;
  isPremium?: boolean;
  db?: DatabaseService;
  featureLimit?: {
    feature: string;
    limit: number | null;
    isPremium: boolean;
  };
}

export interface ErrorResponse {
  success: false;
  error: string;
  code: string;
  timestamp: string;
  details?: Record<string, any>;
}

export interface SuccessResponse<T = any> {
  success: true;
  data?: T;
  message?: string;
  timestamp?: string;
}

export type ApiResponse<T = any> = SuccessResponse<T> | ErrorResponse;

// ===== SOCKET TYPES =====

export interface SocketData {
  userId?: string;
  roomCode?: string;
  username?: string;
  requestId?: string;
}

export interface GameBuddiesSocket extends Socket {
  data: SocketData;
  requestId?: string;
}

export interface ServerToClientEvents {
  error: (error: { error: string; code: string; timestamp: string }) => void;
  roomCreated: (data: { room: Room; roomCode: string; isHost: boolean }) => void;
  roomJoined: (data: { room: Room; player: RoomMember; roomCode: string; isHost: boolean }) => void;
  playerJoined: (player: RoomMember) => void;
  playerLeft: (data: { playerId: string; username: string }) => void;
  playerStatusChanged: (data: { playerId: string; status: any }) => void;
  playerReady: (data: { playerId: string; isReady: boolean }) => void;
  gameSelected: (data: { gameType: string }) => void;
  gameStarted: (data: { gameUrl: string; settings: any }) => void;
  playerReturnedToLobby: (data: { playerId: string }) => void;
  hostTransferred: (data: { oldHostId: string; newHostId: string }) => void;
  playerKicked: (data: { playerId: string; reason?: string }) => void;
  roomClosed: () => void;
}

export interface ClientToServerEvents {
  createRoom: (data: { playerName: string; gameType?: string; maxPlayers?: number; isPublic?: boolean; streamerMode?: boolean }) => void;
  joinRoom: (data: { playerName: string; roomCode: string }) => void;
  joinSocketRoom: (data: { roomCode: string }) => void;
  selectGame: (data: { roomCode: string; gameType: string }) => void;
  startGame: (data: { roomCode: string; gameSettings?: any }) => void;
  leaveRoom: (data?: { roomCode?: string }) => void;
  playerReturnToLobby: (data: { roomCode: string }) => void;
  transferHost: (data: { roomCode: string; targetPlayerId: string }) => void;
  kickPlayer: (data: { roomCode: string; targetPlayerId: string; reason?: string }) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

// ===== SERVICE TYPES =====

export interface DatabaseService {
  client: any;
  adminClient: any;
  isSupabase: boolean;
  createRoom(roomData: Partial<Room>): Promise<Room>;
  getRoomByCode(roomCode: string): Promise<Room | null>;
  getRoomById(roomId: string): Promise<Room | null>;
  updateRoom(roomId: string, updates: Partial<Room>): Promise<Room>;
  getOrCreateUser(externalId: string, username: string, displayName?: string): Promise<User>;
  addParticipant(roomId: string, userId: string, socketId: string, role?: PlayerRole): Promise<RoomMember>;
  updateParticipant(participantId: string, updates: Partial<RoomMember>): Promise<RoomMember>;
  removeParticipant(roomId: string, userId: string): Promise<boolean>;
  logEvent(roomId: string, userId: string, eventType: string, eventData?: Record<string, any>): Promise<void>;
  cleanupInactiveRooms(options?: any): Promise<any>;
  deleteRoom(roomId: string): Promise<boolean>;
}

export interface SubscriptionTier {
  id: string;
  name: string;
  displayName: string;
  description: string;
  priceMonthly: number;
  priceAnnual: number;
  stripePriceId?: string;
  features: string[];
}

// ===== VALIDATION TYPES =====

export interface ValidationResult {
  isValid: boolean;
  value?: any;
  errors?: Array<{
    field: string;
    message: string;
  }>;
  message?: string;
}

export type Validator = (data: any) => Promise<ValidationResult>;

// ===== AD TYPES =====

export interface AdPlacement {
  network: string;
  slot?: string;
  type: 'display' | 'video' | 'interstitial' | 'rewarded';
  sizes?: number[][];
  frequency?: string;
  placementId?: string;
}

export interface AdConfig {
  networks: {
    primary: string;
    video?: string;
    gaming?: string;
  };
  placements: Record<string, AdPlacement>;
}

export interface AdData {
  type: string;
  network: string;
  cpm_cents?: number;
  revenue_cents?: number;
  [key: string]: any;
}

export interface AdResponse {
  showAd: boolean;
  adData?: AdData;
  placement?: AdPlacement;
  reason?: string;
}

// ===== UTILITY TYPES =====

export type ErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ROOM_NOT_AVAILABLE'
  | 'INVALID_ROOM_CODE'
  | 'INVALID_PLAYER_NAME'
  | 'PLAYER_NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR'
  | 'DATABASE_ERROR'
  | 'API_KEY_REQUIRED'
  | 'INVALID_API_KEY'
  | 'WRONG_GAME_TYPE'
  | 'SERVER_ERROR';

export interface Constants {
  MAX_REQUEST_SIZE: string;
  MAX_UPLOAD_SIZE: string;
  PING_TIMEOUT: number;
  PING_INTERVAL: number;
  ROOM_CODE_LENGTH: number;
  MIN_PLAYERS: number;
  MAX_PLAYERS: number;
  SESSION_TIMEOUT_MINUTES: number;
  CLEANUP_INTERVAL: number;
  ERROR_CODES: Record<string, ErrorCode>;
  ROOM_STATUS: Record<string, RoomStatus>;
  PLAYER_LOCATION: Record<string, PlayerLocation>;
  PLAYER_ROLE: Record<string, PlayerRole>;
  [key: string]: any;
}

// ===== MIDDLEWARE TYPES =====

export type Middleware = (req: AuthenticatedRequest, res: Response, next: NextFunction) => void | Promise<void>;

export type ErrorMiddleware = (err: Error, req: AuthenticatedRequest, res: Response, next: NextFunction) => void;

// ===== LOGGER TYPES =====

export interface LoggerMeta {
  [key: string]: any;
}

export interface Logger {
  error(message: string, meta?: LoggerMeta): void;
  warn(message: string, meta?: LoggerMeta): void;
  info(message: string, meta?: LoggerMeta): void;
  debug(message: string, meta?: LoggerMeta): void;
  room(message: string, meta?: LoggerMeta): void;
  socket(message: string, meta?: LoggerMeta): void;
  db(message: string, meta?: LoggerMeta): void;
  api(message: string, meta?: LoggerMeta): void;
  proxy(message: string, meta?: LoggerMeta): void;
  auth(message: string, meta?: LoggerMeta): void;
  security(message: string, meta?: LoggerMeta): void;
  logRequest(req: Request, res: Response, duration: number): void;
}

// ===== EXPORT ALL =====

// All types exported above
