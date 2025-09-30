# GameBuddies Streamer Mode Integration Guide

## 🎯 What Changed?

GameBuddies now supports **Streamer Mode** - a privacy feature that prevents room codes from being exposed in URLs and game UIs, protecting streamers from stream sniping.

### The Problem We're Solving

**Before (Vulnerable to Stream Sniping):**
```
GameBuddies → Game URL: https://yourgame.com/?room=ABC123 ❌
             → URL bar shows room code
             → Game UI shows "Room: ABC123"
             → Return link: gamebuddies.io/?return=ABC123

Result: Stream viewers can see the code and snipe the lobby!
```

**After (Stream-Safe):**
```
GameBuddies → Game URL: https://yourgame.com/?session=a1b2c3d4... ✅
             → URL bar shows session token (no room code!)
             → Game UI shows "🔒 Private Room"
             → Return link: gamebuddies.io/?return=a1b2c3d4...

Result: Room code never exposed - 100% stream-safe!
```

---

## 🔄 How It Works Now

### Two Modes of Operation

#### **Normal Mode (Existing Behavior)**
- Room code passed in URL: `?room=ABC123`
- Your game reads it from URL parameters
- Nothing changes - **fully backward compatible!**

#### **Streamer Mode (New)**
- Session token passed in URL: `?session=a1b2c3d4e5f6...`
- Your game calls GameBuddies API to resolve token → room code
- Room code hidden from URLs and UI
- Return links use session tokens

---

## 📋 What Your Game Needs to Do

### Step 1: Update Game Initialization (Required)

Replace this:

```javascript
// ❌ OLD WAY - Only supports normal mode
const roomCode = new URLSearchParams(window.location.search).get('room');
```

With this:

```javascript
// ✅ NEW WAY - Supports both modes!
async function getRoomInfo() {
  const params = new URLSearchParams(window.location.search);

  // Try session-based flow first (streamer mode)
  const sessionToken = params.get('session');
  if (sessionToken) {
    try {
      const response = await fetch(
        `https://gamebuddies.io/api/game-sessions/${sessionToken}`
      );

      if (!response.ok) {
        throw new Error('Session not found or expired');
      }

      const data = await response.json();
      return {
        roomCode: data.roomCode,        // Still get the room code!
        streamerMode: data.streamerMode, // Know if it's streamer mode
        playerId: data.playerId,
        metadata: data.metadata
      };
    } catch (error) {
      console.error('Failed to resolve session:', error);
      alert('Invalid or expired session. Please return to GameBuddies.');
      return null;
    }
  }

  // Fallback to room-based flow (normal mode - backward compatible)
  const roomCode = params.get('room');
  if (roomCode) {
    return {
      roomCode: roomCode,
      streamerMode: false,
      playerId: null,
      metadata: {}
    };
  }

  // No room info provided
  alert('No room code or session provided!');
  return null;
}

// Use it in your initialization
const roomInfo = await getRoomInfo();
if (!roomInfo) {
  // Handle error
  return;
}

const { roomCode, streamerMode } = roomInfo;

// Now use roomCode as normal for socket connections, etc.
socket.emit('joinRoom', { roomCode, playerName });
```

---

### Step 2: Hide Room Code in UI (Recommended)

Add CSS to hide room code displays when in streamer mode:

```javascript
// After getting room info
if (streamerMode) {
  document.body.classList.add('streamer-mode');
}
```

```css
/* Add to your CSS file */
.streamer-mode .room-code-display {
  display: none !important;
}

