import type { Socket, Server } from 'socket.io';
import type { ServerContext } from '../types';
import { SERVER_EVENTS } from '@shared/constants/socket-events';

/**
 * Achievement socket event types
 */
export interface UnlockedAchievementPayload {
  id: string;
  name: string;
  description?: string;
  icon_url?: string | null;
  xp_reward: number;
  points: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  earned_at: string;
}

export interface AchievementUnlockedEvent {
  userId: string;
  achievements: UnlockedAchievementPayload[];
}

/**
 * Emit achievement unlock event to a specific user
 * Finds all socket connections for the user and emits to them
 */
export function emitAchievementUnlock(
  io: Server,
  ctx: ServerContext,
  userId: string,
  achievements: UnlockedAchievementPayload[]
): void {
  if (!achievements || achievements.length === 0) {
    return;
  }

  try {
    // Find all socket connections for this user
    const connections = ctx.connectionManager.getUserConnections(userId);

    if (connections.length === 0) {
      console.log(`🏆 [ACHIEVEMENT] User ${userId} not connected, cannot emit achievement notification`);
      return;
    }

    // Emit to each connected socket
    for (const connection of connections) {
      const socket = io.sockets.sockets.get(connection.socketId);
      if (socket) {
        socket.emit(SERVER_EVENTS.ACHIEVEMENT.UNLOCKED, {
          userId,
          achievements,
        });
        console.log(`🏆 [ACHIEVEMENT] Emitted ${achievements.length} achievement(s) to user ${userId} via socket ${connection.socketId}`);
      }
    }

    // Also emit to any room the user might be in (for other players to see)
    for (const connection of connections) {
      if (connection.roomCode) {
        io.to(connection.roomCode).emit('player:achievement_unlocked', {
          userId,
          achievements: achievements.map(a => ({
            id: a.id,
            name: a.name,
            rarity: a.rarity,
          })),
        });
        console.log(`🏆 [ACHIEVEMENT] Broadcast achievement unlock to room ${connection.roomCode}`);
        break; // Only broadcast once per room
      }
    }
  } catch (error) {
    console.error('❌ [ACHIEVEMENT] Error emitting achievement unlock:', error);
  }
}

/**
 * Register achievement socket handlers
 * Currently just for future expansion - main emissions happen via emitAchievementUnlock
 */
export function registerAchievementHandlers(socket: Socket, ctx: ServerContext): void {
  // Listen for client requesting achievement check (manual trigger)
  socket.on('achievement:check', async () => {
    const connection = ctx.connectionManager.getConnection(socket.id);
    if (!connection?.userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    try {
      // Trigger a general achievement check for this user
      const { data, error } = await ctx.db.adminClient.rpc('check_achievements', {
        p_user_id: connection.userId,
        p_event_type: 'manual_check',
        p_event_data: {},
      });

      if (error) {
        console.error('❌ [ACHIEVEMENT] Error checking achievements:', error);
        return;
      }

      if (data?.unlocked && data.unlocked.length > 0) {
        socket.emit(SERVER_EVENTS.ACHIEVEMENT.UNLOCKED, {
          userId: connection.userId,
          achievements: data.unlocked,
        });
      }
    } catch (error) {
      console.error('❌ [ACHIEVEMENT] Error in achievement:check handler:', error);
    }
  });
}
