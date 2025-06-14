import { useEffect } from 'react';
import io from 'socket.io-client';

const GameBuddiesReturnHandler = () => {
  useEffect(() => {
    // Only initialize if we have GameBuddies session data
    const roomCode = sessionStorage.getItem('gamebuddies_roomCode');
    const playerName = sessionStorage.getItem('gamebuddies_playerName');
    const isHost = sessionStorage.getItem('gamebuddies_isHost') === 'true';
    
    if (!roomCode || !playerName) {
      return; // Not from GameBuddies
    }

    console.log('🔄 GameBuddies return handler initialized');

    // Determine server URL
    const getServerUrl = () => {
      if (process.env.REACT_APP_SERVER_URL) {
        return process.env.REACT_APP_SERVER_URL;
      }
      
      // If running on Render.com
      if (window.location.hostname.includes('onrender.com')) {
        return window.location.origin.replace(/\/[^/]*$/, '').replace(/\/games\/[^/]*$/, '');
      }
      
      // If running on any production domain (not localhost)
      if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        return window.location.origin.replace(/\/[^/]*$/, '').replace(/\/games\/[^/]*$/, '');
      }
      
      // For local development, connect to local GameBuddies server
      return 'http://localhost:3000';
    };

    const socket = io(getServerUrl(), {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: true
    });

    // Listen for GM-initiated return to lobby
    socket.on('returnToLobbyInitiated', (data) => {
      console.log('🔄 GM initiated return to lobby:', data);
      
      // Store the updated session data
      sessionStorage.setItem('gamebuddies_roomCode', data.roomCode);
      sessionStorage.setItem('gamebuddies_playerName', data.playerName);
      sessionStorage.setItem('gamebuddies_isHost', data.isHost.toString());
      sessionStorage.setItem('gamebuddies_returnUrl', data.returnUrl);
      
      // Redirect to GameBuddies with auto-rejoin
      window.location.href = `${data.returnUrl}?autorejoin=${data.roomCode}&name=${encodeURIComponent(data.playerName)}&host=${data.isHost}`;
    });

    // Connect to room to receive events
    socket.on('connect', () => {
      console.log('🔄 Connected to GameBuddies for return handling');
      socket.emit('joinRoom', {
        roomCode: roomCode,
        playerName: playerName
      });
    });

    socket.on('connect_error', (error) => {
      console.error('🔄 Failed to connect to GameBuddies:', error);
    });

    // Cleanup
    return () => {
      socket.disconnect();
    };
  }, []);

  // This component doesn't render anything
  return null;
};

export default GameBuddiesReturnHandler; 