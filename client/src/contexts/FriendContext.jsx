import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import socketService from '../utils/socket';
import { getSupabaseClient } from '../utils/supabase';
import { useParams, useLocation } from 'react-router-dom';

const FriendContext = createContext({});

export const FriendProvider = ({ children }) => {
  const { user, session } = useAuth();
  const { roomCode } = useParams(); // Get roomCode from URL
  const location = useLocation(); // Get current location object

  const isCurrentlyInLobby = location.pathname.startsWith('/lobby/') && !!roomCode;
  const currentRoomCode = roomCode; // Define currentRoomCode explicitly
  // TODO: Implement logic to get current gameId if needed for invites
  const currentLobbyGameName = "Current Game"; // Placeholder for now

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

  // Socket logic
  useEffect(() => {
    if (!user) {
      setFriends([]);
      setPendingRequests([]);
      setOnlineFriends(new Set());
      return;
    }

    // Connect socket
    const socket = socketService.connect();

    // Identify user to server
    const identifyUser = () => {
      console.log('👤 [FRIENDS] Identifying user to socket:', user.id);
      socket.emit('user:identify', user.id);
    };

    if (socket.connected) {
      identifyUser();
    } else {
      socket.on('connect', identifyUser);
    }

    // Listeners
    socket.on('friend:list-online', ({ onlineUserIds }) => {
      setOnlineFriends(new Set(onlineUserIds));
    });

    socket.on('friend:online', ({ userId }) => {
      setOnlineFriends(prev => new Set(prev).add(userId));
    });

    socket.on('friend:offline', ({ userId }) => {
      setOnlineFriends(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    });

    socket.on('game:invite_received', (invite) => {
      console.log('💌 [FRIENDS] Game invite received:', invite);
      setGameInvites(prev => [...prev, { ...invite, id: Date.now() }]);
      // You might want to trigger a toast notification here
    });

    // Refresh lists on updates
    socket.on('friend:request_received', () => {
      fetchFriends();
    });

    socket.on('friend:accepted', () => {
      fetchFriends();
    });

    // Initial fetch
    fetchFriends();

    return () => {
      socket.off('connect', identifyUser);
      socket.off('friend:list-online');
      socket.off('friend:online');
      socket.off('friend:offline');
      socket.off('game:invite_received');
      socket.off('friend:request_received');
      socket.off('friend:accepted');
    };
  }, [user, fetchFriends]);

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

  const inviteFriend = (friendId, roomId, gameName) => {
    const socket = socketService.connect();
    socket.emit('game:invite', {
      friendId,
      roomId,
      gameName: gameName || 'Unknown Game',
      hostName: user.username // Use display name if preferred
    });
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
    currentLobbyGameName
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
