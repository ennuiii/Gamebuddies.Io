/**
 * =====================================================
 * ⚠️ IMPORTANT SECURITY UPDATE
 * =====================================================
 *
 * This file is OUTDATED and uses insecure URL parameter authentication.
 *
 * NEW SECURE METHOD: Use session token authentication
 * See GAME_AUTHENTICATION_API.md for the secure implementation
 *
 * Key changes:
 * - Games receive session token in URL (?session=TOKEN)
 * - Call /api/game/session/:token to get authenticated player data
 * - Premium status and custom names verified server-side (cannot be faked)
 *
 * [DEPRECATED] Return-to-GameBuddies flow was removed. This document may reference obsolete endpoints and events.
 * =====================================================
 */

/**
 * =====================================================
 * GAMEBUDDIES INTEGRATION EXAMPLE
 * =====================================================
 * 
 * This file shows EXACTLY how to integrate your game with GameBuddies V2.
 * Copy this code into your game and customize the marked sections.
 * 
 * Requirements:
 * - Socket.io client library (for real-time communication)
 * - Modern browser with fetch API support
 * 
 * Installation:
 * npm install socket.io-client
 * 
 * OR include via CDN:
 * <script src="https://cdn.socket.io/4.8.1/socket.io.min.js"></script>
 */

// =====================================================
// STEP 1: GAMEBUDDIES API CLASS
// =====================================================

class GameBuddiesIntegration {
    constructor(config = {}) {
        // 🔧 CUSTOMIZE THESE VALUES FOR YOUR GAME
        this.config = {
            apiKey: config.apiKey || 'YOUR_GAME_API_KEY', // Get from GameBuddies admin
            gameName: config.gameName || 'Your Game Name',
            gameVersion: config.gameVersion || '1.0.0',
            baseUrl: config.baseUrl || 'https://gamebuddies.io/api/v2/game',
            socketUrl: config.socketUrl || 'https://gamebuddies.io'
        };

        // Internal state
        this.sessionData = null;
        this.socket = null;
        this.isInitialized = false;
        this.statusUpdateQueue = [];
        this.heartbeatInterval = null;

        // Initialize if GameBuddies session detected
        this.initialize();
    }

    /**
     * Initialize GameBuddies integration
     * Automatically detects if game was launched from GameBuddies
     */
    initialize() {
        // Check if launched from GameBuddies
        this.sessionData = this.detectGameBuddiesSession();
        
        if (!this.sessionData) {
            console.log('🎮 Game not launched from GameBuddies - integration disabled');
            return;
        }

        console.log('🎮 GameBuddies integration detected:', this.sessionData);
        
        // Set up integration
        this.setupSocketConnection();
        this.setupStatusReporting();
        this.setupReturnButton();
        this.setupHeartbeat();
        this.setupCleanup();
        
        this.isInitialized = true;
        
        // Report initial connection
        this.updateStatus('connected', 'game', {
            reason: 'Player connected to game',
            gamePhase: 'loading'
        });
    }

    /**
     * Detect GameBuddies session from URL params and sessionStorage
     */
    detectGameBuddiesSession() {
        const urlParams = new URLSearchParams(window.location.search);
        
        // Get data from URL parameters (primary method)
        const roomCode = urlParams.get('room');
        const playerName = decodeURIComponent(urlParams.get('name') || '');
        const playerId = urlParams.get('playerId');
        const isHost = urlParams.get('role') === 'gm';
        
        // Fallback to sessionStorage
        const sessionRoomCode = sessionStorage.getItem('gamebuddies_roomCode');
        const sessionPlayerName = sessionStorage.getItem('gamebuddies_playerName');
        const sessionPlayerId = sessionStorage.getItem('gamebuddies_playerId');
        const sessionIsHost = sessionStorage.getItem('gamebuddies_isHost') === 'true';

        // Must have at least room code to proceed
        if (!roomCode && !sessionRoomCode) {
            return null;
        }

        const session = {
            roomCode: roomCode || sessionRoomCode,
            playerName: playerName || sessionPlayerName,
            playerId: playerId || sessionPlayerId,
            isHost: isHost || sessionIsHost,
            returnUrl: sessionStorage.getItem('gamebuddies_returnUrl') || 'https://gamebuddies.io'
        };

        // Store in sessionStorage for persistence
        sessionStorage.setItem('gamebuddies_roomCode', session.roomCode);
        sessionStorage.setItem('gamebuddies_playerName', session.playerName);
        sessionStorage.setItem('gamebuddies_playerId', session.playerId);
        sessionStorage.setItem('gamebuddies_isHost', session.isHost.toString());

        return session;
    }

