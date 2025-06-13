import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import './GameSelection.css';

const GameSelection = ({ room, onGameSelected, onClose }) => {
  const [availableGames, setAvailableGames] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fetchingGames, setFetchingGames] = useState(true);

  useEffect(() => {
    fetchAvailableGames();
  }, []);

  const fetchAvailableGames = async () => {
    try {
      const response = await fetch('/api/games/available');
      if (!response.ok) {
        throw new Error('Failed to fetch games');
      }
      const games = await response.json();
      setAvailableGames(games);
    } catch (err) {
      setError('Failed to load available games');
    } finally {
      setFetchingGames(false);
    }
  };

  const handleGameSelect = async (gameType) => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/rooms/${room.roomCode}/select-game`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ gameType }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to select game');
      }

      const updatedRoom = await response.json();
      onGameSelected(updatedRoom, gameType);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(room.roomCode);
  };

  return (
    <motion.div
      className="game-selection-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="game-selection-modal"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="room-info">
          <h2 className="room-code-label">Room Code</h2>
          <div className="room-code-display">
            <span className="room-code">{room.roomCode}</span>
            <button 
              className="copy-button"
              onClick={copyRoomCode}
              title="Copy room code"
            >
              📋
            </button>
          </div>
          <p className="room-creator">Created by {room.creatorName}</p>
        </div>

        <div className="game-selection-content">
          <h3 className="select-game-title">Select a Game</h3>
          
          {fetchingGames ? (
            <div className="loading-container">
              <div className="loading-spinner"></div>
            </div>
          ) : error ? (
            <div className="error-message">{error}</div>
          ) : (
            <div className="games-grid">
              {Object.entries(availableGames).map(([key, game]) => (
                <motion.button
                  key={key}
                  className="game-option"
                  onClick={() => handleGameSelect(key)}
                  disabled={loading}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
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
          )}
        </div>

        <button
          className="close-button"
          onClick={onClose}
          disabled={loading}
        >
          Cancel
        </button>
      </motion.div>
    </motion.div>
  );
};

export default GameSelection; 