import React, { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';

const SocketContext = createContext();

export const useSocket = () => {
  return useContext(SocketContext);
};

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [socketId, setSocketId] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Determine server URL based on environment
    const getServerUrl = () => {
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
      // Default for local development if no other conditions met
      return 'https://gamebuddies.io'; // Or 'http://localhost:3033' for local server
    };

    const serverUrl = getServerUrl();
    console.log('🔌 [SocketProvider] Connecting to server:', serverUrl);

    const newSocket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      timeout: 20000, // 20 seconds
      reconnectionAttempts: 5, // Try to reconnect 5 times
      forceNew: true // Ensures a new connection, good for development and some rejoin scenarios
    });

    newSocket.on('connect', () => {
      console.log('✅ [SocketProvider] Connected to server. Socket ID:', newSocket.id);
      setSocket(newSocket);
      setSocketId(newSocket.id);
      setIsConnected(true);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('❌ [SocketProvider] Disconnected from server. Reason:', reason);
      setIsConnected(false);
      // Optionally, you could try to reconnect here or notify the user
      if (reason === 'io server disconnect') {
        // the server explicitly disconnected the socket
        newSocket.connect();
      }
    });

    newSocket.on('connect_error', (error) => {
      console.error('❌ [SocketProvider] Connection error:', error);
      setIsConnected(false);
      // Attempt to reconnect after a delay
      setTimeout(() => {
        if (!newSocket.connected) {
          newSocket.connect();
        }
      }, 5000);
    });

    // This will be the initial socket instance
    setSocket(newSocket);


    // Cleanup on component unmount
    return () => {
      console.log('🧹 [SocketProvider] Cleaning up socket connection.');
      if (newSocket) {
        newSocket.disconnect();
      }
      setSocket(null);
      setSocketId(null);
      setIsConnected(false);
    };
  }, []); // Empty dependency array ensures this runs only once

  const value = {
    socket,
    socketId,
    isConnected,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};
