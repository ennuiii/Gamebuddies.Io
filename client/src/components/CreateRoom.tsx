import React, { useState, useRef, useMemo, FormEvent, ChangeEvent } from 'react';
import { useSocket } from '../contexts/LazySocketContext';
import { useAuth } from '../contexts/AuthContext';
import { SOCKET_EVENTS, SERVER_EVENTS } from '@shared/constants';
import LoadingSpinner from './LoadingSpinner';
import useFocusTrap from '../hooks/useFocusTrap';
import './CreateRoom.css';

const DEBOUNCE_MS = 1000;

interface RoomCreatedData {
  roomCode: string;
  playerName: string;
  isHost: boolean;
  room: unknown;
}

interface CreateRoomProps {
  onRoomCreated?: (data: RoomCreatedData) => void;
  onCancel?: () => void;
}

const CreateRoom: React.FC<CreateRoomProps> = ({ onRoomCreated, onCancel }) => {
  const [displayName, setDisplayName] = useState<string>('');
  const [streamerMode, setStreamerMode] = useState<boolean>(false);
  const [isPublic, setIsPublic] = useState<boolean>(true);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const { socket, isConnected, connectSocket } = useSocket();
  const { user, session } = useAuth();
  const lastSubmitRef = useRef<number>(0);

  // Focus trap for modal accessibility
  const { containerRef } = useFocusTrap<HTMLDivElement>({
    isActive: true,
    onEscape: onCancel,
    closeOnEscape: !isCreating,
  });

  const isAuthenticated = !!session?.user;

  // Real-time validation for display name
  const nameValidation = useMemo(() => {
    const name = displayName.trim();
    if (name.length === 0) {
      return { status: 'empty' as const, message: '' };
    }
    if (name.length < 2) {
      return { status: 'invalid' as const, message: 'Name must be at least 2 characters' };
    }
    if (name.length > 20) {
      return { status: 'invalid' as const, message: 'Name must be less than 20 characters' };
    }
    return { status: 'valid' as const, message: '' };
  }, [displayName]);

  // Character count styling
  const charCountClass = useMemo(() => {
    const len = displayName.length;
    if (len >= 20) return 'danger';
    if (len >= 15) return 'warning';
    if (len >= 2) return 'valid';
    return '';
  }, [displayName]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();

    const now = Date.now();
    if (now - lastSubmitRef.current < DEBOUNCE_MS) {
      return;
    }
    lastSubmitRef.current = now;

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
      const serverPlayerName = isAuthenticated
        ? displayName.trim() || user?.display_name || user?.username || 'User'
        : displayName.trim();
      const serverCustomLobbyName = isAuthenticated && displayName.trim() ? displayName.trim() : null;

      console.log('🏠 Creating room:', {
        playerName: serverPlayerName,
        customLobbyName: serverCustomLobbyName,
        isAuthenticated,
      });

      const activeSocket = socket || connectSocket();

      if (!activeSocket) {
        throw new Error('Failed to establish socket connection');
      }

      if (!isConnected) {
        console.log('⏳ Waiting for socket connection...');
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Connection timeout'));
          }, 10000);

          const onConnect = (): void => {
            clearTimeout(timeout);
            activeSocket.off('connect', onConnect);
            activeSocket.off('connect_error', onError);
            resolve();
          };

          const onError = (error: Error): void => {
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

      console.log('✅ [CLIENT] Connected to server, creating room...');
      console.log('🔍 [CLIENT DEBUG] Socket ID:', activeSocket.id);
      console.log('🔍 [CLIENT DEBUG] Player name:', serverPlayerName.trim());

      const cleanup = (): void => {
        activeSocket.off(SERVER_EVENTS.ROOM.CREATED, handleRoomCreated);
        activeSocket.off(SERVER_EVENTS.ERROR, handleError);
      };

      const handleRoomCreated = (data: { roomCode: string; room: unknown }): void => {
        console.log('✅ [CLIENT] Room created successfully:', data);
        cleanup();

        if (onRoomCreated) {
          onRoomCreated({
            roomCode: data.roomCode,
            playerName: serverPlayerName.trim(),
            isHost: true,
            room: data.room,
          });
        }

        setIsCreating(false);
      };

      const handleError = (error: { message?: string }): void => {
        console.error('❌ [CLIENT] Room creation error:', error);
        cleanup();

        setError(error.message || 'Failed to create room. Please try again.');
        setIsCreating(false);
      };

      activeSocket.on(SERVER_EVENTS.ROOM.CREATED, handleRoomCreated);
      activeSocket.on(SERVER_EVENTS.ERROR, handleError);

      activeSocket.emit(SOCKET_EVENTS.ROOM.CREATE, {
        playerName: serverPlayerName,
        customLobbyName: serverCustomLobbyName,
        streamerMode,
        isPublic,
        supabaseUserId: session?.user?.id || null,
      });
      console.log('📤 [CLIENT] createRoom event sent', {
        playerName: serverPlayerName,
        customLobbyName: serverCustomLobbyName,
        streamerMode,
        isPublic,
        isAuthenticated,
        supabaseUserId: session?.user?.id,
      });

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
      <div
        ref={containerRef}
        className="create-room-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-room-title"
      >
        <h2 id="create-room-title" className="create-room-title">Create Game Room</h2>

        <form onSubmit={handleSubmit} className="create-room-form">
          <div className={`form-group ${displayName.length > 0 ? 'has-value' : ''}`}>
            <label htmlFor="displayName">
              {isAuthenticated ? 'Display Name (Optional)' : 'Your Name'}
            </label>
            <div className="input-wrapper">
              <input
                type="text"
                id="displayName"
                value={displayName}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setDisplayName(e.target.value)}
                placeholder={
                  isAuthenticated
                    ? `Leave blank to use ${user?.username || 'your account name'}`
                    : 'Enter your name'
                }
                maxLength={20}
                disabled={isCreating}
                autoFocus
                className={
                  nameValidation.status === 'valid' ? 'input-valid' :
                  nameValidation.status === 'invalid' ? 'input-invalid' : ''
                }
                aria-invalid={nameValidation.status === 'invalid'}
                aria-describedby={nameValidation.message ? 'name-validation-hint' : undefined}
              />
              {displayName.length > 0 && (
                <span
                  className={`validation-icon ${nameValidation.status === 'valid' ? 'valid' : nameValidation.status === 'invalid' ? 'invalid' : ''}`}
                  aria-hidden="true"
                >
                  {nameValidation.status === 'valid' ? '✓' : nameValidation.status === 'invalid' ? '✕' : ''}
                </span>
              )}
            </div>
            <div className="char-counter">
              <small>
                {isAuthenticated ? 'Customize how your name appears in this lobby' : 'This will be your display name'}
              </small>
              <span className={`count ${charCountClass}`}>{displayName.length}/20</span>
            </div>
            {nameValidation.message && (
              <div id="name-validation-hint" className="validation-hint error">
                {nameValidation.message}
              </div>
            )}
          </div>

          <div className="form-group checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setIsPublic(e.target.checked)}
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
                onChange={(e: ChangeEvent<HTMLInputElement>) => setStreamerMode(e.target.checked)}
                disabled={isCreating}
              />
              <span className="checkbox-text">
                🎥 Streamer Mode
                <small>Hide room code from other players</small>
              </span>
            </label>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="form-actions">
            <button
              type="button"
              onClick={onCancel}
              className="btn btn-ghost cancel-button"
              disabled={isCreating}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary create-button" disabled={isCreating}>
              {isCreating ? (
                <>
                  <LoadingSpinner size="sm" color="white" inline />
                  Creating...
                </>
              ) : (
                'Create Room'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateRoom;
