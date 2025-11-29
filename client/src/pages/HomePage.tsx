import React, { useState, useEffect, useCallback, useRef, Dispatch, SetStateAction } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useSocket } from '../contexts/LazySocketContext';
import { useFriends } from '../contexts/FriendContext';
import GameCard from '../components/GameCard';
import CreateRoom from '../components/CreateRoom';
import JoinRoom from '../components/JoinRoom';
import BrowseRooms from '../components/BrowseRooms';
import RoomLobby from '../components/RoomLobby';
import RecentAchievements from '../components/RecentAchievements';
import { AdBanner, AdSidebar } from '../components/ads';
import './HomePage.css';
import { DEFAULT_GAME_ICON } from '../constants/assets';

interface Game {
  id: string;
  name: string;
  description: string;
  path: string;
  screenshot?: string;
  thumbnailUrl?: string;
  icon?: string;
}

interface RoomData {
  roomCode: string;
  playerName: string;
  isHost?: boolean;
  playerId?: string;
  gameType?: string;
  current_game?: string;
}

interface StoredSession {
  name: string;
  roomCode: string;
  playerId: string | null;
  isHost: boolean;
}

interface HomePageProps {
  setIsInLobby: Dispatch<SetStateAction<boolean>>;
  setLobbyLeaveFn: Dispatch<SetStateAction<(() => void) | null>>;
}

