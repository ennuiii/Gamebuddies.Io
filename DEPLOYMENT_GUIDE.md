# 🚀 Quick Deployment Guide for GameBuddies.io

Since your games are already hosted on Render.com, here's the step-by-step guide to get your homepage running:

## Step 1: Configure Your Games

Let's say you have these games already on Render:
- Snake Game at: `https://snake-game-xyz.onrender.com`
- Tetris at: `https://tetris-abc.onrender.com`

### 1.1 Update `server/index.js`:

```javascript
// Replace the gameProxies object with:
const gameProxies = {
  '/snake': {
    target: process.env.SNAKE_URL || 'https://snake-game-xyz.onrender.com',
    changeOrigin: true,
    ws: true,
    pathRewrite: {
      '^/snake': '',
    },
  },
  '/tetris': {
    target: process.env.TETRIS_URL || 'https://tetris-abc.onrender.com',
    changeOrigin: true,
    ws: true,
    pathRewrite: {
      '^/tetris': '',
    },
  },
};

// Update the /api/games endpoint:
app.get('/api/games', (req, res) => {
  res.json([
    {
      id: 'snake',
      name: 'Snake Game',
      description: 'Classic snake game with a modern twist',
      screenshot: '/screenshots/snake.jpg',
      path: '/snake',
      available: true,
    },
    {
      id: 'tetris',
      name: 'Tetris Clone',
      description: 'The timeless puzzle game',
      screenshot: '/screenshots/tetris.jpg',
      path: '/tetris',
      available: true,
    },
  ]);
});
```

## Step 2: Add Game Screenshots

1. Take screenshots of your games (400x225 pixels recommended)
2. Save them as:
   - `server/screenshots/snake.jpg`
   - `server/screenshots/tetris.jpg`

## Step 3: Deploy to Render

### 3.1 Push to GitHub
```bash
git init
git add .
git commit -m "GameBuddies homepage ready"
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

### 3.2 Create Web Service on Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" → "Web Service"
3. Connect your GitHub repo
4. Configure:
   - **Name**: `gamebuddies-homepage`
   - **Build Command**: `npm run install:all && npm run build`
   - **Start Command**: `npm start`

### 3.3 Add Environment Variables in Render

Go to Environment tab and add:

```
SNAKE_URL=https://snake-game-xyz.onrender.com
TETRIS_URL=https://tetris-abc.onrender.com
```

## Step 4: Connect Your Domain

1. In Render service settings → "Custom Domains"
2. Add `gamebuddies.io`
3. Update your DNS:
   - Add CNAME record: `gamebuddies.io` → `gamebuddies-homepage.onrender.com`

## How It Works

When deployed, users will access your games like this:
- `gamebuddies.io` → Shows the homepage with game cards
- `gamebuddies.io/snake` → Plays Snake game (proxied from Render)
- `gamebuddies.io/tetris` → Plays Tetris (proxied from Render)

The reverse proxy makes it appear as if all games are hosted on your domain!

## Important Notes

1. **No changes needed to your existing games** - The proxy handles everything
2. **CORS**: If your games have backends that make API calls, ensure they accept requests from `gamebuddies.io`
3. **Assets**: Your games should use relative paths for assets (most React apps do this by default)

## Testing Locally First

Before deploying, test with your actual game URLs:

1. Create `server/.env`:
```
SNAKE_URL=https://snake-game-xyz.onrender.com
TETRIS_URL=https://tetris-abc.onrender.com
```

2. Run locally:
```bash
npm run install:all
npm run dev
```

3. Visit `http://localhost:3000` and test the games work

That's it! Your games will be accessible through gamebuddies.io with clean URLs! 🎮 