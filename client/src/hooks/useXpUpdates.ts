import { useEffect } from 'react';
import { useSocket } from '../contexts/LazySocketContext';
import { useAuth } from '../contexts/AuthContext';
import { SERVER_EVENTS } from '@shared/constants/socket-events';

/**
 * Payload received from XP update socket event
 */
interface XpUpdatedPayload {
  userId: string;
  xp: number;
  level: number;
  achievement_points: number;
  xp_gained?: number;
  source?: string;
}

/**
 * Hook to listen for XP/level updates via socket and update AuthContext
 * Should be used at the app level to ensure updates are received globally
 */
export function useXpUpdates(): void {
  const { socket, isConnected } = useSocket();
  const { updateUserStats } = useAuth();

  useEffect(() => {
    if (!socket || !isConnected) {
      return;
    }

    // Listen for XP update events
    const handleXpUpdated = (payload: XpUpdatedPayload): void => {
      console.log('⭐ [XP] Received XP update:', payload);

      // Update the AuthContext with new stats
      updateUserStats({
        xp: payload.xp,
        level: payload.level,
        achievement_points: payload.achievement_points,
      });

      // Log level up if applicable
      if (payload.source === 'achievement' && payload.xp_gained) {
        console.log(`⭐ [XP] Gained ${payload.xp_gained} XP from ${payload.source}`);
      }
    };

    // Register listener
    socket.on(SERVER_EVENTS.XP.UPDATED, handleXpUpdated);

    console.log('⭐ [XP] XP update listener registered');

    // Cleanup
    return () => {
      socket.off(SERVER_EVENTS.XP.UPDATED, handleXpUpdated);
      console.log('⭐ [XP] XP update listener removed');
    };
  }, [socket, isConnected, updateUserStats]);
}

export default useXpUpdates;
