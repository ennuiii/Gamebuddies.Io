import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSocket } from '../contexts/LazySocketContext';
import { useNotification } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import { useFriends } from '../contexts/FriendContext';
import { SOCKET_EVENTS, SERVER_EVENTS } from '@shared/constants';
import GamePicker from './GamePicker';
import ChatWindow from './ChatWindow';
import TugOfWar from './TugOfWar';
import ProfileSettingsModal from './ProfileSettingsModal';
import ProfileModal from './ProfileModal';
import { useRealtimeSubscription } from '../utils/useRealtimeSubscription';
import { getSupabaseClient } from '../utils/supabase';
import Avatar from './Avatar';
// BUG FIX #21: Import centralized error messages
import { getErrorMessage, SOCKET_ERROR_CODES } from '../utils/errorMessages';
import './RoomLobby.css';

interface Player {
  id: string;
  name: string;
  isHost: boolean;
  isConnected: boolean;
  isReady: boolean;
  inGame: boolean;
  currentLocation: 'lobby' | 'game' | 'disconnected';
  lastPing?: string;
  premiumTier: string;
  role: string;
  avatarUrl?: string;
  avatarStyle?: string;
  avatarSeed?: string;
  avatarOptions?: Record<string, unknown>;
  level: number;
  isGuest?: boolean;
  achievementPoints?: number;
}

interface PlayerStatus {
  status: string;
  label: string;
  color: string;
  icon: string;
}

interface PlayerWithStatus extends Player {
  playerStatus: PlayerStatus;
  countdownTime?: number;
  isDisconnectedWithTimer: boolean;
}

interface RoomData {
  id: string;
  room_code: string;
  status: string;
  game_type?: string;
  current_game?: string;
  streamer_mode: boolean;
  created_at: string;
  metadata?: {
    created_by_name?: string;
  };
  participants?: RoomParticipant[];
}

interface RoomParticipant {
  user_id: string;
  role: string;
  is_connected: boolean;
  in_game: boolean;
  current_location: string;
  last_ping?: string;
  user?: {
    display_name?: string;
    premium_tier?: string;
    role?: string;
    avatar_url?: string;
    avatar_style?: string;
    avatar_seed?: string;
    avatar_options?: Record<string, unknown>;
    level?: number;
  };
}

interface GameInfo {
  id: string;
  name: string;
  display_name?: string;
  icon?: string;
  thumbnailUrl?: string;
  description?: string;
  max_players?: number;
  maxPlayers?: number;
  min_players?: number;
  minPlayers?: number;
}

interface ChatMessage {
  id?: string | number;
  type?: 'system' | 'user';
  message: string;
  playerName?: string;
  timestamp?: number;
}

interface RoomLobbyProps {
  roomCode: string;
  playerName: string;
  isHost: boolean;
  onLeave: () => void;
}

