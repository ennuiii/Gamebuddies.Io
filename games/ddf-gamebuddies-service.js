// ddf-gamebuddies-service.js
// Simplified GameBuddies integration service for DDF

class DDFGameBuddiesService {
  constructor() {
    this.isConnected = false;
    this.roomCode = null;
    this.playerName = null;
    this.playerId = null;
    this.isHost = false;
    this.connectionInfo = { isConnected: false };
  }

  async initialize(roomCode, playerName, isGM = false) {
    console.log('🔄 [DDF-GameBuddies] Initializing with URL parameters...', { roomCode, playerName, isGM });
    
    this.roomCode = roomCode;
    this.playerName = playerName;
    this.isHost = isGM;
    this.playerId = `${playerName}_${Date.now()}`;
    
    // Get additional data from session storage (set by GameBuddies)
    const sessionData = {
      gamebuddies_roomCode: sessionStorage.getItem('gamebuddies_roomCode'),
      gamebuddies_playerName: sessionStorage.getItem('gamebuddies_playerName'), 
      gamebuddies_isHost: sessionStorage.getItem('gamebuddies_isHost'),
      gamebuddies_gameType: sessionStorage.getItem('gamebuddies_gameType'),
      gamebuddies_returnUrl: sessionStorage.getItem('gamebuddies_returnUrl')
    };
    
    console.log('📋 [DDF-GameBuddies] Session storage data:', sessionData);
    
    // Validate that we have the basic data needed
    if (!roomCode || !playerName) {
      throw new Error('Missing room code or player name from URL parameters');
    }
    
    this.isConnected = true;
    this.connectionInfo = { isConnected: true };
    
    // Return mock data structure similar to what the original service would return
    const initData = {
      room: {
        code: roomCode,
        settings: {}
      },
      playerId: this.playerId,
      isHost: isGM,
      participants: [
        {
          id: this.playerId,
          name: playerName,
          role: isGM ? 'host' : 'player'
        }
      ],
      gameState: null // No existing state for new games
    };
    
    console.log('✅ [DDF-GameBuddies] Initialization complete:', initData);
    return initData;
  }

  async validateRoom(roomCode, playerName) {
    // For internal DDF games, we don't need API validation
    // Just check if we have the basic URL parameters
    console.log('🔍 [DDF-GameBuddies] Validating room (internal):', { roomCode, playerName });
    
    if (!roomCode || !playerName) {
      return { 
        isValid: false, 
        error: 'Missing room code or player name' 
      };
    }
    
    return { 
      isValid: true, 
      isGameBuddiesRoom: true,
      roomCode,
      playerName
    };
  }

  async syncGameState(gameState) {
    console.log('📊 [DDF-GameBuddies] Sync game state:', gameState);
    // For now, just log - we could implement local storage or other sync methods
    localStorage.setItem(`ddf_gameState_${this.roomCode}`, JSON.stringify(gameState));
    return { success: true };
  }

  async getGameState() {
    console.log('📥 [DDF-GameBuddies] Get game state');
    const stored = localStorage.getItem(`ddf_gameState_${this.roomCode}`);
    if (stored) {
      return { data: JSON.parse(stored) };
    }
    return { data: null };
  }

  async sendEvent(eventType, eventData) {
    console.log('📤 [DDF-GameBuddies] Send event:', { eventType, eventData });
    
    // Dispatch custom events for local handling
    window.dispatchEvent(new CustomEvent('gamebuddies:gameEvent', {
      detail: {
        eventType,
        eventData,
        playerId: this.playerId
      }
    }));
    
    return { success: true };
  }

  getConnectionInfo() {
    return this.connectionInfo;
  }

  disconnect() {
    console.log('🔌 [DDF-GameBuddies] Disconnecting...');
    this.isConnected = false;
    this.connectionInfo = { isConnected: false };
  }

  // Helper method to return to GameBuddies
  returnToGameBuddies() {
    const returnUrl = sessionStorage.getItem('gamebuddies_returnUrl');
    if (returnUrl && this.roomCode) {
      const finalUrl = `${returnUrl}?rejoin=${this.roomCode}`;
      console.log('🔄 [DDF-GameBuddies] Returning to GameBuddies:', finalUrl);
      window.location.href = finalUrl;
    } else {
      console.log('🔄 [DDF-GameBuddies] No return URL found, redirecting to home');
      window.location.href = '/';
    }
  }
}

// Create singleton instance
const ddfGameBuddies = new DDFGameBuddiesService();

export default ddfGameBuddies; 