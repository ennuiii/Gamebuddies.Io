import express, { Application } from 'express';
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
export declare function setupMiddleware(app: Application): void;
/**
 * Setup Stripe webhook route with raw body parsing
 * Must be called BEFORE setupMiddleware to preserve raw body
 */
export declare function setupStripeWebhook(app: Application, stripeRouter: express.Router): void;
//# sourceMappingURL=middleware.d.ts.map