import React, { useState } from 'react';
import { motion } from 'framer-motion';
import './GameCard.css';

const GameCard = ({ game }) => {
  const [imageError, setImageError] = useState(false);
  const [hasTriedFallback, setHasTriedFallback] = useState(false);

  const handleImageError = (e) => {
    if (!hasTriedFallback) {
      // Try a different fallback first
      setHasTriedFallback(true);
      e.target.src = `data:image/svg+xml;base64,${btoa(`
        <svg width="400" height="225" xmlns="http://www.w3.org/2000/svg">
          <rect width="400" height="225" fill="#16213e"/>
          <text x="200" y="112" font-family="Arial, sans-serif" font-size="18" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">
            ${game.name}
          </text>
        </svg>
      `)}`;
    } else {
      // If even the SVG fails, hide the image and show placeholder
      setImageError(true);
    }
  };

  // The entire card is now a link to the game path (e.g., "/ddf" or "/schooled")
  return (
    <a href={game.path} className="game-card-link">
      <motion.div
        className="game-card"
        whileHover={{ y: -10 }}
        transition={{ duration: 0.3 }}
      >
        <div className="game-card-image-container">
          {!imageError ? (
            <img
              src={game.screenshot}
              alt={game.name}
              className="game-card-image"
              onError={handleImageError}
            />
          ) : (
            <div className="game-card-placeholder">
              <div className="placeholder-icon">🎮</div>
              <div className="placeholder-text">{game.name}</div>
            </div>
          )}
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