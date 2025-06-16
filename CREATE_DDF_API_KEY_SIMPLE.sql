-- Create API key for DDF (using the original readable key)
-- Use this SQL command in your Supabase SQL editor

-- First, check if the key already exists
SELECT id, name, key_hash, is_active FROM api_keys WHERE name = 'DDF';

-- Delete any existing DDF keys to avoid confusion
DELETE FROM api_keys WHERE name = 'DDF';

-- Insert the API key using the original readable key
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
  'gb_ddf_9f5141736336428e9c62846b8421f249',
  'ddf',
  'API key for DDF game integration',
  '["read", "write"]'::jsonb,
  true,
  NOW()
);

-- Verify the key was created correctly:
SELECT id, name, key_hash, is_active, created_at FROM api_keys WHERE name = 'DDF'; 