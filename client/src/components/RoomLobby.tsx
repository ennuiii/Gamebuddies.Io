import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSocket } from '../contexts/LazySocketContext';
import { useNotification } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import { useFriends } from '../contexts/FriendContext';
import GamePicker from './GamePicker';
import ChatWindow from './ChatWindow';
import TugOfWar from './TugOfWar';
import ProfileSettingsModal from './ProfileSettingsModal';
import { useRealtimeSubscription } from '../utils/useRealtimeSubscription';
import { getSupabaseClient } from '../utils/supabase';
import Avatar from './Avatar';
import './RoomLobby.css';

interface Player {
  id: string;
  name: string;
  isHost: boolean;
  isConnected: boolean;
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
    activeSocket.emit('joinSocketRoom', { roomCode });
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
    if (timerIntervalsRef.current.has(playerId)) {
      clearInterval(timerIntervalsRef.current.get(playerId));
      timerIntervalsRef.current.delete(playerId);
    }
    setDisconnectedTimers((prev) => {
      const newMap = new Map(prev);
      newMap.delete(playerId);
      return newMap;
    });
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
          user:users(username, display_name, premium_tier, avatar_url, avatar_style, avatar_seed, avatar_options, level)`
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

    activeSocket.on('chat:message', handleChatMessage);

    return () => {
      activeSocket.off('chat:message', handleChatMessage);
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
      activeSocket.emit('chat:message', { message: text, playerName: nameToSend });
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
      socket.emit('joinRoom', {
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
        })) || [];

      setPlayers(mappedPlayers);
      setRoomData(data.room);
      setRoomStatus(data.room?.status || 'waiting_for_players');
      setSelectedGame(data.room?.game_type !== 'lobby' ? data.room.game_type : null);
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

    const handleError = (socketError: any): void => {
      let userFriendlyMessage = socketError.message || 'An error occurred';
      let shouldRedirect = false;

      if (userFriendlyMessage === 'Not in a room') {
        socket.emit('joinRoom', {
          roomCode: roomCodeRef.current,
          playerName: playerNameRef.current,
          supabaseUserId: user?.id,
        });
        return;
      }

      switch (socketError.code) {
        case 'ROOM_NOT_FOUND':
          userFriendlyMessage = 'Room not found. It may have expired or been cleaned up.';
          shouldRedirect = true;
          break;
        case 'ROOM_FULL':
          userFriendlyMessage = 'Room is full. Cannot rejoin at this time.';
          shouldRedirect = true;
          break;
        case 'DUPLICATE_PLAYER':
          userFriendlyMessage = 'Player name already in use. Try a different name.';
          shouldRedirect = true;
          break;
        default:
          break;
      }

      if (shouldRedirect) {
        setError(userFriendlyMessage);
        setIsLoading(false);
      } else {
        addNotification(userFriendlyMessage, 'warning');
        if (isLoading) setIsLoading(false);
      }
    };

    socket.on('roomJoined', handleRoomJoined);
    socket.on('playerJoined', handlePlayerJoined);
    socket.on('playerLeft', handlePlayerLeft);
    socket.on('playerDisconnected', handlePlayerDisconnected);
    socket.on('gameSelected', handleGameSelected);
    socket.on('gameStarted', handleGameStarted);
    socket.on('hostTransferred', handleHostTransferred);
    socket.on('playerKicked', handlePlayerKicked);
    socket.on('error', handleError);

    return () => {
      timerIntervalsRef.current.forEach((intervalId) => clearInterval(intervalId));
      timerIntervalsRef.current.clear();
      setDisconnectedTimers(new Map());

      if (socket) {
        socket.off('roomJoined', handleRoomJoined);
        socket.off('playerJoined', handlePlayerJoined);
        socket.off('playerLeft', handlePlayerLeft);
        socket.off('playerDisconnected', handlePlayerDisconnected);
        socket.off('gameSelected', handleGameSelected);
        socket.off('gameStarted', handleGameStarted);
        socket.off('hostTransferred', handleHostTransferred);
        socket.off('playerKicked', handlePlayerKicked);
        socket.off('error', handleError);

        if (socket.connected && roomCodeRef.current) {
          socket.emit('leaveRoom', { roomCode: roomCodeRef.current });
        }
      }
    };
  }, [socket, socketIsConnected]);

  // Heartbeat
  useEffect(() => {
    if (!socket) return;
    const interval = setInterval(() => {
      if (socket.connected) socket.emit('heartbeat');
    }, 30000);
    return () => clearInterval(interval);
  }, [socket]);

  const handleGameSelect = useCallback(
    (gameType: string): void => {
      if (socket && socketIsConnected && currentIsHost) {
        socket.emit('selectGame', { gameType });
      }
    },
    [socket, socketIsConnected, currentIsHost]
  );

  const handleStartGame = useCallback((): void => {
    if (isStartingGame) return;
    if (socket && socketIsConnected && currentIsHost) {
      setIsStartingGame(true);
      addNotification('Starting game...', 'info');
      socket.emit('startGame', { roomCode: roomCodeRef.current });
      setTimeout(() => setIsStartingGame(false), 5000);
    } else {
      if (!currentIsHost) {
        addNotification('Only the host can start the game.', 'warning');
      } else {
        addNotification('Connection lost. Please refresh the page.', 'error');
      }
    }
  }, [socket, socketIsConnected, currentIsHost, isStartingGame, addNotification]);

  const handleLeaveRoom = useCallback((): void => {
    if (clearLastRoom) clearLastRoom();
    if (socket && socketIsConnected) {
      socket.emit('leaveRoom', { roomCode: roomCodeRef.current });
    }
    if (onLeave) onLeave();
  }, [socket, socketIsConnected, onLeave, clearLastRoom]);

  const handleTransferHost = useCallback(
    (targetPlayerId: string): void => {
      if (socket && socketIsConnected && currentIsHost) {
        socket.emit('transferHost', {
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
          socket.emit('kickPlayer', {
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
      <div className="lobby-header">
        <div className="header-left-actions">
          <button onClick={handleLeaveRoom} className="leave-button">
            Leave Room
          </button>
          {isAuthenticated && (
            <button
              onClick={() => setShowProfileSettings(true)}
              className="profile-settings-btn"
              title="Profile Settings"
            >
              ⚙️ Profile
            </button>
          )}
        </div>

        <div className="room-info-header">
          {roomData?.streamer_mode ? (
            <div className="room-code-display streamer-mode">
              {showRoomCode ? roomCode : '••••••'}
              {currentIsHost && (
                <button
                  className="toggle-code-btn"
                  onClick={() => setShowRoomCode(!showRoomCode)}
                  title={showRoomCode ? 'Hide code' : 'Show code'}
                >
                  {showRoomCode ? '🙈' : '👁️'}
                </button>
              )}
            </div>
          ) : (
            <div className="room-code-display">{roomCode}</div>
          )}
          <div className="room-status-section">
            <div className="room-status-display">
              <span className="status-label">Status:</span>
              <span className={`status-badge status-${roomStatus}`}>
                {roomStatus
                  .replace(/_/g, ' ')
                  .replace(/\b\w/g, (l) => l.toUpperCase())}
              </span>
            </div>
          </div>
          <div className="room-actions">
            {!roomData?.streamer_mode && (
              <>
                <button
                  className="copy-btn"
                  onClick={() => navigator.clipboard.writeText(roomCode)}
                >
                  📋 Copy Code
                </button>
                <button
                  className="copy-link-btn"
                  onClick={() => {
                    const roomUrl = `${window.location.origin}/?join=${roomCode}`;
                    navigator.clipboard.writeText(roomUrl);
                  }}
                >
                  🔗 Copy Link
                </button>
              </>
            )}
          </div>
        </div>

        <div style={{ width: '180px' }}></div>
      </div>

      <ProfileSettingsModal
        isOpen={showProfileSettings}
        onClose={() => setShowProfileSettings(false)}
        roomCode={roomCode}
        isPremium={isPremium}
      />

      <div className="lobby-content">
        <div className="players-section">
          <div className="section-header">
            <h3 className="section-title">Players in Room</h3>
          </div>
          <div className="players-grid">
            {playersWithStatus.map((player) => {
              const { playerStatus, countdownTime, isDisconnectedWithTimer } = player;
              return (
                <div
                  key={player.id}
                  className={`player-card ${player.isHost ? 'host' : ''} ${playerStatus.status} ${isDisconnectedWithTimer ? 'disconnecting' : ''} ${player.role === 'admin' ? 'premium-admin' : player.premiumTier === 'lifetime' ? 'premium-lifetime' : player.premiumTier === 'monthly' ? 'premium-monthly' : ''}`}
                >
                  <div className="player-card-content">
                    <div className="player-avatar">
                      <Avatar
                        url={player.avatarUrl}
                        avatarStyle={player.avatarStyle}
                        avatarSeed={player.avatarSeed}
                        avatarOptions={player.avatarOptions}
                        name={player.name}
                        size={120}
                        isPremium={player.role === 'admin' || player.premiumTier !== 'free'}
                        className="avatar-image"
                      />
                    </div>
                    <div className="player-info">
                      <span className="player-name">{player.name}</span>
                      <div className="player-badges">
                        <span className="level-badge-lobby">Lvl {player.level}</span>
                        {player.isGuest ? (
                          <span className="guest-badge">GUEST</span>
                        ) : player.role === 'admin' ? (
                          <span className="premium-badge lifetime">💻 ADMIN</span>
                        ) : player.premiumTier === 'lifetime' ? (
                          <span className="premium-badge lifetime">PREMIUM</span>
                        ) : player.premiumTier === 'monthly' ? (
                          <span className="premium-badge monthly">PRO</span>
                        ) : null}
                        {player.isHost && <span className="host-badge">Host</span>}
                        <span
                          className="status-badge"
                          style={{ backgroundColor: playerStatus.color }}
                        >
                          {playerStatus.icon} {playerStatus.label}
                        </span>
                        {isDisconnectedWithTimer && (
                          <span className="countdown-badge">⏱️ {countdownTime}s</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {currentIsHost && !player.isHost && !isDisconnectedWithTimer && (
                    <div className="player-actions">
                      <button className="make-host-btn" onClick={() => handleTransferHost(player.id)}>
                        👑 Make Host
                      </button>
                      <button
                        className="kick-player-btn"
                        onClick={() => handleKickPlayer(player.id, player.name)}
                      >
                        👢 Kick
                      </button>
                    </div>
                  )}
                  {/* Add Friend Button - only show for logged-in players who aren't guests or already friends */}
                  {isAuthenticated && user?.id !== player.id && !player.isGuest && (() => {
                    const friendStatus = getFriendshipStatus(player.id);
                    if (friendStatus === 'friends') return null;
                    if (friendStatus === 'sent') {
                      return (
                        <div className="player-friend-actions">
                          <button className="add-friend-btn pending" disabled>
                            ⏳ Request Sent
                          </button>
                        </div>
                      );
                    }
                    if (friendStatus === 'received') {
                      return (
                        <div className="player-friend-actions">
                          <button
                            className="add-friend-btn accept"
                            onClick={() => handleAcceptFriendRequest(player.id, player.name)}
                            disabled={sendingFriendRequest.has(player.id)}
                          >
                            {sendingFriendRequest.has(player.id) ? '...' : '✓ Accept Friend'}
                          </button>
                        </div>
                      );
                    }
                    return (
                      <div className="player-friend-actions">
                        <button
                          className="add-friend-btn"
                          onClick={() => handleSendFriendRequest(player.id, player.name)}
                          disabled={sendingFriendRequest.has(player.id)}
                        >
                          {sendingFriendRequest.has(player.id) ? '...' : '➕ Add Friend'}
                        </button>
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </div>

        <div className="game-section">
          <h3 className="section-title">Game Selection</h3>
          {!selectedGame ? (
            <GamePicker
              onGameSelect={handleGameSelect}
              isHost={currentIsHost}
              disabled={!socket || !socketIsConnected}
            />
          ) : (
            <>
              <div className="selected-game-card">
                <div className="game-icon">
                  {selectedGameInfo?.thumbnailUrl && !imageError ? (
                    <img
                      src={selectedGameInfo.thumbnailUrl}
                      alt={selectedGameInfo.name || ''}
                      style={{ width: '100px', height: '100px', objectFit: 'contain' }}
                      onError={() => setImageError(true)}
                    />
                  ) : (
                    selectedGameInfo?.icon || '🎮'
                  )}
                </div>
                <div className="game-details">
                  <h4>{selectedGameInfo?.name}</h4>
                  <p>{selectedGameInfo?.description}</p>
                </div>
              </div>

              <div className="game-controls">
                {currentIsHost ? (
                  <>
                    <button
                      onClick={handleStartGame}
                      className="start-game-button"
                      disabled={!socket || !socketIsConnected || isStartingGame}
                    >
                      {isStartingGame ? 'Starting...' : 'Start Game'}
                    </button>
                    <button
                      onClick={() => setSelectedGame(null)}
                      className="change-game-btn"
                    >
                      Change Game
                    </button>
                  </>
                ) : (
                  <div style={{ textAlign: 'center', color: '#aaa' }}>
                    <p>Waiting for host to start...</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="lobby-extras">
          <ChatWindow
            messages={messages}
            onSendMessage={handleSendMessage}
            currentPlayerName={playerNameRef.current}
          />
          <TugOfWar playerName={playerNameRef.current} />
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
