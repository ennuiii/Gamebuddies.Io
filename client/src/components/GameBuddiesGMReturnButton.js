import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import './GameBuddiesGMReturnButton.css';

const GameBuddiesGMReturnButton = ({ 
  style = {}, 
  className = '', 
  children = '← Return to GameBuddies Lobby' 
}) => {
  const [socket, setSocket] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [roomCode, setRoomCode] = useState(null);
  const [isReturning, setIsReturning] = useState(false);

  useEffect(() => {
    // Check if user is GM/host and has GameBuddies session data
    const storedIsHost = sessionStorage.getItem('gamebuddies_isHost') === 'true';
    const storedRoomCode = sessionStorage.getItem('gamebuddies_roomCode');
    
    setIsHost(storedIsHost);
    setRoomCode(storedRoomCode);

    if (!storedIsHost || !storedRoomCode) {
      return; // Don't show button if not host or no room data
    }

    // Connect to GameBuddies server
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
      
      // For local development
      return 'http://localhost:3000';
    };

    const newSocket = io(getServerUrl(), {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: true
    });

    newSocket.on('connect', () => {
      console.log('🔄 GM Return Button connected to GameBuddies');
      // Join room to maintain connection
      newSocket.emit('joinRoom', {
        roomCode: storedRoomCode,
        playerName: sessionStorage.getItem('gamebuddies_playerName')
      });
    });

    newSocket.on('connect_error', (error) => {
      console.error('🔄 GM Return Button connection error:', error);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const handleReturnToLobby = () => {
    if (!socket || !roomCode || !isHost) {
      console.error('Cannot return to lobby: missing socket, room code, or not host');
      return;
    }

    setIsReturning(true);
    
    console.log('🔄 GM initiating return to lobby for all players');
    socket.emit('returnToLobby', { roomCode });

    // The server will send returnToLobbyInitiated event to all players
    // including this GM, which will trigger automatic redirect
  };

  // Don't render if not host or no room data
  if (!isHost || !roomCode) {
    return null;
  }

  const defaultStyle = {
    position: 'fixed',
    top: '20px',
    left: '20px',
    zIndex: 1000,
    padding: '12px 20px',
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: isReturning ? 'not-allowed' : 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    transition: 'all 0.2s ease',
    opacity: isReturning ? 0.7 : 1,
    ...style
  };

  return (
    <button
      onClick={handleReturnToLobby}
      disabled={isReturning}
      style={defaultStyle}
      className={`gamebuddies-gm-return-btn ${className}`}
      title="Return all players to GameBuddies lobby to select another game"
    >
      {isReturning ? '🔄 Returning...' : children}
    </button>
  );
};

export default GameBuddiesGMReturnButton; 