.streamer-mode .room-header::after {
  content: "🔒 Private Room";
  display: block;
  font-size: 1.5rem;
  color: var(--accent-color);
  text-align: center;
  padding: 1rem;
}
```

**Or use JavaScript:**

```javascript
// Hide room code elements
if (streamerMode) {
  const roomCodeElements = document.querySelectorAll('.room-code, #roomCode, [data-room-code]');
  roomCodeElements.forEach(el => {
    el.textContent = '🔒 Private Room';
    el.style.letterSpacing = 'normal';
  });
}
```

---

### Step 3: Update Return Links (Recommended)

Change your "Return to GameBuddies" links to use session tokens instead of room codes:

**Before:**
```javascript
// ❌ OLD - Room code in URL
const returnUrl = `https://gamebuddies.io/?return=${roomCode}`;
```

**After:**
```javascript
// ✅ NEW - Session token in URL
let returnUrl;

if (streamerMode && sessionToken) {
  // Use session token for return (stream-safe)
  returnUrl = `https://gamebuddies.io/?return=${sessionToken}`;
} else {
  // Use room code for normal mode (backward compatible)
  returnUrl = `https://gamebuddies.io/?join=${roomCode}`;
}
```

---

## 📦 Complete Example Integration

Here's a full example for your game:

```javascript
// gamebuddies-integration.js

class GameBuddiesIntegration {
  constructor() {
    this.roomCode = null;
    this.streamerMode = false;
    this.sessionToken = null;
    this.playerId = null;
  }

  async initialize() {
    const params = new URLSearchParams(window.location.search);

    // Try session-based flow first
    this.sessionToken = params.get('session');
    if (this.sessionToken) {
      console.log('🔐 Streamer mode detected - resolving session...');
      const sessionData = await this.resolveSession(this.sessionToken);
      if (!sessionData) return false;

      this.roomCode = sessionData.roomCode;
      this.streamerMode = true;
      this.playerId = sessionData.playerId;

      console.log('✅ Session resolved to room:', this.roomCode);
      this.applyStreamerMode();
      return true;
    }

    // Fallback to room-based flow
    this.roomCode = params.get('room');
    if (this.roomCode) {
      console.log('📝 Normal mode - using room code:', this.roomCode);
      this.streamerMode = false;
      return true;
    }

    console.error('❌ No room information provided');
    alert('No room code or session provided. Please start from GameBuddies.');
    return false;
  }

