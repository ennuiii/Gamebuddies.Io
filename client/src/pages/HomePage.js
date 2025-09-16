import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import GameCard from '../components/GameCard';
import CreateRoom from '../components/CreateRoom';
import JoinRoom from '../components/JoinRoom';
import RoomLobby from '../components/RoomLobby';
import './HomePage.css';

const HomePage = ({ setIsInLobby, setLobbyLeaveFn }) => {
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
  const [prefillName, setPrefillName] = useState('');
  const [autoJoin, setAutoJoin] = useState(false);

  useEffect(() => {
    fetchGames();

    // Handle return-to-lobby URL parameters
    const joinCode = searchParams.get('join');
    const nameParam = searchParams.get('name');
    const playerIdParam = searchParams.get('playerId');
    const returningFromGame = searchParams.get('returningFromGame');
    const wasHost = searchParams.get('wasHost') === 'true';

    if (playerIdParam) {
      try {
        sessionStorage.setItem('gamebuddies_playerId', playerIdParam);
      } catch {}
    }

    if (joinCode) {
      console.log('🔄 [HOMEPAGE DEBUG] Player returning from game:', {
        joinCode,
        nameParam,
        playerIdParam,
        returningFromGame,
        wasHost,
        timestamp: new Date().toISOString()
      });

      setJoinRoomCode(joinCode);
      setShowJoinRoom(true);

      if (nameParam && nameParam.trim().length >= 2) {
        setPrefillName(nameParam.trim());
        setAutoJoin(true);
      } else {
        setPrefillName('');
        setAutoJoin(false);
      }

      // Show welcome back message if returning from game
      if (returningFromGame) {
        setTimeout(() => {
          const gameName = returningFromGame === 'ddf' ? 'Der dümmste fliegt' : returningFromGame;
          const welcomeMessage = `Welcome back from ${gameName}! You have rejoined the lobby.`;
          // You can implement a toast notification system here
          alert(welcomeMessage);
        }, 500);
      }

      navigate('/', { replace: true });
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
    setIsInLobby(true);
    setLobbyLeaveFn(() => handleLeaveLobby);
  };

  const handleJoinRoom = (room) => {
    // The actual room data will be fetched in RoomLobby
    setCurrentRoom(room);
    setPlayerName(room.playerName);
    setShowJoinRoom(false);
    setInLobby(true);
    setIsInLobby(true);
    setLobbyLeaveFn(() => handleLeaveLobby);
  };

  const handleLeaveLobby = () => {
    setInLobby(false);
    setCurrentRoom(null);
    setPlayerName('');
    setIsInLobby(false);
    setLobbyLeaveFn(null);
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
      {/* Animated Background */}
      <div className="background-animation">
        <div className="floating-elements">
          {[...Array(15)].map((_, i) => (
            <div key={i} className={`floating-element element-${i + 1}`}></div>
          ))}
        </div>
      </div>

      {/* Hero Section */}
      <section className="hero">
        <motion.div 
          className="hero-content"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: "easeOut" }}
        >
          <motion.div
            className="hero-badge"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <span className="badge-text">🎮 Now Live</span>
          </motion.div>
          
          <motion.h1 
            className="hero-title"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            <span className="brand-text">GameBuddies</span>
            <span className="brand-dot">.io</span>
          </motion.h1>
          
          <motion.p 
            className="hero-subtitle"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
          >
            The ultimate multiplayer gaming platform
            <br />
            <span className="subtitle-highlight">Connect, Play, and Dominate Together</span>
          </motion.p>
          
          <motion.div 
            className="hero-buttons"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.7 }}
          >
            <motion.button
              className="cta-button primary"
              onClick={handleCreateRoomClick}
              whileHover={{ scale: 1.05, y: -3 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <span className="button-text">Create Room</span>
              <span className="button-icon">🚀</span>
            </motion.button>
            <motion.button
              className="cta-button secondary"
              onClick={handleJoinRoomClick}
              whileHover={{ scale: 1.05, y: -3 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <span className="button-text">Join Room</span>
              <span className="button-icon">🎯</span>
            </motion.button>
          </motion.div>
        </motion.div>
      </section>

      {/* Games Section */}
      <section className="games-section" id="games-section">
        <div className="container">
          <motion.div 
            className="section-header"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="section-title">Quick Play Games</h2>
            <p className="section-subtitle">Jump into these popular games instantly</p>
          </motion.div>
          
          {loading ? (
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <p className="loading-text">Loading awesome games...</p>
            </div>
          ) : (
            <div className="games-grid">
              {games.map((game, index) => (
                <motion.div
                  key={game.id}
                  initial={{ opacity: 0, y: 50 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  viewport={{ once: true }}
                >
                  <GameCard game={game} />
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Call to Action Section */}
      <section className="cta-section">
        <div className="container">
          <motion.div 
            className="cta-content"
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="cta-title">Ready to Start Gaming?</h2>
            <p className="cta-subtitle">Join thousands of players already having fun on GameBuddies.io</p>
            <motion.button
              className="cta-button large"
              onClick={handleCreateRoomClick}
              whileHover={{ scale: 1.05, y: -3 }}
              whileTap={{ scale: 0.95 }}
            >
              <span className="button-text">Start Playing Now</span>
              <span className="button-icon">🎮</span>
            </motion.button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-brand">
              <h3 className="footer-title">
                <span className="brand-text">GameBuddies</span>
                <span className="brand-dot">.io</span>
              </h3>
              <p className="footer-tagline">The future of multiplayer gaming</p>
            </div>
            <div className="footer-stats">
              <div className="footer-stat">
                <span className="stat-icon">🎮</span>
                <span className="stat-text">Connecting gamers worldwide</span>
              </div>
            </div>
          </div>
          <div className="footer-bottom">
            <p>&copy; 2025 GameBuddies.io - All rights reserved</p>
          </div>
        </div>
      </footer>

      {/* Modals */}
      {showCreateRoom && (
        <CreateRoom
          onRoomCreated={handleRoomCreated}
          onCancel={handleCloseModals}
        />
      )}

      {showJoinRoom && (
        <JoinRoom
          initialRoomCode={joinRoomCode}
          initialPlayerName={prefillName}
          autoJoin={autoJoin}
          onRoomJoined={handleJoinRoom}
          onCancel={handleCloseModals}
        />
      )}
    </div>
  );
};

export default HomePage; 
