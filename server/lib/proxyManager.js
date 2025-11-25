const { createProxyMiddleware } = require('http-proxy-middleware');
const { db } = require('./supabase');

// Global WebSocket error suppression function
const isNavigationError = (err) => {
    const suppressedCodes = ['ERR_STREAM_WRITE_AFTER_END', 'ECONNRESET', 'EPIPE', 'ENOTFOUND'];
    const suppressedMessages = [
        'write after end',
        'connection was terminated',
        'socket hang up',
        'read ECONNRESET',
        'write EPIPE'
    ];

    return suppressedCodes.includes(err.code) ||
        suppressedMessages.some(msg => err.message?.includes(msg));
};

const createFilteredLogger = () => {
    const base = console;
    const suppress = (message, args) => {
        try {
            const text = [message, ...(args || [])]
                .map((a) => (a && a.stack ? a.stack : String(a)))
                .join(' ');
            return (
                text.includes('HPM WebSocket error') ||
                text.includes('ERR_STREAM_WRITE_AFTER_END') ||
                text.includes('ECONNRESET') ||
                text.includes('socket hang up')
            );
        } catch (_) {
            return false;
        }
    };

    return {
        log: (...args) => base.log(...args),
        debug: (...args) => (base.debug ? base.debug(...args) : base.log(...args)),
        info: (...args) => (base.info ? base.info(...args) : base.log(...args)),
        warn: (...args) => (base.warn ? base.warn(...args) : base.log(...args)),
        error: (message, ...args) => {
            if (suppress(message, args)) return;
            base.error(message, ...args);
        },
    };
};

class ProxyManager {
    constructor() {
        this.gameProxies = {};
        this.proxyInstances = {};
    }

    // Function to load game proxies from database
    async loadGameProxiesFromDatabase() {
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

            const proxies = {};

            for (const game of games) {
                const gameId = game.id;
                const gameIdUpper = gameId.toUpperCase();

                // Use environment variable if available, otherwise use base_url from database
                const envVarName = `${gameIdUpper}_URL`;
                const target = process.env[envVarName] || game.base_url;

                // Helper for env bool
                const envBool = (name, defaultVal) => {
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
    async setupGameProxies(app, server) {
        // Load proxies from database
        this.gameProxies = await this.loadGameProxiesFromDatabase();

        // Setup each proxy
        Object.entries(this.gameProxies).forEach(([key, proxy]) => {
            console.log(`🔗 [PROXY] Setting up ${key.toUpperCase()} proxy: ${proxy.path} -> ${proxy.target}`);

            // Base proxy configuration
            const proxyConfig = {
                target: proxy.target,
                changeOrigin: true,
                pathRewrite: proxy.pathRewrite,
                timeout: 15000,
                proxyTimeout: 15000,
                ws: proxy.ws !== false, // Use individual proxy ws setting, default to true
                logLevel: process.env.PROXY_LOG_LEVEL || 'silent',
                logProvider: () => createFilteredLogger(),

                // Enhanced error handling to prevent connection loops
                onError: (err, req, res) => {
                    // Only log real errors, not connection resets from unreachable services
                    if (!isNavigationError(err) && err.code !== 'ECONNRESET') {
                        console.error(`❌ [PROXY] ${key.toUpperCase()} error: ${err.message}`);
                    }

                    // Only send response if not already sent and not a WebSocket upgrade
                    if (!res.headersSent && !req.headers.upgrade) {
                        res.status(503).json({
                            error: `${key.toUpperCase()} game service is temporarily unavailable`,
                            message: 'The game server may be starting up or temporarily down. Please try again in a few moments.',
                            service: key,
                            target: proxy.target
                        });
                    }
                }
            };

            const proxyMiddleware = createProxyMiddleware(proxyConfig);

            this.proxyInstances[proxy.path] = proxyMiddleware;
            app.use(proxy.path, proxyMiddleware);
        });

        // Handle WebSocket upgrade requests for proxied game services
        server.on('upgrade', (request, socket, head) => {
            const pathname = request.url || '';

            // Never interfere with Socket.IO's own upgrade handling
            if (pathname.startsWith('/socket.io')) {
                return; // Let socket.io's listener handle this entirely
            }

            // Check if this is a request for one of our proxied game services
            for (const [key, proxy] of Object.entries(this.gameProxies)) {
                if (pathname.startsWith(proxy.path)) {
                    // Skip WebSocket upgrades for proxies that have ws disabled
                    if (proxy.ws === false) {
                        console.log(`🚫 [PROXY] Skipping WebSocket upgrade for ${proxy.path} (ws disabled)`);
                        socket.destroy();
                        return;
                    }

                    const proxyMiddleware = this.proxyInstances[proxy.path];
                    if (proxyMiddleware && proxyMiddleware.upgrade) {
                        try {
                            // Attach error logging only for proxied sockets
                            socket.on('error', (err) => {
                                if (!isNavigationError(err)) {
                                    console.error('Server upgrade socket error:', err.message);
                                }
                            });
                            // Let the proxy handle the WebSocket upgrade
                            proxyMiddleware.upgrade(request, socket, head);
                            return;
                        } catch (err) {
                            if (!isNavigationError(err)) {
                                console.error(`WebSocket upgrade error for ${proxy.path}:`, err.message);
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

module.exports = ProxyManager;
