/**
 * =====================================================
 * ENHANCED GAMEBUDDIES INTEGRATION V2
 * With Robust Reconnection & State Preservation
 * =====================================================
 *
 * Features:
 * ✅ Automatic reconnection with exponential backoff
 * ✅ Game state preservation during disconnect
 * ✅ Connection status UI indicator
 * ✅ Auto-rejoin room after reconnect
 * ✅ Player position/state sync
 * ✅ Graceful degradation
 *
 * Installation:
 * <script src="https://cdn.socket.io/4.8.1/socket.io.min.js"></script>
 */

class EnhancedGameBuddiesIntegration {
  constructor(config = {}) {
    // Configuration
    this.config = {
      apiKey: config.apiKey || 'YOUR_GAME_API_KEY',
      gameName: config.gameName || 'Your Game Name',
      gameVersion: config.gameVersion || '1.0.0',
      baseUrl: config.baseUrl || 'https://gamebuddies.io/api/v2/game',
      socketUrl: config.socketUrl || 'https://gamebuddies.io',

      // 🆕 Reconnection Settings
      reconnectionAttempts: config.reconnectionAttempts || 10,
      reconnectionDelay: config.reconnectionDelay || 1000,
      reconnectionDelayMax: config.reconnectionDelayMax || 10000,
    };

    // Session State
    this.sessionData = null;
    this.socket = null;
    this.isInitialized = false;

    // 🆕 Reconnection State
    this.reconnectionState = {
      shouldReconnect: false,
      reconnectAttempt: 0,
      gameState: null, // Preserve game state during disconnect
      playerState: null, // Preserve player position/data
    };

    // 🆕 Connection Status Listeners
    this.connectionStatusListeners = [];
    this.currentConnectionStatus = 'disconnected';

    // Initialize
    this.initialize();
  }

  /**
   * Initialize GameBuddies integration
   */
  initialize() {
    this.sessionData = this.detectGameBuddiesSession();

    if (!this.sessionData) {
      console.log('🎮 Game not launched from GameBuddies - integration disabled');
      return;
    }

    console.log('🎮 GameBuddies Enhanced Integration:', this.sessionData);

    // Setup
    this.setupSocketConnection();
    this.setupConnectionStatusUI();
    this.setupCleanup();

    this.isInitialized = true;
  }

  /**
   * Detect GameBuddies session from URL params
   */
  detectGameBuddiesSession() {
    const urlParams = new URLSearchParams(window.location.search);

    const roomCode = urlParams.get('room');
    const playerName = decodeURIComponent(urlParams.get('name') || '');
    const playerId = urlParams.get('playerId');
    const isHost = urlParams.get('role') === 'gm';

    if (!roomCode) {
      // Fallback to sessionStorage
      const sessionRoomCode = sessionStorage.getItem('gamebuddies_roomCode');
      const sessionPlayerName = sessionStorage.getItem('gamebuddies_playerName');
      const sessionPlayerId = sessionStorage.getItem('gamebuddies_playerId');
      const sessionIsHost = sessionStorage.getItem('gamebuddies_isHost') === 'true';

      if (!sessionRoomCode) return null;

      return {
        roomCode: sessionRoomCode,
        playerName: sessionPlayerName,
        playerId: sessionPlayerId,
        isHost: sessionIsHost,
      };
    }

    // Store for persistence
    sessionStorage.setItem('gamebuddies_roomCode', roomCode);
    sessionStorage.setItem('gamebuddies_playerName', playerName);
    sessionStorage.setItem('gamebuddies_playerId', playerId);
    sessionStorage.setItem('gamebuddies_isHost', isHost.toString());

    return { roomCode, playerName, playerId, isHost };
  }

