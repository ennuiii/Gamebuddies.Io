import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import GameCard from '../components/GameCard';
import CreateRoom from '../components/CreateRoom';
import GameSelection from '../components/GameSelection';
import RoomReady from '../components/RoomReady';
import './HomePage.css';

const HomePage = () => {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [showGameSelection, setShowGameSelection] = useState(false);
  const [showRoomReady, setShowRoomReady] = useState(false);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [selectedGameType, setSelectedGameType] = useState(null);

  useEffect(() => {
    fetchGames();
  }, []);

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

  const handleRoomCreated = (room) => {
    setCurrentRoom(room);
    setShowCreateRoom(false);
    setShowGameSelection(true);
  };

  const handleGameSelected = (updatedRoom, gameType) => {
    setCurrentRoom(updatedRoom);
    setSelectedGameType(gameType);
    setShowGameSelection(false);
    setShowRoomReady(true);
  };

  const handleCloseModals = () => {
    setShowCreateRoom(false);
    setShowGameSelection(false);
    setShowRoomReady(false);
    setCurrentRoom(null);
    setSelectedGameType(null);
  };

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
            Your ultimate destination for amazing online games
          </p>
          <motion.button
            className="cta-button"
            onClick={handleCreateRoomClick}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Create Room
          </motion.button>
        </motion.div>
      </section>

      {/* Games Section */}
      <section className="games-section" id="games-section">
        <div className="container">
          <h2 className="section-title">Available Games</h2>
          <p className="section-subtitle">Choose from our collection of exciting games</p>
          
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

      {showGameSelection && currentRoom && (
        <GameSelection
          room={currentRoom}
          onGameSelected={handleGameSelected}
          onClose={handleCloseModals}
        />
      )}

      {showRoomReady && currentRoom && selectedGameType && (
        <RoomReady
          room={currentRoom}
          gameType={selectedGameType}
          onClose={handleCloseModals}
        />
      )}
    </div>
  );
};

export default HomePage; 