# 🎮 Game Reconnect Migration Guide

## Warum upgraden?

### ❌ Alte Integration (EXAMPLE_GAME_INTEGRATION.js)
```javascript
// Keine automatische Reconnection
// Spieler verlieren Verbindung → müssen Seite neu laden
// Kein State Preservation
// Keine Connection Status Anzeige
```

### ✅ Neue Integration (ENHANCED_GAME_INTEGRATION.js)
```javascript
✅ Automatische Reconnection (10 Versuche, Exponential Backoff)
✅ Game State bleibt erhalten
✅ Player Position/Data wird gespeichert
✅ Connection Status Anzeige
✅ Auto-Rejoin nach Reconnect
✅ Chat Integration
```

---

## 🚀 Migration in 3 Schritten

### **Schritt 1: Alte Klasse ersetzen**

```diff
- <script src="old-gamebuddies-integration.js"></script>
+ <script src="ENHANCED_GAME_INTEGRATION.js"></script>

- const gameBuddies = new GameBuddiesIntegration({ ... });
+ const gameBuddies = new EnhancedGameBuddiesIntegration({ ... });
```

### **Schritt 2: State-Saving implementieren**

```javascript
// ALT: Nichts (State geht verloren bei Disconnect)

// NEU: State-Saving Callbacks implementieren
gameBuddies.saveGameState = function() {
  this.reconnectionState.gameState = {
    currentLevel: myGame.level,
    score: myGame.score,
    // ... deine Game-Daten
  };
};

gameBuddies.savePlayerState = function() {
  this.reconnectionState.playerState = {
    position: { x: player.x, y: player.y },
    health: player.health,
    // ... deine Player-Daten
  };
};
```

### **Schritt 3: Restore-Callbacks implementieren**

```javascript
// Wird automatisch nach Reconnect aufgerufen
gameBuddies.onGameStateRestored = (gameState) => {
  myGame.level = gameState.currentLevel;
  myGame.score = gameState.score;
  // ... restore deine Game-Daten
};

gameBuddies.onPlayerStateRestored = (playerState) => {
  player.x = playerState.position.x;
  player.y = playerState.position.y;
  player.health = playerState.health;
  // ... restore deine Player-Daten
};
```

**Fertig!** 🎉

---

## 📋 Game-Type spezifische Beispiele

### **1. Turn-Based Game (z.B. Quiz, Card Game)**

```javascript
// === State Saving ===
gameBuddies.saveGameState = function() {
  this.reconnectionState.gameState = {
    currentRound: game.round,
    currentTurn: game.currentPlayerIndex,
    scores: game.scores,
    answeredQuestions: game.answeredQuestions,
    timeRemaining: game.timer,
  };
};

gameBuddies.savePlayerState = function() {
  this.reconnectionState.playerState = {
    playerId: this.sessionData.playerId,
    score: game.players[this.sessionData.playerId].score,
    hasAnswered: game.players[this.sessionData.playerId].hasAnswered,
    answer: game.players[this.sessionData.playerId].currentAnswer,
  };
};

// === State Restoring ===
gameBuddies.onGameStateRestored = (gameState) => {
  game.round = gameState.currentRound;
  game.currentPlayerIndex = gameState.currentTurn;
  game.scores = gameState.scores;
  game.answeredQuestions = gameState.answeredQuestions;
  game.timer = gameState.timeRemaining;

  game.updateUI();
  console.log('✅ Turn-based game state restored!');
};

gameBuddies.onPlayerStateRestored = (playerState) => {
  const myPlayer = game.players[playerState.playerId];
  myPlayer.score = playerState.score;
  myPlayer.hasAnswered = playerState.hasAnswered;
  myPlayer.currentAnswer = playerState.answer;

  console.log('✅ Player state restored!');
};
```

---

### **2. Real-Time Game (z.B. Racing, Platformer)**