const RoomLobby: React.FC<RoomLobbyProps> = ({ roomCode, playerName, isHost, onLeave }) => {
  const {
    socket,
    socketRef,
    socketId,
    isConnected: socketIsConnected,
    connectSocket,
    setLastRoom,
    clearLastRoom,
  } = useSocket();

  const activeSocket = socket || socketRef?.current;
  const { addNotification } = useNotification();
  const { user, isAuthenticated, isPremium } = useAuth();
  const { updateLobbyInfo, friends, pendingRequests, sendFriendRequestById, acceptFriendRequest } = useFriends();

  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [currentIsHost, setCurrentIsHost] = useState<boolean>(isHost);
  const [roomStatus, setRoomStatus] = useState<string>('waiting_for_players');
  const [isStartingGame, setIsStartingGame] = useState<boolean>(false);
  const [disconnectedTimers, setDisconnectedTimers] = useState<Map<string, number>>(new Map());
  const [showRoomCode, setShowRoomCode] = useState<boolean>(false);
  const [showProfileSettings, setShowProfileSettings] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [imageError, setImageError] = useState<boolean>(false);
  const [gamesList, setGamesList] = useState<GameInfo[]>([]);
  const [sendingFriendRequest, setSendingFriendRequest] = useState<Set<string>>(new Set());
  const [recentlyJoinedPlayers, setRecentlyJoinedPlayers] = useState<Set<string>>(new Set());
  const [reconnectingPlayers, setReconnectingPlayers] = useState<Set<string>>(new Set());
  const [selectedProfileUserId, setSelectedProfileUserId] = useState<string | null>(null);

  const roomCodeRef = useRef<string>(roomCode);
  const playerNameRef = useRef<string>(playerName);
  const currentUserIdRef = useRef<string | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const timerIntervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const roomVersionRef = useRef<number>(0);
  const currentIsHostRef = useRef<boolean>(currentIsHost);
  const userRef = useRef(user);
  const roomStatusRef = useRef<string>(roomStatus);

  useEffect(() => {
    currentIsHostRef.current = currentIsHost;
  }, [currentIsHost]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    roomStatusRef.current = roomStatus;
  }, [roomStatus]);

  useEffect(() => {
    setImageError(false);
  }, [selectedGame]);

  useEffect(() => {
    if (!activeSocket || !roomCode) return;
    activeSocket.emit(SOCKET_EVENTS.ROOM.JOIN_SOCKET, { roomCode });
  }, [activeSocket, roomCode]);

  // Fetch games list
  useEffect(() => {
    const fetchGames = async (): Promise<void> => {
      try {
        const response = await fetch('/api/games');
        const data = await response.json();
        if (data.success && data.games) {
          setGamesList(data.games);
        }
      } catch (err) {
        console.error('Error fetching games:', err);
      }
    };
    fetchGames();
  }, []);

  const selectedGameInfo = useMemo(() => {
    if (!selectedGame) return null;
    const foundGame = gamesList.find((g) => g.id === selectedGame);
    if (foundGame) {
      return {
        name: foundGame.display_name || foundGame.name,
        icon: foundGame.icon || '🎮',
        thumbnailUrl: foundGame.thumbnailUrl,
        description: foundGame.description,
        maxPlayers: foundGame.max_players || foundGame.maxPlayers,
        minPlayers: foundGame.min_players || foundGame.minPlayers || 2,
      };
    }
    return {
      name: selectedGame,
      icon: '🎮',
      thumbnailUrl: null,
      description: 'Loading game details...',
      maxPlayers: null,
      minPlayers: null,
    };
  }, [selectedGame, gamesList]);

  useEffect(() => {
    if (selectedGameInfo && selectedGameInfo.name && roomCodeRef.current) {
      updateLobbyInfo(roomCodeRef.current, selectedGameInfo.name, selectedGameInfo.thumbnailUrl || undefined);
    }
  }, [selectedGameInfo, updateLobbyInfo]);

  const startDisconnectCountdown = (playerId: string): void => {
    const startTime = Date.now();
    const countdownDuration = 10000;

    if (timerIntervalsRef.current.has(playerId)) {
      clearInterval(timerIntervalsRef.current.get(playerId));
    }

    setDisconnectedTimers((prev) => new Map(prev.set(playerId, 10)));

    const intervalId = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, Math.ceil((countdownDuration - elapsed) / 1000));

      setDisconnectedTimers((prev) => {
        const newMap = new Map(prev);
        if (remaining > 0) {
          newMap.set(playerId, remaining);
        } else {
          newMap.delete(playerId);
        }
        return newMap;
      });

      if (remaining <= 0) {
        clearInterval(intervalId);
        timerIntervalsRef.current.delete(playerId);
      }
    }, 2000);

    timerIntervalsRef.current.set(playerId, intervalId);
  };

  const clearDisconnectCountdown = (playerId: string): void => {
    const wasDisconnected = timerIntervalsRef.current.has(playerId) || disconnectedTimers.has(playerId);

    if (timerIntervalsRef.current.has(playerId)) {
      clearInterval(timerIntervalsRef.current.get(playerId));
      timerIntervalsRef.current.delete(playerId);
    }
    setDisconnectedTimers((prev) => {
      const newMap = new Map(prev);
      newMap.delete(playerId);
      return newMap;
    });

    // If player was disconnected and is now back, show reconnecting animation
    if (wasDisconnected) {
      setReconnectingPlayers((prev) => new Set(prev).add(playerId));
      setTimeout(() => {
        setReconnectingPlayers((prev) => {
          const newSet = new Set(prev);
          newSet.delete(playerId);
          return newSet;
        });
      }, 1500); // Animation plays for 1.5s
    }
  };

  const fetchUpdatedPlayerList = async (): Promise<void> => {
    if (!roomIdRef.current) return;
    try {
      const supabase = await getSupabaseClient();
      if (!supabase) return;

      const { data: roomMembers, error: fetchError } = await supabase
        .from('room_members')
        .select(
          `user_id, role, is_connected, in_game, current_location, last_ping,
          user:users(username, display_name, premium_tier, avatar_url, avatar_style, avatar_seed, avatar_options, level, is_guest, achievement_points)`
        )
        .eq('room_id', roomIdRef.current);

      if (fetchError) throw fetchError;

      const mappedPlayers: Player[] =
        roomMembers?.map((member: any) => ({
          id: member.user_id,
          name: member.user?.display_name || 'Player',
          isHost: member.role === 'host',
          isConnected: member.is_connected,
          inGame: member.in_game,
          currentLocation: member.current_location || 'lobby',
          lastPing: member.last_ping,
          premiumTier: member.user?.premium_tier || 'free',
          role: member.user?.role || 'user',
          avatarUrl: member.user?.avatar_url,
          avatarStyle: member.user?.avatar_style,
          avatarSeed: member.user?.avatar_seed,
          avatarOptions: member.user?.avatar_options,
          level: member.user?.level || 1,
          isGuest: member.user?.is_guest ?? false,
          achievementPoints: member.user?.achievement_points || 0,
        })) || [];

      setPlayers(mappedPlayers);
    } catch (err) {
      console.error('Error fetching player list:', err);
    }
  };

  // Chat listeners
  useEffect(() => {
    if (!activeSocket) return;

    const handleChatMessage = (msg: ChatMessage): void => {
      setMessages((prev) => [...prev, msg]);
    };

    activeSocket.on(SERVER_EVENTS.CHAT.MESSAGE, handleChatMessage);

    return () => {
      activeSocket.off(SERVER_EVENTS.CHAT.MESSAGE, handleChatMessage);
    };
  }, [activeSocket, roomCode]);

  const handleSendMessage = (text: string): void => {
    let me: Player | undefined;
    if (user?.id) {
      me = players.find((p) => p.id === user.id);
    }
    if (!me && currentUserIdRef.current) {
      me = players.find((p) => p.id === currentUserIdRef.current);
    }
    if (!me) {
      me = players.find((p) => p.name === playerNameRef.current);
    }

    const nameToSend = me ? me.name : playerNameRef.current;

    if (activeSocket) {
      activeSocket.emit(SOCKET_EVENTS.CHAT.MESSAGE, { message: text, playerName: nameToSend });
    }
  };

  // Realtime subscriptions
  useRealtimeSubscription({
    table: 'room_members',
    filters: roomIdRef.current ? { filter: `room_id=eq.${roomIdRef.current}` } : {},
    enabled: !!roomIdRef.current,
    onUpdate: (newRecord: any) => {
      setPlayers((prevPlayers) =>
        prevPlayers.map((player) =>
          player.id === newRecord.user_id
            ? {
                ...player,
                isConnected: newRecord.is_connected,
                inGame: newRecord.in_game,
                currentLocation: newRecord.current_location,
                lastPing: newRecord.last_ping,
              }
            : player
        )
      );
    },
    onInsert: () => {
      fetchUpdatedPlayerList();
    },
    onDelete: (deletedRecord: any) => {
      setPlayers((prevPlayers) => prevPlayers.filter((player) => player.id !== deletedRecord.user_id));
    },
    dependencies: [roomIdRef.current],
  });

  useRealtimeSubscription({
    table: 'rooms',
    filters: roomIdRef.current ? { filter: `id=eq.${roomIdRef.current}` } : {},
    enabled: !!roomIdRef.current,
    onUpdate: (newRecord: any, oldRecord: any) => {
      setRoomData(newRecord);
      setRoomStatus(newRecord.status);
      if (newRecord.current_game !== oldRecord.current_game) {
        setSelectedGame(newRecord.current_game !== 'lobby' ? newRecord.current_game : null);
      }
    },
    dependencies: [roomIdRef.current],
  });

  // Main socket effect
  useEffect(() => {
    if (!socket) {
      const newSocket = connectSocket();
      if (!newSocket) {
        setError('Failed to establish connection to server');
        setIsLoading(false);
      }
      return;
    }

    if (!socketIsConnected) {
      setIsLoading(true);
      return;
    }

    setIsLoading(true);

    const handleConnect = (): void => {
      socket.emit(SOCKET_EVENTS.ROOM.JOIN, {
        roomCode: roomCodeRef.current,
        playerName: playerNameRef.current,
        supabaseUserId: userRef.current?.id,
      });
    };

    if (socket.connected) {
      handleConnect();
    } else {
      socket.once('connect', handleConnect);
    }

    const handleRoomJoined = (data: any): void => {
      const mappedPlayers: Player[] =
        data.players?.map((p: any) => ({
          id: p.id,
          name: p.name,
          isHost: p.isHost,
          isConnected: p.isConnected !== undefined ? p.isConnected : true,
          isReady: p.isHost ? true : (p.isReady ?? false), // Host is always ready
          inGame: p.inGame || false,
          currentLocation: p.currentLocation || (p.isConnected ? 'lobby' : 'disconnected'),
          lastPing: p.lastPing,
          premiumTier: p.premiumTier || 'free',
          role: p.role || 'user',
          avatarUrl: p.avatarUrl,
          avatarStyle: p.avatarStyle,
          avatarSeed: p.avatarSeed,
          avatarOptions: p.avatarOptions,
          level: p.level || 1,
          isGuest: p.isGuest ?? false,
          achievementPoints: p.achievementPoints || 0,
        })) || [];

      setPlayers(mappedPlayers);
      setRoomData(data.room);
      setRoomStatus(data.room?.status || 'waiting_for_players');
      setSelectedGame(data.room?.current_game || null);
      roomIdRef.current = data.room?.id;

      if (data.player) {
        setCurrentIsHost(data.player.isHost);
        currentUserIdRef.current = data.player.id;
        playerNameRef.current = data.player.name;
      } else if (data.isHost !== undefined) {
        setCurrentIsHost(data.isHost);
      }

      setIsLoading(false);
      setError(null);

      if (setLastRoom) {
        setLastRoom({
          roomCode: data.roomCode || roomCodeRef.current,
          playerName: playerNameRef.current,
          customLobbyName: data.player?.customLobbyName,
          supabaseUserId: userRef.current?.id,
        });
      }

      // If the current player was in game, signal return to lobby
      // This happens when host returns from external game (ClueScale, etc.)
      const currentPlayer = mappedPlayers.find(p => p.id === data.player?.id || p.id === currentUserIdRef.current);
      if (currentPlayer?.inGame && socket) {
        console.log('[LOBBY] Player was in game, emitting return to lobby');
        socket.emit('playerReturnToLobby', {
          playerName: currentPlayer.name,
          roomCode: data.roomCode || roomCodeRef.current,
        });
      }
    };

    const handlePlayerJoined = (data: any): void => {
      if (data.player?.name) {
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          const msgText = `${data.player.name} joined the lobby`;
          if (lastMsg && lastMsg.message === msgText && (Date.now() - (lastMsg.timestamp || 0) < 2000)) {
            return prev;
          }
          return [...prev, { id: Date.now(), type: 'system' as const, message: msgText, timestamp: Date.now() }];
        });
      }
      setPlayers(data.players || []);
      setRoomData(data.room);
      if (data.player?.id) {
        clearDisconnectCountdown(data.player.id);
        // Trigger join animation
        setRecentlyJoinedPlayers((prev) => new Set(prev).add(data.player.id));
        // Remove from recently joined after animation completes
        setTimeout(() => {
          setRecentlyJoinedPlayers((prev) => {
            const newSet = new Set(prev);
            newSet.delete(data.player.id);
            return newSet;
          });
        }, 600); // Animation duration + buffer
      }
    };

    const handlePlayerLeft = (data: any): void => {
      if (data.player?.name) {
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          const msgText = `${data.player.name} left the lobby`;
          if (lastMsg && lastMsg.message === msgText && (Date.now() - (lastMsg.timestamp || 0) < 2000)) {
            return prev;
          }
          return [...prev, { id: Date.now(), type: 'system' as const, message: msgText, timestamp: Date.now() }];
        });
      }
      setPlayers(data.players || []);
      if (data.room) setRoomData(data.room);
    };

    const handlePlayerDisconnected = (data: any): void => {
      if (data.players) {
        setPlayers(data.players);
      } else {
        setPlayers((prev) =>
          prev.map((player) =>
            player.id === data.playerId ? { ...player, isConnected: false } : player
          )
        );
      }
      if (data.playerId) {
        startDisconnectCountdown(data.playerId);
      }
    };

    const handleGameSelected = (data: any): void => {
      setSelectedGame(data.gameType);
    };

    const handleGameStarted = (data: any): void => {
      setIsStartingGame(false);
      if (socket) {
        socket.disconnect();
      }
      setTimeout(() => {
        window.location.href = data.gameUrl;
      }, 100);
    };

    const handleHostTransferred = (data: any): void => {
      const updatedPlayers = data.players || [];
      setPlayers(updatedPlayers);
      if (data.room) setRoomData(data.room);

      const currentUser = updatedPlayers.find((p: Player) => p.name === playerNameRef.current);
      if (currentUser) {
        setCurrentIsHost(currentUser.isHost);
      }

      const reasonText =
        data.reason === 'original_host_left'
          ? 'left the room'
          : data.reason === 'original_host_disconnected'
            ? 'disconnected'
            : 'transferred host';

      addNotification(`${data.newHostName} is now the host (previous host ${reasonText}).`, 'info');
    };

    const handlePlayerKicked = (data: any): void => {
      if (data.isNotification) {
        setPlayers(data.players || []);
        if (data.room) setRoomData(data.room);
        addNotification(`${data.targetName} was removed from the room by ${data.kickedBy}.`, 'warning');
      } else {
        addNotification(`You have been kicked: ${data.reason} (by ${data.kickedBy})`, 'error');
        if (socket) socket.disconnect();
        if (onLeave) onLeave();
      }
    };

    // BUG FIX #21: Enhanced error handling with centralized error messages
    const handleError = (socketError: any): void => {
      // Handle "Not in a room" by auto-rejoining
      if (socketError.message === 'Not in a room') {
        socket.emit(SOCKET_EVENTS.ROOM.JOIN, {
          roomCode: roomCodeRef.current,
          playerName: playerNameRef.current,
          supabaseUserId: user?.id,
        });
        return;
      }

      // Get user-friendly error message from centralized utility
      const errorInfo = getErrorMessage(socketError.code || SOCKET_ERROR_CODES.UNKNOWN_ERROR);
      const fullMessage = errorInfo.action
        ? `${errorInfo.message} ${errorInfo.action}`
        : errorInfo.message;

      // Determine if user should be redirected based on error type
      const redirectErrors = [
        SOCKET_ERROR_CODES.ROOM_NOT_FOUND,
        SOCKET_ERROR_CODES.ROOM_FULL,
        SOCKET_ERROR_CODES.ROOM_CLOSED,
        SOCKET_ERROR_CODES.ROOM_NOT_ACCEPTING,
        SOCKET_ERROR_CODES.DUPLICATE_PLAYER,
        SOCKET_ERROR_CODES.UNAUTHORIZED,
        SOCKET_ERROR_CODES.SESSION_EXPIRED,
      ];
      const shouldRedirect = redirectErrors.includes(socketError.code);

      if (shouldRedirect) {
        setError(fullMessage);
        setIsLoading(false);
      } else {
        // Show notification for non-fatal errors
        const notificationType = errorInfo.recoverable ? 'warning' : 'error';
        addNotification(fullMessage, notificationType);
        if (isLoading) setIsLoading(false);
      }
    };

    // Handle room status changes (e.g., when host returns from external game)
    const handleRoomStatusChanged = (data: any): void => {
      console.log('📡 [ROOM STATUS] Room status changed:', data);
      if (data.newStatus) {
        setRoomStatus(data.newStatus);
      }
      if (data.players) {
        setPlayers(data.players);
      }
      if (data.room) {
        setRoomData(data.room);
        setSelectedGame(data.room.current_game || null);
      }
    };

    // Handle player ready status changes
    const handleReadyChanged = (data: { playerId: string; isReady: boolean; playerName: string }): void => {
      console.log('✅ [READY] Player ready status changed:', data);
      setPlayers(prevPlayers =>
        prevPlayers.map(p =>
          p.id === data.playerId ? { ...p, isReady: data.isReady } : p
        )
      );
    };

    socket.on(SERVER_EVENTS.ROOM.JOINED, handleRoomJoined);
    socket.on(SERVER_EVENTS.PLAYER.JOINED, handlePlayerJoined);
    socket.on(SERVER_EVENTS.PLAYER.LEFT, handlePlayerLeft);
    socket.on(SERVER_EVENTS.PLAYER.DISCONNECTED, handlePlayerDisconnected);
    socket.on(SERVER_EVENTS.GAME.SELECTED, handleGameSelected);
    socket.on(SERVER_EVENTS.GAME.STARTED, handleGameStarted);
    socket.on(SERVER_EVENTS.HOST.TRANSFERRED, handleHostTransferred);
    socket.on(SERVER_EVENTS.PLAYER.KICKED, handlePlayerKicked);
    socket.on(SERVER_EVENTS.PLAYER.READY_CHANGED, handleReadyChanged);
    socket.on(SERVER_EVENTS.ERROR, handleError);
    socket.on('roomStatusChanged', handleRoomStatusChanged);

    return () => {
      timerIntervalsRef.current.forEach((intervalId) => clearInterval(intervalId));
      timerIntervalsRef.current.clear();
      setDisconnectedTimers(new Map());

      if (socket) {
        socket.off(SERVER_EVENTS.ROOM.JOINED, handleRoomJoined);
        socket.off(SERVER_EVENTS.PLAYER.JOINED, handlePlayerJoined);
        socket.off(SERVER_EVENTS.PLAYER.LEFT, handlePlayerLeft);
        socket.off(SERVER_EVENTS.PLAYER.DISCONNECTED, handlePlayerDisconnected);
        socket.off(SERVER_EVENTS.GAME.SELECTED, handleGameSelected);
        socket.off(SERVER_EVENTS.GAME.STARTED, handleGameStarted);
        socket.off(SERVER_EVENTS.HOST.TRANSFERRED, handleHostTransferred);
        socket.off(SERVER_EVENTS.PLAYER.KICKED, handlePlayerKicked);
        socket.off(SERVER_EVENTS.PLAYER.READY_CHANGED, handleReadyChanged);
        socket.off(SERVER_EVENTS.ERROR, handleError);
        socket.off('roomStatusChanged', handleRoomStatusChanged);

        if (socket.connected && roomCodeRef.current) {
          socket.emit(SOCKET_EVENTS.ROOM.LEAVE, { roomCode: roomCodeRef.current });
        }
      }
    };
  }, [socket, socketIsConnected]);

  // Heartbeat
  useEffect(() => {
    if (!socket) return;
    const interval = setInterval(() => {
      if (socket.connected) socket.emit(SOCKET_EVENTS.CONNECTION.HEARTBEAT);
    }, 30000);
    return () => clearInterval(interval);
  }, [socket]);

  const handleGameSelect = useCallback(
    (gameType: string): void => {
      if (socket && socketIsConnected && currentIsHost) {
        socket.emit(SOCKET_EVENTS.GAME.SELECT, { gameType });
      }
    },
    [socket, socketIsConnected, currentIsHost]
  );

  const handleStartGame = useCallback((): void => {
    if (isStartingGame) return;
    if (socket && socketIsConnected && currentIsHost) {
      setIsStartingGame(true);
      addNotification('Starting game...', 'info');
      socket.emit(SOCKET_EVENTS.GAME.START, { roomCode: roomCodeRef.current });
      setTimeout(() => setIsStartingGame(false), 5000);
    } else {
      if (!currentIsHost) {
        addNotification('Only the host can start the game.', 'warning');
      } else {
        addNotification('Connection lost. Please refresh the page.', 'error');
      }
    }
  }, [socket, socketIsConnected, currentIsHost, isStartingGame, addNotification]);

  const handleToggleReady = useCallback((): void => {
    if (socket && socketIsConnected && !currentIsHost) {
      socket.emit(SOCKET_EVENTS.PLAYER.TOGGLE_READY, { roomCode: roomCodeRef.current });

      // Optimistically flip ready state locally for snappier UX
      const currentId = currentUserIdRef.current || user?.id;
      if (currentId) {
        setPlayers((prev) =>
          prev.map((p) =>
            p.id === currentId
              ? { ...p, isReady: !p.isReady }
              : p
          )
        );
      }
    }
  }, [socket, socketIsConnected, currentIsHost, user?.id]);

  const handleLeaveRoom = useCallback((): void => {
    if (clearLastRoom) clearLastRoom();
    if (socket && socketIsConnected) {
      socket.emit(SOCKET_EVENTS.ROOM.LEAVE, { roomCode: roomCodeRef.current });
    }
    if (onLeave) onLeave();
  }, [socket, socketIsConnected, onLeave, clearLastRoom]);

  const handleTransferHost = useCallback(
    (targetPlayerId: string): void => {
      if (socket && socketIsConnected && currentIsHost) {
        socket.emit(SOCKET_EVENTS.PLAYER.TRANSFER_HOST, {
          roomCode: roomCodeRef.current,
          targetUserId: targetPlayerId,
        });
      }
    },
    [socket, socketIsConnected, currentIsHost]
  );

  const handleKickPlayer = useCallback(
    (targetPlayerId: string, targetPlayerName: string): void => {
      if (socket && socketIsConnected && currentIsHost) {
        const confirmed = window.confirm(`Are you sure you want to kick ${targetPlayerName} from the room?`);
        if (confirmed) {
          socket.emit(SOCKET_EVENTS.PLAYER.KICK, {
            roomCode: roomCodeRef.current,
            targetUserId: targetPlayerId,
          });
        }
      }
    },
    [socket, socketIsConnected, currentIsHost]
  );

  const getPlayerStatus = (player: Player): PlayerStatus => {
    if (player.currentLocation) {
      switch (player.currentLocation) {
        case 'game':
          return { status: 'in_game', label: 'In Game', color: '#ff6b35', icon: '🎮' };
        case 'lobby':
          return { status: 'lobby', label: 'In Lobby', color: '#4caf50', icon: '🟢' };
        case 'disconnected':
          return { status: 'disconnected', label: 'Offline', color: '#666', icon: '⚫' };
        default:
          return { status: 'lobby', label: 'In Lobby', color: '#4caf50', icon: '🟢' };
      }
    }
    if (!player.isConnected) {
      return { status: 'disconnected', label: 'Offline', color: '#666', icon: '⚫' };
    }
    if (player.inGame) {
      return { status: 'in_game', label: 'In Game', color: '#ff6b35', icon: '🎮' };
    }
    return { status: 'lobby', label: 'In Lobby', color: '#4caf50', icon: '🟢' };
  };

  const playerCounts = useMemo(() => {
    return players.reduce(
      (acc, p) => {
        acc.total++;
        if (p.currentLocation === 'game' || p.inGame) {
          acc.inGameCount++;
        } else if (!p.isConnected || p.currentLocation === 'disconnected') {
          acc.disconnectedCount++;
        } else {
          acc.lobbyCount++;
        }
        return acc;
      },
      { total: 0, lobbyCount: 0, inGameCount: 0, disconnectedCount: 0 }
    );
  }, [players]);

  // Check if all connected non-host players are ready
  const allPlayersReady = useMemo(() => {
    const connectedNonHostPlayers = players.filter(p => p.isConnected && !p.isHost);
    // If no other players, host can start alone
    if (connectedNonHostPlayers.length === 0) return true;
    return connectedNonHostPlayers.every(p => p.isReady);
  }, [players]);

  // Get current user's ready status
  const currentUserReady = useMemo(() => {
    const currentPlayer = players.find(p => p.id === currentUserIdRef.current || p.id === user?.id);
    return currentPlayer?.isReady ?? false;
  }, [players, user?.id]);

  // Get friendship status for a player
  const getFriendshipStatus = useCallback((playerId: string): 'friends' | 'sent' | 'received' | 'none' => {
    // Check if already friends
    if (friends.some(f => f.id === playerId || f.user_id === playerId || f.friend_id === playerId)) {
      return 'friends';
    }
    // Check pending requests
    const pending = pendingRequests.find(p =>
      p.user?.username === players.find(pl => pl.id === playerId)?.name ||
      p.from_user_id === playerId ||
      (p.type === 'sent' && p.user?.username === players.find(pl => pl.id === playerId)?.name)
    );
    if (pending) {
      return pending.type || (pending.from_user_id ? 'received' : 'sent');
    }
    return 'none';
  }, [friends, pendingRequests, players]);

  // Handle sending friend request
  const handleSendFriendRequest = useCallback(async (playerId: string, playerNameText: string): Promise<void> => {
    if (sendingFriendRequest.has(playerId)) return;

    setSendingFriendRequest(prev => new Set(prev).add(playerId));
    try {
      const result = await sendFriendRequestById(playerId);
      if (result.success) {
        addNotification(`Friend request sent to ${playerNameText}!`, 'success');
      } else {
        addNotification(result.error || 'Failed to send friend request', 'error');
      }
    } catch (err) {
      addNotification('Failed to send friend request', 'error');
    } finally {
      setSendingFriendRequest(prev => {
        const newSet = new Set(prev);
        newSet.delete(playerId);
        return newSet;
      });
    }
  }, [sendFriendRequestById, sendingFriendRequest, addNotification]);

  // Handle accepting friend request
  const handleAcceptFriendRequest = useCallback(async (playerId: string, playerNameText: string): Promise<void> => {
    // Find the pending request from this player
    const request = pendingRequests.find(p =>
      p.from_user_id === playerId ||
      (p.type === 'received' && p.user?.username === players.find(pl => pl.id === playerId)?.name)
    );
    if (!request) return;

    setSendingFriendRequest(prev => new Set(prev).add(playerId));
    try {
      const result = await acceptFriendRequest(request.id);
      if (result.success) {
        addNotification(`You are now friends with ${playerNameText}!`, 'success');
      } else {
        addNotification(result.error || 'Failed to accept friend request', 'error');
      }
    } catch (err) {
      addNotification('Failed to accept friend request', 'error');
    } finally {
      setSendingFriendRequest(prev => {
        const newSet = new Set(prev);
        newSet.delete(playerId);
        return newSet;
      });
    }
  }, [acceptFriendRequest, pendingRequests, players, addNotification]);

  const playersWithStatus: PlayerWithStatus[] = useMemo(() => {
    return players.map((player) => ({
      ...player,
      playerStatus: getPlayerStatus(player),
      countdownTime: disconnectedTimers.get(player.id),
      isDisconnectedWithTimer: !player.isConnected && (disconnectedTimers.get(player.id) || 0) > 0,
    }));
  }, [players, disconnectedTimers]);

  if (isLoading || !socketIsConnected) {
    return (
      <div className="room-lobby">
        <div className="lobby-header">
          <h2>Room {roomCode}</h2>
          <div className="connection-status">Status: {socketIsConnected ? 'Connected' : 'Connecting...'}</div>
        </div>
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>{socketIsConnected ? 'Joining room...' : 'Connecting to server...'}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="room-lobby">
        <div className="lobby-header">
          <h2>Room {roomCode}</h2>
        </div>
        <div className="error-container">
          <div className="error-message">
            <h3>Connection Error</h3>
            <p>{error}</p>
            <div className="error-actions">
              <button onClick={handleLeaveRoom} className="leave-button">
                Leave Room
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="room-lobby">
      {/* Redesigned Header Row */}
      <div className="lobby-header-new">
        <button onClick={handleLeaveRoom} className="leave-button-new">
          <span className="leave-icon">←</span> Leave Room
        </button>

        <div className="room-code-center">
          <span className="room-label">ROOM:</span>
          {roomData?.streamer_mode ? (
            <span className="room-code-value">
              {showRoomCode ? roomCode : '••••••'}
              {currentIsHost && (
                <button
                  className="toggle-code-btn-inline"
                  onClick={() => setShowRoomCode(!showRoomCode)}
                  title={showRoomCode ? 'Hide code' : 'Show code'}
                >
                  {showRoomCode ? '🙈' : '👁️'}
                </button>
              )}
            </span>
          ) : (
            <span className="room-code-value">{roomCode}</span>
          )}
          <span className="lobby-status-pill">
            <span className="status-dot"></span>
            LOBBY
          </span>
        </div>

        <div className="header-actions-right">
          {!roomData?.streamer_mode && (
            <>
              <button
                className="header-action-btn"
                onClick={() => navigator.clipboard.writeText(roomCode)}
              >
                <span className="btn-icon">📋</span> Copy Code
              </button>
              <button
                className="header-action-btn"
                onClick={() => {
                  const roomUrl = `${window.location.origin}/?join=${roomCode}`;
                  navigator.clipboard.writeText(roomUrl);
                }}
              >
                <span className="btn-icon">🔗</span> Copy Link
              </button>
            </>
          )}
          {isAuthenticated && (
            <button
              onClick={() => setShowProfileSettings(true)}
              className="header-action-btn profile-btn"
              title="Profile Settings"
            >
              ⚙️
            </button>
          )}
        </div>
      </div>

      <ProfileSettingsModal
        isOpen={showProfileSettings}
        onClose={() => setShowProfileSettings(false)}
        roomCode={roomCode}
        isPremium={isPremium}
      />

      {/* Profile Modal for viewing other players */}
      {selectedProfileUserId && (
        <ProfileModal
          userId={selectedProfileUserId}
          isOpen={!!selectedProfileUserId}
          onClose={() => setSelectedProfileUserId(null)}
        />
      )}

      {/* Two-Column Layout */}
      <div className="lobby-layout">
        {/* Left Column - Main Content */}
        <div className="lobby-main">
          {/* Current Game Card */}
          <div className="current-game-section">
            <div className="section-label">CURRENT GAME</div>
            {!selectedGame ? (
              <GamePicker
                onGameSelect={handleGameSelect}
                isHost={currentIsHost}
                disabled={!socket || !socketIsConnected}
              />
            ) : (
              <div className="current-game-card">
                <div className="game-mascot">
                  {selectedGameInfo?.thumbnailUrl && !imageError ? (
                    <img
                      src={selectedGameInfo.thumbnailUrl}
                      alt={selectedGameInfo.name || ''}
                      onError={() => setImageError(true)}
                    />
                  ) : (
                    <span className="game-icon-fallback">{selectedGameInfo?.icon || '🎮'}</span>
                  )}
                </div>
                <div className="game-info">
                  <h3 className="game-title">{selectedGameInfo?.name}</h3>
                  <p className="game-description">{selectedGameInfo?.description}</p>
                  {currentIsHost && (
                    <button
                      onClick={() => setSelectedGame(null)}
                      className="change-game-link"
                    >
                      Change Game
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Team Battle Section */}
          <div className="team-battle-section">
            <TugOfWar playerName={playerNameRef.current} />
          </div>

          {/* Ready Section - shown for non-host players */}
          {!currentIsHost && (
            <div className="ready-section-new">
              <button
                onClick={handleToggleReady}
                className={`ready-button-new ${currentUserReady ? 'ready' : 'not-ready'}`}
                disabled={!socket || !socketIsConnected}
              >
                {currentUserReady ? 'Stand Down' : 'Ready Up'}
              </button>
              <p className="ready-hint">
                {currentUserReady
                  ? selectedGame
                    ? 'Waiting for host to start the game...'
                    : 'Waiting for host to select a game...'
                  : 'Click Ready when you\'re set to play'}
              </p>
            </div>
          )}

          {/* Start Game Button - Host Only */}
          {currentIsHost && selectedGame && (
            <button
              onClick={handleStartGame}
              className="start-game-button-new"
              disabled={!socket || !socketIsConnected || isStartingGame || !allPlayersReady}
              title={!allPlayersReady ? 'Waiting for all players to ready up' : ''}
            >
              {isStartingGame ? 'Starting...' : !allPlayersReady ? 'Waiting for Players...' : 'START GAME'}
            </button>
          )}
          {currentIsHost && selectedGame && !allPlayersReady && (
            <p className="waiting-ready-hint">All players must be ready before starting</p>
          )}
        </div>

        {/* Right Column - Sidebar */}
        <div className="lobby-sidebar">
          {/* Players List */}
          <div className="sidebar-section players-section-new">
            <div className="sidebar-header">
              <span className="sidebar-title">PLAYERS ({players.length}/{selectedGameInfo?.maxPlayers || 10})</span>
            </div>
            <div className={`players-list ${allPlayersReady ? 'all-ready' : ''}`}>
              {playersWithStatus.map((player) => {
                const { playerStatus, countdownTime, isDisconnectedWithTimer } = player;
                const isJoining = recentlyJoinedPlayers.has(player.id);
                const isReconnecting = reconnectingPlayers.has(player.id);
                return (
                  <div
                    key={player.id}
                    className={`player-row ${player.isHost ? 'host' : ''} ${playerStatus.status} ${isDisconnectedWithTimer ? 'disconnecting' : ''} ${player.role === 'admin' ? 'premium-admin' : player.premiumTier === 'lifetime' ? 'premium-lifetime' : player.premiumTier === 'monthly' ? 'premium-monthly' : ''} ${isJoining ? 'player-joining' : ''} ${isReconnecting ? 'player-reconnecting' : ''}`}
                  >
                    <div
                      className={`player-row-avatar ${!player.isGuest ? 'clickable' : ''}`}
                      onClick={() => !player.isGuest && setSelectedProfileUserId(player.id)}
                      title={!player.isGuest ? `View ${player.name}'s profile` : 'Guest profiles are not available'}
                      role={!player.isGuest ? 'button' : undefined}
                      tabIndex={!player.isGuest ? 0 : undefined}
                      onKeyDown={(e) => {
                        if (!player.isGuest && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          setSelectedProfileUserId(player.id);
                        }
                      }}
                    >
                      <Avatar
                        url={player.avatarUrl}
                        avatarStyle={player.avatarStyle}
                        avatarSeed={player.avatarSeed}
                        avatarOptions={player.avatarOptions}
                        name={player.name}
                        size={40}
                        isPremium={player.role === 'admin' || player.premiumTier !== 'free'}
                        className="avatar-image-small"
                      />
                    </div>
                    <div className="player-row-info">
                      <span
                        className={`player-row-name ${!player.isGuest ? 'clickable' : ''}`}
                        onClick={() => !player.isGuest && setSelectedProfileUserId(player.id)}
                        role={!player.isGuest ? 'button' : undefined}
                        tabIndex={!player.isGuest ? 0 : undefined}
                        onKeyDown={(e) => {
                          if (!player.isGuest && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault();
                            setSelectedProfileUserId(player.id);
                          }
                        }}
                      >
                        {player.name}
                      </span>
                      <div className="player-row-badges">
                        {player.isHost && <span className="badge-host">HOST</span>}
                        {player.isGuest ? (
                          <span className="badge-guest">GUEST</span>
                        ) : player.role === 'admin' ? (
                          <span className="badge-admin">ADMIN</span>
                        ) : player.premiumTier === 'lifetime' ? (
                          <span className="badge-premium">PREMIUM</span>
                        ) : player.premiumTier === 'monthly' ? (
                          <span className="badge-pro">PRO</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="player-row-status">
                      <span className={`status-pill ${playerStatus.status}`}>
                        {playerStatus.status === 'lobby' ? 'IN LOBBY' : playerStatus.status === 'in_game' ? 'IN GAME' : 'OFFLINE'}
                      </span>
                      {isDisconnectedWithTimer && (
                        <span className="countdown-small">⏱️ {countdownTime}s</span>
                      )}
                    </div>
                    {/* Player Actions Dropdown/Buttons */}
                    {currentIsHost && !player.isHost && !isDisconnectedWithTimer && (
                      <div className="player-row-actions">
                        <button className="action-btn-small" onClick={() => handleTransferHost(player.id)} title="Make Host">
                          👑
                        </button>
                        <button
                          className="action-btn-small danger"
                          onClick={() => handleKickPlayer(player.id, player.name)}
                          title="Kick Player"
                        >
                          👢
                        </button>
                      </div>
                    )}
                    {/* Friend Actions */}
                    {isAuthenticated && user?.id !== player.id && !player.isGuest && !currentIsHost && (() => {
                      const friendStatus = getFriendshipStatus(player.id);
                      if (friendStatus === 'friends') return null;
                      if (friendStatus === 'sent') {
                        return <span className="friend-status-text">Pending</span>;
                      }
                      if (friendStatus === 'received') {
                        return (
                          <button
                            className="action-btn-small accept"
                            onClick={() => handleAcceptFriendRequest(player.id, player.name)}
                            disabled={sendingFriendRequest.has(player.id)}
                            title="Accept Friend Request"
                          >
                            ✓
                          </button>
                        );
                      }
                      return (
                        <button
                          className="action-btn-small"
                          onClick={() => handleSendFriendRequest(player.id, player.name)}
                          disabled={sendingFriendRequest.has(player.id)}
                          title="Add Friend"
                        >
                          +
                        </button>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Lobby Chat */}
          <div className="sidebar-section chat-section-new">
            <div className="sidebar-header">
              <span className="sidebar-title">LOBBY CHAT</span>
            </div>
            <ChatWindow
              messages={messages}
              onSendMessage={handleSendMessage}
              currentPlayerName={playerNameRef.current}
            />
          </div>
        </div>
      </div>

      {roomData && (
        <div className="room-details">
          <small>
            Room created: {new Date(roomData.created_at).toLocaleString()}
            {roomData.metadata?.created_by_name && <> by {roomData.metadata.created_by_name}</>}
          </small>
        </div>
      )}
    </div>
  );
};

export default RoomLobby;
