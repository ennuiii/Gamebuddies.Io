import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import './RoomReady.css';

const RoomReady = ({ room, gameType, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(5);

  const game = {
    'schoolquiz': {
      name: 'School Quiz Game',
      icon: '🎓',
      path: '/schooled'
    },
    'ddf': {
      name: 'Der dümmste fliegt',
      icon: '🎮',
      path: '/ddf'
    },
    'susd': {
      name: 'SUS\'D',
      icon: '🔍',
      path: '/susd'
    },
    'bingo': {
      name: 'Bingo Buddies',
      icon: '🎱',
      path: '/bingo'
    }
  }[gameType];
  const resolvedGame = game || {
    name: gameType || 'GameBuddies Game',
    icon: '🎮',
    path: `/${gameType || ''}`
  };


  // Redirect to game after countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          // Redirect to game with room code
          const gameUrl = `${resolvedGame.path}?room=${room.roomCode}`;
          window.location.href = gameUrl;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [room.roomCode, resolvedGame.path]);

  const copyInviteLink = () => {
    const gameUrl = `${window.location.origin}${resolvedGame.path}?room=${room.roomCode}`;
    navigator.clipboard.writeText(gameUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(room.roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const joinNow = () => {
    const gameUrl = `${resolvedGame.path}?room=${room.roomCode}`;
    window.location.href = gameUrl;
  };

  return (
    <motion.div
      className="room-ready-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="room-ready-modal"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="success-icon">✓</div>
        
        <h2 className="room-ready-title">Room Ready!</h2>
        
        <div className="room-details">
          <div className="game-info">
            <span className="game-icon">{resolvedGame.icon}</span>
            <span className="game-name">{resolvedGame.name}</span>
          </div>
          
          <div className="room-code-section">
            <p className="room-code-label">Room Code</p>
            <div className="room-code-display">
              <span className="room-code">{room.roomCode}</span>
              <button 
                className="copy-button"
                onClick={copyRoomCode}
                title="Copy room code"
              >
                {copied ? '✓' : '📋'}
              </button>
            </div>
          </div>

          <div className="share-section">
            <p className="share-label">Share with friends</p>
            <button 
              className="share-link-button"
              onClick={copyInviteLink}
            >
              {copied ? 'Link Copied!' : 'Copy Invite Link'}
            </button>
          </div>

          <div className="countdown-section">
            <p className="countdown-text">
              Redirecting to game in {countdown} seconds...
            </p>
            <div className="countdown-bar">
              <motion.div 
                className="countdown-progress"
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: 5, ease: 'linear' }}
              />
            </div>
          </div>
        </div>

        <div className="action-buttons">
          <button
            className="cancel-button"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="join-button"
            onClick={joinNow}
          >
            Join Now
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default RoomReady; 
