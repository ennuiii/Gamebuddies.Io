/**
 * useSocketRecovery Hook
 *
 * Generic hook for state persistence and recovery for games WITHOUT React Router
 * Automatically saves game state and requests sync when socket reconnects
 *
 * For games: SUSD (or any single-page game)
 *
 * Usage in App.tsx or HomePage:
 * import { useSocketRecovery } from '@shared/hooks/useSocketRecovery';
 *
 * function App() {
 *   const { roomCode } = useUnifiedStore();
 *
 *   useSocketRecovery('susd', socketService, roomCode);
 *
 *   // rest of component...
 * }
 */

import { useEffect } from 'react';
import { useGameSession } from './useGameSession';

type SocketService = {
  on: (event: string, callback: (...args: any[]) => void) => void;
  off: (event: string, callback: (...args: any[]) => void) => void;
  emit: (event: string, data?: any, callback?: (response: any) => void) => void;
  getSocket?: () => any;
};

export function useSocketRecovery(
  gamePrefix: string,
  socketService: SocketService | null,
  roomCode: string | null
) {
  const { saveSession, getSession } = useGameSession(gamePrefix);

  // Phase 1: Save game state whenever room code changes
  useEffect(() => {
    if (roomCode) {
      saveSession('roomCode', roomCode);
      console.log(`[${gamePrefix}] 💾 Game state saved:`, { roomCode });
    }
  }, [roomCode, gamePrefix, saveSession]);

  // Phase 2: Request state sync when socket reconnects
  useEffect(() => {
    if (!socketService) return;

    const handleConnect = () => {
      console.log(`[${gamePrefix}] 🔄 Socket connected, checking for saved state...`);

      const savedRoomCode = getSession('roomCode');

      if (savedRoomCode) {
        console.log(`[${gamePrefix}] 🔄 STATE RECOVERY: Syncing state for room`, savedRoomCode);

        // Request game state sync from server
        socketService.emit('game:sync-state', { roomCode: savedRoomCode }, (response: any) => {
          if (response && response.success) {
            console.log(`[${gamePrefix}] ✅ Game state synced from server`);
            // State will be updated via the game:state-synced event listener
            // in the socketService (already handled by game plugins)
          } else {
            console.error(`[${gamePrefix}] Failed to sync game state:`, response?.message);
          }
        });
      }
    };

    // Register listener
    socketService.on('connect', handleConnect);

    return () => {
      socketService.off('connect', handleConnect);
    };
  }, [socketService, gamePrefix, getSession]);
}
