import { useState, useEffect, useCallback, useRef } from 'react';
import { useSocket } from '../contexts/LazySocketContext';

export const useLobbyState = (roomCode) => {
  const { socket, isConnected } = useSocket();
  // Provide fallback values for enhanced features not yet implemented in LazySocketContext
  const roomState = null;
  const playerStatus = null;
  const syncStatus = 'disconnected';
  const [localState, setLocalState] = useState({
    players: [],
    roomStatus: 'lobby',
    currentPlayer: null,
    isLoading: true,
    error: null
  });
  const [isOptimistic, setIsOptimistic] = useState(false);
  const [pendingUpdates, setPendingUpdates] = useState(new Map());
  
  // Refs to prevent stale closures
  const roomCodeRef = useRef(roomCode);
  const optimisticTimeout = useRef(null);

  // Update room code ref when it changes
  useEffect(() => {
    roomCodeRef.current = roomCode;
  }, [roomCode]);

  // Optimistic player status update
  const updatePlayerStatus = useCallback(async (status, location, metadata = {}) => {
    if (!socket || !isConnected) {
      console.warn('⚠️ [LOBBY] Cannot update status - socket not connected');
      return false;
    }

    const playerId = sessionStorage.getItem('gamebuddies_playerId');
    const playerName = sessionStorage.getItem('gamebuddies_playerName');
    
    if (!playerId || !playerName) {
      console.warn('⚠️ [LOBBY] Cannot update status - player info not found');
      return false;
    }

    try {
      // Create optimistic update
      const optimisticUpdate = {
        id: playerId,
        name: playerName,
        isConnected: status !== 'disconnected',
        inGame: status === 'in_game',
        currentLocation: location,
        lastUpdate: new Date().toISOString(),
        isOptimistic: true
      };

      // Apply optimistic update to local state
      setIsOptimistic(true);
      setLocalState(prev => ({
        ...prev,
        currentPlayer: {
          ...prev.currentPlayer,
          ...optimisticUpdate
        },
        players: prev.players.map(p => 
          p.id === playerId ? { ...p, ...optimisticUpdate } : p
        )
      }));

      // Store pending update
      const updateId = `${playerId}_${Date.now()}`;
      setPendingUpdates(prev => new Map(prev.set(updateId, {
        status,
        location,
        metadata,
        timestamp: new Date().toISOString()
      })));

      // Send to server via socket context
      const success = await syncStatus(status, location, {
        ...metadata,
        optimisticUpdateId: updateId,
        source: 'lobby_state_manager'
      });

      if (!success) {
        // Revert optimistic update on failure
        setIsOptimistic(false);
        setPendingUpdates(prev => {
          const newMap = new Map(prev);
          newMap.delete(updateId);
          return newMap;
        });
        return false;
      }

      // Set timeout to revert optimistic state if no server confirmation
      if (optimisticTimeout.current) {
        clearTimeout(optimisticTimeout.current);
      }
      
      optimisticTimeout.current = setTimeout(() => {
        console.warn('⚠️ [LOBBY] Optimistic update timeout - reverting to server state');
        setIsOptimistic(false);
        setPendingUpdates(prev => {
          const newMap = new Map(prev);
          newMap.delete(updateId);
          return newMap;
        });
      }, 5000); // 5 second timeout

      return true;

    } catch (error) {
      console.error('❌ [LOBBY] Failed to update player status:', error);
      setIsOptimistic(false);
      return false;
    }
  }, [socket, isConnected, syncStatus]);

  // Handle room state updates from server
  useEffect(() => {
    if (roomState && roomState.roomCode === roomCodeRef.current) {
      console.log('🔄 [LOBBY] Processing room state update:', roomState);
      
      // Clear optimistic state when server update arrives
      if (isOptimistic) {
        setIsOptimistic(false);
        if (optimisticTimeout.current) {
          clearTimeout(optimisticTimeout.current);
          optimisticTimeout.current = null;
        }
      }

      // Update local state with server data
      setLocalState(prev => ({
        ...prev,
        players: roomState.players || [],
        roomStatus: roomState.room?.status || 'lobby',
        currentPlayer: roomState.players?.find(p => 
          p.id === sessionStorage.getItem('gamebuddies_playerId')
        ) || prev.currentPlayer,
        isLoading: false,
        error: null
      }));

      // Clear any matching pending updates
      const currentPlayerId = sessionStorage.getItem('gamebuddies_playerId');
      setPendingUpdates(prev => {
        const newMap = new Map();
        for (const [key, value] of prev.entries()) {
          // Keep updates that don't match current server state
          if (key.startsWith(currentPlayerId)) {
            const serverPlayer = roomState.players?.find(p => p.id === currentPlayerId);
            if (!serverPlayer || 
                serverPlayer.currentLocation !== value.location ||
                serverPlayer.isConnected !== (value.status !== 'disconnected')) {
              newMap.set(key, value);
            }
          } else {
            newMap.set(key, value);
          }
        }
        return newMap;
      });
    }
  }, [roomState, isOptimistic]);

  // Handle player status updates from socket context
  useEffect(() => {
    if (playerStatus.lastUpdate) {
      const playerId = sessionStorage.getItem('gamebuddies_playerId');
      
      setLocalState(prev => ({
        ...prev,
        currentPlayer: {
          id: playerId,
          name: sessionStorage.getItem('gamebuddies_playerName') || prev.currentPlayer?.name,
          isConnected: playerStatus.isConnected,
          inGame: playerStatus.inGame,
          currentLocation: playerStatus.currentLocation,
          lastUpdate: playerStatus.lastUpdate
        }
      }));
    }
  }, [playerStatus]);

  // Handle connection state changes
  useEffect(() => {
    if (!isConnected) {
      setLocalState(prev => ({
        ...prev,
        error: 'Connection lost',
        isLoading: !prev.players.length // Only show loading if we have no cached data
      }));
    } else if (localState.error === 'Connection lost') {
      setLocalState(prev => ({
        ...prev,
        error: null,
        isLoading: false
      }));
    }
  }, [isConnected, localState.error]);

  // Room management methods
  const joinRoom = useCallback(async (playerName) => {
    if (!socket || !isConnected || !roomCodeRef.current) {
      return { success: false, error: 'Not connected to server' };
    }

    setLocalState(prev => ({ ...prev, isLoading: true }));

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, error: 'Join timeout' });
      }, 10000);

      socket.once('roomJoined', (data) => {
        clearTimeout(timeout);
        setLocalState(prev => ({
          ...prev,
          isLoading: false,
          error: null
        }));
        resolve({ success: true, data });
      });

      socket.once('error', (error) => {
        clearTimeout(timeout);
        setLocalState(prev => ({
          ...prev,
          isLoading: false,
          error: error.message || 'Failed to join room'
        }));
        resolve({ success: false, error: error.message });
      });

      socket.emit('joinRoom', {
        roomCode: roomCodeRef.current,
        playerName
      });
    });
  }, [socket, isConnected]);

  const leaveRoom = useCallback(() => {
    if (socket && isConnected) {
      socket.emit('leaveRoom', { roomCode: roomCodeRef.current });
    }
    
    // Clear local state
    setLocalState({
      players: [],
      roomStatus: 'lobby',
      currentPlayer: null,
      isLoading: false,
      error: null
    });
    setIsOptimistic(false);
    setPendingUpdates(new Map());
  }, [socket, isConnected]);

  const returnToLobby = useCallback(async () => { console.log('[LOBBY] Return disabled'); return false; }, []);
    
    try {
      // Update status to returning
      const success = await updatePlayerStatus('returning', 'lobby', {
        reason: 'Player initiated return to lobby',
        returnInitiatedAt: new Date().toISOString()
      });

      if (success) {
        // Navigate back to GameBuddies
        const returnUrl = sessionStorage.getItem('gamebuddies_returnUrl') || 
                         window.location.origin;
        
        // Small delay to ensure status update is sent
        setTimeout(() => {
          window.location.href = returnUrl;
        }, 500);
      }

      return success;
    } catch (error) {
      console.error('❌ [LOBBY] Failed to return to lobby:', error);
      return false;
    }
  }, [updatePlayerStatus]);

  // Helper methods
  const getPlayerById = useCallback((playerId) => {
    return localState.players.find(p => p.id === playerId);
  }, [localState.players]);

  const getPlayerByName = useCallback((playerName) => {
    return localState.players.find(p => p.name === playerName);
  }, [localState.players]);

  const isHost = useCallback((playerId) => {
    const player = getPlayerById(playerId);
    return player?.isHost || false;
  }, [getPlayerById]);

  const getCurrentPlayer = useCallback(() => {
    const playerId = sessionStorage.getItem('gamebuddies_playerId');
    return getPlayerById(playerId) || localState.currentPlayer;
  }, [getPlayerById, localState.currentPlayer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (optimisticTimeout.current) {
        clearTimeout(optimisticTimeout.current);
      }
    };
  }, []);

  return {
    // State
    players: localState.players,
    roomStatus: localState.roomStatus,
    currentPlayer: getCurrentPlayer(),
    isLoading: localState.isLoading,
    error: localState.error,
    isOptimistic,
    hasPendingUpdates: pendingUpdates.size > 0,
    
    // Status helpers
    connectedPlayers: localState.players.filter(p => p.isConnected),
    playersInGame: localState.players.filter(p => p.inGame),
    playersInLobby: localState.players.filter(p => p.currentLocation === 'lobby'),
    
    // Actions
    updatePlayerStatus,
    joinRoom,
    leaveRoom,
    returnToLobby,
    
    // Helpers
    getPlayerById,
    getPlayerByName,
    isHost,
    isCurrentPlayerHost: () => {
      const current = getCurrentPlayer();
      return current?.isHost || false;
    },
    
    // State checks
    canStartGame: () => {
      const current = getCurrentPlayer();
      return current?.isHost && localState.players.length >= 2 && 
             localState.roomStatus === 'lobby';
    },
    
    canReturnToLobby: () => {
      const current = getCurrentPlayer();
      return current?.inGame || current?.currentLocation === 'game';
    }
  };
};