# GameBuddies V2 - Optimized Lobby System Architecture

## Core Improvements

### 1. Centralized State Management
- **LobbyManager**: Centralized lobby state management
- **StatusSync**: Real-time player status synchronization
- **SessionManager**: Enhanced session persistence and recovery

### 2. Seamless Return Workflow
- **Universal Return**: Any player can return to lobby individually
- **Group Return**: Host can initiate group return
- **Auto-Recovery**: Automatic status sync on reconnection

### 3. Enhanced Real-time Synchronization
- **Status Broadcasting**: Instant status updates across all clients
- **Heartbeat System**: Automatic connection health monitoring
- **Conflict Resolution**: Handle multiple connections gracefully

## Architecture Components

### Server-Side Components

#### 1. LobbyManager (Enhanced)
```javascript
class LobbyManager {
  constructor(io, db, connectionManager) {
    this.io = io;
    this.db = db;
    this.connectionManager = connectionManager;
    this.roomStates = new Map(); // In-memory room state cache
    this.playerSessions = new Map(); // Player session tracking
  }

  // Core lobby operations
  async createRoom(hostId, gameType = 'lobby');
  async joinRoom(playerId, roomCode, playerName);
  async leaveRoom(playerId, roomCode, reason);
  async updatePlayerStatus(playerId, roomCode, status, location);
  async transferHost(currentHostId, newHostId, roomCode);
  
  // Enhanced status management
  async syncPlayerStatus(playerId, roomCode);
  async broadcastRoomUpdate(roomCode, eventType, data);
  async handlePlayerReturn(playerId, roomCode, fromGame);
  async initiateGroupReturn(hostId, roomCode);
}
```

#### 2. StatusSyncManager
```javascript
class StatusSyncManager {
  constructor(db, io) {
    this.db = db;
    this.io = io;
    this.statusQueue = new Map(); // Pending status updates
    this.heartbeats = new Map(); // Player heartbeat tracking
  }

  // Real-time status synchronization
  async updatePlayerLocation(playerId, location, metadata = {});
  async syncRoomStatus(roomCode);
  async handleHeartbeat(playerId, roomCode);
  async detectDisconnections();
  async reconcileStatusConflicts(playerId, serverStatus, clientStatus);
}
```

#### 3. Enhanced ConnectionManager
```javascript
class EnhancedConnectionManager extends ConnectionManager {
  // Add session recovery
  async recoverSession(socketId, sessionToken);
  async createSessionToken(playerId, roomCode);
  async validateSession(sessionToken);
  
  // Add multi-connection handling
  async handleMultipleConnections(playerId, newSocketId);
  async consolidateConnections(playerId);
  
  // Add status persistence
  async persistConnectionState(socketId);
  async restoreConnectionState(socketId);
}
```

### Client-Side Components

#### 1. Enhanced SocketContext
```javascript
const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [connectionState, setConnectionState] = useState('connecting');
  const [sessionToken, setSessionToken] = useState(null);
  const [playerStatus, setPlayerStatus] = useState({});
  const [roomState, setRoomState] = useState(null);

  // Enhanced connection management
  const connectWithRecovery = useCallback(async () => {
    // Attempt session recovery first
    const savedSession = localStorage.getItem('gamebuddies_session');
    if (savedSession) {
      await recoverSession(savedSession);
    } else {
      await createNewConnection();
    }
  }, []);

  // Auto-reconnection with exponential backoff
  const handleReconnection = useCallback((attempt = 1) => {
    const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
    setTimeout(() => connectWithRecovery(), delay);
  }, []);

  // Status synchronization
  const syncStatus = useCallback(async (status, location) => {
    if (socket && socket.connected) {
      socket.emit('updatePlayerStatus', { status, location });
    }
  }, [socket]);

  return (
    <SocketContext.Provider value={{
      socket,
      connectionState,
      playerStatus,
      roomState,
      syncStatus,
      reconnect: connectWithRecovery
    }}>
      {children}
    </SocketContext.Provider>
  );
};
```

#### 2. LobbyStateManager Hook
```javascript
export const useLobbyState = (roomCode) => {
  const { socket, roomState, syncStatus } = useSocket();
  const [localState, setLocalState] = useState({});
  const [isOptimistic, setIsOptimistic] = useState(false);

  // Optimistic updates with server reconciliation
  const updatePlayerStatus = useCallback(async (status, location) => {
    // Apply optimistic update
    setIsOptimistic(true);
    setLocalState(prev => ({
      ...prev,
      currentLocation: location,
      status: status
    }));

    // Send to server
    await syncStatus(status, location);
    
    // Server will send confirmation via room update
  }, [syncStatus]);

  // Handle server reconciliation
  useEffect(() => {
    if (roomState && isOptimistic) {
      setLocalState(roomState.playerState);
      setIsOptimistic(false);
    }
  }, [roomState, isOptimistic]);

  return {
    players: roomState?.players || [],
    roomStatus: roomState?.status || 'lobby',
    currentPlayer: localState,
    updatePlayerStatus,
    isOptimistic
  };
};
```