```javascript
// === State Saving ===
gameBuddies.saveGameState = function() {
  this.reconnectionState.gameState = {
    level: game.currentLevel,
    startTime: game.startTimestamp,
    elapsedTime: Date.now() - game.startTimestamp,
    gamePhase: game.phase, // 'waiting', 'countdown', 'playing', 'finished'
  };
};

gameBuddies.savePlayerState = function() {
  this.reconnectionState.playerState = {
    playerId: this.sessionData.playerId,
    position: {
      x: player.x,
      y: player.y,
      velocityX: player.vx,
      velocityY: player.vy,
    },
    health: player.health,
    powerups: player.powerups,
    checkpointIndex: player.lastCheckpoint,
  };
};

// === State Restoring ===
gameBuddies.onGameStateRestored = (gameState) => {
  game.currentLevel = gameState.level;
  game.phase = gameState.gamePhase;

  // Synchronize game time
  game.startTimestamp = Date.now() - gameState.elapsedTime;

  console.log('✅ Real-time game state restored!');
};

gameBuddies.onPlayerStateRestored = (playerState) => {
  // Respawn player at saved position
  player.x = playerState.position.x;
  player.y = playerState.position.y;
  player.vx = playerState.position.velocityX;
  player.vy = playerState.position.velocityY;
  player.health = playerState.health;
  player.powerups = playerState.powerups;
  player.lastCheckpoint = playerState.checkpointIndex;

  // Re-add player to game world
  game.addPlayer(player);

  console.log('✅ Player spawned at saved position!');
};
```

---

### **3. Cooperative Game (z.B. Escape Room, Puzzle)**

```javascript
// === State Saving ===
gameBuddies.saveGameState = function() {
  this.reconnectionState.gameState = {
    solvedPuzzles: game.solvedPuzzles,
    unlockedAreas: game.unlockedAreas,
    collectableItems: game.collectedItems,
    timeRemaining: game.timeLimit - (Date.now() - game.startTime),
    hints: {
      used: game.hintsUsed,
      available: game.hintsAvailable,
    },
  };
};

gameBuddies.savePlayerState = function() {
  this.reconnectionState.playerState = {
    playerId: this.sessionData.playerId,
    currentRoom: player.currentRoom,
    inventory: player.inventory,
    interactingWith: player.currentInteraction,
  };
};

// === State Restoring ===
gameBuddies.onGameStateRestored = (gameState) => {
  game.solvedPuzzles = gameState.solvedPuzzles;
  game.unlockedAreas = gameState.unlockedAreas;
  game.collectedItems = gameState.collectableItems;
  game.hintsUsed = gameState.hints.used;
  game.hintsAvailable = gameState.hints.available;

  // Restore timer
  game.timeLimit = gameState.timeRemaining;
  game.startTime = Date.now();

  // Re-render unlocked areas
  game.updateMapState();

  console.log('✅ Cooperative game state restored!');
};

gameBuddies.onPlayerStateRestored = (playerState) => {
  // Move player back to their room
  player.currentRoom = playerState.currentRoom;
  player.inventory = playerState.inventory;

  // Restore interaction state
  if (playerState.interactingWith) {
    player.resumeInteraction(playerState.interactingWith);
  }

  console.log('✅ Player restored in room:', playerState.currentRoom);
};
```

---

### **4. Drawing/Creative Game (z.B. Pictionary, Skribbl.io)**

