import { useEffect } from 'react';
import { useSocket } from '../contexts/LazySocketContext';
import { useAuth } from '../contexts/AuthContext';
import { showAchievementUnlocks } from '../components/AchievementUnlockToast';
import type { UnlockedAchievement } from '@shared/types/achievements';
import { SERVER_EVENTS } from '@shared/constants/socket-events';

interface AchievementUnlockedPayload {
  userId: string;
  achievements: UnlockedAchievement[];
}

/**
 * Hook to listen for achievement unlock socket events and show toast notifications.
 * Should be used at the app level to ensure notifications are shown globally.
 */
export function useAchievementNotifications(): void {
  const { socket, isConnected } = useSocket();
  const { refreshUser } = useAuth();

  useEffect(() => {
    if (!socket || !isConnected) {
      return;
    }

    // Listen for achievement unlock events
    const handleAchievementUnlocked = (payload: AchievementUnlockedPayload): void => {
      console.log('🏆 [ACHIEVEMENT] Received achievement unlock notification:', payload);

      if (payload.achievements && payload.achievements.length > 0) {
        showAchievementUnlocks(payload.achievements);

        // Refresh user data to update XP, level, and achievement points in header
        refreshUser();
      }
    };

    // Register listener
    socket.on(SERVER_EVENTS.ACHIEVEMENT.UNLOCKED, handleAchievementUnlocked);

    console.log('🏆 [ACHIEVEMENT] Achievement notification listener registered');

    // Cleanup
    return () => {
      socket.off(SERVER_EVENTS.ACHIEVEMENT.UNLOCKED, handleAchievementUnlocked);
      console.log('🏆 [ACHIEVEMENT] Achievement notification listener removed');
    };
  }, [socket, isConnected, refreshUser]);
}

export default useAchievementNotifications;
