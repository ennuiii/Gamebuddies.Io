[DEPRECATED] Return-to-GameBuddies flow was removed. This document may reference obsolete endpoints and events.\r\n\r\n# Updated DDF Integration Implementation Guide

## 🎯 FIXED Implementation for GameBuddies V2 Compatibility

This guide provides the corrected implementation patterns for DDF to work with GameBuddies V2 API, addressing all compatibility issues identified in the analysis.

## 🔧 KEY CHANGES REQUIRED

### 1. Add API Key Authentication (CRITICAL)
All GameBuddies API calls must include authentication.

**Required Header:**
```javascript
const headers = {
  'Content-Type': 'application/json',
  'X-API-Key': 'gb_ddf_9f5141736336428e9c62846b8421f249' // Generated from SQL
};
```

### 2. Fixed Return to Lobby Implementation

#### Updated Host Group Return
```javascript
// UPDATED: Host clicks "Return All Players to Lobby"
async returnAllToLobby() {
  try {
    const response = await fetch('https://gamebuddies.io/api/returnToLobby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'gb_ddf_9f5141736336428e9c62846b8421f249' // ✅ ADDED
      },
      body: JSON.stringify({
        roomCode: this.roomCode,
        isHost: true
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to return to lobby: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('✅ Group return initiated:', result.message);
    
    // Start polling for return status immediately
    this.startReturnPolling();
    return true;
    
  } catch (error) {
    console.error('❌ Return to lobby failed:', error);
    // Fallback: redirect just the host
    window.location.href = this.returnUrl;
    return false;
  }
}
```

### 3. NEW: Polling-Based Return Detection (CRITICAL FIX)

Replace the non-working event listener approach with polling:

```javascript
// NEW: Polling-based return detection for external domain players
class GameBuddiesReturnDetector {
  constructor(roomCode, playerId) {
    this.roomCode = roomCode;
    this.playerId = playerId;
    this.polling = false;
    this.pollInterval = null;
  }

  startPolling() {
    if (this.polling) return;
    
    this.polling = true;
    console.log('🔍 Started polling for return status...');
    
    this.pollInterval = setInterval(async () => {
      try {
        const response = await fetch(
          `https://gamebuddies.io/api/v2/rooms/${this.roomCode}/return-status?playerId=${this.playerId}`,
          {
            headers: {
              'X-API-Key': 'gb_ddf_9f5141736336428e9c62846b8421f249'
            }
          }
        );
        
        const data = await response.json();
        
        if (data.shouldReturn) {
          console.log('🔄 Return to lobby command received!');
          this.stopPolling();
          
          // Show countdown message to user
          this.showReturnCountdown(() => {
            window.location.href = data.returnUrl; // Enhanced URL with session
          });
        }
        
      } catch (error) {
        console.warn('⚠️ Return status check failed:', error);
      }
    }, 3000); // Poll every 3 seconds
  }

  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.polling = false;
  }

  showReturnCountdown(callback, delay = 3000) {
    // Show UI message: "Returning to GameBuddies lobby in 3 seconds..."
    let countdown = 3;
    const countdownInterval = setInterval(() => {
      console.log(`Returning to lobby in ${countdown}...`);
      countdown--;
      if (countdown <= 0) {
        clearInterval(countdownInterval);
        callback();
      }
    }, 1000);
  }
}
```

### 4. Enhanced Session Initialization

```javascript
// UPDATED: Enhanced session detection and initialization
class GameBuddiesIntegration {
  constructor() {
    this.apiKey = 'gb_ddf_9f5141736336428e9c62846b8421f249';
    this.baseUrl = 'https://gamebuddies.io';
    this.returnDetector = null;
    this.sessionToken = null;
  }

  async initializeFromGameBuddies() {
    // Get session parameters from URL
    const urlParams = new URLSearchParams(window.location.search);
    this.roomCode = urlParams.get('room');
    this.playerName = urlParams.get('name');
    this.playerId = urlParams.get('playerId');
    this.isHost = urlParams.get('role') === 'gm';

    if (!this.roomCode || !this.playerId) {
      console.warn('⚠️ Missing GameBuddies session parameters');
      return false;
    }

    // Validate session with GameBuddies and get session token
    try {
      const response = await fetch(
        `${this.baseUrl}/api/v2/rooms/${this.roomCode}/validate-with-session?playerId=${this.playerId}&playerName=${this.playerName}`,
        {
          headers: { 'X-API-Key': this.apiKey }
        }
      );

      const validation = await response.json();
      
      if (!validation.valid) {
        console.error('❌ GameBuddies session validation failed:', validation.error);
        return false;
      }

      // Store session data
      this.sessionToken = validation.sessionToken;
      this.returnUrl = validation.returnUrl; // Enhanced URL with session
      
      console.log('✅ GameBuddies session validated');
      
      // Start return detection for all players
      this.startReturnDetection();
      
      // Update player status to "in_game"
      await this.updatePlayerStatus('in_game', 'game', 'Player entered DDF game');
      
      return true;
      
    } catch (error) {
      console.error('❌ GameBuddies initialization failed:', error);
      return false;
    }
  }

