# GameBuddies Integration Guide for Game Developers

This guide explains how to integrate your web-based game with the GameBuddies platform.

## Overview

GameBuddies is a multiplayer game platform that handles room creation, player management, and game launching. When players start a game from GameBuddies, they are redirected to your game with special URL parameters and sessionStorage values.

## Integration Flow

1. **Players join a room in GameBuddies**
2. **Host selects and starts your game**
3. **GameBuddies redirects all players to your game URL with parameters**
4. **Your game reads the parameters and sets up the multiplayer session**

## URL Parameters

When GameBuddies redirects players to your game, it includes these URL parameters:

### Required Parameters
- `room` - The 6-character room code (e.g., `ABC123`)
- `players` - Total number of players in the room
- `name` - The player's name (URL encoded)

### Optional Parameters
- `role` - Set to `"gm"` for the game master/host (only present for the host)

### Example URLs
- **Host/GM**: `https://yourgame.com/game?room=ABC123&players=4&name=Alice&role=gm`
- **Player**: `https://yourgame.com/game?room=ABC123&players=4&name=Bob`

## SessionStorage Values

GameBuddies also stores the following values in sessionStorage:

```javascript
sessionStorage.getItem('gamebuddies_roomCode')    // The room code
sessionStorage.getItem('gamebuddies_playerName')  // The player's name
sessionStorage.getItem('gamebuddies_isHost')      // "true" or "false"
sessionStorage.getItem('gamebuddies_gameType')    // Your game's identifier
sessionStorage.getItem('gamebuddies_returnUrl')   // URL to return to GameBuddies
```

## Implementation Example

Here's a basic example of how to handle GameBuddies integration in your game:

```javascript
// Check if we're coming from GameBuddies
const urlParams = new URLSearchParams(window.location.search);
const roomCode = urlParams.get('room');
const playerCount = urlParams.get('players');
const playerName = urlParams.get('name');
const isHost = urlParams.get('role') === 'gm';

if (roomCode) {
  // We're coming from GameBuddies
  console.log('Joining from GameBuddies:', {
    roomCode,
    playerCount,
    playerName,
    isHost
  });
  
  // You can also read from sessionStorage
  const storedRoomCode = sessionStorage.getItem('gamebuddies_roomCode');
  const storedIsHost = sessionStorage.getItem('gamebuddies_isHost') === 'true';
  
  // Initialize your game with these parameters
  if (isHost) {
    // Create the game room
    createGameRoom(roomCode, playerName);
  } else {
    // Join the existing room
    joinGameRoom(roomCode, playerName);
  }
}
```

## Returning to GameBuddies

To allow players to return to GameBuddies after the game:

```javascript
function returnToGameBuddies() {
  const returnUrl = sessionStorage.getItem('gamebuddies_returnUrl');
  const roomCode = sessionStorage.getItem('gamebuddies_roomCode');
  
  if (returnUrl && roomCode) {
    // Redirect back to GameBuddies with rejoin parameter
    window.location.href = `${returnUrl}?rejoin=${roomCode}`;
  }
}
```

## Best Practices

1. **Always validate parameters** - Check that required parameters exist before using them
2. **Handle missing parameters gracefully** - Players might access your game directly
3. **Preserve room integrity** - Ensure the host creates the room before players can join
4. **Use the same room code** - Don't generate new room codes; use the one from GameBuddies
5. **Support reconnection** - Store game state so players can rejoin if disconnected

## Game Registration

To add your game to GameBuddies, you need to provide:

1. **Game identifier** - A unique key for your game (e.g., "ddf", "schooled")
2. **Display name** - The name shown to players
3. **Description** - A brief description of your game
4. **Icon** - An emoji or icon to represent your game
5. **Max players** - Maximum number of players supported
6. **Game URL** - The URL where your game is hosted

## Testing Integration

1. **Test with URL parameters** - Manually add parameters to your game URL
2. **Test host vs player flow** - Ensure hosts can create and players can join
3. **Test sessionStorage** - Verify all values are read correctly
4. **Test return flow** - Ensure players can return to GameBuddies

## Example Integration Checklist

- [ ] Read and validate URL parameters on page load
- [ ] Check if player is host using `role=gm` parameter
- [ ] Create room if host, join room if player
- [ ] Use the provided room code (don't generate new ones)
- [ ] Store game state for reconnection
- [ ] Implement "Return to GameBuddies" functionality
- [ ] Handle edge cases (direct access, missing parameters)
- [ ] Test with multiple players

## Troubleshooting

### Common Issues

1. **Players stuck in loading** - Ensure room is created before players join
2. **Wrong player as host** - Check the `role` parameter correctly
3. **Can't return to GameBuddies** - Verify sessionStorage values exist
4. **Room codes don't match** - Always use the provided room code

### Debug Information

```javascript
// Log all GameBuddies parameters for debugging
console.log('GameBuddies Integration Debug:', {
  urlParams: Object.fromEntries(new URLSearchParams(window.location.search)),
  sessionStorage: {
    roomCode: sessionStorage.getItem('gamebuddies_roomCode'),
    playerName: sessionStorage.getItem('gamebuddies_playerName'),
    isHost: sessionStorage.getItem('gamebuddies_isHost'),
    gameType: sessionStorage.getItem('gamebuddies_gameType'),
    returnUrl: sessionStorage.getItem('gamebuddies_returnUrl')
  }
});
```

## Support

For integration support or to add your game to GameBuddies, please contact the GameBuddies team. 