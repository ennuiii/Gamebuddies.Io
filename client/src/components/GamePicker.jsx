import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import './GamePicker.css';

const GamePicker = ({ onGameSelect, isHost, disabled }) => {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch games from API on component mount
  useEffect(() => {
    const fetchGames = async () => {
      try {
        console.log('[GamePicker] 🎮 Fetching games from /api/games...');
        const response = await fetch('/api/games');
        console.log('[GamePicker] 📡 Response status:', response.status);

        const data = await response.json();
        console.log('[GamePicker] 📦 API response:', data);

        if (data.success && data.games) {
          console.log('[GamePicker] ✅ Successfully loaded', data.games.length, 'games');
          console.log('[GamePicker] 🎯 Game IDs:', data.games.map(g => g.id));
          setGames(data.games);
        } else {
          console.error('[GamePicker] ❌ Invalid response format:', data);
          throw new Error('Failed to load games');
        }
      } catch (err) {
        console.error('[GamePicker] ❌ Error loading games:', err);
        console.error('[GamePicker] 📋 Error details:', err.message);
        setError('Failed to load games. Please refresh the page.');

        // Fallback to hardcoded games for backwards compatibility
        setGames([
          {
            id: 'ddf',
            name: 'Der dümmste fliegt',
            icon: '🎮',
            description: 'Quiz game where the worst player gets eliminated',
            maxPlayers: 8
          },
          {
            id: 'schooled',
            name: 'Schooled!',
            icon: '🎓',
            description: 'Educational quiz game for students',
            maxPlayers: 10
          },
          {
            id: 'susd',
            name: 'SUS\'D',
            icon: '🔍',
            description: 'Imposter game - find who\'s acting suspicious!',
            maxPlayers: 10
          },
          {
            id: 'bingo',
            name: 'Bingo Buddies',
            icon: '🎱',
            description: 'Fast-paced multiplayer bingo with custom cards and power-ups.',
            maxPlayers: 12
          },
          {
            id: 'cluescale',
            name: 'ClueScale',
            icon: '🔎',
            description: 'A mystery-solving game where players follow clues to scale the challenge!',
            maxPlayers: 10
          }
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchGames();
  }, []);

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

  // Show loading state
  if (loading) {
    return (
      <div className="game-picker">
        <h3 className="picker-title">Loading Games...</h3>
        <div className="loading-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    );
  }

  // Debug log when rendering
  console.log('[GamePicker] 🎨 Rendering with', games.length, 'games:', games.map(g => ({id: g.id, name: g.name})));

  return (
    <div className="game-picker">
      {error && (
        <div className="error-message" style={{
          color: '#ff6b6b',
          marginBottom: '1rem',
          padding: '0.5rem',
          background: 'rgba(255, 107, 107, 0.1)',
          borderRadius: '4px'
        }}>
          {error}
        </div>
      )}
      <h3 className="picker-title">Select a Game</h3>
      <div className="games-grid">
        {games.map((game) => {
          console.log('[GamePicker] 🎮 Rendering game:', game.id, game.name);
          return (
          <motion.button
            key={game.id}
            className="game-option"
            onClick={() => onGameSelect(game.id)}
            disabled={disabled}
            whileHover={{ scale: disabled ? 1 : 1.05 }}
            whileTap={{ scale: disabled ? 1 : 0.95 }}
          >
            <div className="game-icon">
              {game.thumbnailUrl ? (
                <img
                  src={game.thumbnailUrl}
                  alt={game.name}
                />
              ) : (
                game.icon || '🎮'
              )}
            </div>
            <h4 className="game-name">{game.name}</h4>
            <p className="game-description">{game.description}</p>
            <div className="game-meta">
              <span className="max-players">
                {(game.min_players || 2)}-{game.max_players || game.maxPlayers} Players
              </span>
            </div>
          </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default GamePicker; 
