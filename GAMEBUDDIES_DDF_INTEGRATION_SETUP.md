# GameBuddies DDF Integration Setup Guide

## 🎯 Overview

This guide explains how to integrate the DDF compatibility endpoints into your GameBuddies V2 server to support external games like DDF that need cross-domain return functionality.

## 📁 Required Files

1. **DDF Compatibility API Routes**: `gameApiV2_DDFCompatibility.js`
2. **Updated Rate Limits**: Enhanced rate limiting configuration
3. **Database Updates**: Additional metadata fields for return status

## 🚀 Installation Steps

### Step 1: Add Compatibility Routes

**File**: `server/app.js` or `server/index.js`

```javascript
// Add after existing gameApiV2 route setup
const LobbyManager = require('./lib/lobbyManager');
const StatusSyncManager = require('./lib/statusSyncManager');
const ddfCompatRoutes = require('./routes/gameApiV2_DDFCompatibility');

// Initialize managers (if not already done)
const lobbyManager = new LobbyManager(io, db, connectionManager);
const statusSyncManager = new StatusSyncManager(db, io, lobbyManager);

// Mount DDF compatibility routes
app.use('/', ddfCompatRoutes(io, db, connectionManager, lobbyManager, statusSyncManager));

console.log('✅ DDF compatibility endpoints loaded');
```

### Step 2: Update Rate Limits

**File**: `server/lib/validation.js`

```javascript
// Add new rate limit for polling endpoints
const rateLimits = {
  // ... existing limits
  
  // New: Polling rate limit for external games
  polling: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute per IP (every 2 seconds)
    message: {
      error: 'Too many polling requests',
      retryAfter: 60
    },
    standardHeaders: true,
    legacyHeaders: false
  }),

  // Increased heartbeat rate for external games  
  heartbeats: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 120, // 120 requests per minute (every 30 seconds per player)
    message: {
      error: 'Too many heartbeat requests',
      retryAfter: 60
    }
  })
};
```

### Step 3: Database Schema Update (If Needed)

Run this SQL in your Supabase console to ensure rooms table supports return metadata:

```sql
-- Ensure rooms table has metadata column (should already exist from V2 schema)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'rooms' AND column_name = 'metadata') THEN
        ALTER TABLE rooms ADD COLUMN metadata JSONB DEFAULT '{}';
    END IF;
END $$;

-- Add index for return status queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rooms_return_status 
ON rooms USING GIN ((metadata->'pendingReturn')) 
WHERE (metadata->'pendingReturn')::boolean = true;
```

### Step 4: Environment Variables

**File**: `.env`

```bash
# DDF Integration Settings
DDF_RETURN_POLL_INTERVAL=3000  # 3 seconds
DDF_RETURN_TIMEOUT=300000      # 5 minutes timeout for return commands
DDF_SESSION_DURATION=86400000  # 24 hours session duration
```

## 🔧 Configuration Options

### Polling Interval Settings

You can adjust polling frequency based on your needs:

```javascript
// In gameApiV2_DDFCompatibility.js
const POLL_INTERVALS = {
  development: 2000,  // 2 seconds for testing
  production: 5000,   // 5 seconds for production
  fallback: 10000     // 10 seconds if server is under load
};
```

### Return Timeout Configuration

```javascript
// Auto-clear pending returns after timeout to prevent infinite polling
const RETURN_TIMEOUT = process.env.DDF_RETURN_TIMEOUT || 300000; // 5 minutes

setTimeout(async () => {
  await clearExpiredReturns();
}, RETURN_TIMEOUT);
```

## 📊 Monitoring & Analytics

### API Usage Tracking

The compatibility endpoints automatically log usage:

```javascript
// View API usage for DDF integration
SELECT 
  endpoint,
  COUNT(*) as requests,
  AVG(response_time) as avg_response_time,
  COUNT(CASE WHEN status_code >= 400 THEN 1 END) as errors
FROM api_requests 
WHERE endpoint LIKE '%return%' OR endpoint LIKE '%polling%'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY endpoint
ORDER BY requests DESC;
```

### Return Success Rates

```javascript
// Monitor return-to-lobby success rates
SELECT 
  DATE(created_at) as date,
  COUNT(*) as return_attempts,
  COUNT(CASE WHEN event_data->>'success' = 'true' THEN 1 END) as successful_returns,
  ROUND(
    COUNT(CASE WHEN event_data->>'success' = 'true' THEN 1 END)::numeric / COUNT(*) * 100, 2
  ) as success_rate_percent
FROM room_events 
WHERE event_type = 'legacy_return_to_lobby'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

## 🐛 Troubleshooting

### Common Issues

#### 1. Authentication Errors
```javascript
// Error: 401 Unauthorized
// Solution: Ensure API key is correctly set in DDF
const apiKey = 'gb_ddf_9f5141736336428e9c62846b8421f249';
```

#### 2. Polling Not Working
```javascript
// Error: Return status always false
// Debug: Check room metadata
SELECT room_code, metadata FROM rooms WHERE room_code = 'ABC123';