```javascript
// === State Saving ===
gameBuddies.saveGameState = function() {
  this.reconnectionState.gameState = {
    currentWord: game.secretWord,
    currentDrawer: game.currentDrawerId,
    round: game.round,
    roundTimeRemaining: game.roundTimer,
    canvas: game.canvas.toDataURL(), // 🎨 Save canvas as image!
  };
};

gameBuddies.savePlayerState = function() {
  this.reconnectionState.playerState = {
    playerId: this.sessionData.playerId,
    score: game.players[this.sessionData.playerId].score,
    hasGuessed: game.players[this.sessionData.playerId].hasGuessed,
    isDrawing: this.sessionData.playerId === game.currentDrawerId,
  };
};

// === State Restoring ===
gameBuddies.onGameStateRestored = (gameState) => {
  game.secretWord = gameState.currentWord;
  game.currentDrawerId = gameState.currentDrawer;
  game.round = gameState.round;
  game.roundTimer = gameState.roundTimeRemaining;

  // 🎨 Restore canvas drawing!
  const img = new Image();
  img.onload = () => {
    game.ctx.drawImage(img, 0, 0);
    console.log('🎨 Canvas restored!');
  };
  img.src = gameState.canvas;

  console.log('✅ Drawing game state restored!');
};

gameBuddies.onPlayerStateRestored = (playerState) => {
  const myPlayer = game.players[playerState.playerId];
  myPlayer.score = playerState.score;
  myPlayer.hasGuessed = playerState.hasGuessed;

  if (playerState.isDrawing) {
    game.enableDrawingTools();
  } else {
    game.showGuessingInput();
  }

  console.log('✅ Player role restored!');
};
```

---

## 🔍 Connection Status Monitoring

### **In deinem Game UI anzeigen:**

```javascript
// Get current connection status
const status = gameBuddies.getConnectionStatus();
// Returns: 'connected' | 'reconnecting' | 'disconnected'

// Listen to status changes
gameBuddies.onConnectionStatusChange(status => {
  if (status === 'reconnecting') {
    game.showReconnectingOverlay();
  } else if (status === 'connected') {
    game.hideReconnectingOverlay();
  } else if (status === 'disconnected') {
    game.showDisconnectedMessage();
  }
});
```

---

## 💬 Chat Integration

### **Chat zwischen GameBuddies Lobby und Game:**

```javascript
// Receive chat from GameBuddies lobby
gameBuddies.onChatMessage = (data) => {
  // data = { playerName: 'Max', message: 'Hello!', timestamp: 123456 }
  game.displayChatMessage(data.playerName, data.message);
};

// Send chat from game to GameBuddies lobby
function sendChatToLobby(message) {
  gameBuddies.sendChatMessage(message);
}

// Example: System messages
sendChatToLobby('🎮 Game started!');
sendChatToLobby('🏆 Player1 won the round!');
```

---

## ⚙️ Custom Reconnect Settings

```javascript
const gameBuddies = new EnhancedGameBuddiesIntegration({
  gameName: 'My Game',

  // Customize reconnect behavior
  reconnectionAttempts: 20,        // Default: 10
  reconnectionDelay: 500,          // Default: 1000ms
  reconnectionDelayMax: 15000,     // Default: 10000ms
});
```

### **Empfohlene Settings pro Game-Type:**

| Game Type | reconnectionAttempts | reconnectionDelayMax | Begründung |
|-----------|---------------------|---------------------|------------|
| Turn-based | 15 | 15000ms | Mehr Geduld OK, nicht zeitkritisch |
| Real-time | 10 | 5000ms | Schnelle Reconnection nötig |
| Cooperative | 20 | 20000ms | Wichtig nicht rauszufliegen |
| Casual | 5 | 3000ms | Schneller aufgeben = bessere UX |

---

## 🧪 Testing Reconnection

### **Test-Szenario 1: WiFi Disconnect**

```javascript
// 1. Spiel starten und beitreten
// 2. Im Chrome DevTools:
//    - F12 → Network Tab → Online → Offline
// 3. Beobachten:
//    - Connection Status → "Reconnecting..."
//    - Game state wird gespeichert
// 4. Network → Online
// 5. Prüfen:
//    ✅ Auto-Rejoin funktioniert
//    ✅ Game state wiederhergestellt
//    ✅ Player position korrekt
```

### **Test-Szenario 2: Server Restart**

