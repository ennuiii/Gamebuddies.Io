#!/usr/bin/env node

const { db } = require('../lib/supabase');

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  try {
    switch (command) {
      case 'stats':
        await showStats();
        break;
      case 'help':
      default:
        showHelp();
        break;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

async function showStats() {
  console.log('📊 Getting room statistics...\n');
  
  const stats = await db.getRoomStats();
  if (!stats) {
    console.log('❌ Failed to get room statistics');
    return;
  }

  console.log('🏠 ROOM STATISTICS');
  console.log('==================');
  console.log(`Total rooms: ${stats.total}`);
  
  console.log('\n📈 By Status:');
  Object.entries(stats.byStatus).forEach(([status, count]) => {
    console.log(`  ${status}: ${count}`);
  });
  
  console.log('\n⏰ By Age:');
  console.log(`  Last hour: ${stats.byAge.lastHour}`);
  console.log(`  Last day: ${stats.byAge.lastDay}`);
  console.log(`  Last week: ${stats.byAge.lastWeek}`);
  console.log(`  Older: ${stats.byAge.older}`);
  
  console.log('\n🔄 By Activity:');
  console.log(`  Active (< 10 min): ${stats.byActivity.active}`);
  console.log(`  Idle (< 1 hour): ${stats.byActivity.idle}`);
  console.log(`  Stale (> 1 hour): ${stats.byActivity.stale}`);
}

function showHelp() {
  console.log('🧹 GAMEBUDDIES ROOM STATISTICS TOOL');
  console.log('===================================\n');
  
  console.log('Usage: node cleanup-rooms.js <command>\n');
  
  console.log('Commands:');
  console.log('  stats                    Show room statistics');
  console.log('  help                     Show this help message\n');
  
  console.log('Note: Room cleanup is now handled by database cron jobs.\n');
  
  console.log('Examples:');
  console.log('  node cleanup-rooms.js stats');
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { main }; 