const HomePage: React.FC<HomePageProps> = ({ setIsInLobby, setLobbyLeaveFn }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const processedLinksRef = useRef<Set<string>>(new Set());
  const [isRecoveringSession, setIsRecoveringSession] = useState<boolean>(false);
  const { socket, connectSocket } = useSocket();
  const { updateLobbyInfo } = useFriends();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [gamesError, setGamesError] = useState<string | null>(null);
  const [showCreateRoom, setShowCreateRoom] = useState<boolean>(false);
  const [showJoinRoom, setShowJoinRoom] = useState<boolean>(false);
  const [showBrowseRooms, setShowBrowseRooms] = useState<boolean>(false);
  const [currentRoom, setCurrentRoom] = useState<RoomData | null>(null);
  const [playerName, setPlayerName] = useState<string>('');
  const [inLobby, setInLobby] = useState<boolean>(false);
  const [joinRoomCode, setJoinRoomCode] = useState<string>('');
  const [prefillName, setPrefillName] = useState<string>('');
  const [autoJoin, setAutoJoin] = useState<boolean>(false);
  const previewTrackRef = useRef<HTMLDivElement | null>(null);

  const fetchGames = useCallback(async (): Promise<void> => {
    setLoading(true);
    setGamesError(null);
    try {
      const response = await axios.get('/api/games');
      const gamesData = response.data.games || response.data;
      setGames(gamesData);
    } catch (error) {
      console.error('[HomePage] Error fetching games:', error);
      setGamesError('Failed to load games. Please try again.');
      setGames([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGames();
  }, [fetchGames]);

  // Smooth, seamless marquee for the hero preview track
  useEffect(() => {
    const track = previewTrackRef.current;
    if (!track || games.length === 0) return;

    const prefersReduced = typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      track.style.transform = 'translate3d(0, 0, 0)';
      return;
    }

    let start: number | null = null;
    let rafId: number;
    const speed = 45; // pixels per second

    const computeLoopWidth = (): number => {
      const width = track.scrollWidth / 2;
      return width > 0 ? width : track.getBoundingClientRect().width;
    };

    let loopWidth = computeLoopWidth();

    const step = (timestamp: number) => {
      if (start === null) start = timestamp;
      const elapsed = timestamp - start;
      const distance = (elapsed / 1000) * speed;

      if (distance >= loopWidth) {
        start = timestamp;
        track.style.transform = 'translate3d(0, 0, 0)';
      } else {
        track.style.transform = `translate3d(-${distance}px, 0, 0)`;
      }

      rafId = requestAnimationFrame(step);
    };

    const handleResize = () => {
      loopWidth = computeLoopWidth();
      start = null;
    };

    window.addEventListener('resize', handleResize);
    rafId = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      track.style.transform = '';
    };
  }, [games.length]);

  const getStoredSessionInfo = useCallback((): StoredSession => {
    const info: StoredSession = {
      name: sessionStorage.getItem('gamebuddies_playerName') || '',
      roomCode: sessionStorage.getItem('gamebuddies_roomCode') || '',
      playerId: sessionStorage.getItem('gamebuddies_playerId') || null,
      isHost: sessionStorage.getItem('gamebuddies_isHost') === 'true',
    };

    const raw = sessionStorage.getItem('gamebuddies:return-session');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        info.name = parsed.playerName || parsed.metadata?.name || parsed.gbPlayerName || info.name;
        info.roomCode = (
          parsed.roomCode ||
          parsed.gbRoomCode ||
          info.roomCode ||
          ''
        ).toUpperCase();
        info.playerId = parsed.playerId || parsed.metadata?.playerId || info.playerId;
        if (parsed.isHost !== undefined) {
          info.isHost = parsed.isHost === true || parsed.isHost === 'true';
        }
      } catch (err) {
        console.warn('[HomePage] Failed to parse stored return session data:', err);
      }
    }

    return info;
  }, []);

  useEffect(() => {
    if (inLobby || isRecoveringSession) return;

    const params = new URLSearchParams(location.search);
    if (
      params.has('join') ||
      params.has('invite') ||
      params.has('return') ||
      params.has('session')
    ) {
      return;
    }

    if (location.pathname.match(/^\/lobby\/[A-Za-z0-9-]+/i)) return;

    const storedSession = getStoredSessionInfo();
    if (storedSession.roomCode && storedSession.name) {
      const key = `auto-rejoin:${storedSession.roomCode}`;
      if (processedLinksRef.current.has(key)) return;
      processedLinksRef.current.add(key);

      setJoinRoomCode(storedSession.roomCode);
      setPrefillName(storedSession.name);
      setAutoJoin(true);
      setShowJoinRoom(true);
    }
  }, [inLobby, isRecoveringSession, location.search, location.pathname, getStoredSessionInfo]);

  const handleCreateRoomClick = useCallback((): void => {
    setShowCreateRoom(true);
  }, []);

  const handleJoinRoomClick = useCallback((): void => {
    setShowJoinRoom(true);
  }, []);

  const handleBrowseRoomsClick = useCallback((): void => {
    setShowBrowseRooms(true);
  }, []);

  const persistSessionMetadata = useCallback(
    (
      roomCode: string,
      name: string,
      isHost: boolean,
      playerId: string | null = null,
      sessionToken: string | null = null
    ): void => {
      if (!roomCode) return;

      const resolvedName = name || sessionStorage.getItem('gamebuddies_playerName') || '';
      const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';

      sessionStorage.setItem('gamebuddies_roomCode', roomCode);
      if (resolvedName) sessionStorage.setItem('gamebuddies_playerName', resolvedName);
      sessionStorage.setItem('gamebuddies_isHost', String(!!isHost));
      if (playerId) sessionStorage.setItem('gamebuddies_playerId', playerId);
      if (sessionToken) sessionStorage.setItem('gamebuddies_sessionToken', sessionToken);
      if (origin) sessionStorage.setItem('gamebuddies_returnUrl', `${origin}/lobby/${roomCode}`);

      const sessionRecord = {
        roomCode,
        playerName: resolvedName,
        playerId: playerId || sessionStorage.getItem('gamebuddies_playerId'),
        isHost: !!isHost,
        returnUrl: origin ? `${origin}/lobby/${roomCode}` : undefined,
        capturedAt: new Date().toISOString(),
        source: 'gamebuddies',
        sessionToken: sessionToken || undefined,
      };

      try {
        sessionStorage.setItem('gamebuddies:return-session', JSON.stringify(sessionRecord));
      } catch (err) {
        console.warn('[HomePage] Unable to persist return session metadata:', err);
      }
    },
    []
  );

  const handleLeaveLobby = useCallback((): void => {
    setInLobby(false);
    setCurrentRoom(null);
    setPlayerName('');
    setIsInLobby(false);
    setLobbyLeaveFn(null);
    sessionStorage.removeItem('gamebuddies_roomCode');
    sessionStorage.removeItem('gamebuddies_playerName');
    sessionStorage.removeItem('gamebuddies_isHost');
    sessionStorage.removeItem('gamebuddies_playerId');
    sessionStorage.removeItem('gamebuddies_sessionToken');
    sessionStorage.removeItem('gamebuddies_returnUrl');
    sessionStorage.removeItem('gamebuddies:return-session');
    updateLobbyInfo(null);
    navigate('/', { replace: true });
  }, [navigate, setIsInLobby, setLobbyLeaveFn, updateLobbyInfo]);

  const getGameDisplayName = useCallback(
    (gameId: string | undefined): string => {
      if (!gameId) return 'Game';
      const game = games.find((g) => g.id === gameId);
      return game ? game.name : gameId;
    },
    [games]
  );

  const handleRoomCreated = useCallback(
    (room: RoomData): void => {
      setCurrentRoom(room);
      setPlayerName(room.playerName);
      setShowCreateRoom(false);
      setInLobby(true);
      setIsInLobby(true);
      setLobbyLeaveFn(() => handleLeaveLobby);
      persistSessionMetadata(room.roomCode, room.playerName, room.isHost ?? true, room.playerId);

      const gameName = getGameDisplayName(room.gameType);
      updateLobbyInfo(room.roomCode, gameName);
    },
    [
      handleLeaveLobby,
      persistSessionMetadata,
      setIsInLobby,
      setLobbyLeaveFn,
      updateLobbyInfo,
      getGameDisplayName,
    ]
  );

  const handleJoinRoom = useCallback(
    (room: RoomData): void => {
      setCurrentRoom(room);
      setPlayerName(room.playerName);
      setShowJoinRoom(false);
      setInLobby(true);
      setIsInLobby(true);
      setLobbyLeaveFn(() => handleLeaveLobby);
      persistSessionMetadata(room.roomCode, room.playerName, room.isHost ?? false, room.playerId);
      setAutoJoin(false);

      const gameName = getGameDisplayName(room.gameType || room.current_game);
      updateLobbyInfo(room.roomCode, gameName);
    },
    [
      handleLeaveLobby,
      persistSessionMetadata,
      setIsInLobby,
      setLobbyLeaveFn,
      updateLobbyInfo,
      getGameDisplayName,
    ]
  );

  const handleCloseModals = useCallback((): void => {
    setShowCreateRoom(false);
    setShowJoinRoom(false);
    setShowBrowseRooms(false);
    setJoinRoomCode('');
    setPrefillName('');
    setAutoJoin(false);
  }, []);

  const handleRoomSelected = useCallback(
    (room: { roomCode: string }): void => {
      setShowBrowseRooms(false);
      setJoinRoomCode(room.roomCode);
      const { name: storedName } = getStoredSessionInfo();
      setPrefillName(storedName);
      setAutoJoin(Boolean(storedName));
      setShowJoinRoom(true);
    },
    [getStoredSessionInfo]
  );

  // Handle URL parameters for joining rooms
  useEffect(() => {
    if (inLobby) return;

    const params = new URLSearchParams(location.search);
    const joinCodeParam = params.get('join');
    if (!joinCodeParam) return;

    const normalizedCode = joinCodeParam.trim().toUpperCase();
    const nameParam = params.get('name') || params.get('player') || '';
    const { name: storedName } = getStoredSessionInfo();
    const effectiveName = nameParam || storedName;
    const key = `join:${normalizedCode}:${effectiveName}`;

    if (processedLinksRef.current.has(key)) return;

    setJoinRoomCode(normalizedCode);
    setPrefillName(effectiveName);
    setAutoJoin(Boolean(effectiveName));
    setShowJoinRoom(true);

    processedLinksRef.current.add(key);
  }, [location.search, inLobby, getStoredSessionInfo]);

  // Handle /lobby/:roomCode path
  useEffect(() => {
    const match = location.pathname.match(/^\/lobby\/([A-Za-z0-9-]+)/i);
    if (!match) return;

    const roomCode = match[1].toUpperCase();
    const params = new URLSearchParams(location.search);
    const nameParam = params.get('name') || params.get('player') || '';
    const { name: storedName } = getStoredSessionInfo();
    const effectiveName = nameParam || storedName;
    const key = `lobby:${roomCode}:${effectiveName}`;

    if (processedLinksRef.current.has(key) || inLobby || isRecoveringSession) return;

    setJoinRoomCode(roomCode);
    setPrefillName(effectiveName);
    setAutoJoin(Boolean(effectiveName));
    setShowJoinRoom(true);
    processedLinksRef.current.add(key);
  }, [
    location.pathname,
    location.search,
    inLobby,
    isRecoveringSession,
    getStoredSessionInfo,
  ]);

  return (
    <AnimatePresence mode="wait">
      {inLobby && currentRoom ? (
        <motion.div
          key="lobby"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
        >
          <RoomLobby
            roomCode={currentRoom.roomCode}
            playerName={playerName}
            isHost={currentRoom.isHost || false}
            onLeave={handleLeaveLobby}
          />
        </motion.div>
      ) : (
        <motion.div
            key="home"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
          >
            <div className="homepage">
              {/* Sticky Side Ads - Only visible on wide screens (1400px+) */}
              <AdSidebar position="left" />
              <AdSidebar position="right" />

              <div className="background-animation">
                <div className="floating-elements">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className={`floating-element element-${i + 1}`}></div>
                  ))}
                </div>
              </div>

              <section className="hero">
        <motion.div
          className="hero-content"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: 'easeOut' }}
        >
          <motion.h1
            className="hero-title"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            <span className="brand-text-white">Game</span><span className="brand-text">Buddies</span>
            <span className="brand-dot">.io</span>
          </motion.h1>

          <motion.p
            className="hero-subtitle"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
          >
            <span className="subtitle-highlight">Connect, Play, and Have Fun Together</span>
          </motion.p>

          <motion.div
            className="hero-buttons"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.7 }}
          >
            <motion.button
              className="btn btn-primary cta-button primary"
              onClick={handleCreateRoomClick}
              whileHover={{ scale: 1.05, y: -3 }}
              whileTap={{ scale: 0.95 }}
            >
              <span className="button-text">Create Room</span>
              <span className="button-icon" aria-hidden="true">🚀</span>
            </motion.button>
            <motion.button
              className="btn btn-secondary cta-button secondary"
              onClick={handleJoinRoomClick}
              whileHover={{ scale: 1.05, y: -3 }}
              whileTap={{ scale: 0.95 }}
            >
              <span className="button-text">Join Room</span>
              <span className="button-icon" aria-hidden="true">🎯</span>
            </motion.button>
            <motion.button
              className="btn btn-secondary cta-button secondary"
              onClick={handleBrowseRoomsClick}
              whileHover={{ scale: 1.05, y: -3 }}
              whileTap={{ scale: 0.95 }}
            >
              <span className="button-text">Browse Rooms</span>
              <span className="button-icon" aria-hidden="true">🌍</span>
            </motion.button>
          </motion.div>
          {!loading && games.length > 0 && (
            <motion.div
              className="hero-preview"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 1 }}
            >
              <div className="preview-track" ref={previewTrackRef}>
                {[...games, ...games].map((game, idx) => (
                  <div key={`${game.id}-${idx}`} className="preview-card">
                    <div className="preview-thumb">
                      {game.thumbnailUrl || game.screenshot ? (
                        <img src={game.thumbnailUrl || game.screenshot} alt={game.name} loading="lazy" />
                      ) : (
                        <span className="preview-icon" aria-hidden="true">{game.icon || 'ĐYZŠ'}</span>
                      )}
                    </div>
                    <div className="preview-info">
                      <span className="preview-name">{game.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </motion.div>
      </section>

      {/* Ad Banner - Between Hero and Games */}
      <div className="home-ad-section">
        <AdBanner />
      </div>

      <section className="games-section" id="games-section">
        <div className="container">
          <motion.div
            className="section-header"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="section-title">Quick Play Games</h2>
          </motion.div>

          {loading ? (
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <p className="loading-text">Loading awesome games...</p>
            </div>
          ) : gamesError ? (
            <div className="error-container" role="alert">
              <p className="error-message">{gamesError}</p>
              <button
                className="retry-button"
                onClick={fetchGames}
                aria-label="Retry loading games"
              >
                Try Again
              </button>
            </div>
          ) : games.length === 0 ? (
            <div className="empty-state" role="status">
              <p>No games available at the moment.</p>
            </div>
          ) : (
            <div className="games-grid">
              {games.map((game, index) => (
                <motion.div
                  key={game.id}
                  initial={{ opacity: 0, y: 50 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  viewport={{ once: true }}
                >
                  <GameCard game={game} />
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Ad Banner - After Games Section */}
      <div className="home-ad-section">
        <AdBanner />
      </div>

      {/* Recent Achievements Section - only shown for logged-in users */}
      <RecentAchievements maxDisplay={4} />

      <section className="cta-section">
        <div className="container">
          <motion.div
            className="cta-content"
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="cta-title">Ready to Start Gaming?</h2>
            <motion.button
              className="btn btn-primary btn-lg cta-button large"
              onClick={handleCreateRoomClick}
              whileHover={{ scale: 1.05, y: -3 }}
              whileTap={{ scale: 0.95 }}
            >
              <span className="button-text">Start Playing Now</span>
              <span className="button-icon" aria-hidden="true">
                <img src={DEFAULT_GAME_ICON} alt="" className="button-icon-image" />
              </span>
            </motion.button>
          </motion.div>
        </div>
      </section>

              {showCreateRoom && <CreateRoom onRoomCreated={handleRoomCreated} onCancel={handleCloseModals} />}

              {showJoinRoom && (
                <JoinRoom
                  initialRoomCode={joinRoomCode}
                  initialPlayerName={prefillName}
                  autoJoin={autoJoin}
                  onRoomJoined={handleJoinRoom}
                  onCancel={handleCloseModals}
                />
              )}

              {showBrowseRooms && (
                <BrowseRooms onRoomSelected={handleRoomSelected} onCancel={handleCloseModals} />
              )}
            </div>
          </motion.div>
      )}
    </AnimatePresence>
  );
};

export default HomePage;
