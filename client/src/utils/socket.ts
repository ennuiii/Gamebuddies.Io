import io, { Socket } from 'socket.io-client';

// Use the current window location for socket connection
// This ensures it works in both development and production
const SOCKET_URL =
  process.env.REACT_APP_SOCKET_URL ||
  (window.location.hostname === 'localhost' ? 'http://localhost:3033' : window.location.origin);

class SocketService {
  private socket: Socket | null = null;
  private isConnecting: boolean = false;

  connect(): Socket | null {
    // Prevent multiple simultaneous connection attempts
    if (this.socket?.connected || this.isConnecting) {
      return this.socket;
    }

    // If socket exists but is disconnected, remove it
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.close();
      this.socket = null;
    }

    if (!this.socket) {
      this.isConnecting = true;

      this.socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
        forceNew: true,
      });

      this.socket.on('connect', () => {
        console.log('Connected to server');
        this.isConnecting = false;
      });

      this.socket.on('disconnect', (reason: string) => {
        console.log('Disconnected from server:', reason);
        this.isConnecting = false;
        // Clean up socket on disconnect
        if (this.socket) {
          this.socket.removeAllListeners();
          this.socket = null;
        }
      });

      this.socket.on('error', (error: Error) => {
        console.error('Socket error:', error);
        this.isConnecting = false;
        // Clean up socket on error
        if (this.socket) {
          this.socket.removeAllListeners();
          this.socket = null;
        }
      });

      this.socket.on('connect_error', (error: Error) => {
        console.error('Connection error:', error.message);
        this.isConnecting = false;
        // Clean up socket on connection error
        if (this.socket) {
          this.socket.removeAllListeners();
          this.socket = null;
        }
      });

      this.socket.on('reconnect_attempt', (attemptNumber: number) => {
        console.log('Reconnection attempt:', attemptNumber);
      });

      this.socket.on('reconnect_failed', () => {
        console.error('Failed to reconnect after all attempts');
        this.isConnecting = false;
      });
    }
    return this.socket;
  }

  disconnect(): void {
    if (this.socket) {
      // Remove all listeners first
      this.socket.removeAllListeners();
      // Then disconnect
      this.socket.disconnect();
      // Finally, close the socket
      this.socket.close();
      this.socket = null;
      this.isConnecting = false;
    }
  }

  joinRoom(roomCode: string, playerName: string): void {
    // Ensure we're connected before emitting
    const socket = this.connect();
    if (socket) {
      // Wait for connection if needed
      if (socket.connected) {
        socket.emit('joinRoom', { roomCode, playerName });
      } else {
        const timeout = setTimeout(() => {
          console.error('Timeout waiting for socket connection');
          this.disconnect();
        }, 10000);

        socket.once('connect', () => {
          clearTimeout(timeout);
          socket.emit('joinRoom', { roomCode, playerName });
        });
      }
    }
  }

  leaveRoom(): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit('leaveRoom');
    }
  }

  selectGame(roomCode: string, gameType: string): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit('selectGame', { roomCode, gameType });
    }
  }

  startGame(roomCode: string): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit('startGame', { roomCode });
    }
  }

  on(event: string, callback: (...args: any[]) => void): void {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event: string, callback?: (...args: any[]) => void): void {
    if (this.socket) {
      // If callback is provided, remove only that listener
      if (callback) {
        this.socket.off(event, callback);
      } else {
        // Otherwise, remove all listeners for the event
        this.socket.off(event);
      }
    }
  }
}

const socketService = new SocketService();
export default socketService;