    /**
     * Set up WebSocket connection to GameBuddies for real-time communication
     */
    setupSocketConnection() {
        try {
            this.socket = io(this.config.socketUrl, {
                transports: ['websocket', 'polling'],
                timeout: 20000,
                forceNew: true
            });

            this.socket.on('connect', () => {
                console.log('🔄 Connected to GameBuddies server');
                
                // Join the GameBuddies room
                this.socket.emit('joinRoom', {
                    roomCode: this.sessionData.roomCode,
                    playerName: this.sessionData.playerName
                });
            });

            this.socket.on('groupReturnInitiated', (data) => {
                console.log('🔄 Group return initiated by host:', data);
                this.handleReturnToGameBuddies(data.returnUrl);
            });

            this.socket.on('disconnect', (reason) => {
                console.warn('⚠️ Disconnected from GameBuddies:', reason);
            });

        } catch (error) {
            console.warn('⚠️ Failed to connect to GameBuddies socket:', error);
            // Game continues working without real-time features
        }
    }

    /**
     * Set up automatic status reporting
     */
    setupStatusReporting() {
        // Process queued updates every 5 seconds
        setInterval(() => {
            this.processStatusQueue();
        }, 5000);

        // Report disconnection on page unload
        window.addEventListener('beforeunload', () => {
            // Use sendBeacon for reliable delivery during page unload
            if (this.sessionData) {
                const payload = JSON.stringify({
                    status: 'disconnected',
                    location: 'disconnected',
                    metadata: {
                        reason: 'Page unload',
                        timestamp: new Date().toISOString()
                    }
                });

                navigator.sendBeacon(
                    `${this.config.baseUrl}/rooms/${this.sessionData.roomCode}/players/${this.sessionData.playerId}/status`,
                    payload
                );
            }
        });
    }

