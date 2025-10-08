/**
 * Game Keep-Alive Service
 *
 * Automatically pings all external game servers every 10 minutes
 * to prevent Render.com free tier from spinning them down.
 *
 * Features:
 * - Queries database for active external games
 * - Pings each game's /health endpoint
 * - Logs failures for monitoring
 * - Automatically discovers new games (no manual config)
 */

const supabase = require('../lib/supabase');

class GameKeepAliveService {
  constructor() {
    this.interval = null;
    this.pingInterval = 10 * 60 * 1000; // 10 minutes (Render spins down after 15)
    this.requestTimeout = 30000; // 30 second timeout per request
    this.isRunning = false;
  }

  /**
   * Start the keep-alive service
   */
  start() {
    if (this.isRunning) {
      console.log('[Keep-Alive] Service already running');
      return;
    }

    console.log('[Keep-Alive] Starting game keep-alive service...');
    console.log(`[Keep-Alive] Will ping games every ${this.pingInterval / 60000} minutes`);

    // Ping immediately on start
    this.pingAllGames();

    // Then ping every 10 minutes
    this.interval = setInterval(() => {
      this.pingAllGames();
    }, this.pingInterval);

    this.isRunning = true;
    console.log('[Keep-Alive] ✅ Service started successfully');
  }

  /**
   * Stop the keep-alive service
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      this.isRunning = false;
      console.log('[Keep-Alive] Service stopped');
    }
  }

  /**
   * Fetch all active external games from database
   */
  async getActiveGames() {
    try {
      const { data, error } = await supabase
        .from('games')
        .select('id, name, base_url')
        .eq('is_external', true)
        .eq('is_active', true)
        .not('base_url', 'is', null);

      if (error) {
        console.error('[Keep-Alive] Error fetching games:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('[Keep-Alive] Exception fetching games:', error);
      return [];
    }
  }

  /**
   * Ping a single game's health endpoint
   */
  async pingGame(game) {
    const startTime = Date.now();

    try {
      // Construct health URL
      // Handle both full URLs and relative paths
      let healthUrl;
      if (game.base_url.startsWith('http://') || game.base_url.startsWith('https://')) {
        healthUrl = `${game.base_url}/health`;
      } else {
        // If it's a relative path, it's behind GameBuddies proxy, skip pinging
        // (these are served by GameBuddies and don't need keep-alive)
        console.log(`[Keep-Alive] Skipping ${game.name} (proxied game, no external server)`);
        return { success: true, skipped: true };
      }

      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

      // Ping the health endpoint
      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'GameBuddies-KeepAlive/1.0'
        }
      });

      clearTimeout(timeoutId);

      const responseTime = Date.now() - startTime;

      if (response.ok) {
        console.log(`[Keep-Alive] ✅ ${game.name} (${game.id}) - ${response.status} - ${responseTime}ms`);
        return { success: true, responseTime, status: response.status };
      } else {
        console.warn(`[Keep-Alive] ⚠️  ${game.name} (${game.id}) - ${response.status} - ${responseTime}ms`);
        return { success: false, responseTime, status: response.status };
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;

      if (error.name === 'AbortError') {
        console.error(`[Keep-Alive] ❌ ${game.name} (${game.id}) - Timeout after ${this.requestTimeout}ms`);
      } else {
        console.error(`[Keep-Alive] ❌ ${game.name} (${game.id}) - Error: ${error.message}`);
      }

      return { success: false, error: error.message, responseTime };
    }
  }

  /**
   * Ping all active games
   */
  async pingAllGames() {
    const timestamp = new Date().toISOString();
    console.log(`\n[Keep-Alive] ========== PING CYCLE START: ${timestamp} ==========`);

    const games = await this.getActiveGames();

    if (games.length === 0) {
      console.log('[Keep-Alive] No active external games found');
      console.log('[Keep-Alive] ========== PING CYCLE END ==========\n');
      return;
    }

    console.log(`[Keep-Alive] Found ${games.length} active external game(s) to ping`);

    // Ping all games (sequentially to avoid overwhelming the network)
    const results = [];
    for (const game of games) {
      const result = await this.pingGame(game);
      results.push({ game: game.name, ...result });
    }

    // Summary
    const successful = results.filter(r => r.success && !r.skipped).length;
    const failed = results.filter(r => !r.success).length;
    const skipped = results.filter(r => r.skipped).length;

    console.log(`[Keep-Alive] Summary: ${successful} successful, ${failed} failed, ${skipped} skipped`);
    console.log('[Keep-Alive] ========== PING CYCLE END ==========\n');
  }
}

// Export singleton instance
module.exports = new GameKeepAliveService();
