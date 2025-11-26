import { createProxyMiddleware, Options as ProxyOptions } from 'http-proxy-middleware';
import { Application, Request, Response } from 'express';
import { Server as HttpServer } from 'http';
import { IncomingMessage } from 'http';
import { Socket } from 'net';
import { db } from './supabase';

interface ProxyConfig {
  path: string;
  target: string;
  pathRewrite: Record<string, string>;
  ws: boolean;
}

interface FilteredLogger {
  log: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (message: unknown, ...args: unknown[]) => void;
}

// Global WebSocket error suppression function
const isNavigationError = (err: Error & { code?: string }): boolean => {
  const suppressedCodes = ['ERR_STREAM_WRITE_AFTER_END', 'ECONNRESET', 'EPIPE', 'ENOTFOUND'];
  const suppressedMessages = [
    'write after end',
    'connection was terminated',
    'socket hang up',
    'read ECONNRESET',
    'write EPIPE'
  ];

  return suppressedCodes.includes(err.code || '') ||
    suppressedMessages.some(msg => err.message?.includes(msg));
};

const createFilteredLogger = (): FilteredLogger => {
  const base = console;
  const suppress = (message: unknown, args: unknown[] | undefined): boolean => {
    try {
      const text = [message, ...(args || [])]
        .map((a) => (a && (a as Error).stack ? (a as Error).stack : String(a)))
        .join(' ');
      return (
        text.includes('HPM WebSocket error') ||
        text.includes('ERR_STREAM_WRITE_AFTER_END') ||
        text.includes('ECONNRESET') ||
        text.includes('socket hang up')
      );
    } catch {
      return false;
    }
  };

  return {
    log: (...args: unknown[]) => base.log(...args),
    debug: (...args: unknown[]) => (base.debug ? base.debug(...args) : base.log(...args)),
    info: (...args: unknown[]) => (base.info ? base.info(...args) : base.log(...args)),
    warn: (...args: unknown[]) => (base.warn ? base.warn(...args) : base.log(...args)),
    error: (message: unknown, ...args: unknown[]) => {
      if (suppress(message, args)) return;
      base.error(message, ...args);
    },
  };
};

class ProxyManager {
  private _gameProxies: Record<string, ProxyConfig>;
  private proxyInstances: Record<string, ReturnType<typeof createProxyMiddleware>>;

  constructor() {
    this._gameProxies = {};
    this.proxyInstances = {};
  }

  /**
   * Get the game proxy configurations
   */
  get gameProxies(): Record<string, ProxyConfig> {
    return this._gameProxies;
  }

  // Function to load game proxies from database
  async loadGameProxiesFromDatabase(): Promise<Record<string, ProxyConfig>> {
    try {
      console.log('[PROXY] 🔄 Loading game configurations from database...');

      const { data: games, error } = await db.client
        .from('games')
        .select('*')
        .eq('is_active', true)
        .eq('is_external', true); // Only external games need proxies

      if (error) {
        console.error('[PROXY] ❌ Error loading games from database:', error);
        return {};
      }

      const proxies: Record<string, ProxyConfig> = {};

      for (const game of games || []) {
        const gameId = game.id as string;
        const gameIdUpper = gameId.toUpperCase();

        // Use environment variable if available, otherwise use base_url from database
        const envVarName = `${gameIdUpper}_URL`;
        const target = process.env[envVarName] || game.base_url;

        // Helper for env bool
        const envBool = (name: string, defaultVal: boolean): boolean => {
          const v = process.env[name];
          if (v == null) return defaultVal;
          return /^(1|true|yes|on)$/i.test(String(v).trim());
        };

        proxies[gameId] = {
          path: `/${gameId}`,
          target: target,
          pathRewrite: { [`^/${gameId}`]: '' },
          ws: envBool(`${gameIdUpper}_WS`, false)
        };

        console.log(`[PROXY] ✅ Configured ${gameId}: /${gameId} -> ${target}`);
      }

      console.log(`[PROXY] 🎮 Loaded ${Object.keys(proxies).length} game proxies from database`);
      return proxies;

    } catch (err) {
      console.error('[PROXY] ❌ Unexpected error loading game proxies:', err);
      return {};
    }
  }

