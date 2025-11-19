const express = require('express');
const stripe = require('../lib/stripe');
const { supabaseAdmin } = require('../lib/supabase');
const router = express.Router();

// Configuration
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// Cache for Stripe prices (fetched dynamically from Stripe API)
let priceCache = {
  lifetime: null,
  monthly: null,
  lastFetched: null,
  CACHE_DURATION: 60 * 60 * 1000, // 1 hour
};

/**
 * Fetch prices from Stripe API dynamically
 * Looks for products with specific names or metadata
 */
async function fetchStripePrices() {
  console.log('💰 [STRIPE PRICES] Fetching prices from Stripe API...');

  try {
    // Check if cache is still valid
    const now = Date.now();
    if (priceCache.lifetime && priceCache.monthly &&
        priceCache.lastFetched &&
        (now - priceCache.lastFetched) < priceCache.CACHE_DURATION) {
      console.log('✅ [STRIPE PRICES] Using cached prices');
      return {
        lifetime: priceCache.lifetime,
        monthly: priceCache.monthly
      };
    }

    // Fetch all active prices with product data expanded
    const prices = await stripe.prices.list({
      active: true,
      expand: ['data.product'],
      limit: 100
    });

    console.log(`📋 [STRIPE PRICES] Found ${prices.data.length} active prices`);

    let lifetimePrice = null;
    let monthlyPrice = null;

    // Search through prices to identify lifetime and monthly
    for (const price of prices.data) {
      const product = price.product;

      // Skip if product is not expanded or is deleted
      if (!product || typeof product === 'string') continue;

      const productName = product.name?.toLowerCase() || '';
      const productMetadata = product.metadata || {};
      const priceMetadata = price.metadata || {};

      console.log(`  💳 Checking price: ${price.id}`, {
        productName: product.name,
        type: price.type,
        recurring: price.recurring?.interval,
        metadata: { ...productMetadata, ...priceMetadata }
      });

      // Identify lifetime price (one-time payment)
      if (price.type === 'one_time' &&
          (productName.includes('lifetime') ||
           productName.includes('premium') ||
           productMetadata.tier === 'lifetime' ||
           priceMetadata.tier === 'lifetime')) {
        lifetimePrice = price.id;
        console.log(`  ⭐ Found LIFETIME price: ${price.id} - ${product.name} (${price.unit_amount / 100} ${price.currency})`);
      }

      // Identify monthly price (recurring monthly subscription)
      if (price.type === 'recurring' &&
          price.recurring?.interval === 'month' &&
          (productName.includes('monthly') ||
           productName.includes('pro') ||
           productName.includes('subscription') ||
           productMetadata.tier === 'monthly' ||
           priceMetadata.tier === 'monthly')) {
        monthlyPrice = price.id;
        console.log(`  💎 Found MONTHLY price: ${price.id} - ${product.name} (${price.unit_amount / 100} ${price.currency}/month)`);
      }
    }

    if (!lifetimePrice || !monthlyPrice) {
      console.error('❌ [STRIPE PRICES] Could not find all required prices!');
      console.error('  Lifetime price found:', !!lifetimePrice);
      console.error('  Monthly price found:', !!monthlyPrice);
      console.error('');
      console.error('💡 TIP: Make sure your Stripe products have:');
      console.error('  1. Lifetime: One-time payment with "lifetime" or "premium" in name');
      console.error('  2. Monthly: Recurring monthly with "monthly", "pro", or "subscription" in name');
      console.error('  OR add metadata { tier: "lifetime" } or { tier: "monthly" } to products/prices');
    }

    // Update cache
    priceCache.lifetime = lifetimePrice;
    priceCache.monthly = monthlyPrice;
    priceCache.lastFetched = now;

    console.log('✅ [STRIPE PRICES] Prices cached successfully');

    return {
      lifetime: lifetimePrice,
      monthly: monthlyPrice
    };

  } catch (error) {
    console.error('❌ [STRIPE PRICES] Error fetching prices:', error.message);

    // Return cached prices even if expired (better than nothing)
    if (priceCache.lifetime && priceCache.monthly) {
      console.warn('⚠️ [STRIPE PRICES] Using stale cache due to API error');
      return {
        lifetime: priceCache.lifetime,
        monthly: priceCache.monthly
      };
    }

    throw error;
  }
}

