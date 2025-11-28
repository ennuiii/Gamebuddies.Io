import React, { useState, useEffect, useRef, MouseEvent, ChangeEvent } from 'react';
import { useSocket } from '../contexts/LazySocketContext';
import { SOCKET_EVENTS, SERVER_EVENTS } from '@shared/constants';
import './BrowseRooms.css';

interface Game {
  id: string;
  name: string;
  icon?: string;
  thumbnailUrl?: string;
}

interface UserInfo {
  display_name?: string;
  username?: string;
  premium_tier?: string;
  role?: string;
}

interface RoomMember {
  user_id: string;
  is_connected: boolean;
  custom_lobby_name?: string;
  user?: UserInfo;
}

interface Room {
  id: string;
  room_code: string;
  status: string;
  current_game: string;
  max_players: number;
  streamer_mode: boolean;
  host_id: string;
  host?: UserInfo;
  members?: RoomMember[];
}

interface HostInfo {
  name: string;
  premiumTier: string;
  role: string;
}

interface BrowseRoomsProps {
  onRoomSelected?: (data: { roomCode: string }) => void;
  onCancel?: () => void;
}

const BrowseRooms: React.FC<BrowseRoomsProps> = ({ onRoomSelected, onCancel }) => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [selectedGame, setSelectedGame] = useState<string>('all');
  const [games, setGames] = useState<Game[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { socket, connectSocket } = useSocket();

  const selectedGameInfo = games.find((g) => g.id === selectedGame);

  useEffect(() => {
    const handleClickOutside = (event: Event): void => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getGameInfo = (gameId: string): Game | undefined => {
    return games.find((g) => g.id === gameId);
  };

  const getHostInfo = (room: Room): HostInfo => {
    const hostMember = room.members?.find((m) => m.user_id === room.host_id);

    const name =
      hostMember?.custom_lobby_name ||
      hostMember?.user?.display_name ||
      hostMember?.user?.username ||
      room.host?.display_name ||
      room.host?.username ||
      'Unknown Host';
    const premiumTier = hostMember?.user?.premium_tier || room.host?.premium_tier || 'free';
    const role = hostMember?.user?.role || room.host?.role || 'user';

    return { name, premiumTier, role };
  };

  const getFilteredRooms = (): Room[] => {
    if (!searchQuery.trim()) return rooms;
    const query = searchQuery.toLowerCase();
    return rooms.filter((room) => {
      const hostInfo = getHostInfo(room);
      return (
        room.room_code.toLowerCase().includes(query) || hostInfo.name.toLowerCase().includes(query)
      );
    });
  };

  useEffect(() => {
    const fetchGames = async (): Promise<void> => {
      try {
        const response = await fetch('/api/games');
        const data = await response.json();
        if (data.success && data.games) {
          setGames(data.games);
        }
      } catch (err) {
        console.error('Failed to fetch games:', err);
      }
    };
    fetchGames();
  }, []);

  useEffect(() => {
    loadPublicRooms();

    const interval = setInterval(() => {
      loadPublicRooms();
    }, 5000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGame]);

  const loadPublicRooms = async (): Promise<void> => {
    try {
      const activeSocket = socket || connectSocket();

      if (!activeSocket) {
        setError('Failed to connect to server');
        setLoading(false);
        return;
      }

      activeSocket.emit(SOCKET_EVENTS.ROOM.GET_PUBLIC, { gameType: selectedGame });

      const handleRoomsList = (data: { rooms?: Room[] }): void => {
        console.log('🔍 [BROWSER DEBUG] Received rooms list:', data);
        if (data.rooms && data.rooms.length > 0) {
          console.log('🔍 [BROWSER DEBUG] First room host data:', {
            host: data.rooms[0].host,
            members: data.rooms[0].members,
          });
        }
        setRooms(data.rooms || []);
        setLoading(false);
        setError('');
        activeSocket.off(SERVER_EVENTS.ROOM.PUBLIC_LIST, handleRoomsList);
      };

      const handleError = (err: { message?: string }): void => {
        setError(err.message || 'Failed to load rooms');
        setLoading(false);
        activeSocket.off(SERVER_EVENTS.ERROR, handleError);
      };

      activeSocket.on(SERVER_EVENTS.ROOM.PUBLIC_LIST, handleRoomsList);
      activeSocket.on(SERVER_EVENTS.ERROR, handleError);
    } catch (err) {
      setError('Failed to load rooms');
      setLoading(false);
    }
  };

  const handleJoinRoom = (room: Room): void => {
    if (onRoomSelected) {
      onRoomSelected({ roomCode: room.room_code });
    }
  };

  const getStatusBadge = (room: Room): React.ReactElement => {
    if (room.status === 'in_game') {
      return <span className="status-badge in-game">In Game</span>;
    }
    if (room.status === 'lobby') {
      return <span className="status-badge lobby">Waiting</span>;
    }
    return <span className="status-badge">{room.status}</span>;
  };

  const getPlayerCount = (room: Room): string => {
    const connectedPlayers = room.members?.filter((m) => m.is_connected).length || 0;
    return `${connectedPlayers}/${room.max_players}`;
  };

  const getPremiumBadge = (premiumTier: string, role: string): React.ReactElement | null => {
    if (role === 'admin') {
      return (
        <span className="host-premium-badge lifetime" title="Administrator">
          💻
        </span>
      );
    }
    if (premiumTier === 'lifetime') {
      return (
        <span className="host-premium-badge lifetime" title="Lifetime Premium">
          ⭐
        </span>
      );
    }
    if (premiumTier === 'monthly') {
      return (
        <span className="host-premium-badge monthly" title="Pro Member">
          💎
        </span>
      );
    }
    return null;
  };

  return (
    <div className="browse-rooms-overlay">
      <div className="browse-rooms-modal">
        <div className="browse-header">
          <h2>🌍 Browse Public Rooms</h2>
          <button className="close-button" onClick={onCancel}>
            ×
          </button>
        </div>

        <div className="browse-filters">
          <input
            type="text"
            placeholder="🔍 Search room code or host..."
            value={searchQuery}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          <div className="game-filter-dropdown" ref={dropdownRef}>
            <button
              className="game-filter-trigger"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              type="button"
            >
              {selectedGame === 'all' ? (
                <span className="trigger-content">
                  <span className="dropdown-icon" aria-hidden="true">🎮</span>
                  <span>All Games</span>
                </span>
              ) : (
                <span className="trigger-content">
                  {selectedGameInfo?.thumbnailUrl ? (
                    <img
                      src={selectedGameInfo.thumbnailUrl}
                      alt=""
                      className="dropdown-thumbnail"
                    />
                  ) : (
                    <span className="dropdown-icon" aria-hidden="true">{selectedGameInfo?.icon || '🎮'}</span>
                  )}
                  <span>{selectedGameInfo?.name || 'Select Game'}</span>
                </span>
              )}
              <span className="dropdown-arrow" aria-hidden="true">{dropdownOpen ? '▲' : '▼'}</span>
            </button>
            {dropdownOpen && (
              <div className="game-filter-menu" role="listbox" aria-label="Select game filter">
                <div
                  className={`game-filter-option ${selectedGame === 'all' ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedGame('all');
                    setDropdownOpen(false);
                  }}
                  role="option"
                  aria-selected={selectedGame === 'all'}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setSelectedGame('all');
                      setDropdownOpen(false);
                    }
                  }}
                >
                  <span className="dropdown-icon" aria-hidden="true">🎮</span>
                  <span>All Games</span>
                </div>
                {games.map((game) => (
                  <div
                    key={game.id}
                    className={`game-filter-option ${selectedGame === game.id ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedGame(game.id);
                      setDropdownOpen(false);
                    }}
                    role="option"
                    aria-selected={selectedGame === game.id}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setSelectedGame(game.id);
                        setDropdownOpen(false);
                      }
                    }}
                  >
                    {game.thumbnailUrl ? (
                      <img src={game.thumbnailUrl} alt="" className="dropdown-thumbnail" />
                    ) : (
                      <span className="dropdown-icon" aria-hidden="true">{game.icon || '🎮'}</span>
                    )}
                    <span>{game.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button className="refresh-button" onClick={loadPublicRooms} aria-label="Refresh rooms list">
            <span aria-hidden="true">🔄</span>
          </button>
        </div>

        {loading && (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading rooms...</p>
          </div>
        )}

        {error && <div className="error-message">{error}</div>}

        {!loading && !error && rooms.length === 0 && (
          <div className="empty-state">
            <p>😔 No public rooms available</p>
            <p className="empty-hint">Be the first to create a public room!</p>
          </div>
        )}

        {!loading && !error && rooms.length > 0 && getFilteredRooms().length === 0 && (
          <div className="empty-state">
            <p>🔍 No rooms match your search</p>
            <p className="empty-hint">Try a different room code or host name</p>
          </div>
        )}

        {!loading && !error && getFilteredRooms().length > 0 && (
          <div className="rooms-list">
            {getFilteredRooms().map((room) => {
              const gameInfo = getGameInfo(room.current_game);
              return (
                <div key={room.id} className={`room-card ${room.status}`}>
                  <div className="room-card-header">
                    <div className="game-section">
                      {gameInfo?.thumbnailUrl ? (
                        <img
                          src={gameInfo.thumbnailUrl}
                          alt={gameInfo?.name || room.current_game}
                          className="game-thumbnail"
                        />
                      ) : (
                        <div className="game-icon-box">{gameInfo?.icon || '🎮'}</div>
                      )}
                      <div className="game-info">
                        <span className="game-title">
                          {gameInfo?.name || 'No Game Selected'}
                        </span>
                        <div className="room-meta">
                          <span className="room-code">{room.room_code}</span>
                          {getStatusBadge(room)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="room-details">
                    <div className="detail-item">
                      <span className="detail-icon">👤</span>
                      <span className="detail-text">
                        Host: {getHostInfo(room).name}{' '}
                        {getPremiumBadge(getHostInfo(room).premiumTier, getHostInfo(room).role)}
                      </span>
                    </div>

                    <div className="detail-item">
                      <span className="detail-icon">👥</span>
                      <span className="detail-text">Players: {getPlayerCount(room)}</span>
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
                      onClick={() => handleJoinRoom(room)}
                      disabled={room.status === 'in_game'}
                    >
                      {room.status === 'in_game' ? 'Game in Progress' : 'Join Room'}
                    </button>
                  </div>
                </div>
              );
            })}
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
