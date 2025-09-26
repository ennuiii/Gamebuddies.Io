# GameBuddies Return-to-Lobby Integration (V2)

This guide explains how an external game can implement a "Return to GameBuddies" button that sends every player back to their original GameBuddies lobby.

The flow is powered by the V2 external API endpoints that ship with GameBuddies as of September 2025.

---

## 1. Prerequisites

1. **GameBuddies API key** – each partner game receives a `service_name` and an API key. Send the key in every request via the `X-API-Key` header.
2. **Room context** – when GameBuddies launches your game it includes query-string information (e.g. `room`, `playerId`, `name`, `isHost`). Persist the data locally – either in memory, session storage, or both. Example at launch:
   ```text
   https://yourgame.example/play?room=R8BDQK&playerId=a7c8...&name=test&isHost=true
   ```
3. **Session storage convention** – if you store data in `sessionStorage` please include, at minimum:
   ```js
   sessionStorage.setItem('gamebuddies_roomCode', roomCode);
   sessionStorage.setItem('gamebuddies_playerName', playerName);
   sessionStorage.setItem('gamebuddies_playerId', playerId);
   sessionStorage.setItem('gamebuddies_isHost', String(isHost));
   ```
   These keys allow GameBuddies to auto-fill the join modal when players return.

---

## 2. Triggering a Return to Lobby

When the host presses your "Return to GameBuddies" button, call the external return endpoint.

### Endpoint
```
POST https://gamebuddies.io/api/v2/external/return
Headers:
  Content-Type: application/json
  X-API-Key: <your-api-key>
```

### Request body
```json
{
  "roomCode": "R8BDQK",            // required
  "playerId": "a7c8…",            // optional, helps build session tokens
  "initiatedBy": "test",          // optional label (player or service)
  "reason": "Host pressed return",// optional description
  "returnAll": true,               // true = move everyone back to lobby
  "metadata": {                    // optional extra context stored with the event
    "gameName": "Der Dummste Fliegt",
    "matchId": "match-123"
  }
}
```

### Response (abbreviated)
```json
{
  "success": true,
  "roomCode": "R8BDQK",
  "returnUrl": "https://gamebuddies.io/lobby/R8BDQK?session=abc123",
  "sessionToken": "abc123",              // present when playerId was supplied
  "playersReturned": 6,
  "pendingReturn": true,
  "pollEndpoint": "/api/v2/rooms/R8BDQK/return-status"
}
```

Immediately redirect every connected player to `returnUrl`. If you control multiple browser tabs/windows, send the URL via your own messaging system so each client navigates.

### Persist the session token (optional but recommended)
Store the `sessionToken`, `returnUrl`, and player metadata so GameBuddies can auto-join without prompting for the player’s name:
```js
const sessionRecord = {
  roomCode,
  playerName,
  playerId,
  isHost,
  returnUrl,
  sessionToken,
  capturedAt: new Date().toISOString(),
  source: 'yourGameName'
};
sessionStorage.setItem('gamebuddies:return-session', JSON.stringify(sessionRecord));
```
When GameBuddies reloads, it reads this object to pre-fill the join modal or skip it entirely.

---

## 3. Optional: Polling and Heartbeats

If your game cannot redirect immediately (for example, you queue a countdown or let every client decide individually), you can poll to check whether the lobby is ready:

```
GET https://gamebuddies.io/api/v2/rooms/<roomCode>/return-status?playerId=<playerId>
Headers: X-API-Key
```

The response contains `shouldReturn`, `returnUrl`, and an optional `sessionToken`. Once `shouldReturn` is true, redirect to `returnUrl`.

You can also keep GameBuddies informed about connected players via the heartbeat endpoint:

```
POST https://gamebuddies.io/api/v2/external-heartbeat
```
```json
{
  "roomCode": "R8BDQK",
  "playerId": "a7c8…",
  "gameData": {
    "status": "in_match",
    "score": 12
  }
}
```
GameBuddies sets `pendingReturn=true` internally; your clients can stop gameplay when the heartbeat response indicates `"shouldReturn": true`.

---

## 4. Client-Side Button Example

```js
async function returnToGameBuddies() {
  const roomCode = sessionStorage.getItem('gamebuddies_roomCode');
  const playerId = sessionStorage.getItem('gamebuddies_playerId');
  const playerName = sessionStorage.getItem('gamebuddies_playerName');

  if (!roomCode) {
    console.error('Missing GameBuddies room code');
    return;
  }

  const body = {
    roomCode,
    playerId,
    initiatedBy: playerName || 'external_game',
    reason: 'Host pressed Return to GameBuddies',
    returnAll: true
  };

  const response = await fetch('https://gamebuddies.io/api/v2/external/return', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.GAMEBUDDIES_API_KEY
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    console.error('Return request failed', await response.text());
    return;
  }

  const payload = await response.json();
  const sessionToken = payload.sessionToken || null;

  const sessionRecord = {
    roomCode,
    playerName,
    playerId,
    isHost: (sessionStorage.getItem('gamebuddies_isHost') || '') === 'true',
    returnUrl: payload.returnUrl,
    sessionToken,
    capturedAt: new Date().toISOString(),
    source: 'yourGameName'
  };
  sessionStorage.setItem('gamebuddies:return-session', JSON.stringify(sessionRecord));

  window.location.href = payload.returnUrl;
}
```

Attach this function to your in-game "Return to GameBuddies" button.

---

## 5. Recommended UX Flow

1. **Detect launch context** – store the provided room/player information when the game loads.
2. **Enable the return button** only when you have a `roomCode`.
3. **When pressed**, call `POST /api/v2/external/return`, persist the returned data, and redirect.
4. **Fallback polling** – optionally poll `/return-status` if you must wait for asynchronous confirmation before redirecting.
5. **Session cleanup** – when the player leaves your game voluntarily, either send them back to GameBuddies or clear the stored keys so stale data does not linger.

Following these steps ensures every partner game delivers a consistent "Return to GameBuddies" experience and keeps the GameBuddies lobby in sync.
