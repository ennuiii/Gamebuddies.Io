# GameBuddies V2 Upgrade - Maintainer Action Items

This document outlines all manual steps and configuration changes required to upgrade GameBuddies from V1 to V2 with the optimized lobby system and seamless return functionality.

## 🚨 IMPORTANT: Pre-Upgrade Checklist

- [ ] **Backup Database**: Create a full backup of your production database
- [ ] **Test Environment**: Deploy to staging/test environment first
- [ ] **Downtime Planning**: Schedule maintenance window (estimated 30-60 minutes)
- [ ] **API Key Update**: Notify external games of new V2 API endpoints

## 📋 Upgrade Steps

### 1. Database Migration

**Priority: CRITICAL - Must be done first**

```bash
# Run the V2 database migration
psql -d your_gamebuddies_db -f server/migrations/001_add_v2_tables.sql

# Verify migration was successful
psql -d your_gamebuddies_db -c "SELECT * FROM player_sessions LIMIT 1;"
psql -d your_gamebuddies_db -c "SELECT * FROM player_status_history LIMIT 1;"
```

**Expected Result**: New tables created with proper indexes and constraints.

**Rollback Plan**: Keep the original schema backup to restore if needed.

### 2. Environment Variables

**Add these new environment variables to your `.env` file:**

```env
# V2 Features
GAMEBUDDIES_VERSION=2.0
ENABLE_SESSION_RECOVERY=true
ENABLE_STATUS_SYNC=true
HEARTBEAT_INTERVAL=30000
SESSION_TIMEOUT=86400000

# Enhanced CORS for V2 API
CORS_ORIGINS=http://localhost:3000,https://gamebuddies.io,https://gamebuddies-client.onrender.com,https://ddf-game.onrender.com,https://schoolquizgame.onrender.com

# Rate Limiting
RATE_LIMIT_STATUS_UPDATES=100
RATE_LIMIT_BULK_UPDATES=10
RATE_LIMIT_HEARTBEATS=200

# Monitoring (optional)
ENABLE_CONNECTION_METRICS=true
METRICS_RETENTION_DAYS=7
```

### 3. Server Code Updates

**Update `server/index.js` to integrate V2 components:**

```javascript
// Add these imports at the top
const LobbyManager = require('./lib/lobbyManager');
const StatusSyncManager = require('./lib/statusSyncManager');
const EnhancedConnectionManager = require('./lib/enhancedConnectionManager');
const gameApiV2 = require('./routes/gameApiV2');

// Replace existing ConnectionManager
const connectionManager = new EnhancedConnectionManager();

// Initialize V2 managers
const lobbyManager = new LobbyManager(io, db, connectionManager);
const statusSyncManager = new StatusSyncManager(db, io, lobbyManager);

// Add V2 API routes
app.use('/api/v2/game', gameApiV2(io, db, connectionManager));

// Add enhanced socket handlers (add to existing socket.io setup)
io.on('connection', (socket) => {
  // Existing handlers...

  // V2 Enhanced handlers
  socket.on('updatePlayerStatus', async (data) => {
    try {
      const connection = connectionManager.getConnection(socket.id);
      if (!connection || !connection.userId || !connection.roomCode) return;

      await statusSyncManager.updatePlayerLocation(
        connection.userId,
        connection.roomCode, 
        data.location,
        data.metadata
      );
    } catch (error) {
      console.error('Status update failed:', error);
      socket.emit('error', { message: 'Status update failed' });
    }
  });

  socket.on('heartbeat', async (data) => {
    try {
      await statusSyncManager.handleHeartbeat(
        data.playerId,
        data.roomCode,
        socket.id,
        { timestamp: data.timestamp, currentLocation: data.currentLocation }
      );
      socket.emit('heartbeatAck', { nextHeartbeat: 30000 });
    } catch (error) {
      console.error('Heartbeat failed:', error);
    }
  });

  socket.on('initiateGroupReturn', async (data) => {
    try {
      const connection = connectionManager.getConnection(socket.id);
      if (!connection) return;

      await lobbyManager.initiateGroupReturn(connection.userId, data.roomCode);
    } catch (error) {
      console.error('Group return failed:', error);
      socket.emit('error', { message: 'Group return failed' });
    }
  });
});
```

### 4. Client-Side Updates

**Update main React app to use V2 components:**

```javascript
// In your main App.js, replace SocketContext
import SocketProvider from './contexts/EnhancedSocketContext';

// Wrap your app
function App() {
  return (
    <SocketProvider>
      {/* Your existing app content */}
    </SocketProvider>
  );
}
```

**Add return button to external games:**

For each external game, add the enhanced return button:

```javascript
// In your game's main component
import EnhancedReturnButton from 'path/to/EnhancedReturnButton';

function GameComponent() {
  return (
    <div>
      {/* Your game content */}
      <EnhancedReturnButton 
        position="top-left"
        showForAllPlayers={true}
      />
    </div>
  );
}
```

