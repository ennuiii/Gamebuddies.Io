import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useSocket } from '../contexts/LazySocketContext';
import GameCard from '../components/GameCard';
import CreateRoom from '../components/CreateRoom';
import JoinRoom from '../components/JoinRoom';
import RoomLobby from '../components/RoomLobby';
import './HomePage.css';

const HomePage = ({ setIsInLobby, setLobbyLeaveFn }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const processedLinksRef = useRef(new Set());
  const [isRecoveringSession, setIsRecoveringSession] = useState(false);
  const { socket, connectSocket } = useSocket();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [showJoinRoom, setShowJoinRoom] = useState(false);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [inLobby, setInLobby] = useState(false);
  const [joinRoomCode, setJoinRoomCode] = useState('');
  const [prefillName, setPrefillName] = useState('');
  const [autoJoin, setAutoJoin] = useState(false);

  const fetchGames = useCallback(async () => {
    try {
      const response = await axios.get('/api/games');
      setGames(response.data);
    } catch (error) {
      console.error('Error fetching games:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGames();
  }, [fetchGames]);

  const handleCreateRoomClick = useCallback(() => {
    setShowCreateRoom(true);
  }, []);

  const handleJoinRoomClick = useCallback(() => {
    setShowJoinRoom(true);
  }, []);

  const getStoredSessionInfo = useCallback(() => {
    const info = {
      name: sessionStorage.getItem('gamebuddies_playerName') || '',
      roomCode: sessionStorage.getItem('gamebuddies_roomCode') || '',
      playerId: sessionStorage.getItem('gamebuddies_playerId') || null,
      isHost: (sessionStorage.getItem('gamebuddies_isHost') || '') === 'true'
    };

    const raw = sessionStorage.getItem('gamebuddies:return-session');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        info.name = parsed.playerName || parsed.metadata?.name || parsed.gbPlayerName || info.name;
        info.roomCode = (parsed.roomCode || parsed.gbRoomCode || info.roomCode || '').toUpperCase();
        info.playerId = parsed.playerId || parsed.metadata?.playerId || info.playerId;
        const parsedHost = parsed.isHost;
        const parsedGbHost = parsed.gbIsHost;
        if (parsedHost !== undefined) {
          info.isHost = parsedHost === true || parsedHost === 'true';
        } else if (parsedGbHost !== undefined) {
          info.isHost = parsedGbHost === true || parsedGbHost === 'true';
        }
      } catch (err) {
        console.warn('[HomePage] Failed to parse stored return session data:', err);
      }
    }

    return info;
  }, []);

  const persistSessionMetadata = useCallback((roomCode, name, isHost, playerId = null, sessionToken = null) => {
    if (!roomCode) {
      return;
    }

    const resolvedName = name || sessionStorage.getItem('gamebuddies_playerName') || '';
    const origin = (typeof window !== 'undefined' && window.location) ? window.location.origin : '';

    sessionStorage.setItem('gamebuddies_roomCode', roomCode);
    if (resolvedName) {
      sessionStorage.setItem('gamebuddies_playerName', resolvedName);
    }
    sessionStorage.setItem('gamebuddies_isHost', String(!!isHost));
    if (playerId) {
      sessionStorage.setItem('gamebuddies_playerId', playerId);
    }
    if (sessionToken) {
      sessionStorage.setItem('gamebuddies_sessionToken', sessionToken);
    }
    if (origin) {
      sessionStorage.setItem('gamebuddies_returnUrl', `${origin}/lobby/${roomCode}`);
    }

    const existingPlayerId = sessionStorage.getItem('gamebuddies_playerId') || null;
    const sessionRecord = {
      roomCode,
      playerName: resolvedName,
      playerId: playerId || existingPlayerId,
      isHost: !!isHost,
      returnUrl: origin ? `${origin}/lobby/${roomCode}` : undefined,
      capturedAt: new Date().toISOString(),
      source: 'gamebuddies'
    };

    if (sessionToken) {
      sessionRecord.sessionToken = sessionToken;
    }

    try {
      sessionStorage.setItem('gamebuddies:return-session', JSON.stringify(sessionRecord));
    } catch (err) {
      console.warn('[HomePage] Unable to persist return session metadata:', err);
    }
  }, []);

  const handleLeaveLobby = useCallback(() => {
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
    navigate('/', { replace: true });
  }, [navigate, setIsInLobby, setLobbyLeaveFn]);

  const handleRoomCreated = useCallback((room) => {
    setCurrentRoom(room);
    setPlayerName(room.playerName);
    setShowCreateRoom(false);
    setInLobby(true);
    setIsInLobby(true);
    setLobbyLeaveFn(() => handleLeaveLobby);
    persistSessionMetadata(room.roomCode, room.playerName, room.isHost ?? true, room.playerId ?? null);
  }, [handleLeaveLobby, persistSessionMetadata, setIsInLobby, setLobbyLeaveFn]);

  const handleJoinRoom = useCallback((room) => {
    // The actual room data will be fetched in RoomLobby
    setCurrentRoom(room);
    setPlayerName(room.playerName);
    setShowJoinRoom(false);
    setInLobby(true);
    setIsInLobby(true);
    setLobbyLeaveFn(() => handleLeaveLobby);
    persistSessionMetadata(room.roomCode, room.playerName, room.isHost, room.playerId ?? null);
    setAutoJoin(false);
  }, [handleLeaveLobby, persistSessionMetadata, setIsInLobby, setLobbyLeaveFn]);

  const handleCloseModals = useCallback(() => {
    setShowCreateRoom(false);
    setShowJoinRoom(false);
    setJoinRoomCode('');
    setPrefillName('');
    setAutoJoin(false);
  }, []);

  const handleSessionRecovery = useCallback(async (roomCode, sessionToken, nameHint = '') => {
    if (!sessionToken) {
      return false;
    }

    setIsRecoveringSession(true);

    try {
      const activeSocket = socket || connectSocket();
      const socketId = activeSocket && activeSocket.id ? activeSocket.id : undefined;

      const response = await fetch('/api/v2/game/sessions/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionToken,
          socketId
        })
      });

      if (!response.ok) {
        throw new Error('Session recovery request failed');
      }

      const data = await response.json();
      const playerState = data.playerState || {};
      const recoveredName =
        nameHint ||
        playerState?.user?.display_name ||
        playerState?.user?.username ||
        playerState?.display_name ||
        playerState?.username ||
        'Player';

      const recoveredRoomCode = (data.roomCode || roomCode || '').toUpperCase();
      const playerId = data.playerId || playerState?.user_id || playerState?.id || null;
      const isHost = playerState?.role === 'host';

      setCurrentRoom({
        roomCode: recoveredRoomCode,
        playerName: recoveredName,
        isHost: !!isHost
      });
      setPlayerName(recoveredName);
      setShowJoinRoom(false);
      setInLobby(true);
      setIsInLobby(true);
      setAutoJoin(false);
      setPrefillName(recoveredName);
      setLobbyLeaveFn(() => handleLeaveLobby);

      persistSessionMetadata(recoveredRoomCode, recoveredName, isHost, playerId, sessionToken);

      return true;
    } catch (error) {
      console.error('[HomePage] Session recovery failed:', error);
      setShowJoinRoom(true);
      setJoinRoomCode(roomCode);
      const { name: storedName } = getStoredSessionInfo();
      const fallbackName = nameHint || storedName;
      setPrefillName(fallbackName);
      setAutoJoin(Boolean(fallbackName));
      return false;
    } finally {
      setIsRecoveringSession(false);
    }
  }, [socket, connectSocket, handleLeaveLobby, persistSessionMetadata, setIsInLobby, setLobbyLeaveFn, getStoredSessionInfo]);


  // Handle invite token parameter
  useEffect(() => {
    if (inLobby) {
      return;
    }

    const params = new URLSearchParams(location.search);
    const inviteToken = params.get('invite');
    if (!inviteToken) {
      return;
    }

    const key = `invite:${inviteToken}`;
    if (processedLinksRef.current.has(key)) {
      return;
    }

    console.log('[HomePage] Found invite parameter:', inviteToken);

    // Resolve invite token to room code
    (async () => {
      try {
        const response = await fetch('/api/invites/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inviteToken })
        });

        if (!response.ok) {
          const error = await response.json();
          alert(`Invite error: ${error.error || 'Invalid or expired invite'}`);
          return;
        }

        const { roomCode } = await response.json();

        const { name: storedName } = getStoredSessionInfo();
        setJoinRoomCode(roomCode);
        setPrefillName(storedName);
        setAutoJoin(Boolean(storedName));
        setShowJoinRoom(true);

        processedLinksRef.current.add(key);

        // Clean up URL by removing invite param
        const url = new URL(window.location.href);
        url.searchParams.delete('invite');
        window.history.replaceState({}, '', url.toString());

      } catch (error) {
        console.error('[HomePage] Failed to resolve invite:', error);
        alert('Failed to resolve invite link. Please try again.');
      }
    })();
  }, [location.search, inLobby, getStoredSessionInfo]);

  // Handle return from external game with session token
  useEffect(() => {
    if (inLobby) {
      return;
    }

    const params = new URLSearchParams(location.search);
    const returnSession = params.get('return');
    if (!returnSession) {
      return;
    }

    const key = `return:${returnSession}`;
    if (processedLinksRef.current.has(key)) {
      return;
    }

    console.log('[HomePage] Found return session parameter:', returnSession.substring(0, 8) + '...');

    // Resolve session token to room code
    (async () => {
      try {
        const response = await fetch(`/api/game-sessions/${returnSession}`);

        if (!response.ok) {
          const error = await response.json();
          alert(`Return session error: ${error.error || 'Invalid or expired session'}`);
          return;
        }

        const { roomCode, streamerMode } = await response.json();

        console.log('[HomePage] Session resolved to room:', roomCode);

        const { name: storedName } = getStoredSessionInfo();
        setJoinRoomCode(roomCode);
        setPrefillName(storedName);
        setAutoJoin(Boolean(storedName));
        setShowJoinRoom(true);

        processedLinksRef.current.add(key);

        // Clean up URL by removing return param
        const url = new URL(window.location.href);
        url.searchParams.delete('return');
        window.history.replaceState({}, '', url.toString());

      } catch (error) {
        console.error('[HomePage] Failed to resolve return session:', error);
        alert('Failed to return to room. Session may have expired.');
      }
    })();
  }, [location.search, inLobby, getStoredSessionInfo]);

  useEffect(() => {
    if (inLobby) {
      return;
    }

    const params = new URLSearchParams(location.search);
    const joinCodeParam = params.get('join');
    if (!joinCodeParam) {
      return;
    }

    const normalizedCode = joinCodeParam.trim().toUpperCase();
    const nameParam = params.get('name') || params.get('player') || '';
    const { name: storedName } = getStoredSessionInfo();
    const effectiveName = nameParam || storedName;
    const key = `join:${normalizedCode}:${effectiveName}`;

    if (processedLinksRef.current.has(key)) {
      return;
    }

    console.log('[HomePage] Found join parameter:', normalizedCode);

    setJoinRoomCode(normalizedCode);
    setPrefillName(effectiveName);
    setAutoJoin(Boolean(effectiveName));
    setShowJoinRoom(true);

    processedLinksRef.current.add(key);
  }, [location.search, inLobby, getStoredSessionInfo]);

  // Handle session-only URLs (streamer mode): /lobby?session=xxx
  useEffect(() => {
    // Only handle if we're at /lobby without a room code in the path
    if (location.pathname !== '/lobby' && location.pathname !== '/lobby/') {
      return;
    }

    if (inLobby || isRecoveringSession) {
      return;
    }

    const params = new URLSearchParams(location.search);
    const sessionToken = params.get('session');

    if (!sessionToken) {
      return;
    }

    const key = `lobby-session-only:${sessionToken}`;
    if (processedLinksRef.current.has(key)) {
      return;
    }

    console.log('[HomePage] 🎫 Found session-only URL (streamer mode):', sessionToken.substring(0, 20) + '...');

    // Resolve session without knowing the room code
    (async () => {
      try {
        const nameParam = params.get('name') || params.get('player') || '';
        const response = await fetch(`/api/game-sessions/${sessionToken}`);

        if (!response.ok) {
          throw new Error('Session resolution failed');
        }

        const { roomCode, playerId, playerName, metadata } = await response.json();
        const effectiveName = playerName || metadata?.player_name || nameParam;

        console.log('[HomePage] ✅ Session resolved to room:', roomCode, 'player:', effectiveName);

        // Join the lobby with the resolved room code and player name
        setJoinRoomCode(roomCode);
        setPrefillName(effectiveName);
        setAutoJoin(Boolean(effectiveName));
        setShowJoinRoom(true);

        processedLinksRef.current.add(key);

        // Clean up URL
        const url = new URL(window.location.href);
        url.searchParams.delete('session');
        window.history.replaceState({}, '', url.toString());
      } catch (error) {
        console.error('[HomePage] Session resolution failed:', error);
        alert('Failed to return to room. Session may have expired.');
      }
    })();
  }, [location.pathname, location.search, inLobby, isRecoveringSession, handleSessionRecovery]);

  useEffect(() => {
    const match = location.pathname.match(/^\/lobby\/([A-Za-z0-9-]+)/i);
    if (!match) {
      return;
    }

    const roomCode = match[1].toUpperCase();
    const params = new URLSearchParams(location.search);
    const sessionToken = params.get('session');
    const nameParam = params.get('name') || params.get('player') || '';
    const { name: storedName } = getStoredSessionInfo();
    const effectiveName = nameParam || storedName;
    const key = `lobby:${roomCode}:${sessionToken || effectiveName}`;

    if (processedLinksRef.current.has(key) || inLobby || isRecoveringSession) {
      return;
    }

    if (sessionToken) {
      (async () => {
        const success = await handleSessionRecovery(roomCode, sessionToken, nameParam);
        processedLinksRef.current.add(key);
        if (success && params.has('session')) {
          const url = new URL(window.location.href);
          url.searchParams.delete('session');
          window.history.replaceState({}, '', url.toString());
        }
      })();
    } else {
      setJoinRoomCode(roomCode);
      setPrefillName(effectiveName);
      setAutoJoin(Boolean(effectiveName));
      setShowJoinRoom(true);
      processedLinksRef.current.add(key);
    }
  }, [location.pathname, location.search, inLobby, isRecoveringSession, handleSessionRecovery, getStoredSessionInfo]);

  // If in lobby, show the lobby component
  if (inLobby && currentRoom) {
    return (
      <RoomLobby 
        roomCode={currentRoom.roomCode}
        playerName={playerName}
        isHost={currentRoom.isHost}
        onLeave={handleLeaveLobby}
      />
    );
  }

  return (
    <div className="homepage">
      {/* Animated Background */}
      <div className="background-animation">
        <div className="floating-elements">
          {[...Array(15)].map((_, i) => (
            <div key={i} className={`floating-element element-${i + 1}`}></div>
          ))}
        </div>
      </div>

      {/* Hero Section */}
      <section className="hero">
        <motion.div 
          className="hero-content"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: "easeOut" }}
        >
          <motion.div
            className="hero-badge"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <span className="badge-text">🎮 Now Live</span>
          </motion.div>
          
          <motion.h1 
            className="hero-title"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            <span className="brand-text">GameBuddies</span>
            <span className="brand-dot">.io</span>
          </motion.h1>
          
          <motion.p 
            className="hero-subtitle"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
          >
            The ultimate multiplayer gaming platform
            <br />
            <span className="subtitle-highlight">Connect, Play, and Dominate Together</span>
          </motion.p>
          
          <motion.div 
            className="hero-buttons"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.7 }}
          >
            <motion.button
              className="cta-button primary"
              onClick={handleCreateRoomClick}
              whileHover={{ scale: 1.05, y: -3 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <span className="button-text">Create Room</span>
              <span className="button-icon">🚀</span>
            </motion.button>
            <motion.button
              className="cta-button secondary"
              onClick={handleJoinRoomClick}
              whileHover={{ scale: 1.05, y: -3 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <span className="button-text">Join Room</span>
              <span className="button-icon">🎯</span>
            </motion.button>
          </motion.div>
        </motion.div>
      </section>

      {/* Games Section */}
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
            <p className="section-subtitle">Jump into these popular games instantly</p>
          </motion.div>
          
          {loading ? (
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <p className="loading-text">Loading awesome games...</p>
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

      {/* Call to Action Section */}
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
            <p className="cta-subtitle">Join thousands of players already having fun on GameBuddies.io</p>
            <motion.button
              className="cta-button large"
              onClick={handleCreateRoomClick}
              whileHover={{ scale: 1.05, y: -3 }}
              whileTap={{ scale: 0.95 }}
            >
              <span className="button-text">Start Playing Now</span>
              <span className="button-icon">🎮</span>
            </motion.button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-brand">
              <h3 className="footer-title">
                <span className="brand-text">GameBuddies</span>
                <span className="brand-dot">.io</span>
              </h3>
              <p className="footer-tagline">The future of multiplayer gaming</p>
            </div>
            <div className="footer-stats">
              <div className="footer-stat">
                <span className="stat-icon">🎮</span>
                <span className="stat-text">Connecting gamers worldwide</span>
              </div>
            </div>
          </div>
          <div className="footer-bottom">
            <p>&copy; 2025 GameBuddies.io - All rights reserved</p>
          </div>
        </div>
      </footer>

      {/* Modals */}
      {showCreateRoom && (
        <CreateRoom
          onRoomCreated={handleRoomCreated}
          onCancel={handleCloseModals}
        />
      )}

      {showJoinRoom && (
        <JoinRoom
          initialRoomCode={joinRoomCode}
          initialPlayerName={prefillName}
          autoJoin={autoJoin}
          onRoomJoined={handleJoinRoom}
          onCancel={handleCloseModals}
        />
      )}
    </div>
  );
};

export default HomePage;
