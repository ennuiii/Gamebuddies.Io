import React, { useState, useEffect } from 'react';
import { useSocket } from '../contexts/LazySocketContext';
import './BrowseRooms.css';

const BrowseRooms = ({ onRoomSelected, onCancel }) => {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedGame, setSelectedGame] = useState('all');
  const { socket, connectSocket } = useSocket();

  useEffect(() => {
    loadPublicRooms();

    // Refresh every 5 seconds
    const interval = setInterval(() => {
      loadPublicRooms();
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedGame]);

  const loadPublicRooms = async () => {
    try {
      const activeSocket = socket || connectSocket();

      if (!activeSocket) {
        setError('Failed to connect to server');
        setLoading(false);
        return;
      }

      // Request public rooms list
      activeSocket.emit('getPublicRooms', { gameType: selectedGame });

      // Listen for response
      const handleRoomsList = (data) => {
        setRooms(data.rooms || []);
        setLoading(false);
        setError('');
        activeSocket.off('publicRoomsList', handleRoomsList);
      };

      const handleError = (err) => {
        setError(err.message || 'Failed to load rooms');
        setLoading(false);
        activeSocket.off('error', handleError);
      };

      activeSocket.on('publicRoomsList', handleRoomsList);
      activeSocket.on('error', handleError);

    } catch (err) {
      setError('Failed to load rooms');
      setLoading(false);
    }
  };

  const handleJoinRoom = (roomCode) => {
    if (onRoomSelected) {
      onRoomSelected(roomCode);
    }
  };

  const getStatusBadge = (room) => {
    if (room.status === 'in_game') {
      return <span className="status-badge in-game">In Game</span>;
    }
    if (room.status === 'lobby') {
      return <span className="status-badge lobby">Waiting</span>;
    }
    return <span className="status-badge">{room.status}</span>;
  };

  const getPlayerCount = (room) => {
    const connectedPlayers = room.members?.filter(m => m.is_connected).length || 0;
    return `${connectedPlayers}/${room.max_players}`;
  };

  return (
    <div className="browse-rooms-overlay">
      <div className="browse-rooms-modal">
        <div className="browse-header">
          <h2>🌍 Browse Public Rooms</h2>
          <button className="close-button" onClick={onCancel}>×</button>
        </div>

        <div className="browse-filters">
          <label>
            Filter by Game:
            <select
              value={selectedGame}
              onChange={(e) => setSelectedGame(e.target.value)}
            >
              <option value="all">All Games</option>
              <option value="ddf">Der dümmste fliegt</option>
              <option value="schooled">Schooled</option>
              <option value="susd">SUS'D</option>
            </select>
          </label>
          <button className="refresh-button" onClick={loadPublicRooms}>
            🔄 Refresh
          </button>
        </div>

        {loading && (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading rooms...</p>
          </div>
        )}

        {error && (
          <div className="error-message">{error}</div>
        )}

        {!loading && !error && rooms.length === 0 && (
          <div className="empty-state">
            <p>😔 No public rooms available</p>
            <p className="empty-hint">Be the first to create a public room!</p>
          </div>
        )}

        {!loading && !error && rooms.length > 0 && (
          <div className="rooms-list">
            {rooms.map((room) => (
              <div key={room.id} className={`room-card ${room.status}`}>
                <div className="room-header">
                  <div className="room-info">
                    <h3 className="room-code">{room.room_code}</h3>
                    {getStatusBadge(room)}
                  </div>
                  <div className="room-game">
                    {room.current_game ? (
                      <span className="game-name">{room.current_game}</span>
                    ) : (
                      <span className="no-game">No game selected</span>
                    )}
                  </div>
                </div>

                <div className="room-details">
                  <div className="detail-item">
                    <span className="detail-icon">👤</span>
                    <span className="detail-text">
                      Host: {room.host?.display_name || room.host?.username || 'Unknown'}
                    </span>
                  </div>

                  <div className="detail-item">
                    <span className="detail-icon">👥</span>
                    <span className="detail-text">
                      Players: {getPlayerCount(room)}
                    </span>
                  </div>

                  {room.streamer_mode && (
                    <div className="detail-item">
                      <span className="detail-icon">🎥</span>
                      <span className="detail-text">Streamer Mode</span>
                    </div>
                  )}
                </div>

                <div className="room-actions">
                  <button
                    className="join-room-button"
                    onClick={() => handleJoinRoom(room.room_code)}
                    disabled={room.status === 'in_game'}
                  >
                    {room.status === 'in_game' ? 'Game in Progress' : 'Join Room'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="browse-footer">
          <button className="cancel-button" onClick={onCancel}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default BrowseRooms;
