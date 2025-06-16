import { useEffect } from 'react';
import io from 'socket.io-client';

const GameBuddiesReturnHandler = () => {
  useEffect(() => {
    // Only initialize if we have GameBuddies session data
    const roomCode = sessionStorage.getItem('gamebuddies_roomCode');
    const playerName = sessionStorage.getItem('gamebuddies_playerName');
    const isHost = sessionStorage.getItem('gamebuddies_isHost') === 'true';
    const gameType = sessionStorage.getItem('gamebuddies_gameType');
    const returnUrl = sessionStorage.getItem('gamebuddies_returnUrl');
    
    console.log('🔄 [RETURN HANDLER DEBUG] Initializing with session data:', {
      roomCode,
      playerName,
      isHost,
      gameType,
      returnUrl,
      hasRoomCode: !!roomCode,
      hasPlayerName: !!playerName,
      currentURL: window.location.href,
      timestamp: new Date().toISOString()
    });
    
    if (!roomCode || !playerName) {
      console.log('🔄 [RETURN HANDLER DEBUG] Not from GameBuddies - missing session data');
      return; // Not from GameBuddies
    }

    console.log('🔄 [RETURN HANDLER DEBUG] GameBuddies return handler initialized');

    // Determine server URL
    const getServerUrl = () => {
      console.log('🔍 [RETURN HANDLER DEBUG] Determining server URL...');
      console.log('🔍 [RETURN HANDLER DEBUG] window.location.hostname:', window.location.hostname);
      console.log('🔍 [RETURN HANDLER DEBUG] window.location.origin:', window.location.origin);
      console.log('🔍 [RETURN HANDLER DEBUG] REACT_APP_SERVER_URL:', process.env.REACT_APP_SERVER_URL);
      
      if (process.env.REACT_APP_SERVER_URL) {
        console.log('🔍 [RETURN HANDLER DEBUG] Using REACT_APP_SERVER_URL:', process.env.REACT_APP_SERVER_URL);
        return process.env.REACT_APP_SERVER_URL;
      }
      
      // If running on production gamebuddies.io domain
      if (window.location.hostname === 'gamebuddies.io' || window.location.hostname.includes('gamebuddies')) {
        console.log('🔍 [RETURN HANDLER DEBUG] Detected GameBuddies production domain, using origin:', window.location.origin);
        return window.location.origin;
      }
      
      // If running on Render.com
      if (window.location.hostname.includes('onrender.com')) {
        console.log('🔍 [RETURN HANDLER DEBUG] Detected Render.com, using origin:', window.location.origin);
        return window.location.origin;
      }
      
      // If running on any other production domain (not localhost)
      if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        console.log('🔍 [RETURN HANDLER DEBUG] Detected other production domain, using origin:', window.location.origin);
        return window.location.origin;
      }
      
      // For local development, connect to local GameBuddies server
      console.log('🔍 [RETURN HANDLER DEBUG] Local development, using localhost:3000');
      return 'http://localhost:3000';
    };

    const serverUrl = getServerUrl();
    console.log('🔄 [RETURN HANDLER DEBUG] Connecting to server:', serverUrl);

    const socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: true
    });

    // Listen for GM-initiated return to lobby
    socket.on('returnToLobbyInitiated', (data) => {
      console.log('🔄 [RETURN HANDLER DEBUG] GM initiated return to lobby received:', {
        data,
        currentURL: window.location.href,
        timestamp: new Date().toISOString()
      });
      
      // Store the updated session data
      console.log('🔄 [RETURN HANDLER DEBUG] Updating session storage with return data');
      sessionStorage.setItem('gamebuddies_roomCode', data.roomCode);
      sessionStorage.setItem('gamebuddies_playerName', data.playerName);
      sessionStorage.setItem('gamebuddies_isHost', data.isHost.toString());
      sessionStorage.setItem('gamebuddies_returnUrl', data.returnUrl);
      
      // Construct redirect URL with special rejoin flag to prevent duplicate errors
      const redirectUrl = `${data.returnUrl}?rejoin=${data.roomCode}&name=${encodeURIComponent(data.playerName)}&host=${data.isHost}&fromGame=true`;
      console.log('🔄 [RETURN HANDLER DEBUG] Redirecting to GameBuddies:', redirectUrl);
      
      // Disconnect from current socket before redirecting to prevent conflicts
      socket.disconnect();
      
      // Small delay to ensure disconnect completes
      setTimeout(() => {
        // Redirect to GameBuddies with special rejoin parameters
        window.location.href = redirectUrl;
      }, 100);
    });

    // Connect to room ONLY to listen for return events, don't try to join
    socket.on('connect', () => {
      console.log('🔄 [RETURN HANDLER DEBUG] Connected to GameBuddies server');
      console.log('🔄 [RETURN HANDLER DEBUG] Socket ID:', socket.id);
      console.log('🔄 [RETURN HANDLER DEBUG] Joining socket room for return listening only:', roomCode);
      
      // Just join the socket room to listen for events - don't call joinRoom
      // This prevents duplicate player errors
      socket.emit('joinSocketRoom', { roomCode });
      
      console.log('📤 [RETURN HANDLER DEBUG] joinSocketRoom event sent (listening only)');
    });

    socket.on('connect_error', (error) => {
      console.error('🔄 [RETURN HANDLER ERROR] Failed to connect to GameBuddies:', {
        error: error.message,
        serverUrl,
        roomCode,
        playerName,
        timestamp: new Date().toISOString()
      });
    });

    socket.on('error', (error) => {
      console.error('🔄 [RETURN HANDLER ERROR] Socket error:', {
        error: error.message || error,
        code: error.code,
        roomCode,
        playerName,
        timestamp: new Date().toISOString()
      });
    });

    socket.on('disconnect', () => {
      console.log('🔄 [RETURN HANDLER DEBUG] Disconnected from GameBuddies server');
    });

    // Cleanup
    return () => {
      console.log('🔄 [RETURN HANDLER DEBUG] Cleaning up return handler');
      socket.disconnect();
    };
  }, []);

  // This component doesn't render anything
  return null;
};

export default GameBuddiesReturnHandler; 