"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
exports.createApp = createApp;
exports.setupFinalRoutes = setupFinalRoutes;
const express_1 = __importDefault(require("express"));
const supabase_1 = require("./lib/supabase");
Object.defineProperty(exports, "db", { enumerable: true, get: function () { return supabase_1.db; } });
// Route imports
const gameApiV2_1 = __importDefault(require("./routes/gameApiV2"));
const games_1 = __importDefault(require("./routes/games"));
const auth_1 = __importDefault(require("./routes/auth"));
const friends_1 = __importDefault(require("./routes/friends"));
const admin_1 = __importDefault(require("./routes/admin"));
const stripe_1 = __importDefault(require("./routes/stripe"));
const avatars_1 = __importDefault(require("./routes/avatars"));
// Config imports
const middleware_1 = require("./config/middleware");
const staticRoutes_1 = require("./config/staticRoutes");
const errorHandler_1 = require("./middleware/errorHandler");
/**
 * Create and configure the Express application
 */
function createApp(io, dbService, connectionManager) {
    const app = (0, express_1.default)();
    // Setup Stripe webhook BEFORE other middleware (needs raw body)
    (0, middleware_1.setupStripeWebhook)(app, stripe_1.default);
    // Setup core middleware (helmet, compression, cors, etc.)
    (0, middleware_1.setupMiddleware)(app);
    // Setup core static routes (client build, avatars, screenshots)
    (0, staticRoutes_1.setupCoreStaticRoutes)(app);
    // Mount API routes
    console.log('🔌 [SERVER] Mounting API routes...');
    // Game API V2 routes (external game integration)
    app.use('/api/v2/game', (0, gameApiV2_1.default)(io, dbService, connectionManager));
    // DDF compatibility routes (separate from main V2 for legacy support)
    // Note: This is commented out - DDF uses the main V2 routes
    // app.use('/api/v2/ddf', gameApiV2DDFRouter(io, dbService, connectionManager));
    // Standard API routes
    app.use('/api/games', games_1.default);
    app.use('/api/auth', auth_1.default);
    app.use('/api/friends', friends_1.default);
    app.use('/api/admin', admin_1.default);
    app.use('/api', auth_1.default); // Mount /users endpoint at /api/users
    app.use('/api/avatars', avatars_1.default);
    app.use('/api/stripe', stripe_1.default);
    // Supabase config endpoint for frontend
    app.get('/api/supabase-config', (req, res) => {
        try {
            const config = {
                url: process.env.SUPABASE_URL,
                anonKey: process.env.SUPABASE_ANON_KEY
            };
            console.log('📡 [API] Providing Supabase config to frontend:', {
                url: config.url ? `${config.url.substring(0, 20)}...` : 'MISSING',
                anonKey: config.anonKey ? `${config.anonKey.substring(0, 20)}...` : 'MISSING'
            });
            res.json(config);
        }
        catch (error) {
            console.error('❌ Error providing Supabase config:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get Supabase configuration'
            });
        }
    });
    // Game session lookup endpoint (for external games)
    app.get('/api/game-sessions/:token', async (req, res) => {
        try {
            const { token } = req.params;
            const now = new Date().toISOString();
            console.log('🔍 [SESSION LOOKUP] Incoming request:', {
                token: token ? token.substring(0, 8) + '...' : 'null',
                timestamp: now
            });
            if (!token) {
                return res.status(400).json({ error: 'Session token is required' });
            }
            // Look up session token
            const { data: session, error: sessionError } = await dbService.adminClient
                .from('game_sessions')
                .select('*')
                .eq('session_token', token)
                .gt('expires_at', now)
                .single();
            if (sessionError || !session) {
                console.log('❌ [SESSION LOOKUP] Session not found or expired');
                return res.status(404).json({ error: 'Invalid or expired session' });
            }
            console.log('✅ [SESSION LOOKUP] Session found:', {
                playerId: session.player_id,
                roomCode: session.room_code,
                gameType: session.game_type
            });
            res.json({
                success: true,
                session: {
                    playerId: session.player_id,
                    roomCode: session.room_code,
                    gameType: session.game_type,
                    isHost: session.metadata?.is_host || false,
                    playerName: session.metadata?.player_name || 'Player',
                    premiumTier: session.metadata?.premium_tier || 'free',
                    avatarUrl: session.metadata?.avatar_url,
                    avatarStyle: session.metadata?.avatar_style,
                    avatarSeed: session.metadata?.avatar_seed,
                    avatarOptions: session.metadata?.avatar_options,
                    streamerMode: session.streamer_mode || false
                }
            });
        }
        catch (error) {
            console.error('❌ Session lookup error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    // Generate invite token for streamer mode room
    app.post('/api/rooms/:roomCode/generate-invite', async (req, res) => {
        try {
            const { roomCode } = req.params;
            const crypto = await Promise.resolve().then(() => __importStar(require('crypto')));
            const { data: room, error: roomError } = await dbService.adminClient
                .from('rooms')
                .select('id, streamer_mode, host_id')
                .eq('room_code', roomCode)
                .single();
            if (roomError || !room) {
                return res.status(404).json({ error: 'Room not found' });
            }
            if (!room.streamer_mode) {
                return res.status(400).json({ error: 'Room is not in streamer mode' });
            }
            const inviteToken = crypto.randomBytes(16).toString('hex');
            const { error: inviteError } = await dbService.adminClient
                .from('room_invites')
                .insert({
                room_id: room.id,
                token: inviteToken,
                created_by: room.host_id,
                uses_remaining: null
            });
            if (inviteError) {
                console.error('Error creating invite:', inviteError);
                return res.status(500).json({ error: 'Failed to generate invite' });
            }
            const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
            const host = req.get('host');
            const baseUrl = process.env.BASE_URL || `${protocol}://${host}`;
            const inviteUrl = `${baseUrl}/?invite=${inviteToken}`;
            res.json({
                success: true,
                inviteUrl,
                token: inviteToken
            });
        }
        catch (error) {
            console.error('❌ Generate invite error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    // Resolve invite token to room code
    app.post('/api/invites/resolve', async (req, res) => {
        try {
            const { inviteToken } = req.body;
            if (!inviteToken) {
                return res.status(400).json({ error: 'Invite token is required' });
            }
            const { data: invite, error: inviteError } = await dbService.adminClient
                .from('room_invites')
                .select(`*, room:rooms(*)`)
                .eq('token', inviteToken)
                .gt('expires_at', new Date().toISOString())
                .single();
            if (inviteError || !invite) {
                return res.status(404).json({ error: 'Invalid or expired invite' });
            }
            if (invite.uses_remaining !== null && invite.uses_remaining <= 0) {
                return res.status(403).json({ error: 'Invite link has been fully used' });
            }
            if (invite.uses_remaining !== null) {
                await dbService.adminClient
                    .from('room_invites')
                    .update({ uses_remaining: invite.uses_remaining - 1 })
                    .eq('id', invite.id);
            }
            res.json({
                success: true,
                roomCode: invite.room.room_code,
                roomData: invite.room
            });
        }
        catch (error) {
            console.error('❌ Resolve invite error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    console.log('✅ API routes mounted');
    return app;
}
/**
 * Setup final routes that must come after proxies
 * (game static routes and catch-all)
 */
function setupFinalRoutes(app) {
    (0, staticRoutes_1.setupGameStaticRoutes)(app);
    (0, staticRoutes_1.setupCatchAllRoute)(app);
    (0, errorHandler_1.setupErrorMiddleware)(app);
}
//# sourceMappingURL=app.js.map