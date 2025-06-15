import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import GamePicker from './GamePicker';
import './RoomLobby.css';

// Track active connection to prevent duplicates in StrictMode
let activeConnection = null;

const RoomLobby = ({ roomCode, playerName, isHost, onLeave }) => {
  const [socket, setSocket] = useState(null);
  const [players, setPlayers] = useState([]);
  const [selectedGame, setSelectedGame] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [roomData, setRoomData] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [currentIsHost, setCurrentIsHost] = useState(isHost); // State for re-rendering
  const [roomStatus, setRoomStatus] = useState('waiting_for_players');
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  
  // Use refs for values that shouldn't trigger re-renders
  const roomCodeRef = useRef(roomCode);
  const playerNameRef = useRef(playerName);

  useEffect(() => {
    // Prevent duplicate connections in development StrictMode
    if (activeConnection) {
      console.log('⚠️ Preventing duplicate connection');
      return;
    }

    console.log('🔌 Connecting to server...');
    setConnectionStatus('connecting');
    
    // Determine server URL based on environment
    const getServerUrl = () => {
      if (process.env.REACT_APP_SERVER_URL) {
        return process.env.REACT_APP_SERVER_URL;
      }
      
      // If running on Render.com (check for .onrender.com domain)
      if (window.location.hostname.includes('onrender.com')) {
        return window.location.origin;
      }
      
      // If running on any production domain (not localhost)
      if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        return window.location.origin;
      }
      
      // For local development, connect to Render.com server
      return 'https://gamebuddies-io.onrender.com';
    };
    
    const newSocket = io(getServerUrl(), {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: true
    });

    activeConnection = newSocket;

    // Named event handlers for proper cleanup
    const handleConnect = () => {
      console.log('✅ [CLIENT] Connected to server in lobby');
      console.log('🔍 [CLIENT DEBUG] Socket ID:', newSocket.id);
      console.log('🔍 [CLIENT DEBUG] Room code:', roomCodeRef.current);
      console.log('🔍 [CLIENT DEBUG] Player name:', playerNameRef.current);
      console.log('🔍 [CLIENT DEBUG] Is host:', currentIsHost);
      console.log('🔍 [LOBBY DEBUG] Connection details:', {
        socketId: newSocket.id,
        roomCode: roomCodeRef.current,
        playerName: playerNameRef.current,
        isHost: currentIsHost,
        connectionStatus: 'connected',
        timestamp: new Date().toISOString()
      });
      
      setConnectionStatus('connected');
      setSocket(newSocket);
      
      // Join the room
      console.log('📤 [LOBBY DEBUG] Sending joinRoom event...');
      newSocket.emit('joinRoom', {
        roomCode: roomCodeRef.current,
        playerName: playerNameRef.current
      });
      console.log('📤 [CLIENT] joinRoom event sent from lobby');
    };

    const handleDisconnect = () => {
      console.log('❌ [LOBBY DEBUG] Disconnected from server:', {
        roomCode: roomCodeRef.current,
        playerName: playerNameRef.current,
        timestamp: new Date().toISOString()
      });
      setConnectionStatus('disconnected');
      setError('Connection lost. Please refresh the page.');
    };

    const handleConnectError = (error) => {
      console.error('❌ [LOBBY DEBUG] Connection error:', {
        error: error.message,
        roomCode: roomCodeRef.current,
        playerName: playerNameRef.current,
        timestamp: new Date().toISOString()
      });
      setConnectionStatus('error');
      setError('Failed to connect to server. Please try again.');
      setIsLoading(false);
    };

    const handleRoomJoined = (data) => {
      console.log('✅ [CLIENT] Successfully joined room in lobby:', data);
      console.log('🔍 [CLIENT DEBUG] Lobby join data:', {
        roomCode: data.roomCode,
        playerCount: data.players?.length || 0,
        room_id: data.room?.id,
        game_type: data.room?.game_type
      });
      console.log('🔍 [LOBBY DEBUG] Room joined details:', {
        roomCode: data.roomCode,
        isHost: data.isHost,
        playerCount: data.players?.length || 0,
        roomId: data.room?.id,
        gameType: data.room?.game_type,
        roomStatus: data.room?.status,
        participants: data.players?.map(p => ({
          id: p.id,
          name: p.name,
          isHost: p.isHost
        })) || [],
        timestamp: new Date().toISOString()
      });
      
      setPlayers(data.players || []);
      setRoomData(data.room);
      setRoomStatus(data.room?.status || 'waiting_for_players');
      setSelectedGame(data.room?.game_type !== 'lobby' ? data.room.game_type : null);
      
      // Update host status based on server response
      const currentUser = data.players?.find(p => p.name === playerNameRef.current);
      if (currentUser) {
        console.log(`🔍 [CLIENT DEBUG] Initial host status: ${playerNameRef.current} is host: ${currentUser.isHost}`);
        console.log(`🔍 [LOBBY DEBUG] Host status update:`, {
          playerName: playerNameRef.current,
          wasHost: currentIsHost,
          nowHost: currentUser.isHost,
          changed: currentIsHost !== currentUser.isHost
        });
        setCurrentIsHost(currentUser.isHost);
      }
      
      setIsLoading(false);
      setError(null);
    };

    const handlePlayerJoined = (data) => {
      console.log('👋 Player joined:', data.player.name);
      setPlayers(data.players || []);
      setRoomData(data.room);
      
      // Ensure host status is maintained when players join
      const currentUser = data.players?.find(p => p.name === playerNameRef.current);
      if (currentUser && currentUser.isHost !== currentIsHost) {
        console.log(`🔍 [CLIENT DEBUG] Host status sync: ${playerNameRef.current} is host: ${currentUser.isHost}`);
        setCurrentIsHost(currentUser.isHost);
      }
    };

    const handlePlayerLeft = (data) => {
      console.log('👋 Player left');
      setPlayers(data.players || []);
    };

    const handlePlayerDisconnected = (data) => {
      console.log('🔌 Player disconnected:', data.playerId);
      setPlayers(prev => prev.map(player => 
        player.id === data.playerId 
          ? { ...player, connected: false }
          : player
      ));
    };

    const handleGameSelected = (data) => {
      console.log('🎮 Game selected:', data.gameType);
      setSelectedGame(data.gameType);
    };

    const handleGameStarted = (data) => {
      console.log('🚀 [LOBBY DEBUG] Game starting event received:', {
        gameUrl: data.gameUrl,
        gameType: data.gameType,
        isHost: data.isHost,
        roomCode: data.roomCode,
        timestamp: new Date().toISOString()
      });
      
      // Store GameBuddies integration data
      console.log('💾 [LOBBY DEBUG] Setting up GameBuddies session storage...');
      
      const sessionData = {
        roomCode: roomCodeRef.current,
        playerName: playerNameRef.current,
        isHost: data.isHost.toString(),
        gameType: data.gameType,
        returnUrl: window.location.origin
      };
      
      console.log('💾 [LOBBY DEBUG] Session data to store:', sessionData);
      
      sessionStorage.setItem('gamebuddies_roomCode', sessionData.roomCode);
      sessionStorage.setItem('gamebuddies_playerName', sessionData.playerName);
      sessionStorage.setItem('gamebuddies_isHost', sessionData.isHost);
      sessionStorage.setItem('gamebuddies_gameType', sessionData.gameType);
      sessionStorage.setItem('gamebuddies_returnUrl', sessionData.returnUrl);
      
      // Verify session storage was set correctly
      const verification = {
        roomCode: sessionStorage.getItem('gamebuddies_roomCode'),
        playerName: sessionStorage.getItem('gamebuddies_playerName'),
        isHost: sessionStorage.getItem('gamebuddies_isHost'),
        gameType: sessionStorage.getItem('gamebuddies_gameType'),
        returnUrl: sessionStorage.getItem('gamebuddies_returnUrl')
      };
      
      console.log('🔍 [LOBBY DEBUG] Session storage verification:', verification);
      
      const allSet = Object.values(verification).every(value => value !== null);
      console.log('✅ [LOBBY DEBUG] All session data set correctly:', allSet);
      
      if (!allSet) {
        console.error('❌ [LOBBY DEBUG] Some session data failed to set!');
      }
      
      console.log('🎮 [LOBBY DEBUG] Redirecting to game:', data.gameUrl);
      
      // Redirect to game
      window.location.href = data.gameUrl;
    };

    const handleError = (error) => {
      console.error('❌ [LOBBY DEBUG] Socket error received:', {
        error: error.message || error,
        code: error.code,
        debug: error.debug,
        roomCode: roomCodeRef.current,
        playerName: playerNameRef.current,
        timestamp: new Date().toISOString(),
        connectionStatus,
        isLoading,
        currentError: error
      });
      
      // Enhanced error handling based on error code
      let userFriendlyMessage = error.message || 'An error occurred';
      let shouldRedirect = false; // Flag for critical errors that require leaving
      
      switch (error.code) {
        case 'ROOM_NOT_FOUND':
          userFriendlyMessage = 'Room not found. It may have expired or been cleaned up.';
          shouldRedirect = true; // Critical error - room doesn't exist
          console.error('🔍 [LOBBY DEBUG] Room not found details:', {
            roomCode: roomCodeRef.current,
            searchedFor: error.debug?.room_code,
            timestamp: error.debug?.search_timestamp
          });
          break;
        case 'ROOM_FULL':
          userFriendlyMessage = 'Room is full. Cannot rejoin at this time.';
          shouldRedirect = true; // Critical error - can't join
          break;
        case 'ROOM_NOT_ACCEPTING':
          userFriendlyMessage = `Room is ${error.debug?.room_status || 'not accepting players'}.`;
          // Don't redirect - show popup and let user stay in lobby
          console.error('🔍 [LOBBY DEBUG] Room not accepting details:', {
            roomStatus: error.debug?.room_status,
            isOriginalCreator: error.debug?.is_original_creator
          });
          break;
        case 'DUPLICATE_PLAYER':
          userFriendlyMessage = 'Player name already in use. Try a different name.';
          shouldRedirect = true; // Critical error - name conflict
          break;
        case 'JOIN_FAILED':
          userFriendlyMessage = 'Failed to join room. Please try refreshing the page.';
          // Don't redirect - let user try actions in lobby
          break;
        case 'KICK_FAILED':
          userFriendlyMessage = error.message || 'Failed to kick player. You may not have permission.';
          // Don't redirect - just show error popup
          break;
        case 'NOT_HOST':
          userFriendlyMessage = 'Only the host can perform this action.';
          // Don't redirect - just show error popup
          break;
        default:
          console.error('🔍 [LOBBY DEBUG] Unknown error code:', error.code);
          // For unknown errors, show popup but don't redirect
      }
      
      // For critical errors, use the error state that redirects
      if (shouldRedirect) {
        setError(userFriendlyMessage);
        setIsLoading(false);
      } else {
        // For non-critical errors, show popup and stay in lobby
        alert(`⚠️ ${userFriendlyMessage}`);
        
        // If we were loading, stop the loading state
        if (isLoading) {
          setIsLoading(false);
        }
      }
    };

    const handleHostTransferred = (data) => {
      console.log('👑 Host transferred:', data);
      
      // Update players list with new host status
      setPlayers(data.players || []);
      
      // Update local host status - check if current user is the new host
      const currentUser = data.players?.find(p => p.name === playerNameRef.current);
      if (currentUser) {
        const newHostStatus = currentUser.isHost;
        console.log(`🔍 [CLIENT DEBUG] Host status update: ${playerNameRef.current} is now host: ${newHostStatus}`);
        setCurrentIsHost(newHostStatus);
      }
      
      // Show notification
      const reason = data.reason === 'original_host_left' ? 'left the room' : 
                    data.reason === 'original_host_disconnected' ? 'disconnected' : 'transferred host';
      
      // You could add a toast notification here
      console.log(`👑 ${data.newHostName} is now the host (previous host ${reason})`);
    };

    const handleRoomStatusChanged = (data) => {
      console.log('🔄 Room status changed:', data);
      
      // Update room status
      setRoomStatus(data.newStatus);
      setRoomData(data.room);
      
      // If status changed back to waiting_for_players, reset selected game
      if (data.newStatus === 'waiting_for_players') {
        setSelectedGame(null);
      }
      
      // Hide status menu
      setShowStatusMenu(false);
      
      // Show notification (you could implement a toast system here)
      console.log(`🔄 Room status changed to '${data.newStatus}' by ${data.changedBy}`);
    };

    const handlePlayerKicked = (data) => {
      console.log('👢 [KICK DEBUG] Player kicked event received:', {
        data,
        isNotification: data.isNotification,
        targetUserId: data.targetUserId,
        reason: data.reason,
        timestamp: new Date().toISOString()
      });

      if (data.isNotification) {
        // This is a notification to other players about someone being kicked
        console.log(`👢 [KICK DEBUG] ${data.targetName} was kicked by ${data.kickedBy}`);
        
        // Update players list
        setPlayers(data.players || []);
        
        // You could add a toast notification here
        alert(`${data.targetName} was removed from the room by ${data.kickedBy}`);
      } else {
        // This player was kicked personally
        console.log('👢 [KICK DEBUG] You have been kicked from the room:', {
          reason: data.reason,
          kickedBy: data.kickedBy,
          roomCode: data.roomCode
        });
        
        // Clear socket and leave room
        if (socket) {
          socket.disconnect();
        }
        
        // Show message and redirect to homepage
        alert(`${data.reason}\n\nKicked by: ${data.kickedBy}`);
        
        // Redirect to homepage
        if (onLeave) {
          onLeave();
        }
      }
    };

    const handleKickFailed = (data) => {
      console.log('👢 [KICK DEBUG] Kick failed event received:', {
        data,
        error: data.error,
        reason: data.reason,
        timestamp: new Date().toISOString()
      });

      // Show error popup without redirecting
      alert(`⚠️ Failed to kick player: ${data.reason || data.error || 'Unknown error'}`);
    };

    // Add event listeners BEFORE connecting
    newSocket.on('connect', handleConnect);
    newSocket.on('disconnect', handleDisconnect);
    newSocket.on('connect_error', handleConnectError);
    newSocket.on('roomJoined', handleRoomJoined);
    newSocket.on('playerJoined', handlePlayerJoined);
    newSocket.on('playerLeft', handlePlayerLeft);
    newSocket.on('playerDisconnected', handlePlayerDisconnected);
    newSocket.on('gameSelected', handleGameSelected);
    newSocket.on('gameStarted', handleGameStarted);
    newSocket.on('hostTransferred', handleHostTransferred);
    newSocket.on('roomStatusChanged', handleRoomStatusChanged);
    newSocket.on('playerKicked', handlePlayerKicked);
    newSocket.on('kickFailed', handleKickFailed);
    newSocket.on('error', handleError);

    // Cleanup function
    return () => {
      console.log('🧹 Cleaning up socket connection');
      
      if (newSocket) {
        // Remove event listeners with specific handlers
        newSocket.off('connect', handleConnect);
        newSocket.off('disconnect', handleDisconnect);
        newSocket.off('connect_error', handleConnectError);
        newSocket.off('roomJoined', handleRoomJoined);
        newSocket.off('playerJoined', handlePlayerJoined);
        newSocket.off('playerLeft', handlePlayerLeft);
        newSocket.off('playerDisconnected', handlePlayerDisconnected);
        newSocket.off('gameSelected', handleGameSelected);
        newSocket.off('gameStarted', handleGameStarted);
        newSocket.off('hostTransferred', handleHostTransferred);
        newSocket.off('roomStatusChanged', handleRoomStatusChanged);
        newSocket.off('playerKicked', handlePlayerKicked);
        newSocket.off('kickFailed', handleKickFailed);
        newSocket.off('error', handleError);
        
        // Copy ref value to avoid stale closure
        const currentRoomCode = roomCodeRef.current;
        if (currentRoomCode) {
          newSocket.emit('leaveRoom', { roomCode: currentRoomCode });
        }
        newSocket.disconnect();
      }
      
      activeConnection = null;
    };
  }, []); // Empty dependency array to prevent re-running

  // Close status menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showStatusMenu && !event.target.closest('.status-controls')) {
        setShowStatusMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showStatusMenu]);

  const handleGameSelect = (gameType) => {
    if (socket && currentIsHost) {
      console.log('🎮 Selecting game:', gameType);
      socket.emit('selectGame', { gameType });
    }
  };

  const handleStartGame = () => {
    if (socket && currentIsHost) {
      console.log('🚀 Starting game');
      socket.emit('startGame', { roomCode: roomCodeRef.current });
    }
  };

  const handleLeaveRoom = () => {
    if (socket) {
      socket.emit('leaveRoom', { roomCode: roomCodeRef.current });
    }
    if (onLeave) {
      onLeave();
    }
  };

  const handleTransferHost = (targetPlayerId) => {
    if (socket && currentIsHost) {
      console.log('👑 Transferring host to player:', targetPlayerId);
      socket.emit('transferHost', { 
        roomCode: roomCodeRef.current,
        targetUserId: targetPlayerId
      });
    }
  };

  const handleKickPlayer = (targetPlayerId, targetPlayerName) => {
    if (socket && currentIsHost) {
      // Confirm kick action
      const confirmed = window.confirm(
        `Are you sure you want to kick ${targetPlayerName} from the room?`
      );
      
      if (confirmed) {
        console.log('👢 [KICK DEBUG] Kicking player:', {
          targetPlayerId,
          targetPlayerName,
          roomCode: roomCodeRef.current,
          timestamp: new Date().toISOString()
        });
        
        socket.emit('kickPlayer', {
          roomCode: roomCodeRef.current,
          targetUserId: targetPlayerId
        });
      } else {
        console.log('👢 [KICK DEBUG] Kick cancelled by host');
      }
    }
  };

  const handleChangeRoomStatus = (newStatus) => {
    if (socket && currentIsHost) {
      console.log('🔄 Changing room status to:', newStatus);
      socket.emit('changeRoomStatus', { 
        roomCode: roomCodeRef.current,
        newStatus: newStatus
      });
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="room-lobby">
        <div className="lobby-header">
          <h2>Room {roomCode}</h2>
          <div className="connection-status">
            Status: {connectionStatus}
          </div>
        </div>
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Connecting to room...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="room-lobby">
        <div className="lobby-header">
          <h2>Room {roomCode}</h2>
        </div>
        <div className="error-container">
          <div className="error-message">
            <h3>Connection Error</h3>
            <p>{error}</p>
            <div className="error-actions">
              <button onClick={() => window.location.reload()} className="retry-button">
                Retry Connection
              </button>
              <button onClick={handleLeaveRoom} className="leave-button">
                Leave Room
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="room-lobby">
      <div className="lobby-header">
        <button onClick={handleLeaveRoom} className="leave-button">
          Leave Room
        </button>
        
        <div className="room-info-header">
          <div className="room-code-display">{roomCode}</div>
          <div className="room-status-section">
            <div className="room-status-display">
              <span className="status-label">Status:</span>
              <span className={`status-badge status-${roomStatus}`}>
                {roomStatus.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </span>
              {currentIsHost && (
                <div className="status-controls">
                  <button 
                    className="change-status-btn"
                    onClick={() => setShowStatusMenu(!showStatusMenu)}
                    title="Change room status"
                  >
                    ⚙️
                  </button>
                  {showStatusMenu && (
                    <div className="status-menu">
                      <div className="status-menu-header">Change Status</div>
                      <button 
                        className="status-option"
                        onClick={() => handleChangeRoomStatus('waiting_for_players')}
                        disabled={roomStatus === 'waiting_for_players'}
                      >
                        🟢 Waiting for Players
                      </button>
                      <button 
                        className="status-option"
                        onClick={() => handleChangeRoomStatus('active')}
                        disabled={roomStatus === 'active'}
                      >
                        🔵 Active
                      </button>
                      <button 
                        className="status-option"
                        onClick={() => handleChangeRoomStatus('paused')}
                        disabled={roomStatus === 'paused'}
                      >
                        🟡 Paused
                      </button>
                      <button 
                        className="status-option"
                        onClick={() => handleChangeRoomStatus('finished')}
                        disabled={roomStatus === 'finished'}
                      >
                        🔴 Finished
                      </button>
                      <button 
                        className="status-option"
                        onClick={() => handleChangeRoomStatus('abandoned')}
                        disabled={roomStatus === 'abandoned'}
                      >
                        ⚫ Abandoned
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="room-actions">
            <button className="copy-btn" onClick={() => navigator.clipboard.writeText(roomCode)}>
              📋 Copy Code
            </button>
            <button 
              className="copy-link-btn" 
              onClick={() => {
                const roomUrl = `${window.location.origin}/?join=${roomCode}`;
                navigator.clipboard.writeText(roomUrl);
              }}
            >
              🔗 Copy Link
            </button>
          </div>
        </div>
        
        <div style={{ width: '120px' }}></div> {/* Spacer for layout balance */}
      </div>

      <div className="lobby-content">
        {/* Room Status Information */}
        {!currentIsHost && roomStatus !== 'waiting_for_players' && (
          <div className="status-info-section">
            <div className="status-info-card">
              <div className="status-info-icon">
                {roomStatus === 'active' && '🔵'}
                {roomStatus === 'paused' && '🟡'}
                {roomStatus === 'finished' && '🔴'}
                {roomStatus === 'abandoned' && '⚫'}
                {roomStatus === 'launching' && '��'}
              </div>
              <div className="status-info-content">
                <h4 className="status-info-title">
                  Room is {roomStatus.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </h4>
                <p className="status-info-description">
                  {roomStatus === 'active' && 'The room is currently active. New players cannot join right now.'}
                  {roomStatus === 'paused' && 'The room is paused. The host can resume or change the status.'}
                  {roomStatus === 'finished' && 'This room has finished. The host can reopen it for new players.'}
                  {roomStatus === 'abandoned' && 'This room has been abandoned. The host can reactivate it.'}
                  {roomStatus === 'launching' && 'The room is launching. Please wait for the game to start.'}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="players-section">
          <h3 className="section-title">Players in Room</h3>
          <div className="players-grid">
            {players.map((player) => (
              <div 
                key={player.id} 
                className={`player-card ${player.isHost ? 'host' : ''}`}
              >
                <div className="player-card-content">
                  <div className="player-avatar">
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="player-info">
                    <span className="player-name">{player.name}</span>
                    {player.isHost && <span className="host-badge">Host</span>}
                  </div>
                </div>
                {/* Show host controls if current user is host and this is not the host */}
                {currentIsHost && !player.isHost && (
                  <div className="player-actions">
                    <button 
                      className="make-host-btn"
                      onClick={() => handleTransferHost(player.id)}
                      title={`Make ${player.name} the host`}
                    >
                      👑 Make Host
                    </button>
                    <button 
                      className="kick-player-btn"
                      onClick={() => handleKickPlayer(player.id, player.name)}
                      title={`Kick ${player.name} from the room`}
                    >
                      👢 Kick
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="game-section">
          <h3 className="section-title">Game Selection</h3>
          {!selectedGame ? (
            <GamePicker 
              onGameSelect={handleGameSelect}
              isHost={currentIsHost}
              disabled={!socket || connectionStatus !== 'connected'}
            />
          ) : (
            <div className="selected-game-card">
              <div className="game-icon">
                {selectedGame === 'ddf' ? '🎮' : '🎓'}
              </div>
              <div className="game-details">
                <h4>{selectedGame === 'ddf' ? 'Der dümmste fliegt' : 'School Quiz'}</h4>
                <p>{selectedGame === 'ddf' ? 'Quiz game where the worst player gets eliminated' : 'Educational quiz game for students'}</p>
                <span className="max-players">Max {selectedGame === 'ddf' ? '8' : '10'} players</span>
              </div>
              {currentIsHost && (
                <div>
                  <button 
                    onClick={handleStartGame}
                    className="start-game-button"
                    disabled={!socket || connectionStatus !== 'connected'}
                  >
                    Start Game
                  </button>
                  <button 
                    onClick={() => setSelectedGame(null)}
                    className="change-game-btn"
                    disabled={!socket || connectionStatus !== 'connected'}
                    style={{ marginTop: '1rem' }}
                  >
                    Change Game
                  </button>
                </div>
              )}
              {!currentIsHost && (
                <div style={{ textAlign: 'center' }}>
                  <p>Waiting for host to start the game...</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {roomData && (
        <div className="room-details">
          <small>
            Room created: {new Date(roomData.created_at).toLocaleString()}
            {roomData.metadata?.created_by_name && (
              <> by {roomData.metadata.created_by_name}</>
            )}
          </small>
        </div>
      )}
    </div>
  );
};

export default RoomLobby; 