import React, { useState } from 'react';
import { motion } from 'framer-motion';
import './JoinRoom.css';

const JoinRoom = ({ initialRoomCode = '', onJoinRoom, onClose }) => {
  const [roomCode, setRoomCode] = useState(initialRoomCode.toUpperCase());
  const [playerName, setPlayerName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!roomCode.trim()) {
      setError('Please enter a room code');
      return;
    }
    
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }

    // Check if room exists
    try {
      const response = await fetch(`/api/rooms/${roomCode.toUpperCase()}`);
      if (!response.ok) {
        setError('Room not found');
        return;
      }
      
      const room = await response.json();
      onJoinRoom(room.roomCode, playerName.trim());
    } catch (err) {
      setError('Failed to join room');
    }
  };

  const handleRoomCodeChange = (e) => {
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    setRoomCode(value);
    setError('');
  };

  return (
    <motion.div
      className="join-room-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="join-room-modal"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="join-room-title">Join Game Room</h2>
        
        <form onSubmit={handleSubmit} className="join-room-form">
          <div className="form-group">
            <label htmlFor="roomCode">Room Code</label>
            <input
              type="text"
              id="roomCode"
              value={roomCode}
              onChange={handleRoomCodeChange}
              placeholder="Enter 6-digit code"
              maxLength={6}
              autoFocus
              className="room-code-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="playerName">Your Name</label>
            <input
              type="text"
              id="playerName"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your name"
              maxLength={20}
            />
          </div>

          {error && (
            <div className="error-message">{error}</div>
          )}

          <div className="form-actions">
            <button
              type="button"
              onClick={onClose}
              className="cancel-button"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="join-button"
            >
              Join Room
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};

export default JoinRoom; 