  async resolveSession(sessionToken) {
    try {
      const response = await fetch(
        `https://gamebuddies.io/api/game-sessions/${sessionToken}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error('Session resolution failed');
      }

      const data = await response.json();
      return {
        roomCode: data.roomCode,
        playerId: data.playerId,
        metadata: data.metadata
      };
    } catch (error) {
      console.error('Failed to resolve session:', error);
      alert('Invalid or expired session. Please return to GameBuddies and try again.');
      return null;
    }
  }

  applyStreamerMode() {
    // Add streamer mode class to body
    document.body.classList.add('streamer-mode');

    // Hide all room code displays
    const roomCodeElements = document.querySelectorAll(
      '.room-code, #roomCode, [data-room-code]'
    );

    roomCodeElements.forEach(el => {
      el.textContent = '🔒 Private Room';
      el.classList.add('hidden-code');
    });

    console.log('🎥 Streamer mode UI applied');
  }

  getReturnUrl() {
    if (this.streamerMode && this.sessionToken) {
      return `https://gamebuddies.io/?return=${this.sessionToken}`;
    } else {
      return `https://gamebuddies.io/?join=${this.roomCode}`;
    }
  }

  getRoomCode() {
    return this.roomCode;
  }

  isStreamerMode() {
    return this.streamerMode;
  }
}

// Usage in your game:
const gb = new GameBuddiesIntegration();

async function initGame() {
  const success = await gb.initialize();
  if (!success) {
    return; // Initialization failed
  }

  // Get room code for socket connection
  const roomCode = gb.getRoomCode();

  // Connect to GameBuddies socket
  const socket = io('https://gamebuddies.io');
  socket.emit('joinRoom', {
    roomCode: roomCode,
    playerName: getPlayerName(),
    gameType: 'your-game-id'
  });

  // Set up return button
  document.getElementById('returnBtn').onclick = () => {
    window.location.href = gb.getReturnUrl();
  };
}

initGame();
```

---

## 🎨 CSS for Streamer Mode

Add this to your game's CSS:

```css
/* Streamer Mode Styles */
.streamer-mode .room-code-display,
.streamer-mode .room-code,
.streamer-mode #roomCode,
.streamer-mode [data-room-code] {
  display: none !important;
}

.streamer-mode .room-header::before {
  content: "🔒 Private Room";
  display: block;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  font-weight: 600;
  text-align: center;
  margin-bottom: 1rem;
}

/* Optional: Add indicator for streamer mode */
.streamer-mode::after {
  content: "🎥 STREAMER MODE ACTIVE";
  position: fixed;
  top: 10px;
  right: 10px;
  background: rgba(102, 126, 234, 0.9);
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 600;
  z-index: 9999;
  pointer-events: none;
}
```

---

## 🧪 Testing Your Integration

### Test Normal Mode (Backward Compatibility)
```
URL: https://yourgame.com/?room=ABC123
Expected: Game works as it always has
```

### Test Streamer Mode
```
URL: https://yourgame.com/?session=a1b2c3d4e5f6...
Expected:
  - Game fetches room code via API
  - Room code hidden in UI
  - Return link uses session token
```

---

## 📊 API Reference

### GET /api/game-sessions/:token

Resolves a session token to room information.

**Request:**
```
GET https://gamebuddies.io/api/game-sessions/a1b2c3d4e5f6...
```

**Response (Success - 200):**
```json
{
  "success": true,
  "roomCode": "ABC123",
  "gameType": "ddf",
  "streamerMode": true,
  "playerId": "uuid-123",
  "metadata": {
    "player_name": "StreamerGuy",
    "is_host": true,
    "total_players": 4
  },
  "expiresAt": "2025-09-30T18:00:00.000Z"
}
```

**Response (Error - 404):**
```json
{
  "error": "Session not found or expired"
}
```

**Response (Error - 400):**
```json
{
  "error": "Session token is required"
}
```

---

## ❓ FAQ

### Q: Do I have to update my game?
**A:** No! Your game will continue to work in normal mode. This update is **100% backward compatible**. However, it won't support streamer mode until you add the session token handling.

### Q: What happens if I don't update?
**A:** Your game will still work, but when hosts enable streamer mode, your game will show an error because it won't know how to handle the `?session=` parameter. Players will see: "No room code provided."

### Q: How long does a session token last?
**A:** 3 hours from creation. After that, the token expires and players need to return to GameBuddies to get a new one.

### Q: Can I still use the room code internally?
**A:** Yes! The room code still exists and works exactly the same for socket connections, API calls, etc. It's just hidden from the URL and UI.

### Q: What if my game has subpages?
**A:** Pass the session token (if in streamer mode) to subpages as needed, or store it in localStorage/sessionStorage. Don't put the room code in any URLs.

### Q: Do I need to change my socket.io connection logic?
**A:** No! You still use the room code for `socket.emit('joinRoom', { roomCode })`. The only change is *how* you get the room code (from API instead of URL parameter).

---

## 🚀 Quick Migration Checklist

- [ ] Add session token resolution to game initialization
- [ ] Add backward compatibility for `?room=` parameter
- [ ] Hide room code UI elements when `streamerMode === true`
- [ ] Update return links to use session token in streamer mode
- [ ] Add CSS for streamer mode indicators
- [ ] Test both normal mode and streamer mode
- [ ] Update your game's documentation

---

## 📞 Support

If you have questions or need help integrating:
- GitHub Issues: https://github.com/ennuiii/Gamebuddies.Io/issues
- Email: support@gamebuddies.io

---

## 📝 Example Games

These games have already been updated for streamer mode:
- **Der Duemmste fliegt (DDF)** - [See implementation]
- **Bingo Buddies** - [See implementation]
- **ClueScale** - [See implementation]

You can reference their code for examples!

---

**Last Updated:** 2025-09-30
**Version:** 1.0
**Compatibility:** GameBuddies v2.0+