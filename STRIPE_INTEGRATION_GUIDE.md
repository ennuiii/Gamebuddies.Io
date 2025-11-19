# Stripe Integration Guide - GameBuddies.io Premium

Complete guide for integrating Stripe payments with two premium tiers:
- **Lifetime Premium**: One-time payment of €29.99
- **Monthly Premium**: Recurring payment of €4.99/month

---

## 📋 Overview

### What We're Building:
1. **Premium Tiers**: Free, Lifetime, Monthly
2. **Payment Methods**: Stripe Checkout for both one-time and recurring
3. **Features**:
   - One-time payment for lifetime access
   - Monthly subscription with auto-renewal
   - Subscription management (cancel, upgrade)
   - Automatic premium status updates via webhooks
4. **User Experience**:
   - Premium badge in header
   - Pricing page with tier comparison
   - Payment success/cancel pages
   - Subscription management dashboard

---

## 🔧 Step 1: Stripe Account Setup

### 1.1 Create Stripe Account

1. Go to https://stripe.com
2. Click **Sign up**
3. Complete registration
4. Verify your email

### 1.2 Get API Keys

1. Go to **Stripe Dashboard**: https://dashboard.stripe.com
2. Click **Developers** → **API keys**
3. Copy your keys:
   - **Publishable key** (starts with `pk_test_` or `pk_live_`)
   - **Secret key** (starts with `sk_test_` or `sk_live_`)

⚠️ **Important**: Use **test mode** keys for development!

### 1.3 Create Products and Prices

#### Create Lifetime Premium Product:

1. Go to **Products** → **Add product**
2. Name: `Lifetime Premium`
3. Description: `Lifetime access to all premium features`
4. Pricing:
   - **One time**: €29.99
   - Currency: EUR
5. Click **Save product**
6. **Copy the Price ID** (starts with `price_`)

#### Create Monthly Premium Product:

1. Go to **Products** → **Add product**
2. Name: `Monthly Premium`
3. Description: `Monthly subscription with all premium features`
4. Pricing:
   - **Recurring**: €4.99 / month
   - Billing period: Monthly
   - Currency: EUR
5. Click **Save product**
6. **Copy the Price ID** (starts with `price_`)

---

## 🔧 Step 2: Environment Variables

### 2.1 Server Environment Variables

Add to `/server/.env`:

```env
# Stripe API Keys
STRIPE_SECRET_KEY=sk_test_...your_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_...your_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_...your_webhook_secret

# Stripe Price IDs
STRIPE_PRICE_LIFETIME=price_...your_lifetime_price_id
STRIPE_PRICE_MONTHLY=price_...your_monthly_price_id

# URLs
CLIENT_URL=https://gamebuddies.io
# For development: CLIENT_URL=http://localhost:3000
```

### 2.2 Client Environment Variables

Add to `/client/.env` (optional, for client-side):

```env
# Stripe Publishable Key (safe to expose)
REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_...your_publishable_key
```

---

## 🔧 Step 3: Install Stripe SDK

### Server:

```bash
cd server
npm install stripe
```

### Client (optional, if using Stripe Elements):

```bash
cd client
npm install @stripe/stripe-js @stripe/react-stripe-js
```

---

## 🔧 Step 4: Create Backend Endpoints

Files to create:
1. `/server/routes/stripe.js` - Payment endpoints
2. `/server/lib/stripe.js` - Stripe client configuration

These are created automatically by the implementation files below.

---

## 🔧 Step 5: Set Up Webhooks

### 5.1 Development (Stripe CLI)

For local testing:

```bash
# Install Stripe CLI
# macOS: brew install stripe/stripe-cli/stripe
# Windows: Download from https://github.com/stripe/stripe-cli/releases

# Login to Stripe
stripe login

# Forward webhooks to local server
stripe listen --forward-to http://localhost:3033/api/stripe/webhook

# This will give you a webhook secret (whsec_...)
# Add it to your .env as STRIPE_WEBHOOK_SECRET
```

### 5.2 Production (Stripe Dashboard)

1. Go to **Developers** → **Webhooks**
2. Click **Add endpoint**
3. Endpoint URL: `https://gamebuddies.io/api/stripe/webhook`
4. **Select events to listen to**:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Click **Add endpoint**
6. **Copy the Signing secret** (starts with `whsec_`)
7. Add to production `.env` as `STRIPE_WEBHOOK_SECRET`

---

## 🔧 Step 6: Database Setup

The database already has premium columns from earlier setup:
- `premium_tier` (free, monthly, lifetime)
- `premium_expires_at` (for monthly subscriptions)
- `stripe_customer_id` (Stripe customer ID)

But we need to add subscription ID tracking:

```sql
-- Add subscription tracking
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

CREATE INDEX IF NOT EXISTS idx_users_stripe_customer
ON public.users(stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_users_stripe_subscription
ON public.users(stripe_subscription_id);
```

---

## 🔧 Step 7: Frontend Pages

Create these pages:
1. `/client/src/pages/Premium.jsx` - Pricing page
2. `/client/src/pages/PaymentSuccess.jsx` - Success page
3. `/client/src/pages/PaymentCancel.jsx` - Cancel page

Add routes in `App.js`:

