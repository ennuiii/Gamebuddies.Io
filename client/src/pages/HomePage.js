import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useSocket } from '../contexts/LazySocketContext';
import { useFriends } from '../contexts/FriendContext';
import GameCard from '../components/GameCard';
import CreateRoom from '../components/CreateRoom';
import JoinRoom from '../components/JoinRoom';
import BrowseRooms from '../components/BrowseRooms';
import RoomLobby from '../components/RoomLobby';
import './HomePage.css';

const HomePage = ({ setIsInLobby, setLobbyLeaveFn }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const processedLinksRef = useRef(new Set());
  const [isRecoveringSession, setIsRecoveringSession] = useState(false);
  const { socket, connectSocket } = useSocket();
  const { updateLobbyInfo } = useFriends();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [showJoinRoom, setShowJoinRoom] = useState(false);
  const [showBrowseRooms, setShowBrowseRooms] = useState(false);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [inLobby, setInLobby] = useState(false);
  const [joinRoomCode, setJoinRoomCode] = useState('');
  const [prefillName, setPrefillName] = useState('');
  const [autoJoin, setAutoJoin] = useState(false);

  const fetchGames = useCallback(async () => {
    try {
      console.log('[HomePage] 🎮 Fetching games from /api/games...');
      const response = await axios.get('/api/games');
      console.log('[HomePage] 📦 Raw API response:', response.data);

      // API returns { success: true, games: [...] }
      const gamesData = response.data.games || response.data;
      console.log('[HomePage] ✅ Parsed games data:', gamesData);
      console.log('[HomePage] 📊 Number of games:', gamesData.length);
      console.log('[HomePage] 🎯 Game IDs:', gamesData.map(g => g.id));

      setGames(gamesData);
    } catch (error) {
      console.error('[HomePage] ❌ Error fetching games:', error);
      console.error('[HomePage] 📋 Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      // Fallback to empty array on error
      setGames([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGames();
  }, [fetchGames]);

  // Helper to get stored session info (defined before useEffect that needs it)
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

  // F5 Refresh Persistence: Auto-rejoin room if session exists
  useEffect(() => {
    // Skip if already in lobby or processing URL params
    if (inLobby || isRecoveringSession) {
      return;
    }

    // Skip if URL has special params (they have their own handlers)
    const params = new URLSearchParams(location.search);
    if (params.has('join') || params.has('invite') || params.has('return') || params.has('session')) {
      return;
    }

    // Skip if on /lobby/ROOMCODE path (has its own handler)
    if (location.pathname.match(/^\/lobby\/[A-Za-z0-9-]+/i)) {
      return;
    }

    // Check for stored session from F5 refresh
    const storedSession = getStoredSessionInfo();
    if (storedSession.roomCode && storedSession.name) {
      console.log('[HomePage] 🔄 Found stored session after refresh, auto-rejoining:', storedSession.roomCode);

      // Mark as processed to prevent re-triggering
      const key = `auto-rejoin:${storedSession.roomCode}`;
      if (processedLinksRef.current.has(key)) {
        return;
      }
      processedLinksRef.current.add(key);

      // Auto-join the room silently
      setJoinRoomCode(storedSession.roomCode);
      setPrefillName(storedSession.name);
      setAutoJoin(true);
      setShowJoinRoom(true);
    }
  }, [inLobby, isRecoveringSession, location.search, location.pathname, getStoredSessionInfo]);

  const handleCreateRoomClick = useCallback(() => {
    setShowCreateRoom(true);
  }, []);

  const handleJoinRoomClick = useCallback(() => {
    setShowJoinRoom(true);
  }, []);

  const handleBrowseRoomsClick = useCallback(() => {
    setShowBrowseRooms(true);
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
    updateLobbyInfo(null); // Reset lobby info in FriendContext
    navigate('/', { replace: true });
  }, [navigate, setIsInLobby, setLobbyLeaveFn, updateLobbyInfo]);

  // Helper to get game display name
  const getGameDisplayName = useCallback((gameId) => {
    if (!gameId) return "Game";
    const game = games.find(g => g.id === gameId);
    return game ? game.name : gameId; // Fallback to ID if name not found
  }, [games]);

  const handleRoomCreated = useCallback((room) => {
    setCurrentRoom(room);
    setPlayerName(room.playerName);
    setShowCreateRoom(false);
    setInLobby(true);
    setIsInLobby(true);
    setLobbyLeaveFn(() => handleLeaveLobby);
    persistSessionMetadata(room.roomCode, room.playerName, room.isHost ?? true, room.playerId ?? null);
    
    const gameName = getGameDisplayName(room.gameType);
    updateLobbyInfo(room.roomCode, gameName); 
  }, [handleLeaveLobby, persistSessionMetadata, setIsInLobby, setLobbyLeaveFn, updateLobbyInfo, getGameDisplayName]);

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
    
    const gameName = getGameDisplayName(room.gameType || room.current_game);
    updateLobbyInfo(room.roomCode, gameName); 
  }, [handleLeaveLobby, persistSessionMetadata, setIsInLobby, setLobbyLeaveFn, updateLobbyInfo, getGameDisplayName]);

  const handleCloseModals = useCallback(() => {
    setShowCreateRoom(false);
    setShowJoinRoom(false);
    setShowBrowseRooms(false);
    setJoinRoomCode('');
    setPrefillName('');
    setAutoJoin(false);
  }, []);

  const handleRoomSelected = useCallback((room) => {
    // When a room is selected from browse, open the join modal with pre-filled room code
    setShowBrowseRooms(false);
    setJoinRoomCode(room.roomCode);
    const { name: storedName } = getStoredSessionInfo();
    setPrefillName(storedName);
    setAutoJoin(Boolean(storedName));
    setShowJoinRoom(true);
  }, [getStoredSessionInfo]);

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
      const gameType = data.gameType || playerState?.gameType;

      setCurrentRoom({
        roomCode: recoveredRoomCode,
        playerName: recoveredName,
        isHost: !!isHost,
        gameType: gameType
      });
      setPlayerName(recoveredName);
      setShowJoinRoom(false);
      setInLobby(true);
      setIsInLobby(true);
      setAutoJoin(false);
      setPrefillName(recoveredName);
      setLobbyLeaveFn(() => handleLeaveLobby);

      persistSessionMetadata(recoveredRoomCode, recoveredName, isHost, playerId, sessionToken);
      
      const gameName = getGameDisplayName(gameType);
      updateLobbyInfo(recoveredRoomCode, gameName);

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

        // For generic room sessions (group returns), use stored identity
        const { name: storedName } = getStoredSessionInfo();
        const effectiveName = playerName || metadata?.player_name || storedName || nameParam;

        console.log('[HomePage] ✅ Session resolved to room:', roomCode, 'player:', effectiveName, {
          hasPlayerName: !!playerName,
          hasStoredName: !!storedName,
          isGenericSession: !playerId
        });

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

      {/* Beta Testing Disclaimer */}
      <div className="beta-disclaimer">
        <div className="beta-disclaimer-content">
          <span className="beta-badge">⚠️ BETA</span>
          <span className="beta-text">
            GameBuddies.io is currently in <strong>beta testing</strong>. Some features may not work as expected.
            We're actively developing and improving the platform. Thanks for your patience! 🚀
          </span>
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
            <span className="subtitle-highlight">Connect, Play, and Have Fun Together</span>
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
            <motion.button
              className="cta-button secondary"
              onClick={handleBrowseRoomsClick}
              whileHover={{ scale: 1.05, y: -3 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <span className="button-text">Browse Rooms</span>
              <span className="button-icon">🌍</span>
            </motion.button>
            <motion.a
              className="cta-button discord"
              href="https://discord.gg/kSBKr7PAUN"
              target="_blank"
              rel="noopener noreferrer"
              whileHover={{ scale: 1.05, y: -3 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <span className="button-text">Join Discord</span>
              <span className="button-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
              </span>
            </motion.a>
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

      {showBrowseRooms && (
        <BrowseRooms
          onRoomSelected={handleRoomSelected}
          onCancel={handleCloseModals}
        />
      )}
    </div>
  );
};

export default HomePage;
