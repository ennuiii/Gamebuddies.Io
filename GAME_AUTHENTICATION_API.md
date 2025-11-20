# Game Authentication API - Secure Session System

## Overview

GameBuddies uses a **secure session token system** to authenticate players and pass data to games. This prevents URL tampering and ensures premium status, lobby names, and other sensitive data cannot be faked.

## 🔐 Security Model

### How It Works
1. **Server generates session token** when game starts (cryptographically random 32-byte hex)
2. **Token stored in database** with player data and expiration (3 hours)
3. **Game receives only session token** in URL (no sensitive data)
4. **Game calls API** to verify token and get authenticated player data
5. **Server validates** token hasn't expired and returns real player info

### Why This Is Secure
- ✅ Session tokens are **randomly generated** (impossible to guess)
- ✅ **Server-side validation** (can't be tampered with)
- ✅ Tokens **expire after 3 hours**
- ✅ Can be **revoked** if needed
- ✅ Premium status authenticated by server (can't fake)
- ✅ Custom lobby names authenticated by server (can't fake)

## 🎮 Game URL Format

### New Secure Format
```
https://yourgame.com/?session=SESSION_TOKEN&role=gm
```

**Parameters:**
- `session` (required): The session token to authenticate with
- `role` (optional): `gm` if player is host/game master

### ⚠️ Deprecated Format (Insecure - Do Not Use)
```
❌ Old: ?room=ABCD&name=Player&gbPremiumTier=lifetime&gbPlayerName=CustomName
```
This format allowed URL tampering - anyone could fake premium status!

## 📡 API Endpoint: Session Verification

### Request
```http
GET /api/game/session/:token
```

**No authentication required** - the session token itself is the authentication.

### Response (Success - 200 OK)
```json
{
  "valid": true,
  "session": {
    "id": "uuid",
    "createdAt": "2024-01-15T10:30:00Z",
    "expiresAt": "2024-01-15T13:30:00Z",
    "gameType": "fibbage",
    "streamerMode": false
  },
  "player": {
    "id": "uuid",
    "name": "CustomLobbyName",           // Use this for display
    "username": "realusername",          // Original username
    "displayName": "Display Name",       // Display name from auth
    "customLobbyName": "CustomLobbyName",// Custom name per room
    "premiumTier": "lifetime",           // "free", "monthly", or "lifetime"
    "avatarUrl": "https://...",          // Avatar URL or null
    "isHost": true,
    "role": "host"
  },
  "room": {
    "id": "uuid",
    "code": "ABCD",                      // null in streamer mode
    "gameType": "fibbage",
    "status": "in_game",
    "maxPlayers": 8,
    "currentPlayers": 4,
    "settings": {}
  },
  "participants": [
    {
      "id": "uuid",
      "name": "Player1",
      "role": "host",
      "isHost": true,
      "premiumTier": "lifetime",
      "avatarUrl": "https://..."
    },
    {
      "id": "uuid",
      "name": "Player2",
      "role": "player",
      "isHost": false,
      "premiumTier": "monthly",
      "avatarUrl": null
    }
  ]
}
```

### Response (Invalid Token - 401 Unauthorized)
```json
{
  "valid": false,
  "error": "Invalid session token",
  "code": "INVALID_TOKEN"
}
```

### Response (Expired Token - 401 Unauthorized)
```json
{
  "valid": false,
  "error": "Session expired",
  "code": "SESSION_EXPIRED",
  "expiredAt": "2024-01-15T13:30:00Z"
}
```

### Response (Player Not Found - 404 Not Found)
```json
{
  "valid": false,
  "error": "Player not found in room",
  "code": "PLAYER_NOT_FOUND"
}
```

## 💻 Implementation Guide

### Step 1: Extract Session Token from URL
```javascript
// Get session token from URL parameters
const urlParams = new URLSearchParams(window.location.search);
const sessionToken = urlParams.get('session');
const isHost = urlParams.get('role') === 'gm';

if (!sessionToken) {
  console.error('No session token provided');
  // Handle error - show message to user
}
```

### Step 2: Call API to Verify and Get Player Data
```javascript
async function initializeGame() {
  try {
    // Call GameBuddies API to verify session
    const response = await fetch(
      `https://gamebuddies.io/api/game/session/${sessionToken}`
    );

    if (!response.ok) {
      const error = await response.json();
      console.error('Session verification failed:', error);

      if (error.code === 'SESSION_EXPIRED') {
        // Show "session expired" message
        showError('Your session has expired. Please rejoin from GameBuddies.');
      } else if (error.code === 'INVALID_TOKEN') {
        // Show "invalid session" message
        showError('Invalid session. Please launch from GameBuddies.');
      }
      return;
    }

    const data = await response.json();

    if (!data.valid) {
      console.error('Invalid session:', data);
      showError('Could not validate your session.');
      return;
    }

    // ✅ Now you have AUTHENTICATED player data
    const player = data.player;
    const room = data.room;
    const allPlayers = data.participants;

    // Use the authenticated data
    console.log('Player name:', player.name);              // Custom lobby name
    console.log('Premium tier:', player.premiumTier);      // "free", "monthly", "lifetime"
    console.log('Is host:', player.isHost);
    console.log('Room code:', room.code);                  // Use for game logic
    console.log('All players:', allPlayers);

    // Initialize your game with this data
    startGame({
      playerId: player.id,
      playerName: player.name,
      isPremium: player.premiumTier !== 'free',
      premiumTier: player.premiumTier,
      avatarUrl: player.avatarUrl,
      isHost: player.isHost,
      roomCode: room.code,
      participants: allPlayers
    });

  } catch (error) {
    console.error('Error initializing game:', error);
    showError('Failed to connect to GameBuddies. Please try again.');
  }
}