// Fetch prices on startup
console.log('🔧 [STRIPE CONFIG] Initializing Stripe routes');
console.log('🔧 [STRIPE CONFIG] CLIENT_URL:', CLIENT_URL);
console.log('🔧 [STRIPE CONFIG] Webhook secret configured:', !!STRIPE_WEBHOOK_SECRET);
console.log('🔧 [STRIPE CONFIG] Fetching prices from Stripe API...');

fetchStripePrices()
  .then(prices => {
    console.log('✅ [STRIPE CONFIG] Initialization complete:', {
      lifetimePriceId: prices.lifetime,
      monthlyPriceId: prices.monthly
    });
  })
  .catch(error => {
    console.error('❌ [STRIPE CONFIG] Failed to fetch prices on startup:', error.message);
    console.error('   Prices will be fetched on first payment request');
  });

/**
 * POST /api/stripe/create-checkout-session
 * Create a Stripe Checkout session for payment
 */
router.post('/create-checkout-session', async (req, res) => {
  console.log('🚀 [STRIPE] /create-checkout-session endpoint hit!');
  console.log('📦 [STRIPE] Request body:', req.body);
  console.log('🔑 [STRIPE] Headers:', {
    contentType: req.headers['content-type'],
    origin: req.headers.origin
  });

  try {
    const { userId, priceType } = req.body;

    // Validate inputs
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    if (!['lifetime', 'monthly'].includes(priceType)) {
      return res.status(400).json({ error: 'priceType must be "lifetime" or "monthly"' });
    }

    // Fetch prices dynamically from Stripe API
    console.log('💰 [STRIPE] Fetching current prices from API...');
    const prices = await fetchStripePrices();

    console.log('💳 [STRIPE] Creating checkout session:', {
      userId,
      priceType,
      availablePrices: prices
    });

    // Select price ID based on type
    const priceId = priceType === 'lifetime' ? prices.lifetime : prices.monthly;

    if (!priceId) {
      console.error('❌ [STRIPE] Price ID not found for:', priceType);
      console.error('   Available prices:', prices);
      return res.status(500).json({
        error: 'Payment configuration error',
        details: 'Could not find price for the selected tier. Please contact support.'
      });
    }

    console.log(`✅ [STRIPE] Using price ID: ${priceId} for ${priceType}`);

    // Get user from database
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      console.error('❌ [STRIPE] User not found:', userError);
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user already has premium
    if (user.premium_tier === 'lifetime') {
      return res.status(400).json({ error: 'User already has lifetime premium' });
    }

    if (user.premium_tier === 'monthly' && priceType === 'monthly') {
      return res.status(400).json({ error: 'User already has an active monthly subscription' });
    }

    // Get or create Stripe customer
    let customerId = user.stripe_customer_id;

    if (!customerId) {
      console.log('📝 [STRIPE] Creating new Stripe customer for user:', userId);

      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabase_user_id: userId,
          username: user.username
        }
      });

      customerId = customer.id;

      // Save customer ID to database
      await supabaseAdmin
        .from('users')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId);

      console.log('✅ [STRIPE] Created customer:', customerId);
    }

    // Create checkout session
    const sessionConfig = {
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: priceType === 'lifetime' ? 'payment' : 'subscription',
      success_url: `${CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${CLIENT_URL}/payment/cancel`,
      metadata: {
        supabase_user_id: userId,
        premium_tier: priceType,
      },
    };

    // For subscriptions, add additional configuration
    if (priceType === 'monthly') {
      sessionConfig.subscription_data = {
        metadata: {
          supabase_user_id: userId,
        },
      };
    }

    console.log('🔨 [STRIPE] Creating session with config:', sessionConfig);

    const session = await stripe.checkout.sessions.create(sessionConfig);

    console.log('✅ [STRIPE] Checkout session created successfully!', {
      sessionId: session.id,
      url: session.url,
      customer: session.customer,
      mode: session.mode
    });

    res.json({
      sessionId: session.id,
      url: session.url
    });

  } catch (error) {
    console.error('❌ [STRIPE] Checkout session error:');
    console.error('  Error type:', error.type);
    console.error('  Error message:', error.message);
    console.error('  Error code:', error.code);
    console.error('  Full error:', error);
    res.status(500).json({
      error: 'Failed to create checkout session',
      details: error.message
    });
  }
});

