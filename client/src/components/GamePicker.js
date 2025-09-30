import React from 'react';
import { motion } from 'framer-motion';
import './GamePicker.css';

const GamePicker = ({ onGameSelect, isHost, disabled }) => {
  const availableGames = {
    'ddf': {
      name: 'Der dümmste fliegt',
      icon: '🎮',
      description: 'Quiz game where the worst player gets eliminated',
      maxPlayers: 8
    },
    'schooled': {
      name: 'School Quiz',
      icon: '🎓', 
      description: 'Educational quiz game for students',
      maxPlayers: 10
    },
    'susd': {
      name: 'SUS\'D',
      icon: '🔍',
      description: 'Imposter game - find who\'s acting suspicious!',
      maxPlayers: 10
    },
    'bingo': {
      name: 'Bingo Buddies',
      icon: '🎱',
      description: 'Fast-paced multiplayer bingo with custom cards and power-ups.',
      maxPlayers: 12
    },
    'cluescale': {
      name: 'ClueScale',
      icon: '🔎',
      description: 'A mystery-solving game where players follow clues to scale the challenge!',
      maxPlayers: 10
    }
  };

  if (!isHost) {
    return (
      <div className="game-picker">
        <div className="waiting-for-host">
          <h3>Waiting for Host</h3>
          <p>The host will select a game to play</p>
          <div className="loading-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="game-picker">
      <h3 className="picker-title">Select a Game</h3>
      <div className="games-grid">
        {Object.entries(availableGames).map(([gameType, game]) => (
          <motion.button
            key={gameType}
            className="game-option"
            onClick={() => onGameSelect(gameType)}
            disabled={disabled}
            whileHover={{ scale: disabled ? 1 : 1.05 }}
            whileTap={{ scale: disabled ? 1 : 0.95 }}
          >
            <div className="game-icon">{game.icon}</div>
            <h4 className="game-name">{game.name}</h4>
            <p className="game-description">{game.description}</p>
            <div className="game-meta">
              <span className="max-players">Max {game.maxPlayers} players</span>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
};

export default GamePicker; 