// Call on page load
initializeGame();
```

### Step 3: Display Premium Features
```javascript
function renderPlayer(player) {
  const playerEl = document.createElement('div');
  playerEl.className = 'player';

  // Add premium styling if player has premium
  if (player.premiumTier === 'lifetime') {
    playerEl.classList.add('premium-lifetime');
  } else if (player.premiumTier === 'monthly') {
    playerEl.classList.add('premium-monthly');
  }

  // Show premium badge
  let badge = '';
  if (player.premiumTier === 'lifetime') {
    badge = '<span class="badge premium">⭐ PREMIUM</span>';
  } else if (player.premiumTier === 'monthly') {
    badge = '<span class="badge pro">💎 PRO</span>';
  }

  playerEl.innerHTML = `
    <img src="${player.avatarUrl || '/default-avatar.png'}" alt="${player.name}">
    <div class="player-name">${player.name}</div>
    ${badge}
  `;

  return playerEl;
}
```

## 🎨 Premium Tier Values

- `"free"` - Free user (no premium)
- `"monthly"` - Monthly subscription (💎 PRO)
- `"lifetime"` - Lifetime subscription (⭐ PREMIUM)

## ⏱️ Session Expiration

- Sessions expire **3 hours** after creation
- Check `expiresAt` timestamp to warn users before expiration
- If expired, show message: "Session expired. Please rejoin from GameBuddies."

## 🔄 Session Refresh

Sessions **do not auto-refresh**. If a game session lasts longer than 3 hours, players will need to rejoin from GameBuddies.

The `last_accessed` timestamp is updated each time the API is called, but this doesn't extend expiration.

## 🚫 Backwards Compatibility

**Old URL format is deprecated** and should not be used:
- ❌ `?room=ABCD&name=Player&gbPremiumTier=lifetime`
- ✅ `?session=TOKEN`

Games should **only accept session tokens** for security.

## 🛡️ Security Best Practices

1. **Always verify session on load** - Never trust URL parameters directly
2. **Cache the session data** - Don't call API repeatedly (respect rate limits)
3. **Handle expired sessions gracefully** - Show clear error messages
4. **Use HTTPS** - Always call API over secure connection
5. **Don't log session tokens** - They're sensitive authentication credentials

## 📊 Example: Full Game Integration

```javascript
class GameBuddiesAuth {
  constructor() {
    this.sessionToken = null;
    this.playerData = null;
    this.roomData = null;
  }

  async initialize() {
    // Get session token from URL
    const urlParams = new URLSearchParams(window.location.search);
    this.sessionToken = urlParams.get('session');

    if (!this.sessionToken) {
      throw new Error('No session token provided');
    }

    // Verify session with GameBuddies API
    const response = await fetch(
      `https://gamebuddies.io/api/game/session/${this.sessionToken}`
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Session verification failed');
    }

    const data = await response.json();

    if (!data.valid) {
      throw new Error('Invalid session');
    }

    // Store authenticated data
    this.playerData = data.player;
    this.roomData = data.room;
    this.participants = data.participants;

    return {
      player: this.playerData,
      room: this.roomData,
      participants: this.participants
    };
  }

  isPremium() {
    return this.playerData?.premiumTier !== 'free';
  }

  getPremiumTier() {
    return this.playerData?.premiumTier || 'free';
  }

  isHost() {
    return this.playerData?.isHost || false;
  }

  getPlayerName() {
    return this.playerData?.name || 'Unknown';
  }

  getRoomCode() {
    return this.roomData?.code;
  }
}

// Usage
const auth = new GameBuddiesAuth();

auth.initialize()
  .then(({ player, room, participants }) => {
    console.log('✅ Authenticated!');
    console.log('Player:', player.name);
    console.log('Premium:', auth.getPremiumTier());
    console.log('Room:', room.code);

    // Start your game
    startGame(player, room, participants);
  })
  .catch(error => {
    console.error('❌ Authentication failed:', error);
    showError('Failed to authenticate. Please rejoin from GameBuddies.');
  });
```

## 📞 Support

For questions or issues with the authentication system:
- GitHub: https://github.com/GameBuddies/gamebuddies
- Documentation: https://gamebuddies.io/docs
