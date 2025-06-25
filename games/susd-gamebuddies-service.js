// susd-gamebuddies-service.js
// GameBuddies integration service for SUS'D (Imposter Game)

class SUSDGameBuddiesService {
  constructor() {
    this.isConnected = false;
    this.roomCode = null;
    this.playerName = null;
    this.playerId = null;
    this.isHost = false;
    this.connectionInfo = { isConnected: false };
    this.gameData = {
      isImposter: false,
      phase: 'waiting', // waiting, discussion, voting, results
      votingResults: [],
      roundNumber: 0
    };
  }

  async initialize(roomCode, playerName, isGM = false) {
    console.log('🔍 [SUS\'D-GameBuddies] Initializing with URL parameters...', { roomCode, playerName, isGM });
    
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
    
    console.log('📋 [SUS\'D-GameBuddies] Session storage data:', sessionData);
    
    // Validate that we have the basic data needed
    if (!roomCode || !playerName) {
      throw new Error('Missing room code or player name from URL parameters');
    }
    
    this.isConnected = true;
    this.connectionInfo = { isConnected: true };
    
    // Return mock data structure for SUS'D game initialization
    const initData = {
      room: {
        code: roomCode,
        settings: {
          maxPlayers: 10,
          discussionTime: 120, // 2 minutes discussion
          votingTime: 60, // 1 minute voting
          imposterCount: 1 // Number of imposters
        }
      },
      playerId: this.playerId,
      isHost: isGM,
      participants: [
        {
          id: this.playerId,
          name: playerName,
          role: isGM ? 'host' : 'player',
          isImposter: false, // Will be set during game start
          isAlive: true,
          votes: 0
        }
      ],
      gameState: null // No existing state for new games
    };
    
    console.log('✅ [SUS\'D-GameBuddies] Initialization complete:', initData);
    return initData;
  }

  async validateRoom(roomCode, playerName) {
    // For internal SUS'D games, we don't need API validation
    // Just check if we have the basic URL parameters
    console.log('🔍 [SUS\'D-GameBuddies] Validating room (internal):', { roomCode, playerName });
    
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
    console.log('📊 [SUS\'D-GameBuddies] Sync game state:', gameState);
    
    // Update local game data
    if (gameState.isImposter !== undefined) {
      this.gameData.isImposter = gameState.isImposter;
    }
    if (gameState.phase) {
      this.gameData.phase = gameState.phase;
    }
    if (gameState.votingResults) {
      this.gameData.votingResults = gameState.votingResults;
    }
    if (gameState.roundNumber !== undefined) {
      this.gameData.roundNumber = gameState.roundNumber;
    }
    
    // Store in localStorage for persistence
    localStorage.setItem(`susd_gameState_${this.roomCode}`, JSON.stringify({
      ...gameState,
      timestamp: Date.now()
    }));
    
    return { success: true };
  }

  async getGameState() {
    console.log('📥 [SUS\'D-GameBuddies] Get game state');
    const stored = localStorage.getItem(`susd_gameState_${this.roomCode}`);
    if (stored) {
      return { data: JSON.parse(stored) };
    }
    return { data: null };
  }

  async sendEvent(eventType, eventData) {
    console.log('📤 [SUS\'D-GameBuddies] Send event:', { eventType, eventData });
    
    // Handle SUS'D specific events
    switch (eventType) {
      case 'vote_cast':
        console.log(`🗳️ Player ${this.playerName} voted for ${eventData.targetPlayer}`);
        break;
      case 'imposter_revealed':
        console.log(`🎭 Imposter revealed: ${eventData.imposterName}`);
        break;
      case 'game_won':
        console.log(`🎉 Game won by ${eventData.winner} team`);
        break;
      case 'discussion_started':
        console.log('💬 Discussion phase started');
        break;
      case 'voting_started':
        console.log('🗳️ Voting phase started');
        break;
    }
    
    // Dispatch custom events for local handling
    window.dispatchEvent(new CustomEvent('gamebuddies:susGameEvent', {
      detail: {
        eventType,
        eventData,
        playerId: this.playerId,
        playerName: this.playerName,
        isImposter: this.gameData.isImposter
      }
    }));
    
    return { success: true };
  }

  // SUS'D specific methods
  async assignRoles(players) {
    console.log('🎭 [SUS\'D-GameBuddies] Assigning roles to players:', players.length);
    
    const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);
    const imposterIndex = Math.floor(Math.random() * shuffledPlayers.length);
    
    const roles = shuffledPlayers.map((player, index) => ({
      playerId: player.id,
      playerName: player.name,
      isImposter: index === imposterIndex,
      isAlive: true
    }));
    
    // Set local player's role
    const localPlayerRole = roles.find(r => r.playerId === this.playerId);
    if (localPlayerRole) {
      this.gameData.isImposter = localPlayerRole.isImposter;
      console.log(`🎭 [SUS\'D-GameBuddies] You are ${this.gameData.isImposter ? 'the IMPOSTER' : 'an INNOCENT'}`);
    }
    
    return roles;
  }

  async castVote(targetPlayerId) {
    console.log('🗳️ [SUS\'D-GameBuddies] Casting vote for player:', targetPlayerId);
    
    await this.sendEvent('vote_cast', {
      voterPlayerId: this.playerId,
      targetPlayerId: targetPlayerId,
      timestamp: Date.now()
    });
    
    return { success: true };
  }

  async startDiscussion() {
    console.log('💬 [SUS\'D-GameBuddies] Starting discussion phase');
    this.gameData.phase = 'discussion';
    
    await this.sendEvent('discussion_started', {
      startedBy: this.playerId,
      timestamp: Date.now()
    });
    
    return { success: true };
  }

  async startVoting() {
    console.log('🗳️ [SUS\'D-GameBuddies] Starting voting phase');
    this.gameData.phase = 'voting';
    
    await this.sendEvent('voting_started', {
      startedBy: this.playerId,
      timestamp: Date.now()
    });
    
    return { success: true };
  }

  getConnectionInfo() {
    return {
      ...this.connectionInfo,
      gameData: this.gameData
    };
  }

  isPlayerImposter() {
    return this.gameData.isImposter;
  }

  getCurrentPhase() {
    return this.gameData.phase;
  }

  disconnect() {
    console.log('🔌 [SUS\'D-GameBuddies] Disconnecting...');
    this.isConnected = false;
    this.connectionInfo = { isConnected: false };
  }

  // Helper method to return to GameBuddies
  returnToGameBuddies() {
    const returnUrl = sessionStorage.getItem('gamebuddies_returnUrl');
    if (returnUrl && this.roomCode) {
      const finalUrl = `${returnUrl}?rejoin=${this.roomCode}`;
      console.log('🔄 [SUS\'D-GameBuddies] Returning to GameBuddies:', finalUrl);
      window.location.href = finalUrl;
    } else {
      console.log('🔄 [SUS\'D-GameBuddies] No return URL found, redirecting to home');
      window.location.href = '/';
    }
  }
}

// Create singleton instance
const susdGameBuddies = new SUSDGameBuddiesService();

export default susdGameBuddies; 