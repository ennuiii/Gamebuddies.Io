/**
 * Stripe Client Configuration
 * Initialize Stripe with secret key from environment
 */

const Stripe = require('stripe');

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('⚠️  STRIPE_SECRET_KEY is not set in environment variables');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16', // Use latest stable API version
});

module.exports = stripe;
