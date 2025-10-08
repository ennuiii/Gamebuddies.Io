# Adding New Games to GameBuddies

GameBuddies is now fully database-driven for game management! You can add new games without modifying any code.

## Quick Start: Adding a New Game

### Step 1: Add Game to Supabase

Go to your Supabase project → Table Editor → `games` table, and insert a new row:

```sql
INSERT INTO games (
  id,
  name,
  display_name,
  description,
  base_url,
  icon,
  min_players,
  max_players,
  is_active,
  is_external,
  requires_api_key
) VALUES (
  'mygame',                              -- Unique game ID (lowercase, no spaces)
  'My Awesome Game',                     -- Internal name
  'My Awesome Game',                     -- Display name shown to users
  'An amazing multiplayer game!',       -- Description
  'https://mygame.onrender.com',        -- Game URL
  '🎯',                                  -- Emoji icon (or leave null to use thumbnail)
  2,                                     -- Minimum players
  12,                                    -- Maximum players
  true,                                  -- Active (true = visible, false = hidden)
  true,                                  -- External game
  false                                  -- Requires API key
);
```

### Step 2: Add Environment Variable (Optional)

If your game needs a specific environment variable (like for reverse proxy), add it to `.env`:

```bash
MYGAME_URL=https://mygame.onrender.com
```

### Step 3: Restart Server

If you added environment variables, restart the server:

```bash
npm start
```

If you only added the database entry (no env vars), **no restart needed!** Just refresh the browser.

### Step 4: Test

1. Refresh your GameBuddies page
2. Create a new room
3. Your new game should appear in the game picker! 🎉

---

## Using Images Instead of Emojis

### Option 1: Upload to Supabase Storage

1. Go to **Storage** in Supabase dashboard
2. Create a bucket called `game-thumbnails` (make it public)
3. Upload your image (e.g., `mygame-thumb.png`)
4. Get the public URL
5. Update the game record:

```sql
UPDATE games
SET thumbnail_url = 'https://your-project.supabase.co/storage/v1/object/public/game-thumbnails/mygame-thumb.png'
WHERE id = 'mygame';
```

### Option 2: Use External URL

```sql
UPDATE games
SET thumbnail_url = 'https://example.com/path/to/image.png'
WHERE id = 'mygame';
```

The GamePicker will automatically display the image if `thumbnail_url` is set, otherwise it shows the emoji icon.

---

## Disabling/Enabling Games

### Temporarily Disable a Game

```sql
UPDATE games
SET maintenance_mode = true
WHERE id = 'mygame';
```

### Permanently Disable (Hide from Picker)

```sql
UPDATE games
SET is_active = false
WHERE id = 'mygame';
```

### Re-enable

```sql
UPDATE games
SET is_active = true, maintenance_mode = false
WHERE id = 'mygame';
```

---

## Advanced Configuration

### Game Settings Schema

You can define a JSON schema for game-specific settings:

```sql
UPDATE games
SET settings_schema = '{
  "type": "object",
  "properties": {
    "difficulty": {
      "type": "string",
      "enum": ["easy", "medium", "hard"]
    },
    "rounds": {
      "type": "number",
      "minimum": 1,
      "maximum": 10
    }
  }
}'::jsonb
WHERE id = 'mygame';
```

### Default Settings

```sql
UPDATE games
SET default_settings = '{
  "difficulty": "medium",
  "rounds": 5
}'::jsonb
WHERE id = 'mygame';
```

---

## How It Works

### Database Schema

The `games` table stores all game metadata:

| Column | Type | Description |
|--------|------|-------------|
| `id` | VARCHAR(50) | Unique game identifier (primary key) |
| `name` | VARCHAR(100) | Internal game name |
| `display_name` | VARCHAR(100) | Name shown to users |
| `description` | TEXT | Game description |
| `thumbnail_url` | TEXT | URL to game thumbnail image |
| `base_url` | TEXT | Game server URL |
| `icon` | VARCHAR(10) | Emoji icon (e.g., '🎮') |
| `is_external` | BOOLEAN | Whether game is hosted externally |
| `requires_api_key` | BOOLEAN | Whether game requires API authentication |
| `min_players` | INTEGER | Minimum number of players |
| `max_players` | INTEGER | Maximum number of players |
| `supports_spectators` | BOOLEAN | Whether game allows spectators |
| `settings_schema` | JSONB | JSON schema for game settings |
| `default_settings` | JSONB | Default game settings |
| `is_active` | BOOLEAN | Whether game is visible to users |
| `maintenance_mode` | BOOLEAN | Whether game is temporarily disabled |

### Migration Applied

The following changes were made to support this feature:

