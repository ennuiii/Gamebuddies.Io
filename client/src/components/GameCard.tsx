import React, { useState, memo } from 'react';
import { motion } from 'framer-motion';
import './GameCard.css';

interface Game {
  id: string;
  name: string;
  description: string;
  path: string;
  screenshot?: string;
  thumbnailUrl?: string;
  icon?: string;
  available?: boolean;
}

interface GameCardProps {
  game: Game;
}

const GameCard: React.FC<GameCardProps> = memo(
  ({ game }) => {
    const [imageError, setImageError] = useState<boolean>(false);

    const hasImage = game.screenshot || game.thumbnailUrl;

    const handleImageError = (): void => {
      setImageError(true);
    };

    return (
      <a href={game.path} className="game-card-link">
        <motion.div className="game-card card" whileHover={{ y: -10 }} transition={{ duration: 0.3 }}>
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
              <div className="btn btn-primary play-button">PLAY NOW</div>
            </div>
          </div>

          <div className="game-card-content">
            <h3 className="game-card-title">{game.name}</h3>
            <p className="game-card-description">{game.description}</p>

            <div className="game-card-footer">
              <div className="btn btn-secondary play-button-small">
                <span aria-hidden="true">🎮</span> Play
              </div>
            </div>
          </div>
        </motion.div>
      </a>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.game.id === nextProps.game.id && prevProps.game.available === nextProps.game.available
    );
  }
);

export default GameCard;
