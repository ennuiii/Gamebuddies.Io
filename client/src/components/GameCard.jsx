import React, { useState } from 'react';
import { motion } from 'framer-motion';
import './GameCard.css';

const GameCard = React.memo(({ game }) => {
  const [imageError, setImageError] = useState(false);

  // Check if there's a screenshot/thumbnail URL
  const hasImage = game.screenshot || game.thumbnailUrl;

  const handleImageError = () => {
    setImageError(true);
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
          {hasImage && !imageError ? (
            <img
              src={game.screenshot || game.thumbnailUrl}
              alt={game.name}
              className="game-card-image"
              onError={handleImageError}
            />
          ) : (
            <div className="game-card-placeholder">
              <div className="placeholder-icon">{game.icon || '🎮'}</div>
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
            {/* The button is now just for show, as the whole card is a link */}
            <div className="play-button-small">
              Play
            </div>
          </div>
        </div>
      </motion.div>
    </a>
  );
}, (prevProps, nextProps) => {
  // Only re-render if game id or availability changes
  return prevProps.game.id === nextProps.game.id &&
         prevProps.game.available === nextProps.game.available;
});

export default GameCard;
