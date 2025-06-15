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
      console.log('🔍 [RETURN HANDLER DEBUG] REACT_APP_SERVER_URL:', process.env.REACT_APP_SERVER_URL);
      
      if (process.env.REACT_APP_SERVER_URL) {
        console.log('🔍 [RETURN HANDLER DEBUG] Using REACT_APP_SERVER_URL:', process.env.REACT_APP_SERVER_URL);
        return process.env.REACT_APP_SERVER_URL;
      }
      
      // If running on Render.com
      if (window.location.hostname.includes('onrender.com')) {
        const serverUrl = window.location.origin.replace(/\/[^/]*$/, '').replace(/\/games\/[^/]*$/, '');
        console.log('🔍 [RETURN HANDLER DEBUG] Detected Render.com, using origin:', serverUrl);
        return serverUrl;
      }
      
      // If running on any production domain (not localhost)
      if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        const serverUrl = window.location.origin.replace(/\/[^/]*$/, '').replace(/\/games\/[^/]*$/, '');
        console.log('🔍 [RETURN HANDLER DEBUG] Detected production domain, using origin:', serverUrl);
        return serverUrl;
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
      
      // Construct redirect URL
      const redirectUrl = `${data.returnUrl}?autorejoin=${data.roomCode}&name=${encodeURIComponent(data.playerName)}&host=${data.isHost}`;
      console.log('🔄 [RETURN HANDLER DEBUG] Redirecting to GameBuddies:', redirectUrl);
      
      // Redirect to GameBuddies with auto-rejoin
      window.location.href = redirectUrl;
    });

    // Connect to room to receive events
    socket.on('connect', () => {
      console.log('🔄 [RETURN HANDLER DEBUG] Connected to GameBuddies server');
      console.log('🔄 [RETURN HANDLER DEBUG] Socket ID:', socket.id);
      console.log('🔄 [RETURN HANDLER DEBUG] Joining room for return handling:', {
        roomCode,
        playerName
      });
      
      socket.emit('joinRoom', {
        roomCode: roomCode,
        playerName: playerName
      });
      
      console.log('📤 [RETURN HANDLER DEBUG] joinRoom event sent');
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

    socket.on('roomJoined', (data) => {
      console.log('🔄 [RETURN HANDLER DEBUG] Successfully joined room for return handling:', {
        roomCode: data.roomCode,
        isHost: data.isHost,
        playerCount: data.players?.length || 0,
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