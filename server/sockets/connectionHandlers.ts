import type { Socket } from 'socket.io';
import type { ServerContext } from '../types';

/**
 * Register connection-related handlers (heartbeat)
 */
export function registerConnectionHandlers(
  socket: Socket,
  ctx: ServerContext
): void {
  const { db, connectionManager } = ctx;

  // Handle heartbeat to keep connection active
  socket.on('heartbeat', async () => {
    const connection = connectionManager.getConnection(socket.id);
    if (connection) {
      // Update memory state
      connectionManager.updateConnection(socket.id, {});

      // Update Database (Throttle to once per minute to save DB writes)
      const now = Date.now();
      const lastUpdate = (connection as any).lastDBUpdate as number | undefined;
      if (!lastUpdate || now - lastUpdate > 60000) {
        (connection as any).lastDBUpdate = now;
        if (connection.userId && connection.roomId) {
          // Fire and forget DB update
          db.adminClient
            .from('room_members')
            .update({ last_ping: new Date().toISOString(), is_connected: true })
            .eq('user_id', connection.userId)
            .eq('room_id', connection.roomId)
            .then(({ error }) => {
              if (error) console.error(`❌ Failed to update heartbeat for ${connection.username}:`, error);
            });
        }
      }
    }
  });
}
