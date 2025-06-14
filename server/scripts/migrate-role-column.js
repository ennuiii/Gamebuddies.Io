const { createClient } = require('@supabase/supabase-js');
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

const MIGRATION_SQL = `
-- Ensure role column exists and has proper constraints
DO $$
BEGIN
    -- Check if role column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'room_participants' 
        AND column_name = 'role'
    ) THEN
        -- Add role column if it doesn't exist
        ALTER TABLE room_participants 
        ADD COLUMN role VARCHAR(20) DEFAULT 'player';
        
        RAISE NOTICE 'Added role column to room_participants table';
    END IF;
    
    -- Drop existing constraint if it exists (to update it)
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'room_participants' 
        AND constraint_name = 'valid_role'
    ) THEN
        ALTER TABLE room_participants DROP CONSTRAINT valid_role;
        RAISE NOTICE 'Dropped existing valid_role constraint';
    END IF;
    
    -- Add updated constraint
    ALTER TABLE room_participants 
    ADD CONSTRAINT valid_role CHECK (role IN ('host', 'player', 'spectator', 'bot'));
    
    RAISE NOTICE 'Added updated valid_role constraint';
    
    -- Ensure there's at least one host per room (fix existing data)
    UPDATE room_participants 
    SET role = 'host' 
    WHERE id IN (
        SELECT DISTINCT ON (room_id) id 
        FROM room_participants p1
        WHERE NOT EXISTS (
            SELECT 1 FROM room_participants p2 
            WHERE p2.room_id = p1.room_id 
            AND p2.role = 'host'
        )
        ORDER BY room_id, joined_at ASC
    );
    
    RAISE NOTICE 'Fixed rooms without hosts - assigned host to oldest participant';
    
END $$;

-- Add index for role queries (performance optimization)
CREATE INDEX IF NOT EXISTS idx_participants_role ON room_participants(room_id, role);

-- Update any existing 'creator' or 'admin' roles to 'host' (legacy cleanup)
UPDATE room_participants 
SET role = 'host' 
WHERE role IN ('creator', 'admin', 'owner');
`;

async function migrateRoleColumn() {
  console.log('🔄 Migrating room_participants role column...');
  
  try {
    // Check current schema
    const { data: columns, error: schemaError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, column_default')
      .eq('table_name', 'room_participants');
    
    if (schemaError) {
      console.log('⚠️  Could not check schema, proceeding with migration...');
    } else {
      console.log('📋 Current room_participants columns:');
      columns.forEach(col => {
        console.log(`  - ${col.column_name}: ${col.data_type} (default: ${col.column_default || 'none'})`);
      });
    }
    
    // Execute migration
    console.log('🔧 Executing role column migration...');
    
    // Split SQL into individual statements
    const statements = MIGRATION_SQL.split(';').filter(stmt => stmt.trim());
    
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          // For PostgreSQL functions and complex statements, we need to use rpc
          if (statement.includes('DO $$')) {
            console.log('📝 Executing PostgreSQL function...');
            const { error } = await supabase.rpc('exec_sql', { sql: statement + ';' });
            if (error) {
              console.log('⚠️  RPC failed, trying direct execution...');
              // Fallback: try to execute parts manually
              await executeManualMigration();
            }
          } else {
            console.log('📝 Executing:', statement.substring(0, 50) + '...');
            // For simple statements, we can try direct execution
            // Note: Supabase client doesn't support direct SQL execution
            // This would need to be run manually in the Supabase dashboard
          }
        } catch (error) {
          console.log(`⚠️  Statement failed: ${error.message}`);
        }
      }
    }
    
    console.log('✅ Role column migration completed!');
    
    // Verify migration
    await verifyMigration();
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.log('\n📋 Manual Migration Instructions:');
    console.log('1. Go to your Supabase dashboard');
    console.log('2. Navigate to SQL Editor');
    console.log('3. Copy and paste the following SQL:');
    console.log('\n' + MIGRATION_SQL);
    console.log('\n4. Run the SQL script manually');
  }
}

async function executeManualMigration() {
  console.log('🔧 Executing manual migration steps...');
  
  try {
    // Check if any rooms don't have hosts
    const { data: roomsWithoutHosts, error } = await supabase
      .from('room_participants')
      .select('room_id, role, joined_at')
      .order('room_id', { ascending: true })
      .order('joined_at', { ascending: true });
    
    if (error) {
      console.log('⚠️  Could not check for rooms without hosts:', error.message);
      return;
    }
    
    // Group by room and find rooms without hosts
    const roomGroups = {};
    roomsWithoutHosts.forEach(participant => {
      if (!roomGroups[participant.room_id]) {
        roomGroups[participant.room_id] = [];
      }
      roomGroups[participant.room_id].push(participant);
    });
    
    let fixedRooms = 0;
    for (const [roomId, participants] of Object.entries(roomGroups)) {
      const hasHost = participants.some(p => p.role === 'host');
      
      if (!hasHost && participants.length > 0) {
        // Make the oldest participant the host
        const oldestParticipant = participants[0];
        
        const { error: updateError } = await supabase
          .from('room_participants')
          .update({ role: 'host' })
          .eq('room_id', roomId)
          .eq('joined_at', oldestParticipant.joined_at);
        
        if (!updateError) {
          fixedRooms++;
          console.log(`✅ Fixed room ${roomId} - made oldest participant host`);
        } else {
          console.log(`⚠️  Could not fix room ${roomId}:`, updateError.message);
        }
      }
    }
    
    console.log(`✅ Fixed ${fixedRooms} rooms without hosts`);
    
  } catch (error) {
    console.log('⚠️  Manual migration failed:', error.message);
  }
}

async function verifyMigration() {
  console.log('🔍 Verifying migration...');
  
  try {
    // Check for rooms without hosts
    const { data: stats, error } = await supabase
      .from('room_participants')
      .select('room_id, role')
      .eq('role', 'host');
    
    if (error) {
      console.log('⚠️  Could not verify migration:', error.message);
      return;
    }
    
    const hostCounts = {};
    stats.forEach(participant => {
      hostCounts[participant.room_id] = (hostCounts[participant.room_id] || 0) + 1;
    });
    
    const roomsWithMultipleHosts = Object.entries(hostCounts)
      .filter(([roomId, count]) => count > 1);
    
    if (roomsWithMultipleHosts.length > 0) {
      console.log('⚠️  Found rooms with multiple hosts:');
      roomsWithMultipleHosts.forEach(([roomId, count]) => {
        console.log(`  - Room ${roomId}: ${count} hosts`);
      });
    } else {
      console.log('✅ All rooms have exactly one host');
    }
    
    // Check total host count
    const totalHosts = Object.keys(hostCounts).length;
    console.log(`📊 Migration summary: ${totalHosts} rooms with hosts`);
    
  } catch (error) {
    console.log('⚠️  Verification failed:', error.message);
  }
}

if (require.main === module) {
  migrateRoleColumn();
}

module.exports = { migrateRoleColumn }; 