  startReturnDetection() {
    this.returnDetector = new GameBuddiesReturnDetector(this.roomCode, this.playerId);
    this.returnDetector.startPolling();
  }

  // UPDATED: Status update with proper authentication
  async updatePlayerStatus(status, location, reason) {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/v2/rooms/${this.roomCode}/players/${this.playerId}/status`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.apiKey // ✅ ADDED
          },
          body: JSON.stringify({
            status,
            location,
            reason,
            metadata: {
              timestamp: new Date().toISOString(),
              source: 'ddf_game'
            }
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Status update failed: ${response.status}`);
      }

      console.log(`✅ Player status updated: ${status}/${location}`);
      return true;
      
    } catch (error) {
      console.error('❌ Status update failed:', error);
      return false;
    }
  }

  // UPDATED: Individual player return
  async leaveGame() {
    // Update status before leaving
    await this.updatePlayerStatus('returning', 'lobby', 'Player leaving game');
    
    // Stop return detection
    if (this.returnDetector) {
      this.returnDetector.stopPolling();
    }
    
    // Redirect to enhanced return URL
    window.location.href = this.returnUrl;
  }

  // UPDATED: Host group return with polling initiation
  async returnAllToLobby() {
    try {
      const response = await fetch(`${this.baseUrl}/api/returnToLobby`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey
        },
        body: JSON.stringify({
          roomCode: this.roomCode,
          isHost: this.isHost
        })
      });
      
      if (!response.ok) {
        throw new Error(`Return failed: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('✅ Group return initiated:', result);
      
      // Host also starts polling (will redirect automatically)
      this.startReturnDetection();
      return true;
      
    } catch (error) {
      console.error('❌ Group return failed:', error);
      // Fallback: just redirect the host
      await this.leaveGame();
      return false;
    }
  }

  // Clean up when component unmounts
  cleanup() {
    if (this.returnDetector) {
      this.returnDetector.stopPolling();
    }
  }
}
```

### 5. React Component Integration

```jsx
// UPDATED: React component with proper lifecycle management
import React, { useEffect, useRef } from 'react';

const GameBuddiesReturnHandler = ({ roomCode, playerId, isHost }) => {
  const gameBuddiesRef = useRef(null);

  useEffect(() => {
    // Initialize GameBuddies integration
    const initGameBuddies = async () => {
      gameBuddiesRef.current = new GameBuddiesIntegration();
      const success = await gameBuddiesRef.current.initializeFromGameBuddies();
      
      if (!success) {
        console.warn('⚠️ GameBuddies integration not available');
      }
    };

    initGameBuddies();

    // Cleanup on unmount
    return () => {
      if (gameBuddiesRef.current) {
        gameBuddiesRef.current.cleanup();
      }
    };
  }, []);

  const handleReturnAll = async () => {
    if (gameBuddiesRef.current) {
      await gameBuddiesRef.current.returnAllToLobby();
    }
  };

  const handleLeave = async () => {
    if (gameBuddiesRef.current) {
      await gameBuddiesRef.current.leaveGame();
    }
  };

  return (
    <div>
      {isHost && (
        <button onClick={handleReturnAll}>
          Return All Players to Lobby
        </button>
      )}
      <button onClick={handleLeave}>
        Leave Game
      </button>
    </div>
  );
};
```

## 📋 IMPLEMENTATION CHECKLIST

### Phase 1: Critical Fixes
- [ ] Add API key authentication to all GameBuddies API calls
- [ ] Replace event listener with polling-based return detection  
- [ ] Update return endpoint URL (still `/api/returnToLobby`)
- [ ] Test individual player return with enhanced URLs

### Phase 2: Enhanced Features
- [ ] Implement session validation on game start
- [ ] Add proper error handling and fallbacks
- [ ] Test group return flow with multiple players
- [ ] Add heartbeat monitoring during gameplay

### Phase 3: Production Deployment
- [ ] Deploy GameBuddies V2 compatibility endpoints
- [ ] Update DDF with new integration code
- [ ] Test cross-domain return flow in production
- [ ] Monitor API usage and performance

## 🔑 KEY INTEGRATION POINTS

1. **Authentication**: All API calls MUST include `X-API-Key` header
2. **Polling**: External games MUST poll `/api/v2/rooms/:roomCode/return-status` 
3. **Session Recovery**: Use session tokens for seamless lobby restoration
4. **Status Updates**: Keep GameBuddies informed of player states
5. **Error Handling**: Always provide fallbacks for failed API calls

## 🚀 EXPECTED RESULTS

After implementing these changes:
- ✅ Group return to lobby will work across external domains
- ✅ Players will return to their specific lobby (not homepage)
- ✅ Session state will be preserved during return
- ✅ API authentication will prevent unauthorized access
- ✅ Cross-domain communication will work reliably

## 📞 SUPPORT

If issues persist after implementation:
1. Check browser console for authentication errors
2. Verify API key is correctly configured
3. Test polling endpoint directly in browser
4. Review GameBuddies server logs for API calls