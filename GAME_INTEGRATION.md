# GameBuddies Integration Guide for Games

## How to Implement Return to GameBuddies Lobby

### Simple URL-Based Return

When players in your game want to return to the GameBuddies lobby, simply redirect them using URL parameters:

```javascript
// Example: Return to GameBuddies button handler
function returnToGameBuddiesLobby() {
  // Get the stored session data
  const roomCode = sessionStorage.getItem('gamebuddies_roomCode');
  const playerName = sessionStorage.getItem('gamebuddies_playerName');
  const returnUrl = sessionStorage.getItem('gamebuddies_returnUrl') || 'https://gamebuddies.io';
  
  if (roomCode && playerName) {
    // Redirect back to GameBuddies with rejoin parameters
    window.location.href = `${returnUrl}?rejoin=${roomCode}&name=${encodeURIComponent(playerName)}&fromGame=true`;
  } else {
    // No session data - just go to GameBuddies homepage
    window.location.href = returnUrl;
  }
}
```

### What GameBuddies Provides

When GameBuddies launches your game, it stores the following in sessionStorage:

- `gamebuddies_roomCode` - The room code to rejoin
- `gamebuddies_playerName` - The player's name
- `gamebuddies_playerId` - The player's unique ID
- `gamebuddies_isHost` - Whether the player is the host ("true" or "false")
- `gamebuddies_gameType` - The game type (e.g., "ddf", "schooled", etc.)
- `gamebuddies_returnUrl` - The URL to return to (usually https://gamebuddies.io)

### Complete Example Implementation

```javascript
// In your game's React component or vanilla JS

// Add a return button to your UI
const ReturnToLobbyButton = () => {
  const handleReturn = () => {
    const roomCode = sessionStorage.getItem('gamebuddies_roomCode');
    const playerName = sessionStorage.getItem('gamebuddies_playerName');
    const returnUrl = sessionStorage.getItem('gamebuddies_returnUrl') || 'https://gamebuddies.io';
    
    if (roomCode && playerName) {
      // Clear any game-specific data if needed
      // sessionStorage.removeItem('your_game_data');
      
      // Return to GameBuddies
      window.location.href = `${returnUrl}?rejoin=${roomCode}&name=${encodeURIComponent(playerName)}&fromGame=true`;
    }
  };
  
  return (
    <button onClick={handleReturn}>
      Return to GameBuddies Lobby
    </button>
  );
};
```

### For Game Masters (GMs) - Return All Players

If you want the GM to be able to return all players to the lobby:

```javascript
// GM-only function to return everyone
function returnAllToLobby() {
  const isHost = sessionStorage.getItem('gamebuddies_isHost') === 'true';
  
  if (!isHost) {
    alert('Only the host can return everyone to the lobby');
    return;
  }
  
  // 1. Send a message to all other players via your game's communication system
  // Example using Socket.IO:
  socket.emit('returnToLobby', { 
    roomCode: sessionStorage.getItem('gamebuddies_roomCode') 
  });
  
  // 2. Then redirect the GM
  const roomCode = sessionStorage.getItem('gamebuddies_roomCode');
  const playerName = sessionStorage.getItem('gamebuddies_playerName');
  const returnUrl = sessionStorage.getItem('gamebuddies_returnUrl');
  
  window.location.href = `${returnUrl}?rejoin=${roomCode}&name=${encodeURIComponent(playerName)}&fromGame=true`;
}

// Other players receive the message and redirect
socket.on('returnToLobby', () => {
  const roomCode = sessionStorage.getItem('gamebuddies_roomCode');
  const playerName = sessionStorage.getItem('gamebuddies_playerName');
  const returnUrl = sessionStorage.getItem('gamebuddies_returnUrl');
  
  window.location.href = `${returnUrl}?rejoin=${roomCode}&name=${encodeURIComponent(playerName)}&fromGame=true`;
});
```

### Important Notes

1. **Always use URL parameters** - Don't rely on WebSocket events or complex handlers
2. **Include `fromGame=true`** - This helps GameBuddies know players are returning from a game
3. **Encode player names** - Use `encodeURIComponent()` for names with special characters
4. **Clear game data** - Remove any game-specific sessionStorage before returning
5. **Handle missing data gracefully** - If session data is missing, just redirect to the homepage

### Testing Your Integration

1. Join a GameBuddies room
2. Start your game from the lobby
3. Check that sessionStorage contains the GameBuddies data
4. Click your return button
5. Verify you're back in the same GameBuddies room

### Troubleshooting

- **Players not rejoining room**: Make sure you're including both `rejoin` and `name` parameters
- **Session data missing**: GameBuddies sets this when launching your game - check you're not clearing sessionStorage
- **Wrong return URL**: Default to `https://gamebuddies.io` if `gamebuddies_returnUrl` is not set