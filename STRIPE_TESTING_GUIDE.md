# How to Test Stripe Without Paying

## ✅ Test Mode - FREE Testing!

Stripe has **Test Mode** that lets you test everything for free without real payments!

---

## 🚀 Quick Setup for Testing

### 1. Use Test API Keys

When you create your Stripe account, you'll see two sets of keys:

- **Live Mode** (real money) - DON'T use these for testing!
- **Test Mode** (fake money) - Use these!

In your `server/.env`, use the **test** keys:

```env
# Test mode keys (notice pk_test and sk_test)
STRIPE_SECRET_KEY=sk_test_51...your_test_key
STRIPE_PUBLISHABLE_KEY=pk_test_51...your_test_key
STRIPE_WEBHOOK_SECRET=whsec_test_...
STRIPE_PRICE_LIFETIME=price_...your_test_price_id
STRIPE_PRICE_MONTHLY=price_...your_test_price_id
CLIENT_URL=http://localhost:3000
```

### 2. Create Test Products

1. Make sure you're in **Test Mode** (toggle in Stripe Dashboard)
2. Go to **Products** → **Add product**
3. Create your products in test mode
4. Get the test Price IDs

---

## 💳 Stripe Test Cards

Use these **fake** credit card numbers for testing:

### ✅ Successful Payment
```
Card Number: 4242 4242 4242 4242
Expiry: Any future date (e.g., 12/34)
CVC: Any 3 digits (e.g., 123)
ZIP: Any ZIP code (e.g., 12345)
```

### 🔐 Requires Authentication (3D Secure)
```
Card Number: 4000 0025 0000 3155
```
This will show an authentication popup - click "Complete" to approve.

### ❌ Card Declined
```
Card Number: 4000 0000 0000 9995
```
This will fail with "Your card was declined"

### 💰 Insufficient Funds
```
Card Number: 4000 0000 0000 9995
```

### 🌍 International Cards
```
UK Card: 4000 0082 6000 0000
Germany Card: 4000 0027 6000 0016
```

**Full list**: https://stripe.com/docs/testing#cards

---

## 🧪 Testing Flow

### Test 1: Lifetime Payment

1. **Navigate to Premium page**:
   ```
   http://localhost:3000/premium
   ```

2. **Click "Get Lifetime Access"**

3. **Fill in Stripe Checkout**:
   - Email: your@email.com (any email)
   - Card: 4242 4242 4242 4242
   - Expiry: 12/34
   - CVC: 123
   - ZIP: 12345

4. **Click "Pay €29.99"**

5. **You should be redirected to**:
   ```
   http://localhost:3000/payment/success
   ```

6. **Check the database**:
   ```sql
   SELECT id, username, premium_tier, stripe_customer_id
   FROM public.users
   WHERE email = 'your@email.com';
   ```
   You should see `premium_tier = 'lifetime'`

7. **Check the header** - You should see ⭐ icon and "PREMIUM" badge

### Test 2: Monthly Subscription

1. **Navigate to Premium page**:
   ```
   http://localhost:3000/premium
   ```

2. **Click "Subscribe Now"** (Monthly tier)

3. **Fill in Stripe Checkout** with test card

4. **After payment**, check:
   - premium_tier = 'monthly'
   - stripe_subscription_id is set
   - premium_expires_at is ~1 month from now

5. **Check the header** - You should see 💎 icon and "PRO" badge

### Test 3: Cancel Subscription

1. **On Premium page**, click "Manage Subscription"

2. **This opens Stripe Customer Portal**

3. **Click "Cancel plan"**

4. **Confirm cancellation**

5. **Check webhook logs** in your server console:
   ```
   🗑️  [STRIPE WEBHOOK] Subscription deleted: sub_...
   ✅ [STRIPE WEBHOOK] Premium removed for user: ...
   ```

6. **Check database** - premium_tier should be back to 'free'

### Test 4: Payment Cancellation

1. **Click "Get Lifetime Access"**

2. **On Stripe Checkout**, click the **back arrow** or close the window

3. **You should be redirected to**:
   ```
   http://localhost:3000/payment/cancel
   ```

4. **No payment was made**, no database changes

---

## 🔍 Debugging Test Payments

### Check Stripe Dashboard

1. Go to: https://dashboard.stripe.com/test/payments
2. You'll see all test payments
3. Click on a payment to see details

### Check Webhook Events

1. Go to: https://dashboard.stripe.com/test/webhooks
2. Click your webhook endpoint
3. See all events received
4. Check for any errors

### Check Server Logs

Look for these in your terminal:

```bash
# Payment initiated
💳 [STRIPE] Creating checkout session: { userId: '...', priceType: 'lifetime' }

# Webhook received
🔔 [STRIPE WEBHOOK] Received: checkout.session.completed

# User updated
✅ [STRIPE WEBHOOK] User premium activated: ...
```

