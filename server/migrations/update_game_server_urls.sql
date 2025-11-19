-- Update all game server URLs for keep-alive service
-- Run this in Supabase SQL Editor after running add_server_url_column.sql

-- DDF
UPDATE games
SET server_url = 'https://ddf-server.onrender.com'
WHERE id = 'ddf';

-- SUSD
UPDATE games
SET server_url = 'https://susd.onrender.com'
WHERE id = 'susd';

-- Bingo
UPDATE games
SET server_url = 'https://bingobuddiesbackend.onrender.com'
WHERE id = 'bingo';

-- Bumper Balls
UPDATE games
SET server_url = 'https://bumperballarena.onrender.com'
WHERE id = 'bumperball';

-- ClueScale
UPDATE games
SET server_url = 'https://cluescaleserver.onrender.com'
WHERE id = 'cluescale';

-- Verify the updates
SELECT id, name, base_url, server_url
FROM games
WHERE is_external = true
ORDER BY id;
