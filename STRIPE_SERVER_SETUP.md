# Stripe Server Integration Instructions

## Required Changes to server/index.js

To integrate Stripe payment endpoints, you need to make the following changes:

### 1. Add Stripe Router Import

Add this at the top with other router imports (around line 5):

```javascript
const stripeRouter = require('./routes/stripe');
```

### 2. Mount Stripe Webhook Route BEFORE JSON Middleware

**IMPORTANT**: The Stripe webhook needs raw body access for signature verification.
Add this BEFORE `app.use(express.json(...))` (around line 103):

```javascript
// Stripe webhook endpoint needs RAW body for signature verification
// Must be mounted BEFORE express.json() middleware
app.use('/api/stripe/webhook', stripeRouter);
```

### 3. Mount Stripe Router for Other Endpoints

Add this with other API route mountings (around line 1750, after authRouter):

```javascript
app.use('/api/stripe', stripeRouter); // Stripe payment endpoints
```

### Complete Example:

```javascript
// Around line 5 (imports):
const gameApiV2Router = require('./routes/gameApiV2');
const gameApiV2DDFRouter = require('./routes/gameApiV2_DDFCompatibility');
const gamesRouter = require('./routes/games');
const authRouter = require('./routes/auth');
const stripeRouter = require('./routes/stripe'); // ADD THIS
const express = require('express');

// ... other code ...

// Around line 100-105 (BEFORE express.json middleware):
app.use(compression());
app.use(cookieParser());
app.use(cors(corsOptions));

// Stripe webhook endpoint needs RAW body
app.use('/api/stripe/webhook', stripeRouter); // ADD THIS

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ... other code ...

// Around line 1750 (with other API routes):
app.use('/api/auth', authRouter);
app.use('/api', authRouter);
app.use('/api/stripe', stripeRouter); // ADD THIS
```

## Environment Variables

Add these to your `server/.env`:

```env
# Stripe API Keys (get from https://dashboard.stripe.com/apikeys)
STRIPE_SECRET_KEY=sk_test_...your_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_...your_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_...your_webhook_secret

# Stripe Price IDs (get after creating products in Stripe Dashboard)
STRIPE_PRICE_LIFETIME=price_...your_lifetime_price_id
STRIPE_PRICE_MONTHLY=price_...your_monthly_price_id

# Client URL (for redirect after payment)
CLIENT_URL=https://gamebuddies.io
# For development: CLIENT_URL=http://localhost:3000
```

## Install Stripe Package

```bash
cd server
npm install stripe
```

## Testing Webhook Locally

Use Stripe CLI to forward webhooks to your local server:

```bash
# Install Stripe CLI
# macOS: brew install stripe/stripe-cli/stripe
# Windows: https://github.com/stripe/stripe-cli/releases

# Login
stripe login

# Forward webhooks
stripe listen --forward-to http://localhost:3033/api/stripe/webhook

# This will give you a webhook secret starting with whsec_
# Add it to your .env as STRIPE_WEBHOOK_SECRET
```

## Endpoint Summary

After setup, these endpoints will be available:

1. **POST /api/stripe/create-checkout-session**
   - Create a Stripe Checkout session
   - Body: `{ userId, priceType: 'lifetime' | 'monthly' }`
   - Returns: `{ sessionId, url }`

2. **POST /api/stripe/webhook**
   - Handle Stripe webhook events
   - Automatically updates user premium status

3. **POST /api/stripe/customer-portal**
   - Create customer portal session for subscription management
   - Body: `{ userId }`
   - Returns: `{ url }`

4. **POST /api/stripe/cancel-subscription**
   - Cancel a user's subscription
   - Body: `{ userId }`
   - Returns: `{ message, endsAt }`

## Security Notes

1. **Webhook Signature Verification**: The webhook route verifies Stripe's signature to ensure requests are authentic
2. **User Verification**: All endpoints verify the user exists before processing
3. **Idempotency**: Webhook handlers are idempotent (safe to retry)
4. **Raw Body**: Webhook route is mounted before JSON middleware to access raw request body

## Troubleshooting

### Webhook Not Working:
- Check `STRIPE_WEBHOOK_SECRET` is correct
- Ensure webhook route is mounted BEFORE `express.json()`
- Check webhook signature in Stripe Dashboard

### Payment Not Completing:
- Check Stripe Dashboard logs
- Verify webhook is receiving events
- Check server console for errors

### "Missing API key" Error:
- Ensure `STRIPE_SECRET_KEY` is set in `.env`
- Restart server after adding environment variables
