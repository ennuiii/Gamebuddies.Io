// susd-integration-example.js
// Complete example implementation of SUS'D (Imposter Game) with GameBuddies integration

import susdGameBuddies from './susd-gamebuddies-service.js';

// SUS'D Game Implementation
function SUSDGame() {
  // Game state
  let gameState = {
    phase: 'waiting', // waiting, discussion, voting, results, finished
    players: [],
    imposter: null,
    votes: {},
    timeRemaining: 0,
    roundNumber: 0,
    gameResult: null,
    isGameStarted: false
  };

  let localPlayer = {
    id: null,
    name: null,
    isHost: false,
    isImposter: false
  };

  let gameConfig = {
    discussionTime: 120, // 2 minutes
    votingTime: 60, // 1 minute
    minPlayers: 3,
    maxPlayers: 10
  };

  // Initialize game from URL parameters
  async function initializeGame() {
    try {
      // Parse URL parameters
      const urlParams = new URLSearchParams(window.location.search);
      const roomCode = urlParams.get('room');
      const playerName = urlParams.get('name');
      const isGM = urlParams.get('role') === 'gm';
      
      console.log('🔍 [SUS\'D] Starting game initialization...', { roomCode, playerName, isGM });
      
      if (!roomCode || !playerName) {
        throw new Error('Missing required URL parameters: room and name');
      }

      // Validate room with GameBuddies service
      const roomValidation = await susdGameBuddies.validateRoom(roomCode, playerName);
      if (!roomValidation.isValid) {
        throw new Error(roomValidation.error || 'Room validation failed');
      }

      // Initialize GameBuddies connection
      const initData = await susdGameBuddies.initialize(roomCode, playerName, isGM);
      
      // Set local player data
      localPlayer.id = initData.playerId;
      localPlayer.name = playerName;
      localPlayer.isHost = isGM;
      
      // Initialize UI
      updateUI();
      
      // Set up event listeners
      setupEventListeners();
      
      // Try to load existing game state
      const existingState = await susdGameBuddies.getGameState();
      if (existingState.data) {
        console.log('🔄 [SUS\'D] Loading existing game state...');
        gameState = { ...gameState, ...existingState.data };
        localPlayer.isImposter = existingState.data.playerRoles?.[localPlayer.id]?.isImposter || false;
        updateUI();
      }
      
      console.log('✅ [SUS\'D] Game initialized successfully');
      
    } catch (error) {
      console.error('❌ [SUS\'D] Initialization failed:', error);
      displayError(`Failed to start game: ${error.message}`);
    }
  }

  function createInitialGameState(participants) {
    return {
      phase: 'waiting',
      players: participants.map(p => ({
        id: p.id,
        name: p.name,
        isAlive: true,
        votes: 0,
        hasVoted: false
      })),
      imposter: null,
      votes: {},
      timeRemaining: 0,
      roundNumber: 0,
      gameResult: null,
      isGameStarted: false,
      playerRoles: {},
      startedAt: Date.now()
    };
  }

  function setupEventListeners() {
    // Listen for GameBuddies events
    window.addEventListener('gamebuddies:susGameEvent', handleGameEvent);
    
    // Set up game-specific button handlers
    document.addEventListener('click', (event) => {
      if (event.target.id === 'start-game-btn') {
        startGame();
      } else if (event.target.id === 'start-discussion-btn') {
        startDiscussion();
      } else if (event.target.id === 'start-voting-btn') {
        startVoting();
      } else if (event.target.classList.contains('vote-btn')) {
        const targetPlayerId = event.target.dataset.playerId;
        castVote(targetPlayerId);
      } else if (event.target.id === 'return-lobby-btn') {
        returnToLobby();
      }
    });
  }

  function handleGameEvent(event) {
    const { eventType, eventData } = event.detail;
    console.log('🎮 [SUS\'D] Received game event:', eventType, eventData);

    switch (eventType) {
      case 'game_started':
        handleGameStarted(eventData);
        break;
      case 'roles_assigned':
        handleRolesAssigned(eventData);
        break;
      case 'discussion_started':
        handleDiscussionStarted(eventData);
        break;
      case 'voting_started':
        handleVotingStarted(eventData);
        break;
      case 'vote_cast':
        handleVoteCast(eventData);
        break;
      case 'voting_results':
        handleVotingResults(eventData);
        break;
      case 'game_ended':
        handleGameEnded(eventData);
        break;
      case 'player_eliminated':
        handlePlayerEliminated(eventData);
        break;
    }
  }

  async function startGame() {
    if (!localPlayer.isHost) {
      displayMessage('Only the host can start the game!');
      return;
    }

    if (gameState.players.length < gameConfig.minPlayers) {
      displayMessage(`Need at least ${gameConfig.minPlayers} players to start!`);
      return;
    }

    console.log('🚀 [SUS\'D] Starting game with players:', gameState.players);

    // Assign roles
    const roles = await assignRoles(gameState.players);
    
    gameState.isGameStarted = true;
    gameState.phase = 'discussion';
    gameState.roundNumber = 1;
    gameState.playerRoles = roles.reduce((acc, role) => {
      acc[role.playerId] = role;
      return acc;
    }, {});

    // Set local player's role
    const localRole = roles.find(r => r.playerId === localPlayer.id);
    if (localRole) {
      localPlayer.isImposter = localRole.isImposter;
    }

    // Sync state and notify
    await susdGameBuddies.syncGameState(gameState);
    await susdGameBuddies.sendEvent('game_started', {
      roles: roles,
      startedBy: localPlayer.id,
      timestamp: Date.now()
    });

    updateUI();
  }

  async function assignRoles(players) {
    console.log('🎭 [SUS\'D] Assigning roles...');
    
    const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);
    const imposterIndex = Math.floor(Math.random() * shuffledPlayers.length);
    
    const roles = shuffledPlayers.map((player, index) => ({
      playerId: player.id,
      playerName: player.name,
      isImposter: index === imposterIndex,
      isAlive: true
    }));

    // Set the imposter in game state
    gameState.imposter = roles[imposterIndex].playerId;
    
    console.log('🎭 [SUS\'D] Roles assigned. Imposter:', roles[imposterIndex].playerName);
    
    return roles;
  }

  function handleGameStarted(eventData) {
    console.log('🚀 [SUS\'D] Game started event received');
    gameState.isGameStarted = true;
    gameState.phase = 'discussion';
    
    if (eventData.roles) {
      const localRole = eventData.roles.find(r => r.playerId === localPlayer.id);
      if (localRole) {
        localPlayer.isImposter = localRole.isImposter;
      }
    }
    
    updateUI();
    startDiscussionTimer();
  }

  function handleRolesAssigned(eventData) {
    console.log('🎭 [SUS\'D] Roles assigned event received');
    if (eventData.roles) {
      gameState.playerRoles = eventData.roles.reduce((acc, role) => {
        acc[role.playerId] = role;
        return acc;
      }, {});
    }
    updateUI();
  }

  async function startDiscussion() {
    if (!localPlayer.isHost) return;
    
    console.log('💬 [SUS\'D] Starting discussion phase');
    gameState.phase = 'discussion';
    gameState.timeRemaining = gameConfig.discussionTime;
    
    await susdGameBuddies.syncGameState(gameState);
    await susdGameBuddies.sendEvent('discussion_started', {
      duration: gameConfig.discussionTime,
      startedBy: localPlayer.id,
      timestamp: Date.now()
    });
    
    updateUI();
    startDiscussionTimer();
  }

  function handleDiscussionStarted(eventData) {
    console.log('💬 [SUS\'D] Discussion started');
    gameState.phase = 'discussion';
    gameState.timeRemaining = eventData.duration || gameConfig.discussionTime;
    updateUI();
    startDiscussionTimer();
  }

  function startDiscussionTimer() {
    const timer = setInterval(() => {
      gameState.timeRemaining--;
      updateTimer();
      
      if (gameState.timeRemaining <= 0) {
        clearInterval(timer);
        if (localPlayer.isHost) {
          startVoting();
        }
      }
    }, 1000);
  }

  async function startVoting() {
    if (!localPlayer.isHost) return;
    
    console.log('🗳️ [SUS\'D] Starting voting phase');
    gameState.phase = 'voting';
    gameState.timeRemaining = gameConfig.votingTime;
    gameState.votes = {};
    
    // Reset vote states
    gameState.players.forEach(player => {
      player.hasVoted = false;
      player.votes = 0;
    });
    
    await susdGameBuddies.syncGameState(gameState);
    await susdGameBuddies.sendEvent('voting_started', {
      duration: gameConfig.votingTime,
      startedBy: localPlayer.id,
      timestamp: Date.now()
    });
    
    updateUI();
    startVotingTimer();
  }

  function handleVotingStarted(eventData) {
    console.log('🗳️ [SUS\'D] Voting started');
    gameState.phase = 'voting';
    gameState.timeRemaining = eventData.duration || gameConfig.votingTime;
    gameState.votes = {};
    updateUI();
    startVotingTimer();
  }

  function startVotingTimer() {
    const timer = setInterval(() => {
      gameState.timeRemaining--;
      updateTimer();
      
      if (gameState.timeRemaining <= 0) {
        clearInterval(timer);
        if (localPlayer.isHost) {
          calculateVotingResults();
        }
      }
    }, 1000);
  }

  async function castVote(targetPlayerId) {
    if (gameState.phase !== 'voting') {
      displayMessage('Voting is not active!');
      return;
    }

    const localPlayerInGame = gameState.players.find(p => p.id === localPlayer.id);
    if (localPlayerInGame?.hasVoted) {
      displayMessage('You have already voted!');
      return;
    }

    console.log('🗳️ [SUS\'D] Casting vote for player:', targetPlayerId);
    
    // Record vote locally
    gameState.votes[localPlayer.id] = targetPlayerId;
    localPlayerInGame.hasVoted = true;
    
    await susdGameBuddies.sendEvent('vote_cast', {
      voterPlayerId: localPlayer.id,
      targetPlayerId: targetPlayerId,
      timestamp: Date.now()
    });
    
    updateUI();
  }

  function handleVoteCast(eventData) {
    console.log('🗳️ [SUS\'D] Vote cast:', eventData);
    gameState.votes[eventData.voterPlayerId] = eventData.targetPlayerId;
    
    const voter = gameState.players.find(p => p.id === eventData.voterPlayerId);
    if (voter) {
      voter.hasVoted = true;
    }
    
    updateUI();
  }

  async function calculateVotingResults() {
    console.log('📊 [SUS\'D] Calculating voting results...');
    
    // Count votes
    const voteCounts = {};
    Object.values(gameState.votes).forEach(targetId => {
      voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
    });
    
    // Find player with most votes
    let eliminatedPlayer = null;
    let maxVotes = 0;
    
    Object.entries(voteCounts).forEach(([playerId, votes]) => {
      if (votes > maxVotes) {
        maxVotes = votes;
        eliminatedPlayer = playerId;
      }
    });
    
    const eliminatedPlayerData = gameState.players.find(p => p.id === eliminatedPlayer);
    const wasImposter = gameState.playerRoles[eliminatedPlayer]?.isImposter || false;
    
    // Determine game result
    let gameResult = null;
    if (wasImposter) {
      gameResult = 'innocents_win';
    } else {
      // Check remaining players
      const alivePlayers = gameState.players.filter(p => p.isAlive && p.id !== eliminatedPlayer);
      const aliveInnocents = alivePlayers.filter(p => !gameState.playerRoles[p.id]?.isImposter);
      const aliveImposters = alivePlayers.filter(p => gameState.playerRoles[p.id]?.isImposter);
      
      if (aliveImposters.length >= aliveInnocents.length) {
        gameResult = 'imposter_wins';
      }
    }
    
    gameState.phase = 'results';
    if (eliminatedPlayer) {
      const player = gameState.players.find(p => p.id === eliminatedPlayer);
      if (player) {
        player.isAlive = false;
      }
    }
    
    await susdGameBuddies.sendEvent('voting_results', {
      eliminatedPlayer: eliminatedPlayerData,
      wasImposter: wasImposter,
      voteCounts: voteCounts,
      gameResult: gameResult,
      timestamp: Date.now()
    });
    
    if (gameResult) {
      await susdGameBuddies.sendEvent('game_ended', {
        result: gameResult,
        imposterPlayer: gameState.players.find(p => p.id === gameState.imposter),
        timestamp: Date.now()
      });
    }
    
    updateUI();
  }

  function handleVotingResults(eventData) {
    console.log('📊 [SUS\'D] Voting results:', eventData);
    gameState.phase = 'results';
    
    if (eventData.eliminatedPlayer) {
      const player = gameState.players.find(p => p.id === eventData.eliminatedPlayer.id);
      if (player) {
        player.isAlive = false;
      }
    }
    
    updateUI();
    displayVotingResults(eventData);
  }

  function handleGameEnded(eventData) {
    console.log('🎉 [SUS\'D] Game ended:', eventData);
    gameState.phase = 'finished';
    gameState.gameResult = eventData.result;
    updateUI();
    displayGameResults(eventData);
  }

  function handlePlayerEliminated(eventData) {
    console.log('💀 [SUS\'D] Player eliminated:', eventData);
    const player = gameState.players.find(p => p.id === eventData.playerId);
    if (player) {
      player.isAlive = false;
    }
    updateUI();
  }

  function updateUI() {
    const gameContainer = document.getElementById('game-container');
    if (!gameContainer) return;

    let html = `
      <div class="susd-game">
        <header class="game-header">
          <h1>🔍 SUS'D - Imposter Game</h1>
          <div class="room-info">Room: ${susdGameBuddies.roomCode || 'Loading...'}</div>
        </header>
        
        <div class="game-content">
    `;

    if (!gameState.isGameStarted) {
      html += `
        <div class="waiting-screen">
          <h2>Waiting for Game to Start</h2>
          <p>Players: ${gameState.players.length}</p>
          ${localPlayer.isHost ? `<button id="start-game-btn" class="btn btn-primary">Start Game</button>` : ''}
        </div>
      `;
    } else {
      html += `
        <div class="game-status">
          <div class="phase">Phase: ${gameState.phase.toUpperCase()}</div>
          <div class="timer" id="timer">Time: ${gameState.timeRemaining}s</div>
          <div class="round">Round: ${gameState.roundNumber}</div>
        </div>
        
        <div class="role-info">
          <h3>Your Role</h3>
          <div class="role ${localPlayer.isImposter ? 'imposter' : 'innocent'}">
            ${localPlayer.isImposter ? '🎭 You are the IMPOSTER!' : '🕵️ You are INNOCENT!'}
          </div>
        </div>
        
        <div class="players-list">
          <h3>Players (${gameState.players.filter(p => p.isAlive).length} alive)</h3>
          <div class="players-grid">
            ${gameState.players.map(player => `
              <div class="player-card ${!player.isAlive ? 'eliminated' : ''}">
                <div class="player-name">${player.name}</div>
                <div class="player-status">
                  ${!player.isAlive ? '💀 Eliminated' : '✅ Alive'}
                  ${player.hasVoted ? '🗳️ Voted' : ''}
                </div>
                ${gameState.phase === 'voting' && player.isAlive && player.id !== localPlayer.id ? 
                  `<button class="vote-btn btn btn-danger" data-player-id="${player.id}">Vote Out</button>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      `;

      if (gameState.phase === 'results') {
        html += `
          <div class="results-screen">
            <h3>Voting Results</h3>
            <div id="voting-results"></div>
          </div>
        `;
      }

      if (gameState.phase === 'finished') {
        html += `
          <div class="game-end-screen">
            <h3>Game Over!</h3>
            <div class="game-result">
              ${gameState.gameResult === 'innocents_win' ? '🕵️ Innocents Win!' : '🎭 Imposter Wins!'}
            </div>
            <button id="return-lobby-btn" class="btn btn-secondary">Return to Lobby</button>
          </div>
        `;
      }

      if (localPlayer.isHost && gameState.phase === 'discussion') {
        html += `<button id="start-voting-btn" class="btn btn-warning">Start Voting</button>`;
      }
    }

    html += `
        </div>
        
        <div class="game-controls">
          <button id="return-lobby-btn" class="btn btn-secondary">Return to Lobby</button>
        </div>
      </div>
      
      <style>
        .susd-game { 
          max-width: 800px; 
          margin: 0 auto; 
          padding: 20px; 
          font-family: Arial, sans-serif; 
        }
        .game-header { 
          text-align: center; 
          margin-bottom: 30px; 
          color: #333; 
        }
        .game-status { 
          display: flex; 
          justify-content: space-between; 
          background: #f0f0f0; 
          padding: 15px; 
          border-radius: 8px; 
          margin-bottom: 20px; 
        }
        .role-info { 
          text-align: center; 
          margin-bottom: 20px; 
        }
        .role.imposter { 
          color: #e74c3c; 
          font-weight: bold; 
          font-size: 1.2em; 
        }
        .role.innocent { 
          color: #2ecc71; 
          font-weight: bold; 
          font-size: 1.2em; 
        }
        .players-grid { 
          display: grid; 
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
          gap: 15px; 
          margin-bottom: 20px; 
        }
        .player-card { 
          background: white; 
          border: 2px solid #ddd; 
          border-radius: 8px; 
          padding: 15px; 
          text-align: center; 
        }
        .player-card.eliminated { 
          opacity: 0.5; 
          background: #f8f8f8; 
        }
        .btn { 
          padding: 10px 20px; 
          border: none; 
          border-radius: 5px; 
          cursor: pointer; 
          font-size: 16px; 
          margin: 5px; 
        }
        .btn-primary { 
          background: #3498db; 
          color: white; 
        }
        .btn-danger { 
          background: #e74c3c; 
          color: white; 
        }
        .btn-warning { 
          background: #f39c12; 
          color: white; 
        }
        .btn-secondary { 
          background: #95a5a6; 
          color: white; 
        }
        .waiting-screen, .results-screen, .game-end-screen { 
          text-align: center; 
          padding: 40px; 
          background: #f9f9f9; 
          border-radius: 8px; 
          margin: 20px 0; 
        }
        .game-controls { 
          text-align: center; 
          margin-top: 30px; 
        }
        #message { 
          position: fixed; 
          top: 20px; 
          right: 20px; 
          background: #333; 
          color: white; 
          padding: 15px; 
          border-radius: 5px; 
          z-index: 1000; 
        }
      </style>
    `;

    gameContainer.innerHTML = html;
  }

  function updateTimer() {
    const timerElement = document.getElementById('timer');
    if (timerElement) {
      timerElement.textContent = `Time: ${gameState.timeRemaining}s`;
    }
  }

  function displayVotingResults(results) {
    const resultsContainer = document.getElementById('voting-results');
    if (resultsContainer) {
      resultsContainer.innerHTML = `
        <p><strong>Eliminated:</strong> ${results.eliminatedPlayer?.name || 'No one'}</p>
        <p><strong>Was Imposter:</strong> ${results.wasImposter ? 'Yes! 🎭' : 'No 😢'}</p>
        <div class="vote-breakdown">
          <h4>Vote Breakdown:</h4>
          ${Object.entries(results.voteCounts || {}).map(([playerId, votes]) => {
            const player = gameState.players.find(p => p.id === playerId);
            return `<p>${player?.name || 'Unknown'}: ${votes} votes</p>`;
          }).join('')}
        </div>
      `;
    }
  }

  function displayGameResults(results) {
    console.log('🎉 [SUS\'D] Displaying game results:', results);
    displayMessage(`Game Over! ${results.result === 'innocents_win' ? 'Innocents Win!' : 'Imposter Wins!'}`);
  }

  function displayMessage(message) {
    // Remove existing message
    const existingMessage = document.getElementById('message');
    if (existingMessage) {
      existingMessage.remove();
    }

    // Create new message
    const messageDiv = document.createElement('div');
    messageDiv.id = 'message';
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      messageDiv.remove();
    }, 3000);
  }

  function displayError(message) {
    console.error('❌ [SUS\'D] Error:', message);
    displayMessage(`Error: ${message}`);
  }

  function returnToLobby() {
    susdGameBuddies.returnToGameBuddies();
  }

  // Initialize the game when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeGame);
  } else {
    initializeGame();
  }

  // Return public API
  return {
    initializeGame,
    startGame,
    castVote,
    returnToLobby,
    getGameState: () => gameState,
    getLocalPlayer: () => localPlayer
  };
}

// Initialize the game
const susGame = SUSDGame();

// Make available globally for debugging
window.susGame = susGame;

export default susGame; 