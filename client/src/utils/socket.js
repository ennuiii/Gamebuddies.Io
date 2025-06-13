import io from 'socket.io-client';

// Use the current window location for socket connection
// This ensures it works in both development and production
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 
  (window.location.hostname === 'localhost' 
    ? 'http://localhost:3033' 
    : window.location.origin);

class SocketService {
  constructor() {
    this.socket = null;
    this.isConnecting = false;
  }

  connect() {
    // Prevent multiple simultaneous connection attempts
    if (this.socket?.connected || this.isConnecting) {
      return this.socket;
    }

    // If socket exists but is disconnected, remove it
    if (this.socket && !this.socket.connected) {
      this.socket.removeAllListeners();
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
      });

      this.socket.on('connect', () => {
        console.log('Connected to server');
        this.isConnecting = false;
      });

      this.socket.on('disconnect', (reason) => {
        console.log('Disconnected from server:', reason);
        this.isConnecting = false;
      });

      this.socket.on('error', (error) => {
        console.error('Socket error:', error);
        this.isConnecting = false;
      });

      this.socket.on('connect_error', (error) => {
        console.error('Connection error:', error.message);
        this.isConnecting = false;
      });
    }
    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
      this.isConnecting = false;
    }
  }

  joinRoom(roomCode, playerName) {
    // Ensure we're connected before emitting
    const socket = this.connect();
    if (socket) {
      // Wait for connection if needed
      if (socket.connected) {
        socket.emit('joinRoom', { roomCode, playerName });
      } else {
        socket.once('connect', () => {
          socket.emit('joinRoom', { roomCode, playerName });
        });
      }
    }
  }

  leaveRoom() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('leaveRoom');
    }
  }

  selectGame(roomCode, gameType) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('selectGame', { roomCode, gameType });
    }
  }

  startGame(roomCode) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('startGame', { roomCode });
    }
  }

  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event, callback) {
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