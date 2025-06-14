import React, { useState } from 'react';
import io from 'socket.io-client';
import './JoinRoom.css';

const JoinRoom = ({ onRoomJoined, onCancel }) => {
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    
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

    try {
      console.log('🚪 Joining room:', roomCode.trim().toUpperCase());
      
      const socket = io(process.env.REACT_APP_SERVER_URL || 'http://localhost:3033', {
        transports: ['websocket', 'polling'],
        timeout: 10000
      });

      // Set up event handlers
      socket.on('connect', () => {
        console.log('✅ [CLIENT] Connected to server, joining room...');
        console.log('🔍 [CLIENT DEBUG] Socket ID:', socket.id);
        console.log('🔍 [CLIENT DEBUG] Room code:', roomCode.trim().toUpperCase());
        console.log('🔍 [CLIENT DEBUG] Player name:', playerName.trim());
        console.log('🔍 [CLIENT DEBUG] Server URL:', process.env.REACT_APP_SERVER_URL || 'http://localhost:3033');
        
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
        
        socket.disconnect();
        
        if (onRoomJoined) {
          onRoomJoined({
            roomCode: data.roomCode,
            playerName: playerName.trim(),
            isHost: false,
            players: data.players,
            room: data.room
          });
        }
      });

      socket.on('error', (error) => {
        console.error('❌ Join room error:', error);
        
        // Provide user-friendly error messages
        let errorMessage = error.message;
        switch (error.code) {
          case 'ROOM_NOT_FOUND':
            errorMessage = 'Room not found. Please check the room code and try again.';
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

  const handleRoomCodeChange = (e) => {
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (value.length <= 6) {
      setRoomCode(value);
    }
  };

  return (
    <div className="join-room-overlay">
      <div className="join-room-modal">
        <div className="modal-header">
          <h2>Join Room</h2>
          <button 
            className="close-button" 
            onClick={onCancel}
            disabled={isJoining}
          >
            ×
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="join-room-form">
          <div className="form-group">
            <label htmlFor="roomCode">Room Code</label>
            <input
              type="text"
              id="roomCode"
              value={roomCode}
              onChange={handleRoomCodeChange}
              placeholder="Enter 6-character room code"
              disabled={isJoining}
              maxLength={6}
              autoFocus
              className="room-code-input"
            />
            <small className="form-hint">
              Ask the room host for the 6-character room code
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="playerName">Your Name</label>
            <input
              type="text"
              id="playerName"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your name"
              disabled={isJoining}
              maxLength={20}
            />
            <small className="form-hint">
              This will be your display name in the room
            </small>
          </div>

          {error && (
            <div className="error-message">
              <span className="error-icon">⚠️</span>
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
              {isJoining ? (
                <>
                  <span className="loading-spinner small"></span>
                  Joining Room...
                </>
              ) : (
                'Join Room'
              )}
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