import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useSocket } from './LazySocketContext';
import { getSupabaseClient } from '../utils/supabase';

const FriendContext = createContext({});

export const FriendProvider = ({ children }) => {
  const { user, session } = useAuth();
  const { socket, connectForUser } = useSocket();
  
  // Manage lobby state internally since URL doesn't always reflect it (e.g. Streamer Mode)
  const [lobbyInfo, setLobbyInfo] = useState({ roomCode: null, gameName: null, gameThumbnail: null });

  const isCurrentlyInLobby = !!lobbyInfo.roomCode;
  const currentRoomCode = lobbyInfo.roomCode;
  const currentLobbyGameName = lobbyInfo.gameName || "Current Game";
  const currentLobbyThumbnail = lobbyInfo.gameThumbnail;

  const updateLobbyInfo = useCallback((roomCode, gameName = null, gameThumbnail = null) => {
    setLobbyInfo(prev => {
      // Skip update if values haven't changed to prevent unnecessary re-renders
      if (prev.roomCode === roomCode && prev.gameName === gameName && prev.gameThumbnail === gameThumbnail) {
        return prev;
      }
      return { roomCode, gameName, gameThumbnail };
    });
  }, []);

  const [friends, setFriends] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [onlineFriends, setOnlineFriends] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [gameInvites, setGameInvites] = useState([]);

  // Fetch initial data
  const fetchFriends = useCallback(async () => {
    if (!user || !session) return;
    
    setLoading(true);
    try {
      // We use fetch directly because the Supabase client handles auth headers differently for custom endpoints? 
      // Actually, let's try to use the session token in headers for a standard fetch to our backend API.
      // Our backend is at /api/friends which is proxied or served by Express.
      
      const headers = {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      };

      const [friendsRes, pendingRes] = await Promise.all([
        fetch('/api/friends', { headers }),
        fetch('/api/friends/pending', { headers })
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
    }
  }, [user, session]);

  // Socket logic - use shared socket from LazySocketContext
  useEffect(() => {
    if (!user) {
      setFriends([]);
      setPendingRequests([]);
      setOnlineFriends(new Set());
      return;
    }

    // Connect and identify user using shared socket
    connectForUser(user.id);

    // Wait for socket to be available before setting up listeners
    if (!socket) {
      return;
    }

    // Named handlers for proper cleanup
    const handleListOnline = ({ onlineUserIds }) => {
      console.log('🟢 [FRIENDS] Received online list:', onlineUserIds);
      setOnlineFriends(new Set(onlineUserIds));
    };

    const handleFriendOnline = ({ userId }) => {
      console.log('🟢 [FRIENDS] Friend came online:', userId);
      setOnlineFriends(prev => {
        const newSet = new Set(prev);
        newSet.add(userId);
        return newSet;
      });
    };

    const handleFriendOffline = ({ userId }) => {
      console.log('⚪ [FRIENDS] Friend went offline:', userId);
      setOnlineFriends(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    };

    const handleGameInvite = (invite) => {
      console.log('💌 [FRIENDS] Game invite received:', invite);
      console.log('💌 [FRIENDS] Invite details - gameName:', invite.gameName, 'gameThumbnail:', invite.gameThumbnail);
      setGameInvites(prev => [...prev, { ...invite, id: Date.now() }]);
    };

    const handleRequestReceived = () => {
      fetchFriends();
    };

    const handleAccepted = () => {
      fetchFriends();
    };

    // Register event listeners
    socket.on('friend:list-online', handleListOnline);
    socket.on('friend:online', handleFriendOnline);
    socket.on('friend:offline', handleFriendOffline);
    socket.on('game:invite_received', handleGameInvite);
    socket.on('friend:request_received', handleRequestReceived);
    socket.on('friend:accepted', handleAccepted);

    // Initial fetch
    fetchFriends();

    return () => {
      socket.off('friend:list-online', handleListOnline);
      socket.off('friend:online', handleFriendOnline);
      socket.off('friend:offline', handleFriendOffline);
      socket.off('game:invite_received', handleGameInvite);
      socket.off('friend:request_received', handleRequestReceived);
      socket.off('friend:accepted', handleAccepted);
    };
  }, [user, socket, connectForUser, fetchFriends]);

  // Actions
  const sendFriendRequest = async (username) => {
    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      // Refresh pending list
      fetchFriends();
      return { success: true, message: data.message };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const acceptFriendRequest = async (requestId) => {
    try {
      const res = await fetch(`/api/friends/${requestId}/accept`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      fetchFriends();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const rejectFriendRequest = async (requestId) => {
    try {
      const res = await fetch(`/api/friends/${requestId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      fetchFriends();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const removeFriend = async (friendshipId) => {
    // Re-use delete endpoint
    return rejectFriendRequest(friendshipId);
  };

  const inviteFriend = (friendId, roomId, gameName, gameThumbnail = null) => {
    console.log('📨 [FRIENDS] inviteFriend called:', { friendId, roomId, gameName, gameThumbnail });
    console.log('📨 [FRIENDS] Current lobby state:', { currentLobbyGameName, currentLobbyThumbnail });

    if (!socket) {
      console.warn('📨 [FRIENDS] Cannot send invite - socket not connected');
      return;
    }

    const inviteData = {
      friendId,
      roomId,
      gameName: gameName || 'Unknown Game',
      gameThumbnail,
      hostName: user.username
    };
    console.log('📨 [FRIENDS] Emitting game:invite with data:', inviteData);
    socket.emit('game:invite', inviteData);
  };

  const dismissInvite = (inviteId) => {
    setGameInvites(prev => prev.filter(i => i.id !== inviteId));
  };

  const value = {
    friends,
    pendingRequests,
    onlineFriends, // This is a Set
    loading,
    gameInvites,
    sendFriendRequest,
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
    updateLobbyInfo
  };

  return (
    <FriendContext.Provider value={value}>
      {children}
    </FriendContext.Provider>
  );
};

export const useFriends = () => {
  const context = useContext(FriendContext);
  if (!context) {
    throw new Error('useFriends must be used within FriendProvider');
  }
  return context;
};

export default FriendContext;
