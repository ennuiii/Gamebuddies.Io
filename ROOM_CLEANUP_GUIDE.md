# 🧹 Room Cleanup System

The GameBuddies platform includes a comprehensive room cleanup system to automatically remove inactive rooms from the Supabase database, preventing storage bloat and maintaining optimal performance.

## 🔄 Automatic Cleanup

The system runs automatic cleanup tasks at different intervals:

### Periodic Cleanup (Every 15 minutes)
- **Max Age**: 24 hours
- **Max Idle**: 1 hour
- **Includes**: Abandoned and completed rooms
- **Purpose**: Regular maintenance

### Off-Peak Cleanup (Every hour, 2-6 AM)
- **Max Age**: 12 hours
- **Max Idle**: 30 minutes
- **Includes**: Abandoned and completed rooms
- **Purpose**: More aggressive cleanup during low-traffic hours

## 🎯 Cleanup Criteria

Rooms are cleaned up if they meet ANY of these conditions:

1. **Age-based**: Older than specified hours (default: 24h)
2. **Idle-based**: No activity for specified minutes (default: 30-60min)
3. **Status-based**: Marked as `abandoned` or `completed`
4. **Player-based**: No connected players and idle for specified time

## 🛠️ Manual Cleanup

### Command Line Tool

Use the cleanup script for manual control:

```bash
# Navigate to server directory
cd server

# Show room statistics
node scripts/cleanup-rooms.js stats

# Dry run (see what would be cleaned)
node scripts/cleanup-rooms.js dry-run

# Run cleanup with default settings
node scripts/cleanup-rooms.js cleanup

# Aggressive cleanup (2h age, 15min idle)
node scripts/cleanup-rooms.js aggressive

# Custom cleanup
node scripts/cleanup-rooms.js cleanup --max-age 12 --max-idle 60
```

### API Endpoints

The server exposes REST API endpoints for programmatic access:

#### Get Room Statistics
```http
GET /api/admin/room-stats
```

Response:
```json
{
  "success": true,
  "stats": {
    "total": 150,
    "byStatus": {
      "waiting_for_players": 45,
      "in_progress": 12,
      "completed": 78,
      "abandoned": 15
    },
    "byAge": {
      "lastHour": 25,
      "lastDay": 89,
      "lastWeek": 134,
      "older": 16
    },
    "byActivity": {
      "active": 35,
      "idle": 67,
      "stale": 48
    }
  }
}
```

#### Manual Cleanup Trigger
```http
POST /api/admin/cleanup-now
```

Response:
```json
{
  "success": true,
  "roomsCleanedUp": 23,
  "cleanedRooms": ["ABC123", "DEF456", "GHI789"],
  "message": "Manual cleanup completed: 23 rooms cleaned"
}
```

#### Custom Cleanup
```http
POST /api/admin/cleanup-rooms
Content-Type: application/json

{
  "maxAgeHours": 12,
  "maxIdleMinutes": 30,
  "includeAbandoned": true,
  "includeCompleted": true,
  "dryRun": false
}
```

## 🗄️ Database Impact

The cleanup system properly handles foreign key constraints by deleting in this order:

1. **Game States** (`game_states` table)
2. **Room Events** (`room_events` table)  
3. **Participants** (`room_participants` table)
4. **Room** (`game_rooms` table)

This ensures data integrity and prevents orphaned records.

## 📊 Monitoring

### Server Logs

The cleanup system provides detailed logging:

```
🧹 Running periodic cleanup...
🔍 Found 5 rooms to cleanup: [
  { code: 'ABC123', status: 'abandoned', age: '25h', idle: '120m' },
  { code: 'DEF456', status: 'completed', age: '15h', idle: '45m' }
]
🗑️ Cleaned up room: ABC123
🗑️ Cleaned up room: DEF456
✅ Room cleanup completed: 5 rooms cleaned
```

### Statistics Tracking

Monitor room health with the stats endpoint:
- **Total rooms** in database
- **Status distribution** (waiting, in-progress, completed, abandoned)
- **Age distribution** (last hour, day, week, older)
- **Activity levels** (active, idle, stale)

## ⚙️ Configuration

### Default Settings

```javascript
// Periodic cleanup (every 15 minutes)
{
  maxAgeHours: 24,      // Rooms older than 24 hours
  maxIdleMinutes: 60,   // Rooms idle for 1 hour
  includeAbandoned: true,
  includeCompleted: true
}

// Off-peak cleanup (2-6 AM)
{
  maxAgeHours: 12,      // More aggressive: 12 hours
  maxIdleMinutes: 30,   // More aggressive: 30 minutes
  includeAbandoned: true,
  includeCompleted: true
}

// Manual cleanup
{
  maxAgeHours: 2,       // Very aggressive: 2 hours
  maxIdleMinutes: 15,   // Very aggressive: 15 minutes
  includeAbandoned: true,
  includeCompleted: true
}
```

### Customization

You can adjust cleanup behavior by modifying the intervals in `server/index.js`:

```javascript
// Change periodic cleanup interval (default: 15 minutes)
setInterval(cleanupFunction, 15 * 60 * 1000);

// Change off-peak cleanup interval (default: 1 hour)
setInterval(offPeakCleanup, 60 * 60 * 1000);
```

## 🚨 Safety Features

1. **Dry Run Mode**: Test cleanup without deleting anything
2. **Detailed Logging**: Track what gets cleaned and why
3. **Error Handling**: Failed cleanups don't break the system
4. **Gradual Deletion**: Rooms are deleted one by one, not in bulk
5. **Foreign Key Safety**: Proper deletion order prevents database errors

## 🔧 Troubleshooting

### Common Issues

**Cleanup not running:**
- Check server logs for errors
- Verify Supabase connection
- Ensure proper permissions

**Too aggressive cleanup:**
- Increase `maxAgeHours` and `maxIdleMinutes`
- Disable off-peak cleanup
- Use dry-run mode to test settings

**Database errors:**
- Check foreign key constraints
- Verify table permissions
- Review Supabase logs

### Manual Recovery

If you need to recover from cleanup issues:

1. **Check what was cleaned**: Review server logs
2. **Restore from backup**: Use Supabase backup features
3. **Adjust settings**: Modify cleanup parameters
4. **Test with dry-run**: Verify new settings before applying

## 📈 Best Practices

1. **Monitor regularly**: Check room stats weekly
2. **Adjust for traffic**: More aggressive cleanup during low-traffic periods
3. **Use dry-run**: Always test cleanup settings first
4. **Keep logs**: Maintain cleanup logs for troubleshooting
5. **Backup data**: Regular database backups before major cleanups

## 🎯 Performance Impact

The cleanup system is designed to be lightweight:

- **Non-blocking**: Runs asynchronously without affecting user experience
- **Batched operations**: Processes rooms individually to avoid locks
- **Error isolation**: Failed cleanups don't affect successful ones
- **Resource-aware**: More aggressive cleanup during off-peak hours

This ensures your GameBuddies platform stays fast and responsive while maintaining a clean database. 