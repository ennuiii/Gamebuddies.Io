import type { Socket } from 'socket.io';
import type { ServerContext } from '../types';
declare module 'socket.io' {
    interface Socket {
        userId?: string;
    }
}
/**
 * Register friend system handlers
 */
export declare function registerFriendHandlers(socket: Socket, ctx: ServerContext): void;
/**
 * Handle friend offline notification on disconnect
 */
export declare function notifyFriendsOffline(ctx: ServerContext, userId: string): Promise<void>;
//# sourceMappingURL=friendHandlers.d.ts.map