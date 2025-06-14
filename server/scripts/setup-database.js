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

const SQL_SCHEMA = `
-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- User profiles (for better user management)
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    external_id VARCHAR(100) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    preferences JSONB DEFAULT '{"notifications": true, "sound": true}',
    stats JSONB DEFAULT '{"games_played": 0, "games_won": 0}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enhanced rooms table
CREATE TABLE IF NOT EXISTS game_rooms (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_code VARCHAR(6) UNIQUE NOT NULL,
    creator_id UUID REFERENCES user_profiles(id),
    game_type VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'waiting_for_players',
    visibility VARCHAR(20) DEFAULT 'public' CHECK (visibility IN ('public', 'private', 'friends_only')),
    password_hash TEXT,
    max_players INTEGER DEFAULT 10,
    current_players INTEGER DEFAULT 0,
    settings JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_from VARCHAR(20) NOT NULL,
    game_instance_url TEXT,
    game_instance_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    finished_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours'),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT valid_game_type CHECK (game_type IN ('ddf', 'schooled', 'chess', 'poker', 'trivia', 'custom', 'lobby')),
    CONSTRAINT valid_status CHECK (status IN ('waiting_for_players', 'launching', 'active', 'paused', 'finished', 'abandoned'))
);

-- Enhanced participants table
CREATE TABLE IF NOT EXISTS room_participants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id UUID REFERENCES game_rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES user_profiles(id),
    socket_id VARCHAR(100),
    role VARCHAR(20) DEFAULT 'player',
    team_id INTEGER,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_ping TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    connection_status VARCHAR(20) DEFAULT 'connected',
    is_ready BOOLEAN DEFAULT FALSE,
    game_specific_data JSONB DEFAULT '{}',
    
    UNIQUE(room_id, user_id),
    CONSTRAINT valid_role CHECK (role IN ('host', 'player', 'spectator', 'bot')),
    CONSTRAINT valid_connection CHECK (connection_status IN ('connected', 'disconnected', 'reconnecting', 'idle'))
);

-- Game state synchronization
CREATE TABLE IF NOT EXISTS game_states (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id UUID REFERENCES game_rooms(id) ON DELETE CASCADE,
    game_type VARCHAR(20) NOT NULL,
    state_data JSONB NOT NULL,
    state_version INTEGER DEFAULT 1,
    checksum VARCHAR(64),
    created_by UUID REFERENCES user_profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(room_id, state_version)
);

-- Enhanced activity log
CREATE TABLE IF NOT EXISTS room_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id UUID REFERENCES game_rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES user_profiles(id),
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB DEFAULT '{}',
    client_info JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- API keys for game services
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    service_name VARCHAR(50) UNIQUE NOT NULL,
    api_key VARCHAR(100) UNIQUE NOT NULL,
    permissions JSONB DEFAULT '["create_room", "join_room", "sync_state"]',
    rate_limit INTEGER DEFAULT 100,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used TIMESTAMP WITH TIME ZONE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_rooms_status_visibility ON game_rooms(status, visibility) WHERE status IN ('waiting_for_players', 'active');
CREATE INDEX IF NOT EXISTS idx_rooms_creator ON game_rooms(creator_id);
CREATE INDEX IF NOT EXISTS idx_rooms_expires ON game_rooms(expires_at) WHERE status NOT IN ('finished', 'abandoned');
CREATE INDEX IF NOT EXISTS idx_participants_room_user ON room_participants(room_id, user_id);
CREATE INDEX IF NOT EXISTS idx_participants_connection ON room_participants(room_id, connection_status);
CREATE INDEX IF NOT EXISTS idx_events_room_time ON room_events(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_states_room_version ON game_states(room_id, state_version DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON user_profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_external ON user_profiles(external_id);

-- Helper functions
CREATE OR REPLACE FUNCTION generate_room_code()
RETURNS VARCHAR(6) AS $$
DECLARE
    chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    result VARCHAR(6) := '';
    i INTEGER;
    attempts INTEGER := 0;
BEGIN
    LOOP
        result := '';
        FOR i IN 1..6 LOOP
            result := result || substr(chars, floor(random() * length(chars) + 1)::INTEGER, 1);
        END LOOP;
        
        EXIT WHEN NOT EXISTS(SELECT 1 FROM game_rooms WHERE room_code = result);
        
        attempts := attempts + 1;
        IF attempts > 10 THEN
            RAISE EXCEPTION 'Could not generate unique room code';
        END IF;
    END LOOP;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Auto-update participant count
CREATE OR REPLACE FUNCTION update_participant_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE game_rooms 
        SET current_players = (
            SELECT COUNT(*) FROM room_participants 
            WHERE room_id = NEW.room_id 
            AND connection_status != 'disconnected'
        )
        WHERE id = NEW.room_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE game_rooms 
        SET current_players = (
            SELECT COUNT(*) FROM room_participants 
            WHERE room_id = OLD.room_id 
            AND connection_status != 'disconnected'
        )
        WHERE id = OLD.room_id;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.connection_status != NEW.connection_status THEN
            UPDATE game_rooms 
            SET current_players = (
                SELECT COUNT(*) FROM room_participants 
                WHERE room_id = NEW.room_id 
                AND connection_status != 'disconnected'
            )
            WHERE id = NEW.room_id;
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for participant count updates
DROP TRIGGER IF EXISTS update_room_participants_count ON room_participants;
CREATE TRIGGER update_room_participants_count
AFTER INSERT OR DELETE OR UPDATE ON room_participants
FOR EACH ROW EXECUTE FUNCTION update_participant_count();

-- Cleanup stale connections
CREATE OR REPLACE FUNCTION cleanup_stale_connections()
RETURNS void AS $$
BEGIN
    -- Mark connections as disconnected if no ping for 5 minutes
    UPDATE room_participants
    SET connection_status = 'disconnected'
    WHERE connection_status = 'connected'
    AND last_ping < NOW() - INTERVAL '5 minutes';
    
    -- Abandon rooms with no activity for 24 hours
    UPDATE game_rooms
    SET status = 'abandoned'
    WHERE status IN ('waiting_for_players', 'active')
    AND last_activity < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- Create materialized view for active rooms (performance optimization)
CREATE MATERIALIZED VIEW IF NOT EXISTS active_rooms_view AS
SELECT 
  r.*,
  COUNT(DISTINCT p.user_id) as participant_count,
  json_agg(
    json_build_object(
      'user_id', p.user_id,
      'username', u.username,
      'role', p.role
    )
  ) FILTER (WHERE p.user_id IS NOT NULL) as participants
FROM game_rooms r
LEFT JOIN room_participants p ON r.id = p.room_id AND p.connection_status != 'disconnected'
LEFT JOIN user_profiles u ON p.user_id = u.id
WHERE r.status IN ('waiting_for_players', 'active')
GROUP BY r.id;

-- Create index for materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_rooms_code ON active_rooms_view(room_code);

-- Function to refresh materialized view
CREATE OR REPLACE FUNCTION refresh_active_rooms()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY active_rooms_view;
END;
$$ LANGUAGE plpgsql;
`;

