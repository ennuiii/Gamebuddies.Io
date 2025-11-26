import { Server } from 'socket.io';
import type http from 'http';
import type { ServerContext, GameState } from '../types';
/**
 * Initialize Socket.IO with all handlers
 */
export declare function initializeSocketIO(httpServer: http.Server, ctx: Omit<ServerContext, 'io'>): Server;
/**
 * Get the game state (for testing or debugging)
 */
export declare function getGameState(): GameState;
/**
 * Clear host transfer grace period (for cleanup)
 */
export declare function clearHostTransferGracePeriod(roomId: string): void;
//# sourceMappingURL=index.d.ts.map