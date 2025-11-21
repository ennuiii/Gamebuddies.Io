const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Initialize Supabase client with service role key
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Use the V2 schema that matches the current database
const SQL_SCHEMA = `
-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) NOT NULL UNIQUE,
    display_name VARCHAR(100),
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_guest BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}',
    email TEXT UNIQUE,
    oauth_provider TEXT,
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin', 'moderator'))
);

-- Rooms table  
CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_code VARCHAR(6) NOT NULL UNIQUE,
    host_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'lobby',
    current_game VARCHAR(50),
    game_started_at TIMESTAMP WITH TIME ZONE,
    game_settings JSONB DEFAULT '{}',
    max_players INTEGER DEFAULT 10 CHECK (max_players >= 2 AND max_players <= 50),
    is_public BOOLEAN DEFAULT true,
    allow_spectators BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}',
    CONSTRAINT valid_status CHECK (status IN ('lobby', 'in_game', 'returning')),
    CONSTRAINT valid_game CHECK (current_game IN (NULL, 'ddf', 'schooled', 'susd', 'bingo', 'chess', 'poker', 'trivia', 'custom'))
);

-- Room members table
CREATE TABLE IF NOT EXISTS room_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'player',
    is_connected BOOLEAN DEFAULT true,
    last_ping TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    socket_id VARCHAR(100),
    is_ready BOOLEAN DEFAULT false,
    in_game BOOLEAN DEFAULT false,
    game_data JSONB DEFAULT '{}',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT valid_role CHECK (role IN ('host', 'player', 'spectator')),
    CONSTRAINT unique_room_member UNIQUE (room_id, user_id)
);

-- Games table
CREATE TABLE IF NOT EXISTS games (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    thumbnail_url TEXT,
    base_url TEXT NOT NULL,
    is_external BOOLEAN DEFAULT false,
    requires_api_key BOOLEAN DEFAULT false,
    min_players INTEGER DEFAULT 2,
    max_players INTEGER DEFAULT 10,
    supports_spectators BOOLEAN DEFAULT false,
    settings_schema JSONB DEFAULT '{}',
    default_settings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    maintenance_mode BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Room events table
CREATE TABLE IF NOT EXISTS room_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Game sessions table
CREATE TABLE IF NOT EXISTS game_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    game_id VARCHAR(50) NOT NULL REFERENCES games(id),
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    participants JSONB NOT NULL DEFAULT '[]',
    game_state JSONB DEFAULT '{}',
    game_result JSONB DEFAULT '{}',
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    CONSTRAINT valid_session_status CHECK (status IN ('active', 'completed', 'abandoned'))
);

-- API keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    game_id VARCHAR(50) REFERENCES games(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    permissions JSONB DEFAULT '["read", "write"]',
    rate_limit INTEGER DEFAULT 1000,
    is_active BOOLEAN DEFAULT true,
    last_used TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'
);

-- API requests table
CREATE TABLE IF NOT EXISTS api_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    method VARCHAR(10) NOT NULL,
    endpoint TEXT NOT NULL,
    status_code INTEGER,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    response_time_ms INTEGER,
    ip_address INET,
    user_agent TEXT,
    request_data JSONB DEFAULT '{}',
    response_data JSONB DEFAULT '{}',
    error_message TEXT
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen);
CREATE INDEX IF NOT EXISTS idx_rooms_room_code ON rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_host_id ON rooms(host_id);
CREATE INDEX IF NOT EXISTS idx_rooms_last_activity ON rooms(last_activity);
CREATE INDEX IF NOT EXISTS idx_room_members_room_id ON room_members(room_id);
CREATE INDEX IF NOT EXISTS idx_room_members_user_id ON room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_room_members_connected ON room_members(room_id, is_connected);
CREATE INDEX IF NOT EXISTS idx_room_events_room_id ON room_events(room_id);
CREATE INDEX IF NOT EXISTS idx_room_events_created_at ON room_events(created_at);
CREATE INDEX IF NOT EXISTS idx_game_sessions_room_id ON game_sessions(room_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_status ON game_sessions(status);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_game_id ON api_keys(game_id);
CREATE INDEX IF NOT EXISTS idx_api_requests_api_key_id ON api_requests(api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_requests_requested_at ON api_requests(requested_at);

-- Insert default games
INSERT INTO games (id, name, display_name, description, base_url, min_players, max_players) VALUES
('ddf', 'Der Dümmste Fliegt', 'Der Dümmste Fliegt', 'A fun trivia game where the dumbest flies!', '/ddf', 2, 10),
('schooled', 'Schooled', 'Schooled', 'Test your knowledge in this educational game!', '/schooled', 2, 8)
ON CONFLICT (id) DO NOTHING;

-- Helper functions
CREATE OR REPLACE FUNCTION generate_room_code()
RETURNS VARCHAR(6) AS $$
DECLARE
    code VARCHAR(6);
    exists BOOLEAN;
BEGIN
    LOOP
        code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
        EXISTS (SELECT 1 FROM rooms WHERE room_code = code) INTO exists;
        IF NOT exists THEN
            RETURN code;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up inactive rooms
CREATE OR REPLACE FUNCTION cleanup_inactive_rooms()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    WITH deleted AS (
        DELETE FROM rooms
        WHERE (
            (status = 'lobby' AND last_activity < NOW() - INTERVAL '1 hour')
            OR
            (status = 'in_game' AND last_activity < NOW() - INTERVAL '2 hours')
            OR
            (created_at < NOW() - INTERVAL '24 hours')
        )
        AND NOT EXISTS (
            SELECT 1 FROM room_members 
            WHERE room_id = rooms.id 
            AND is_connected = true
        )
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create a system user for automated actions
INSERT INTO users (id, username, display_name, is_guest)
VALUES ('00000000-0000-0000-0000-000000000000', 'system', 'System', false)
ON CONFLICT (id) DO NOTHING;
`;

