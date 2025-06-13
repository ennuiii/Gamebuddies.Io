import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import socketService from '../utils/socket';
import './RoomLobby.css';

const RoomLobby = ({ room, playerName, onLeave }) => {
  const navigate = useNavigate();
  
  // Use a single state object to ensure atomic updates
  const [lobbyState, setLobbyState] = useState({
    players: [],
    selectedGame: room.selectedGame || null,
    isHost: false,
    isLoading: true,
    error: ''
  });
  
  const [availableGames, setAvailableGames] = useState({});
  const [showGameSelection, setShowGameSelection] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Use refs to store values that shouldn't trigger re-renders
  const roomCodeRef = useRef(room.roomCode);
  const playerNameRef = useRef(playerName);
  const navigateRef = useRef(navigate);
  const hasJoinedRef = useRef(false);
  const loadingStateRef = useRef(true);

  // Debug log current players state
  console.log('RoomLobby render - lobbyState:', lobbyState);

  // Add effect to log when lobbyState changes
  useEffect(() => {
    console.log('lobbyState updated:', lobbyState);
    loadingStateRef.current = lobbyState.isLoading;
  }, [lobbyState]);

  // Update refs when props change
  useEffect(() => {
    roomCodeRef.current = room.roomCode;
    playerNameRef.current = playerName;
    navigateRef.current = navigate;
  }, [room.roomCode, playerName, navigate]);

  // Main socket connection effect - no dependencies!
  useEffect(() => {
    let isCancelled = false;
    let loadingTimeout = null;
    let roomJoinedHandler = null;
    let socket = null;

    // Define all event handlers
    const handleRoomJoined = ({ room: updatedRoom, playerId, isHost: hostStatus }) => {
      console.log('RoomJoined event received:', { 
        players: updatedRoom.players, 
        playerId, 
        isHost: hostStatus 
      });
      
      if (!isCancelled) {
        console.log('Attempting to update state...');
        hasJoinedRef.current = true;
        
        // Update all state at once
        setLobbyState({
          players: updatedRoom.players,
          selectedGame: updatedRoom.selectedGame,
          isHost: hostStatus,
          isLoading: false,
          error: ''
        });
        
        console.log('State updated - isHost:', hostStatus, 'isLoading set to false');
      }
    };

    const handlePlayerJoined = ({ players: updatedPlayers }) => {
      console.log('PlayerJoined event received:', updatedPlayers);
      if (!isCancelled) {
        setLobbyState(prev => ({ ...prev, players: updatedPlayers }));
      }
    };

    const handlePlayerLeft = ({ players: updatedPlayers }) => {
      console.log('PlayerLeft event received:', updatedPlayers);
      if (!isCancelled) {
        setLobbyState(prev => ({ ...prev, players: updatedPlayers }));
      }
    };

    const handleHostChanged = ({ newHostId }) => {
      if (!isCancelled && socketService.socket) {
        const newIsHost = socketService.socket.id === newHostId;
        setLobbyState(prev => ({ ...prev, isHost: newIsHost }));
        console.log('Host changed - new isHost:', newIsHost);
      }
    };

    const handleGameSelected = ({ game }) => {
      if (!isCancelled) {
        setLobbyState(prev => ({ ...prev, selectedGame: game }));
        setShowGameSelection(false);
      }
    };

    const handleGameStarted = ({ gameUrl, gameType, isHost }) => {
      // Store important information in sessionStorage for the game to access
      sessionStorage.setItem('gamebuddies_roomCode', roomCodeRef.current);
      sessionStorage.setItem('gamebuddies_playerName', playerNameRef.current);
      sessionStorage.setItem('gamebuddies_isHost', isHost ? 'true' : 'false');
      sessionStorage.setItem('gamebuddies_gameType', gameType);
      sessionStorage.setItem('gamebuddies_returnUrl', window.location.origin);
      
      // Redirect all players to the game
      if (!isCancelled) {
        window.location.href = gameUrl;
      }
    };

    const handleJoinError = (errorMessage) => {
      if (!isCancelled) {
        setLobbyState(prev => ({ ...prev, error: errorMessage, isLoading: false }));
        console.log('Join error:', errorMessage);
      }
    };

    const handleRoomExpired = () => {
      if (!isCancelled) {
        alert('Room has expired. Returning to home page.');
        navigateRef.current('/');
      }
    };

    // Connect and setup
    const setupConnection = async () => {
      if (isCancelled) return;
      
      // Check if we've already successfully joined
      if (hasJoinedRef.current) {
        console.log('Already successfully joined room');
        return;
      }
      
      try {
        console.log('Setting up socket connection...');
        // Connect to socket
        socket = socketService.connect();
        
        // Set a timeout to handle stuck loading states
        loadingTimeout = setTimeout(() => {
          if (!isCancelled && loadingStateRef.current) {
            console.error('Loading timeout - failed to join room');
            setLobbyState(prev => ({ ...prev, error: 'Failed to join room - timeout', isLoading: false }));
            // Clean up socket on timeout
            if (socket) {
              socketService.disconnect();
            }
          }
        }, 10000); // 10 second timeout
        
        // Wait for socket to be connected
        if (!socket.connected) {
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Socket connection timeout'));
            }, 5000);
            
            socket.once('connect', () => {
              clearTimeout(timeout);
              console.log('Socket connected!');
              resolve();
            });
          });
        }
        
        if (isCancelled) {
          clearTimeout(loadingTimeout);
          return;
        }
        
        // Remove any existing listeners first to avoid duplicates
        socketService.off('roomJoined');
        socketService.off('playerJoined');
        socketService.off('playerLeft');
        socketService.off('hostChanged');
        socketService.off('gameSelected');
        socketService.off('gameStarted');
        socketService.off('joinError');
        socketService.off('roomExpired');
        
        // Add event listeners FIRST before joining room
        socketService.on('roomJoined', handleRoomJoined);
        socketService.on('playerJoined', handlePlayerJoined);
        socketService.on('playerLeft', handlePlayerLeft);
        socketService.on('hostChanged', handleHostChanged);
        socketService.on('gameSelected', handleGameSelected);
        socketService.on('gameStarted', handleGameStarted);
        socketService.on('joinError', handleJoinError);
        socketService.on('roomExpired', handleRoomExpired);
        
        console.log('Socket event listeners attached');
        
        // NOW join room after listeners are ready
        console.log('Joining room:', roomCodeRef.current, 'as:', playerNameRef.current);
        socketService.joinRoom(roomCodeRef.current, playerNameRef.current);
        
        // Clear the loading timeout when we successfully join
        roomJoinedHandler = () => {
          if (loadingTimeout) {
            clearTimeout(loadingTimeout);
            loadingTimeout = null;
          }
        };
        socketService.on('roomJoined', roomJoinedHandler);
        
        // Fetch available games
        fetchAvailableGames();
      } catch (error) {
        console.error('Failed to setup connection:', error);
        if (!isCancelled) {
          setLobbyState(prev => ({ ...prev, error: 'Failed to connect to server', isLoading: false }));
          // Clean up socket on error
          if (socket) {
            socketService.disconnect();
          }
        }
      }
    };

    setupConnection();

    // Cleanup function
    return () => {
      console.log('Cleaning up RoomLobby...');
      isCancelled = true;
      
      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
      }
      
      // Remove all event listeners
      socketService.off('roomJoined');
      socketService.off('playerJoined');
      socketService.off('playerLeft');
      socketService.off('hostChanged');
      socketService.off('gameSelected');
      socketService.off('gameStarted');
      socketService.off('joinError');
      socketService.off('roomExpired');
      
      // Disconnect socket
      socketService.disconnect();
      
      console.log('RoomLobby cleanup complete');
    };
  }, []); // Empty dependency array

  const fetchAvailableGames = async () => {
    try {
      const response = await fetch('/api/games/available');
      const games = await response.json();
      setAvailableGames(games);
    } catch (err) {
      console.error('Failed to fetch games:', err);
    }
  };

  const handleSelectGame = (gameType) => {
    socketService.selectGame(roomCodeRef.current, gameType);
  };

  const handleStartGame = () => {
    if (!lobbyState.selectedGame) {
      setLobbyState(prev => ({ ...prev, error: 'Please select a game first' }));
      return;
    }
    socketService.startGame(roomCodeRef.current);
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCodeRef.current);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyInviteLink = () => {
    const inviteUrl = `${window.location.origin}?join=${roomCodeRef.current}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="room-lobby">
      <style>
        {`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
      {lobbyState.isLoading ? (
        // Show loading state while connecting
        <div className="loading-container" style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          minHeight: '100vh',
          gap: '2rem'
        }}>
          <div className="loading-spinner" style={{
            width: '50px',
            height: '50px',
            border: '3px solid rgba(255, 255, 255, 0.1)',
            borderTopColor: 'var(--secondary-color)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }}></div>
          <h2 style={{ color: 'var(--text-primary)' }}>Joining room {room.roomCode}...</h2>
          {lobbyState.error && (
            <div className="error-message" style={{ maxWidth: '400px', textAlign: 'center' }}>
              {lobbyState.error}
            </div>
          )}
        </div>
      ) : (
        // Show lobby content after successfully joining
        <>
          <div className="lobby-header">
            <button 
              className="leave-button"
              onClick={onLeave}
            >
              Leave Room
            </button>
            
            <div className="room-info-header">
              <h2 className="room-code-display">Room: {room.roomCode}</h2>
              <div className="room-actions">
                <button 
                  className="copy-btn"
                  onClick={copyRoomCode}
                  title="Copy room code"
                >
                  {copied ? '✓' : '📋'} Copy Code
                </button>
                <button 
                  className="copy-btn"
                  onClick={copyInviteLink}
                  title="Copy invite link"
                >
                  {copied ? '✓' : '🔗'} Copy Link
                </button>
              </div>
            </div>
          </div>

          <div className="lobby-content">
            <div className="players-section">
              <h3 className="section-title">Players ({lobbyState.players.length})</h3>
              <div className="players-grid">
                {lobbyState.players.map((player, index) => (
                  <motion.div
                    key={player.id}
                    className={`player-card ${player.isHost ? 'host' : ''}`}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <div className="player-avatar">
                      {player.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="player-info">
                      <span className="player-name">{player.name}</span>
                      {player.isHost && <span className="host-badge">HOST</span>}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="game-section">
              <h3 className="section-title">Selected Game</h3>
              
              {lobbyState.selectedGame ? (
                <div className="selected-game-card">
                  <div className="game-icon">{lobbyState.selectedGame.icon}</div>
                  <div className="game-details">
                    <h4>{lobbyState.selectedGame.name}</h4>
                    <p>{lobbyState.selectedGame.description}</p>
                    <span className="max-players">Max {lobbyState.selectedGame.maxPlayers} players</span>
                  </div>
                  {lobbyState.isHost && (
                    <button 
                      className="change-game-btn"
                      onClick={() => setShowGameSelection(true)}
                    >
                      Change Game
                    </button>
                  )}
                </div>
              ) : (
                <div className="no-game-selected">
                  {lobbyState.isHost ? (
                    <button 
                      className="select-game-btn"
                      onClick={() => setShowGameSelection(true)}
                    >
                      Select a Game
                    </button>
                  ) : (
                    <p>Waiting for host to select a game...</p>
                  )}
                </div>
              )}
            </div>

            {lobbyState.error && (
              <div className="error-message">{lobbyState.error}</div>
            )}

            {lobbyState.isHost && lobbyState.selectedGame && (
              <motion.button
                className="start-game-button"
                onClick={handleStartGame}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Start Game
              </motion.button>
            )}
          </div>
        </>
      )}

      {/* Game Selection Modal */}
      {showGameSelection && (
        <motion.div
          className="game-selection-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setShowGameSelection(false)}
        >
          <motion.div
            className="game-selection-modal"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 20 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="modal-title">Select a Game</h3>
            <div className="games-grid">
              {Object.entries(availableGames).map(([key, game]) => (
                <motion.button
                  key={key}
                  className="game-option"
                  onClick={() => handleSelectGame(key)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <div className="game-icon">{game.icon}</div>
                  <h4 className="game-name">{game.name}</h4>
                  <p className="game-description">{game.description}</p>
                  <span className="max-players">Max {game.maxPlayers} players</span>
                </motion.button>
              ))}
            </div>
            <button 
              className="close-modal-btn"
              onClick={() => setShowGameSelection(false)}
            >
              Cancel
            </button>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
};

export default RoomLobby; 