```jsx
import Premium from './pages/Premium';
import PaymentSuccess from './pages/PaymentSuccess';
import PaymentCancel from './pages/PaymentCancel';

// In your routes:
<Route path="/premium" element={<Premium />} />
<Route path="/payment/success" element={<PaymentSuccess />} />
<Route path="/payment/cancel" element={<PaymentCancel />} />
```

---

## 🔧 Step 8: Testing

### Test Cards:

Stripe provides test cards for different scenarios:

- **Successful payment**: `4242 4242 4242 4242`
- **Requires authentication**: `4000 0025 0000 3155`
- **Declined**: `4000 0000 0000 9995`

Use any future expiry date, any CVC, any ZIP code.

### Test Flow:

1. Go to `http://localhost:3000/premium`
2. Click **Get Lifetime Premium** or **Subscribe Monthly**
3. Enter test card: `4242 4242 4242 4242`
4. Complete checkout
5. Check webhook logs in terminal
6. Verify premium status in database
7. See premium badge in header

---

## 🔧 Step 9: Premium Features

### Check Premium Status:

```jsx
import { useAuth } from '../contexts/AuthContext';

const MyComponent = () => {
  const { user } = useAuth();

  const isPremium = user?.premium_tier === 'lifetime' ||
                    user?.premium_tier === 'monthly';

  const isLifetime = user?.premium_tier === 'lifetime';
  const isMonthly = user?.premium_tier === 'monthly';

  if (!isPremium) {
    return <UpgradePrompt />;
  }

  return <PremiumFeature />;
};
```

### Premium Features to Add:

1. **Ad-free experience**
2. **Custom avatars**
3. **Premium games/modes**
4. **Priority matchmaking**
5. **Custom room themes**
6. **Extended game history**
7. **Advanced statistics**
8. **Early access to new features**

---

## 🔧 Step 10: Subscription Management

### Cancel Subscription:

```jsx
const handleCancelSubscription = async () => {
  const response = await fetch('/api/stripe/cancel-subscription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: user.id })
  });

  if (response.ok) {
    alert('Subscription cancelled. You will retain access until the end of your billing period.');
  }
};
```

### Update Payment Method:

Create a customer portal session:

```jsx
const handleManageSubscription = async () => {
  const response = await fetch('/api/stripe/customer-portal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: user.id })
  });

  const { url } = await response.json();
  window.location.href = url;
};
```

---

## 📊 Pricing Recommendations

### Lifetime vs Monthly:

Current pricing:
- **Lifetime**: €29.99 (one-time)
- **Monthly**: €4.99/month

**Lifetime breakeven**: 6 months
- If a user stays for 6+ months, lifetime is better value
- Monthly gives flexibility for short-term users

### Alternative Pricing Strategies:

**Option 1: Add Annual**
- Monthly: €4.99/month
- Annual: €49.99/year (save 16%)
- Lifetime: €99.99

**Option 2: Tiered Features**
- Basic Premium: €2.99/month (some features)
- Pro Premium: €7.99/month (all features)
- Lifetime: €79.99

**Option 3: Lower Lifetime**
- Monthly: €4.99/month
- Lifetime: €19.99 (4 months breakeven)

---

## 🔒 Security Considerations

1. **Webhook Validation**: Always verify webhook signatures
2. **Idempotency**: Handle duplicate webhooks gracefully
3. **Rate Limiting**: Limit checkout session creation
4. **Customer Verification**: Verify user owns the customer ID
5. **Refund Handling**: Implement refund webhook handlers

---

## 📈 Go Live Checklist

Before switching to production:

- [ ] Switch to **live mode** API keys
- [ ] Update webhook endpoint to production URL
- [ ] Test live payment flow with real card
- [ ] Set up Stripe Radar for fraud prevention
- [ ] Configure email receipts in Stripe Dashboard
- [ ] Set up refund policy
- [ ] Add terms of service and privacy policy links
- [ ] Test subscription renewal
- [ ] Test subscription cancellation
- [ ] Monitor webhook delivery in Stripe Dashboard

---

## 🆘 Troubleshooting

### Payment Not Completing:

1. Check webhook is receiving events (Stripe Dashboard → Webhooks)
2. Check webhook signature is correct
3. Check server logs for errors
4. Verify database updates are happening

### Premium Not Showing:

1. Check user's `premium_tier` in database
2. Check `premium_expires_at` for monthly subscriptions
3. Verify AuthContext is refreshing user data
4. Check browser console for errors

### Webhook Failures:

1. Check endpoint is publicly accessible
2. Verify webhook secret is correct
3. Check webhook signature validation
4. Review Stripe Dashboard webhook logs

---

## 💰 Cost Breakdown

Stripe fees (as of 2024):
- **EU cards**: 1.4% + €0.25 per transaction
- **Non-EU cards**: 2.9% + €0.25 per transaction

Example (EU card):
- **Lifetime (€29.99)**: €29.99 - (€29.99 × 0.014 + €0.25) = **€29.32 net**
- **Monthly (€4.99)**: €4.99 - (€4.99 × 0.014 + €0.25) = **€4.67 net/month**

---

## 📚 Resources

- **Stripe Documentation**: https://stripe.com/docs
- **Stripe Testing**: https://stripe.com/docs/testing
- **Checkout Sessions**: https://stripe.com/docs/payments/checkout
- **Webhooks Guide**: https://stripe.com/docs/webhooks
- **Customer Portal**: https://stripe.com/docs/billing/subscriptions/customer-portal
