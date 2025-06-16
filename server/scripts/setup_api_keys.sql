-- GameBuddies API Keys Setup
-- Run this in your Supabase SQL editor to set up API key authentication

-- Create api_keys table if it doesn't exist
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name VARCHAR(50) UNIQUE NOT NULL,
    api_key VARCHAR(100) UNIQUE NOT NULL,
    permissions JSONB DEFAULT '[]'::jsonb,
    rate_limit INTEGER DEFAULT 100,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id)
);

-- Create api_requests table for logging API usage
CREATE TABLE IF NOT EXISTS api_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key VARCHAR(100) NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_api_keys_service_name ON api_keys(service_name);
CREATE INDEX IF NOT EXISTS idx_api_keys_api_key ON api_keys(api_key);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);
CREATE INDEX IF NOT EXISTS idx_api_requests_api_key ON api_requests(api_key);
CREATE INDEX IF NOT EXISTS idx_api_requests_created_at ON api_requests(created_at);

-- Create or update DDF API key
INSERT INTO api_keys (service_name, api_key, permissions, rate_limit)
VALUES (
  'ddf',
  'gb_ddf_' || replace(gen_random_uuid()::text, '-', ''),
  '["create_room", "join_room", "sync_state", "read_state", "send_events"]'::jsonb,
  1000
)
ON CONFLICT (service_name) 
DO UPDATE SET 
  is_active = true,
  rate_limit = 1000,
  permissions = '["create_room", "join_room", "sync_state", "read_state", "send_events"]'::jsonb;

-- Create Schooled API key (for future use)
INSERT INTO api_keys (service_name, api_key, permissions, rate_limit)
VALUES (
  'schooled',
  'gb_schooled_' || replace(gen_random_uuid()::text, '-', ''),
  '["create_room", "join_room", "sync_state", "read_state", "send_events"]'::jsonb,
  1000
)
ON CONFLICT (service_name) 
DO UPDATE SET 
  is_active = true,
  rate_limit = 1000,
  permissions = '["create_room", "join_room", "sync_state", "read_state", "send_events"]'::jsonb;

-- View the created API keys
SELECT 
    service_name,
    api_key,
    permissions,
    rate_limit,
    is_active,
    created_at
FROM api_keys 
WHERE service_name IN ('ddf', 'schooled')
ORDER BY service_name; 