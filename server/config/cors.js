/**
 * CORS Configuration for GameBuddies
 *
 * Improved CORS configuration with stricter domain validation
 * to prevent unauthorized access from malicious Render.com apps.
 */

/**
 * Parse comma-separated origins from environment variable
 */
const parseOrigins = val =>
  (val || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

/**
 * Default allowed origins
 */
const defaultOrigins = [
  'http://localhost:3000',
  'http://localhost:3032',
  'http://localhost:3033',
  'https://gamebuddies.io',
  'https://www.gamebuddies.io',
];

/**
 * Specific Render.com apps that are allowed
 * (NOT wildcard - only specific subdomains)
 */
const allowedRenderApps = [
  'gamebuddies-homepage.onrender.com',
  'gamebuddies-client.onrender.com',
  'ddf-game.onrender.com',
  'schoolquizgame.onrender.com',
  'susd-1.onrender.com',
  'bingobuddies.onrender.com',
  'bumperballarenaclient.onrender.com',
];

/**
 * Get all allowed origins (defaults + environment + Render apps)
 */
const envOrigins = parseOrigins(process.env.CORS_ORIGINS);
const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));

/**
 * Check if an origin is allowed
 * @param {string} origin - The origin to check
 * @returns {boolean} Whether the origin is allowed
 */
const isAllowedOrigin = origin => {
  // Allow requests with no origin (e.g., mobile apps, Postman)
  if (!origin) return true;

  // Check if origin is in allowedOrigins list
  if (allowedOrigins.includes(origin)) return true;

  try {
    const url = new URL(origin);
    const hostname = url.hostname;

    // Check for specific gamebuddies.io domains
    if (hostname === 'gamebuddies.io' || hostname.endsWith('.gamebuddies.io')) {
      return true;
    }

    // Check for specific allowed Render.com apps (NOT wildcard!)
    if (allowedRenderApps.includes(hostname)) {
      return true;
    }

    // Reject all other origins
    return false;
  } catch (err) {
    // Invalid URL
    return false;
  }
};

/**
 * CORS options for Express
 */
const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Request-ID',
    'X-API-Key',
  ],
  exposedHeaders: ['X-Request-ID'],
  maxAge: 86400, // 24 hours - how long browsers can cache preflight results
};

module.exports = {
  corsOptions,
  isAllowedOrigin,
  allowedOrigins,
  allowedRenderApps,
};
