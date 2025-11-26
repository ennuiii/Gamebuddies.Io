/**
 * In-memory tracker for when games start.
 * Used to distinguish between:
 * - Host navigating TO external game (rejoin within seconds of start)
 * - Host returning FROM external game (rejoin minutes after start)
 */

// Map: roomId -> timestamp when game started
const recentlyStartedGames = new Map<string, number>();

/**
 * Record when a game starts for a room.
 * Call this in the startGame handler after marking participants as in_game.
 */
export function recordGameStart(roomId: string): void {
  recentlyStartedGames.set(roomId, Date.now());
  console.log(`⏱️ [GAME TRACKER] Recorded game start for room ${roomId}`);
}

/**
 * Get the timestamp when a game started for a room.
 * Returns undefined if no game start was recorded.
 */
export function getGameStartTime(roomId: string): number | undefined {
  return recentlyStartedGames.get(roomId);
}

/**
 * Clear the game start record for a room.
 * Call this when the room transitions back to lobby.
 */
export function clearGameStart(roomId: string): void {
  if (recentlyStartedGames.has(roomId)) {
    recentlyStartedGames.delete(roomId);
    console.log(`⏱️ [GAME TRACKER] Cleared game start for room ${roomId}`);
  }
}

/**
 * Check if a game started recently (within threshold).
 * Used to prevent transitioning to lobby when host is navigating TO game.
 */
export function isGameStartRecent(roomId: string, thresholdMs: number = 10000): boolean {
  const startTime = recentlyStartedGames.get(roomId);
  if (!startTime) return false;

  const elapsed = Date.now() - startTime;
  return elapsed < thresholdMs;
}

// Cleanup old entries every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  const maxAge = 300000; // 5 minutes
  let cleaned = 0;

  for (const [roomId, startTime] of recentlyStartedGames) {
    if (now - startTime > maxAge) {
      recentlyStartedGames.delete(roomId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`⏱️ [GAME TRACKER] Cleaned up ${cleaned} stale entries`);
  }
}, 300000);
