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
    const playerNameFromURL = searchParams.get('name');
    const hostFromURL = searchParams.get('host') === 'true';
    const fromGameFlag = searchParams.get('fromGame') === 'true';
    
    console.log('🔄 [HOMEPAGE DEBUG] URL parameters detected:', {
      joinCode,
      rejoinCode,
      autoRejoinCode,
      playerNameFromURL,
      hostFromURL,
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
    
    if (autoRejoinCode && playerNameFromURL) {
      // Automatic rejoin from GM-initiated return (original flow)
      console.log('🔄 [HOMEPAGE DEBUG] Auto-rejoining room (original flow):', {
        code: autoRejoinCode,
        name: playerNameFromURL,
        isHost: hostFromURL,
        source: 'GM-initiated return (autorejoin)'
      });
      
      setCurrentRoom({
        roomCode: autoRejoinCode,
        playerName: playerNameFromURL,
        isHost: hostFromURL
      });
      setPlayerName(playerNameFromURL);
      setInLobby(true);
      // Clear the URL parameters
      navigate('/', { replace: true });
    } else if (rejoinCode && fromGameFlag && playerNameFromURL) {
      // Special case: returning from a game - direct rejoin without modal
      console.log('🔄 [HOMEPAGE DEBUG] Returning from game - direct rejoin:', {
        rejoinCode,
        playerName: playerNameFromURL,
        isHost: hostFromURL,
        source: 'Game return with fromGame flag'
      });
      
      setCurrentRoom({
        roomCode: rejoinCode,
        playerName: playerNameFromURL,
        isHost: hostFromURL
      });
      setPlayerName(playerNameFromURL);
      setInLobby(true);
      // Clear the URL parameters
      navigate('/', { replace: true });
    } else if (rejoinCode && playerNameFromURL && !fromGameFlag) {  
      // Direct rejoin with name parameter (skip modal)
      console.log('🔄 [HOMEPAGE DEBUG] Direct rejoin with name parameter:', {
        rejoinCode,
        playerName: playerNameFromURL,
        isHost: hostFromURL,
        source: 'Direct rejoin with name'
      });
      
      setCurrentRoom({
        roomCode: rejoinCode,
        playerName: playerNameFromURL,
        isHost: hostFromURL
      });
      setPlayerName(playerNameFromURL);
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

          <motion.div
            className="hero-stats"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.9 }}
          >
            <div className="stat-item">
              <div className="stat-number">10K+</div>
              <div className="stat-label">Active Players</div>
            </div>
            <div className="stat-divider"></div>
            <div className="stat-item">
              <div className="stat-number">50+</div>
              <div className="stat-label">Games Available</div>
            </div>
            <div className="stat-divider"></div>
            <div className="stat-item">
              <div className="stat-number">24/7</div>
              <div className="stat-label">Online Gaming</div>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* Features Section */}
      <section className="features-section">
        <div className="container">
          <motion.div 
            className="section-header"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="section-title">Why Choose GameBuddies?</h2>
            <p className="section-subtitle">Experience the future of multiplayer gaming</p>
          </motion.div>

          <div className="features-grid">
            {[
              {
                icon: "🎮",
                title: "Instant Gaming",
                description: "Jump into games instantly with our seamless platform. No downloads, no hassle.",
                color: "var(--primary-color)"
              },
              {
                icon: "👥",
                title: "Real-time Multiplayer",
                description: "Connect with friends and players worldwide in real-time gaming sessions.",
                color: "var(--secondary-color)"
              },
              {
                icon: "🔒",
                title: "Secure & Private",
                description: "Your gaming sessions are protected with enterprise-grade security.",
                color: "var(--accent-color)"
              },
              {
                icon: "⚡",
                title: "Lightning Fast",
                description: "Optimized for speed and performance across all devices and platforms.",
                color: "#00ff88"
              },
              {
                icon: "🏆",
                title: "Competitive Play",
                description: "Climb leaderboards and compete in tournaments with skill-based matchmaking.",
                color: "#ffd93d"
              },
              {
                icon: "🌍",
                title: "Global Community",
                description: "Join millions of players from around the world in our vibrant gaming community.",
                color: "#ff6b6b"
              }
            ].map((feature, index) => (
              <motion.div
                key={index}
                className="feature-card"
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
                whileHover={{ y: -10, scale: 1.02 }}
              >
                <div className="feature-icon" style={{ '--icon-color': feature.color }}>
                  {feature.icon}
                </div>
                <h3 className="feature-title">{feature.title}</h3>
                <p className="feature-description">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
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