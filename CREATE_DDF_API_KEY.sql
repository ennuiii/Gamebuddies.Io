-- Create API key for DDF
-- Use this SQL command in your Supabase SQL editor

-- First, check if the key already exists
SELECT id, name, key_hash, is_active FROM api_keys WHERE name = 'DDF';

-- If it doesn't exist, insert it:
INSERT INTO api_keys (
  name,
  key_hash,
  game_id,
  description,
  permissions,
  is_active,
  created_at
) VALUES (
  'DDF',
  '358b5f6606b3fb8e6aaed3d7b3cda482bbf3201965d2e6e45ffcb40b4852a36b',
  'ddf',
  'API key for DDF game integration',
  '["read", "write"]'::jsonb,
  true,
  NOW()
);

-- If it exists but has wrong key_hash, update it:
UPDATE api_keys 
SET key_hash = '358b5f6606b3fb8e6aaed3d7b3cda482bbf3201965d2e6e45ffcb40b4852a36b',
    is_active = true
WHERE name = 'DDF';

-- Verify the key was created/updated correctly:
SELECT id, name, key_hash, is_active, created_at FROM api_keys WHERE name = 'DDF'; 