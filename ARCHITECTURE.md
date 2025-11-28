# Gamebuddies.Io Architecture Documentation

**Last Updated:** 2025-11-28

This document provides a comprehensive overview of the Gamebuddies.Io platform architecture, including system flow, component relationships, socket events, and API endpoints.

---

## Table of Contents
1. [System Flow Chart](#system-flow-chart)
2. [Page Routes](#page-routes)
3. [React Contexts](#react-contexts)
4. [Custom Hooks](#custom-hooks)
5. [Socket Events](#socket-events)
6. [API Endpoints](#api-endpoints)
7. [Database Tables](#database-tables)
8. [External Game Integration](#external-game-integration)

---

## System Flow Chart

```
                                    GAMEBUDDIES.IO SYSTEM FLOW
=====================================================================================================

                                    +-------------------------+
                                    |      USER ARRIVES       |
                                    |   (gamebuddies.io)      |
                                    +-----------+-------------+
                                                |
                            +-------------------+-------------------+
                            v                   v                   v
                    +---------------+   +---------------+   +---------------+
                    |  LOGIN PAGE   |   |   HOME PAGE   |   |  GUEST MODE   |
                    | /login        |   |  / (landing)  |   |  (no auth)    |
                    +-------+-------+   +-------+-------+   +-------+-------+
                            |                   |                   |
                +-----------+-----------+       |                   |
                v                       v       |                   |
        +---------------+       +---------------+                   |
        | Discord OAuth |       | Google OAuth  |                   |
        +-------+-------+       +-------+-------+                   |
                |                       |                           |
                +-----------+-----------+                           |
                            v                                       |
                    +---------------+                               |
                    | /auth/callback|                               |
                    | Sync to DB    |                               |
                    +-------+-------+                               |
                            |                                       |
                            +------------------+--------------------+
                                               v
                                    +-------------------------+
                                    |       HOME PAGE         |
                                    |  - View Games           |
                                    |  - Browse Rooms         |
                                    |  - Friend List (auth)   |
                                    |  - Achievement Bell     |
                                    +-----------+-------------+
                                                |
                    +---------------------------+---------------------------+
                    v                           v                           v
            +---------------+           +---------------+           +---------------+
            |  CREATE ROOM  |           |   JOIN ROOM   |           |  BROWSE ROOMS |
            |    (modal)    |           |    (modal)    |           |    (modal)    |
            | - Room name   |           | - Enter code  |           | - Filter list |
            | - Public/Priv |           | - Player name |           | - Select room |
            | - Streamer    |           +-------+-------+           +-------+-------+
            +-------+-------+                   |                           |
                    |                           +-----------+---------------+
                    |                                       |
                    |     +------- Socket: ROOM.CREATE -----+
                    |     |        Socket: ROOM.JOIN -------+
                    v     v
            +---------------------------------------------------------------------+
            |                          ROOM LOBBY                                 |
            |  /lobby/:roomCode                                                   |
            |  +-------------------------------------------------------------+   |
            |  | Components:                                                  |   |
            |  |  - Player List (with avatars, ready status, host badge)     |   |
            |  |  - Chat Window (socket-driven real-time)                    |   |
            |  |  - Game Picker (host only)                                  |   |
            |  |  - Ready Toggle Button                                      |   |
            |  |  - Tug of War Minigame (optional waiting game)              |   |
            |  |  - Invite Friends Panel                                     |   |
            |  +-------------------------------------------------------------+   |
            |                                                                     |
            |  Socket Events Listened:                                            |
            |   - PLAYER.JOINED, PLAYER.LEFT, PLAYER.DISCONNECTED                |
            |   - PLAYER.READY_CHANGED, HOST.TRANSFERRED                         |
            |   - GAME.SELECTED, GAME.STARTED                                    |
            |   - CHAT.MESSAGE, ERROR                                            |
            +-------------------------+-------------------------------------------+
                                      |
                                      | Host clicks "Start Game"
                                      | Socket: GAME.START
                                      v
            +---------------------------------------------------------------------+
            |                      GAME STARTED                                   |
            |  Server creates session tokens for each player                      |
            |  Emits GAME.STARTED with gameUrl                                    |
            +-------------------------+-------------------------------------------+
                                      |
                    +-----------------+-----------------+
                    v                                   v
            +---------------+                   +---------------+
            |  INTERNAL     |                   |  EXTERNAL     |
            |  GAME         |                   |  GAME         |
            |  (iframe)     |                   |  (new tab)    |
            |               |                   |               |
            | GameWrapper   |                   | Opens game URL|
            | component     |                   | with session  |
            |               |                   | token param   |
            +-------+-------+                   +-------+-------+
                    |                                   |
                    |           Game Server API         |
                    |     +-----------------------------+
                    |     |
                    |     |  GET /api/game-sessions/:token
                    |     |  -> Returns: roomCode, playerId, isHost, etc.
                    |     |
                    |     |  POST /api/v2/game/rooms/:roomCode/bulk-status
                    |     |  -> Updates player locations to "game"
                    |     |
                    |     |  POST /api/v2/game/progress/event
                    |     |  -> Reports XP gains, triggers achievements
                    |     |
                    |     |  POST /api/v2/game/rooms/:roomCode/game-end
                    |     |  -> Ends game, calculates results
                    |     |
                    +-----+-----------------------------+
                                      |
                                      | Game ends / Player returns
                                      v
            +---------------------------------------------------------------------+
            |                     RETURN TO LOBBY                                 |
            |  Socket: server:return-to-gb OR playerReturnToLobby                 |
            |  Player status updated to "lobby"                                   |
            |  Room status may change to "finished" or back to "selecting"        |
            +---------------------------------------------------------------------+

=====================================================================================================
                                    PARALLEL SYSTEMS
=====================================================================================================

    +--------------------------------------------------------------------------------+
    |                              FRIEND SYSTEM                                      |
    |                                                                                 |
    |  FriendContext (global state)                                                  |
    |   |                                                                            |
    |   +-> On login: GET /api/friends -> Load friends list                          |
    |   +-> On login: GET /api/friends/pending -> Load pending requests              |
    |   +-> Socket: USER.IDENTIFY -> Server tracks user as online                    |
    |   |                                                                            |
    |   +-> SERVER_EVENTS.FRIEND.LIST_ONLINE -> Initial online friends list          |
    |   +-> SERVER_EVENTS.FRIEND.ONLINE -> Friend came online                        |
    |   +-> SERVER_EVENTS.FRIEND.OFFLINE -> Friend went offline                      |
    |   |                                                                            |
    |   +-> POST /api/friends/request -> Send friend request                         |
    |   +-> PUT /api/friends/:id/accept -> Accept request -> triggers achievement    |
    |   +-> DELETE /api/friends/:id -> Remove friend                                 |
    |   |                                                                            |
    |   +-> GAME.INVITE -> Invite friend to current room                             |
    |       +-> SERVER_EVENTS.GAME.INVITE_RECEIVED -> Toast notification             |
    |                                                                                 |
    +--------------------------------------------------------------------------------+

    +--------------------------------------------------------------------------------+
    |                           ACHIEVEMENT SYSTEM                                    |
    |                                                                                 |
    |  Achievement Triggers:                                                          |
    |   |                                                                            |
    |   +-> Game completed -> POST /api/v2/game/progress/event -> checkAchievements  |
    |   +-> Friend added -> Accept friend request -> checkAchievements               |
    |   +-> Room hosted -> createRoom -> checkAchievements                           |
    |   +-> XP milestone -> Level up -> checkAchievements                            |
    |   |                                                                            |
    |   +-> /api/achievements/me -> Auto-grants eligible (catch-up on page load)     |
    |   |   +-> Returns newly_unlocked[] -> showAchievementUnlocks()                 |
    |   |                                                                            |
    |   +-> Socket: ACHIEVEMENT.UNLOCKED -> useAchievementNotifications hook         |
    |       +-> Shows toast + refreshUser() to update header XP/level                |
    |                                                                                 |
    |  Achievement Categories:                                                        |
    |   - games_played (1, 10, 50, 100 games)                                        |
    |   - wins (1, 10, 50 wins + streaks)                                            |
    |   - social (1, 5, 10, 25 friends + hosting)                                    |
    |   - progression (levels, XP milestones)                                        |
    |   - premium (subscriber achievements)                                          |
    |   - special (easter eggs, codes)                                               |
    |                                                                                 |
    +--------------------------------------------------------------------------------+

    +--------------------------------------------------------------------------------+
    |                              XP & LEVELING SYSTEM                               |
    |                                                                                 |
    |  XP Sources:                                                                    |
    |   - Game completion: Base XP per game                                          |
    |   - Game win: Bonus XP                                                         |
    |   - Achievements: XP reward per achievement                                    |
    |   - Friend added: Small XP bonus                                               |
    |                                                                                 |
    |  Level Curve:                                                                   |
    |   - Level 1: 0 XP      - Level 6: 1500 XP                                      |
    |   - Level 2: 100 XP    - Level 7: 2200 XP                                      |
    |   - Level 3: 300 XP    - Level 8: 3000 XP                                      |
    |   - Level 4: 600 XP    - Level 9: 4000 XP                                      |
    |   - Level 5: 1000 XP   - Level 10: 5500 XP (and beyond)                        |
    |                                                                                 |
    |  Real-time Updates:                                                             |
    |   - Socket: XP.UPDATED -> useXpUpdates hook -> updateUserStats()               |
    |   - Header XP bar updates immediately                                          |
    |                                                                                 |
    +--------------------------------------------------------------------------------+
```

---

## Page Routes

| Route | Page Component | Auth Required | Description |
|-------|----------------|---------------|-------------|
| `/` | HomePage | No | Landing page with games list, room creation |
| `/lobby/:roomCode` | HomePage (RoomLobby) | No | Game lobby with players, chat |
| `/login` | LoginPage | No | OAuth (Discord/Google) + Email login |
| `/auth/callback` | AuthCallback | No | OAuth redirect handler |
| `/account` | Account | Yes | User profile, avatar, subscription |
| `/achievements` | Achievements | Yes | User's achievement gallery |
| `/achievements/:userId` | Achievements | No | Public achievement profile |
| `/premium` | Premium | No | Subscription tier info |
| `/admin/dashboard` | AdminDashboard | Admin | Admin statistics |
| `/admin/affiliates` | AdminAffiliates | Admin | Affiliate program management |
| `/password-reset` | PasswordReset | No | Password reset flow |
| `/payment/success` | PaymentSuccess | No | Stripe success page |
| `/payment/cancel` | PaymentCancel | No | Stripe cancel page |
| `/legal`, `/privacy`, `/terms` | Legal pages | No | Legal documents |

---

## React Contexts

### AuthContext
**File:** `client/src/contexts/AuthContext.tsx`

| State | Type | Description |
|-------|------|-------------|
| `user` | User | null | Current authenticated user |
| `session` | Session | null | Supabase auth session |
| `loading` | boolean | Auth initialization state |
| `isAuthenticated` | boolean | Has valid session |
| `isPremium` | boolean | premium_tier !== 'free' |

| Function | Description |
|----------|-------------|
| `signOut()` | Signs out and clears localStorage |
| `refreshUser()` | Refetches user data from API |
| `updateUserStats()` | Updates XP/level/points immediately |

### LazySocketProvider
**File:** `client/src/contexts/LazySocketContext.tsx`

| State | Type | Description |
|-------|------|-------------|
| `socket` | Socket | null | Socket.IO client instance |
| `isConnected` | boolean | Connection state |
| `lastRoom` | RoomInfo | null | Stored room for auto-rejoin |

| Function | Description |
|----------|-------------|
| `connectSocket()` | Initializes socket connection |
| `disconnectSocket()` | Graceful disconnect |
| `connectForUser(userId)` | Connect + identify user |
| `identifyUser(userId)` | Emit USER.IDENTIFY event |

### FriendContext
**File:** `client/src/contexts/FriendContext.tsx`

| State | Type | Description |
|-------|------|-------------|
| `friends` | Friend[] | Accepted friends list |
| `pendingRequests` | Request[] | Incoming/outgoing requests |
| `onlineFriends` | Set<string> | Online user IDs |
| `gameInvites` | Invite[] | Received game invitations |

| Function | Description |
|----------|-------------|
| `sendFriendRequest(username)` | Send friend request |
| `acceptFriendRequest(id)` | Accept request |
| `removeFriend(id)` | Remove friend |
| `inviteFriend(friendId, roomId, gameName)` | Send game invite |

### NotificationContext
**File:** `client/src/contexts/NotificationContext.tsx`

| State | Type | Description |
|-------|------|-------------|
| `notifications` | Notification[] | Active notifications (max 3) |

| Function | Description |
|----------|-------------|
| `addNotification(message, type, duration)` | Add notification |
| `removeNotification(id)` | Remove by ID |
| `clearAll()` | Clear all notifications |

---

## Custom Hooks

### useAchievementNotifications
**File:** `client/src/hooks/useAchievementNotifications.ts`

Listens for `ACHIEVEMENT.UNLOCKED` socket events and displays toast notifications. Calls `refreshUser()` to update header stats.

### useXpUpdates
**File:** `client/src/hooks/useXpUpdates.ts`

Listens for `XP.UPDATED` socket events and updates AuthContext immediately for real-time header XP display.

### useLobbyState
**File:** `client/src/hooks/useLobbyState.ts`

Manages lobby room state, players, and game status. Provides optimistic updates with 5-second timeout.

### useAvatars
**File:** `client/src/hooks/useAvatars.ts`

Fetches and caches available avatar options from `/api/avatars`.

### useFocusTrap
**File:** `client/src/hooks/useFocusTrap.ts`

Traps keyboard focus within modal/dialog components for accessibility.

---

## Socket Events

### Client to Server (SOCKET_EVENTS)

| Event | Payload | Description |
|-------|---------|-------------|
| `USER.IDENTIFY` | `{ userId }` | Identify authenticated user |
| `ROOM.CREATE` | `{ playerName, gameType?, maxPlayers?, isPublic? }` | Create new room |
| `ROOM.JOIN` | `{ roomCode, playerName, supabaseUserId? }` | Join existing room |
| `ROOM.LEAVE` | `{ roomCode }` | Leave room |
| `GAME.SELECT` | `{ gameType, settings? }` | Host selects game |
| `GAME.START` | `{ roomCode }` | Start the game |
| `GAME.INVITE` | `{ targetUserId, roomCode, gameName?, gameThumbnail? }` | Invite friend |
| `PLAYER.TOGGLE_READY` | `{ roomCode }` | Toggle ready status |
| `PLAYER.TRANSFER_HOST` | `{ roomCode, targetPlayerId }` | Transfer host role |
| `PLAYER.KICK` | `{ roomCode, targetPlayerId, reason? }` | Kick player |
| `CHAT.MESSAGE` | `{ message, playerName }` | Send chat message |
| `CONNECTION.HEARTBEAT` | `{}` | Keep-alive ping |

### Server to Client (SERVER_EVENTS)

| Event | Payload | Description |
|-------|---------|-------------|
| `ROOM.CREATED` | `{ roomCode, isHost, room }` | Room created |
| `ROOM.JOINED` | `{ roomCode, isHost, players, room, roomVersion }` | Joined room |
| `PLAYER.JOINED` | `{ player, players, room, roomVersion }` | Player joined |
| `PLAYER.LEFT` | `{ playerId, playerName, players, room, roomVersion }` | Player left |
| `PLAYER.DISCONNECTED` | `{ playerId, playerName, ... }` | Player disconnected |
| `PLAYER.READY_CHANGED` | `{ playerId, isReady, ... }` | Ready status changed |
| `PLAYER.KICKED` | `{ reason, kickedBy, ... }` | Player was kicked |
| `HOST.TRANSFERRED` | `{ oldHostId, newHostId, newHostName, reason }` | Host transferred |
| `GAME.SELECTED` | `{ gameType, settings, roomVersion }` | Game selected |
| `GAME.STARTED` | `{ gameUrl, gameType, isHost, roomCode }` | Game started |
| `GAME.INVITE_RECEIVED` | `{ fromUserId, roomCode, gameName, ... }` | Game invite |
| `FRIEND.LIST_ONLINE` | `{ onlineUserIds }` | Initial online list |
| `FRIEND.ONLINE` | `{ userId }` | Friend came online |
| `FRIEND.OFFLINE` | `{ userId }` | Friend went offline |
| `FRIEND.REQUEST_RECEIVED` | `{ ... }` | New friend request |
| `FRIEND.ACCEPTED` | `{ ... }` | Request accepted |
| `ACHIEVEMENT.UNLOCKED` | `{ userId, achievements[] }` | Achievement unlocked |
| `XP.UPDATED` | `{ userId, xp, level, achievement_points, xp_gained?, source? }` | XP updated |
| `CHAT.MESSAGE` | `{ playerName, message, timestamp, type }` | Chat message |
| `ERROR` | `{ message, code?, debug? }` | Error occurred |

---

## API Endpoints

### Authentication & Users
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/sync-user` | Yes | Sync Supabase user to database |
| GET | `/api/users/:userId` | Yes | Get user profile |
| PUT | `/api/users/avatar` | Yes | Update avatar |
| GET | `/api/supabase-config` | No | Get Supabase public config |

### Friends
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/friends` | Yes | Get friends list |
| GET | `/api/friends/pending` | Yes | Get pending requests |
| POST | `/api/friends/request` | Yes | Send friend request |
| PUT | `/api/friends/:id/accept` | Yes | Accept request |
| DELETE | `/api/friends/:id` | Yes | Remove friend/reject |

### Achievements
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/achievements` | No | Get all achievements |
| GET | `/api/achievements/me` | Yes | Get user's achievements (auto-grants) |
| GET | `/api/achievements/user/:userId` | No | Get user's public achievements |
| GET | `/api/achievements/unseen` | Yes | Get unseen achievements |
| POST | `/api/achievements/:id/seen` | Yes | Mark as seen |
| POST | `/api/achievements/redeem` | Yes | Redeem code |

### Games & Rooms
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/games` | No | Get available games |
| GET | `/api/rooms` | No | Browse public rooms |
| GET | `/api/game-sessions/:token` | No | Lookup session token |

### Game API V2 (External Games)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v2/game/rooms/:roomCode/validate` | API Key | Validate room access |
| POST | `/api/v2/game/rooms/:roomCode/bulk-status` | API Key | Update player statuses |
| POST | `/api/v2/game/rooms/:roomCode/game-end` | API Key | End game, report results |
| POST | `/api/v2/game/progress/event` | API Key | Report XP/achievement events |
| GET | `/api/v2/game/health` | No | Health check |

### Stripe/Payments
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/stripe/checkout` | Yes | Create checkout session |
| GET | `/api/stripe/customer-portal` | Yes | Get portal link |
| POST | `/api/stripe/webhook` | No | Webhook handler |

### Admin
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/dashboard-stats` | Admin | Dashboard statistics |
| GET | `/api/admin/affiliates` | Admin | Affiliate data |

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `users` | User profiles, auth, XP, level, premium tier |
| `rooms` | Room state, host, game settings, status |
| `room_members` | Players in rooms, role, location, ready state |
| `game_sessions` | Session tokens for external games |
| `game_states` | Game state snapshots per room |
| `friendships` | Friend relationships (pending/accepted/blocked) |
| `user_achievements` | User achievement progress and unlocks |
| `achievements` | Achievement definitions |
| `games` | Game catalog (active, external, proxy URLs) |
| `room_invites` | Streamer mode invite links |
| `events` | Event logging (room creation, game start, etc.) |

---

## External Game Integration

### Session Token Flow

1. **GameBuddies starts game:**
   - Server creates session token in `game_sessions` table
   - Opens game URL with `?session=TOKEN&role=gm`

2. **External game validates:**
   ```
   GET /api/game-sessions/:token
   Response: { roomCode, playerId, isHost, playerName, premiumTier, streamerMode }
   ```

3. **Game reports status:**
   ```
   POST /api/v2/game/rooms/:roomCode/bulk-status
   Body: { updates: [{ playerId, location: 'game', gameData: {...} }] }
   ```

4. **Game reports XP/achievements:**
   ```
   POST /api/v2/game/progress/event
   Body: { userId, event_type: 'game_completed', xp_amount: 50, won: true }
   ```

5. **Game ends:**
   ```
   POST /api/v2/game/rooms/:roomCode/game-end
   Body: { results: { playerId: score, ... } }
   ```

---

## Component Hierarchy

```
App.tsx (root)
+-- Header (user profile, nav, XP display)
|   +-- NotificationBell (achievement notifications)
+-- Routes
|   +-- HomePage
|   |   +-- GameCard (game list)
|   |   +-- CreateRoom (modal)
|   |   +-- JoinRoom (modal)
|   |   +-- BrowseRooms (modal)
|   |   +-- RoomLobby (when joined)
|   |       +-- PlayerList / Avatar
|   |       +-- ChatWindow
|   |       +-- GamePicker
|   |       +-- ProfileModal / ProfileSettingsModal
|   |       +-- TugOfWar (minigame)
|   +-- LoginPage
|   +-- Account
|   +-- Achievements
|   +-- Premium
|   +-- AdminDashboard (admin-only)
|   +-- AdminAffiliates (admin-only)
+-- FriendList (side panel)
+-- GameInviteToast
+-- AchievementUnlockToast
+-- Notification
+-- NotificationPoller
+-- MobileBottomNav
+-- Footer
```

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2025-11-28 | 1.0 | Initial architecture documentation |
