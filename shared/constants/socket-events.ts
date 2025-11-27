// ============ CLIENT TO SERVER EVENTS ============
// Events that the client sends to the server

export const SOCKET_EVENTS = {
  // Room Management
  ROOM: {
    CREATE: 'createRoom',
    JOIN: 'joinRoom',
    LEAVE: 'leaveRoom',
    JOIN_SOCKET: 'joinSocketRoom',
    GET_PUBLIC: 'getPublicRooms',
  },

  // Game Control
  GAME: {
    SELECT: 'selectGame',
    START: 'startGame',
    INVITE: 'game:invite',
  },

  // Player Management
  PLAYER: {
    RETURN_TO_LOBBY: 'playerReturnToLobby',
    TRANSFER_HOST: 'transferHost',
    KICK: 'kickPlayer',
    PROFILE_UPDATED: 'profile_updated',
    TOGGLE_READY: 'player:toggleReady',
  },

  // Room Status
  STATUS: {
    CHANGE: 'changeRoomStatus',
    AUTO_UPDATE: 'autoUpdateRoomStatus',
  },

  // Chat & Social
  CHAT: {
    MESSAGE: 'chat:message',
  },

  // User Identity
  USER: {
    IDENTIFY: 'user:identify',
  },

  // Connection
  CONNECTION: {
    HEARTBEAT: 'heartbeat',
  },

  // Minigames
  MINIGAME: {
    CLICK: 'minigame:click',
    TUG_PULL: 'tugOfWar:pull',
  },
} as const;

// ============ SERVER TO CLIENT EVENTS ============
// Events that the server sends to the client

export const SERVER_EVENTS = {
  // Room Events
  ROOM: {
    CREATED: 'roomCreated',
    JOINED: 'roomJoined',
    STATUS_CHANGED: 'roomStatusChanged',
    PUBLIC_LIST: 'publicRoomsList',
  },

  // Player Events
  PLAYER: {
    JOINED: 'playerJoined',
    LEFT: 'playerLeft',
    DISCONNECTED: 'playerDisconnected',
    STATUS_UPDATED: 'playerStatusUpdated',
    KICKED: 'playerKicked',
    KICK_FAILED: 'kickFailed',
    READY_CHANGED: 'player:readyChanged',
  },

  // Host Events
  HOST: {
    TRANSFERRED: 'hostTransferred',
  },

  // Game Events
  GAME: {
    SELECTED: 'gameSelected',
    STARTED: 'gameStarted',
    INVITE_RECEIVED: 'game:invite_received',
  },

  // Friend Events
  FRIEND: {
    LIST_ONLINE: 'friend:list-online',
    ONLINE: 'friend:online',
    OFFLINE: 'friend:offline',
    REQUEST_RECEIVED: 'friend:request_received',
    ACCEPTED: 'friend:accepted',
  },

  // Achievement Events
  ACHIEVEMENT: {
    UNLOCKED: 'achievement:unlocked',
    PROGRESS: 'achievement:progress',
  },

  // Chat Events
  CHAT: {
    MESSAGE: 'chat:message',
  },

  // Minigame Events
  MINIGAME: {
    LEADERBOARD_UPDATE: 'minigame:leaderboard-update',
    TUG_UPDATE: 'tugOfWar:update',
    TUG_YOUR_TEAM: 'tugOfWar:yourTeam',
  },

  // Error Events
  ERROR: 'error',

  // Status Sync
  STATUS: {
    SYNC: 'roomStatusSync',
    CONFLICT_RESOLVED: 'statusConflictResolved',
  },

  // Server Commands
  SERVER: {
    RETURN_TO_GB: 'server:return-to-gb',
  },
} as const;
