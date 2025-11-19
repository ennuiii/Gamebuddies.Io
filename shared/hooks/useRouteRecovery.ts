/**
 * useRouteRecovery Hook
 *
 * Generic hook for route persistence and recovery across games with React Router
 * Automatically saves current route when it changes and restores it when socket reconnects
 *
 * For games: DDF, ClueScale, BingoBuddies
 *
 * Usage in App.tsx:
 * import { useRouteRecovery } from '@shared/hooks/useRouteRecovery';
 *
 * function App() {
 *   const navigate = useNavigate();
 *   const location = useLocation();
 *   const { roomCode } = useUnifiedStore();
 *
 *   useRouteRecovery('ddf', socketService, navigate, location, roomCode);
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

type Location = {
  pathname: string;
};

type NavigateFunction = (path: string) => void;

export function useRouteRecovery(
  gamePrefix: string,
  socketService: SocketService | null,
  navigate: NavigateFunction,
  location: Location,
  roomCode: string | null
) {
  const { saveSession, getSession } = useGameSession(gamePrefix);

  // Phase 1: Save current route whenever it changes
  useEffect(() => {
    const currentPath = location.pathname;

    // Only save non-root routes when player has a room code
    if (currentPath && currentPath !== `/${gamePrefix}` && roomCode) {
      saveSession('currentRoute', currentPath);
      saveSession('roomCode', roomCode);
      console.log(`[${gamePrefix}] 💾 Route state saved:`, {
        route: currentPath,
        roomCode
      });
    }
  }, [location.pathname, roomCode, gamePrefix, saveSession]);

  // Phase 2: Restore route when socket reconnects
  useEffect(() => {
    if (!socketService) return;

    const handleConnect = () => {
      console.log(`[${gamePrefix}] 🔄 Socket connected, checking for saved route...`);

      const savedRoute = getSession('currentRoute');
      const savedRoomCode = getSession('roomCode');

      // Only restore if:
      // 1. We have saved route and room code
      // 2. Current path is root (tab was reopened)
      if (savedRoute && savedRoomCode && location.pathname === `/${gamePrefix}`) {
        console.log(`[${gamePrefix}] 🔄 ROUTE RESTORATION: Restoring saved route`, {
          savedRoute,
          savedRoomCode,
          currentPath: location.pathname
        });

        // Request game state sync from server
        socketService.emit('game:sync-state', { roomCode: savedRoomCode }, (response: any) => {
          if (response && response.success) {
            console.log(`[${gamePrefix}] ✅ Game state synced from server, navigating to:`, savedRoute);
            // Navigate to saved route (state is now synced)
            navigate(savedRoute);
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
  }, [socketService, gamePrefix, location.pathname, navigate, getSession]);
}
