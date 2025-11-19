# 🚀 Quick Stripe Setup (5 Minutes - 100% FREE Testing!)

## ✅ Already Done:
- ✅ Stripe npm package installed
- ✅ `.env` file created in `server/` directory
- ✅ All Stripe routes and frontend pages are ready

## 🎯 What You Need to Do (5 minutes):

### Step 1: Create FREE Stripe Test Account (2 min)
1. Go to https://dashboard.stripe.com/register
2. Sign up (completely free - no credit card needed!)
3. You'll land in **Test Mode** by default (this is what you want!)

### Step 2: Get Your FREE Test API Keys (1 min)
1. In Stripe Dashboard, go to: **Developers → API keys**
2. Make sure you're in **Test mode** (toggle at top right should say "Test mode")
3. You'll see two keys:
   - **Publishable key**: starts with `pk_test_...`
   - **Secret key**: Click "Reveal test key" - starts with `sk_test_...`

### Step 3: Update Your `.env` File (1 min)
1. Open `server/.env`
2. Replace these two lines:
   ```env
   STRIPE_SECRET_KEY=sk_test_YOUR_ACTUAL_KEY_HERE
   STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_ACTUAL_KEY_HERE
   ```

### Step 4: Create Your Products (2 min)
1. In Stripe Dashboard, go to: **Product catalog → Add product**

**Product 1 - Lifetime Premium:**
- Name: `Lifetime Premium` (or include "lifetime" or "premium" in the name)
- Description: `One-time payment for lifetime premium access`
- Price: `€29.99` (or `29.99 EUR`)
- Billing: `One time`
- Click "Save product"
- ✅ **Done!** No need to copy price IDs - they're auto-detected!

**Product 2 - Monthly Pro:**
- Name: `Monthly Pro` (or include "monthly", "pro", or "subscription" in the name)
- Description: `Monthly subscription for premium features`
- Price: `€4.99` (or `4.99 EUR`)
- Billing: `Recurring - Monthly`
- Click "Save product"
- ✅ **Done!** The system will find it automatically!

> **💡 How it works:** Prices are automatically fetched from Stripe API based on product names and payment types. No manual configuration needed!

### Step 5: Restart Your Server
```bash
# Stop your current server (Ctrl+C)
# Then restart it
cd server
npm start
# or whatever command you use to start the server
```

## 🎉 You're Ready to Test!

### Testing WITHOUT PAYING (FREE Forever!)

1. Go to http://localhost:3000/premium
2. Click on any "Upgrade" button
3. You'll be redirected to Stripe Checkout
4. Use these **FREE test card numbers**:

**✅ Successful Payment (most common):**
- Card: `4242 4242 4242 4242`
- Expiry: Any future date (e.g., `12/34`)
- CVC: Any 3 digits (e.g., `123`)
- ZIP: Any 5 digits (e.g., `12345`)

**❌ Declined Payment (for testing errors):**
- Card: `4000 0000 0000 0002`

**🔄 Requires Authentication:**
- Card: `4000 0025 0000 3155`

[Full list of test cards](https://stripe.com/docs/testing#cards)

### What Happens After Testing:
1. Payment succeeds → User redirected to `/payment/success`
2. User's `premium_tier` is updated in database
3. User sees premium badge (⭐ or 💎) in header
4. Payment fails → User redirected to `/payment/cancel`

### Important Notes:
- ⚠️ **All payments in TEST mode are FREE** - no real money is charged
- 💰 Test cards will show as "successful" payments in Stripe Dashboard
- 🔄 You can test unlimited times for free
- 🚫 You CANNOT accidentally charge real money in test mode
- 📧 You won't receive real email receipts (Stripe shows test data)

## 🔍 Verification:

After testing a payment, check:
1. **Stripe Dashboard** → Payments (you'll see the test payment)
2. **Supabase Database** → `users` table → your user's `premium_tier` should be updated
3. **Your Header** → Should show ⭐ PREMIUM or 💎 PRO badge

## 🐛 Troubleshooting:

**Still getting 404 error?**
```bash
# Make sure you:
1. Added BOTH API keys to .env (secret and publishable)
2. Restarted the server after updating .env
3. Check server console for any Stripe-related errors
```

**Payment succeeds but premium status not updated?**
```bash
# Check your server console for webhook errors
# For local testing, webhooks won't work unless you use Stripe CLI
# But the checkout completion should still work
```

## 📚 Need More Help?

- Full documentation: `STRIPE_INTEGRATION_GUIDE.md`
- Testing guide: `STRIPE_TESTING_GUIDE.md`
- Stripe Docs: https://stripe.com/docs/testing

---

**That's it!** You now have a fully functional premium payment system with 100% free testing. 🎉