#### 3. Enhanced Return Component
```javascript
export const ReturnToLobbyButton = ({ style, className, children }) => {
  const { socket, playerStatus } = useSocket();
  const [isReturning, setIsReturning] = useState(false);

  const handleReturn = useCallback(async () => {
    if (!socket || isReturning) return;
    
    setIsReturning(true);
    
    try {
      // Update status immediately (optimistic)
      await updatePlayerStatus('returning', 'lobby');
      
      // Navigate back to GameBuddies
      const returnUrl = sessionStorage.getItem('gamebuddies_returnUrl') || 
                       window.location.origin;
      window.location.href = returnUrl;
      
    } catch (error) {
      console.error('Return failed:', error);
      setIsReturning(false);
    }
  }, [socket, isReturning]);

  // Show for any player in game
  if (playerStatus.currentLocation !== 'game') {
    return null;
  }

  return (
    <button
      onClick={handleReturn}
      disabled={isReturning}
      className={`return-to-lobby-btn ${className}`}
      style={style}
    >
      {isReturning ? 'Returning...' : children || '← Return to Lobby'}
    </button>
  );
};
```

## Enhanced API Endpoints

### 1. Game Status API V2
```javascript
// POST /api/v2/rooms/:roomCode/players/:playerId/status
{
  "status": "connected|disconnected|in_game|returning|lobby",
  "location": "game|lobby|disconnected",
  "metadata": {
    "gameData": {},
    "timestamp": "2024-01-01T00:00:00Z",
    "reason": "Player action description"
  },
  "syncSession": true // Request session sync
}

// Response includes reconciliation data
{
  "success": true,
  "updated": { ... },
  "conflicts": [], // Any status conflicts detected
  "sessionToken": "new_token_if_refreshed"
}
```

### 2. Bulk Status Update V2
```javascript
// POST /api/v2/rooms/:roomCode/bulk-status
{
  "reason": "Bulk update reason",
  "players": [...],
  "gameState": {
    "ended": true,
    "result": {...}
  },
  "returnToLobby": true // Automatically return all players
}
```

### 3. Session Recovery API
```javascript
// POST /api/v2/sessions/recover
{
  "sessionToken": "player_session_token",
  "socketId": "new_socket_id"
}

// Response
{
  "success": true,
  "playerState": {...},
  "roomState": {...},
  "newSessionToken": "refreshed_token"
}
```

## Database Schema Enhancements

### 1. Player Sessions Table
```sql
CREATE TABLE player_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  room_id UUID REFERENCES rooms(id),
  session_token VARCHAR NOT NULL UNIQUE,
  socket_id VARCHAR,
  status VARCHAR NOT NULL DEFAULT 'active',
  last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours')
);
```

### 2. Status History Table
```sql
CREATE TABLE player_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  room_id UUID NOT NULL REFERENCES rooms(id),
  old_location VARCHAR,
  new_location VARCHAR NOT NULL,
  old_status VARCHAR,
  new_status VARCHAR NOT NULL,
  reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Implementation Flow

### 1. Player Journey - Optimized
```
1. Player joins lobby → Session created + Status sync
2. Game selection → Status: 'ready'
3. Game start → Status: 'in_game', Location: 'game'
4. In external game → Heartbeat monitoring + Status API calls
5. Player returns → Individual return OR group return
6. Back in lobby → Status: 'lobby', Location: 'lobby'
7. Session persists → Can rejoin if disconnected
```

### 2. Return Workflow - Enhanced
```
Individual Return:
- Player clicks return button
- Status update: returning → lobby
- Redirect to GameBuddies
- Auto-rejoin room with preserved session

Group Return (Host):
- Host initiates group return
- All players get return signal
- Batch status update
- All players redirect
- Room status: returning → lobby
```

### 3. Status Synchronization
```
Real-time Sync:
- Player status changes → Immediate broadcast
- Heartbeat every 30s → Health monitoring
- Conflict detection → Auto-reconciliation
- Session recovery → Seamless reconnection
```

## Benefits of V2 Architecture

1. **Reliability**: Session recovery and conflict resolution
2. **Performance**: Optimistic updates and efficient state sync
3. **Scalability**: Centralized state management
4. **User Experience**: Seamless transitions and instant updates
5. **Maintainability**: Clear separation of concerns
6. **Flexibility**: Support for multiple return patterns

This architecture ensures robust, scalable, and user-friendly lobby management with seamless game transitions.