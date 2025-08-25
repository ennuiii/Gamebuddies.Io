# GameBuddies Integration Guide for Games

## One-Way Integration: From GameBuddies to Games

GameBuddies provides a simple one-way integration where players start in GameBuddies rooms and launch games together. Once a game starts, it operates independently.

### What GameBuddies Provides

When GameBuddies launches your game, it passes player data via URL parameters:

**Required Parameters:**
- `room` - The room code
- `name` - The player's name  
- `playerId` - The player's unique ID
- `players` - Total number of players

**Optional Parameters:**
- `role` - Player role (e.g., "gm", "player")

### Example Game Launch URL:
```
https://yourgame.com/?room=ABC123&name=PlayerName&playerId=uuid&players=4&role=gm
```

### How to Handle GameBuddies Integration

```javascript
// Parse URL parameters when your game loads
const urlParams = new URLSearchParams(window.location.search);
const roomCode = urlParams.get('room');
const playerName = urlParams.get('name');
const playerId = urlParams.get('playerId');
const playerCount = parseInt(urlParams.get('players'));
const role = urlParams.get('role') || 'player';

// Check if this is a GameBuddies session
const isFromGameBuddies = roomCode && playerName;

if (isFromGameBuddies) {
  console.log('Game launched from GameBuddies:', {
    roomCode,
    playerName,
    playerId,
    playerCount,
    role
  });
  
  // Set up your game with this data
  setupGameWithBuddiesData({
    roomCode,
    playerName,
    playerId,
    playerCount,
    role
  });
} else {
  // Handle non-GameBuddies users (direct game access)
  setupGameForDirectAccess();
}
```

### Game Independence

After launch, your game operates completely independently:
- No return-to-lobby functionality needed
- No session storage dependencies
- No communication with GameBuddies platform
- Players stay in your game until they close it

### Benefits of This Approach

1. **Simplicity** - No complex return logic needed
2. **Independence** - Games don't depend on GameBuddies after launch
3. **Reliability** - No connection issues between platforms
4. **Flexibility** - Games can implement their own end-game flows

### Integration Checklist

- [ ] Parse URL parameters on game load
- [ ] Handle GameBuddies vs direct access scenarios
- [ ] Use player data to set up game state
- [ ] Test game launch from GameBuddies
- [ ] Verify game works independently after launch

### Testing Your Integration

1. Create a GameBuddies room
2. Add players to the room
3. Select and start your game
4. Verify your game receives correct parameters
5. Test game functionality with GameBuddies data

That's it! No return logic, no session storage, no complex integration - just clean parameter passing.