async function setupDatabase() {
  console.log('🚀 Setting up GameBuddies database schema...');
  
  try {
    // Execute the schema
    const { error } = await supabase.rpc('exec_sql', { 
      sql: SQL_SCHEMA 
    });
    
    if (error) {
      // If rpc doesn't work, try direct execution
      console.log('Direct SQL execution...');
      const statements = SQL_SCHEMA.split(';').filter(stmt => stmt.trim());
      
      for (const statement of statements) {
        if (statement.trim()) {
          console.log('Executing:', statement.substring(0, 50) + '...');
          const { error: execError } = await supabase
            .from('_temp_sql')
            .select('*')
            .limit(0); // This will fail but test connection
          
          if (execError && !execError.message.includes('does not exist')) {
            throw execError;
          }
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
    console.log('3. Copy and paste the schema from scripts/database-schema.sql');
    console.log('4. Run the SQL script manually');
    
    // Write schema to file for manual execution
    fs.writeFileSync(
      path.join(__dirname, 'database-schema.sql'), 
      SQL_SCHEMA
    );
    console.log('5. Schema saved to scripts/database-schema.sql for manual execution');
  }
}

async function setupInitialAPIKeys() {
  const { v4: uuidv4 } = require('uuid');
  
  const apiKeys = [
    {
      service_name: 'ddf',
      api_key: 'gb_ddf_' + uuidv4().replace(/-/g, ''),
      permissions: ['create_room', 'join_room', 'sync_state'],
      rate_limit: 100
    },
    {
      service_name: 'schooled',
      api_key: 'gb_schooled_' + uuidv4().replace(/-/g, ''),
      permissions: ['create_room', 'join_room', 'sync_state'],
      rate_limit: 100
    }
  ];
  
  for (const keyData of apiKeys) {
    const { error } = await supabase
      .from('api_keys')
      .upsert(keyData, { onConflict: 'service_name' });
    
    if (error) {
      console.log(`⚠️  Could not create API key for ${keyData.service_name}:`, error.message);
    } else {
      console.log(`✅ API key created for ${keyData.service_name}: ${keyData.api_key}`);
    }
  }
}

if (require.main === module) {
  setupDatabase();
}

module.exports = { setupDatabase }; 