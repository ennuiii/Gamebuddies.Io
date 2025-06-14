# GameBuddies Return Button Implementation Guide

## Overview

This guide explains how to implement the **GM Return to Lobby** functionality in your game that integrates with GameBuddies. This allows the game master (GM) to return all players back to the GameBuddies lobby to select a new game.

## Prerequisites

Your game should already be integrated with GameBuddies and receiving the following URL parameters:
- `room` - The room code (e.g., "ABC123")
- `players` - Number of players
- `name` - Player name (URL encoded)
- `role` - "gm" for gamemaster/host (optional)

## Required Implementation

### 1. Install Socket.IO Client

```bash
npm install socket.io-client
```

### 2. Create the GM Return Button Component

Create a component that only shows for the GM and handles the return functionality:

```javascript
// GameBuddiesReturnButton.js
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

const GameBuddiesReturnButton = () => {
  const [socket, setSocket] = useState(null);
  const [isGM, setIsGM] = useState(false);
  const [roomCode, setRoomCode] = useState(null);
  const [isReturning, setIsReturning] = useState(false);

  useEffect(() => {
    // Check URL parameters to determine if user is GM
    const urlParams = new URLSearchParams(window.location.search);
    const role = urlParams.get('role');
    const room = urlParams.get('room');
    const playerName = urlParams.get('name');
    
    const userIsGM = role === 'gm';
    setIsGM(userIsGM);
    setRoomCode(room);

    // Only connect if user is GM
    if (!userIsGM || !room) {
      return;
    }

    // Connect to GameBuddies server
    const gamebuddiesSocket = io(getGameBuddiesServerUrl(), {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: true
    });

    gamebuddiesSocket.on('connect', () => {
      console.log('🔄 Connected to GameBuddies for return functionality');
      
      // Join the room to maintain connection
      gamebuddiesSocket.emit('joinRoom', {
        roomCode: room,
        playerName: decodeURIComponent(playerName || 'GM')
      });
    });

    gamebuddiesSocket.on('connect_error', (error) => {
      console.error('🔄 Failed to connect to GameBuddies:', error);
    });

    setSocket(gamebuddiesSocket);

    return () => {
      gamebuddiesSocket.disconnect();
    };
  }, []);

  const getGameBuddiesServerUrl = () => {
    // Determine GameBuddies server URL based on environment
    if (process.env.REACT_APP_GAMEBUDDIES_URL) {
      return process.env.REACT_APP_GAMEBUDDIES_URL;
    }
    
    // Production URLs
    if (window.location.hostname.includes('onrender.com')) {
      return 'https://gamebuddies-io.onrender.com';
    }
    
    if (window.location.hostname !== 'localhost') {
      return 'https://gamebuddies.io';
    }
    
    // Local development
    return 'http://localhost:3033';
  };

  const handleReturnToLobby = () => {
    if (!socket || !roomCode || !isGM) {
      console.error('Cannot return to lobby: missing requirements');
      return;
    }

    setIsReturning(true);
    
    console.log('🔄 GM initiating return to lobby for all players');
    
    // Emit the return to lobby event
    socket.emit('returnToLobby', { roomCode });
    
    // The server will automatically redirect all players back to GameBuddies
  };

  // Don't render if not GM
  if (!isGM || !roomCode) {
    return null;
  }

  return (
    <button
      onClick={handleReturnToLobby}
      disabled={isReturning}
      style={{
        position: 'fixed',
        top: '20px',
        left: '20px',
        zIndex: 1000,
        padding: '12px 20px',
        backgroundColor: '#4CAF50',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        cursor: isReturning ? 'not-allowed' : 'pointer',
        fontSize: '14px',
        fontWeight: '600',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        transition: 'all 0.2s ease',
        opacity: isReturning ? 0.7 : 1
      }}
      title="Return all players to GameBuddies lobby to select another game"
    >
      {isReturning ? '🔄 Returning...' : '← Return to GameBuddies Lobby'}
    </button>
  );
};

export default GameBuddiesReturnButton;
```

### 3. Add Return Handler for All Players

Create a component that handles automatic return for all players (including non-GMs):

