import React, { useState } from 'react';
import { useSocket } from '../contexts/LazySocketContext';
import { useAuth } from '../contexts/AuthContext';
import './CreateRoom.css';

const CreateRoom = ({ onRoomCreated, onCancel }) => {
  const [displayName, setDisplayName] = useState('');
  const [streamerMode, setStreamerMode] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const { socket, isConnected, isConnecting, connectSocket } = useSocket();
  const { user, session } = useAuth();

  const isAuthenticated = !!session?.user;

  const handleSubmit = async (e) => {
    e.preventDefault();

    // For guests, display name is required
    // For authenticated users, display name is optional (falls back to username)
    if (!isAuthenticated && !displayName.trim()) {
      setError('Please enter your name');
      return;
    }

    if (displayName.trim() && displayName.trim().length < 2) {
      setError('Name must be at least 2 characters long');
      return;
    }

    if (displayName.trim() && displayName.trim().length > 20) {
      setError('Name must be less than 20 characters');
      return;
    }

    setIsCreating(true);
    setError('');

    try {
      // Determine playerName and customLobbyName based on auth status
      const playerName = isAuthenticated
        ? (user?.username || user?.display_name || 'User')
        : displayName.trim();
      const customLobbyName = isAuthenticated && displayName.trim()
        ? displayName.trim()
        : null;

      console.log('🏠 Creating room:', { playerName, customLobbyName, isAuthenticated });
      
      // Connect to socket lazily - only when creating room
      const activeSocket = socket || connectSocket();
      
      if (!activeSocket) {
        throw new Error('Failed to establish socket connection');
      }

      // Wait for connection if not already connected
      if (!isConnected) {
        console.log('⏳ Waiting for socket connection...');
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Connection timeout'));
          }, 10000);

          const onConnect = () => {
            clearTimeout(timeout);
            activeSocket.off('connect', onConnect);
            activeSocket.off('connect_error', onError);
            resolve();
          };

          const onError = (error) => {
            clearTimeout(timeout);
            activeSocket.off('connect', onConnect);
            activeSocket.off('connect_error', onError);
            reject(error);
          };

          if (activeSocket.connected) {
            clearTimeout(timeout);
            resolve();
          } else {
            activeSocket.on('connect', onConnect);
            activeSocket.on('connect_error', onError);
          }
        });
      }

      // Now we're connected, emit the createRoom event
      console.log('✅ [CLIENT] Connected to server, creating room...');
      console.log('🔍 [CLIENT DEBUG] Socket ID:', activeSocket.id);
      console.log('🔍 [CLIENT DEBUG] Player name:', playerName.trim());
      
      // Set up one-time event handlers for room creation
      const cleanup = () => {
        activeSocket.off('roomCreated', handleRoomCreated);
        activeSocket.off('error', handleError);
      };

      const handleRoomCreated = (data) => {
        console.log('✅ [CLIENT] Room created successfully:', data);
        cleanup();
        
        if (onRoomCreated) {
          onRoomCreated({
            roomCode: data.roomCode,
            playerName: playerName.trim(),
            isHost: true,
            room: data.room
          });
        }
        
        setIsCreating(false);
      };

      const handleError = (error) => {
        console.error('❌ [CLIENT] Room creation error:', error);
        cleanup();
        
        setError(error.message || 'Failed to create room. Please try again.');
        setIsCreating(false);
      };

      // Set up event handlers
      activeSocket.on('roomCreated', handleRoomCreated);
      activeSocket.on('error', handleError);

      // Emit room creation request
      activeSocket.emit('createRoom', {
        playerName,
        customLobbyName,
        streamerMode,
        isPublic,
        supabaseUserId: session?.user?.id || null // Send auth user ID if logged in
      });
      console.log('📤 [CLIENT] createRoom event sent', {
        playerName,
        customLobbyName,
        streamerMode,
        isPublic,
        isAuthenticated,
        supabaseUserId: session?.user?.id
      });

      // Timeout fallback
      setTimeout(() => {
        if (isCreating) {
          cleanup();
          setError('Room creation timed out. Please try again.');
          setIsCreating(false);
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
            <label htmlFor="displayName">
              {isAuthenticated ? 'Display Name (Optional)' : 'Your Name'}
            </label>
            <input
              type="text"
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={
                isAuthenticated
                  ? `Leave blank to use ${user?.username || 'your account name'}`
                  : 'Enter your name'
              }
              maxLength={20}
              disabled={isCreating}
              autoFocus
            />
            {isAuthenticated && (
              <small>Customize how your name appears in this lobby</small>
            )}
          </div>

          <div className="form-group checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                disabled={isCreating}
              />
              <span className="checkbox-text">
                🌍 Public Room
                <small>Let other players discover and join your room</small>
              </span>
            </label>
          </div>

          <div className="form-group checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={streamerMode}
                onChange={(e) => setStreamerMode(e.target.checked)}
                disabled={isCreating}
              />
              <span className="checkbox-text">
                🎥 Streamer Mode
                <small>Hide room code from other players</small>
              </span>
            </label>
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