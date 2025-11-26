"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerConnectionHandlers = registerConnectionHandlers;
/**
 * Register connection-related handlers (heartbeat)
 */
function registerConnectionHandlers(socket, ctx) {
    const { db, connectionManager } = ctx;
    // Handle heartbeat to keep connection active
    socket.on('heartbeat', async () => {
        const connection = connectionManager.getConnection(socket.id);
        if (connection) {
            // Update memory state
            connectionManager.updateConnection(socket.id, {});
            // Update Database (Throttle to once per minute to save DB writes)
            const now = Date.now();
            const lastUpdate = connection.lastDBUpdate;
            if (!lastUpdate || now - lastUpdate > 60000) {
                connection.lastDBUpdate = now;
                if (connection.userId && connection.roomId) {
                    // Fire and forget DB update
                    db.adminClient
                        .from('room_members')
                        .update({ last_ping: new Date().toISOString(), is_connected: true })
                        .eq('user_id', connection.userId)
                        .eq('room_id', connection.roomId)
                        .then(({ error }) => {
                        if (error)
                            console.error(`❌ Failed to update heartbeat for ${connection.username}:`, error);
                    });
                }
            }
        }
    });
}
//# sourceMappingURL=connectionHandlers.js.map