### Check Database

```sql
-- Check user's premium status
SELECT
  id,
  username,
  email,
  premium_tier,
  premium_expires_at,
  stripe_customer_id,
  stripe_subscription_id,
  created_at
FROM public.users
WHERE email = 'your@email.com';
```

---

## 🔧 Local Webhook Testing

For webhooks to work locally, you need the **Stripe CLI**:

### Install Stripe CLI

**macOS**:
```bash
brew install stripe/stripe-cli/stripe
```

**Windows**:
Download from https://github.com/stripe/stripe-cli/releases

**Linux**:
```bash
wget https://github.com/stripe/stripe-cli/releases/latest/download/stripe_linux_x86_64.tar.gz
tar -xvf stripe_linux_x86_64.tar.gz
sudo mv stripe /usr/local/bin/
```

### Setup Stripe CLI

```bash
# Login to Stripe
stripe login

# Forward webhooks to your local server
stripe listen --forward-to http://localhost:3033/api/stripe/webhook
```

This will output a webhook secret like:
```
> Ready! Your webhook signing secret is whsec_...
```

**Copy this secret** and add to your `.env`:
```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

Now when you make test payments, webhooks will automatically fire to your local server!

### Test Webhook Manually

```bash
# Trigger a test webhook
stripe trigger checkout.session.completed
```

---

## 📊 Test Scenarios Checklist

- [ ] Lifetime payment with successful card
- [ ] Monthly subscription with successful card
- [ ] Payment with declined card (should show error)
- [ ] Payment with 3D Secure card (should show auth popup)
- [ ] Cancel checkout (should redirect to /payment/cancel)
- [ ] Check premium badge appears in header
- [ ] Manage subscription (access customer portal)
- [ ] Cancel subscription (should remove premium)
- [ ] Subscription renewal (wait 1 month or trigger manually)
- [ ] Payment failed for subscription (trigger with Stripe CLI)

---

## 🎯 Testing Different User States

### Test as Guest
1. Don't log in
2. Click "Get Lifetime Access"
3. Should redirect to `/login`

### Test as Free User
1. Log in with email
2. premium_tier = 'free'
3. Can upgrade to Monthly or Lifetime

### Test as Monthly User
1. Already has premium_tier = 'monthly'
2. Can still get Lifetime (will cancel monthly automatically)
3. Cannot subscribe to monthly again

### Test as Lifetime User
1. Already has premium_tier = 'lifetime'
2. Buttons should be disabled
3. Shows "You have Lifetime" message

---

## 🐛 Common Issues

### "Missing API key"
- Check `STRIPE_SECRET_KEY` is in `.env`
- Restart server after adding env vars

### "No such price"
- Make sure you created products in **Test Mode**
- Price IDs should start with `price_`
- Check `STRIPE_PRICE_LIFETIME` and `STRIPE_PRICE_MONTHLY` in `.env`

### Webhook not firing
- Install Stripe CLI
- Run `stripe listen --forward-to http://localhost:3033/api/stripe/webhook`
- Update `STRIPE_WEBHOOK_SECRET` in `.env`

### Premium status not updating
- Check server console for webhook logs
- Check Stripe Dashboard → Webhooks for errors
- Verify webhook secret is correct
- Check database for stripe_customer_id

### "Webhook signature verification failed"
- Wrong `STRIPE_WEBHOOK_SECRET`
- Get new secret from Stripe CLI or Dashboard

---

## 💡 Pro Tips

1. **Keep Test Mode Active**: Always verify you're in test mode (Stripe Dashboard has a toggle)

2. **Clear Test Data**: You can delete test data in Stripe Dashboard without affecting production

3. **Test Edge Cases**:
   - User already has premium
   - User cancels then resubscribes
   - Payment fails mid-subscription
   - User upgrades from monthly to lifetime

4. **Monitor Webhooks**: Keep Stripe CLI running to see real-time webhook events

5. **Use Different Emails**: Test with multiple users to see different states

---

## 🚀 Going Live

When ready for production:

1. **Switch to Live Mode** in Stripe Dashboard
2. **Create production products** (same as test but in live mode)
3. **Get live API keys** (pk_live and sk_live)
4. **Update .env** with live keys
5. **Create production webhook** in Dashboard pointing to https://gamebuddies.io/api/stripe/webhook
6. **Test with real card** (use a real card, will charge!)
7. **Refund test payment** immediately

---

## ✅ Testing is 100% FREE!

Remember:
- ❌ Test mode charges are **fake**
- ❌ No real money is ever involved in test mode
- ❌ Test cards are not real cards
- ✅ You can test unlimited times
- ✅ Test mode is completely separate from live mode
- ✅ You can't accidentally charge real cards in test mode

**Happy Testing!** 🎉
