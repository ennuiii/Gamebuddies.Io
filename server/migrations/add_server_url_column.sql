-- Migration: Add server_url column to games table
-- Purpose: Separate client URL (base_url) from server URL (server_url) for keep-alive pinging
--
-- base_url    = Client static site URL (proxied by GameBuddies for game assets)
-- server_url  = Backend server URL (pinged by keep-alive service to prevent spin-down)

-- Add server_url column
ALTER TABLE games
ADD COLUMN IF NOT EXISTS server_url TEXT;

-- Add comment explaining the difference
COMMENT ON COLUMN games.base_url IS 'Client static site URL - proxied by GameBuddies for serving game HTML/assets (e.g., https://bumperballarenaclient.onrender.com)';
COMMENT ON COLUMN games.server_url IS 'Backend server URL - pinged by keep-alive service to prevent Render.com free tier spin-down (e.g., https://bumperballarena.onrender.com)';

-- Example updates (uncomment and modify as needed):
-- UPDATE games SET server_url = 'https://bumperballarena.onrender.com' WHERE id = 'bumperball';
-- UPDATE games SET server_url = 'https://cluescale-server.onrender.com' WHERE id = 'cluescale';
-- UPDATE games SET server_url = 'https://ddf-server.onrender.com' WHERE id = 'ddf';
