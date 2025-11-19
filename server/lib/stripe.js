/**
 * Stripe Client Configuration
 * Initialize Stripe with secret key from environment
 */

const Stripe = require('stripe');

console.log('🔐 [STRIPE LIB] Initializing Stripe library...');
console.log('🔐 [STRIPE LIB] STRIPE_SECRET_KEY exists:', !!process.env.STRIPE_SECRET_KEY);
console.log('🔐 [STRIPE LIB] STRIPE_SECRET_KEY starts with:', process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.substring(0, 7) : 'NOT SET');

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('❌ [STRIPE LIB] STRIPE_SECRET_KEY is not set in environment variables!');
  console.error('❌ [STRIPE LIB] Stripe will not work without this key!');
} else if (!process.env.STRIPE_SECRET_KEY.startsWith('sk_')) {
  console.error('❌ [STRIPE LIB] STRIPE_SECRET_KEY does not start with "sk_" - invalid key format!');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16', // Use latest stable API version
});

console.log('✅ [STRIPE LIB] Stripe client initialized');

module.exports = stripe;