    /**
     * Set up heartbeat to keep connection alive
     */
    setupHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat();
        }, 30000); // Every 30 seconds
    }

    /**
     * Set up cleanup handlers
     */
    setupCleanup() {
        // Clean up on page visibility change
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.updateStatus('disconnected', 'disconnected', {
                    reason: 'Page hidden/minimized'
                });
            } else {
                this.updateStatus('connected', 'game', {
                    reason: 'Page visible again'
                });
            }
        });
    }

    // =====================================================
    // STATUS UPDATE METHODS
    // =====================================================

    /**
     * Update player status in GameBuddies
     * @param {string} status - connected|disconnected|in_game|returning|lobby
     * @param {string} location - game|lobby|disconnected
     * @param {object} metadata - Additional data about the status change
     */
    async updateStatus(status, location, metadata = {}) {
        if (!this.sessionData) {
            return false;
        }

        const update = {
            status,
            location,
            metadata: {
                ...metadata,
                timestamp: new Date().toISOString(),
                gameName: this.config.gameName,
                gameVersion: this.config.gameVersion,
                source: 'external_game'
            }
        };

        try {
            const response = await fetch(
                `${this.config.baseUrl}/rooms/${this.sessionData.roomCode}/players/${this.sessionData.playerId}/status`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-Key': this.config.apiKey
                    },
                    body: JSON.stringify(update)
                }
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            console.log('✅ Status updated:', { status, location });
            return result;

        } catch (error) {
            console.warn('⚠️ Status update failed, queuing for retry:', error);
            this.queueStatusUpdate(update);
            return false;
        }
    }

    /**
     * Queue status update for retry
     */
    queueStatusUpdate(update) {
        this.statusUpdateQueue.push({
            ...update,
            attempts: 0,
            queuedAt: Date.now()
        });
    }

    /**
     * Process queued status updates
     */
    async processStatusQueue() {
        if (this.statusUpdateQueue.length === 0) return;

        for (let i = this.statusUpdateQueue.length - 1; i >= 0; i--) {
            const update = this.statusUpdateQueue[i];
            
            try {
                const response = await fetch(
                    `${this.config.baseUrl}/rooms/${this.sessionData.roomCode}/players/${this.sessionData.playerId}/status`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-API-Key': this.config.apiKey
                        },
                        body: JSON.stringify({
                            status: update.status,
                            location: update.location,
                            metadata: update.metadata
                        })
                    }
                );

                if (response.ok) {
                    console.log('✅ Queued status update successful');
                    this.statusUpdateQueue.splice(i, 1);
                } else {
                    throw new Error(`HTTP ${response.status}`);
                }

            } catch (error) {
                update.attempts++;
                if (update.attempts >= 3) {
                    console.warn('❌ Dropping status update after 3 failed attempts:', update);
                    this.statusUpdateQueue.splice(i, 1);
                }
            }
        }
    }

    /**
     * Send heartbeat to keep connection alive
     */
    async sendHeartbeat() {
        if (!this.sessionData) return;

        try {
            // 🔧 CUSTOMIZE: Add your game-specific heartbeat data
            const heartbeatData = {
                metadata: {
                    timestamp: new Date().toISOString(),
                    gamePhase: this.getCurrentGamePhase(), // Implement this method
                    playersActive: this.getActivePlayerCount(), // Implement this method
                    gameHealth: 'healthy'
                }
            };

            await fetch(
                `${this.config.baseUrl}/rooms/${this.sessionData.roomCode}/players/${this.sessionData.playerId}/heartbeat`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-Key': this.config.apiKey
                    },
                    body: JSON.stringify(heartbeatData)
                }
            );

        } catch (error) {
            console.warn('⚠️ Heartbeat failed:', error);
        }
    }

    // =====================================================
    // RETURN TO GAMEBUDDIES FUNCTIONALITY
    // =====================================================

    /**
     * Set up the return button
     */
    setupReturnButton() {
        // Create return button container
        const container = document.createElement('div');
        container.id = 'gamebuddies-return-container';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            left: 20px;
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
        `;

        // Individual return button
        const returnButton = document.createElement('button');
        returnButton.innerHTML = '← Return to Lobby';
        returnButton.style.cssText = `
            padding: 12px 20px;
            background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
            transition: all 0.2s ease;
            margin-bottom: 8px;
            display: block;
        `;

        returnButton.onmouseover = () => {
            returnButton.style.transform = 'translateY(-2px)';
            returnButton.style.boxShadow = '0 6px 16px rgba(76, 175, 80, 0.4)';
        };

        returnButton.onmouseout = () => {
            returnButton.style.transform = 'translateY(0)';
            returnButton.style.boxShadow = '0 4px 12px rgba(76, 175, 80, 0.3)';
        };

        returnButton.onclick = () => this.handleIndividualReturn();

        container.appendChild(returnButton);

        // Group return button (host only)
        if (this.sessionData.isHost) {
            const groupButton = document.createElement('button');
            groupButton.innerHTML = '👑 Return All Players';
            groupButton.style.cssText = `
                padding: 8px 16px;
                background: linear-gradient(135deg, #FF9800 0%, #f57c00 100%);
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 12px;
                font-weight: 600;
                box-shadow: 0 4px 12px rgba(255, 152, 0, 0.3);
                transition: all 0.2s ease;
                display: block;
                width: 100%;
            `;

            groupButton.onmouseover = () => {
                groupButton.style.transform = 'translateY(-2px)';
                groupButton.style.boxShadow = '0 6px 16px rgba(255, 152, 0, 0.4)';
            };

            groupButton.onmouseout = () => {
                groupButton.style.transform = 'translateY(0)';
                groupButton.style.boxShadow = '0 4px 12px rgba(255, 152, 0, 0.3)';
            };

            groupButton.onclick = () => this.handleGroupReturn();

            container.appendChild(groupButton);
        }

        document.body.appendChild(container);
        this.returnButtonContainer = container;
    }

    /**
     * Handle individual player return
     */
    async handleIndividualReturn() {
        console.log('🔄 Individual return initiated');
        
        // Update status
        await this.updateStatus('returning', 'lobby', {
            reason: 'Individual return to lobby',
            initiatedBy: this.sessionData.playerName
        });

        // Navigate back to GameBuddies
        this.handleReturnToGameBuddies(this.sessionData.returnUrl);
    }

    /**
     * Handle group return (host only)
     */
    async handleGroupReturn() {
        if (!this.sessionData.isHost) {
            console.warn('⚠️ Only host can initiate group return');
            return;
        }

        console.log('👑 Group return initiated by host');

        if (this.socket && this.socket.connected) {
            this.socket.emit('initiateGroupReturn', {
                roomCode: this.sessionData.roomCode,
                reason: 'Host initiated group return'
            });
        } else {
            console.warn('⚠️ Socket not connected, falling back to individual return');
            this.handleIndividualReturn();
        }
    }

    /**
     * Navigate back to GameBuddies
     */
    handleReturnToGameBuddies(returnUrl) {
        console.log('🔄 Returning to GameBuddies:', returnUrl);
        
        // Set returning state on buttons
        this.setReturningState(true);
        
        // Small delay to ensure status update is sent
        setTimeout(() => {
            window.location.href = returnUrl;
        }, 500);
    }

    /**
     * Update button states
     */
    setReturningState(isReturning) {
        if (!this.returnButtonContainer) return;

        const buttons = this.returnButtonContainer.querySelectorAll('button');
        buttons.forEach(button => {
            button.disabled = isReturning;
            button.style.opacity = isReturning ? '0.7' : '1';
            button.style.cursor = isReturning ? 'not-allowed' : 'pointer';

            if (button.innerHTML.includes('Return to Lobby')) {
                button.innerHTML = isReturning ? '🔄 Returning...' : '← Return to Lobby';
            } else if (button.innerHTML.includes('Return All')) {
                button.innerHTML = isReturning ? '👑 Returning All...' : '👑 Return All Players';
            }
        });
    }

    // =====================================================
    // GAME LIFECYCLE METHODS
    // =====================================================

    /**
     * Call when your game starts
     */
    onGameStart() {
        console.log('🎮 Game started');
        this.updateStatus('in_game', 'game', {
            reason: 'Game started',
            gamePhase: 'playing'
        });
    }

    /**
     * Call when your game ends
     */
    async onGameEnd(gameResult = {}) {
        console.log('🏁 Game ended');
        
        try {
            // Report game end to GameBuddies
            const response = await fetch(
                `${this.config.baseUrl}/rooms/${this.sessionData.roomCode}/game-end`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-Key': this.config.apiKey
                    },
                    body: JSON.stringify({
                        gameResult,
                        returnPlayers: true // Automatically return all players to lobby
                    })
                }
            );

            if (response.ok) {
                console.log('✅ Game end reported successfully');
            }

        } catch (error) {
            console.warn('⚠️ Failed to report game end:', error);
        }
    }

    /**
     * Call when player leaves your game
     */
    onPlayerLeave() {
        console.log('👋 Player left game');
        this.updateStatus('disconnected', 'disconnected', {
            reason: 'Player left game'
        });
    }

    /**
     * Call when game phase changes
     */
    onGamePhaseChange(phase) {
        console.log('🔄 Game phase changed:', phase);
        this.updateStatus('in_game', 'game', {
            reason: 'Game phase changed',
            gamePhase: phase
        });
    }

    /**
     * Cleanup method - call when your game shuts down
     */
    cleanup() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        if (this.socket) {
            this.socket.disconnect();
        }
        
        if (this.returnButtonContainer) {
            this.returnButtonContainer.remove();
        }
    }

    // =====================================================
    // 🔧 CUSTOMIZE THESE METHODS FOR YOUR GAME
    // =====================================================

    /**
     * Return the current phase of your game
     * Examples: 'loading', 'waiting', 'playing', 'paused', 'finished'
     */
    getCurrentGamePhase() {
        // 🔧 IMPLEMENT THIS FOR YOUR GAME
        // Example implementation:
        if (this.gameState === 'loading') return 'loading';
        if (this.gameState === 'waiting_for_players') return 'waiting';
        if (this.gameState === 'in_progress') return 'playing';
        if (this.gameState === 'paused') return 'paused';
        if (this.gameState === 'ended') return 'finished';
        
        return 'playing'; // Default fallback
    }

    /**
     * Return the number of active players in your game
     */
    getActivePlayerCount() {
        // 🔧 IMPLEMENT THIS FOR YOUR GAME
        // Example implementation:
        // return this.activePlayers ? this.activePlayers.length : 1;
        
        return 1; // Default fallback for single player
    }
}

// =====================================================
// EXAMPLE USAGE IN YOUR GAME
// =====================================================

/**
 * STEP 2: Initialize GameBuddies integration in your game
 * Add this to your main game file or initialization code
 */

// Initialize GameBuddies integration
const gameBuddies = new GameBuddiesIntegration({
    apiKey: 'YOUR_GAME_API_KEY', // 🔧 Replace with your actual API key
    gameName: 'My Awesome Game',  // 🔧 Replace with your game name
    gameVersion: '1.0.0'          // 🔧 Replace with your game version
});

/**
 * STEP 3: Add integration calls to your game events
 */

// Example game class showing integration points
class MyGame {
    constructor() {
        this.gameState = 'loading';
        this.players = [];
        
        // Initialize your game here
        this.init();
    }

    async init() {
        console.log('🎮 Initializing game...');
        
        // Your game initialization code here
        await this.loadAssets();
        await this.setupPlayers();
        
        this.gameState = 'waiting_for_players';
        
        // Wait for all players to be ready, then start
        this.waitForPlayersReady().then(() => {
            this.startGame();
        });
    }

    startGame() {
        console.log('🚀 Starting game...');
        this.gameState = 'in_progress';
        
        // 🔧 INTEGRATION POINT: Notify GameBuddies that game started
        if (gameBuddies.isInitialized) {
            gameBuddies.onGameStart();
        }

        // Your game start logic here
        this.gameLoop();
    }

    endGame(result) {
        console.log('🏁 Game ended:', result);
        this.gameState = 'ended';
        
        // 🔧 INTEGRATION POINT: Notify GameBuddies that game ended
        if (gameBuddies.isInitialized) {
            gameBuddies.onGameEnd({
                winner: result.winner,
                scores: result.scores,
                duration: result.duration
            });
        }

        // Show game results, return to menu, etc.
        this.showResults(result);
    }

    onPlayerDisconnect(playerId) {
        console.log('👋 Player disconnected:', playerId);
        
        // Remove player from your game
        this.players = this.players.filter(p => p.id !== playerId);
        
        // 🔧 INTEGRATION POINT: Only notify if it's the current player
        const currentPlayerId = gameBuddies.sessionData?.playerId;
        if (playerId === currentPlayerId && gameBuddies.isInitialized) {
            gameBuddies.onPlayerLeave();
        }
    }

    pauseGame() {
        this.gameState = 'paused';
        
        // 🔧 INTEGRATION POINT: Notify GameBuddies of phase change
        if (gameBuddies.isInitialized) {
            gameBuddies.onGamePhaseChange('paused');
        }
    }

    resumeGame() {
        this.gameState = 'in_progress';
        
        // 🔧 INTEGRATION POINT: Notify GameBuddies of phase change
        if (gameBuddies.isInitialized) {
            gameBuddies.onGamePhaseChange('playing');
        }
    }

    // Helper methods (implement these based on your game)
    async loadAssets() {
        // Your asset loading code
    }

    async setupPlayers() {
        // Your player setup code
    }

    async waitForPlayersReady() {
        // Your player ready logic
        return new Promise(resolve => {
            // Resolve when all players are ready
            setTimeout(resolve, 2000); // Example delay
        });
    }

    gameLoop() {
        // Your main game loop
        if (this.gameState === 'in_progress') {
            // Game logic here
            requestAnimationFrame(() => this.gameLoop());
        }
    }

    showResults(result) {
        // Your results display code
    }
}

/**
 * STEP 4: Initialize your game
 */
window.addEventListener('DOMContentLoaded', () => {
    // Start your game
    const game = new MyGame();
    
    // Store game reference for GameBuddies callbacks
    window.myGame = game;
    
    // Override GameBuddies methods to connect to your game
    if (gameBuddies.isInitialized) {
        // Connect GameBuddies methods to your game state
        gameBuddies.getCurrentGamePhase = () => {
            const stateMap = {
                'loading': 'loading',
                'waiting_for_players': 'waiting', 
                'in_progress': 'playing',
                'paused': 'paused',
                'ended': 'finished'
            };
            return stateMap[game.gameState] || 'playing';
        };

        gameBuddies.getActivePlayerCount = () => {
            return game.players ? game.players.length : 1;
        };
    }
});

/**
 * STEP 5: Handle cleanup when page unloads
 */
window.addEventListener('beforeunload', () => {
    if (gameBuddies.isInitialized) {
        gameBuddies.cleanup();
    }
});

// =====================================================
// 🧪 TESTING & DEBUG TOOLS
// =====================================================

/**
 * Test suite for development/debugging
 * Only runs in development environment
 */
if (window.location.hostname === 'localhost' || window.location.search.includes('debug=true')) {
    
    // Add debug panel
    const debugPanel = document.createElement('div');
    debugPanel.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 15px;
        border-radius: 8px;
        font-family: monospace;
        font-size: 12px;
        z-index: 10001;
        min-width: 250px;
    `;
    
    debugPanel.innerHTML = `
        <div><strong>GameBuddies Debug Panel</strong></div>
        <div>Integration: ${gameBuddies.isInitialized ? '✅ Active' : '❌ Disabled'}</div>
        <div>Room: ${gameBuddies.sessionData?.roomCode || 'N/A'}</div>
        <div>Player: ${gameBuddies.sessionData?.playerName || 'N/A'}</div>
        <div>Host: ${gameBuddies.sessionData?.isHost ? 'Yes' : 'No'}</div>
        <br>
        <button onclick="gameBuddies.updateStatus('in_game', 'game', {test: true})" style="margin: 2px; padding: 4px 8px;">Test Status Update</button>
        <button onclick="gameBuddies.sendHeartbeat()" style="margin: 2px; padding: 4px 8px;">Test Heartbeat</button>
        <button onclick="console.log('GameBuddies State:', gameBuddies)" style="margin: 2px; padding: 4px 8px;">Log State</button>
    `;
    
    document.body.appendChild(debugPanel);
    
    // Auto-test after 5 seconds
    setTimeout(() => {
        if (gameBuddies.isInitialized) {
            console.log('🧪 Running GameBuddies integration tests...');
            
            // Test status update
            gameBuddies.updateStatus('in_game', 'game', { test: true, timestamp: new Date().toISOString() })
                .then(result => console.log('✅ Status update test:', result))
                .catch(error => console.error('❌ Status update test failed:', error));
            
            // Test heartbeat
            gameBuddies.sendHeartbeat()
                .then(() => console.log('✅ Heartbeat test passed'))
                .catch(error => console.error('❌ Heartbeat test failed:', error));
            
            console.log('🧪 Integration tests completed - check results above');
        }
    }, 5000);
}

/**
 * =====================================================
 * IMPLEMENTATION CHECKLIST
 * =====================================================
 * 
 * ✅ Step 1: Copy this file to your game project
 * ✅ Step 2: Replace 'YOUR_GAME_API_KEY' with your actual API key
 * ✅ Step 3: Customize the gameName and gameVersion
 * ✅ Step 4: Implement getCurrentGamePhase() for your game
 * ✅ Step 5: Implement getActivePlayerCount() for your game  
 * ✅ Step 6: Add integration calls to your game events:
 *     - gameBuddies.onGameStart() when game starts
 *     - gameBuddies.onGameEnd(result) when game ends
 *     - gameBuddies.onPlayerLeave() when player leaves
 *     - gameBuddies.onGamePhaseChange(phase) when game state changes
 * ✅ Step 7: Test with the debug panel (localhost only)
 * ✅ Step 8: Test individual and group return functionality
 * ✅ Step 9: Deploy and verify in production
 * 
 * 🔑 IMPORTANT NOTES:
 * - The return button only appears when launched from GameBuddies
 * - Status updates are automatically queued and retried on failure
 * - Game continues working even if GameBuddies API is down
 * - Heartbeat keeps the connection alive automatically
 * - All GameBuddies calls are wrapped in try-catch for safety
 * 
 * 📞 SUPPORT:
 * - Check console for debug information
 * - Use the debug panel for testing
 * - Verify your API key is correct
 * - Ensure your game is registered with GameBuddies
 */