  /**
   * 🆕 ENHANCED: Setup Socket with Reconnection Logic
   */
  setupSocketConnection() {
    try {
      this.socket = io(this.config.socketUrl, {
        transports: ['websocket', 'polling'],
        autoConnect: true,
        reconnection: true, // ✅ Enable auto-reconnect
        reconnectionAttempts: this.config.reconnectionAttempts,
        reconnectionDelay: this.config.reconnectionDelay,
        reconnectionDelayMax: this.config.reconnectionDelayMax,
        timeout: 10000,
        forceNew: true,
      });

      // ============================================
      // CONNECTION EVENTS
      // ============================================

      this.socket.on('connect', () => {
        console.log('✅ Connected to GameBuddies server', this.socket.id);
        this.reconnectionState.reconnectAttempt = 0;
        this.notifyStatusChange('connected');

        // 🎯 AUTO-REJOIN LOGIC (same as main client!)
        if (this.reconnectionState.shouldReconnect && this.sessionData) {
          console.log('🔄 Auto-rejoining room:', this.sessionData.roomCode);
          this.joinRoom();

          // 🆕 RESTORE GAME STATE
          if (this.reconnectionState.gameState) {
            this.restoreGameState(this.reconnectionState.gameState);
          }

          // 🆕 RESTORE PLAYER STATE
          if (this.reconnectionState.playerState) {
            this.restorePlayerState(this.reconnectionState.playerState);
          }
        } else {
          // Initial join
          this.joinRoom();
        }
      });

      this.socket.on('disconnect', reason => {
        console.warn('⚠️ Disconnected from GameBuddies:', reason);
        this.notifyStatusChange('disconnected');

        // Mark for auto-reconnect on unexpected disconnect
        if (reason === 'io server disconnect' || reason === 'transport close') {
          this.reconnectionState.shouldReconnect = true;

          // 🆕 SAVE GAME STATE before disconnect
          this.saveGameState();
          this.savePlayerState();
        }
      });

      this.socket.on('reconnect_attempt', attemptNumber => {
        console.log(`🔄 Reconnection attempt ${attemptNumber}/${this.config.reconnectionAttempts}`);
        this.reconnectionState.reconnectAttempt = attemptNumber;
        this.notifyStatusChange('reconnecting');
      });

      this.socket.on('reconnect', attemptNumber => {
        console.log('✅ Reconnected after', attemptNumber, 'attempts');
        this.reconnectionState.reconnectAttempt = 0;
        this.notifyStatusChange('connected');
      });

      this.socket.on('reconnect_failed', () => {
        console.error('❌ Failed to reconnect after all attempts');
        this.reconnectionState.shouldReconnect = false;
        this.notifyStatusChange('disconnected');

        // Show permanent error message
        this.showReconnectFailedMessage();
      });

      this.socket.on('connect_error', error => {
        console.error('❌ Connection error:', error.message);
      });

      // ============================================
      // GAME-SPECIFIC EVENTS
      // ============================================

      this.socket.on('roomJoined', data => {
        console.log('✅ Joined room:', data.roomCode);
        // Room joined successfully
      });

      this.socket.on('chatMessage', data => {
        // 🆕 Handle chat messages from GameBuddies
        this.handleChatMessage(data);
      });

      this.socket.on('playerJoined', player => {
        console.log('👤 Player joined:', player.username);
        // Notify game that new player joined
        this.onPlayerJoined && this.onPlayerJoined(player);
      });

      this.socket.on('playerLeft', data => {
        console.log('👋 Player left:', data.username);
        // Notify game that player left
        this.onPlayerLeft && this.onPlayerLeft(data);
      });

      this.socket.on('error', error => {
        console.error('❌ Socket error:', error);
      });
    } catch (error) {
      console.error('❌ Failed to setup socket:', error);
    }
  }

  /**
   * Join the GameBuddies room
   */
  joinRoom() {
    if (!this.socket || !this.socket.connected) {
      console.warn('⚠️ Cannot join room: socket not connected');
      return;
    }

    this.socket.emit('joinRoom', {
      roomCode: this.sessionData.roomCode,
      playerName: this.sessionData.playerName,
    });
  }

  /**
   * 🆕 SAVE GAME STATE (before disconnect)
   */
  saveGameState() {
    try {
      // Override this in your game to save specific state
      const gameState = {
        timestamp: Date.now(),
        // Add your game-specific state here
        // Example:
        // currentLevel: this.currentLevel,
        // score: this.score,
        // round: this.round,
      };

      this.reconnectionState.gameState = gameState;
      console.log('💾 Game state saved:', gameState);
    } catch (error) {
      console.error('❌ Failed to save game state:', error);
    }
  }

