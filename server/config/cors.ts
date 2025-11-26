import type { CorsOptions } from '../types';

// Parse comma-separated origins from environment variable
const parseOrigins = (val: string | undefined): string[] =>
  (val || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

// Default allowed origins
const defaultOrigins: string[] = [
  'http://localhost:3000',
  'http://localhost:3033',
  'https://gamebuddies.io',
  'https://gamebuddies-homepage.onrender.com',
  'https://gamebuddies-client.onrender.com',
];

// Combine default and environment origins
const envOrigins = parseOrigins(process.env.CORS_ORIGINS);
export const allowedOrigins: string[] = Array.from(new Set([...defaultOrigins, ...envOrigins]));

// Check if an origin is allowed
export const isAllowedOrigin = (origin: string | undefined): boolean => {
  if (!origin) return true; // allow non-browser clients
  if (allowedOrigins.includes(origin)) return true;

  try {
    const { hostname } = new URL(origin);
    // Permit our known host families
    if (hostname === 'gamebuddies.io' || hostname.endsWith('.gamebuddies.io')) return true;
    if (hostname.endsWith('.onrender.com')) return true;
  } catch {
    // Invalid URL
  }

  return false;
};

// CORS configuration object
export const corsOptions: CorsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};