/**
 * GET /api/stripe/prices
 * Get current Stripe prices with product details
 */
router.get('/prices', async (req, res) => {
  console.log('💰 [STRIPE] GET /prices endpoint hit');

  try {
    const prices = await fetchStripePrices();

    if (!prices.lifetime || !prices.monthly) {
      console.warn('⚠️ [STRIPE] Some prices are missing');
      return res.status(500).json({
        error: 'Pricing configuration incomplete',
        details: 'Could not find all required prices'
      });
    }

    // Fetch full price details from Stripe
    const [lifetimeDetails, monthlyDetails] = await Promise.all([
      stripe.prices.retrieve(prices.lifetime, { expand: ['product'] }),
      stripe.prices.retrieve(prices.monthly, { expand: ['product'] })
    ]);

    console.log('✅ [STRIPE] Returning price details to client');

    res.json({
      lifetime: {
        id: lifetimeDetails.id,
        amount: lifetimeDetails.unit_amount,
        currency: lifetimeDetails.currency,
        product: {
          name: lifetimeDetails.product.name,
          description: lifetimeDetails.product.description
        }
      },
      monthly: {
        id: monthlyDetails.id,
        amount: monthlyDetails.unit_amount,
        currency: monthlyDetails.currency,
        interval: monthlyDetails.recurring?.interval,
        product: {
          name: monthlyDetails.product.name,
          description: monthlyDetails.product.description
        }
      }
    });

  } catch (error) {
    console.error('❌ [STRIPE] Error fetching prices:', error.message);
    res.status(500).json({
      error: 'Failed to fetch prices',
      details: error.message
    });
  }
});

/**
 * POST /api/stripe/webhook
 * Handle Stripe webhooks
 * Note: Raw body parsing is handled in server/index.js BEFORE express.json()
 */
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('❌ [STRIPE WEBHOOK] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('🔔 [STRIPE WEBHOOK] Received:', event.type);

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;

      default:
        console.log('ℹ️  [STRIPE WEBHOOK] Unhandled event type:', event.type);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('❌ [STRIPE WEBHOOK] Handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

/**
 * POST /api/stripe/customer-portal
 * Create a customer portal session for subscription management
 */
router.post('/customer-portal', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Get user from database
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single();

    if (userError || !user || !user.stripe_customer_id) {
      return res.status(404).json({ error: 'User or customer not found' });
    }

    // Create portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${CLIENT_URL}/premium`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('❌ [STRIPE] Portal session error:', error);
    res.status(500).json({
      error: 'Failed to create portal session',
      details: error.message
    });
  }
});

/**
 * POST /api/stripe/cancel-subscription
 * Cancel a user's subscription
 */
router.post('/cancel-subscription', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Get user from database
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('stripe_subscription_id')
      .eq('id', userId)
      .single();

    if (userError || !user || !user.stripe_subscription_id) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    // Cancel subscription at period end (user keeps access until end of billing period)
    const subscription = await stripe.subscriptions.update(
      user.stripe_subscription_id,
      { cancel_at_period_end: true }
    );

    console.log('✅ [STRIPE] Subscription cancelled:', subscription.id);

    res.json({
      message: 'Subscription will be cancelled at the end of the billing period',
      endsAt: new Date(subscription.current_period_end * 1000)
    });
  } catch (error) {
    console.error('❌ [STRIPE] Cancel subscription error:', error);
    res.status(500).json({
      error: 'Failed to cancel subscription',
      details: error.message
    });
  }
});

// ============================================
// WEBHOOK HANDLERS
// ============================================

/**
 * Handle checkout.session.completed
 * Payment completed successfully
 */