  /**
   * 🆕 SAVE PLAYER STATE (before disconnect)
   */
  savePlayerState() {
    try {
      // Override this in your game to save player state
      const playerState = {
        timestamp: Date.now(),
        playerId: this.sessionData.playerId,
        playerName: this.sessionData.playerName,
        // Add your player-specific state here
        // Example:
        // position: { x: player.x, y: player.y },
        // health: player.health,
        // inventory: player.inventory,
      };

      this.reconnectionState.playerState = playerState;
      console.log('💾 Player state saved:', playerState);
    } catch (error) {
      console.error('❌ Failed to save player state:', error);
    }
  }

  /**
   * 🆕 RESTORE GAME STATE (after reconnect)
   */
  restoreGameState(gameState) {
    try {
      console.log('♻️ Restoring game state:', gameState);

      // Override this in your game to restore state
      // Example:
      // this.currentLevel = gameState.currentLevel;
      // this.score = gameState.score;
      // this.round = gameState.round;

      // Call custom callback if provided
      this.onGameStateRestored && this.onGameStateRestored(gameState);
    } catch (error) {
      console.error('❌ Failed to restore game state:', error);
    }
  }

  /**
   * 🆕 RESTORE PLAYER STATE (after reconnect)
   */
  restorePlayerState(playerState) {
    try {
      console.log('♻️ Restoring player state:', playerState);

      // Override this in your game to restore player
      // Example:
      // player.x = playerState.position.x;
      // player.y = playerState.position.y;
      // player.health = playerState.health;

      // Call custom callback if provided
      this.onPlayerStateRestored && this.onPlayerStateRestored(playerState);
    } catch (error) {
      console.error('❌ Failed to restore player state:', error);
    }
  }

  /**
   * 🆕 CONNECTION STATUS MANAGEMENT
   */
  notifyStatusChange(status) {
    this.currentConnectionStatus = status;
    this.connectionStatusListeners.forEach(listener => listener(status));
  }

  onConnectionStatusChange(listener) {
    this.connectionStatusListeners.push(listener);

    // Return cleanup function
    return () => {
      this.connectionStatusListeners = this.connectionStatusListeners.filter(
        l => l !== listener
      );
    };
  }

  getConnectionStatus() {
    if (this.socket?.connected) return 'connected';
    if (this.reconnectionState.reconnectAttempt > 0) return 'reconnecting';
    return 'disconnected';
  }

  /**
   * 🆕 CONNECTION STATUS UI
   */
  setupConnectionStatusUI() {
    // Create status indicator element
    const statusEl = document.createElement('div');
    statusEl.id = 'gamebuddies-connection-status';
    statusEl.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 600;
      z-index: 99999;
      display: none;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      transition: all 0.3s ease;
    `;

    document.body.appendChild(statusEl);

    // Update UI on status change
    this.onConnectionStatusChange(status => {
      if (status === 'connected') {
        statusEl.style.display = 'none';
      } else if (status === 'reconnecting') {
        statusEl.style.display = 'flex';
        statusEl.style.background = '#ffeee6';
        statusEl.style.border = '1px solid #e67e22';
        statusEl.style.color = '#d35400';
        statusEl.innerHTML = `
          <span style="margin-right: 8px;">🔄</span>
          Reconnecting... (${this.reconnectionState.reconnectAttempt}/${this.config.reconnectionAttempts})
        `;
      } else {
        statusEl.style.display = 'flex';
        statusEl.style.background = '#ffeaea';
        statusEl.style.border = '1px solid #e74c3c';
        statusEl.style.color = '#c0392b';
        statusEl.innerHTML = `
          <span style="margin-right: 8px;">🔴</span>
          Disconnected from GameBuddies
        `;
      }
    });
  }

  /**
   * 🆕 Show reconnect failed message
   */
  showReconnectFailedMessage() {
    const messageEl = document.createElement('div');
    messageEl.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 30px;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
      z-index: 999999;
      text-align: center;
      max-width: 400px;
    `;

    messageEl.innerHTML = `
      <h3 style="margin: 0 0 16px 0; color: #e74c3c;">Connection Lost</h3>
      <p style="margin: 0 0 20px 0; color: #666;">
        Failed to reconnect to GameBuddies after ${this.config.reconnectionAttempts} attempts.
      </p>
      <button
        onclick="window.location.href='${this.sessionData?.returnUrl || 'https://gamebuddies.io'}'"
        style="
          padding: 12px 24px;
          background: #3498db;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 16px;
          font-weight: 600;
        "
      >
        Return to GameBuddies
      </button>
    `;

    document.body.appendChild(messageEl);
  }

