import React from 'react';
import { motion } from 'framer-motion';
import './GameCard.css';

const GameCard = ({ game }) => {
  // The entire card is now a link to the game path (e.g., "/ddf" or "/schooled")
  return (
    <a href={game.path} className="game-card-link">
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
            <div className="play-button">
              PLAY NOW
            </div>
          </div>
        </div>

        <div className="game-card-content">
          <h3 className="game-card-title">{game.name}</h3>
          <p className="game-card-description">{game.description}</p>

          <div className="game-card-footer">
            <span className={`game-status ${game.available ? 'available' : 'coming-soon'}`}>
              {game.available ? 'Available' : 'Coming Soon'}
            </span>
            {/* The button is now just for show, as the whole card is a link */}
            <div className="play-button-small">
              Play
            </div>
          </div>
        </div>
      </motion.div>
    </a>
  );
};

export default GameCard;