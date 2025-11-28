import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useSocket } from './LazySocketContext';
import type { GameInviteReceivedPayload } from '@shared/types';
import { SOCKET_EVENTS, SERVER_EVENTS } from '@shared/constants';

export interface Friend {
  id: string;
  user_id: string;
  friend_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  premium_tier: string;
  level: number;
  friendshipId?: string;
}

export interface PendingRequest {
  id: string;
  from_user_id: string;
  from_username: string;
  from_display_name: string;
  from_avatar_url: string | null;
  created_at: string;
  type?: 'sent' | 'received';
  user?: { username: string };
}

interface GameInvite extends GameInviteReceivedPayload {
  id: number;
}

interface LobbyInfo {
  roomCode: string | null;
  gameName: string | null;
  gameThumbnail: string | null;
}

interface ActionResult {
  success: boolean;
  message?: string;
  error?: string;
}

// BUG FIX #20: Granular loading states for better UX
interface LoadingStates {
  fetchingFriends: boolean;
  sendingRequest: boolean;
  acceptingRequest: string | null; // requestId being accepted
  rejectingRequest: string | null; // requestId being rejected
  removingFriend: string | null;   // friendshipId being removed
}

interface FriendContextValue {
  friends: Friend[];
  pendingRequests: PendingRequest[];
  onlineFriends: Set<string>;
  loading: boolean;
  loadingStates: LoadingStates; // BUG FIX #20: Expose granular loading states
  gameInvites: GameInvite[];
  sendFriendRequest: (username: string) => Promise<ActionResult>;
  sendFriendRequestById: (targetUserId: string) => Promise<ActionResult>;
  acceptFriendRequest: (requestId: string) => Promise<ActionResult>;
  rejectFriendRequest: (requestId: string) => Promise<ActionResult>;
  removeFriend: (friendshipId: string) => Promise<ActionResult>;
  inviteFriend: (friendId: string, roomId: string, gameName?: string, gameThumbnail?: string | null) => void;
  dismissInvite: (inviteId: number) => void;
  fetchFriends: () => Promise<void>;
  isCurrentlyInLobby: boolean;
  currentRoomCode: string | null;
  currentLobbyGameName: string;
  currentLobbyThumbnail: string | null;
  updateLobbyInfo: (roomCode: string | null, gameName?: string | null, gameThumbnail?: string | null) => void;
  // FriendList UI state (for mobile bottom nav integration)
  isFriendListOpen: boolean;
  setIsFriendListOpen: (open: boolean) => void;
  toggleFriendList: () => void;
}

const FriendContext = createContext<FriendContextValue | undefined>(undefined);

interface FriendProviderProps {
  children: ReactNode;
}

