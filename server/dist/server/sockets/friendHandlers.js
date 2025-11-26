"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFriendHandlers = registerFriendHandlers;
exports.notifyFriendsOffline = notifyFriendsOffline;
const validation_1 = require("../lib/validation");
/**
 * Register friend system handlers
 */
function registerFriendHandlers(socket, ctx) {
    const { io, db, connectionManager } = ctx;
    // Friend System: Identify User (Central Server Implementation)
    socket.on('user:identify', async (userId) => {
        if (!userId)
            return;
        // Join user-specific room for targeting
        socket.join(`user:${userId}`);
        // Store userId on socket and connection manager
        socket.userId = userId;
        const conn = connectionManager.getConnection(socket.id);
        if (conn)
            conn.userId = userId;
        try {
            // Fetch friends directly from DB
            const { data: friendships, error } = await db.adminClient
                .from('friendships')
                .select('friend_id, user_id')
                .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
                .eq('status', 'accepted');
            if (error) {
                console.error('❌ [Friends] Failed to fetch friends:', error);
                return;
            }
            // Extract Friend IDs
            const friendIds = (friendships || []).map(f => f.user_id === userId ? f.friend_id : f.user_id);
            // Notify online friends & Build online list
            const onlineFriends = [];
            for (const friendId of friendIds) {
                const friendRoom = `user:${friendId}`;
                const room = io.sockets.adapter.rooms.get(friendRoom);
                const isOnline = room && room.size > 0;
                if (isOnline) {
                    onlineFriends.push(friendId);
                    // Notify this friend that user is online
                    io.to(friendRoom).emit('friend:online', { userId });
                }
            }
            // Send online friends list to this user
            socket.emit('friend:list-online', { onlineUserIds: onlineFriends });
        }
        catch (error) {
            console.error('Error in user:identify:', error);
        }
    });
    // Friend System: Game Invite
    socket.on('game:invite', (data) => {
        // Validate friendId exists and is a string
        if (!data?.friendId || typeof data.friendId !== 'string') {
            return;
        }
        console.log('📨 [SERVER] game:invite received:', data);
        // Forward invite to specific friend with sanitized data
        const forwardData = {
            roomId: validation_1.sanitize.roomCode(data.roomId) || '',
            gameName: (data.gameName || '').substring(0, 50),
            gameThumbnail: (data.gameThumbnail || '').substring(0, 200),
            hostName: (data.hostName || 'Host').substring(0, 30),
            senderId: socket.userId
        };
        console.log('📨 [SERVER] Forwarding game:invite_received to user:', data.friendId, 'with data:', forwardData);
        io.to(`user:${data.friendId}`).emit('game:invite_received', forwardData);
    });
}
/**
 * Handle friend offline notification on disconnect
 */
async function notifyFriendsOffline(ctx, userId) {
    const { io, db } = ctx;
    try {
        const { data: friendships } = await db.adminClient
            .from('friendships')
            .select('friend_id, user_id')
            .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
            .eq('status', 'accepted');
        if (friendships) {
            const friendIds = friendships.map(f => f.user_id === userId ? f.friend_id : f.user_id);
            for (const friendId of friendIds) {
                io.to(`user:${friendId}`).emit('friend:offline', { userId });
            }
        }
    }
    catch (e) {
        console.error('❌ Error broadcasting friend offline status:', e);
    }
}
//# sourceMappingURL=friendHandlers.js.map