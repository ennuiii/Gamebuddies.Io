const express = require('express');
const stripe = require('../lib/stripe');
const { supabaseAdmin } = require('../lib/supabase');
const router = express.Router();

// Configuration
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const PRICE_LIFETIME = process.env.STRIPE_PRICE_LIFETIME;
const PRICE_MONTHLY = process.env.STRIPE_PRICE_MONTHLY;

/**
 * POST /api/stripe/create-checkout-session
 * Create a Stripe Checkout session for payment
 */
router.post('/create-checkout-session', async (req, res) => {
  try {
    const { userId, priceType } = req.body;

    console.log('💳 [STRIPE] Creating checkout session:', {
      userId,
      priceType
    });

    // Validate inputs
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    if (!['lifetime', 'monthly'].includes(priceType)) {
      return res.status(400).json({ error: 'priceType must be "lifetime" or "monthly"' });
    }

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

    // Select price ID based on type
    const priceId = priceType === 'lifetime' ? PRICE_LIFETIME : PRICE_MONTHLY;

    if (!priceId) {
      console.error('❌ [STRIPE] Price ID not configured for:', priceType);
      return res.status(500).json({ error: 'Payment configuration error' });
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

    const session = await stripe.checkout.sessions.create(sessionConfig);

    console.log('✅ [STRIPE] Checkout session created:', session.id);

    res.json({
      sessionId: session.id,
      url: session.url
    });

  } catch (error) {
    console.error('❌ [STRIPE] Checkout session error:', error);
    res.status(500).json({
      error: 'Failed to create checkout session',
      details: error.message
    });
  }
});

/**
 * POST /api/stripe/webhook
 * Handle Stripe webhooks
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
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
 */
async function handleSubscriptionDeleted(subscription) {
  console.log('🗑️  [STRIPE WEBHOOK] Subscription deleted:', subscription.id);

  const userId = subscription.metadata.supabase_user_id;

  if (!userId) {
    console.error('❌ [STRIPE WEBHOOK] No user ID in subscription metadata');
    return;
  }

  const { error } = await supabaseAdmin
    .from('users')
    .update({
      stripe_subscription_id: null,
      premium_tier: 'free',
      premium_expires_at: null,
    })
    .eq('id', userId);

  if (error) {
    console.error('❌ [STRIPE WEBHOOK] Failed to remove premium:', error);
  } else {
    console.log('✅ [STRIPE WEBHOOK] Premium removed for user:', userId);
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
