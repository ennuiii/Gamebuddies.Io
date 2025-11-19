import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import io from 'socket.io-client';

const SocketContext = createContext();

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [socketId, setSocketId] = useState(null);
  const [connectionState, setConnectionState] = useState('connecting');
  const [sessionToken, setSessionToken] = useState(null);
  const [playerStatus, setPlayerStatus] = useState({
    isConnected: false,
    currentLocation: 'lobby',
    inGame: false,
    lastUpdate: null
  });
  const [roomState, setRoomState] = useState(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  // Refs for preventing stale closures
  const socketRef = useRef(null);
  const heartbeatInterval = useRef(null);
  const reconnectTimeout = useRef(null);

  // Get server URL with environment detection
  const getServerUrl = useCallback(() => {
    if (process.env.REACT_APP_SERVER_URL) {
      return process.env.REACT_APP_SERVER_URL;
    }
    if (window.location.hostname === 'gamebuddies.io' || window.location.hostname.includes('gamebuddies-client')) {
      return window.location.origin;
    }
    if (window.location.hostname.includes('onrender.com')) {
      return window.location.origin;
    }
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return window.location.origin;
    }
    return 'https://gamebuddies.io';
  }, []);

  // Attempt session recovery
  const recoverSession = useCallback(async (savedSessionToken) => {
    try {
      console.log('🔄 [SOCKET] Attempting session recovery...');
      
      const response = await fetch(`${getServerUrl()}/api/v2/sessions/recover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionToken: savedSessionToken,
          socketId: socketRef.current?.id
        })
      });

      if (response.ok) {
        const sessionData = await response.json();
        console.log('✅ [SOCKET] Session recovered successfully');
        
        setSessionToken(sessionData.newSessionToken);
        setPlayerStatus({
          isConnected: true,
          currentLocation: sessionData.playerState.current_location,
          inGame: sessionData.playerState.in_game,
          lastUpdate: new Date().toISOString()
        });

        // Save new session token
        localStorage.setItem('gamebuddies_session', sessionData.newSessionToken);
        
        return sessionData;
      } else {
        throw new Error('Session recovery failed');
      }
    } catch (error) {
      console.warn('⚠️ [SOCKET] Session recovery failed:', error);
      localStorage.removeItem('gamebuddies_session');
      return null;
    }
  }, [getServerUrl]);

  // Create new connection
  const createNewConnection = useCallback(() => {
    const serverUrl = getServerUrl();
    console.log('🔌 [SOCKET] Creating new connection to:', serverUrl);

    const newSocket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      maxReconnectionAttempts: 5,
      forceNew: false
    });

    socketRef.current = newSocket;
    setSocket(newSocket);
    
    return newSocket;
  }, [getServerUrl]);

  // Setup socket event handlers
  const setupSocketHandlers = useCallback((socketInstance) => {
    if (!socketInstance) return;

    socketInstance.on('connect', async () => {
      console.log('✅ [SOCKET] Connected to server. Socket ID:', socketInstance.id);
      setSocketId(socketInstance.id);
      setConnectionState('connected');
      setReconnectAttempt(0);

      // Clear any reconnect timeout
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }

      // Attempt session recovery if we have a saved token
      const savedSession = localStorage.getItem('gamebuddies_session');
      if (savedSession) {
        await recoverSession(savedSession);
      }

      // Start heartbeat
      startHeartbeat();
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('❌ [SOCKET] Disconnected from server. Reason:', reason);
      setConnectionState('disconnected');
      setPlayerStatus(prev => ({ ...prev, isConnected: false }));
      
      // Stop heartbeat
      stopHeartbeat();

      // Handle reconnection based on disconnect reason
      if (reason === 'io server disconnect') {
        // Server explicitly disconnected us
        setConnectionState('error');
      } else {
        // Network issue or client disconnect - attempt reconnect
        handleReconnection();
      }
    });

    socketInstance.on('connect_error', (error) => {
      console.error('❌ [SOCKET] Connection error:', error);
      setConnectionState('error');
      handleReconnection();
    });

    // Enhanced room events
    socketInstance.on('roomStatusSync', (data) => {
      console.log('🔄 [SOCKET] Room status sync received:', data);
      setRoomState(data);
    });

    socketInstance.on('playerStatusUpdated', (data) => {
      // Version gating: ignore stale snapshots when roomVersion is present
      if (typeof data?.roomVersion === 'number') {
        if (data.roomVersion <= roomVersionRef.current) return;
        roomVersionRef.current = data.roomVersion;
      }
      console.log('🔄 [SOCKET] Player status updated:', data);
      
      // Update room state if provided
      if (data.room && data.players) {
        setRoomState(prevState => ({
          ...prevState,
          room: data.room,
          players: data.players
        }));
      }

      // Update own status if this update is for current player
      const currentPlayerId = sessionStorage.getItem('gamebuddies_playerId');
      if (data.playerId === currentPlayerId) {
        setPlayerStatus(prev => ({
          ...prev,
          currentLocation: data.status.current_location,
          inGame: data.status.in_game,
          isConnected: data.status.is_connected,
          lastUpdate: new Date().toISOString()
        }));
      }
    });

    socketInstance.on('statusConflictResolved', (data) => {
      console.log('🔧 [SOCKET] Status conflict resolved:', data);
      
      if (data.requiresAction) {
        // Update local status to match resolved status
        setPlayerStatus(prev => ({
          ...prev,
          currentLocation: data.resolvedStatus.location,
          inGame: data.resolvedStatus.status === 'in_game',
          isConnected: data.resolvedStatus.status !== 'disconnected',
          lastUpdate: new Date().toISOString()
        }));
      }
    });

    socketInstance.on('groupReturnInitiated', (data) => {
      console.log('🔄 [SOCKET] Group return initiated:', data);
      
      // Update status optimistically
      setPlayerStatus(prev => ({
        ...prev,
        currentLocation: 'lobby',
        inGame: false,
        lastUpdate: new Date().toISOString()
      }));

      // Redirect to return URL
      setTimeout(() => {
        window.location.href = data.returnUrl;
      }, 1000);
    });

    // Heartbeat response
    socketInstance.on('heartbeatAck', (data) => {
      // Update next heartbeat interval if provided
      if (data.nextHeartbeat && heartbeatInterval.current) {
        stopHeartbeat();
        startHeartbeat(data.nextHeartbeat);
      }
    });

  }, [recoverSession]);

  // Handle reconnection with exponential backoff
  const handleReconnection = useCallback(() => {
    if (reconnectTimeout.current) return; // Already attempting reconnection

    const delay = Math.min(1000 * Math.pow(2, reconnectAttempt), 30000); // Max 30 seconds
    console.log(`🔄 [SOCKET] Reconnecting in ${delay}ms (attempt ${reconnectAttempt + 1})`);
    
    setConnectionState('reconnecting');
    
    reconnectTimeout.current = setTimeout(() => {
      setReconnectAttempt(prev => prev + 1);
      
      if (socketRef.current) {
        socketRef.current.connect();
      } else {
        const newSocket = createNewConnection();
        setupSocketHandlers(newSocket);
      }
      
      reconnectTimeout.current = null;
    }, delay);
  }, [reconnectAttempt, createNewConnection, setupSocketHandlers]);

  // Start heartbeat system
  const startHeartbeat = useCallback((interval = 30000) => {
    stopHeartbeat(); // Clear any existing heartbeat
    
    heartbeatInterval.current = setInterval(() => {
      if (socketRef.current && socketRef.current.connected) {
        const roomCode = sessionStorage.getItem('gamebuddies_roomCode');
        const playerId = sessionStorage.getItem('gamebuddies_playerId');
        
        if (roomCode && playerId) {
          socketRef.current.emit('heartbeat', {
            roomCode,
            playerId,
            timestamp: new Date().toISOString(),
            currentLocation: playerStatus.currentLocation
          });
        }
      }
    }, interval);
  }, [playerStatus.currentLocation]);

  // Stop heartbeat system
  const stopHeartbeat = useCallback(() => {
    if (heartbeatInterval.current) {
      clearInterval(heartbeatInterval.current);
      heartbeatInterval.current = null;
    }
  }, []);

  // Sync player status
  const syncStatus = useCallback(async (status, location, metadata = {}) => {
    if (!socketRef.current || !socketRef.current.connected) {
      console.warn('⚠️ [SOCKET] Cannot sync status - socket not connected');
      return false;
    }

    try {
      // Update local status optimistically
      setPlayerStatus(prev => ({
        ...prev,
        currentLocation: location,
        inGame: status === 'in_game',
        isConnected: status !== 'disconnected',
        lastUpdate: new Date().toISOString()
      }));

      // Send to server
      socketRef.current.emit('updatePlayerStatus', {
        status,
        location,
        metadata: {
          ...metadata,
          timestamp: new Date().toISOString(),
          source: 'client_sync'
        }
      });

      return true;
    } catch (error) {
      console.error('❌ [SOCKET] Failed to sync status:', error);
      return false;
    }
  }, []);

  // Manual reconnection
  const reconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    setReconnectAttempt(0);
    const newSocket = createNewConnection();
    setupSocketHandlers(newSocket);
  }, [createNewConnection, setupSocketHandlers]);

  // Initialize connection
  useEffect(() => {
    const newSocket = createNewConnection();
    setupSocketHandlers(newSocket);

    // Cleanup on unmount
    return () => {
      console.log('🧹 [SOCKET] Cleaning up socket connection');
      
      stopHeartbeat();
      
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      
      setSocket(null);
      setSocketId(null);
      setConnectionState('disconnected');
    };
  }, []); // Empty dependency array for one-time initialization

  // Update session storage when status changes
  useEffect(() => {
    if (playerStatus.lastUpdate) {
      sessionStorage.setItem('gamebuddies_playerStatus', JSON.stringify(playerStatus));
    }
  }, [playerStatus]);

  const value = {
    socket: socketRef.current,
    socketId,
    connectionState,
    isConnected: connectionState === 'connected',
    sessionToken,
    playerStatus,
    roomState,
    reconnectAttempt,
    
    // Methods
    syncStatus,
    reconnect,
    
    // Status helpers
    isInGame: playerStatus.inGame,
    isInLobby: playerStatus.currentLocation === 'lobby',
    isDisconnected: !playerStatus.isConnected
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};

export default SocketProvider;
