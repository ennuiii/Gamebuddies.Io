/**
 * BUG FIX #5: Game State Persistence
 * Periodically saves in-memory game state to disk to survive server restarts
 */

import fs from 'fs';
import path from 'path';
import type { GameState } from '../types';

const STATE_FILE = path.join(process.cwd(), 'data', 'game-state.json');
const PERSIST_INTERVAL_MS = 30000; // Save every 30 seconds

interface SerializedGameState {
  tugOfWarState: [string, unknown][];
  tugOfWarTeams: [string, unknown][];
  roomActivityCache: [string, unknown][];
  savedAt: string;
}

let persistInterval: NodeJS.Timeout | null = null;

/**
 * Ensure data directory exists
 */
function ensureDataDir(): void {
  const dataDir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log(`📁 [PERSIST] Created data directory: ${dataDir}`);
  }
}

/**
 * Serialize game state for JSON storage
 */
function serializeGameState(gameState: GameState): SerializedGameState {
  return {
    tugOfWarState: Array.from(gameState.tugOfWarState.entries()),
    tugOfWarTeams: Array.from(gameState.tugOfWarTeams.entries()),
    roomActivityCache: Array.from(gameState.roomActivityCache.entries()),
    savedAt: new Date().toISOString(),
  };
}

/**
 * Save game state to disk
 */
export function saveGameState(gameState: GameState): boolean {
  try {
    ensureDataDir();
    const serialized = serializeGameState(gameState);
    fs.writeFileSync(STATE_FILE, JSON.stringify(serialized, null, 2));
    console.log(`💾 [PERSIST] Game state saved (${gameState.tugOfWarState.size} tug games, ${gameState.roomActivityCache.size} rooms)`);
    return true;
  } catch (error) {
    console.error('❌ [PERSIST] Failed to save game state:', error);
    return false;
  }
}

/**
 * Load game state from disk
 */
export function loadGameState(gameState: GameState): boolean {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      console.log('📂 [PERSIST] No saved state file found - starting fresh');
      return false;
    }

    const data = fs.readFileSync(STATE_FILE, 'utf-8');
    const saved: SerializedGameState = JSON.parse(data);

    // Check if saved state is too old (>1 hour)
    const savedTime = new Date(saved.savedAt).getTime();
    const age = Date.now() - savedTime;
    if (age > 3600000) {
      console.log(`📂 [PERSIST] Saved state too old (${Math.round(age / 60000)} min) - starting fresh`);
      fs.unlinkSync(STATE_FILE);
      return false;
    }

    // Restore state
    gameState.tugOfWarState.clear();
    gameState.tugOfWarTeams.clear();
    gameState.roomActivityCache.clear();

    for (const [key, value] of saved.tugOfWarState) {
      gameState.tugOfWarState.set(key, value);
    }
    for (const [key, value] of saved.tugOfWarTeams) {
      gameState.tugOfWarTeams.set(key, value);
    }
    for (const [key, value] of saved.roomActivityCache) {
      gameState.roomActivityCache.set(key, value);
    }

    console.log(`📂 [PERSIST] Game state restored from ${saved.savedAt}`);
    console.log(`   - Tug of War games: ${gameState.tugOfWarState.size}`);
    console.log(`   - Room activity cache: ${gameState.roomActivityCache.size}`);
    return true;
  } catch (error) {
    console.error('❌ [PERSIST] Failed to load game state:', error);
    return false;
  }
}

/**
 * Start periodic persistence
 */
export function startPersistence(gameState: GameState): void {
  if (persistInterval) {
    clearInterval(persistInterval);
  }

  // Load existing state on startup
  loadGameState(gameState);

  // Start periodic saves
  persistInterval = setInterval(() => {
    // Only save if there's data to save
    if (gameState.tugOfWarState.size > 0 || gameState.roomActivityCache.size > 0) {
      saveGameState(gameState);
    }
  }, PERSIST_INTERVAL_MS);

  console.log(`💾 [PERSIST] Started periodic persistence (every ${PERSIST_INTERVAL_MS / 1000}s)`);
}

/**
 * Stop persistence and save final state
 */
export function stopPersistence(gameState: GameState): void {
  if (persistInterval) {
    clearInterval(persistInterval);
    persistInterval = null;
  }

  // Save final state before shutdown
  saveGameState(gameState);
  console.log('💾 [PERSIST] Persistence stopped - final state saved');
}

/**
 * Clean up stale entries from game state
 */
export function cleanupStaleEntries(gameState: GameState, maxAgeMs: number = 3600000): number {
  let cleaned = 0;
  const now = Date.now();

  // Clean roomActivityCache (entries with lastActivity older than maxAgeMs)
  for (const [roomCode, activity] of gameState.roomActivityCache) {
    const activityData = activity as { lastActivity?: number };
    if (activityData.lastActivity && now - activityData.lastActivity > maxAgeMs) {
      gameState.roomActivityCache.delete(roomCode);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`🧹 [PERSIST] Cleaned ${cleaned} stale entries from game state`);
  }

  return cleaned;
}
