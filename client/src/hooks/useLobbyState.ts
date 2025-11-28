import { useState, useEffect, useCallback, useRef } from 'react';
import { useSocket } from '../contexts/LazySocketContext';
import type { Player, RoomStatus } from '@shared/types';
import { SOCKET_EVENTS, SERVER_EVENTS } from '@shared/constants';

interface LocalState {
  players: Player[];
  roomStatus: RoomStatus | 'lobby';
  currentPlayer: Player | null;
  isLoading: boolean;
  error: string | null;
}

interface JoinRoomResult {
  success: boolean;
  error?: string;
  data?: unknown;
}

// BUG FIX #18: Simple mutex implementation for state updates
class StateMutex {
  private locked = false;
  private queue: (() => void)[] = [];

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.locked) {
        this.locked = true;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    } else {
      this.locked = false;
    }
  }
}

// BUG FIX #19: Sequenced update tracking
interface PendingUpdate {
  sequence: number;
  status: string;
  location: string;
  timestamp: number;
}

export const useLobbyState = (roomCode: string | null) => {
  const { socket, isConnected } = useSocket();

  const [localState, setLocalState] = useState<LocalState>({
    players: [],
    roomStatus: 'lobby',
    currentPlayer: null,
    isLoading: true,
    error: null,
  });
  const [isOptimistic, setIsOptimistic] = useState(false);
  // BUG FIX #19: Use typed pending updates with sequence numbers
  const [pendingUpdates, setPendingUpdates] = useState<Map<string, PendingUpdate>>(new Map());

  const roomCodeRef = useRef(roomCode);
  const optimisticTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // BUG FIX #18: Mutex for state updates
  const stateMutex = useRef(new StateMutex());
  // BUG FIX #19: Sequence counter for update ordering
  const sequenceCounter = useRef(0);

  useEffect(() => {
    roomCodeRef.current = roomCode;
  }, [roomCode]);

  // BUG FIX #18 & #19: Update player status with mutex and sequence numbers
  const updatePlayerStatus = useCallback(
    async (
      status: string,
      location: string,
      _metadata: Record<string, unknown> = {}
    ): Promise<boolean> => {
      if (!socket || !isConnected) {
        console.warn('[LOBBY] Cannot update status - socket not connected');
        return false;
      }

      const playerId = sessionStorage.getItem('gamebuddies_playerId');
      const playerName = sessionStorage.getItem('gamebuddies_playerName');

      if (!playerId || !playerName) {
        console.warn('[LOBBY] Cannot update status - player info not found');
        return false;
      }

      // BUG FIX #18: Acquire mutex before updating state
      await stateMutex.current.acquire();

      try {
        // BUG FIX #19: Generate sequence number for this update
        const sequence = ++sequenceCounter.current;
        const updateId = `${playerId}_${sequence}`;

        setIsOptimistic(true);
        setLocalState((prev) => ({
          ...prev,
          currentPlayer: prev.currentPlayer
            ? {
                ...prev.currentPlayer,
                isConnected: status !== 'disconnected',
                inGame: status === 'in_game',
                currentLocation: location as 'lobby' | 'game' | 'disconnected',
              }
            : null,
        }));

        // BUG FIX #19: Store update with sequence number and timestamp
        setPendingUpdates((prev) => {
          const newMap = new Map(prev);
          newMap.set(updateId, {
            sequence,
            status,
            location,
            timestamp: Date.now(),
          });
          return newMap;
        });

        if (optimisticTimeout.current) {
          clearTimeout(optimisticTimeout.current);
        }

        optimisticTimeout.current = setTimeout(() => {
          console.warn('[LOBBY] Optimistic update timeout - reverting to server state');
          setIsOptimistic(false);
          // BUG FIX #19: Only remove this specific update, keeping newer ones
          setPendingUpdates((prev) => {
            const newMap = new Map(prev);
            const update = newMap.get(updateId);
            // Only remove if this is the update that timed out (check sequence)
            if (update && update.sequence === sequence) {
              newMap.delete(updateId);
            }
            return newMap;
          });
        }, 5000);

        return true;
      } catch (error) {
        console.error('[LOBBY] Failed to update player status:', error);
        setIsOptimistic(false);
        return false;
      } finally {
        // BUG FIX #18: Always release mutex
        stateMutex.current.release();
      }
    },
    [socket, isConnected]
  );

  useEffect(() => {
    if (!isConnected) {
      setLocalState((prev) => ({
        ...prev,
        error: 'Connection lost',
        isLoading: !prev.players.length,
      }));
    } else if (localState.error === 'Connection lost') {
      setLocalState((prev) => ({
        ...prev,
        error: null,
        isLoading: false,
      }));
    }
  }, [isConnected, localState.error]);

  const joinRoom = useCallback(
    async (playerName: string): Promise<JoinRoomResult> => {
      if (!socket || !isConnected || !roomCodeRef.current) {
        return { success: false, error: 'Not connected to server' };
      }

      setLocalState((prev) => ({ ...prev, isLoading: true }));

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve({ success: false, error: 'Join timeout' });
        }, 10000);

        socket.once(SERVER_EVENTS.ROOM.JOINED, (data) => {
          clearTimeout(timeout);
          setLocalState((prev) => ({
            ...prev,
            isLoading: false,
            error: null,
          }));
          resolve({ success: true, data });
        });

        socket.once(SERVER_EVENTS.ERROR, (error) => {
          clearTimeout(timeout);
          setLocalState((prev) => ({
            ...prev,
            isLoading: false,
            error: error.message || 'Failed to join room',
          }));
          resolve({ success: false, error: error.message });
        });

        socket.emit(SOCKET_EVENTS.ROOM.JOIN, {
          roomCode: roomCodeRef.current!,
          playerName,
        });
      });
    },
    [socket, isConnected]
  );

  const leaveRoom = useCallback(() => {
    if (socket && isConnected && roomCodeRef.current) {
      socket.emit(SOCKET_EVENTS.ROOM.LEAVE, { roomCode: roomCodeRef.current });
    }

    setLocalState({
      players: [],
      roomStatus: 'lobby',
      currentPlayer: null,
      isLoading: false,
      error: null,
    });
    setIsOptimistic(false);
    setPendingUpdates(new Map());
  }, [socket, isConnected]);

  const returnToLobby = useCallback(async (): Promise<boolean> => {
    console.log('[LOBBY] Return to lobby');
    return false;
  }, []);

  const getPlayerById = useCallback(
    (playerId: string): Player | undefined => {
      return localState.players.find((p) => p.id === playerId);
    },
    [localState.players]
  );

  const getPlayerByName = useCallback(
    (playerName: string): Player | undefined => {
      return localState.players.find((p) => p.name === playerName);
    },
    [localState.players]
  );

  const isHost = useCallback(
    (playerId: string): boolean => {
      const player = getPlayerById(playerId);
      return player?.isHost || false;
    },
    [getPlayerById]
  );

  const getCurrentPlayer = useCallback((): Player | null => {
    const playerId = sessionStorage.getItem('gamebuddies_playerId');
    if (!playerId) return localState.currentPlayer;
    return getPlayerById(playerId) || localState.currentPlayer;
  }, [getPlayerById, localState.currentPlayer]);

  useEffect(() => {
    return () => {
      if (optimisticTimeout.current) {
        clearTimeout(optimisticTimeout.current);
      }
    };
  }, []);

  return {
    players: localState.players,
    roomStatus: localState.roomStatus,
    currentPlayer: getCurrentPlayer(),
    isLoading: localState.isLoading,
    error: localState.error,
    isOptimistic,
    hasPendingUpdates: pendingUpdates.size > 0,

    connectedPlayers: localState.players.filter((p) => p.isConnected),
    playersInGame: localState.players.filter((p) => p.inGame),
    playersInLobby: localState.players.filter((p) => p.currentLocation === 'lobby'),

    updatePlayerStatus,
    joinRoom,
    leaveRoom,
    returnToLobby,

    getPlayerById,
    getPlayerByName,
    isHost,
    isCurrentPlayerHost: (): boolean => {
      const current = getCurrentPlayer();
      return current?.isHost || false;
    },

    canStartGame: (): boolean => {
      const current = getCurrentPlayer();
      return !!(current?.isHost && localState.players.length >= 2 && localState.roomStatus === 'lobby');
    },

    canReturnToLobby: (): boolean => {
      const current = getCurrentPlayer();
      return !!(current?.inGame || current?.currentLocation === 'game');
    },
  };
};
