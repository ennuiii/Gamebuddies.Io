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
      case 'cleanup':
        await runCleanup(args.slice(1));
        break;
      case 'dry-run':
        await runDryRun(args.slice(1));
        break;
      case 'aggressive':
        await runAggressiveCleanup();
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

async function runDryRun(args) {
  const options = parseCleanupArgs(args);
  options.dryRun = true;
  
  console.log('🔍 DRY RUN - No rooms will be deleted\n');
  console.log('Options:', options);
  console.log('');
  
  const result = await db.cleanupInactiveRooms(options);
  
  console.log('\n📋 DRY RUN RESULTS');
  console.log('==================');
  console.log(`Rooms that would be cleaned: ${result.wouldClean}`);
  
  if (result.rooms.length > 0) {
    console.log('\nRoom codes that would be deleted:');
    result.rooms.forEach(code => console.log(`  - ${code}`));
  }
}

async function runCleanup(args) {
  const options = parseCleanupArgs(args);
  
  console.log('🧹 RUNNING ROOM CLEANUP\n');
  console.log('Options:', options);
  console.log('');
  
  const result = await db.cleanupInactiveRooms(options);
  
  console.log('\n✅ CLEANUP RESULTS');
  console.log('==================');
  console.log(`Rooms cleaned: ${result.cleaned}`);
  
  if (result.rooms.length > 0) {
    console.log('\nCleaned room codes:');
    result.rooms.forEach(code => console.log(`  - ${code}`));
  }
}

async function runAggressiveCleanup() {
  console.log('⚡ RUNNING AGGRESSIVE CLEANUP\n');
  
  const options = {
    maxAgeHours: 2,
    maxIdleMinutes: 15,
    includeAbandoned: true,
    includeCompleted: true,
    dryRun: false
  };
  
  console.log('Options:', options);
  console.log('');
  
  const result = await db.cleanupInactiveRooms(options);
  
  console.log('\n⚡ AGGRESSIVE CLEANUP RESULTS');
  console.log('=============================');
  console.log(`Rooms cleaned: ${result.cleaned}`);
  
  if (result.rooms.length > 0) {
    console.log('\nCleaned room codes:');
    result.rooms.forEach(code => console.log(`  - ${code}`));
  }
}

function parseCleanupArgs(args) {
  const options = {
    maxAgeHours: 24,
    maxIdleMinutes: 30,
    includeAbandoned: true,
    includeCompleted: true,
    dryRun: false
  };

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    
    switch (key) {
      case '--max-age':
        options.maxAgeHours = parseInt(value) || 24;
        break;
      case '--max-idle':
        options.maxIdleMinutes = parseInt(value) || 30;
        break;
      case '--no-abandoned':
        options.includeAbandoned = false;
        i--; // No value for this flag
        break;
      case '--no-completed':
        options.includeCompleted = false;
        i--; // No value for this flag
        break;
    }
  }
  
  return options;
}

function showHelp() {
  console.log('🧹 GAMEBUDDIES ROOM CLEANUP TOOL');
  console.log('=================================\n');
  
  console.log('Usage: node cleanup-rooms.js <command> [options]\n');
  
  console.log('Commands:');
  console.log('  stats                    Show room statistics');
  console.log('  dry-run [options]        Show what would be cleaned (no deletion)');
  console.log('  cleanup [options]        Clean up inactive rooms');
  console.log('  aggressive               Run aggressive cleanup (2h age, 15min idle)');
  console.log('  help                     Show this help message\n');
  
  console.log('Options for cleanup/dry-run:');
  console.log('  --max-age <hours>        Max room age in hours (default: 24)');
  console.log('  --max-idle <minutes>     Max idle time in minutes (default: 30)');
  console.log('  --no-abandoned           Don\'t include abandoned rooms');
  console.log('  --no-completed           Don\'t include completed games\n');
  
  console.log('Examples:');
  console.log('  node cleanup-rooms.js stats');
  console.log('  node cleanup-rooms.js dry-run');
  console.log('  node cleanup-rooms.js cleanup --max-age 12 --max-idle 60');
  console.log('  node cleanup-rooms.js aggressive');
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { main }; 