```javascript
// GameBuddiesReturnHandler.js
import { useEffect } from 'react';
import io from 'socket.io-client';

const GameBuddiesReturnHandler = () => {
  useEffect(() => {
    // Get room and player info from URL
    const urlParams = new URLSearchParams(window.location.search);
    const roomCode = urlParams.get('room');
    const playerName = urlParams.get('name');
    const role = urlParams.get('role');
    
    if (!roomCode || !playerName) {
      return; // Not from GameBuddies
    }

    console.log('🔄 GameBuddies return handler initialized');

    // Connect to GameBuddies server
    const socket = io(getGameBuddiesServerUrl(), {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: true
    });

    // Listen for GM-initiated return to lobby
    socket.on('returnToLobbyInitiated', (data) => {
      console.log('🔄 GM initiated return to lobby:', data);
      
      // Automatically redirect to GameBuddies with auto-rejoin
      const returnUrl = data.returnUrl || 'https://gamebuddies.io';
      const autoRejoinUrl = `${returnUrl}?autorejoin=${data.roomCode}&name=${encodeURIComponent(data.playerName)}&host=${data.isHost}`;
      
      window.location.href = autoRejoinUrl;
    });

    // Connect to room to receive events
    socket.on('connect', () => {
      console.log('🔄 Connected to GameBuddies for return handling');
      socket.emit('joinRoom', {
        roomCode: roomCode,
        playerName: decodeURIComponent(playerName)
      });
    });

    socket.on('connect_error', (error) => {
      console.error('🔄 Failed to connect to GameBuddies:', error);
    });

    // Cleanup
    return () => {
      socket.disconnect();
    };
  }, []);

  const getGameBuddiesServerUrl = () => {
    if (process.env.REACT_APP_GAMEBUDDIES_URL) {
      return process.env.REACT_APP_GAMEBUDDIES_URL;
    }
    
    if (window.location.hostname.includes('onrender.com')) {
      return 'https://gamebuddies-io.onrender.com';
    }
    
    if (window.location.hostname !== 'localhost') {
      return 'https://gamebuddies.io';
    }
    
    return 'http://localhost:3033';
  };

  // This component doesn't render anything
  return null;
};

export default GameBuddiesReturnHandler;
```

### 4. Integrate Components in Your Game

Add both components to your main game component:

```javascript
// App.js or your main game component
import GameBuddiesReturnButton from './GameBuddiesReturnButton';
import GameBuddiesReturnHandler from './GameBuddiesReturnHandler';

function App() {
  return (
    <div className="App">
      {/* Your game content */}
      <YourGameContent />
      
      {/* GameBuddies integration components */}
      <GameBuddiesReturnButton />
      <GameBuddiesReturnHandler />
    </div>
  );
}

export default App;
```

### 5. Environment Configuration

Add GameBuddies server URL to your environment variables:

```bash
# .env
REACT_APP_GAMEBUDDIES_URL=https://gamebuddies.io

# For local development
# REACT_APP_GAMEBUDDIES_URL=http://localhost:3033
```

## How It Works

### For the GM (Game Master):
1. **Button Visibility**: Only the GM sees the return button (determined by `role=gm` URL parameter)
2. **Connection**: GM's game connects to GameBuddies server via Socket.IO
3. **Return Trigger**: When GM clicks the button, it emits `returnToLobby` event to GameBuddies server
4. **Server Action**: GameBuddies server sends `returnToLobbyInitiated` event to ALL players in the room
5. **Automatic Redirect**: GM gets redirected back to GameBuddies lobby with auto-rejoin

### For Regular Players:
1. **Background Handler**: All players have the return handler running in background
2. **Event Listening**: Handler listens for `returnToLobbyInitiated` event from server
3. **Automatic Redirect**: When GM triggers return, all players automatically get redirected to GameBuddies lobby

### Auto-Rejoin Process:
1. Players are redirected to: `https://gamebuddies.io?autorejoin=ROOMCODE&name=PLAYERNAME&host=true/false`
2. GameBuddies detects the `autorejoin` parameter
3. Players are automatically placed back in the same room with their original names and roles
4. Room status is reset to allow new game selection

## Testing

### Local Development:
1. Start your game with GameBuddies integration: `http://localhost:3000/yourgame?room=TEST01&players=2&name=TestGM&role=gm`
2. Ensure GameBuddies server is running on `http://localhost:3033`
3. Click the return button and verify redirect to `http://localhost:3033?autorejoin=TEST01&name=TestGM&host=true`

### Production:
1. Deploy your game to your hosting platform
2. Test with GameBuddies production: `https://gamebuddies.io`
3. Verify return functionality works end-to-end

## Troubleshooting

### Common Issues:

1. **Button not showing**: Check that URL has `role=gm` parameter
2. **Connection failed**: Verify GameBuddies server URL is correct
3. **Return not working**: Check browser console for Socket.IO connection errors
4. **Auto-rejoin failed**: Ensure GameBuddies server is running and accessible

### Debug Logging:
Enable console logging to debug issues:
```javascript
console.log('🔍 URL params:', {
  room: urlParams.get('room'),
  role: urlParams.get('role'),
  name: urlParams.get('name')
});
```

## Security Considerations

1. **Server URL**: Use environment variables for server URLs
2. **Input Validation**: Validate URL parameters before using them
3. **Connection Timeout**: Set reasonable timeout values for Socket.IO connections
4. **Error Handling**: Implement proper error handling for connection failures

## Example Integration

For a complete example, see how this is implemented in the DDF game:
- GM Return Button: Shows only for game masters
- Return Handler: Runs for all players
- Automatic redirect: Seamless return to GameBuddies lobby
- Auto-rejoin: Players rejoin the same room automatically

This implementation ensures a smooth user experience where the GM can easily return all players to the GameBuddies lobby to select a new game without manual coordination. 