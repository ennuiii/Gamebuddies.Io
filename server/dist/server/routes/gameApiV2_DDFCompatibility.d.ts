import { Router } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { DatabaseService } from '../lib/supabase';
import { ConnectionManager } from '../lib/connectionManager';
import LobbyManager from '../lib/lobbyManager';
import StatusSyncManager from '../lib/statusSyncManager';
export default function createDDFCompatibilityRouter(io: SocketIOServer, db: DatabaseService, connectionManager: ConnectionManager, lobbyManager: LobbyManager, statusSyncManager: StatusSyncManager): Router;
//# sourceMappingURL=gameApiV2_DDFCompatibility.d.ts.map