  /**
   * 🆕 Handle chat messages
   */
  handleChatMessage(data) {
    console.log(`💬 [${data.playerName}]: ${data.message}`);
    // Call custom callback if provided
    this.onChatMessage && this.onChatMessage(data);
  }

  /**
   * 🆕 Send chat message to GameBuddies
   */
  sendChatMessage(message) {
    if (!this.socket || !this.socket.connected) {
      console.warn('⚠️ Cannot send chat: not connected');
      return;
    }

    this.socket.emit('chatMessage', {
      roomCode: this.sessionData.roomCode,
      message: message,
      playerName: this.sessionData.playerName,
    });
  }

  /**
   * Cleanup
   */
  setupCleanup() {
    window.addEventListener('beforeunload', () => {
      if (this.socket) {
        this.socket.disconnect();
      }
    });
  }

  /**
   * Manual disconnect (e.g., when leaving game)
   */
  disconnect() {
    this.reconnectionState.shouldReconnect = false;
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

// =====================================================
// USAGE EXAMPLE
// =====================================================

// Initialize GameBuddies integration
const gameBuddies = new EnhancedGameBuddiesIntegration({
  gameName: 'My Awesome Game',
  gameVersion: '2.0.0',
  // Optional: Custom reconnect settings
  reconnectionAttempts: 15,
  reconnectionDelayMax: 15000,
});

// =====================================================
// GAME-SPECIFIC CALLBACKS
// =====================================================

// Called when game state is restored after reconnect
gameBuddies.onGameStateRestored = gameState => {
  console.log('🎮 Restoring game:', gameState);
  // Restore your game state here
  // game.currentLevel = gameState.currentLevel;
  // game.score = gameState.score;
};

// Called when player state is restored after reconnect
gameBuddies.onPlayerStateRestored = playerState => {
  console.log('👤 Restoring player:', playerState);
  // Restore your player here
  // player.x = playerState.position.x;
  // player.y = playerState.position.y;
};

// Called when a player joins
gameBuddies.onPlayerJoined = player => {
  console.log('👤 New player:', player.username);
  // Add player to your game
  // game.addPlayer(player);
};

// Called when a player leaves
gameBuddies.onPlayerLeft = data => {
  console.log('👋 Player left:', data.username);
  // Remove player from your game
  // game.removePlayer(data.playerId);
};

// Called when chat message received
gameBuddies.onChatMessage = data => {
  console.log(`💬 ${data.playerName}: ${data.message}`);
  // Display chat in your game UI
  // game.showChatMessage(data.playerName, data.message);
};

// =====================================================
// CUSTOM GAME STATE SAVING
// =====================================================

// Override to save your specific game state
gameBuddies.saveGameState = function () {
  this.reconnectionState.gameState = {
    timestamp: Date.now(),
    currentLevel: game.currentLevel,
    score: game.score,
    round: game.round,
    gamePhase: game.phase,
    timer: game.remainingTime,
  };
  console.log('💾 Game state saved:', this.reconnectionState.gameState);
};

// Override to save your specific player state
gameBuddies.savePlayerState = function () {
  this.reconnectionState.playerState = {
    timestamp: Date.now(),
    playerId: this.sessionData.playerId,
    playerName: this.sessionData.playerName,
    position: { x: player.x, y: player.y },
    health: player.health,
    inventory: player.inventory,
    character: player.characterType,
  };
  console.log('💾 Player state saved:', this.reconnectionState.playerState);
};

// =====================================================
// SENDING CHAT FROM GAME
// =====================================================

function sendGameChat(message) {
  gameBuddies.sendChatMessage(message);
}

// Example: Send system message
sendGameChat('Game started! Good luck!');

console.log('🎮 Enhanced GameBuddies Integration Loaded!');
