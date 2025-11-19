/**
 * useGameSession Hook
 *
 * Generic hook for managing game session storage across all games
 * Provides a consistent interface for saving/loading game data in sessionStorage
 *
 * Usage:
 * const { saveSession, getSession, clearSession } = useGameSession('ddf');
 * saveSession('roomCode', 'ABC123');
 * const roomCode = getSession('roomCode'); // 'ABC123'
 */

export function useGameSession(gamePrefix: string) {
  /**
   * Save a value to sessionStorage with game prefix
   *
   * @param key - The key name (without prefix)
   * @param value - The value to store
   *
   * Example: saveSession('roomCode', 'ABC123')
   * Stores as: ddf_roomCode = 'ABC123'
   */
  const saveSession = (key: string, value: string) => {
    const prefixedKey = `${gamePrefix}_${key}`;
    try {
      sessionStorage.setItem(prefixedKey, value);
      console.log(`[${gamePrefix}] 💾 Saved session: ${prefixedKey} = ${value}`);
    } catch (error) {
      console.error(`[${gamePrefix}] Failed to save session:`, error);
    }
  };

  /**
   * Retrieve a value from sessionStorage with game prefix
   *
   * @param key - The key name (without prefix)
   * @returns The stored value or null if not found
   *
   * Example: getSession('roomCode') // 'ABC123'
   */
  const getSession = (key: string): string | null => {
    const prefixedKey = `${gamePrefix}_${key}`;
    try {
      return sessionStorage.getItem(prefixedKey);
    } catch (error) {
      console.error(`[${gamePrefix}] Failed to read session:`, error);
      return null;
    }
  };

  /**
   * Clear all session data for this game
   *
   * Removes all keys that start with the game prefix
   */
  const clearSession = () => {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith(`${gamePrefix}_`)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => sessionStorage.removeItem(key));
      console.log(`[${gamePrefix}] 🗑️  Cleared all session data (${keysToRemove.length} items)`);
    } catch (error) {
      console.error(`[${gamePrefix}] Failed to clear session:`, error);
    }
  };

  return { saveSession, getSession, clearSession };
}