async function setupDatabase() {
  console.log('🚀 Setting up GameBuddies V2 database schema...');
  
  try {
    console.log('📋 Executing SQL schema...');
    
    // Split schema into individual statements
    const statements = SQL_SCHEMA
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);
    
    console.log(`📊 Found ${statements.length} SQL statements to execute`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.length > 0) {
        try {
          console.log(`⚡ Executing statement ${i + 1}/${statements.length}: ${statement.substring(0, 50)}...`);
          
          // Use raw query execution for DDL statements
          const { error } = await supabase.rpc('exec_sql', { 
            query: statement + ';'
          });
          
          if (error) {
            console.warn(`⚠️  Statement ${i + 1} failed, but continuing...`, error.message);
          }
        } catch (execError) {
          console.warn(`⚠️  Statement ${i + 1} failed, but continuing...`, execError.message);
        }
      }
    }
    
    console.log('✅ Database schema setup completed!');
    
    // Setup initial API keys
    await setupInitialAPIKeys();
    
    console.log('✅ Initial API keys created!');
    console.log('🎉 Database setup complete!');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    console.log('\n📋 Manual Setup Instructions:');
    console.log('1. Go to your Supabase dashboard');
    console.log('2. Navigate to SQL Editor');
    console.log('3. Copy and paste the V2 schema from GAMEBUDDIES_V2_SQL_SCHEMA.sql');
    console.log('4. Run the SQL script manually');
  }
}

async function setupInitialAPIKeys() {
  const { v4: uuidv4 } = require('uuid');
  
  console.log('🔑 Setting up initial API keys...');
  
  const apiKeys = [
    {
      service_name: 'ddf',
      api_key: 'gb_ddf_' + uuidv4().replace(/-/g, ''),
      game_id: 'ddf',
      name: 'DDF Game API Key',
      description: 'API key for Der Dümmste Fliegt game integration',
      permissions: ['create_room', 'join_room', 'sync_state'],
      rate_limit: 1000
    },
    {
      service_name: 'schooled', 
      api_key: 'gb_schooled_' + uuidv4().replace(/-/g, ''),
      game_id: 'schooled',
      name: 'Schooled Game API Key',
      description: 'API key for Schooled game integration',
      permissions: ['create_room', 'join_room', 'sync_state'],
      rate_limit: 1000
    }
  ];
  
  for (const keyData of apiKeys) {
    try {
      // Hash the API key
      const keyHash = require('crypto')
        .createHash('sha256')
        .update(keyData.api_key)
        .digest('hex');
      
      const { error } = await supabase
        .from('api_keys')
        .upsert({
          key_hash: keyHash,
          game_id: keyData.game_id,
          name: keyData.name,
          description: keyData.description,
          permissions: keyData.permissions,
          rate_limit: keyData.rate_limit,
          is_active: true
        }, { 
          onConflict: 'key_hash'
        });
      
      if (error) {
        console.log(`⚠️  Could not create API key for ${keyData.service_name}:`, error.message);
      } else {
        console.log(`✅ API key created for ${keyData.service_name}: ${keyData.api_key}`);
        console.log(`   Hash: ${keyHash}`);
      }
    } catch (keyError) {
      console.error(`❌ Error creating API key for ${keyData.service_name}:`, keyError);
    }
  }
}

if (require.main === module) {
  setupDatabase();
}

module.exports = { setupDatabase }; 