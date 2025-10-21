import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';

const SocketContext = createContext();

export const useSocket = () => {
  return useContext(SocketContext);
};

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [socketId, setSocketId] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const reconnectionTimeoutRef = useRef(null);
  const reconnectionAttemptsRef = useRef(0);
  const maxReconnectionAttempts = 3;

  useEffect(() => {
    // Don't create connection if already connecting or connected
    if (isConnecting || socket) {
      return;
    }

    // Determine server URL based on environment
    const getServerUrl = () => {
      if (process.env.REACT_APP_SERVER_URL) {
        return process.env.REACT_APP_SERVER_URL;
      }
      if (
        window.location.hostname === 'gamebuddies.io' ||
        window.location.hostname.includes('gamebuddies-client')
      ) {
        return window.location.origin;
      }
      if (window.location.hostname.includes('onrender.com')) {
        return window.location.origin;
      }
      if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        return window.location.origin;
      }
      // Default for local development if no other conditions met
      return 'https://gamebuddies.io'; // Or 'http://localhost:3033' for local server
    };

    const serverUrl = getServerUrl();
    console.log('🔌 [SocketProvider] Connecting to server:', serverUrl);
    setIsConnecting(true);

    const newSocket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      timeout: 20000, // 20 seconds
      reconnection: false, // Disable automatic reconnection
      forceNew: false, // Don't force new connections
    });

    newSocket.on('connect', () => {
      console.log('✅ [SocketProvider] Connected to server. Socket ID:', newSocket.id);
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

    const attemptReconnection = () => {
      if (reconnectionAttemptsRef.current >= maxReconnectionAttempts) {
        console.log(
          '❌ [SocketProvider] Max reconnection attempts reached. Stopping reconnection.'
        );
        setIsConnecting(false);
        return;
      }

      reconnectionAttemptsRef.current++;
      const delay = Math.pow(2, reconnectionAttemptsRef.current) * 1000; // Exponential backoff
      console.log(
        `🔄 [SocketProvider] Reconnection attempt ${reconnectionAttemptsRef.current}/${maxReconnectionAttempts} in ${delay}ms`
      );

      reconnectionTimeoutRef.current = setTimeout(() => {
        if (!newSocket.connected && !isConnected) {
          console.log('🔌 [SocketProvider] Attempting reconnection...');
          newSocket.connect();
        }
      }, delay);
    };

    newSocket.on('disconnect', reason => {
      console.log('❌ [SocketProvider] Disconnected from server. Reason:', reason);
      setIsConnected(false);
      setIsConnecting(false);

      // Only attempt reconnection for certain disconnect reasons
      if (reason === 'io server disconnect') {
        console.log('🔄 [SocketProvider] Server initiated disconnect, attempting reconnection...');
        attemptReconnection();
      } else if (reason === 'transport close' || reason === 'transport error') {
        console.log('🔄 [SocketProvider] Transport issue, attempting reconnection...');
        attemptReconnection();
      }
    });

    newSocket.on('connect_error', error => {
      console.error('❌ [SocketProvider] Connection error:', error);
      setIsConnected(false);
      setIsConnecting(false);

      // Attempt reconnection with backoff
      attemptReconnection();
    });

    // Don't set socket immediately, wait for connection
    // setSocket(newSocket);

    // Cleanup on component unmount
    return () => {
      console.log('🧹 [SocketProvider] Cleaning up socket connection.');

      // Clear any pending reconnection timeout
      if (reconnectionTimeoutRef.current) {
        clearTimeout(reconnectionTimeoutRef.current);
        reconnectionTimeoutRef.current = null;
      }

      if (newSocket) {
        newSocket.disconnect();
      }
      setSocket(null);
      setSocketId(null);
      setIsConnected(false);
      setIsConnecting(false);
      reconnectionAttemptsRef.current = 0;
    };
  }, []); // Empty dependency array ensures this runs only once

  const value = {
    socket,
    socketId,
    isConnected,
    isConnecting,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};
