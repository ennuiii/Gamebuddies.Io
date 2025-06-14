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
  
  // Use refs for values that shouldn't trigger re-renders
  const roomCodeRef = useRef(roomCode);
  const playerNameRef = useRef(playerName);
  const isHostRef = useRef(isHost);

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
      console.log('🔍 [CLIENT DEBUG] Is host:', isHostRef.current);
      
      setConnectionStatus('connected');
      setSocket(newSocket);
      
      // Join the room
      newSocket.emit('joinRoom', {
        roomCode: roomCodeRef.current,
        playerName: playerNameRef.current
      });
      console.log('📤 [CLIENT] joinRoom event sent from lobby');
    };

    const handleDisconnect = () => {
      console.log('❌ Disconnected from server');
      setConnectionStatus('disconnected');
      setError('Connection lost. Please refresh the page.');
    };

    const handleConnectError = (error) => {
      console.error('❌ Connection error:', error);
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
      
      setPlayers(data.players || []);
      setRoomData(data.room);
      setSelectedGame(data.room?.game_type !== 'lobby' ? data.room.game_type : null);
      setIsLoading(false);
      setError(null);
    };

    const handlePlayerJoined = (data) => {
      console.log('👋 Player joined:', data.player.name);
      setPlayers(data.players || []);
      setRoomData(data.room);
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
      console.log('🚀 Game starting:', data);
      // Store GameBuddies integration data
      sessionStorage.setItem('gamebuddies_roomCode', roomCodeRef.current);
      sessionStorage.setItem('gamebuddies_playerName', playerNameRef.current);
      sessionStorage.setItem('gamebuddies_isHost', data.isHost.toString());
      sessionStorage.setItem('gamebuddies_gameType', data.gameType);
      sessionStorage.setItem('gamebuddies_returnUrl', window.location.origin);
      
      // Redirect to game
      window.location.href = data.gameUrl;
    };

    const handleError = (error) => {
      console.error('❌ Socket error:', error);
      setError(error.message || 'An error occurred');
      setIsLoading(false);
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

  const handleGameSelect = (gameType) => {
    if (socket && isHostRef.current) {
      console.log('🎮 Selecting game:', gameType);
      socket.emit('selectGame', { gameType });
    }
  };

  const handleStartGame = () => {
    if (socket && isHostRef.current) {
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
          <div className="room-actions">
            <button className="copy-btn" onClick={() => navigator.clipboard.writeText(roomCode)}>
              📋 Copy Code
            </button>
          </div>
        </div>
        
        <div style={{ width: '120px' }}></div> {/* Spacer for layout balance */}
      </div>

      <div className="lobby-content">
        <div className="players-section">
          <h3 className="section-title">Players in Room</h3>
          <div className="players-grid">
            {players.map((player) => (
              <div 
                key={player.id} 
                className={`player-card ${player.isHost ? 'host' : ''}`}
              >
                <div className="player-avatar">
                  {player.name.charAt(0).toUpperCase()}
                </div>
                <div className="player-info">
                  <span className="player-name">{player.name}</span>
                  {player.isHost && <span className="host-badge">Host</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="game-section">
          <h3 className="section-title">Game Selection</h3>
          {!selectedGame ? (
            <GamePicker 
              onGameSelect={handleGameSelect}
              isHost={isHostRef.current}
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
              {isHostRef.current && (
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
              {!isHostRef.current && (
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