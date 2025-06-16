import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import GameCard from '../components/GameCard';
import CreateRoom from '../components/CreateRoom';
import JoinRoom from '../components/JoinRoom';
import RoomLobby from '../components/RoomLobby';
import './HomePage.css';

const HomePage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [showJoinRoom, setShowJoinRoom] = useState(false);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [inLobby, setInLobby] = useState(false);
  const [joinRoomCode, setJoinRoomCode] = useState('');

  useEffect(() => {
    fetchGames();
    
    // Check if there's a join parameter in the URL
    const joinCode = searchParams.get('join');
    const rejoinCode = searchParams.get('rejoin');
    const autoRejoinCode = searchParams.get('autorejoin');
    const autoRejoinName = searchParams.get('name');
    const autoRejoinHost = searchParams.get('host') === 'true';
    const fromGameFlag = searchParams.get('fromGame') === 'true';
    
    console.log('🔄 [HOMEPAGE DEBUG] URL parameters detected:', {
      joinCode,
      rejoinCode,
      autoRejoinCode,
      autoRejoinName,
      autoRejoinHost,
      fromGameFlag,
      fullURL: window.location.href,
      searchParams: Object.fromEntries(searchParams.entries())
    });

    // Check for GameBuddies session data
    const sessionData = {
      roomCode: sessionStorage.getItem('gamebuddies_roomCode'),
      playerName: sessionStorage.getItem('gamebuddies_playerName'),
      isHost: sessionStorage.getItem('gamebuddies_isHost'),
      gameType: sessionStorage.getItem('gamebuddies_gameType'),
      returnUrl: sessionStorage.getItem('gamebuddies_returnUrl')
    };
    
    console.log('🔄 [HOMEPAGE DEBUG] GameBuddies session storage:', sessionData);
    
    if (autoRejoinCode && autoRejoinName) {
      // Automatic rejoin from GM-initiated return
      console.log('🔄 [HOMEPAGE DEBUG] Auto-rejoining room:', {
        code: autoRejoinCode,
        name: autoRejoinName,
        isHost: autoRejoinHost,
        source: 'GM-initiated return'
      });
      
      setCurrentRoom({
        roomCode: autoRejoinCode,
        playerName: autoRejoinName,
        isHost: autoRejoinHost
      });
      setPlayerName(autoRejoinName);
      setInLobby(true);
      // Clear the URL parameters
      navigate('/', { replace: true });
    } else if (rejoinCode && fromGameFlag) {
      // Special case: returning from a game - direct rejoin without modal
      console.log('🔄 [HOMEPAGE DEBUG] Returning from game - direct rejoin:', {
        rejoinCode,
        playerName: autoRejoinName,
        isHost: autoRejoinHost,
        source: 'Game return'
      });
      
      setCurrentRoom({
        roomCode: rejoinCode,
        playerName: autoRejoinName,
        isHost: autoRejoinHost
      });
      setPlayerName(autoRejoinName);
      setInLobby(true);
      // Clear the URL parameters
      navigate('/', { replace: true });
    } else if (joinCode || rejoinCode) {
      // Manual join/rejoin
      console.log('🔄 [HOMEPAGE DEBUG] Manual join/rejoin:', {
        joinCode,
        rejoinCode,
        source: 'URL parameter'
      });
      
      setJoinRoomCode(joinCode || rejoinCode);
      setShowJoinRoom(true);
      // Clear the URL parameter after using it
      navigate('/', { replace: true });
    } else if (sessionData.roomCode && sessionData.playerName) {
      // Check if we have session data but no URL parameters (potential return from game)
      console.log('🔄 [HOMEPAGE DEBUG] Found GameBuddies session data without URL params:', {
        roomCode: sessionData.roomCode,
        playerName: sessionData.playerName,
        isHost: sessionData.isHost === 'true',
        gameType: sessionData.gameType,
        returnUrl: sessionData.returnUrl,
        scenario: 'potential return from game'
      });
      
      // Don't automatically rejoin - let the GameBuddiesReturnHandler handle it
      // This prevents conflicts between different return mechanisms
      console.log('🔄 [HOMEPAGE DEBUG] Letting GameBuddiesReturnHandler manage the return flow');
    } else {
      console.log('🔄 [HOMEPAGE DEBUG] No rejoin scenario detected - normal homepage load');
    }
  }, [searchParams, navigate]);

  const fetchGames = async () => {
    try {
      const response = await axios.get('/api/games');
      setGames(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching games:', error);
      setLoading(false);
    }
  };

  const handleCreateRoomClick = () => {
    setShowCreateRoom(true);
  };

  const handleJoinRoomClick = () => {
    setShowJoinRoom(true);
  };

  const handleRoomCreated = (room) => {
    setCurrentRoom(room);
    setPlayerName(room.playerName);
    setShowCreateRoom(false);
    setInLobby(true);
  };

  const handleJoinRoom = (room) => {
    // The actual room data will be fetched in RoomLobby
    setCurrentRoom(room);
    setPlayerName(room.playerName);
    setShowJoinRoom(false);
    setInLobby(true);
  };

  const handleLeaveLobby = () => {
    setInLobby(false);
    setCurrentRoom(null);
    setPlayerName('');
  };

  const handleCloseModals = () => {
    setShowCreateRoom(false);
    setShowJoinRoom(false);
    setJoinRoomCode('');
  };

  // If in lobby, show the lobby component
  if (inLobby && currentRoom) {
    return (
      <RoomLobby 
        roomCode={currentRoom.roomCode}
        playerName={playerName}
        isHost={currentRoom.isHost}
        onLeave={handleLeaveLobby}
      />
    );
  }

  return (
    <div className="homepage">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-background">
          <div className="hero-shapes">
            <div className="shape shape-1"></div>
            <div className="shape shape-2"></div>
            <div className="shape shape-3"></div>
          </div>
        </div>
        
        <motion.div 
          className="hero-content"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className="hero-title">
            <span className="brand-text">GameBuddies</span><span className="brand-dot">.io</span>
          </h1>
          <p className="hero-subtitle">
            Play amazing online games with friends
          </p>
          <div className="hero-buttons">
            <motion.button
              className="cta-button"
              onClick={handleCreateRoomClick}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Create Room
            </motion.button>
            <motion.button
              className="cta-button secondary"
              onClick={handleJoinRoomClick}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Join Room
            </motion.button>
          </div>
        </motion.div>
      </section>

      {/* Games Section */}
      <section className="games-section" id="games-section">
        <div className="container">
          <h2 className="section-title">Quick Play</h2>
          <p className="section-subtitle">Jump into a game directly</p>
          
          {loading ? (
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <p>Loading games...</p>
            </div>
          ) : (
            <div className="games-grid">
              {games.map((game, index) => (
                <motion.div
                  key={game.id}
                  initial={{ opacity: 0, y: 50 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  viewport={{ once: true }}
                >
                  <GameCard game={game} />
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <p>&copy; 2025 GameBuddies.io - All rights reserved</p>
        </div>
      </footer>

      {/* Modals */}
      {showCreateRoom && (
        <CreateRoom
          onRoomCreated={handleRoomCreated}
          onClose={handleCloseModals}
        />
      )}

      {showJoinRoom && (
        <JoinRoom
          initialRoomCode={joinRoomCode}
          onRoomJoined={handleJoinRoom}
          onCancel={handleCloseModals}
        />
      )}
    </div>
  );
};

export default HomePage; 