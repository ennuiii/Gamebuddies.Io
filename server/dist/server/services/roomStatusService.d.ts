import { Server } from 'socket.io';
import type { DatabaseService } from '../lib/supabase';
import type { Player } from '@shared/types';
interface RoomData {
    id: string;
    room_code: string;
    status: string;
    participants?: Array<{
        user_id: string;
        user?: {
            display_name: string | null;
        };
    }>;
}
/**
 * Automatically update room status based on host location
 */
export declare function autoUpdateRoomStatusByHost(io: Server, db: DatabaseService, roomId: string, hostUserId: string, hostLocation: string): Promise<void>;
/**
 * Intelligently update room status based on overall player states
 * This provides more robust room status management than just checking the host
 */
export declare function autoUpdateRoomStatusBasedOnPlayerStates(io: Server | null, db: DatabaseService, room: RoomData, allPlayers: Player[], reason: string): Promise<void>;
export {};
//# sourceMappingURL=roomStatusService.d.ts.map