"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.corsOptions = exports.isAllowedOrigin = exports.allowedOrigins = void 0;
// Parse comma-separated origins from environment variable
const parseOrigins = (val) => (val || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
// Default allowed origins
const defaultOrigins = [
    'http://localhost:3000',
    'http://localhost:3033',
    'https://gamebuddies.io',
    'https://gamebuddies-homepage.onrender.com',
    'https://gamebuddies-client.onrender.com',
];
// Combine default and environment origins
const envOrigins = parseOrigins(process.env.CORS_ORIGINS);
exports.allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));
// Check if an origin is allowed
const isAllowedOrigin = (origin) => {
    if (!origin)
        return true; // allow non-browser clients
    if (exports.allowedOrigins.includes(origin))
        return true;
    try {
        const { hostname } = new URL(origin);
        // Permit our known host families
        if (hostname === 'gamebuddies.io' || hostname.endsWith('.gamebuddies.io'))
            return true;
        if (hostname.endsWith('.onrender.com'))
            return true;
    }
    catch {
        // Invalid URL
    }
    return false;
};
exports.isAllowedOrigin = isAllowedOrigin;
// CORS configuration object
exports.corsOptions = {
    origin: (origin, callback) => {
        if ((0, exports.isAllowedOrigin)(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};
//# sourceMappingURL=cors.js.map