import { Server as SocketIOServer } from 'socket.io';
declare class RoomLifecycleManager {
    private io;
    constructor(io: SocketIOServer);
    startAbandonmentGracePeriod(roomId: string, roomCode: string): void;
    cancelAbandonmentGracePeriod(roomId: string, roomCode: string): void;
    startHostTransferGracePeriod(roomId: string, roomCode: string, originalHostUserId: string): void;
    cancelHostTransferGracePeriod(roomId: string, roomCode: string, reconnectingUserId: string): boolean;
}
export default RoomLifecycleManager;
//# sourceMappingURL=roomLifecycleManager.d.ts.map