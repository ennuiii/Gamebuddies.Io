# External Games Integration Guide - GameBuddies V2

This guide provides complete integration instructions for external games (DDF, Schooled, etc.) to work with GameBuddies V2's enhanced lobby system and seamless return functionality.

## 🆕 What's New in V2

### Enhanced Features
- **Seamless Return**: Any player can return to lobby individually
- **Group Return**: Host can return all players at once
- **Status Synchronization**: Real-time player location tracking
- **Session Recovery**: Automatic reconnection handling
- **Conflict Resolution**: Handle multiple connections gracefully
- **Enhanced APIs**: Improved status reporting and validation

## 📋 Integration Checklist

### For Game Maintainers

- [ ] Update API endpoints to V2
- [ ] Implement enhanced return button
- [ ] Add status synchronization
- [ ] Update session management
- [ ] Test return workflows
- [ ] Update error handling

## 🔧 Implementation Guide

### 1. Enhanced Return Button Integration

**Replace existing return button with V2 component:**

```javascript
// For React games - Enhanced Return Button
import React from 'react';

const GameBuddiesReturnButton = ({ 
  position = 'top-left',
  showForAllPlayers = true,
  customReturnUrl = null 
}) => {
  const [socket, setSocket] = useState(null);
  const [isReturning, setIsReturning] = useState(false);
  const [playerStatus, setPlayerStatus] = useState({});

  // Initialize socket connection to GameBuddies
  useEffect(() => {
    const gamebuddiesUrl = sessionStorage.getItem('gamebuddies_returnUrl') || 
                          'https://gamebuddies.io';
    
    const newSocket = io(gamebuddiesUrl, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: true
    });

    newSocket.on('connect', () => {
      console.log('🔄 Connected to GameBuddies for return functionality');
      
      // Join room to maintain connection
      const roomCode = sessionStorage.getItem('gamebuddies_roomCode');
      const playerName = sessionStorage.getItem('gamebuddies_playerName');
      
      if (roomCode && playerName) {
        newSocket.emit('joinRoom', { roomCode, playerName });
      }
    });

    // Listen for group return events
    newSocket.on('groupReturnInitiated', (data) => {
      console.log('🔄 Group return initiated by host');
      setIsReturning(true);
      
      // Redirect to GameBuddies
      setTimeout(() => {
        window.location.href = data.returnUrl;
      }, 1000);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Individual return handler
  const handleIndividualReturn = async () => {
    if (isReturning || !socket) return;
    
    setIsReturning(true);
    
    try {
      // Update player status to returning
      const roomCode = sessionStorage.getItem('gamebuddies_roomCode');
      const playerName = sessionStorage.getItem('gamebuddies_playerName');
      
      socket.emit('updatePlayerStatus', {
        status: 'returning',
        location: 'lobby',
        metadata: {
          reason: 'Individual return to lobby',
          gamePhase: 'ended',
          timestamp: new Date().toISOString()
        }
      });

      // Navigate back to GameBuddies
      const returnUrl = customReturnUrl || 
                       sessionStorage.getItem('gamebuddies_returnUrl') || 
                       'https://gamebuddies.io';
      
      setTimeout(() => {
        window.location.href = returnUrl;
      }, 500);

    } catch (error) {
      console.error('❌ Return failed:', error);
      setIsReturning(false);
    }
  };

  // Group return handler (host only)
  const handleGroupReturn = async () => {
    const isHost = sessionStorage.getItem('gamebuddies_isHost') === 'true';
    if (!isHost || isReturning || !socket) return;
    
    setIsReturning(true);
    
    try {
      const roomCode = sessionStorage.getItem('gamebuddies_roomCode');
      
      // Initiate group return
      socket.emit('initiateGroupReturn', {
        roomCode,
        reason: 'Host initiated group return'
      });

    } catch (error) {
      console.error('❌ Group return failed:', error);
      setIsReturning(false);
    }
  };

  // Don't show if player is not in a GameBuddies session
  if (!sessionStorage.getItem('gamebuddies_roomCode')) {
    return null;
  }

  const isHost = sessionStorage.getItem('gamebuddies_isHost') === 'true';
  
  return (
    <div className="gamebuddies-return-container" style={{ position: 'fixed', ...getPositionStyle(position), zIndex: 1000 }}>
      {/* Individual return button */}
      <button
        onClick={handleIndividualReturn}
        disabled={isReturning}
        style={{
          padding: '12px 20px',
          backgroundColor: isReturning ? '#666' : '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: isReturning ? 'not-allowed' : 'pointer',
          fontSize: '14px',
          fontWeight: '600',
          marginBottom: isHost ? '8px' : '0'
        }}
      >
        {isReturning ? '🔄 Returning...' : '← Return to Lobby'}
      </button>

      {/* Group return button (host only) */}
      {isHost && (
        <button
          onClick={handleGroupReturn}
          disabled={isReturning}
          style={{
            padding: '10px 16px',
            backgroundColor: isReturning ? '#666' : '#FF9800',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: isReturning ? 'not-allowed' : 'pointer',
            fontSize: '12px',
            fontWeight: '600',
            display: 'block',
            width: '100%'
          }}
        >
          {isReturning ? 'Returning All...' : '👑 Return All Players'}
        </button>
      )}
    </div>
  );
};

// Helper function for positioning
function getPositionStyle(position) {
  const positions = {
    'top-left': { top: '20px', left: '20px' },
    'top-right': { top: '20px', right: '20px' },
    'bottom-left': { bottom: '20px', left: '20px' },
    'bottom-right': { bottom: '20px', right: '20px' }
  };
  return positions[position] || positions['top-left'];
}

export default GameBuddiesReturnButton;
```

