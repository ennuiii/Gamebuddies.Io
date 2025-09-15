# GameBuddies.io - Gaming Portal Homepage

A stylish gaming portal homepage with reverse proxy support for hosting multiple React games under a single domain.

## 🎮 Features

- **Modern Gaming Design**: Dark theme with neon accents and smooth animations
- **Reverse Proxy**: Clean URLs like `gamebuddies.io/game1` without subdomains
- **Responsive Layout**: Works perfectly on desktop and mobile devices
- **Game Cards**: Beautiful cards with screenshots, descriptions, and hover effects
- **Easy to Extend**: Simple configuration to add new games

## 🚀 Project Structure

```
gamebuddies/
├── client/                # React frontend
│   ├── src/
│   │   ├── components/   # Reusable components
│   │   ├── pages/       # Page components
│   │   └── App.js       # Main app with routing
├── server/               # Express backend
│   ├── index.js         # Server with reverse proxy
│   └── screenshots/     # Game screenshots
├── games/               # Your game files (optional)
└── package.json         # Root package.json
```

## 🛠️ Local Development

### Prerequisites
- Node.js 16+ installed
- npm or yarn
- Your React games running on separate ports

### Setup

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd gamebuddies
   ```

2. **Install dependencies**
   ```bash
   npm run install:all
   ```

3. **Configure environment variables**
   
   Create a `.env` file in the `server` directory:
   ```env
   # Server Configuration
   PORT=5000

   # Game URLs - Update these with your actual game URLs
   GAME1_URL=http://localhost:3001
   GAME2_URL=http://localhost:3002
   ```

4. **Add game screenshots**
   
   Place your game screenshots in `server/screenshots/`:
   - `game1.jpg` - Screenshot for Game 1
   - `game2.jpg` - Screenshot for Game 2

5. **Update game information**
   
   Edit `server/index.js` to update the game list in the `/api/games` endpoint with your actual game names and descriptions.

6. **Run the development server**
   ```bash
   npm run dev
   ```

   This will start:
   - React frontend on http://localhost:3000
   - Express backend on http://localhost:5000

## 🌐 Deployment on Render.com

### Method 1: Using render.yaml (Recommended)

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. **Deploy to Render**
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click "New +" → "Blueprint"
   - Connect your GitHub repo
   - Render will automatically detect `render.yaml`

3. **Configure Environment Variables**
   - Set `GAME1_URL` to your first game's Render URL
   - Set `GAME2_URL` to your second game's Render URL

### Method 2: Manual Setup

1. **Create a Web Service on Render**
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click "New +" → "Web Service"
   - Connect your GitHub repo

2. **Configure Build Settings**
   - **Build Command**: `npm run install:all && npm run build`
   - **Start Command**: `npm start`
   - **Environment**: Node

3. **Add Environment Variables**
   ```
   NODE_ENV=production
   GAME1_URL=https://your-game1.onrender.com
   GAME2_URL=https://your-game2.onrender.com
   ```

4. **Deploy**
   - Click "Create Web Service"
   - Wait for the build to complete

### Setting up Custom Domain

1. **In Render Dashboard**
   - Go to your service settings
   - Click "Custom Domains"
   - Add `gamebuddies.io`

2. **Update DNS Records**
   - Add a CNAME record pointing to your Render service URL
   - Or use Render's nameservers for full DNS management

## 🎮 Preparing Your Games for Integration

### Update Your Game Servers

Your existing React games need minor updates to work with the reverse proxy:

1. **CORS Configuration** (if your games have backends):
   ```javascript
   // In your game's server
   app.use(cors({
     origin: ['https://gamebuddies.io', 'http://localhost:5000'],
     credentials: true
   }));
   ```

2. **Asset Paths**:
   - Ensure all assets use relative paths
   - Or configure PUBLIC_URL in your game's build

3. **API Calls**:
   - Use relative URLs for API calls
   - The reverse proxy will handle routing

### Deploy Your Games Separately

1. Deploy each game as a separate Web Service on Render
2. Note their URLs (e.g., `https://my-game1.onrender.com`)
3. Update the environment variables in your homepage deployment

## 📝 Adding New Games

1. **Update server configuration** in `server/index.js`:
   ```javascript
   // Add to gameProxies object
   '/game3': {
     target: process.env.GAME3_URL || 'http://localhost:3003',
     changeOrigin: true,
     ws: true,
     pathRewrite: {
       '^/game3': '',
     },
   },
   ```

2. **Update game list** in the `/api/games` endpoint:
   ```javascript
   {
     id: 'game3',
     name: 'Game 3',
     description: 'Your game description',
     screenshot: '/screenshots/game3.jpg',
     path: '/game3',
     available: true,
   }
   ```

3. **Add environment variable**:
   - Add `GAME3_URL` to your `.env` file
   - Update in Render dashboard

4. **Add screenshot**:
   - Place `game3.jpg` in `server/screenshots/`

## 🔧 Troubleshooting

### Games not loading?
- Check environment variables are set correctly
- Verify your games are running and accessible
- Check browser console for CORS errors

### Styling issues in games?
- Ensure games use relative paths for assets
- Check for CSS conflicts with the wrapper

### WebSocket issues?
- The reverse proxy is configured for WebSocket support
- Ensure your game servers allow WebSocket connections

## 📚 Tech Stack

- **Frontend**: React, React Router, Framer Motion, Axios
- **Backend**: Express, http-proxy-middleware
- **Styling**: CSS3 with CSS Variables
- **Deployment**: Render.com

## 🤝 Contributing

Feel free to submit issues and enhancement requests!

## 📄 License

This project is open source and available under the MIT License. 
