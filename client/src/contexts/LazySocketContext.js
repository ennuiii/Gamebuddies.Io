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
    // Don't create connection if already connecting or connected
    if (isConnecting || socketRef.current?.connected) {
      return socketRef.current;
    }

    const serverUrl = getServerUrl();
    console.log('🔌 [LazySocketProvider] Connecting to server:', serverUrl);
    setIsConnecting(true);

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
      setSocket(newSocket);
      setSocketId(newSocket.id);
      setIsConnected(true);
      setIsConnecting(false);
      reconnectionAttemptsRef.current = 0; // Reset reconnection attempts on successful connection
      
      // Clear any pending reconnection timeout
      if (reconnectionTimeoutRef.current) {
        clearTimeout(reconnectionTimeoutRef.current);
        reconnectionTimeoutRef.current = null;
      }
    });

    newSocket.on('disconnect', (reason) => {
      console.log('❌ [LazySocketProvider] Disconnected from server. Reason:', reason);
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
      setIsConnected(false);
      setIsConnecting(false);
      
      // Attempt reconnection with backoff
      attemptReconnection();
    });

    socketRef.current = newSocket;
    
    // Connect the socket
    newSocket.connect();

    return newSocket;
  }, [getServerUrl, isConnecting, isConnected, attemptReconnection]);

  const disconnectSocket = useCallback(() => {
    if (socketRef.current) {
      console.log('🧹 [LazySocketProvider] Disconnecting socket');
      
      // Clear any pending reconnection timeout
      if (reconnectionTimeoutRef.current) {
        clearTimeout(reconnectionTimeoutRef.current);
        reconnectionTimeoutRef.current = null;
      }
      
      socketRef.current.disconnect();
      socketRef.current = null;
      setSocket(null);
      setSocketId(null);
      setIsConnected(false);
      setIsConnecting(false);
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
    socketId,
    isConnected,
    isConnecting,
    connectSocket,
    disconnectSocket,
  }), [socket, socketId, isConnected, isConnecting, connectSocket, disconnectSocket]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};