  // Function to setup all game proxies
  async setupGameProxies(app: Application, server: HttpServer): Promise<void> {
    // Load proxies from database
    this._gameProxies = await this.loadGameProxiesFromDatabase();

    // Setup each proxy
    Object.entries(this._gameProxies).forEach(([key, proxy]) => {
      console.log(`🔗 [PROXY] Setting up ${key.toUpperCase()} proxy: ${proxy.path} -> ${proxy.target}`);

      // Base proxy configuration
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const proxyConfig: any = {
        target: proxy.target,
        changeOrigin: true,
        pathRewrite: proxy.pathRewrite,
        ws: proxy.ws !== false, // Use individual proxy ws setting, default to true
        logger: createFilteredLogger(),

        // Enhanced error handling to prevent connection loops
        on: {
          error: (err: Error, req: IncomingMessage, res: unknown) => {
            // Only log real errors, not connection resets from unreachable services
            if (!isNavigationError(err as Error & { code?: string }) && (err as Error & { code?: string }).code !== 'ECONNRESET') {
              console.error(`❌ [PROXY] ${key.toUpperCase()} error: ${err.message}`);
            }

            // Only send response if not already sent and not a WebSocket upgrade
            const response = res as Response;
            if (response && !response.headersSent && !(req as Request).headers?.upgrade) {
              response.status(503).json({
                error: `${key.toUpperCase()} game service is temporarily unavailable`,
                message: 'The game server may be starting up or temporarily down. Please try again in a few moments.',
                service: key,
                target: proxy.target
              });
            }
          }
        }
      };

      const proxyMiddleware = createProxyMiddleware(proxyConfig);

      this.proxyInstances[proxy.path] = proxyMiddleware;
      app.use(proxy.path, proxyMiddleware);
    });

    // Handle WebSocket upgrade requests for proxied game services
    server.on('upgrade', (request: IncomingMessage, socket: Socket, head: Buffer) => {
      const pathname = request.url || '';

      // Never interfere with Socket.IO's own upgrade handling
      if (pathname.startsWith('/socket.io')) {
        return; // Let socket.io's listener handle this entirely
      }

      // Check if this is a request for one of our proxied game services
      for (const [key, proxy] of Object.entries(this._gameProxies)) {
        if (pathname.startsWith(proxy.path)) {
          // Skip WebSocket upgrades for proxies that have ws disabled
          if (proxy.ws === false) {
            console.log(`🚫 [PROXY] Skipping WebSocket upgrade for ${proxy.path} (ws disabled)`);
            socket.destroy();
            return;
          }

          const proxyMiddleware = this.proxyInstances[proxy.path] as ReturnType<typeof createProxyMiddleware> & {
            upgrade?: (req: IncomingMessage, socket: Socket, head: Buffer) => void;
          };
          if (proxyMiddleware && proxyMiddleware.upgrade) {
            try {
              // Attach error logging only for proxied sockets
              socket.on('error', (err: Error) => {
                if (!isNavigationError(err as Error & { code?: string })) {
                  console.error('Server upgrade socket error:', err.message);
                }
              });
              // Let the proxy handle the WebSocket upgrade
              proxyMiddleware.upgrade(request, socket, head);
              return;
            } catch (err) {
              if (!isNavigationError(err as Error & { code?: string })) {
                console.error(`WebSocket upgrade error for ${proxy.path}:`, (err as Error).message);
              }
              socket.destroy();
              return;
            }
          }
        }
      }

      // If not a proxy path, Socket.IO will handle its own upgrades
    });
  }
}

export default ProxyManager;