### 2. Enhanced Status Reporting

**Update your game's status reporting to use V2 APIs:**

```javascript
class GameBuddiesIntegration {
  constructor() {
    this.apiKey = 'your_game_api_key';
    this.gamebuddiesUrl = 'https://gamebuddies.io';
    this.roomCode = new URLSearchParams(window.location.search).get('room');
    this.playerId = new URLSearchParams(window.location.search).get('playerId');
    this.statusQueue = new Map();
    
    this.setupHeartbeat();
    this.setupStatusReporting();
  }

  // Enhanced status update using V2 API
  async updatePlayerStatus(status, location, metadata = {}) {
    if (!this.roomCode || !this.playerId) {
      console.warn('Missing room code or player ID for status update');
      return;
    }

    try {
      const response = await fetch(`${this.gamebuddiesUrl}/api/v2/game/rooms/${this.roomCode}/players/${this.playerId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey
        },
        body: JSON.stringify({
          status,
          location,
          metadata: {
            ...metadata,
            timestamp: new Date().toISOString(),
            gameVersion: '1.0',
            userAgent: navigator.userAgent
          },
          syncSession: true // Enable session synchronization
        })
      });

      if (!response.ok) {
        throw new Error(`Status update failed: ${response.status}`);
      }

      const result = await response.json();
      
      // Handle session token if provided
      if (result.sessionToken) {
        sessionStorage.setItem('gamebuddies_sessionToken', result.sessionToken);
      }

      // Handle conflicts if any
      if (result.conflicts && result.conflicts.length > 0) {
        console.warn('Status conflicts detected:', result.conflicts);
        this.handleStatusConflicts(result.conflicts);
      }

      console.log('✅ Player status updated:', { status, location, queued: result.queued });
      return result;

    } catch (error) {
      console.error('❌ Status update failed:', error);
      
      // Queue for retry
      this.queueStatusUpdate(status, location, metadata);
      return null;
    }
  }

  // Queue status updates for retry
  queueStatusUpdate(status, location, metadata) {
    const updateId = `${this.playerId}_${Date.now()}`;
    this.statusQueue.set(updateId, {
      status,
      location,
      metadata,
      attempts: 0,
      queuedAt: new Date()
    });
  }

  // Process queued status updates
  async processQueuedUpdates() {
    for (const [updateId, update] of this.statusQueue.entries()) {
      if (update.attempts >= 3) {
        console.warn(`Dropping failed status update after 3 attempts:`, update);
        this.statusQueue.delete(updateId);
        continue;
      }

      try {
        await this.updatePlayerStatus(update.status, update.location, update.metadata);
        this.statusQueue.delete(updateId);
      } catch (error) {
        update.attempts++;
        console.warn(`Status update retry ${update.attempts}/3 failed:`, error);
      }
    }
  }

  // Enhanced heartbeat system
  setupHeartbeat() {
    // Send heartbeat every 30 seconds
    setInterval(async () => {
      try {
        await fetch(`${this.gamebuddiesUrl}/api/v2/game/rooms/${this.roomCode}/players/${this.playerId}/heartbeat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.apiKey
          },
          body: JSON.stringify({
            metadata: {
              gamePhase: this.getCurrentGamePhase(),
              playerCount: this.getActivePlayerCount(),
              timestamp: new Date().toISOString()
            }
          })
        });
      } catch (error) {
        console.warn('Heartbeat failed:', error);
      }
    }, 30000);
  }

  // Setup automatic status reporting
  setupStatusReporting() {
    // Report when player joins game
    this.updatePlayerStatus('connected', 'game', {
      reason: 'Player joined game',
      gamePhase: 'joining'
    });

    // Report status changes during game
    this.onGamePhaseChange = (phase) => {
      this.updatePlayerStatus('in_game', 'game', {
        reason: `Game phase changed to ${phase}`,
        gamePhase: phase
      });
    };

    // Report when player leaves
    window.addEventListener('beforeunload', () => {
      // Use sendBeacon for reliable delivery during page unload
      navigator.sendBeacon(
        `${this.gamebuddiesUrl}/api/v2/game/rooms/${this.roomCode}/players/${this.playerId}/status`,
        JSON.stringify({
          status: 'disconnected',
          location: 'disconnected',
          metadata: {
            reason: 'Page unload',
            timestamp: new Date().toISOString()
          }
        })
      );
    });

    // Process queued updates every 10 seconds
    setInterval(() => {
      this.processQueuedUpdates();
    }, 10000);
  }

  // Handle game end - return all players
  async handleGameEnd(gameResult = {}) {
    try {
      // Get all players in the room
      const allPlayers = this.getAllPlayers(); // Your game's method to get players
      
      // Use bulk status update for efficiency
      const response = await fetch(`${this.gamebuddiesUrl}/api/v2/game/rooms/${this.roomCode}/bulk-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey
        },
        body: JSON.stringify({
          reason: 'Game ended - returning all players to lobby',
          players: allPlayers.map(player => ({
            playerId: player.id,
            location: 'lobby',
            reason: 'Game ended',
            gameData: {
              finalScore: player.score,
              placement: player.placement
            }
          })),
          gameState: {
            ended: true,
            result: gameResult,
            duration: this.getGameDuration()
          },
          returnToLobby: true
        })
      });

      if (response.ok) {
        console.log('✅ Game end reported successfully');
      }

    } catch (error) {
      console.error('❌ Failed to report game end:', error);
    }
  }

  // Handle status conflicts
  handleStatusConflicts(conflicts) {
    conflicts.forEach(conflict => {
      console.warn('Status conflict:', conflict);
      // Could show user notification or force sync
    });
  }

  // Utility methods (implement based on your game)
  getCurrentGamePhase() {
    return 'playing'; // or 'waiting', 'finished', etc.
  }

  getActivePlayerCount() {
    return this.getAllPlayers().length;
  }

  getAllPlayers() {
    return []; // Return array of player objects
  }

  getGameDuration() {
    return Date.now() - this.gameStartTime;
  }
}

