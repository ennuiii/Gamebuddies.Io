import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../contexts/LazySocketContext';
import { useNotification } from '../contexts/NotificationContext'; // Import useNotification hook
import GamePicker from './GamePicker';
import { useRealtimeSubscription } from '../utils/useRealtimeSubscription';
import { getSupabaseClient } from '../utils/supabase';
import './RoomLobby.css';

const RoomLobby = ({ roomCode, playerName, isHost, onLeave }) => {
  const { socket, socketId, isConnected: socketIsConnected, connectSocket } = useSocket();
  const { addNotification } = useNotification(); // Get addNotification function
  const [players, setPlayers] = useState([]);
  const [selectedGame, setSelectedGame] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null); // This local error state might still be useful for critical, view-blocking errors
  const [roomData, setRoomData] = useState(null);
  // const [connectionStatus, setConnectionStatus] = useState('connecting'); // Replaced by socketIsConnected
  const [currentIsHost, setCurrentIsHost] = useState(isHost); // State for re-rendering
  const [roomStatus, setRoomStatus] = useState('waiting_for_players');
  const [isStartingGame, setIsStartingGame] = useState(false);
  const [disconnectedTimers, setDisconnectedTimers] = useState(new Map()); // Track disconnect timers
  
  // Use refs for values that shouldn't trigger re-renders
  const roomCodeRef = useRef(roomCode);
  const playerNameRef = useRef(playerName);
  const currentUserIdRef = useRef(null);
  const roomIdRef = useRef(null);
  const timerIntervalsRef = useRef(new Map()); // Track timer intervals
  const roomVersionRef = useRef(0); // Latest applied room version

  // TODO: Review if connectionStatus local state is still needed or if socketIsConnected from context is enough.
  // For now, let's try to use socketIsConnected directly.

  // Function to start disconnect countdown for a player
  const startDisconnectCountdown = (playerId) => {
    const startTime = Date.now();
    const countdownDuration = 10000; // 10 seconds
    
    // Clear any existing timer for this player
    if (timerIntervalsRef.current.has(playerId)) {
      clearInterval(timerIntervalsRef.current.get(playerId));
    }
    
    // Set initial countdown
    setDisconnectedTimers(prev => new Map(prev.set(playerId, 10)));
    
    // Start countdown interval
    const intervalId = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, Math.ceil((countdownDuration - elapsed) / 1000));
      
      setDisconnectedTimers(prev => {
        const newMap = new Map(prev);
        if (remaining > 0) {
          newMap.set(playerId, remaining);
        } else {
          newMap.delete(playerId);
        }
        return newMap;
      });
      
      // Clear interval when countdown reaches 0
      if (remaining <= 0) {
        clearInterval(intervalId);
        timerIntervalsRef.current.delete(playerId);
      }
    }, 1000);
    
    timerIntervalsRef.current.set(playerId, intervalId);
  };

  // Function to clear disconnect countdown for a player
  const clearDisconnectCountdown = (playerId) => {
    if (timerIntervalsRef.current.has(playerId)) {
      clearInterval(timerIntervalsRef.current.get(playerId));
      timerIntervalsRef.current.delete(playerId);
    }
    setDisconnectedTimers(prev => {
      const newMap = new Map(prev);
      newMap.delete(playerId);
      return newMap;
    });
  };

  // Realtime subscription for room members status updates
  useRealtimeSubscription({
    table: 'room_members',
    filters: roomIdRef.current ? { filter: `room_id=eq.${roomIdRef.current}` } : {},
    enabled: !!roomIdRef.current, // Only enable when we have a room ID
    onUpdate: (newRecord, oldRecord) => {
      console.log('🔔 [REALTIME] Room member updated:', { newRecord, oldRecord });
      
      // Update the specific player in the players array
      setPlayers(prevPlayers => 
        prevPlayers.map(player => {
          if (player.id === newRecord.user_id) {
            return {
              ...player,
              isConnected: newRecord.is_connected,
              inGame: newRecord.in_game,
              currentLocation: newRecord.current_location,
              lastPing: newRecord.last_ping
            };
          }
          return player;
        })
      );
    },
    onInsert: (newRecord) => {
      console.log('🔔 [REALTIME] New room member:', newRecord);
      // Handle new player joining - this might need additional user data fetch
      fetchUpdatedPlayerList();
    },
    onDelete: (deletedRecord) => {
      console.log('🔔 [REALTIME] Room member left:', deletedRecord);
      // Remove player from list
      setPlayers(prevPlayers => 
        prevPlayers.filter(player => player.id !== deletedRecord.user_id)
      );
    },
    dependencies: [roomIdRef.current]
  });

  // Realtime subscription for room status changes
  useRealtimeSubscription({
    table: 'rooms',
    filters: roomIdRef.current ? { filter: `id=eq.${roomIdRef.current}` } : {},
    enabled: !!roomIdRef.current, // Only enable when we have a room ID
    onUpdate: (newRecord, oldRecord) => {
      console.log('🔔 [REALTIME] Room updated:', { newRecord, oldRecord });
      
      // Update room data and status
      setRoomData(newRecord);
      setRoomStatus(newRecord.status);
      
      // Update selected game if it changed
      if (newRecord.current_game !== oldRecord.current_game) {
        setSelectedGame(newRecord.current_game !== 'lobby' ? newRecord.current_game : null);
      }
    },
    dependencies: [roomIdRef.current]
  });

  // Function to fetch updated player list with user data
  const fetchUpdatedPlayerList = async () => {
    if (!roomIdRef.current) return;
    
    try {
      const supabase = await getSupabaseClient();
      if (!supabase) {
        console.error('❌ Cannot fetch player list - Supabase client not available');
        return;
      }

      const { data: roomMembers, error } = await supabase
        .from('room_members')
        .select(`
          user_id,
          role,
          is_connected,
          in_game,
          current_location,
          last_ping,
          user:users(username, display_name)
        `)
        .eq('room_id', roomIdRef.current);

      if (error) throw error;

      const mappedPlayers = roomMembers?.map(member => ({
        id: member.user_id,
        name: member.user?.display_name || member.user?.username,
        isHost: member.role === 'host',
        isConnected: member.is_connected,
        inGame: member.in_game,
        currentLocation: member.current_location,
        lastPing: member.last_ping
      })) || [];

      setPlayers(mappedPlayers);
    } catch (error) {
      console.error('❌ Error fetching updated player list:', error);
    }
  };

  useEffect(() => {
    // Ensure socket connection when RoomLobby mounts
    if (!socket) {
      console.log('🟡 [RoomLobby] Socket not available, connecting...');
      const activeSocket = connectSocket();
      if (!activeSocket) {
        setError('Failed to establish connection to server');
        setIsLoading(false);
        return;
      }
      // Wait for the socket to be available through context
      setIsLoading(true);
      return;
    }
    
    // If socket is available but not connected, reflect this.
    if (!socketIsConnected) {
      console.log('🟡 [RoomLobby] Socket available, but not connected. Current status:', socketIsConnected);
      setIsLoading(true); // Show loading until socket connects
      // The SocketProvider handles connection attempts.
      // We just wait here.
      return;
    }

    // Socket is available and connected
    console.log('🔌 [RoomLobby] Socket connected, setting up event listeners. Socket ID:', socket.id);
    setIsLoading(true); // Start loading until roomJoined is received

    // Named event handlers for proper cleanup
    const handleConnect = () => {
      // This is mostly handled by SocketProvider, but we can log here if specific lobby actions are needed on raw connect
      console.log('✅ [CLIENT] Connected to server in lobby (via RoomLobby listener for existing socket)');
      console.log('🔍 [CLIENT DEBUG] Socket ID:', socket.id);
      console.log('🔍 [CLIENT DEBUG] Room code:', roomCodeRef.current);
      console.log('🔍 [CLIENT DEBUG] Player name:', playerNameRef.current);
      
      // Join the room - this is the primary action once the socket is confirmed connected
      console.log('📤 [LOBBY DEBUG] Sending joinRoom event...');
      socket.emit('joinRoom', {
        roomCode: roomCodeRef.current,
        playerName: playerNameRef.current
      });
      console.log('📤 [CLIENT] joinRoom event sent from lobby');
    };

    // If the socket from context is already connected when this component mounts, call handleConnect.
    // Otherwise, the 'connect' event on the socket itself (handled by SocketProvider or a direct listener here)
    // will trigger the join.
    if (socketIsConnected) {
       handleConnect(); // Immediately try to join if socket is already connected.
    } else {
      // If socket is not connected, we rely on SocketProvider's 'connect' event
      // or add a one-time listener here if needed (though SocketProvider should cover it)
      socket.once('connect', handleConnect);
    }


    const handleDisconnect = (reason) => {
      console.log('❌ [LOBBY DEBUG] Disconnected from server (handled in RoomLobby):', {
        reason,
        roomCode: roomCodeRef.current,
        playerName: playerNameRef.current,
        timestamp: new Date().toISOString()
      });
      // SocketProvider handles setIsConnected(false).
      // setError('Connection lost. Please refresh the page.'); // Critical error, might still use setError
      addNotification('Connection to server lost. Attempting to reconnect...', 'error');
      setIsLoading(true); // Show loading as we are disconnected
    };

    const handleConnectError = (error) => {
      console.error('❌ [LOBBY DEBUG] Connection error (handled in RoomLobby):', {
        error: error.message,
        roomCode: roomCodeRef.current,
        playerName: playerNameRef.current,
        timestamp: new Date().toISOString()
      });
      // setError('Failed to connect to server. Please try again.'); // Critical error
      addNotification('Failed to connect to server. Please check your internet connection.', 'error');
      setIsLoading(false);
    };

    const handleRoomJoined = (data) => {
      console.log('✅ [CLIENT] Successfully joined room in lobby:', data);
      console.log('🔍 [CLIENT DEBUG] Lobby join data:', {
        roomCode: data.roomCode,
        playerCount: data.players?.length || 0,
        room_id: data.room?.id,
        game_type: data.room?.game_type
      });
      console.log('🔍 [LOBBY DEBUG] Room joined details:', {
        roomCode: data.roomCode,
        isHost: data.isHost,
        playerCount: data.players?.length || 0,
        roomId: data.room?.id,
        gameType: data.room?.game_type,
        roomStatus: data.room?.status,
        participants: data.players?.map(p => ({
          id: p.id,
          name: p.name,
          isHost: p.isHost,
          isConnected: p.isConnected,
          inGame: p.inGame,
          currentLocation: p.currentLocation
        })) || [],
        timestamp: new Date().toISOString()
      });
      
      // Map players with full status information
      const mappedPlayers = data.players?.map(p => ({
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        isConnected: p.isConnected !== undefined ? p.isConnected : true,
        inGame: p.inGame || false,
        currentLocation: p.currentLocation || (p.isConnected ? 'lobby' : 'disconnected'),
        lastPing: p.lastPing
      })) || [];
      
      setPlayers(mappedPlayers);
      setRoomData(data.room);
      setRoomStatus(data.room?.status || 'waiting_for_players');
      setSelectedGame(data.room?.game_type !== 'lobby' ? data.room.game_type : null);
      
      // Set room ID for Realtime subscription
      roomIdRef.current = data.room?.id;
      console.log('🔔 [REALTIME] Room ID set for subscription:', roomIdRef.current);
      
      // Update host status based on server response
      const currentUser = mappedPlayers.find(p => p.name === playerNameRef.current);
      if (currentUser) {
        console.log(`🔍 [CLIENT DEBUG] Initial host status: ${playerNameRef.current} is host: ${currentUser.isHost}`);
              console.log(`🔍 [LOBBY DEBUG] Host status update:`, {
        playerName: playerNameRef.current,
        playerId: currentUser.id,
        wasHost: currentIsHost,
        nowHost: currentUser.isHost,
        changed: currentIsHost !== currentUser.isHost
      });
      setCurrentIsHost(currentUser.isHost);
      currentUserIdRef.current = currentUser.id; // Store user ID for session storage
    }
    
    // Auto-update room status based on host location after initial join
    updateRoomStatusBasedOnHost(mappedPlayers);
    
    setIsLoading(false); // Successfully joined, stop loading
    setError(null);
    };

    const handlePlayerJoined = (data) => {
      console.log('👋 Player joined:', data.player.name);
      const updatedPlayers = data.players || [];
      setPlayers(updatedPlayers);
      setRoomData(data.room);
      
      // Clear any disconnect countdown for the joined player
      if (data.player?.id) {
        clearDisconnectCountdown(data.player.id);
      }
      
      // Ensure host status is maintained when players join
      const currentUser = updatedPlayers.find(p => p.name === playerNameRef.current);
      if (currentUser) {
        if (currentUser.isHost !== currentIsHost) {
          console.log(`🔍 [CLIENT DEBUG] Host status sync: ${playerNameRef.current} is host: ${currentUser.isHost}`);
          setCurrentIsHost(currentUser.isHost);
        }
        // Update user ID if not already set
        if (!currentUserIdRef.current) {
          currentUserIdRef.current = currentUser.id;
        }
      }
      
      // Auto-update room status based on host location
      updateRoomStatusBasedOnHost(updatedPlayers);
    };

    const handlePlayerStatusUpdated = (data) => {
      console.log('🔄 Player status updated:', data);
      
      // Map the players using the updated room participants
      const mappedPlayers = data.room?.participants?.map(p => ({
        id: p.user_id,
        name: p.user?.display_name || p.user?.username,
        isHost: p.role === 'host',
        isConnected: p.is_connected,
        inGame: p.in_game,
        currentLocation: p.current_location,
        lastPing: p.last_ping
      })) || [];
      
      setPlayers(mappedPlayers);
      setRoomData(data.room);
      
      // Handle host transfer if included in the update
      if (data.hostTransfer) {
        console.log('👑 Host transfer detected in status update:', data.hostTransfer);
        
        // Update local host status if current user is affected
        const currentUser = mappedPlayers.find(p => p.name === playerNameRef.current);
        if (currentUser) {
          const newHostStatus = currentUser.isHost;
          console.log(`🔍 [CLIENT DEBUG] Host status update via external game: ${playerNameRef.current} is now host: ${newHostStatus}`);
          setCurrentIsHost(newHostStatus);
        }
        
        // Show notification about the host transfer
        const reason = data.hostTransfer.reason === 'external_game_disconnect' ? 'disconnected from game' : 
                      data.hostTransfer.reason === 'original_host_left' ? 'left the room' : 
                      'disconnected';
        
        console.log(`👑 [HOST TRANSFER] ${data.hostTransfer.newHostName} is now the host (previous host ${reason})`);
        
        // You could add a toast notification here
        addNotification(`${data.hostTransfer.newHostName} is now the host (previous host ${reason})`, 'info');
      }
      
      // Clear disconnect countdown if player reconnected
      if (data.playerId && data.status === 'connected') {
        clearDisconnectCountdown(data.playerId);
      }
      
      // Auto-update room status based on host location
      updateRoomStatusBasedOnHost(mappedPlayers);
    };

    const handlePlayerLeft = (data) => {
      console.log('👋 Player left:', data);
      
      // Update players list with complete status information
      setPlayers(data.players || []);
      
      // Update room data if provided
      if (data.room) {
        setRoomData(data.room);
      }
      
      console.log(`👋 [LEAVE DEBUG] Updated player list after leave:`, data.players?.map(p => ({
        name: p.name,
        isConnected: p.isConnected,
        currentLocation: p.currentLocation,
        inGame: p.inGame
      })));
    };

    const handlePlayerDisconnected = (data) => {
      console.log('🔌 Player disconnected:', data.playerId);
      
      // If we have updated player list, use it; otherwise update connection status
      if (data.players) {
        setPlayers(data.players);
      } else {
        setPlayers(prev => prev.map(player => 
          player.id === data.playerId 
            ? { ...player, isConnected: false }
            : player
        ));
      }
      
      // Start countdown timer for the disconnected player
      if (data.playerId) {
        startDisconnectCountdown(data.playerId);
      }
    };

    const handleGameSelected = (data) => {
      console.log('🎮 Game selected:', data.gameType);
      setSelectedGame(data.gameType);
    };

    const handleGameStarted = (data) => {
      console.log('🚀 [LOBBY DEBUG] Game starting event received:', {
        gameUrl: data.gameUrl,
        gameType: data.gameType,
        isHost: data.isHost,
        roomCode: data.roomCode,
        currentPlayerName: playerNameRef.current,
        currentIsHost: currentIsHost,
        socketId: socket?.id,
        timestamp: new Date().toISOString()
      });
      
      // Game integration data is passed via URL parameters only
      console.log('🎮 [LOBBY DEBUG] Starting game with URL parameters');
      
      console.log('🎮 [LOBBY DEBUG] Redirecting to game:', data.gameUrl);
      
      // Reset starting state since game is actually starting
      setIsStartingGame(false);
      
      // Properly disconnect socket before navigation to prevent WebSocket errors
      if (socket) {
        console.log('🔌 [LOBBY DEBUG] Disconnecting socket before game redirect...');
        socket.disconnect();
      }
      
      // Small delay to ensure disconnect completes before navigation
      setTimeout(() => {
        // Redirect to game
        window.location.href = data.gameUrl;
      }, 100);
    };

    const handleError = (error) => {
      console.error('❌ [LOBBY DEBUG] Socket error received:', {
        error: error.message || error,
        code: error.code,
        debug: error.debug,
        roomCode: roomCodeRef.current,
        playerName: playerNameRef.current,
        timestamp: new Date().toISOString(),
        // connectionStatus, // This local state is removed
        isLoading,
        currentError: error // Renamed from 'error' to avoid conflict
      });
      
      // Enhanced error handling based on error code
      let userFriendlyMessage = error.message || 'An error occurred';
      let shouldRedirect = false; // Flag for critical errors that require leaving
      
      switch (error.code) {
        case 'ROOM_NOT_FOUND':
          userFriendlyMessage = 'Room not found. It may have expired or been cleaned up.';
          shouldRedirect = true; // Critical error - room doesn't exist
          console.error('🔍 [LOBBY DEBUG] Room not found details:', {
            roomCode: roomCodeRef.current,
            searchedFor: error.debug?.room_code,
            timestamp: error.debug?.search_timestamp
          });
          break;
        case 'ROOM_FULL':
          userFriendlyMessage = 'Room is full. Cannot rejoin at this time.';
          shouldRedirect = true; // Critical error - can't join
          break;
        case 'ROOM_NOT_ACCEPTING':
          userFriendlyMessage = `Room is ${error.debug?.room_status || 'not accepting players'}.`;
          // Don't redirect - show popup and let user stay in lobby
          console.error('🔍 [LOBBY DEBUG] Room not accepting details:', {
            roomStatus: error.debug?.room_status,
            isOriginalCreator: error.debug?.is_original_creator
          });
          break;
        case 'DUPLICATE_PLAYER':
          userFriendlyMessage = 'Player name already in use. Try a different name.';
          shouldRedirect = true; // Critical error - name conflict
          break;
        case 'JOIN_FAILED':
          userFriendlyMessage = 'Failed to join room. Please try refreshing the page.';
          // Don't redirect - let user try actions in lobby
          break;
        case 'KICK_FAILED':
          userFriendlyMessage = error.message || 'Failed to kick player. You may not have permission.';
          // Don't redirect - just show error popup
          break;
        case 'NOT_HOST':
          userFriendlyMessage = 'Only the host can perform this action.';
          // Don't redirect - just show error popup
          break;
        default:
          console.error('🔍 [LOBBY DEBUG] Unknown error code:', error.code);
          // For unknown errors, show popup but don't redirect
      }
      
      // For critical errors, use the error state that redirects
      if (shouldRedirect) {
        setError(userFriendlyMessage);
        setIsLoading(false);
      } else {
        // For non-critical errors, show popup and stay in lobby
        // alert(`⚠️ ${userFriendlyMessage}`);
        addNotification(userFriendlyMessage, 'warning');
        
        // If we were loading, stop the loading state
        if (isLoading) {
          setIsLoading(false);
        }
      }
    };

    const handleHostTransferred = (data) => {
      console.log('👑 Host transferred:', data);
      
      // Update players list with complete status information
      const updatedPlayers = data.players || [];
      setPlayers(updatedPlayers);
      
      // Update room data if provided
      if (data.room) {
        setRoomData(data.room);
      }
      
      // Update local host status - check if current user is the new host
      const currentUser = updatedPlayers.find(p => p.name === playerNameRef.current);
      if (currentUser) {
        const newHostStatus = currentUser.isHost;
        console.log(`🔍 [CLIENT DEBUG] Host status update: ${playerNameRef.current} is now host: ${newHostStatus}`);
        setCurrentIsHost(newHostStatus);
      }
      
      console.log(`👑 [HOST DEBUG] Updated player list after host transfer:`, updatedPlayers.map(p => ({
        name: p.name,
        isHost: p.isHost,
        isConnected: p.isConnected,
        currentLocation: p.currentLocation,
        inGame: p.inGame
      })));
      
      // Show notification
      const reasonText = data.reason === 'original_host_left' ? 'left the room' :
                    data.reason === 'original_host_disconnected' ? 'disconnected' : 'transferred host';
      
      addNotification(`${data.newHostName} is now the host (previous host ${reasonText}).`, 'info');
      
      // Auto-update room status based on new host location
      updateRoomStatusBasedOnHost(updatedPlayers);
    };

    const handleRoomStatusChanged = (data) => {
      console.log('🔄 Room status changed:', data);
      
      // Update room status
      setRoomStatus(data.newStatus);
      setRoomData(data.room);
      
      // If status changed back to waiting_for_players, reset selected game
      if (data.newStatus === 'waiting_for_players') {
        setSelectedGame(null);
      }
      
      // Show notification (you could implement a toast system here)
      addNotification(`Room status changed to '${data.newStatus}' by ${data.changedBy}.`, 'info');
    };

    const handlePlayerKicked = (data) => {
      console.log('👢 [KICK DEBUG] Player kicked event received:', {
        data,
        isNotification: data.isNotification,
        targetUserId: data.targetUserId,
        reason: data.reason,
        timestamp: new Date().toISOString()
      });

      if (data.isNotification) {
        // This is a notification to other players about someone being kicked
        console.log(`👢 [KICK DEBUG] ${data.targetName} was kicked by ${data.kickedBy}`);
        
        // Update players list with complete status information
        setPlayers(data.players || []);
        
        // Update room data if provided
        if (data.room) {
          setRoomData(data.room);
        }
        
        console.log(`👢 [KICK DEBUG] Updated player list after kick:`, data.players?.map(p => ({
          name: p.name,
          isConnected: p.isConnected,
          currentLocation: p.currentLocation,
          inGame: p.inGame
        })));
        
        addNotification(`${data.targetName} was removed from the room by ${data.kickedBy}.`, 'warning');
      } else {
        // This player was kicked personally
        console.log('👢 [KICK DEBUG] You have been kicked from the room:', {
          reason: data.reason,
          kickedBy: data.kickedBy,
          roomCode: data.roomCode
        });
        
        addNotification(`You have been kicked: ${data.reason} (by ${data.kickedBy})`, 'error');

        // Clear socket and leave room
        if (socket) {
          socket.disconnect(); // This should trigger SocketProvider's cleanup for this instance
        }

        // Redirect to homepage
        if (onLeave) {
          onLeave();
        }
      }
    };

    const handleKickFailed = (data) => {
      console.log('👢 [KICK DEBUG] Kick failed event received:', {
        data,
        error: data.error,
        reason: data.reason,
        timestamp: new Date().toISOString()
      });

      addNotification(`Failed to kick player: ${data.reason || data.error || 'Unknown error'}`, 'error');
    };

    // Add event listeners
    // socket.on('connect', handleConnect); // This is implicitly handled by SocketProvider or initial join
    // socket.on('disconnect', handleDisconnect); // SocketProvider handles global disconnect
    // socket.on('connect_error', handleConnectError); // SocketProvider handles global connect_error

    socket.on('roomJoined', handleRoomJoined);
    socket.on('playerJoined', handlePlayerJoined);
    socket.on('playerLeft', handlePlayerLeft);
    socket.on('playerDisconnected', handlePlayerDisconnected);
    socket.on('playerStatusUpdated', handlePlayerStatusUpdated);
    socket.on('gameSelected', handleGameSelected);
    socket.on('gameStarted', handleGameStarted);
    socket.on('hostTransferred', handleHostTransferred);
    socket.on('roomStatusChanged', handleRoomStatusChanged);
    socket.on('playerKicked', handlePlayerKicked);
    socket.on('kickFailed', handleKickFailed);
    socket.on('error', handleError);

    // Cleanup function
    return () => {
      console.log('🧹 [RoomLobby] Cleaning up socket event listeners for RoomLobby instance.');
      
      // Clear all disconnect timers
      timerIntervalsRef.current.forEach(intervalId => {
        clearInterval(intervalId);
      });
      timerIntervalsRef.current.clear();
      setDisconnectedTimers(new Map());
      
      if (socket) {
        // Remove event listeners
        // socket.off('connect', handleConnect);
        // socket.off('disconnect', handleDisconnect);
        // socket.off('connect_error', handleConnectError);
        socket.off('roomJoined', handleRoomJoined);
        socket.off('playerJoined', handlePlayerJoined);
        socket.off('playerLeft', handlePlayerLeft);
        socket.off('playerDisconnected', handlePlayerDisconnected);
        socket.off('playerStatusUpdated', handlePlayerStatusUpdated);
        socket.off('gameSelected', handleGameSelected);
        socket.off('gameStarted', handleGameStarted);
        socket.off('hostTransferred', handleHostTransferred);
        socket.off('roomStatusChanged', handleRoomStatusChanged);
        socket.off('playerKicked', handlePlayerKicked);
        socket.off('kickFailed', handleKickFailed);
        socket.off('error', handleError);
        
        // Emit leaveRoom only if the socket is still connected
        // The main disconnect is handled by SocketProvider when App unmounts
        if (socket.connected) {
          const currentRoomCode = roomCodeRef.current;
          if (currentRoomCode) {
            console.log('📤 [RoomLobby] Emitting leaveRoom on unmount/cleanup for room:', currentRoomCode);
            socket.emit('leaveRoom', { roomCode: currentRoomCode });
          }
        }
      }
    };
  }, [socket, socketIsConnected]); // Effect dependencies: socket instance and its connection status

  // Add beforeunload handler to cleanup WebSocket on navigation
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (socket && socket.connected) {
        console.log('🔌 [LOBBY DEBUG] Cleaning up socket before page unload...');
        socket.disconnect();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [socket]);

  const handleGameSelect = (gameType) => {
    if (socket && socketIsConnected && currentIsHost) {
      console.log('🎮 Selecting game:', gameType);
      socket.emit('selectGame', { gameType });
    }
  };

  const handleStartGame = () => {
    // Prevent multiple rapid clicks
    if (isStartingGame) {
      console.log('🚀 [START GAME DEBUG] Game start already in progress, ignoring click');
      return;
    }
    
    if (socket && socketIsConnected && currentIsHost) {
      console.log('🚀 [START GAME DEBUG] Starting game:', {
        socketConnected: socket.connected, // socketIsConnected from context
        socketId: socket.id, // socketId from context
        roomCode: roomCodeRef.current,
        playerName: playerNameRef.current,
        isHost: currentIsHost,
        // connectionStatus, // Removed
        isStartingGame,
        timestamp: new Date().toISOString()
      });
      
      // Redundant check, socketIsConnected should cover this
      // if (!socket.connected) {
      //   console.error('❌ [START GAME DEBUG] Socket not connected, cannot start game');
      //   addNotification('Connection lost. Please refresh the page and try again.', 'error');
      //   return;
      // }
      
      setIsStartingGame(true);
      addNotification('Starting game...', 'info');
      console.log('📤 [START GAME DEBUG] Emitting startGame event');
      socket.emit('startGame', { roomCode: roomCodeRef.current });
      
      // Reset after a delay to allow for game start
      setTimeout(() => {
        setIsStartingGame(false);
      }, 5000);
      
    } else {
      console.error('❌ [START GAME DEBUG] Cannot start game:', {
        hasSocket: !!socket,
        isHost: currentIsHost,
        socketConnected: socketIsConnected,
        // connectionStatus, // Removed
        isStartingGame
      });
      
      if (!currentIsHost) {
        addNotification('Only the host can start the game.', 'warning');
      } else if (!socket || !socketIsConnected) {
        addNotification('Connection lost. Please refresh the page and try again.', 'error');
      }
    }
  };

  const handleLeaveRoom = () => {
    if (socket && socketIsConnected) {
      socket.emit('leaveRoom', { roomCode: roomCodeRef.current });
    }
    if (onLeave) {
      onLeave();
    }
  };

  const handleTransferHost = (targetPlayerId) => {
    if (socket && socketIsConnected && currentIsHost) {
      console.log('👑 Transferring host to player:', targetPlayerId);
      socket.emit('transferHost', { 
        roomCode: roomCodeRef.current,
        targetUserId: targetPlayerId
      });
    }
  };

  const handleKickPlayer = (targetPlayerId, targetPlayerName) => {
    if (socket && socketIsConnected && currentIsHost) {
      // Confirm kick action
      const confirmed = window.confirm(
        `Are you sure you want to kick ${targetPlayerName} from the room?`
      );
      
      if (confirmed) {
        console.log('👢 [KICK DEBUG] Kicking player:', {
          targetPlayerId,
          targetPlayerName,
          roomCode: roomCodeRef.current,
          timestamp: new Date().toISOString()
        });
        
        socket.emit('kickPlayer', {
          roomCode: roomCodeRef.current,
          targetUserId: targetPlayerId
        });
      } else {
        console.log('👢 [KICK DEBUG] Kick cancelled by host');
      }
    }
  };



  const handleReturnToLobby = () => {
    if (socket && socketIsConnected) {
      console.log('🔄 Player returning to lobby');
      socket.emit('playerReturnToLobby', {
        roomCode: roomCodeRef.current,
        playerName: playerNameRef.current
      });
      
      // If current user is host, automatically update room status to lobby
      if (currentIsHost) {
        console.log('🔄 Host returning to lobby - auto-updating room status');
        // The status will be updated when we receive the playerStatusUpdated event
        // but we can also trigger it immediately for responsiveness
        setTimeout(() => {
          // Re-fetch current player status and update room status
          const currentPlayer = players.find(p => p.name === playerNameRef.current);
          if (currentPlayer) {
            const updatedPlayers = players.map(p => 
              p.name === playerNameRef.current 
                ? { ...p, inGame: false, currentLocation: 'lobby' }
                : p
            );
            updateRoomStatusBasedOnHost(updatedPlayers);
          }
        }, 100);
      }
    }
  };

  // Automatic status management based on host location
  const updateRoomStatusBasedOnHost = (updatedPlayers) => {
    if (!currentIsHost || !socket || !socketIsConnected) return;
    
    const currentHost = updatedPlayers.find(p => p.isHost);
    if (!currentHost) return;
    
    let targetStatus = 'waiting_for_players';
    
    // Determine status based on host location
    if (currentHost.currentLocation === 'game' || currentHost.inGame) {
      targetStatus = 'in_game';
    } else if (currentHost.currentLocation === 'lobby' || (!currentHost.inGame && currentHost.isConnected)) {
      targetStatus = 'waiting_for_players';
    }
    
    // Only update if status needs to change
    if (targetStatus !== roomStatus) {
      console.log('🔄 Auto-updating room status based on host location:', {
        hostLocation: currentHost.currentLocation,
        hostInGame: currentHost.inGame,
        currentStatus: roomStatus,
        newStatus: targetStatus
      });
      
      // Update room status automatically
      socket.emit('autoUpdateRoomStatus', {
        roomCode: roomCodeRef.current,
        newStatus: targetStatus,
        reason: 'host_location_change'
      });
    }
  };

  // Helper function to get player status
  const getPlayerStatus = (player) => {
    console.log(`🔍 [STATUS DEBUG] Getting status for ${player.name}:`, {
      currentLocation: player.currentLocation,
      isConnected: player.isConnected,
      inGame: player.inGame,
      lastPing: player.lastPing
    });

    // Use currentLocation if available, otherwise fall back to old logic
    if (player.currentLocation) {
      switch (player.currentLocation) {
        case 'game':
          return { status: 'in_game', label: 'In Game', color: '#ff6b35', icon: '🎮' };
        case 'lobby':
          return { status: 'lobby', label: 'In Lobby', color: '#4caf50', icon: '🟢' };
        case 'disconnected':
          return { status: 'disconnected', label: 'Offline', color: '#666', icon: '⚫' };
        default:
          console.warn(`🔍 [STATUS DEBUG] Unknown currentLocation: ${player.currentLocation}, falling back to lobby`);
          return { status: 'lobby', label: 'In Lobby', color: '#4caf50', icon: '🟢' };
      }
    }
    
    // Fallback to old logic for backward compatibility
    console.log(`🔍 [STATUS DEBUG] No currentLocation for ${player.name}, using fallback logic`);
    if (!player.isConnected) {
      return { status: 'disconnected', label: 'Offline', color: '#666', icon: '⚫' };
    }
    if (player.inGame) {
      return { status: 'in_game', label: 'In Game', color: '#ff6b35', icon: '🎮' };
    }
    return { status: 'lobby', label: 'In Lobby', color: '#4caf50', icon: '🟢' };
  };

  // Loading state
  if (isLoading || !socketIsConnected) { // Also show loading if socket is not connected yet
    return (
      <div className="room-lobby">
        <div className="lobby-header">
          <h2>Room {roomCode}</h2>
          <div className="connection-status">
            Status: {socketIsConnected ? 'Connected' : 'Connecting...'} {/* Use socketIsConnected */}
          </div>
        </div>
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>{socketIsConnected ? 'Joining room...' : 'Connecting to server...'}</p>
        </div>
      </div>
    );
  }

  // Error state
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
              {/* Removed retry button as connection is managed by SocketProvider now */}
              {/* <button onClick={() => window.location.reload()} className="retry-button">
                Retry Connection
              </button> */}
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
        <button onClick={handleLeaveRoom} className="leave-button">
          Leave Room
        </button>
        
        <div className="room-info-header">
          <div className="room-code-display">{roomCode}</div>
          <div className="room-status-section">
            <div className="room-status-display">
              <span className="status-label">Status:</span>
              <span className={`status-badge status-${roomStatus}`}>
                {roomStatus.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </span>
            </div>
          </div>
          <div className="room-actions">
            <button className="copy-btn" onClick={() => navigator.clipboard.writeText(roomCode)}>
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
          </div>
        </div>
        
        <div style={{ width: '120px' }}></div> {/* Spacer for layout balance */}
      </div>

      <div className="lobby-content">
        {/* Room Status Information */}
        {!currentIsHost && roomStatus !== 'waiting_for_players' && (
          <div className="status-info-section">
            <div className="status-info-card">
              <div className="status-info-icon">
                {roomStatus === 'active' && '🔵'}
                {roomStatus === 'paused' && '🟡'}
                {roomStatus === 'finished' && '🔴'}
                {roomStatus === 'abandoned' && '⚫'}
                {roomStatus === 'launching' && '��'}
              </div>
              <div className="status-info-content">
                <h4 className="status-info-title">
                  Room is {roomStatus.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </h4>
                <p className="status-info-description">
                  {roomStatus === 'active' && 'The room is currently active. New players cannot join right now.'}
                  {roomStatus === 'paused' && 'The room is paused. The host can resume or change the status.'}
                  {roomStatus === 'finished' && 'This room has finished. The host can reopen it for new players.'}
                  {roomStatus === 'abandoned' && 'This room has been abandoned. The host can reactivate it.'}
                  {roomStatus === 'launching' && 'The room is launching. Please wait for the game to start.'}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="players-section">
          <div className="section-header">
            <h3 className="section-title">Players in Room</h3>
            {/* Show return to lobby button if current player is in game */}
            {players.find(p => p.name === playerNameRef.current)?.inGame && (
              <button 
                className="return-to-lobby-btn"
                onClick={handleReturnToLobby}
                title="Mark yourself as returned to lobby"
              >
                🔄 Return to Lobby
              </button>
            )}
          </div>
          <div className="players-grid">
            {players
              .filter(() => true)
              .map((player) => {
                const playerStatus = getPlayerStatus(player);
                const countdownTime = disconnectedTimers.get(player.id);
                const isDisconnectedWithTimer = !player.isConnected && countdownTime > 0;
                
                return (
                  <div 
                    key={player.id} 
                    className={`player-card ${player.isHost ? 'host' : ''} ${playerStatus.status} ${isDisconnectedWithTimer ? 'disconnecting' : ''}`}
                  >
                    <div className="player-card-content">
                      <div className="player-avatar">
                        {player.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="player-info">
                        <span className="player-name">{player.name}</span>
                        <div className="player-badges">
                          {player.isHost && <span className="host-badge">Host</span>}
                          <span 
                            className="status-badge"
                            style={{ backgroundColor: playerStatus.color }}
                            title={`${player.name} is ${playerStatus.label.toLowerCase()}`}
                          >
                            {playerStatus.icon} {playerStatus.label}
                          </span>
                          {/* Show countdown timer for disconnected players */}
                          {isDisconnectedWithTimer && (
                            <span className="countdown-badge" title="Time until removed from room">
                              ⏱️ {countdownTime}s
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Show host controls if current user is host and this is not the host */}
                    {currentIsHost && !player.isHost && !isDisconnectedWithTimer && (
                      <div className="player-actions">
                        <button 
                          className="make-host-btn"
                          onClick={() => handleTransferHost(player.id)}
                          title={`Make ${player.name} the host`}
                        >
                          👑 Make Host
                        </button>
                        <button 
                          className="kick-player-btn"
                          onClick={() => handleKickPlayer(player.id, player.name)}
                          title={`Kick ${player.name} from the room`}
                        >
                          👢 Kick
                        </button>
                      </div>
                    )}
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
              disabled={!socket || !socketIsConnected} // Use socketIsConnected
            />
          ) : (
            <div className="selected-game-card">
              <div className="game-icon">
                {selectedGame === 'ddf' ? '🎮' : selectedGame === 'schooled' ? '🎓' : selectedGame === 'susd' ? '🔍' : '🎮'}
              </div>
              <div className="game-details">
                <h4>{selectedGame === 'ddf' ? 'Der dümmste fliegt' : selectedGame === 'schooled' ? 'School Quiz' : selectedGame === 'susd' ? 'SUS\'D' : selectedGame}</h4>
                <p>{selectedGame === 'ddf' ? 'Quiz game where the worst player gets eliminated' : selectedGame === 'schooled' ? 'Educational quiz game for students' : selectedGame === 'susd' ? 'Imposter game - find who\'s acting suspicious!' : 'Unknown game'}</p>
                <span className="max-players">Max {selectedGame === 'ddf' ? '8' : selectedGame === 'schooled' ? '10' : selectedGame === 'susd' ? '10' : '8'} players</span>
              </div>
              {currentIsHost && (
                <div>
                  <button 
                    onClick={handleStartGame}
                    className="start-game-button"
                    disabled={!socket || !socketIsConnected || isStartingGame} // Use socketIsConnected
                  >
                    {isStartingGame ? 'Starting Game...' : 'Start Game'}
                  </button>
                  <button 
                    onClick={() => {
                      setSelectedGame(null);
                      if (socket && socketIsConnected) { // Also emit game deselection if needed
                        socket.emit('selectGame', { gameType: null }); // Assuming server handles null as deselection
                      }
                    }}
                    className="change-game-btn"
                    disabled={!socket || !socketIsConnected} // Use socketIsConnected
                    style={{ marginTop: '1rem' }}
                  >
                    Change Game
                  </button>
                </div>
              )}
              {!currentIsHost && (
                <div style={{ textAlign: 'center' }}>
                  <p>Waiting for host to start the game...</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {roomData && (
        <div className="room-details">
          <small>
            Room created: {new Date(roomData.created_at).toLocaleString()}
            {roomData.metadata?.created_by_name && (
              <> by {roomData.metadata.created_by_name}</>
            )}
          </small>
        </div>
      )}
    </div>
  );
};

export default RoomLobby; 
