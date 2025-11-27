import React, { useState, useRef, useEffect, useMemo, FormEvent, ChangeEvent } from 'react';
import { useSocket } from '../contexts/LazySocketContext';
import { useAuth } from '../contexts/AuthContext';
import { SOCKET_EVENTS, SERVER_EVENTS } from '@shared/constants';
import LoadingSpinner from './LoadingSpinner';
import useFocusTrap from '../hooks/useFocusTrap';
import './JoinRoom.css';

const DEBOUNCE_MS = 1000;

interface Player {
  id: string;
  name: string;
  isHost: boolean;
}

interface RoomJoinedData {
  roomCode: string;
  playerName: string;
  isHost: boolean;
  players: Player[];
  room: unknown;
}

interface JoinRoomProps {
  initialRoomCode?: string;
  initialPlayerName?: string;
  autoJoin?: boolean;
  onRoomJoined?: (data: RoomJoinedData) => void;
  onCancel?: () => void;
}

const JoinRoom: React.FC<JoinRoomProps> = ({
  initialRoomCode = '',
  initialPlayerName = '',
  autoJoin = false,
  onRoomJoined,
  onCancel,
}) => {
  const [roomCode, setRoomCode] = useState<string>(initialRoomCode);
  const [displayName, setDisplayName] = useState<string>(initialPlayerName || '');
  const [isJoining, setIsJoining] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const isInviteLink = !!initialRoomCode;
  const { user, session } = useAuth();
  const { socket, connectSocket, isConnected } = useSocket();
  const lastSubmitRef = useRef<number>(0);
  const joinListenersSetRef = useRef<boolean>(false);

  // Focus trap for modal accessibility
  const { containerRef } = useFocusTrap<HTMLDivElement>({
    isActive: true,
    onEscape: onCancel,
    closeOnEscape: !isJoining,
  });

  const isAuthenticated = !!session?.user;

  // Real-time validation for room code
  const roomCodeValidation = useMemo(() => {
    if (roomCode.length === 0) {
      return { status: 'empty' as const, message: '' };
    }
    if (roomCode.length < 6) {
      return { status: 'incomplete' as const, message: `${6 - roomCode.length} more characters needed` };
    }
    return { status: 'valid' as const, message: '' };
  }, [roomCode]);

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

  const handleSubmit = async (e?: FormEvent<HTMLFormElement>): Promise<void> => {
    if (e && e.preventDefault) e.preventDefault();

    const now = Date.now();
    if (now - lastSubmitRef.current < DEBOUNCE_MS) {
      return;
    }
    lastSubmitRef.current = now;

    if (!roomCode.trim()) {
      setError('Please enter a room code');
      return;
    }

    if (roomCode.trim().length !== 6) {
      setError('Room code must be 6 characters long');
      return;
    }

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

    setIsJoining(true);
    setError('');

    const playerName = isAuthenticated ? user?.display_name || 'Player' : displayName.trim();
    const customLobbyName = isAuthenticated && displayName.trim() ? displayName.trim() : null;

    console.log('🚪 [JOIN DEBUG] Starting room join process:', {
      roomCode: roomCode.trim().toUpperCase(),
      playerName,
      customLobbyName,
      isAuthenticated,
      timestamp: new Date().toISOString(),
      isInitialRoomCode: !!initialRoomCode,
      currentURL: window.location.href,
    });

    try {
      console.log('🚪 [JOIN DEBUG] Joining room:', roomCode.trim().toUpperCase());

      let activeSocket = socket;
      if (!socket || !isConnected) {
        console.log('🚪 [JOIN DEBUG] Socket not connected, connecting...');
        activeSocket = connectSocket();
      }

      const emitJoinRoom = (): void => {
        console.log('✅ [CLIENT] Connected to server, joining room...');
        console.log('🔍 [CLIENT DEBUG] Socket ID:', activeSocket?.id);
        console.log('🔍 [CLIENT DEBUG] Room code:', roomCode.trim().toUpperCase());
        console.log('🔍 [CLIENT DEBUG] Player name:', playerName);
        console.log('🚪 [JOIN DEBUG] Connected, sending joinRoom event');

        const urlParams = new URLSearchParams(window.location.search);
        const isHostHint = urlParams.get('ishost') === 'true' || urlParams.get('role') === 'gm';
        activeSocket?.emit(SOCKET_EVENTS.ROOM.JOIN, {
          roomCode: roomCode.trim().toUpperCase(),
          playerName,
          customLobbyName,
          supabaseUserId: session?.user?.id || null,
          isHostHint,
        });
        console.log('📤 [CLIENT] joinRoom event sent', {
          playerName,
          customLobbyName,
          isAuthenticated,
          supabaseUserId: session?.user?.id,
        });
      };

      if (!joinListenersSetRef.current && activeSocket) {
        joinListenersSetRef.current = true;

        const handleRoomJoined = (data: {
          roomCode: string;
          isHost: boolean;
          players: Player[];
          room: unknown;
        }): void => {
          console.log('✅ [CLIENT] Room joined successfully:', data);
          console.log('🔍 [CLIENT DEBUG] Join data:', {
            roomCode: data.roomCode,
            isHost: data.isHost,
            playerCount: data.players?.length || 0,
          });
          console.log('🚪 [JOIN DEBUG] Join successful, transitioning to lobby');

          activeSocket?.off(SERVER_EVENTS.ROOM.JOINED, handleRoomJoined);
          activeSocket?.off(SERVER_EVENTS.ERROR, handleError);
          joinListenersSetRef.current = false;

          if (onRoomJoined) {
            onRoomJoined({
              roomCode: data.roomCode,
              playerName,
              isHost: !!data.isHost,
              players: data.players,
              room: data.room,
            });
          }
        };

        const handleError = (error: { message?: string; code?: string; debug?: unknown }): void => {
          console.error('❌ [JOIN DEBUG] Join room error:', {
            error: error.message || error,
            code: error.code,
            debug: error.debug,
            roomCode: roomCode.trim().toUpperCase(),
            playerName: playerName,
            timestamp: new Date().toISOString(),
          });

          activeSocket?.off(SERVER_EVENTS.ROOM.JOINED, handleRoomJoined);
          activeSocket?.off(SERVER_EVENTS.ERROR, handleError);
          joinListenersSetRef.current = false;

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
              errorMessage =
                'A player with this name is already in the room. Please choose a different name.';
              break;
            default:
              errorMessage = errorMessage || 'Failed to join room. Please try again.';
          }

          setError(errorMessage);
          setIsJoining(false);
        };

        activeSocket.on(SERVER_EVENTS.ROOM.JOINED, handleRoomJoined);
        activeSocket.on(SERVER_EVENTS.ERROR, handleError);
      }

      if (activeSocket?.connected) {
        emitJoinRoom();
      } else {
        activeSocket?.once('connect', emitJoinRoom);
      }

      setTimeout(() => {
        if (isJoining) {
          setError('Join request timed out. Please try again.');
          setIsJoining(false);
          joinListenersSetRef.current = false;
        }
      }, 15000);
    } catch (error) {
      console.error('❌ Unexpected error:', error);
      setError('An unexpected error occurred. Please try again.');
      setIsJoining(false);
      joinListenersSetRef.current = false;
    }
  };

  useEffect(() => {
    if (autoJoin && initialRoomCode && initialPlayerName && !isJoining) {
      const t = setTimeout(() => handleSubmit(), 200);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoJoin, initialRoomCode, initialPlayerName]);

  const handleRoomCodeChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (value.length <= 6) {
      setRoomCode(value);
    }
  };

  return (
    <div className="join-room-overlay">
      <div
        ref={containerRef}
        className="join-room-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="join-room-title"
      >
        <h2 id="join-room-title" className="join-room-title">Join Room</h2>

        <form onSubmit={handleSubmit} className="join-room-form">
          {isInviteLink ? (
            <div className="form-group">
              <label htmlFor="roomCode">ROOM CODE</label>
              <div className="invite-link-indicator">🔗 Joining via invite link</div>
              <small>Room code hidden for privacy</small>
            </div>
          ) : (
            <div className={`form-group ${roomCode.length > 0 ? 'has-value' : ''}`}>
              <label htmlFor="roomCode">ROOM CODE</label>
              <div className="input-wrapper">
                <input
                  type="text"
                  id="roomCode"
                  value={roomCode}
                  onChange={handleRoomCodeChange}
                  placeholder="4AJ5XQ"
                  disabled={isJoining}
                  maxLength={6}
                  autoFocus
                  className={`room-code-input ${roomCodeValidation.status === 'valid' ? 'input-valid' : ''}`}
                  aria-describedby="room-code-hint"
                />
                {roomCode.length > 0 && (
                  <span
                    className={`validation-icon ${roomCodeValidation.status === 'valid' ? 'valid' : ''}`}
                    aria-hidden="true"
                  >
                    {roomCodeValidation.status === 'valid' ? '✓' : ''}
                  </span>
                )}
              </div>
              {/* Visual progress indicator for room code */}
              <div className="room-code-progress" aria-hidden="true">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className={`char-slot ${i < roomCode.length ? (roomCode.length === 6 ? 'complete' : 'filled') : ''}`}
                  />
                ))}
              </div>
              <small id="room-code-hint">
                {roomCodeValidation.status === 'incomplete'
                  ? roomCodeValidation.message
                  : 'Ask the room host for the 6-character room code'}
              </small>
            </div>
          )}

          <div className={`form-group ${displayName.length > 0 ? 'has-value' : ''}`}>
            <label htmlFor="displayName">
              {isAuthenticated ? 'DISPLAY NAME (Optional)' : 'YOUR NAME'}
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
                disabled={isJoining}
                maxLength={20}
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
                {isAuthenticated ? 'Customize how your name appears in this lobby' : 'This will be your display name in the room'}
              </small>
              <span className={`count ${charCountClass}`}>{displayName.length}/20</span>
            </div>
            {nameValidation.message && (
              <div id="name-validation-hint" className="validation-hint error">
                {nameValidation.message}
              </div>
            )}
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="form-actions">
            <button type="button" onClick={onCancel} className="cancel-button" disabled={isJoining}>
              Cancel
            </button>
            <button
              type="submit"
              className="join-button"
              disabled={isJoining || !roomCode.trim() || (!isAuthenticated && !displayName.trim())}
            >
              {isJoining ? (
                <>
                  <LoadingSpinner size="sm" color="white" inline />
                  Joining...
                </>
              ) : (
                'JOIN ROOM'
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
