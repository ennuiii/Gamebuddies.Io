import io, { Socket } from 'socket.io-client';
import logger from './logger';

// Use the current window location for socket connection
const SOCKET_URL =
  process.env.REACT_APP_SOCKET_URL ||
  (window.location.hostname === 'localhost' ? 'http://localhost:3033' : window.location.origin);

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'reconnecting';

interface ReconnectionState {
  roomCode: string | null;
  playerName: string | null;
  shouldReconnect: boolean;
}

class SocketService {
  private socket: Socket | null = null;
  private isConnecting: boolean = false;
  private reconnectionState: ReconnectionState = {
    roomCode: null,
    playerName: null,
    shouldReconnect: false,
  };
  private reconnectAttempt: number = 0;
  private maxReconnectAttempts: number = 10;
  private connectionStatusListeners: Array<(status: ConnectionStatus) => void> = [];

  connect(): Socket | null {
    if (this.socket?.connected || this.isConnecting) {
      return this.socket;
    }

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.close();
      this.socket = null;
    }

    if (!this.socket) {
      this.isConnecting = true;
      this.notifyStatusChange('connecting');

      this.socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
        timeout: 10000,
        forceNew: true,
      });

      this.socket.on('connect', () => {
        logger.socket('connect', { socketId: this.socket?.id });
        this.isConnecting = false;
        this.reconnectAttempt = 0;
        this.notifyStatusChange('connected');

        // Auto-rejoin room if we were disconnected
        if (
          this.reconnectionState.shouldReconnect &&
          this.reconnectionState.roomCode &&
          this.reconnectionState.playerName
        ) {
          logger.room('auto-rejoin', this.reconnectionState.roomCode);
          this.joinRoom(this.reconnectionState.roomCode, this.reconnectionState.playerName);
        }
      });

      this.socket.on('disconnect', (reason: string) => {
        logger.socket('disconnect', { reason });
        this.isConnecting = false;
        this.notifyStatusChange('disconnected');

        // Save state for reconnection if it was an unexpected disconnect
        if (reason === 'io server disconnect' || reason === 'transport close') {
          this.reconnectionState.shouldReconnect = true;
        }
      });

      this.socket.on('error', (error: Error) => {
        logger.error('Socket error', error);
        this.isConnecting = false;
      });

      this.socket.on('connect_error', (error: Error) => {
        logger.error('Connection error', error);
        this.isConnecting = false;
      });

      this.socket.on('reconnect_attempt', (attemptNumber: number) => {
        this.reconnectAttempt = attemptNumber;
        logger.socket('reconnect_attempt', { attempt: attemptNumber });
        this.notifyStatusChange('reconnecting');
      });

      this.socket.on('reconnect', (attemptNumber: number) => {
        logger.socket('reconnect', { attempt: attemptNumber });
        this.reconnectAttempt = 0;
        this.notifyStatusChange('connected');
      });

      this.socket.on('reconnect_failed', () => {
        logger.error('Failed to reconnect after all attempts');
        this.isConnecting = false;
        this.reconnectionState.shouldReconnect = false;
        this.notifyStatusChange('disconnected');
      });
    }
    return this.socket;
  }

  disconnect(): void {
    if (this.socket) {
      this.reconnectionState.shouldReconnect = false;
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket.close();
      this.socket = null;
      this.isConnecting = false;
      this.notifyStatusChange('disconnected');
    }
  }

  joinRoom(roomCode: string, playerName: string): void {
    // Save state for reconnection
    this.reconnectionState = {
      roomCode,
      playerName,
      shouldReconnect: true,
    };

    const socket = this.connect();
    if (socket) {
      if (socket.connected) {
        logger.room('join', roomCode, { playerName });
        socket.emit('joinRoom', { roomCode, playerName });
      } else {
        const timeout = setTimeout(() => {
          logger.error('Timeout waiting for socket connection');
          this.disconnect();
        }, 10000);

        socket.once('connect', () => {
          clearTimeout(timeout);
          logger.room('join', roomCode, { playerName });
          socket.emit('joinRoom', { roomCode, playerName });
        });
      }
    }
  }

  leaveRoom(): void {
    this.reconnectionState.shouldReconnect = false;
    if (this.socket && this.socket.connected) {
      logger.room('leave', this.reconnectionState.roomCode || undefined);
      this.socket.emit('leaveRoom');
    }
    this.reconnectionState = {
      roomCode: null,
      playerName: null,
      shouldReconnect: false,
    };
  }

  selectGame(roomCode: string, gameType: string): void {
    if (this.socket && this.socket.connected) {
      logger.room('selectGame', roomCode, { gameType });
      this.socket.emit('selectGame', { roomCode, gameType });
    }
  }

  startGame(roomCode: string): void {
    if (this.socket && this.socket.connected) {
      logger.room('startGame', roomCode);
      this.socket.emit('startGame', { roomCode });
    }
  }

  // Chat functionality
  sendChatMessage(roomCode: string, message: string, playerName: string): void {
    if (this.socket && this.socket.connected) {
      logger.socket('chatMessage', { roomCode, message });
      this.socket.emit('chatMessage', { roomCode, message, playerName });
    }
  }

  on(event: string, callback: (...args: any[]) => void): void {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event: string, callback?: (...args: any[]) => void): void {
    if (this.socket) {
      if (callback) {
        this.socket.off(event, callback);
      } else {
        this.socket.off(event);
      }
    }
  }

  // Connection status management
  onConnectionStatusChange(listener: (status: ConnectionStatus) => void): () => void {
    this.connectionStatusListeners.push(listener);
    // Return cleanup function
    return () => {
      this.connectionStatusListeners = this.connectionStatusListeners.filter(l => l !== listener);
    };
  }

  private notifyStatusChange(status: ConnectionStatus): void {
    this.connectionStatusListeners.forEach(listener => listener(status));
  }

  getConnectionStatus(): ConnectionStatus {
    if (this.socket?.connected) return 'connected';
    if (this.isConnecting) return 'connecting';
    if (this.reconnectAttempt > 0) return 'reconnecting';
    return 'disconnected';
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  getReconnectionState(): ReconnectionState {
    return { ...this.reconnectionState };
  }
}

const socketService = new SocketService();
export default socketService;