```javascript
// 1. Spiel laufen lassen
// 2. Server neu starten
// 3. Beobachten:
//    - Reconnection startet automatisch
//    - Nach Server-Start: Auto-Rejoin
// 4. Prüfen:
//    ✅ Spieler zurück im Spiel
//    ✅ State erhalten
```

### **Test-Szenario 3: Lange Disconnect (> 5 Min)**

```javascript
// 1. Disconnect simulieren
// 2. Warten > 5 Minuten
// 3. Reconnect versuchen
// 4. Erwartung:
//    - Server hat Player evtl. entfernt
//    - Sollte graceful error zeigen
//    - "Return to GameBuddies" Button
```

---

## 🐛 Debugging

### **Console Logs aktivieren:**

```javascript
// Alle Reconnect-Events werden geloggt:
// ✅ Connected to GameBuddies server
// 💾 Game state saved: { ... }
// 💾 Player state saved: { ... }
// ⚠️ Disconnected from GameBuddies: transport close
// 🔄 Reconnection attempt 1/10
// 🔄 Reconnection attempt 2/10
// ✅ Reconnected after 3 attempts
// 🔄 Auto-rejoining room: ABC123
// ♻️ Restoring game state: { ... }
// ♻️ Restoring player state: { ... }
```

### **State Inspection:**

```javascript
// In Browser Console:
console.log(gameBuddies.reconnectionState);

// Output:
// {
//   shouldReconnect: true,
//   reconnectAttempt: 3,
//   gameState: { ... },
//   playerState: { ... }
// }
```

---

## 📦 File Structure

```
your-game/
├── index.html
├── game.js                            # Your game logic
├── ENHANCED_GAME_INTEGRATION.js       # ← Include this!
└── assets/
    └── ...
```

### **In index.html:**

```html
<!DOCTYPE html>
<html>
<head>
  <title>My Game</title>
  <!-- Socket.IO Client -->
  <script src="https://cdn.socket.io/4.8.1/socket.io.min.js"></script>

  <!-- Enhanced GameBuddies Integration -->
  <script src="ENHANCED_GAME_INTEGRATION.js"></script>
</head>
<body>
  <canvas id="game-canvas"></canvas>

  <!-- Your game code -->
  <script src="game.js"></script>

  <script>
    // Initialize GameBuddies
    const gameBuddies = new EnhancedGameBuddiesIntegration({
      gameName: 'My Awesome Game'
    });

    // Setup callbacks
    gameBuddies.onGameStateRestored = (state) => {
      // Restore game...
    };
  </script>
</body>
</html>
```

---

## ✅ Checklist für Migration

- [ ] `ENHANCED_GAME_INTEGRATION.js` in Game einbinden
- [ ] Alte `GameBuddiesIntegration` durch `EnhancedGameBuddiesIntegration` ersetzen
- [ ] `saveGameState()` implementieren
- [ ] `savePlayerState()` implementieren
- [ ] `onGameStateRestored` Callback implementieren
- [ ] `onPlayerStateRestored` Callback implementieren
- [ ] Connection Status UI testen
- [ ] Reconnect mit DevTools testen (Offline → Online)
- [ ] Game State Restoration testen
- [ ] Player State Restoration testen
- [ ] Chat Integration testen (optional)
- [ ] Production deployment testen

---

## 🚀 Benefits nach Migration

✅ **Spieler bleiben im Spiel** - Keine manuellen Reloads mehr
✅ **Bessere UX** - Transparenz durch Connection Status
✅ **Weniger Frustration** - Auto-Recovery bei kurzen Disconnects
✅ **State Preservation** - Fortschritt geht nicht verloren
✅ **Chat Integration** - Nahtlose Kommunikation
✅ **Production Ready** - Battle-tested Reconnect Logic

---

## 📞 Support

Fragen? Issues?
→ Check die Console Logs
→ Teste mit DevTools Network Tab
→ Prüfe `gameBuddies.reconnectionState`

**Happy Gaming!** 🎮