### 5. External Game Integration Updates

**For DDF Game:**
- [ ] Update integration to use V2 API endpoints
- [ ] Implement enhanced status reporting
- [ ] Add session recovery support
- [ ] Update return button component

**API Endpoint Changes:**
```javascript
// OLD V1 API
POST /api/game/rooms/{roomCode}/players/{playerId}/status

// NEW V2 API  
POST /api/v2/game/rooms/{roomCode}/players/{playerId}/status

// Enhanced payload
{
  "status": "in_game",
  "location": "game", 
  "metadata": {
    "gamePhase": "playing",
    "timestamp": "2024-01-01T00:00:00Z"
  },
  "syncSession": true
}
```

### 6. Package Dependencies

**Add new dependencies to `package.json`:**

```json
{
  "dependencies": {
    "crypto": "^1.0.1"
  }
}
```

Run `npm install` after updating.

### 7. Nginx Configuration (if applicable)

**Update nginx config for V2 API routes:**

```nginx
location /api/v2/ {
    proxy_pass http://your_gamebuddies_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_cache_bypass $http_upgrade;
}
```

### 8. Monitoring Setup

**Add monitoring for V2 features:**

```javascript
// Add to your monitoring/health check endpoint
app.get('/health/v2', (req, res) => {
  const stats = connectionManager.getEnhancedStats();
  const lobbyStats = {
    activeRooms: lobbyManager.roomStates.size,
    activeSessions: statusSyncManager.heartbeats.size
  };
  
  res.json({
    version: '2.0',
    status: 'healthy',
    connections: stats,
    lobby: lobbyStats,
    timestamp: new Date().toISOString()
  });
});
```

## 🧪 Testing Procedures

### 1. Database Migration Testing

```bash
# Test session creation
curl -X POST "https://your-domain/api/v2/game/rooms/ABC123/validate" \
  -H "X-API-Key: your_api_key" \
  -H "Content-Type: application/json"

# Verify response includes sessionInfo field
```

### 2. Status Sync Testing

```bash
# Test enhanced status update
curl -X POST "https://your-domain/api/v2/game/rooms/ABC123/players/user123/status" \
  -H "X-API-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "in_game",
    "location": "game",
    "metadata": {"test": true},
    "syncSession": true
  }'

# Expected: 200 response with sessionToken
```

### 3. Return Functionality Testing

1. **Individual Return**: Player clicks return button → redirected to lobby
2. **Group Return**: Host initiates → all players redirected
3. **Status Persistence**: Player disconnects and reconnects → status preserved

### 4. Load Testing

**Test with multiple concurrent users:**
- 50 concurrent socket connections
- Status updates every 10 seconds
- Room joins/leaves
- Return workflow under load

## 🔧 Troubleshooting

### Common Issues

**1. Migration Fails**
```bash
# Check database permissions
psql -d your_db -c "\dt+"
# Ensure user has CREATE TABLE permissions
```

**2. Socket Connections Fail**
```bash
# Check CORS configuration
# Verify WebSocket proxy settings in nginx/load balancer
```

**3. Session Recovery Not Working**
```bash
# Check Redis/database connectivity
# Verify session table has correct indexes
```

**4. Status Updates Delayed**
```bash
# Check rate limiting settings
# Monitor connection pool size
# Verify real-time subscription setup
```

### Rollback Procedure

**If upgrade fails, rollback steps:**

1. **Database Rollback**:
   ```bash
   # Restore from backup
   pg_restore -d your_db your_backup.sql
   ```

2. **Code Rollback**:
   ```bash
   git checkout previous_stable_tag
   npm install
   pm2 restart gamebuddies
   ```

3. **Environment Rollback**:
   - Remove V2 environment variables
   - Restore original CORS settings

## 📊 Post-Upgrade Verification

**Check these metrics after upgrade:**

- [ ] Database tables created: `player_sessions`, `player_status_history`
- [ ] V2 API endpoints responding: `/api/v2/game/health`
- [ ] Socket connections stable: Monitor connection count
- [ ] Status sync working: Test player location updates
- [ ] Return functionality: Test individual and group return
- [ ] Session recovery: Test reconnection after disconnect
- [ ] Performance: Response times under 100ms for API calls

## 📞 Support

**If you encounter issues:**

1. Check logs: `pm2 logs gamebuddies`
2. Monitor database: `psql -d your_db -c "SELECT * FROM connection_metrics ORDER BY created_at DESC LIMIT 10;"`
3. Verify API: `curl https://your-domain/api/v2/game/health`

**Contact Information:**
- Create GitHub issue with logs and error details
- Include environment information and steps to reproduce

---

**Estimated Upgrade Time**: 30-60 minutes
**Recommended Window**: Low-traffic period
**Rollback Time**: 10-15 minutes if needed

This upgrade significantly improves the reliability and user experience of GameBuddies with enhanced status tracking, seamless returns, and robust session management.