// Should show: {"pendingReturn": true, "returnInitiatedAt": "2025-09-11T..."}
```

#### 3. Session Recovery Failing
```javascript
// Error: Players redirect to homepage instead of lobby
// Debug: Check session token generation
SELECT session_token, expires_at, status FROM player_sessions 
WHERE user_id = 'player-uuid' AND status = 'active';
```

### Debug Endpoints

Enable debug mode for additional logging:

```javascript
// Add to app.js for development
if (process.env.NODE_ENV === 'development') {
  app.use('/debug/ddf', (req, res) => {
    res.json({
      activeReturns: getActiveReturnCommands(),
      activeSessions: getActivePlayerSessions(),
      recentPolls: getRecentPollingActivity()
    });
  });
}
```

## 🔒 Security Considerations

### API Key Security
```javascript
// Ensure API keys are properly validated
const validateDDFApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.DDF_API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
};
```

### Rate Limiting
```javascript
// Prevent abuse of polling endpoints
const pollRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // Max 20 polls per minute per IP
  message: 'Too many polling requests'
});
```

### CORS Configuration
```javascript
// Allow DDF domain to access GameBuddies API
const cors = require('cors');
app.use(cors({
  origin: ['https://ddf.example.com', 'https://gamebuddies.io'],
  credentials: true
}));
```

## 📈 Performance Optimization

### Caching Return Status
```javascript
const NodeCache = require('node-cache');
const returnStatusCache = new NodeCache({ stdTTL: 30 }); // 30 second cache

// Cache return status to reduce database queries
const getCachedReturnStatus = (roomCode) => {
  const cached = returnStatusCache.get(roomCode);
  if (cached) return cached;
  
  const status = checkDatabaseReturnStatus(roomCode);
  returnStatusCache.set(roomCode, status);
  return status;
};
```

### Database Connection Pooling
```javascript
// Optimize for frequent polling requests
const dbConfig = {
  pool: {
    min: 5,
    max: 20,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    idleTimeoutMillis: 600000
  }
};
```

## ✅ Testing the Integration

### 1. Test API Key Creation
```bash
# Run the SQL command to create DDF API key
psql -h your-supabase-host -d postgres -c "
INSERT INTO api_keys (name, key_hash, service_name, game_id, description, permissions, rate_limit, is_active, created_at) 
VALUES ('DDF', 'gb_ddf_9f5141736336428e9c62846b8421f249', 'ddf', 'ddf', 'API key for DDF game integration', '[\"read\", \"write\", \"status_update\", \"sync_state\"]'::jsonb, 1000, true, NOW());
"
```

### 2. Test Return Endpoint
```bash
# Test the return endpoint with curl
curl -X POST https://gamebuddies.io/api/returnToLobby \
  -H "Content-Type: application/json" \
  -H "X-API-Key: gb_ddf_9f5141736336428e9c62846b8421f249" \
  -d '{"roomCode": "TEST123", "isHost": true}'
```

### 3. Test Polling Endpoint
```bash
# Test the polling endpoint
curl "https://gamebuddies.io/api/v2/rooms/TEST123/return-status?playerId=test-player-id" \
  -H "X-API-Key: gb_ddf_9f5141736336428e9c62846b8421f249"
```

### Expected Responses
```json
// Return endpoint success
{
  "success": true,
  "message": "Group return to lobby initiated",
  "roomCode": "TEST123",
  "playersAffected": 4,
  "returnUrl": "https://gamebuddies.io/lobby/TEST123",
  "pollEndpoint": "/api/v2/rooms/TEST123/return-status"
}

// Polling endpoint with pending return
{
  "shouldReturn": true,
  "returnUrl": "https://gamebuddies.io/lobby/TEST123?session=sess_abc123",
  "roomCode": "TEST123",
  "sessionToken": "sess_abc123",
  "timestamp": "2025-09-11T10:30:00Z"
}
```

## 🚀 Deployment Checklist

- [ ] Copy `gameApiV2_DDFCompatibility.js` to server routes folder
- [ ] Update main server file to mount compatibility routes
- [ ] Create DDF API key in database
- [ ] Update rate limiting configuration
- [ ] Test all endpoints with curl/Postman
- [ ] Deploy to staging environment
- [ ] Test cross-domain return flow
- [ ] Monitor API usage and performance
- [ ] Deploy to production
- [ ] Update DDF with new integration code

## 📞 Support

For integration support:
1. Check server logs for API errors
2. Use debug endpoints to inspect return status
3. Monitor database for session and return data
4. Test endpoints individually with curl
5. Review CORS and security settings