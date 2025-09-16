import React, { useState } from 'react';
import io from 'socket.io-client';
import './JoinRoom.css';

const JoinRoom = ({ initialRoomCode = '', initialPlayerName = '', autoJoin = false, onRoomJoined, onCancel }) => {
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [playerName, setPlayerName] = useState(initialPlayerName || '');
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    
    if (!roomCode.trim()) {
      setError('Please enter a room code');
      return;
    }

    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }

    if (roomCode.trim().length !== 6) {
      setError('Room code must be 6 characters long');
      return;
    }

    if (playerName.trim().length < 2) {
      setError('Name must be at least 2 characters long');
      return;
    }

    if (playerName.trim().length > 20) {
      setError('Name must be less than 20 characters');
      return;
    }

    setIsJoining(true);
    setError('');

    console.log('🚪 [JOIN DEBUG] Starting room join process:', {
      roomCode: roomCode.trim().toUpperCase(),
      playerName: playerName.trim(),
      timestamp: new Date().toISOString(),
      isInitialRoomCode: !!initialRoomCode,
      currentURL: window.location.href
    });

    try {
      console.log('🚪 [JOIN DEBUG] Joining room:', roomCode.trim().toUpperCase());
      
      // Determine server URL based on environment
      const getServerUrl = () => {
        console.log('🔍 [JOIN DEBUG] Determining server URL...');
        console.log('🔍 [JOIN DEBUG] window.location.hostname:', window.location.hostname);
        console.log('🔍 [JOIN DEBUG] REACT_APP_SERVER_URL:', process.env.REACT_APP_SERVER_URL);
        
        if (process.env.REACT_APP_SERVER_URL) {
          console.log('🔍 [JOIN DEBUG] Using REACT_APP_SERVER_URL:', process.env.REACT_APP_SERVER_URL);
          return process.env.REACT_APP_SERVER_URL;
        }
        
        // If running on Render.com (check for .onrender.com domain)
        if (window.location.hostname.includes('onrender.com')) {
          console.log('🔍 [JOIN DEBUG] Detected Render.com, using origin:', window.location.origin);
          return window.location.origin;
        }
        
        // If running on any production domain (not localhost)
        if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
          console.log('🔍 [JOIN DEBUG] Detected production domain, using origin:', window.location.origin);
          return window.location.origin;
        }
        
        // For local development, connect to Render.com server
        console.log('🔍 [JOIN DEBUG] Local development, using Render.com server');
        return 'https://gamebuddies-io.onrender.com';
      };

      const serverUrl = getServerUrl();
      console.log('🚪 [JOIN DEBUG] Connecting to server:', serverUrl);

      const socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        timeout: 10000
      });

      // Set up event handlers
      socket.on('connect', () => {
        console.log('✅ [CLIENT] Connected to server, joining room...');
        console.log('🔍 [CLIENT DEBUG] Socket ID:', socket.id);
        console.log('🔍 [CLIENT DEBUG] Room code:', roomCode.trim().toUpperCase());
        console.log('🔍 [CLIENT DEBUG] Player name:', playerName.trim());
        console.log('🔍 [CLIENT DEBUG] Server URL:', serverUrl);
        console.log('🚪 [JOIN DEBUG] Connected, sending joinRoom event');
        
        socket.emit('joinRoom', { 
          roomCode: roomCode.trim().toUpperCase(),
          playerName: playerName.trim()
        });
        console.log('📤 [CLIENT] joinRoom event sent');
      });

      socket.on('roomJoined', (data) => {
        console.log('✅ [CLIENT] Room joined successfully:', data);
        console.log('🔍 [CLIENT DEBUG] Join data:', {
          roomCode: data.roomCode,
          isHost: data.isHost,
          playerCount: data.players?.length || 0,
          room_id: data.room?.id
        });
        console.log('🚪 [JOIN DEBUG] Join successful, transitioning to lobby');
        
        if (onRoomJoined) {
          onRoomJoined({
            roomCode: data.roomCode,
            playerName: playerName.trim(),
            isHost: false,
            players: data.players,
            room: data.room
          });
        }
        
        // Delay socket disconnect to allow RoomLobby to establish its own connection
        console.log('🚪 [JOIN DEBUG] Delaying socket cleanup to allow lobby connection');
        setTimeout(() => {
          console.log('🚪 [JOIN DEBUG] Cleaning up join socket after transition');
          socket.disconnect();
        }, 1000); // 1 second delay
      });

      socket.on('error', (error) => {
        console.error('❌ [JOIN DEBUG] Join room error:', {
          error: error.message || error,
          code: error.code,
          debug: error.debug,
          roomCode: roomCode.trim().toUpperCase(),
          playerName: playerName.trim(),
          timestamp: new Date().toISOString()
        });
        
        // Provide user-friendly error messages
        let errorMessage = error.message;
        switch (error.code) {
          case 'ROOM_NOT_FOUND':
            errorMessage = 'Room not found. Please check the room code and try again.';
            console.error('🔍 [JOIN DEBUG] Room not found - may have been cleaned up');
            break;
          case 'ROOM_FULL':
            errorMessage = 'This room is full. Please try joining a different room.';
            break;
          case 'ROOM_NOT_ACCEPTING':
            errorMessage = 'This room is no longer accepting new players.';
            break;
          case 'DUPLICATE_PLAYER':
            errorMessage = 'A player with this name is already in the room. Please choose a different name.';
            break;
          default:
            errorMessage = errorMessage || 'Failed to join room. Please try again.';
        }
        
        setError(errorMessage);
        setIsJoining(false);
        socket.disconnect();
      });

      socket.on('connect_error', (error) => {
        console.error('❌ Connection error:', error);
        setError('Failed to connect to server. Please check your internet connection.');
        setIsJoining(false);
        socket.disconnect();
      });

      // Timeout fallback
      setTimeout(() => {
        if (isJoining) {
          setError('Join request timed out. Please try again.');
          setIsJoining(false);
          socket.disconnect();
        }
      }, 15000);

    } catch (error) {
      console.error('❌ Unexpected error:', error);
      setError('An unexpected error occurred. Please try again.');
      setIsJoining(false);
    }
  };

  // Auto-join when both roomCode and playerName are prefilled
  React.useEffect(() => {
    if (autoJoin && initialRoomCode && initialPlayerName && !isJoining) {
      // Small delay to allow modal mount
      const t = setTimeout(() => handleSubmit(), 200);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoJoin, initialRoomCode, initialPlayerName]);

  const handleRoomCodeChange = (e) => {
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (value.length <= 6) {
      setRoomCode(value);
    }
  };

  return (
    <div className="join-room-overlay">
      <div className="join-room-modal">
        <h2 className="join-room-title">Join Room</h2>
        
        <form onSubmit={handleSubmit} className="join-room-form">
          <div className="form-group">
            <label htmlFor="roomCode">ROOM CODE</label>
            <input
              type="text"
              id="roomCode"
              value={roomCode}
              onChange={handleRoomCodeChange}
              placeholder="4AJ5XQ"
              disabled={isJoining}
              maxLength={6}
              autoFocus
              className="room-code-input"
            />
            <small>Ask the room host for the 6-character room code</small>
          </div>

          <div className="form-group">
            <label htmlFor="playerName">YOUR NAME</label>
            <input
              type="text"
              id="playerName"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your name"
              disabled={isJoining}
              maxLength={20}
            />
            <small>This will be your display name in the room</small>
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <div className="form-actions">
            <button
              type="button"
              onClick={onCancel}
              className="cancel-button"
              disabled={isJoining}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="join-button"
              disabled={isJoining || !roomCode.trim() || !playerName.trim()}
            >
              {isJoining ? 'JOINING ROOM...' : 'JOIN ROOM'}
            </button>
          </div>
        </form>

        <div className="join-info">
          <h3>Joining a Room</h3>
          <ul>
            <li>Get the room code from your friend</li>
            <li>Enter your name (must be unique in the room)</li>
            <li>Wait for the host to select and start a game</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default JoinRoom; 
