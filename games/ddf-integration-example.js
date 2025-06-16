// ddf-integration-example.js
// Example of how to integrate GameBuddies into a DDF game component

import React, { useState, useEffect } from 'react';
import ddfGameBuddies from './ddf-gamebuddies-service';

function DDFGame() {
  const [gameData, setGameData] = useState(null);
  const [players, setPlayers] = useState([]);
  const [gameState, setGameState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    initializeGame();
    
    // Listen for GameBuddies events
    window.addEventListener('gamebuddies:stateUpdated', handleStateUpdate);
    window.addEventListener('gamebuddies:playerJoined', handlePlayerJoined);
    window.addEventListener('gamebuddies:playerLeft', handlePlayerLeft);
    window.addEventListener('gamebuddies:gameEvent', handleGameEvent);
    
    return () => {
      ddfGameBuddies.disconnect();
      window.removeEventListener('gamebuddies:stateUpdated', handleStateUpdate);
      window.removeEventListener('gamebuddies:playerJoined', handlePlayerJoined);
      window.removeEventListener('gamebuddies:playerLeft', handlePlayerLeft);
      window.removeEventListener('gamebuddies:gameEvent', handleGameEvent);
    };
  }, []);
  
  async function initializeGame() {
    const params = new URLSearchParams(window.location.search);
    const roomCode = params.get('room');
    const playerName = params.get('name');
    const isGM = params.get('role') === 'gm';
    
    if (!roomCode || !playerName) {
      // Show normal DDF UI (not connected to GameBuddies)
      console.log('🎮 [DDF] Running in standalone mode');
      setLoading(false);
      return;
    }
    
    try {
      console.log('🚀 [DDF] Initializing GameBuddies integration...', { roomCode, playerName, isGM });
      
      const data = await ddfGameBuddies.initialize(roomCode, playerName, isGM);
      
      console.log('✅ [DDF] GameBuddies integration initialized:', data);
      
      setGameData({
        roomCode: data.room.code,
        playerId: data.playerId,
        isHost: data.isHost,
        settings: data.room.settings
      });
      
      setPlayers(data.participants || []);
      
      if (data.gameState && data.gameState.data) {
        console.log('📥 [DDF] Loading existing game state');
        setGameState(data.gameState.data);
      } else if (data.isHost) {
        console.log('🎮 [DDF] Initializing new game state as host');
        // Initialize new game state
        const initialState = createInitialGameState(data.participants);
        await ddfGameBuddies.syncGameState(initialState);
        setGameState(initialState);
      } else {
        console.log('⏳ [DDF] Waiting for host to initialize game state');
        setGameState({ waiting: true });
      }
      
      setLoading(false);
      
    } catch (error) {
      console.error('❌ [DDF] Failed to initialize GameBuddies:', error);
      setError(`Failed to join game: ${error.message}`);
      setLoading(false);
    }
  }
  
  function createInitialGameState(participants) {
    return {
      version: 1,
      currentRound: 1,
      totalRounds: 5,
      phase: 'waiting', // waiting, question, answering, results, eliminated, finished
      players: participants.map(p => ({
        id: p.id,
        name: p.name,
        score: 0,
        lives: 3,
        isEliminated: false,
        currentAnswer: null,
        isReady: false
      })),
      currentQuestion: null,
      answers: {},
      eliminations: [],
      startTime: Date.now(),
      settings: {
        timePerQuestion: 30,
        questionsPerRound: 5,
        livesPerPlayer: 3
      }
    };
  }
  
  function handleStateUpdate(event) {
    console.log('📊 [DDF] Game state update received:', event.detail);
    // Reload state from GameBuddies
    ddfGameBuddies.getGameState()
      .then(state => {
        if (state && state.data) {
          console.log('📥 [DDF] Updated game state loaded');
          setGameState(state.data);
        }
      })
      .catch(error => {
        console.error('❌ [DDF] Failed to load updated state:', error);
      });
  }
  
  function handlePlayerJoined(event) {
    console.log('🚪 [DDF] Player joined:', event.detail);
    const { player } = event.detail;
    setPlayers(prev => {
      // Avoid duplicates
      if (prev.find(p => p.id === player.id)) {
        return prev;
      }
      return [...prev, player];
    });
    
    // Send current state to new player if we're the host
    if (gameData?.isHost && gameState && !gameState.waiting) {
      console.log('📤 [DDF] Sending current state to new player');
      ddfGameBuddies.syncGameState(gameState);
    }
  }
  
  function handlePlayerLeft(event) {
    console.log('👋 [DDF] Player left:', event.detail);
    const { playerId } = event.detail;
    setPlayers(prev => prev.filter(p => p.id !== playerId));
    
    // Update game state to mark player as disconnected
    if (gameState && !gameState.waiting) {
      const newState = {
        ...gameState,
        players: gameState.players.map(p => 
          p.id === playerId ? { ...p, isDisconnected: true } : p
        )
      };
      setGameState(newState);
      
      // Sync if we're the host
      if (gameData?.isHost) {
        ddfGameBuddies.syncGameState(newState);
      }
    }
  }
  
  function handleGameEvent(event) {
    console.log('🎮 [DDF] Game event received:', event.detail);
    const { eventType, eventData, playerId } = event.detail;
    
    switch (eventType) {
      case 'answer_submitted':
        handleAnswerSubmitted(playerId, eventData.answer);
        break;
      case 'round_started':
        handleRoundStarted(eventData);
        break;
      case 'player_ready':
        handlePlayerReady(playerId);
        break;
      case 'game_started':
        handleGameStarted(eventData);
        break;
      // Handle other game events
      default:
        console.log('🤷 [DDF] Unknown event type:', eventType);
    }
  }
  
  function handleAnswerSubmitted(playerId, answer) {
    console.log('📝 [DDF] Answer submitted:', { playerId, answer });
    if (!gameState || gameState.waiting) return;
    
    const newState = {
      ...gameState,
      answers: {
        ...gameState.answers,
        [playerId]: answer
      },
      players: gameState.players.map(p => 
        p.id === playerId ? { ...p, currentAnswer: answer } : p
      )
    };
    
    setGameState(newState);
    
    // Sync if we're the host
    if (gameData?.isHost) {
      ddfGameBuddies.syncGameState(newState);
    }
  }
  
  function handleRoundStarted(roundData) {
    console.log('🎯 [DDF] Round started:', roundData);
    // Update local state with round data
    setGameState(prev => ({
      ...prev,
      ...roundData,
      answers: {},
      players: prev.players.map(p => ({ ...p, currentAnswer: null, isReady: false }))
    }));
  }
  
  function handlePlayerReady(playerId) {
    console.log('✅ [DDF] Player ready:', playerId);
    setGameState(prev => ({
      ...prev,
      players: prev.players.map(p => 
        p.id === playerId ? { ...p, isReady: true } : p
      )
    }));
  }
  
  function handleGameStarted(gameData) {
    console.log('🚀 [DDF] Game started:', gameData);
    setGameState(prev => ({
      ...prev,
      phase: 'question',
      currentQuestion: gameData.firstQuestion
    }));
  }
  
  // Game actions that sync with GameBuddies
  async function submitAnswer(answer) {
    if (!gameData?.playerId || !gameState || gameState.waiting) return;
    
    try {
      console.log('📤 [DDF] Submitting answer:', answer);
      
      // Send event to notify other players
      await ddfGameBuddies.sendEvent('answer_submitted', { answer });
      
      // Update local state
      const newState = {
        ...gameState,
        answers: {
          ...gameState.answers,
          [gameData.playerId]: answer
        },
        players: gameState.players.map(p => 
          p.id === gameData.playerId ? { ...p, currentAnswer: answer } : p
        )
      };
      
      setGameState(newState);
      
      // Sync if host
      if (gameData.isHost) {
        await ddfGameBuddies.syncGameState(newState);
      }
      
      console.log('✅ [DDF] Answer submitted successfully');
    } catch (error) {
      console.error('❌ [DDF] Failed to submit answer:', error);
    }
  }
  
  async function startNewRound() {
    if (!gameData?.isHost || !gameState || gameState.waiting) return;
    
    try {
      console.log('🎯 [DDF] Starting new round...');
      
      const newRound = {
        currentRound: gameState.currentRound + 1,
        phase: 'question',
        currentQuestion: generateQuestion(), // Your question generation logic
        answers: {},
        roundStartTime: Date.now()
      };
      
      const newState = {
        ...gameState,
        ...newRound,
        players: gameState.players.map(p => ({ 
          ...p, 
          currentAnswer: null, 
          isReady: false 
        }))
      };
      
      // Sync state first
      await ddfGameBuddies.syncGameState(newState);
      
      // Then send event to notify all players
      await ddfGameBuddies.sendEvent('round_started', newRound);
      
      setGameState(newState);
      
      console.log('✅ [DDF] New round started successfully');
    } catch (error) {
      console.error('❌ [DDF] Failed to start new round:', error);
    }
  }
  
  async function markPlayerReady() {
    if (!gameData?.playerId) return;
    
    try {
      await ddfGameBuddies.sendEvent('player_ready', {});
      console.log('✅ [DDF] Marked as ready');
    } catch (error) {
      console.error('❌ [DDF] Failed to mark ready:', error);
    }
  }
  
  function generateQuestion() {
    // Your question generation logic here
    return {
      id: Math.random().toString(36).substr(2, 9),
      text: "What is 2 + 2?",
      options: ["3", "4", "5", "6"],
      correctAnswer: 1,
      difficulty: "easy"
    };
  }
  
  // Render loading state
  if (loading) {
    return (
      <div className="ddf-loading">
        <h2>🎮 Loading DDF...</h2>
        <p>Connecting to GameBuddies...</p>
      </div>
    );
  }
  
  // Render error state
  if (error) {
    return (
      <div className="ddf-error">
        <h2>❌ Connection Failed</h2>
        <p>{error}</p>
        <button onClick={() => window.location.href = '/'}>
          Return to GameBuddies
        </button>
      </div>
    );
  }
  
  // Render game state
  return (
    <div className="ddf-game">
      <div className="ddf-header">
        <h1>🎯 Der dümmste fliegt</h1>
        {gameData && (
          <div className="game-info">
            <p>Room: {gameData.roomCode}</p>
            <p>Players: {players.length}</p>
            {gameData.isHost && <span className="host-badge">HOST</span>}
          </div>
        )}
      </div>
      
      <div className="ddf-players">
        <h3>Players ({players.length})</h3>
        <ul>
          {players.map(player => (
            <li key={player.id} className={player.isReady ? 'ready' : ''}>
              {player.name} {player.role === 'host' && '👑'}
              {player.isReady && '✅'}
            </li>
          ))}
        </ul>
      </div>
      
      <div className="ddf-game-area">
        {gameState?.waiting ? (
          <div className="waiting-state">
            <h2>⏳ Waiting for host to start the game...</h2>
            <button onClick={markPlayerReady}>Mark as Ready</button>
          </div>
        ) : gameState?.phase === 'question' ? (
          <div className="question-state">
            <h2>Question {gameState.currentRound}</h2>
            <p>{gameState.currentQuestion?.text}</p>
            <div className="options">
              {gameState.currentQuestion?.options.map((option, index) => (
                <button 
                  key={index}
                  onClick={() => submitAnswer(index)}
                  disabled={gameState.answers[gameData?.playerId] !== undefined}
                >
                  {option}
                </button>
              ))}
            </div>
            {gameState.answers[gameData?.playerId] !== undefined && (
              <p>✅ Answer submitted!</p>
            )}
          </div>
        ) : (
          <div className="game-state">
            <h2>Game Phase: {gameState?.phase}</h2>
            <pre>{JSON.stringify(gameState, null, 2)}</pre>
          </div>
        )}
        
        {gameData?.isHost && (
          <div className="host-controls">
            <h3>Host Controls</h3>
            <button onClick={startNewRound}>Start New Round</button>
          </div>
        )}
      </div>
      
      {process.env.NODE_ENV === 'development' && (
        <div className="debug-info">
          <h4>🐛 Debug Info</h4>
          <p>Connection: {ddfGameBuddies.getConnectionInfo().isConnected ? '✅' : '❌'}</p>
          <p>Player ID: {gameData?.playerId}</p>
          <p>Is Host: {gameData?.isHost ? 'Yes' : 'No'}</p>
        </div>
      )}
    </div>
  );
}

export default DDFGame; 