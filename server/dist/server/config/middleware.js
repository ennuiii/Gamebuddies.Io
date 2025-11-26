"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupMiddleware = setupMiddleware;
exports.setupStripeWebhook = setupStripeWebhook;
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const cors_1 = __importDefault(require("cors"));
const cors_2 = require("./cors");
// Helmet security configuration
const helmetConfig = {
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // unsafe-eval needed for React dev
            styleSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline needed for styled-components
            imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
            fontSrc: ["'self'", 'data:'],
            connectSrc: [
                "'self'",
                'wss:', 'ws:', // WebSocket for Socket.io
                'https://*.supabase.co', // Supabase real-time
                'https://*.onrender.com', // External games
            ],
            frameSrc: [
                "'self'",
                'https://ddf-game.onrender.com',
                'https://schoolquizgame.onrender.com',
                'https://susd-1.onrender.com',
                'https://bingobuddies.onrender.com',
                'https://bumperballarenaclient.onrender.com',
            ],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
        },
    },
    crossOriginEmbedderPolicy: false, // Keep disabled for iframe compatibility
};
/**
 * Setup core middleware for the Express application
 * Note: Stripe webhook route must be mounted separately BEFORE calling this
 */
function setupMiddleware(app) {
    // Behind Render/other proxies, respect X-Forwarded-* for IPs and protocol
    app.set('trust proxy', 1);
    // Security middleware
    app.use((0, helmet_1.default)(helmetConfig));
    // Compression for responses
    app.use((0, compression_1.default)());
    // Cookie parsing for session management
    app.use((0, cookie_parser_1.default)());
    // CORS configuration
    app.use((0, cors_1.default)(cors_2.corsOptions));
    // JSON body parsing (must come AFTER Stripe webhook route)
    app.use(express_1.default.json({ limit: '10mb' }));
    app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
}
/**
 * Setup Stripe webhook route with raw body parsing
 * Must be called BEFORE setupMiddleware to preserve raw body
 */
function setupStripeWebhook(app, stripeRouter) {
    console.log('🔌 [SERVER] Mounting Stripe webhook route at /api/stripe/webhook (RAW body)');
    app.post('/api/stripe/webhook', express_1.default.raw({ type: 'application/json' }), async (req, res, next) => {
        // Forward to the stripe router's webhook handler
        req.url = '/webhook'; // Rewrite URL for the router
        req.isWebhookRoute = true; // Mark this as webhook route
        stripeRouter(req, res, next);
    });
}
//# sourceMappingURL=middleware.js.map