export const FriendProvider: React.FC<FriendProviderProps> = ({ children }) => {
  const { user, session } = useAuth();
  const { socket, connectForUser } = useSocket();

  const [lobbyInfo, setLobbyInfo] = useState<LobbyInfo>({
    roomCode: null,
    gameName: null,
    gameThumbnail: null,
  });

  const isCurrentlyInLobby = !!lobbyInfo.roomCode;
  const currentRoomCode = lobbyInfo.roomCode;
  const currentLobbyGameName = lobbyInfo.gameName || 'Current Game';
  const currentLobbyThumbnail = lobbyInfo.gameThumbnail;

  const updateLobbyInfo = useCallback(
    (roomCode: string | null, gameName: string | null = null, gameThumbnail: string | null = null) => {
      setLobbyInfo((prev) => {
        if (prev.roomCode === roomCode && prev.gameName === gameName && prev.gameThumbnail === gameThumbnail) {
          return prev;
        }
        return { roomCode, gameName, gameThumbnail };
      });
    },
    []
  );

  const [friends, setFriends] = useState<Friend[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [onlineFriends, setOnlineFriends] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [gameInvites, setGameInvites] = useState<GameInvite[]>([]);
  const [isFriendListOpen, setIsFriendListOpen] = useState(false);

  // BUG FIX #20: Granular loading states
  const [loadingStates, setLoadingStates] = useState<LoadingStates>({
    fetchingFriends: false,
    sendingRequest: false,
    acceptingRequest: null,
    rejectingRequest: null,
    removingFriend: null,
  });

  const toggleFriendList = useCallback(() => {
    setIsFriendListOpen(prev => !prev);
  }, []);

  const fetchFriends = useCallback(async (): Promise<void> => {
    if (!user || !session) return;

    setLoading(true);
    // BUG FIX #20: Set granular loading state
    setLoadingStates(prev => ({ ...prev, fetchingFriends: true }));
    try {
      const headers = {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      };

      const [friendsRes, pendingRes] = await Promise.all([
        fetch('/api/friends', { headers }),
        fetch('/api/friends/pending', { headers }),
      ]);

      if (friendsRes.ok) {
        const data = await friendsRes.json();
        setFriends(data.friends || []);
      }

      if (pendingRes.ok) {
        const data = await pendingRes.json();
        setPendingRequests(data.pending || []);
      }
    } catch (error) {
      console.error('❌ [FRIENDS] Fetch error:', error);
    } finally {
      setLoading(false);
      setLoadingStates(prev => ({ ...prev, fetchingFriends: false }));
    }
  }, [user, session]);

  useEffect(() => {
    if (!user) {
      setFriends([]);
      setPendingRequests([]);
      setOnlineFriends(new Set());
      return;
    }

    connectForUser(user.id);

    if (!socket) {
      return;
    }

    const handleListOnline = ({ onlineUserIds }: { onlineUserIds: string[] }): void => {
      console.log('🟢 [FRIENDS] Received online list:', onlineUserIds);
      setOnlineFriends(new Set(onlineUserIds));
    };

    const handleFriendOnline = ({ userId }: { userId: string }): void => {
      console.log('🟢 [FRIENDS] Friend came online:', userId);
      setOnlineFriends((prev) => {
        const newSet = new Set(prev);
        newSet.add(userId);
        return newSet;
      });
    };

    const handleFriendOffline = ({ userId }: { userId: string }): void => {
      console.log('⚪ [FRIENDS] Friend went offline:', userId);
      setOnlineFriends((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    };

    const handleGameInvite = (invite: GameInviteReceivedPayload): void => {
      console.log('💌 [FRIENDS] Game invite received:', invite);
      setGameInvites((prev) => [...prev, { ...invite, id: Date.now() }]);
    };

    const handleRequestReceived = (): void => {
      fetchFriends();
    };

    const handleAccepted = (): void => {
      fetchFriends();
    };

    socket.on(SERVER_EVENTS.FRIEND.LIST_ONLINE, handleListOnline);
    socket.on(SERVER_EVENTS.FRIEND.ONLINE, handleFriendOnline);
    socket.on(SERVER_EVENTS.FRIEND.OFFLINE, handleFriendOffline);
    socket.on(SERVER_EVENTS.GAME.INVITE_RECEIVED, handleGameInvite);
    socket.on(SERVER_EVENTS.FRIEND.REQUEST_RECEIVED, handleRequestReceived);
    socket.on(SERVER_EVENTS.FRIEND.ACCEPTED, handleAccepted);

    fetchFriends();

    return () => {
      socket.off(SERVER_EVENTS.FRIEND.LIST_ONLINE, handleListOnline);
      socket.off(SERVER_EVENTS.FRIEND.ONLINE, handleFriendOnline);
      socket.off(SERVER_EVENTS.FRIEND.OFFLINE, handleFriendOffline);
      socket.off(SERVER_EVENTS.GAME.INVITE_RECEIVED, handleGameInvite);
      socket.off(SERVER_EVENTS.FRIEND.REQUEST_RECEIVED, handleRequestReceived);
      socket.off(SERVER_EVENTS.FRIEND.ACCEPTED, handleAccepted);
    };
  }, [user, socket, connectForUser, fetchFriends]);

  const sendFriendRequest = async (username: string): Promise<ActionResult> => {
    // BUG FIX #20: Set loading state for sending request
    setLoadingStates(prev => ({ ...prev, sendingRequest: true }));
    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      fetchFriends();
      return { success: true, message: data.message };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    } finally {
      setLoadingStates(prev => ({ ...prev, sendingRequest: false }));
    }
  };

  const sendFriendRequestById = async (targetUserId: string): Promise<ActionResult> => {
    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ targetUserId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      fetchFriends();
      return { success: true, message: data.message };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  };

  const acceptFriendRequest = async (requestId: string): Promise<ActionResult> => {
    // BUG FIX #20: Track which request is being accepted
    setLoadingStates(prev => ({ ...prev, acceptingRequest: requestId }));
    try {
      const res = await fetch(`/api/friends/${requestId}/accept`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      fetchFriends();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    } finally {
      setLoadingStates(prev => ({ ...prev, acceptingRequest: null }));
    }
  };

  const rejectFriendRequest = async (requestId: string): Promise<ActionResult> => {
    // BUG FIX #20: Track which request is being rejected
    setLoadingStates(prev => ({ ...prev, rejectingRequest: requestId }));
    try {
      const res = await fetch(`/api/friends/${requestId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      fetchFriends();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    } finally {
      setLoadingStates(prev => ({ ...prev, rejectingRequest: null }));
    }
  };

  const removeFriend = async (friendshipId: string): Promise<ActionResult> => {
    // BUG FIX #20: Track which friend is being removed
    setLoadingStates(prev => ({ ...prev, removingFriend: friendshipId }));
    try {
      const res = await fetch(`/api/friends/${friendshipId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      fetchFriends();
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    } finally {
      setLoadingStates(prev => ({ ...prev, removingFriend: null }));
    }
  };

  const inviteFriend = (
    friendId: string,
    roomId: string,
    gameName?: string,
    gameThumbnail: string | null = null
  ): void => {
    console.log('📨 [FRIENDS] inviteFriend called:', { friendId, roomId, gameName, gameThumbnail });

    if (!socket) {
      console.warn('📨 [FRIENDS] Cannot send invite - socket not connected');
      return;
    }

    const inviteData = {
      targetUserId: friendId,
      roomCode: roomId,
      gameName: gameName || 'Unknown Game',
      gameThumbnail: gameThumbnail || undefined,
    };
    console.log('📨 [FRIENDS] Emitting game:invite with data:', inviteData);
    socket.emit(SOCKET_EVENTS.GAME.INVITE, inviteData);
  };

  const dismissInvite = (inviteId: number): void => {
    setGameInvites((prev) => prev.filter((i) => i.id !== inviteId));
  };

  const value: FriendContextValue = {
    friends,
    pendingRequests,
    onlineFriends,
    loading,
    loadingStates, // BUG FIX #20: Expose granular loading states
    gameInvites,
    sendFriendRequest,
    sendFriendRequestById,
    acceptFriendRequest,
    rejectFriendRequest,
    removeFriend,
    inviteFriend,
    dismissInvite,
    fetchFriends,
    isCurrentlyInLobby,
    currentRoomCode,
    currentLobbyGameName,
    currentLobbyThumbnail,
    updateLobbyInfo,
    isFriendListOpen,
    setIsFriendListOpen,
    toggleFriendList,
  };

  return <FriendContext.Provider value={value}>{children}</FriendContext.Provider>;
};

export const useFriends = (): FriendContextValue => {
  const context = useContext(FriendContext);
  if (!context) {
    throw new Error('useFriends must be used within FriendProvider');
  }
  return context;
};

export default FriendContext;
