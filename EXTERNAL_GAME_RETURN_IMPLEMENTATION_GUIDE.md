# External Game Return Button & Status API Implementation Guide

This guide provides step-by-step instructions for external games (DDF, Schooled, SUS'D, etc.) to implement the GameBuddies return functionality and status reporting system.

## 🎯 Overview

External games need to implement two key features:
1. **Return Button**: Allow players to return to their GameBuddies lobby
2. **Status Updates**: Report player status changes to GameBuddies via API

## 🔧 Quick Implementation Checklist

- [ ] Add return button component to your game
- [ ] Implement status update API calls
- [ ] Handle session storage for GameBuddies data
- [ ] Test individual and group return workflows
- [ ] Add error handling for offline scenarios

---

## 📋 Part 1: Return Button Implementation

### Step 1: Check for GameBuddies Session

First, detect if your game was launched from GameBuddies by checking URL parameters and session storage:

```javascript
// Check if game was launched from GameBuddies
function isLaunchedFromGameBuddies() {
    // Check URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const roomCode = urlParams.get('room');
    
    // Check session storage
    const sessionRoomCode = sessionStorage.getItem('gamebuddies_roomCode');
    const sessionPlayerName = sessionStorage.getItem('gamebuddies_playerName');
    
    return !!(roomCode || (sessionRoomCode && sessionPlayerName));
}

// Get GameBuddies session data
function getGameBuddiesSession() {
    const urlParams = new URLSearchParams(window.location.search);
    
    return {
        roomCode: urlParams.get('room') || sessionStorage.getItem('gamebuddies_roomCode'),
        playerName: urlParams.get('name') || sessionStorage.getItem('gamebuddies_playerName'),
        playerId: urlParams.get('playerId') || sessionStorage.getItem('gamebuddies_playerId'),
        isHost: urlParams.get('role') === 'gm' || sessionStorage.getItem('gamebuddies_isHost') === 'true',
        returnUrl: sessionStorage.getItem('gamebuddies_returnUrl') || 'https://gamebuddies.io'
    };
}
```

### Step 2: Create the Return Button Component

**For React Games:**

```javascript
import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';

const GameBuddiesReturnButton = ({ 
    position = 'top-left',
    style = {},
    className = ''
}) => {
    const [socket, setSocket] = useState(null);
    const [isReturning, setIsReturning] = useState(false);
    const [sessionData, setSessionData] = useState(null);

    useEffect(() => {
        // Only show if launched from GameBuddies
        if (!isLaunchedFromGameBuddies()) {
            return;
        }

        const session = getGameBuddiesSession();
        setSessionData(session);

        // Connect to GameBuddies server for real-time communication
        const gamebuddiesSocket = io(session.returnUrl, {
            transports: ['websocket', 'polling'],
            timeout: 20000,
            forceNew: true
        });

        gamebuddiesSocket.on('connect', () => {
            console.log('🔄 Connected to GameBuddies for return functionality');
            
            // Join room to maintain connection
            gamebuddiesSocket.emit('joinRoom', {
                roomCode: session.roomCode,
                playerName: session.playerName
            });
        });

        // Listen for group return events
        gamebuddiesSocket.on('groupReturnInitiated', (data) => {
            console.log('🔄 Group return initiated by host');
            handleReturn(data.returnUrl);
        });

        setSocket(gamebuddiesSocket);

        return () => {
            gamebuddiesSocket?.disconnect();
        };
    }, []);

    const handleIndividualReturn = async () => {
        if (!sessionData || isReturning) return;
        
        setIsReturning(true);
        
        try {
            // Update player status to returning
            if (socket && socket.connected) {
                socket.emit('updatePlayerStatus', {
                    status: 'returning',
                    location: 'lobby',
                    metadata: {
                        reason: 'Individual return to lobby',
                        timestamp: new Date().toISOString()
                    }
                });
            }

            // Small delay to ensure status update is sent
            setTimeout(() => {
                handleReturn(sessionData.returnUrl);
            }, 500);

        } catch (error) {
            console.error('❌ Individual return failed:', error);
            setIsReturning(false);
        }
    };

    const handleGroupReturn = async () => {
        if (!sessionData?.isHost || isReturning) return;
        
        setIsReturning(true);
        
        try {
            // Initiate group return
            if (socket && socket.connected) {
                socket.emit('initiateGroupReturn', {
                    roomCode: sessionData.roomCode,
                    reason: 'Host initiated group return'
                });
            }
        } catch (error) {
            console.error('❌ Group return failed:', error);
            setIsReturning(false);
        }
    };

    const handleReturn = (returnUrl) => {
        console.log('🔄 Redirecting to GameBuddies:', returnUrl);
        window.location.href = returnUrl;
    };

    // Don't render if not launched from GameBuddies
    if (!sessionData) {
        return null;
    }

    const getPositionStyle = () => {
        const positions = {
            'top-left': { top: '20px', left: '20px' },
            'top-right': { top: '20px', right: '20px' },
            'bottom-left': { bottom: '20px', left: '20px' },
            'bottom-right': { bottom: '20px', right: '20px' }
        };
        return positions[position] || positions['top-left'];
    };

    const buttonStyle = {
        position: 'fixed',
        zIndex: 1000,
        padding: '12px 20px',
        backgroundColor: isReturning ? '#666' : '#4CAF50',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        cursor: isReturning ? 'not-allowed' : 'pointer',
        fontSize: '14px',
        fontWeight: '600',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        ...getPositionStyle(),
        ...style
    };

    return (
        <div className={`gamebuddies-return-container ${className}`}>
            {/* Individual return button */}
            <button
                onClick={handleIndividualReturn}
                disabled={isReturning}
                style={buttonStyle}
                title="Return to GameBuddies lobby"
            >
                {isReturning ? '🔄 Returning...' : '← Return to Lobby'}
            </button>

            {/* Group return button (host only) */}
            {sessionData.isHost && (
                <button
                    onClick={handleGroupReturn}
                    disabled={isReturning}
                    style={{
                        ...buttonStyle,
                        backgroundColor: isReturning ? '#666' : '#FF9800',
                        top: (parseInt(buttonStyle.top) || 20) + 50 + 'px',
                        fontSize: '12px',
                        padding: '8px 16px'
                    }}
                    title="Return all players to GameBuddies lobby"
                >
                    {isReturning ? '👑 Returning All...' : '👑 Return All Players'}
                </button>
            )}
        </div>
    );
};

export default GameBuddiesReturnButton;
```

**For Vanilla JavaScript Games:**

```javascript
class GameBuddiesReturnButton {
    constructor(options = {}) {
        this.options = {
            position: 'top-left',
            style: {},
            ...options
        };
        
        this.socket = null;
        this.isReturning = false;
        this.sessionData = null;
        
        this.init();
    }
    
    init() {
        // Only initialize if launched from GameBuddies
        if (!this.isLaunchedFromGameBuddies()) {
            return;
        }
        
        this.sessionData = this.getGameBuddiesSession();
        this.createButton();
        this.connectToGameBuddies();
    }
    
    isLaunchedFromGameBuddies() {
        const urlParams = new URLSearchParams(window.location.search);
        const roomCode = urlParams.get('room');
        const sessionRoomCode = sessionStorage.getItem('gamebuddies_roomCode');
        
        return !!(roomCode || sessionRoomCode);
    }
    
    getGameBuddiesSession() {
        const urlParams = new URLSearchParams(window.location.search);
        
        return {
            roomCode: urlParams.get('room') || sessionStorage.getItem('gamebuddies_roomCode'),
            playerName: urlParams.get('name') || sessionStorage.getItem('gamebuddies_playerName'),
            playerId: urlParams.get('playerId') || sessionStorage.getItem('gamebuddies_playerId'),
            isHost: urlParams.get('role') === 'gm' || sessionStorage.getItem('gamebuddies_isHost') === 'true',
            returnUrl: sessionStorage.getItem('gamebuddies_returnUrl') || 'https://gamebuddies.io'
        };
    }
    
    createButton() {
        const container = document.createElement('div');
        container.className = 'gamebuddies-return-container';
        container.style.cssText = `
            position: fixed;
            z-index: 1000;
            ${this.getPositionCSS()}
        `;
        
        // Individual return button
        const returnButton = document.createElement('button');
        returnButton.innerHTML = '← Return to Lobby';
        returnButton.style.cssText = `
            padding: 12px 20px;
            background-color: #4CAF50;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            margin-bottom: 8px;
            display: block;
        `;
        
        returnButton.onclick = () => this.handleIndividualReturn();
        container.appendChild(returnButton);
        
        // Group return button (host only)
        if (this.sessionData.isHost) {
            const groupButton = document.createElement('button');
            groupButton.innerHTML = '👑 Return All Players';
            groupButton.style.cssText = `
                padding: 8px 16px;
                background-color: #FF9800;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 12px;
                font-weight: 600;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                display: block;
                width: 100%;
            `;
            
            groupButton.onclick = () => this.handleGroupReturn();
            container.appendChild(groupButton);
        }
        
        document.body.appendChild(container);
        this.buttonContainer = container;
    }
    
    getPositionCSS() {
        const positions = {
            'top-left': 'top: 20px; left: 20px;',
            'top-right': 'top: 20px; right: 20px;',
            'bottom-left': 'bottom: 20px; left: 20px;',
            'bottom-right': 'bottom: 20px; right: 20px;'
        };
        return positions[this.options.position] || positions['top-left'];
    }
    
    connectToGameBuddies() {
        this.socket = io(this.sessionData.returnUrl, {
            transports: ['websocket', 'polling'],
            timeout: 20000,
            forceNew: true
        });
        
        this.socket.on('connect', () => {
            console.log('🔄 Connected to GameBuddies');
            this.socket.emit('joinRoom', {
                roomCode: this.sessionData.roomCode,
                playerName: this.sessionData.playerName
            });
        });
        
        this.socket.on('groupReturnInitiated', (data) => {
            console.log('🔄 Group return initiated');
            this.handleReturn(data.returnUrl);
        });
    }
    
    async handleIndividualReturn() {
        if (this.isReturning) return;
        
        this.isReturning = true;
        this.updateButtonState();
        
        try {
            if (this.socket && this.socket.connected) {
                this.socket.emit('updatePlayerStatus', {
                    status: 'returning',
                    location: 'lobby',
                    metadata: {
                        reason: 'Individual return to lobby',
                        timestamp: new Date().toISOString()
                    }
                });
            }
            
            setTimeout(() => {
                this.handleReturn(this.sessionData.returnUrl);
            }, 500);
            
        } catch (error) {
            console.error('❌ Return failed:', error);
            this.isReturning = false;
            this.updateButtonState();
        }
    }
    
    async handleGroupReturn() {
        if (!this.sessionData.isHost || this.isReturning) return;
        
        this.isReturning = true;
        this.updateButtonState();
        
        try {
            if (this.socket && this.socket.connected) {
                this.socket.emit('initiateGroupReturn', {
                    roomCode: this.sessionData.roomCode,
                    reason: 'Host initiated group return'
                });
            }
        } catch (error) {
            console.error('❌ Group return failed:', error);
            this.isReturning = false;
            this.updateButtonState();
        }
    }
    
    handleReturn(returnUrl) {
        console.log('🔄 Redirecting to:', returnUrl);
        window.location.href = returnUrl;
    }
    
    updateButtonState() {
        if (this.buttonContainer) {
            const buttons = this.buttonContainer.querySelectorAll('button');
            buttons.forEach(button => {
                button.disabled = this.isReturning;
                button.style.opacity = this.isReturning ? '0.7' : '1';
                button.style.cursor = this.isReturning ? 'not-allowed' : 'pointer';
                
                if (button.innerHTML.includes('Return to Lobby')) {
                    button.innerHTML = this.isReturning ? '🔄 Returning...' : '← Return to Lobby';
                } else if (button.innerHTML.includes('Return All')) {
                    button.innerHTML = this.isReturning ? '👑 Returning All...' : '👑 Return All Players';
                }
            });
        }
    }
}

// Usage: Initialize the return button when your game loads
const returnButton = new GameBuddiesReturnButton({
    position: 'top-left'
});
```

### Step 3: Add the Return Button to Your Game

**In your main game component or HTML:**

```javascript
// React
function YourGameComponent() {
    return (
        <div className="game-container">
            {/* Your game content */}
            <GameBuddiesReturnButton position="top-left" />
        </div>
    );
}

// Vanilla JS - add to your game initialization
window.addEventListener('DOMContentLoaded', () => {
    // Initialize your game
    initializeGame();
    
    // Add GameBuddies return button
    new GameBuddiesReturnButton({ position: 'top-left' });
});
```

---

## 📡 Part 2: Status Update API Implementation

### Step 1: Set Up API Configuration

```javascript
class GameBuddiesAPI {
    constructor() {
        this.apiKey = 'your_game_api_key'; // Get this from GameBuddies admin
        this.baseUrl = 'https://gamebuddies.io/api/v2/game';
        this.sessionData = this.getGameBuddiesSession();
    }
    
    getGameBuddiesSession() {
        const urlParams = new URLSearchParams(window.location.search);
        return {
            roomCode: urlParams.get('room') || sessionStorage.getItem('gamebuddies_roomCode'),
            playerId: urlParams.get('playerId') || sessionStorage.getItem('gamebuddies_playerId'),
            playerName: urlParams.get('name') || sessionStorage.getItem('gamebuddies_playerName')
        };
    }
}
```

### Step 2: Implement Status Update Methods

```javascript
class GameBuddiesAPI {
    // ... constructor code above ...
    
    async updatePlayerStatus(status, location, metadata = {}) {
        if (!this.sessionData.roomCode || !this.sessionData.playerId) {
            console.warn('Missing GameBuddies session data for status update');
            return null;
        }
        
        try {
            const response = await fetch(
                `${this.baseUrl}/rooms/${this.sessionData.roomCode}/players/${this.sessionData.playerId}/status`,
                {
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
                            source: 'external_game'
                        }
                    })
                }
            );
            
            if (!response.ok) {
                throw new Error(`Status update failed: ${response.status}`);
            }
            
            const result = await response.json();
            console.log('✅ Status updated:', { status, location });
            return result;
            
        } catch (error) {
            console.error('❌ Status update failed:', error);
            return null;
        }
    }
    
    async sendHeartbeat(metadata = {}) {
        if (!this.sessionData.roomCode || !this.sessionData.playerId) return;
        
        try {
            await fetch(
                `${this.baseUrl}/rooms/${this.sessionData.roomCode}/players/${this.sessionData.playerId}/heartbeat`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-Key': this.apiKey
                    },
                    body: JSON.stringify({
                        metadata: {
                            ...metadata,
                            timestamp: new Date().toISOString(),
                            gamePhase: this.getCurrentGamePhase?.() || 'playing'
                        }
                    })
                }
            );
        } catch (error) {
            console.warn('Heartbeat failed:', error);
        }
    }
    
    async reportGameEnd(gameResult = {}, returnPlayers = true) {
        if (!this.sessionData.roomCode) return;
        
        try {
            const response = await fetch(
                `${this.baseUrl}/rooms/${this.sessionData.roomCode}/game-end`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-Key': this.apiKey
                    },
                    body: JSON.stringify({
                        gameResult,
                        returnPlayers
                    })
                }
            );
            
            if (response.ok) {
                console.log('✅ Game end reported successfully');
            }
        } catch (error) {
            console.error('❌ Failed to report game end:', error);
        }
    }
}
```

### Step 3: Integration Points in Your Game

```javascript
// Initialize API when game loads
const gameBuddiesAPI = new GameBuddiesAPI();

// When player joins your game
async function onPlayerJoinGame() {
    await gameBuddiesAPI.updatePlayerStatus('connected', 'game', {
        reason: 'Player connected to game',
        gamePhase: 'joining'
    });
}

// When game actually starts
async function onGameStart() {
    await gameBuddiesAPI.updatePlayerStatus('in_game', 'game', {
        reason: 'Game started',
        gamePhase: 'playing'
    });
}

// When player leaves game
async function onPlayerLeaveGame() {
    await gameBuddiesAPI.updatePlayerStatus('disconnected', 'disconnected', {
        reason: 'Player left game'
    });
}

// When game ends
async function onGameEnd(gameResult) {
    // Option 1: Let GameBuddies handle returning all players
    await gameBuddiesAPI.reportGameEnd(gameResult, true);
    
    // Option 2: Or manually update each player
    // await gameBuddiesAPI.updatePlayerStatus('returning', 'lobby', {
    //     reason: 'Game ended',
    //     gameResult
    // });
}

// Set up heartbeat (every 30 seconds)
setInterval(() => {
    gameBuddiesAPI.sendHeartbeat({
        playersActive: getActivePlayerCount(),
        gamePhase: getCurrentGamePhase()
    });
}, 30000);

// Handle page unload
window.addEventListener('beforeunload', () => {
    // Use sendBeacon for reliable delivery
    navigator.sendBeacon(
        `${gameBuddiesAPI.baseUrl}/rooms/${gameBuddiesAPI.sessionData.roomCode}/players/${gameBuddiesAPI.sessionData.playerId}/status`,
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
```

---

## 🧪 Testing Your Implementation

### Test Checklist

1. **Individual Return**:
   - [ ] Player can click return button
   - [ ] Status updates to 'returning'
   - [ ] Player redirects to GameBuddies lobby
   - [ ] Player appears in lobby with correct status

2. **Group Return (Host only)**:
   - [ ] Host sees group return button
   - [ ] Host can initiate group return
   - [ ] All players receive return signal
   - [ ] All players redirect to GameBuddies

3. **Status Updates**:
   - [ ] Player status shows as 'In Game' in GameBuddies lobby
   - [ ] Status updates when game phases change
   - [ ] Heartbeat keeps connection alive
   - [ ] Status updates to 'Offline' when player leaves

4. **Error Handling**:
   - [ ] Game works normally if GameBuddies API is down
   - [ ] Return button doesn't break the game
   - [ ] Offline scenarios handled gracefully

### Testing Script

```javascript
// Add this to your game for testing
class GameBuddiesTestSuite {
    constructor(api) {
        this.api = api;
    }
    
    async runTests() {
        console.log('🧪 Running GameBuddies integration tests...');
        
        // Test status updates
        console.log('Testing status updates...');
        await this.api.updatePlayerStatus('in_game', 'game', { test: true });
        
        // Test heartbeat
        console.log('Testing heartbeat...');
        await this.api.sendHeartbeat({ test: true });
        
        // Test return functionality
        console.log('Testing return detection...');
        console.log('GameBuddies session detected:', !!this.api.sessionData.roomCode);
        
        console.log('✅ Tests completed - check console for results');
    }
}

// Run tests in development
if (window.location.hostname === 'localhost') {
    setTimeout(() => {
        new GameBuddiesTestSuite(gameBuddiesAPI).runTests();
    }, 5000);
}
```

---

## 🚨 Error Handling & Best Practices

### 1. Graceful Degradation

```javascript
// Always wrap GameBuddies calls in try-catch
async function safeStatusUpdate(status, location, metadata) {
    try {
        await gameBuddiesAPI.updatePlayerStatus(status, location, metadata);
    } catch (error) {
        console.warn('GameBuddies status update failed, continuing game normally:', error);
        // Game continues working even if GameBuddies is down
    }
}
```

### 2. Offline Detection

```javascript
// Handle network issues
window.addEventListener('offline', () => {
    console.warn('Network offline - GameBuddies features disabled');
    // Hide or disable return button
});

window.addEventListener('online', () => {
    console.log('Network restored - Re-enabling GameBuddies features');
    // Re-enable return button, sync status
});
```

### 3. Rate Limiting

```javascript
// Avoid spamming the API
class RateLimitedAPI extends GameBuddiesAPI {
    constructor() {
        super();
        this.lastStatusUpdate = 0;
        this.minUpdateInterval = 1000; // 1 second minimum
    }
    
    async updatePlayerStatus(status, location, metadata) {
        const now = Date.now();
        if (now - this.lastStatusUpdate < this.minUpdateInterval) {
            console.log('Rate limiting status update');
            return;
        }
        
        this.lastStatusUpdate = now;
        return super.updatePlayerStatus(status, location, metadata);
    }
}
```

---

## 🔑 API Keys & Configuration

### Getting Your API Key

1. Contact GameBuddies admin to get your game registered
2. You'll receive an API key specific to your game
3. Add the API key to your game's configuration:

```javascript
// For different environments
const API_CONFIG = {
    development: {
        apiKey: 'dev_api_key_here',
        baseUrl: 'http://localhost:5000/api/v2/game'
    },
    production: {
        apiKey: 'prod_api_key_here', 
        baseUrl: 'https://gamebuddies.io/api/v2/game'
    }
};

const config = API_CONFIG[process.env.NODE_ENV || 'production'];
```

### Environment Variables

```bash
# .env file for your game
GAMEBUDDIES_API_KEY=your_api_key_here
GAMEBUDDIES_API_URL=https://gamebuddies.io/api/v2/game
```

---

## 📞 Support & Troubleshooting

### Common Issues

1. **Return button not showing**:
   - Check if `gamebuddies_roomCode` exists in sessionStorage
   - Verify URL parameters are being passed correctly

2. **Status updates failing**:
   - Verify API key is correct
   - Check network connectivity
   - Confirm room code and player ID are valid

3. **Group return not working**:
   - Ensure player is host (`role=gm` in URL)
   - Check WebSocket connection to GameBuddies

### Debug Information

Include this when reporting issues:
- Game name and version
- Browser and version
- Console logs showing errors
- Network tab showing API calls
- GameBuddies session storage values

### Getting Help

1. Check the console for error messages
2. Verify API endpoints are responding
3. Test with provided test suite
4. Contact GameBuddies support with debug info

This implementation provides a robust return system that handles both individual and group scenarios while maintaining reliable status synchronization with the GameBuddies lobby.