# Render.com Deployment Troubleshooting Guide

## Issues Fixed

### 1. 502 Bad Gateway Error

**Root Cause**: The middleware order in `server/index.js`. The static file middleware was being registered BEFORE the API routes, causing API requests to be intercepted and resulting in 502 errors.

### 2. Socket.io Connection Crashes

**Root Cause**: `socket.conn.setTimeout` is not a valid function in production Socket.io versions, causing server crashes when clients connect.

### 3. WebSocket Proxy Conflicts

**Root Cause**: The http-proxy-middleware was configured with `ws: true` which caused it to try to handle ALL WebSocket connections, including Socket.io's, resulting in `ERR_STREAM_WRITE_AFTER_END` errors.

### Solution Applied

1. **Fixed Middleware Order** (Critical):
   - API routes (`/api/*`) are now registered FIRST
   - Game proxies (`/ddf`, `/schooled`) come SECOND
   - Static files for React app come LAST
   - This ensures API calls reach their handlers properly

2. **Fixed Socket.io Crashes**:
   - Removed invalid `socket.conn.setTimeout` calls
   - Using Socket.io's built-in timeout configuration
   - Proper disconnect handling

3. **Resolved WebSocket Proxy Conflicts**:
   - Set `ws: false` in proxy configurations
   - Prevents proxy middleware from interfering with Socket.io
   - Socket.io now handles all WebSocket connections exclusively

4. **Enhanced Production Configuration**:
   - Production-specific CORS settings
   - Request logging with timestamps
   - Better error handling

### Deployment Checklist

1. **Environment Variables on Render**:
   ```
   NODE_ENV=production
   PORT=10000
   DDF_URL=https://ddf-game.onrender.com
   SCHOOLED_URL=https://schoolquizgame.onrender.com
   ```

2. **Build Command**:
   ```
   npm run install:all && npm run build
   ```

3. **Start Command**:
   ```
   npm start
   ```

4. **Health Check Path**: `/health`

### Testing After Deployment

1. **Test API Endpoint**:
   ```bash
   curl https://gamebuddies-homepage.onrender.com/api/games/available
   ```

2. **Check Logs on Render**:
   - Look for request logs showing API calls
   - Verify Socket.io connections are established
   - Check for any "Room not found" errors

3. **Browser Console**:
   - Should show "Connected to server" message
   - No 502 errors on API calls
   - Room joining should complete within 10 seconds

### Common Issues

1. **Still Getting 502**:
   - Clear browser cache
   - Check Render logs for startup errors
   - Verify all environment variables are set

2. **Socket.io Not Connecting**:
   - Check browser console for WebSocket errors
   - Verify CORS origins match your domain
   - Try both WebSocket and polling transports

3. **Room Join Timeout**:
   - Check if room exists in server logs
   - Verify Socket.io connection is established first
   - Look for "joinRoom" logs in Render dashboard

### Quick Fix Commands

If issues persist, redeploy with:
```bash
git add .
git commit -m "Fix API route order for production"
git push origin main
```

Then trigger manual deploy on Render dashboard. 