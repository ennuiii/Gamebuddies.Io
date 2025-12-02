import express, { Application, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { corsOptions } from './cors';

// Helmet security configuration
const helmetConfig = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "'wasm-unsafe-eval'"], // unsafe-eval for React dev, wasm-unsafe-eval for MediaPipe
      styleSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline needed for styled-components
      imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: [
        "'self'",
        'wss:', 'ws:', // WebSocket for Socket.io
        'https:', // Allow all HTTPS (Unsplash for virtual backgrounds, APIs, etc.)
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

// Extend Request type for webhook route
declare global {
  namespace Express {
    interface Request {
      isWebhookRoute?: boolean;
    }
  }
}

/**
 * Setup core middleware for the Express application
 * Note: Stripe webhook route must be mounted separately BEFORE calling this
 */
export function setupMiddleware(app: Application): void {
  // Behind Render/other proxies, respect X-Forwarded-* for IPs and protocol
  app.set('trust proxy', 1);

  // Security middleware
  app.use(helmet(helmetConfig));

  // Compression for responses
  app.use(compression());

  // Cookie parsing for session management
  app.use(cookieParser());

  // CORS configuration
  app.use(cors(corsOptions));

  // JSON body parsing (must come AFTER Stripe webhook route)
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
}

/**
 * Setup Stripe webhook route with raw body parsing
 * Must be called BEFORE setupMiddleware to preserve raw body
 */
export function setupStripeWebhook(
  app: Application,
  stripeRouter: express.Router
): void {
  console.log('🔌 [SERVER] Mounting Stripe webhook route at /api/stripe/webhook (RAW body)');

  app.post(
    '/api/stripe/webhook',
    express.raw({ type: 'application/json' }),
    async (req: Request, res: Response, next: NextFunction) => {
      // Forward to the stripe router's webhook handler
      req.url = '/webhook'; // Rewrite URL for the router
      req.isWebhookRoute = true; // Mark this as webhook route
      stripeRouter(req, res, next);
    }
  );
}
