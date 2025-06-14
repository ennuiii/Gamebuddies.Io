import React, { useState } from 'react';
import io from 'socket.io-client';
import './CreateRoom.css';

const CreateRoom = ({ onRoomCreated, onCancel }) => {
  const [playerName, setPlayerName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!playerName.trim()) {
      setError('Please enter your name');
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

    setIsCreating(true);
    setError('');

    try {
      console.log('🏠 Creating room for:', playerName.trim());
      
      // Determine server URL based on environment
      const getServerUrl = () => {
        console.log('🔍 [DEBUG] Determining server URL...');
        console.log('🔍 [DEBUG] window.location.hostname:', window.location.hostname);
        console.log('🔍 [DEBUG] window.location.origin:', window.location.origin);
        console.log('🔍 [DEBUG] REACT_APP_SERVER_URL:', process.env.REACT_APP_SERVER_URL);
        
        if (process.env.REACT_APP_SERVER_URL) {
          console.log('🔍 [DEBUG] Using REACT_APP_SERVER_URL:', process.env.REACT_APP_SERVER_URL);
          return process.env.REACT_APP_SERVER_URL;
        }
        
        // If running on Render.com (check for .onrender.com domain)
        if (window.location.hostname.includes('onrender.com')) {
          console.log('🔍 [DEBUG] Detected Render.com, using origin:', window.location.origin);
          return window.location.origin;
        }
        
        // If running on any production domain (not localhost)
        if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
          console.log('🔍 [DEBUG] Detected production domain, using origin:', window.location.origin);
          return window.location.origin;
        }
        
        // For local development, connect to Render.com server
        console.log('🔍 [DEBUG] Local development, using Render.com server');
        return 'https://gamebuddies-io.onrender.com';
      };

      const socket = io(getServerUrl(), {
        transports: ['websocket', 'polling'],
        timeout: 10000
      });

      // Set up event handlers
      socket.on('connect', () => {
        console.log('✅ [CLIENT] Connected to server, creating room...');
        console.log('🔍 [CLIENT DEBUG] Socket ID:', socket.id);
        console.log('🔍 [CLIENT DEBUG] Player name:', playerName.trim());
        console.log('🔍 [CLIENT DEBUG] Server URL:', getServerUrl());
        
        socket.emit('createRoom', { 
          playerName: playerName.trim()
        });
        console.log('📤 [CLIENT] createRoom event sent');
      });

      socket.on('roomCreated', (data) => {
        console.log('✅ [CLIENT] Room created successfully:', data);
        console.log('🔍 [CLIENT DEBUG] Room data:', {
          roomCode: data.roomCode,
          isHost: data.isHost,
          room_id: data.room?.id
        });
        
        socket.disconnect();
        
        if (onRoomCreated) {
          onRoomCreated({
            roomCode: data.roomCode,
            playerName: playerName.trim(),
            isHost: true,
            room: data.room
          });
        }
      });

      socket.on('error', (error) => {
        console.error('❌ [CLIENT] Room creation error:', error);
        console.error('🔍 [CLIENT DEBUG] Error details:', {
          message: error.message,
          code: error.code,
          debug: error.debug
        });
        
        setError(error.message || 'Failed to create room. Please try again.');
        setIsCreating(false);
        socket.disconnect();
      });

      socket.on('connect_error', (error) => {
        console.error('❌ Connection error:', error);
        setError('Failed to connect to server. Please check your internet connection.');
        setIsCreating(false);
        socket.disconnect();
      });

      // Timeout fallback
      setTimeout(() => {
        if (isCreating) {
          setError('Room creation timed out. Please try again.');
          setIsCreating(false);
          socket.disconnect();
        }
      }, 15000);

    } catch (error) {
      console.error('❌ Unexpected error:', error);
      setError('An unexpected error occurred. Please try again later.');
      setIsCreating(false);
    }
  };

  return (
    <div className="create-room-overlay">
      <div className="create-room-modal">
        <h2 className="create-room-title">Create Game Room</h2>
        
        <form onSubmit={handleSubmit} className="create-room-form">
          <div className="form-group">
            <label htmlFor="name">Your Name</label>
            <input
              type="text"
              id="name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your name"
              maxLength={20}
              disabled={isCreating}
              autoFocus
            />
          </div>

          {error && (
            <div className="error-message">{error}</div>
          )}

          <div className="form-actions">
            <button
              type="button"
              onClick={onCancel}
              className="cancel-button"
              disabled={isCreating}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="create-button"
              disabled={isCreating}
            >
              {isCreating ? 'Creating...' : 'Create Room'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateRoom; 