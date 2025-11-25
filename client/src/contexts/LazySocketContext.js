import React, { createContext, useContext, useEffect, useState, useRef, useCallback, useMemo } from 'react';
import io from 'socket.io-client';

const SocketContext = createContext();

export const useSocket = () => {
  return useContext(SocketContext);
};

export const LazySocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [socketId, setSocketId] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const reconnectionTimeoutRef = useRef(null);
  const reconnectionAttemptsRef = useRef(0);
  const maxReconnectionAttempts = 3;
  const socketRef = useRef(null);
  const isConnectingRef = useRef(false); // Synchronous guard to prevent race conditions

  // Store last room info for auto-rejoin on reconnect
  const lastRoomRef = useRef(null);

  // Track authenticated user for friend presence (socket stays connected for auth users)
  const authenticatedUserIdRef = useRef(null);

  // Determine server URL based on environment
  const getServerUrl = useCallback(() => {
    // Prefer explicit env vars (support both names used in docs/code)
    const envUrl = process.env.REACT_APP_SERVER_URL || process.env.REACT_APP_GAMEBUDDIES_API_URL;
    if (envUrl) return envUrl;

    // In hosted environments or non-localhost, use current origin
    if (
      typeof window !== 'undefined' &&
      (
        window.location.hostname === 'gamebuddies.io' ||
        window.location.hostname.includes('gamebuddies-client') ||
        window.location.hostname.includes('onrender.com') ||
        (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')
      )
    ) {
      return window.location.origin;
    }

    // Local development: default to current origin so CRA proxy can handle sockets
    if (typeof window !== 'undefined') {
      return window.location.origin;
    }

    // Ultimate fallback
    return 'http://localhost:3033';
  }, []);

  // Set last room info for auto-rejoin on reconnect
  const setLastRoom = useCallback((roomInfo) => {
    if (roomInfo) {
      console.log('📝 [LazySocketProvider] Storing room info for auto-rejoin:', roomInfo.roomCode);
      lastRoomRef.current = roomInfo;
    } else {
      console.log('📝 [LazySocketProvider] Clearing stored room info');
      lastRoomRef.current = null;
    }
  }, []);

  // Clear last room (for explicit leave/disconnect)
  const clearLastRoom = useCallback(() => {
    lastRoomRef.current = null;
  }, []);

  // Identify user to server for friend presence tracking
  const identifyUser = useCallback((userId) => {
    if (!userId) return;

    authenticatedUserIdRef.current = userId;

    if (socketRef.current?.connected) {
      console.log('👤 [LazySocketProvider] Identifying user to server:', userId);
      socketRef.current.emit('user:identify', userId);
    }
  }, []);

  // Clear authenticated user (on logout)
  const clearAuthenticatedUser = useCallback(() => {
    authenticatedUserIdRef.current = null;
  }, []);

  const attemptReconnection = useCallback(() => {
    if (reconnectionAttemptsRef.current >= maxReconnectionAttempts) {
      console.log('❌ [LazySocketProvider] Max reconnection attempts reached. Stopping reconnection.');
      setIsConnecting(false);
      return;
    }

    reconnectionAttemptsRef.current++;
    const delay = Math.pow(2, reconnectionAttemptsRef.current) * 1000; // Exponential backoff
    console.log(`🔄 [LazySocketProvider] Reconnection attempt ${reconnectionAttemptsRef.current}/${maxReconnectionAttempts} in ${delay}ms`);

    reconnectionTimeoutRef.current = setTimeout(() => {
      if (socketRef.current && !socketRef.current.connected && !isConnected) {
        console.log('🔌 [LazySocketProvider] Attempting reconnection...');
        socketRef.current.connect();
      }
    }, delay);
  }, [isConnected, maxReconnectionAttempts]);

  const connectSocket = useCallback(() => {
    // Use ref for SYNCHRONOUS check (prevents race condition with async state)
    if (isConnectingRef.current || socketRef.current?.connected) {
      console.log('🔌 [LazySocketProvider] Already connecting/connected, returning existing socket');
      return socketRef.current;
    }

    // Set ref IMMEDIATELY (synchronous) before any async operations
    isConnectingRef.current = true;

    const serverUrl = getServerUrl();
    console.log('🔌 [LazySocketProvider] Connecting to server:', serverUrl);
    setIsConnecting(true); // Keep state for UI

    const transportsPref = (process.env.REACT_APP_SOCKET_TRANSPORTS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const newSocket = io(serverUrl, {
      transports: transportsPref.length ? transportsPref : ['polling', 'websocket'],
      timeout: 20000, // 20 seconds
      reconnection: false, // Disable automatic reconnection
      forceNew: false, // Don't force new connections
      autoConnect: false // Don't auto-connect
    });

    newSocket.on('connect', () => {
      console.log('✅ [LazySocketProvider] Connected to server. Socket ID:', newSocket.id);
      isConnectingRef.current = false; // Reset ref on success
      setSocket(newSocket);
      setSocketId(newSocket.id);
      setIsConnected(true);
      setIsConnecting(false);

      const wasReconnecting = reconnectionAttemptsRef.current > 0;
      reconnectionAttemptsRef.current = 0; // Reset reconnection attempts on successful connection

      // Clear any pending reconnection timeout
      if (reconnectionTimeoutRef.current) {
        clearTimeout(reconnectionTimeoutRef.current);
        reconnectionTimeoutRef.current = null;
      }

      // Auto-identify user if authenticated (for friend presence on reconnect)
      if (authenticatedUserIdRef.current) {
        console.log('👤 [LazySocketProvider] Auto-identifying user on connect:', authenticatedUserIdRef.current);
        newSocket.emit('user:identify', authenticatedUserIdRef.current);
      }

      // Auto-rejoin room if we were in one before disconnect
      if (wasReconnecting && lastRoomRef.current) {
        console.log('🔄 [LazySocketProvider] Auto-rejoining room after reconnect:', lastRoomRef.current.roomCode);
        newSocket.emit('joinRoom', {
          roomCode: lastRoomRef.current.roomCode,
          playerName: lastRoomRef.current.playerName,
          customLobbyName: lastRoomRef.current.customLobbyName,
          supabaseUserId: lastRoomRef.current.supabaseUserId,
          isRejoin: true
        });
      }
    });

    newSocket.on('disconnect', (reason) => {
      console.log('❌ [LazySocketProvider] Disconnected from server. Reason:', reason);
      isConnectingRef.current = false; // Reset ref on disconnect
      setIsConnected(false);
      setIsConnecting(false);
      
      // Only attempt reconnection for certain disconnect reasons
      if (reason === 'io server disconnect') {
        console.log('🔄 [LazySocketProvider] Server initiated disconnect, attempting reconnection...');
        attemptReconnection();
      } else if (reason === 'transport close' || reason === 'transport error') {
        console.log('🔄 [LazySocketProvider] Transport issue, attempting reconnection...');
        attemptReconnection();
      }
    });

    newSocket.on('connect_error', (error) => {
      console.error('❌ [LazySocketProvider] Connection error:', error);
      isConnectingRef.current = false; // Reset ref on error
      setIsConnected(false);
      setIsConnecting(false);
      
      // Attempt reconnection with backoff
      attemptReconnection();
    });

    socketRef.current = newSocket;
    
    // Connect the socket
    newSocket.connect();

    return newSocket;
  }, [getServerUrl, isConnected, attemptReconnection]); // Removed isConnecting - using ref now

  // Connect socket for an authenticated user (combines connect + identify)
  // This is called when user logs in to enable friend presence
  const connectForUser = useCallback((userId) => {
    if (!userId) return null;

    authenticatedUserIdRef.current = userId;

    // Connect if not already connected
    const sock = socketRef.current?.connected ? socketRef.current : connectSocket();

    // If already connected, identify immediately
    if (sock?.connected) {
      console.log('👤 [LazySocketProvider] connectForUser - Already connected, identifying:', userId);
      sock.emit('user:identify', userId);
    }
    // If connecting, identify will happen automatically in connect handler

    return sock;
  }, [connectSocket]);

  const disconnectSocket = useCallback(() => {
    if (socketRef.current) {
      console.log('🧹 [LazySocketProvider] Disconnecting socket');

      // Clear any pending reconnection timeout
      if (reconnectionTimeoutRef.current) {
        clearTimeout(reconnectionTimeoutRef.current);
        reconnectionTimeoutRef.current = null;
      }

      // Clear stored room info on intentional disconnect
      lastRoomRef.current = null;

      socketRef.current.disconnect();
      socketRef.current = null;
      setSocket(null);
      setSocketId(null);
      setIsConnected(false);
      setIsConnecting(false);
      isConnectingRef.current = false; // Reset ref
      reconnectionAttemptsRef.current = 0;
    }
  }, []);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      console.log('🧹 [LazySocketProvider] Component unmounting, cleaning up...');
      disconnectSocket();
    };
  }, [disconnectSocket]);

  const value = useMemo(() => ({
    socket,
    socketRef, // Direct ref access - bypasses async React state for immediate socket availability
    socketId,
    isConnected,
    isConnecting,
    connectSocket,
    disconnectSocket,
    setLastRoom,
    clearLastRoom,
    // Friend presence functions
    connectForUser,
    identifyUser,
    clearAuthenticatedUser,
  }), [socket, socketId, isConnected, isConnecting, connectSocket, disconnectSocket, setLastRoom, clearLastRoom, connectForUser, identifyUser, clearAuthenticatedUser]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};
