// gamebuddies-api-client.js
// Simplified API client for internal games (no API key required)

class GameBuddiesAPIClient {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl || window.location.origin;
    this.isInternal = true; // Mark as internal game
  }

  async validateRoom(roomCode, playerName) {
    console.log('🔍 [API Client] Validating room (internal):', { roomCode, playerName });
    
    // For internal games served from the same domain, we can bypass API validation
    // and just check if we have the required URL parameters
    if (!roomCode || !playerName) {
      return {
        isValid: false,
        isGameBuddiesRoom: false,
        error: 'Missing room code or player name'
      };
    }

    // Check if we have GameBuddies session data
    const hasGameBuddiesData = 
      sessionStorage.getItem('gamebuddies_roomCode') === roomCode ||
      window.location.search.includes(`room=${roomCode}`);

    console.log('✅ [API Client] Internal validation result:', {
      isValid: true,
      isGameBuddiesRoom: hasGameBuddiesData,
      roomCode,
      playerName
    });

    return {
      isValid: true,
      isGameBuddiesRoom: hasGameBuddiesData,
      roomCode,
      playerName,
      internal: true
    };
  }

  async joinRoom(roomCode, playerName, playerId) {
    console.log('🚪 [API Client] Join room (internal):', { roomCode, playerName, playerId });
    
    // For internal games, return success without API call
    return {
      success: true,
      playerId: playerId || `${playerName}_${Date.now()}`,
      roomCode,
      playerName,
      message: 'Joined room via internal client'
    };
  }

  async syncGameState(roomCode, gameState, playerId) {
    console.log('📊 [API Client] Sync game state (internal):', { roomCode, playerId });
    
    // Store locally for internal games
    localStorage.setItem(`gameState_${roomCode}`, JSON.stringify({
      state: gameState,
      playerId,
      timestamp: Date.now()
    }));
    
    return { success: true };
  }

  async getGameState(roomCode) {
    console.log('📥 [API Client] Get game state (internal):', { roomCode });
    
    const stored = localStorage.getItem(`gameState_${roomCode}`);
    if (stored) {
      const data = JSON.parse(stored);
      return { 
        success: true, 
        gameState: data.state,
        timestamp: data.timestamp
      };
    }
    
    return { success: true, gameState: null };
  }

  async sendEvent(roomCode, eventType, eventData, playerId) {
    console.log('📤 [API Client] Send event (internal):', { roomCode, eventType, eventData, playerId });
    
    // Dispatch local events for internal handling
    window.dispatchEvent(new CustomEvent('gamebuddies:gameEvent', {
      detail: {
        eventType,
        eventData,
        playerId,
        roomCode
      }
    }));
    
    return { success: true };
  }

  // Helper method to check if running in GameBuddies context
  isGameBuddiesContext() {
    const urlParams = new URLSearchParams(window.location.search);
    const hasRoomParam = urlParams.has('room');
    const hasNameParam = urlParams.has('name');
    const hasSessionData = sessionStorage.getItem('gamebuddies_roomCode');
    
    return hasRoomParam && hasNameParam || hasSessionData;
  }
}

// Create singleton instance  
const apiClient = new GameBuddiesAPIClient();

export default apiClient; 