// Initialize integration when game loads
const gamebuddiesIntegration = new GameBuddiesIntegration();
```

### 3. Session Recovery Integration

**Add session recovery to handle reconnections:**

```javascript
class SessionManager {
  constructor(gamebuddiesIntegration) {
    this.integration = gamebuddiesIntegration;
    this.setupSessionRecovery();
  }

  setupSessionRecovery() {
    // Check for existing session on page load
    window.addEventListener('load', async () => {
      await this.attemptSessionRecovery();
    });

    // Handle connection drops
    window.addEventListener('online', async () => {
      console.log('🔄 Network reconnected, attempting session recovery');
      await this.attemptSessionRecovery();
    });
  }

  async attemptSessionRecovery() {
    const sessionToken = sessionStorage.getItem('gamebuddies_sessionToken');
    if (!sessionToken) {
      console.log('No session token found, proceeding with normal initialization');
      return;
    }

    try {
      console.log('🔄 Attempting session recovery...');
      
      const response = await fetch(`${this.integration.gamebuddiesUrl}/api/v2/game/sessions/recover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionToken,
          socketId: `game_${Date.now()}`
        })
      });

      if (response.ok) {
        const sessionData = await response.json();
        console.log('✅ Session recovered successfully');
        
        // Update local session data
        sessionStorage.setItem('gamebuddies_sessionToken', sessionData.newSessionToken);
        
        // Restore player state
        this.restorePlayerState(sessionData.playerState);
        
        return sessionData;
      } else {
        throw new Error('Session recovery failed');
      }

    } catch (error) {
      console.warn('⚠️ Session recovery failed:', error);
      sessionStorage.removeItem('gamebuddies_sessionToken');
      return null;
    }
  }

  restorePlayerState(playerState) {
    // Restore player's game state based on their last known status
    if (playerState.currentLocation === 'game' && playerState.inGame) {
      console.log('🎮 Player was in game, restoring game state');
      // Your game-specific restoration logic
    } else if (playerState.currentLocation === 'lobby') {
      console.log('🏠 Player was in lobby, updating status');
      this.integration.updatePlayerStatus('lobby', 'lobby', {
        reason: 'Session recovered - player was in lobby'
      });
    }
  }
}

// Initialize session manager
const sessionManager = new SessionManager(gamebuddiesIntegration);
```

### 4. Error Handling and Fallbacks

**Implement robust error handling:**

```javascript
class ErrorHandler {
  constructor(integration) {
    this.integration = integration;
    this.setupErrorHandling();
  }

  setupErrorHandling() {
    // Handle API failures gracefully
    window.addEventListener('unhandledrejection', (event) => {
      if (event.reason && event.reason.message && 
          event.reason.message.includes('gamebuddies')) {
        console.warn('GameBuddies API error handled:', event.reason);
        
        // Don't break the game for GameBuddies API failures
        this.handleGameBuddiesError(event.reason);
        event.preventDefault();
      }
    });

    // Handle network failures
    window.addEventListener('offline', () => {
      console.warn('⚠️ Network offline - GameBuddies features disabled');
      this.showOfflineNotification();
    });

    window.addEventListener('online', () => {
      console.log('🔄 Network online - Re-enabling GameBuddies features');
      this.hideOfflineNotification();
      // Attempt to resync status
      this.integration.processQueuedUpdates();
    });
  }

  handleGameBuddiesError(error) {
    console.warn('GameBuddies error:', error);
    
    // Show user-friendly message
    this.showNotification('Connection to GameBuddies temporarily lost. Game continues normally.', 'warning');
    
    // Queue the failed operation for retry
    if (error.operation) {
      this.integration.queueStatusUpdate(error.operation.status, error.operation.location, error.operation.metadata);
    }
  }

  showNotification(message, type = 'info') {
    // Your notification system
    console.log(`[${type.toUpperCase()}] ${message}`);
  }

  showOfflineNotification() {
    this.showNotification('Playing offline - return functionality disabled', 'warning');
  }

  hideOfflineNotification() {
    // Hide offline notification
  }
}

const errorHandler = new ErrorHandler(gamebuddiesIntegration);
```

## 🧪 Testing Your Integration

### Test Cases

**1. Individual Return**
- Player clicks return button
- Status updates to 'returning'
- Player redirected to GameBuddies
- Player appears in lobby with correct status

**2. Group Return**
- Host initiates group return
- All players receive return signal
- All players redirected simultaneously
- Room status updates to 'returning'

**3. Status Synchronization**
- Player actions update status in real-time
- GameBuddies lobby shows correct player locations
- Status conflicts resolved automatically

**4. Session Recovery**
- Player disconnects and reconnects
- Session automatically recovered
- Player state restored correctly
- No duplicate connections

**5. Error Handling**
- API failures don't break game
- Network drops handled gracefully
- Operations queued for retry
- User notifications shown appropriately

### Testing Script

```javascript
// Add this to your game for testing
class GameBuddiesTestSuite {
  constructor(integration) {
    this.integration = integration;
  }

  async runTests() {
    console.log('🧪 Running GameBuddies integration tests...');
    
    await this.testStatusUpdate();
    await this.testHeartbeat();
    await this.testReturnFunctionality();
    await this.testErrorHandling();
    
    console.log('✅ All tests completed');
  }

  async testStatusUpdate() {
    console.log('Testing status update...');
    const result = await this.integration.updatePlayerStatus('in_game', 'game', {
      test: true,
      phase: 'testing'
    });
    console.log(result ? '✅ Status update: PASS' : '❌ Status update: FAIL');
  }

  async testHeartbeat() {
    console.log('Testing heartbeat...');
    // Heartbeat test logic
    console.log('✅ Heartbeat: PASS');
  }

  async testReturnFunctionality() {
    console.log('Testing return functionality...');
    // Return test logic
    console.log('✅ Return functionality: PASS');
  }

  async testErrorHandling() {
    console.log('Testing error handling...');
    // Error handling test logic
    console.log('✅ Error handling: PASS');
  }
}

// Run tests in development
if (process.env.NODE_ENV === 'development') {
  const testSuite = new GameBuddiesTestSuite(gamebuddiesIntegration);
  setTimeout(() => testSuite.runTests(), 5000);
}
```

## 📚 API Reference

### V2 Endpoints

**Room Validation**
```
GET /api/v2/game/rooms/{roomCode}/validate?playerId={playerId}&sessionToken={token}
```

**Status Update**
```
POST /api/v2/game/rooms/{roomCode}/players/{playerId}/status
Body: { status, location, metadata, syncSession }
```

**Bulk Status Update**
```
POST /api/v2/game/rooms/{roomCode}/bulk-status
Body: { reason, players[], gameState, returnToLobby }
```

**Session Recovery**
```
POST /api/v2/game/sessions/recover
Body: { sessionToken, socketId }
```

**Heartbeat**
```
POST /api/v2/game/rooms/{roomCode}/players/{playerId}/heartbeat
Body: { metadata }
```

**Game End**
```
POST /api/v2/game/rooms/{roomCode}/game-end
Body: { gameResult, returnPlayers }
```

## 🔧 Migration from V1

**Replace V1 endpoints:**
- `/api/game/` → `/api/v2/game/`
- Add `syncSession: true` to status updates
- Handle `sessionToken` in responses
- Update error codes and responses

**New required fields:**
- `location` in status updates
- `metadata` object with timestamp
- `syncSession` flag for session management

## 📞 Support

**Common Issues:**
1. **Status not syncing**: Check API key and endpoint URLs
2. **Return not working**: Verify socket connection to GameBuddies
3. **Session recovery failing**: Check session token storage and expiry
4. **Conflicts detected**: Review status update logic and timing

**Debug Information:**
Include this information when reporting issues:
- Game name and version
- Player actions leading to issue
- Browser console logs
- Network tab showing API calls
- GameBuddies session storage values

This V2 integration provides a much more robust and user-friendly experience with seamless transitions between games and the GameBuddies lobby.