async function handleCheckoutCompleted(session) {
  console.log('✅ [STRIPE WEBHOOK] Checkout completed:', session.id);

  const userId = session.metadata.supabase_user_id;
  const premiumTier = session.metadata.premium_tier;

  if (!userId) {
    console.error('❌ [STRIPE WEBHOOK] No user ID in session metadata');
    return;
  }

  const updateData = {
    stripe_customer_id: session.customer,
    premium_tier: premiumTier,
  };

  // For lifetime, no expiration
  // For monthly, expiration is handled by subscription events

  if (session.mode === 'subscription') {
    updateData.stripe_subscription_id = session.subscription;
    // Set initial expiration (will be updated by subscription events)
    const subscription = await stripe.subscriptions.retrieve(session.subscription);
    updateData.premium_expires_at = new Date(subscription.current_period_end * 1000).toISOString();
  } else {
    // Lifetime premium - no expiration
    updateData.premium_expires_at = null;
  }

  const { error } = await supabaseAdmin
    .from('users')
    .update(updateData)
    .eq('id', userId);

  if (error) {
    console.error('❌ [STRIPE WEBHOOK] Failed to update user:', error);
  } else {
    console.log('✅ [STRIPE WEBHOOK] User premium activated:', userId);
  }
}

/**
 * Handle subscription created/updated
 */
async function handleSubscriptionUpdate(subscription) {
  console.log('🔄 [STRIPE WEBHOOK] Subscription updated:', subscription.id);

  const userId = subscription.metadata.supabase_user_id;

  if (!userId) {
    console.error('❌ [STRIPE WEBHOOK] No user ID in subscription metadata');
    return;
  }

  const { error } = await supabaseAdmin
    .from('users')
    .update({
      stripe_subscription_id: subscription.id,
      premium_tier: 'monthly',
      premium_expires_at: new Date(subscription.current_period_end * 1000).toISOString(),
    })
    .eq('id', userId);

  if (error) {
    console.error('❌ [STRIPE WEBHOOK] Failed to update subscription:', error);
  } else {
    console.log('✅ [STRIPE WEBHOOK] Subscription updated for user:', userId);
  }
}

/**
 * Handle subscription deleted
 * Note: Keep premium_expires_at for historical record of when subscription ended
 */
async function handleSubscriptionDeleted(subscription) {
  console.log('🗑️  [STRIPE WEBHOOK] Subscription deleted:', subscription.id);

  const userId = subscription.metadata.supabase_user_id;

  if (!userId) {
    console.error('❌ [STRIPE WEBHOOK] No user ID in subscription metadata');
    return;
  }

  // Get the actual end date from the subscription
  const expirationDate = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : new Date().toISOString();

  console.log(`📅 [STRIPE WEBHOOK] Subscription ended at: ${expirationDate}`);

  const { error } = await supabaseAdmin
    .from('users')
    .update({
      stripe_subscription_id: null,
      premium_tier: 'free',
      // Keep the expiration date for historical record
      // This shows when the subscription ended
      premium_expires_at: expirationDate,
    })
    .eq('id', userId);

  if (error) {
    console.error('❌ [STRIPE WEBHOOK] Failed to remove premium:', error);
  } else {
    console.log(`✅ [STRIPE WEBHOOK] Premium removed for user: ${userId}, expired at: ${expirationDate}`);
  }
}

/**
 * Handle successful payment (for subscriptions)
 */
async function handlePaymentSucceeded(invoice) {
  console.log('💰 [STRIPE WEBHOOK] Payment succeeded:', invoice.id);

  if (invoice.subscription) {
    // Renew subscription
    const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
    await handleSubscriptionUpdate(subscription);
  }
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(invoice) {
  console.log('❌ [STRIPE WEBHOOK] Payment failed:', invoice.id);

  // You could send an email to the user here
  // Or update a "payment_status" field in the database

  if (invoice.subscription) {
    const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
    const userId = subscription.metadata.supabase_user_id;

    if (userId) {
      // Optionally mark the subscription as having payment issues
      console.warn('⚠️  [STRIPE WEBHOOK] Payment failed for user:', userId);
      // You could add a payment_status field to track this
    }
  }
}

module.exports = router;
