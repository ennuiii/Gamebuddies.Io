import React from 'react';
import { motion } from 'framer-motion';
import './GameCard.css';

const GameCard = ({ game }) => {
  const handlePlayGame = () => {
    // Open game in same window
    window.location.href = game.path;
  };

  return (
    <motion.div 
      className="game-card"
      whileHover={{ y: -10 }}
      transition={{ duration: 0.3 }}
    >
      <div className="game-card-image-container">
        <img 
          src={game.screenshot} 
          alt={game.name} 
          className="game-card-image"
          onError={(e) => {
            e.target.src = 'https://via.placeholder.com/400x225/16213e/ffffff?text=' + encodeURIComponent(game.name);
          }}
        />
        <div className="game-card-overlay">
          <motion.button 
            className="play-button"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={handlePlayGame}
          >
            PLAY NOW
          </motion.button>
        </div>
      </div>
      
      <div className="game-card-content">
        <h3 className="game-card-title">{game.name}</h3>
        <p className="game-card-description">{game.description}</p>
        
        <div className="game-card-footer">
          <span className={`game-status ${game.available ? 'available' : 'coming-soon'}`}>
            {game.available ? 'Available' : 'Coming Soon'}
          </span>
          <motion.button 
            className="play-button-small"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handlePlayGame}
          >
            Play
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
};

export default GameCard; 