import { Router } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { DatabaseService } from '../lib/supabase';
import { ConnectionManager } from '../lib/connectionManager';
export default function createGameApiV2Router(io: SocketIOServer, db: DatabaseService, connectionManager: ConnectionManager): Router;
//# sourceMappingURL=gameApiV2.d.ts.map