1. **Added `icon` column** to `games` table
2. **Removed CHECK constraint** on `rooms.current_game` (was limiting to hardcoded games)
3. **Added foreign key** from `rooms.current_game` to `games.id`
4. **Created `/api/games` endpoint** to fetch games dynamically
5. **Updated validation** to check against database instead of hardcoded list
6. **Updated GamePicker** component to fetch from API

### API Endpoints

**GET /api/games**
- Returns all active games not in maintenance mode
- Response format:
```json
{
  "success": true,
  "games": [
    {
      "id": "ddf",
      "name": "Der dümmste fliegt",
      "displayName": "Der dümmste fliegt",
      "description": "Quiz game where the worst player gets eliminated",
      "icon": "🎮",
      "thumbnailUrl": null,
      "maxPlayers": 8,
      "minPlayers": 2,
      "baseUrl": "https://ddf-game.onrender.com",
      "isExternal": true,
      "supportsSpectators": false
    }
  ]
}
```

**GET /api/games/:gameId**
- Returns a specific game by ID
- Returns 404 if game not found
- Returns 503 if game is in maintenance mode

### Caching

Game type validation is cached for 5 minutes to reduce database load. The cache automatically refreshes when expired.

To manually clear the cache (useful after adding new games):

```javascript
const { clearGameTypesCache } = require('./server/lib/validation');
clearGameTypesCache();
```

---

## Troubleshooting

### Game not showing up?

1. **Check `is_active`**: `SELECT * FROM games WHERE id = 'mygame';`
2. **Check `maintenance_mode`**: Should be `false`
3. **Clear browser cache**: Hard refresh (Ctrl+Shift+R)
4. **Check server logs**: Look for errors fetching games
5. **Verify database connection**: Test with `SELECT * FROM games;`

### Validation errors?

The server caches valid game types for 5 minutes. Wait 5 minutes or restart the server.

### Image not displaying?

1. **Check URL is accessible**: Open `thumbnail_url` in browser
2. **Check Supabase Storage permissions**: Bucket should be public
3. **Check CORS settings**: Storage bucket needs CORS enabled
4. **Verify image format**: Use common formats (PNG, JPG, WebP)

---

## Example: Adding "Trivia Master"

```sql
-- Step 1: Add to database
INSERT INTO games (
  id, name, display_name, description, base_url, icon,
  min_players, max_players, is_active, is_external
) VALUES (
  'trivia',
  'Trivia Master',
  'Trivia Master',
  'Test your knowledge across various categories!',
  'https://trivia-master.onrender.com',
  '❓',
  2, 16, true, true
);

-- Step 2: (Optional) Upload thumbnail to Supabase Storage
-- Then update with URL:
UPDATE games
SET thumbnail_url = 'https://your-project.supabase.co/storage/v1/object/public/game-thumbnails/trivia.png'
WHERE id = 'trivia';

-- Step 3: (Optional) Add custom settings
UPDATE games
SET
  settings_schema = '{"type": "object", "properties": {"categories": {"type": "array"}}}'::jsonb,
  default_settings = '{"categories": ["General", "Science", "History"]}'::jsonb
WHERE id = 'trivia';
```

That's it! Refresh the page and "Trivia Master" will appear in the game picker.

---

## Benefits of This Approach

✅ **No code changes needed** to add new games
✅ **No deployment required** (unless adding env vars)
✅ **Dynamic validation** - games are checked against database
✅ **Instant updates** - changes visible after browser refresh
✅ **Centralized management** - all game metadata in one place
✅ **Easy maintenance** - disable/enable games without code changes
✅ **Flexible configuration** - support for custom settings per game
✅ **Image support** - use emojis or custom thumbnails

---

## Migration Instructions

If you're upgrading from the old hardcoded system, follow these steps:

### 1. Run the SQL Migration

Execute the migration file in your Supabase SQL Editor:

```bash
server/migrations/add_game_icons.sql
```

This will:
- Add the `icon` column
- Populate icons for existing games
- Remove the old CHECK constraint
- Add a foreign key constraint

### 2. Deploy Code Changes

The code changes are already implemented:
- ✅ New `/api/games` endpoint
- ✅ Updated `validation.js` with dynamic validation
- ✅ Updated `GamePicker.js` to fetch from API
- ✅ Games route registered in `server/index.js`

Just deploy and restart your server.

### 3. Verify

1. Open GameBuddies
2. Create a room
3. All existing games should appear
4. Try adding a test game to verify it works

---

## Need Help?

Check the server logs for detailed error messages:
```bash
tail -f logs/server.log
```

Common log prefixes:
- `[Games API]` - API endpoint issues
- `[Validation]` - Game type validation issues
- `[GamePicker]` - Frontend game loading issues
