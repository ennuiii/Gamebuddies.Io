import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { io, Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@shared/types';
import { SOCKET_EVENTS } from '@shared/constants';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface RoomInfo {
  roomCode: string;
  playerName: string;
  customLobbyName?: string;
  supabaseUserId?: string;
}

interface SocketContextValue {
  socket: TypedSocket | null;
  socketRef: React.MutableRefObject<TypedSocket | null>;
  socketId: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  connectSocket: () => TypedSocket | null;
  disconnectSocket: () => void;
  setLastRoom: (roomInfo: RoomInfo | null) => void;
  clearLastRoom: () => void;
  connectForUser: (userId: string) => TypedSocket | null;
  identifyUser: (userId: string) => void;
  clearAuthenticatedUser: () => void;
}

const SocketContext = createContext<SocketContextValue | undefined>(undefined);

export const useSocket = (): SocketContextValue => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a LazySocketProvider');
  }
  return context;
};

interface LazySocketProviderProps {
  children: ReactNode;
}

export const LazySocketProvider: React.FC<LazySocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<TypedSocket | null>(null);
  const [socketId, setSocketId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const reconnectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectionAttemptsRef = useRef(0);
  // BUG FIX #6: Removed max attempts - now uses circuit breaker pattern
  const circuitBreakerOpenRef = useRef(false);
  const circuitBreakerResetTimeRef = useRef<number>(0);
  const CIRCUIT_BREAKER_THRESHOLD = 10; // Open circuit after 10 consecutive failures
  const CIRCUIT_BREAKER_RESET_MS = 30000; // Reset circuit after 30 seconds
  const MAX_BACKOFF_MS = 30000; // Max backoff of 30 seconds
  const socketRef = useRef<TypedSocket | null>(null);
  const isConnectingRef = useRef(false);

  const lastRoomRef = useRef<RoomInfo | null>(null);
  const authenticatedUserIdRef = useRef<string | null>(null);

  const getServerUrl = useCallback((): string => {
    const envUrl =
      import.meta.env.REACT_APP_SERVER_URL || import.meta.env.REACT_APP_GAMEBUDDIES_API_URL;
    if (envUrl) return envUrl as string;

    if (
      typeof window !== 'undefined' &&
      (window.location.hostname === 'gamebuddies.io' ||
        window.location.hostname.includes('gamebuddies-client') ||
        window.location.hostname.includes('onrender.com') ||
        (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'))
    ) {
      return window.location.origin;
    }

    if (typeof window !== 'undefined') {
      return window.location.origin;
    }

    return 'http://localhost:3033';
  }, []);

  const setLastRoom = useCallback((roomInfo: RoomInfo | null) => {
    if (roomInfo) {
      console.log('📝 [LazySocketProvider] Storing room info for auto-rejoin:', roomInfo.roomCode);
      lastRoomRef.current = roomInfo;
    } else {
      console.log('📝 [LazySocketProvider] Clearing stored room info');
      lastRoomRef.current = null;
    }
  }, []);

  const clearLastRoom = useCallback(() => {
    lastRoomRef.current = null;
  }, []);

  const identifyUser = useCallback((userId: string) => {
    if (!userId) return;

    authenticatedUserIdRef.current = userId;

    if (socketRef.current?.connected) {
      console.log('👤 [LazySocketProvider] Identifying user to server:', userId);
      socketRef.current.emit(SOCKET_EVENTS.USER.IDENTIFY, userId);
    }
  }, []);

  const clearAuthenticatedUser = useCallback(() => {
    authenticatedUserIdRef.current = null;
  }, []);

  // BUG FIX #6: Infinite retry with circuit breaker pattern
  const attemptReconnection = useCallback(() => {
    // Check if circuit breaker is open
    if (circuitBreakerOpenRef.current) {
      const now = Date.now();
      if (now < circuitBreakerResetTimeRef.current) {
        const waitTime = Math.ceil((circuitBreakerResetTimeRef.current - now) / 1000);
        console.log(`⏸️ [LazySocketProvider] Circuit breaker open. Waiting ${waitTime}s before retry.`);
        // Schedule retry after circuit breaker resets
        reconnectionTimeoutRef.current = setTimeout(() => {
          circuitBreakerOpenRef.current = false;
          reconnectionAttemptsRef.current = 0;
          attemptReconnection();
        }, circuitBreakerResetTimeRef.current - now);
        return;
      }
      // Circuit breaker reset period has passed
      console.log('🔄 [LazySocketProvider] Circuit breaker reset. Resuming reconnection attempts.');
      circuitBreakerOpenRef.current = false;
      reconnectionAttemptsRef.current = 0;
    }

    reconnectionAttemptsRef.current++;

    // Check if we should open the circuit breaker
    if (reconnectionAttemptsRef.current >= CIRCUIT_BREAKER_THRESHOLD) {
      console.log(`⚡ [LazySocketProvider] Circuit breaker triggered after ${CIRCUIT_BREAKER_THRESHOLD} failures. Pausing for ${CIRCUIT_BREAKER_RESET_MS / 1000}s.`);
      circuitBreakerOpenRef.current = true;
      circuitBreakerResetTimeRef.current = Date.now() + CIRCUIT_BREAKER_RESET_MS;
      setIsConnecting(false);
      return;
    }

    // Exponential backoff with max cap
    const delay = Math.min(Math.pow(2, reconnectionAttemptsRef.current) * 1000, MAX_BACKOFF_MS);
    console.log(
      `🔄 [LazySocketProvider] Reconnection attempt ${reconnectionAttemptsRef.current} in ${delay}ms`
    );

    reconnectionTimeoutRef.current = setTimeout(() => {
      if (socketRef.current && !socketRef.current.connected && !isConnected) {
        console.log('🔌 [LazySocketProvider] Attempting reconnection...');
        socketRef.current.connect();
      }
    }, delay);
  }, [isConnected, CIRCUIT_BREAKER_THRESHOLD, CIRCUIT_BREAKER_RESET_MS, MAX_BACKOFF_MS]);

  const connectSocket = useCallback((): TypedSocket | null => {
    if (isConnectingRef.current || socketRef.current?.connected) {
      console.log('🔌 [LazySocketProvider] Already connecting/connected, returning existing socket');
      return socketRef.current;
    }

    isConnectingRef.current = true;

    const serverUrl = getServerUrl();
    console.log('🔌 [LazySocketProvider] Connecting to server:', serverUrl);
    setIsConnecting(true);

    const transportsPref = ((import.meta.env.REACT_APP_SOCKET_TRANSPORTS as string) || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean) as ('polling' | 'websocket')[];

    const newSocket: TypedSocket = io(serverUrl, {
      transports: transportsPref.length ? transportsPref : ['polling', 'websocket'],
      timeout: 20000,
      reconnection: false,
      forceNew: false,
      autoConnect: false,
    });

    newSocket.on('connect', () => {
      console.log('✅ [LazySocketProvider] Connected to server. Socket ID:', newSocket.id);
      isConnectingRef.current = false;
      setSocket(newSocket);
      setSocketId(newSocket.id ?? null);
      setIsConnected(true);
      setIsConnecting(false);

      const wasReconnecting = reconnectionAttemptsRef.current > 0;
      reconnectionAttemptsRef.current = 0;

      if (reconnectionTimeoutRef.current) {
        clearTimeout(reconnectionTimeoutRef.current);
        reconnectionTimeoutRef.current = null;
      }

      if (authenticatedUserIdRef.current) {
        console.log(
          '👤 [LazySocketProvider] Auto-identifying user on connect:',
          authenticatedUserIdRef.current
        );
        newSocket.emit(SOCKET_EVENTS.USER.IDENTIFY, authenticatedUserIdRef.current);
      }

      // BUG FIX #7: Validate room exists before auto-rejoin
      if (wasReconnecting && lastRoomRef.current) {
        const roomCode = lastRoomRef.current.roomCode;
        console.log(
          '🔄 [LazySocketProvider] Validating room before auto-rejoin:',
          roomCode
        );

        // Validate room exists before rejoining
        fetch(`/api/rooms/${roomCode}/validate`)
          .then(response => {
            if (response.ok) {
              return response.json();
            }
            throw new Error('Room not found');
          })
          .then((data) => {
            if (data.valid && lastRoomRef.current) {
              console.log('✅ [LazySocketProvider] Room validated, auto-rejoining:', roomCode);
              newSocket.emit(SOCKET_EVENTS.ROOM.JOIN, {
                roomCode: lastRoomRef.current.roomCode,
                playerName: lastRoomRef.current.playerName,
                customLobbyName: lastRoomRef.current.customLobbyName,
                supabaseUserId: lastRoomRef.current.supabaseUserId,
              });
            } else {
              console.log('⚠️ [LazySocketProvider] Room no longer valid, clearing stored room');
              lastRoomRef.current = null;
            }
          })
          .catch((error) => {
            console.log('⚠️ [LazySocketProvider] Room validation failed, clearing stored room:', error.message);
            lastRoomRef.current = null;
          });
      }
    });

    newSocket.on('disconnect', (reason) => {
      console.log('❌ [LazySocketProvider] Disconnected from server. Reason:', reason);
      isConnectingRef.current = false;
      setIsConnected(false);
      setIsConnecting(false);

      if (reason === 'io server disconnect') {
        console.log('🔄 [LazySocketProvider] Server initiated disconnect, attempting reconnection...');
        attemptReconnection();
      } else if (reason === 'transport close' || reason === 'transport error') {
        console.log('🔄 [LazySocketProvider] Transport issue, attempting reconnection...');
        attemptReconnection();
      }
    });

    newSocket.on('connect_error', (error) => {
      console.error('❌ [LazySocketProvider] Connection error:', error);
      isConnectingRef.current = false;
      setIsConnected(false);
      setIsConnecting(false);
      attemptReconnection();
    });

    socketRef.current = newSocket;
    newSocket.connect();

    return newSocket;
  }, [getServerUrl, isConnected, attemptReconnection]);

  const connectForUser = useCallback(
    (userId: string): TypedSocket | null => {
      if (!userId) return null;

      authenticatedUserIdRef.current = userId;

      const sock = socketRef.current?.connected ? socketRef.current : connectSocket();

      if (sock?.connected) {
        console.log('👤 [LazySocketProvider] connectForUser - Already connected, identifying:', userId);
        sock.emit(SOCKET_EVENTS.USER.IDENTIFY, userId);
      }

      return sock;
    },
    [connectSocket]
  );

  const disconnectSocket = useCallback(() => {
    if (socketRef.current) {
      console.log('🧹 [LazySocketProvider] Disconnecting socket');

      if (reconnectionTimeoutRef.current) {
        clearTimeout(reconnectionTimeoutRef.current);
        reconnectionTimeoutRef.current = null;
      }

      lastRoomRef.current = null;

      socketRef.current.disconnect();
      socketRef.current = null;
      setSocket(null);
      setSocketId(null);
      setIsConnected(false);
      setIsConnecting(false);
      isConnectingRef.current = false;
      reconnectionAttemptsRef.current = 0;
    }
  }, []);

  useEffect(() => {
    return () => {
      console.log('🧹 [LazySocketProvider] Component unmounting, cleaning up...');
      disconnectSocket();
    };
  }, [disconnectSocket]);

  const value = useMemo(
    (): SocketContextValue => ({
      socket,
      socketRef,
      socketId,
      isConnected,
      isConnecting,
      connectSocket,
      disconnectSocket,
      setLastRoom,
      clearLastRoom,
      connectForUser,
      identifyUser,
      clearAuthenticatedUser,
    }),
    [
      socket,
      socketId,
      isConnected,
      isConnecting,
      connectSocket,
      disconnectSocket,
      setLastRoom,
      clearLastRoom,
      connectForUser,
      identifyUser,
      clearAuthenticatedUser,
    ]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};
