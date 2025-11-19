-- =====================================================
-- Stripe Premium Integration - Database Migration
-- =====================================================
-- This script adds Stripe subscription tracking to the users table
-- Run this in Supabase SQL Editor

-- Add stripe_subscription_id column for tracking monthly subscriptions
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer
ON public.users(stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_users_stripe_subscription
ON public.users(stripe_subscription_id);

CREATE INDEX IF NOT EXISTS idx_users_premium_tier
ON public.users(premium_tier);

-- Verify columns exist
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
  AND column_name IN (
    'premium_tier',
    'premium_expires_at',
    'stripe_customer_id',
    'stripe_subscription_id'
  )
ORDER BY column_name;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Stripe database migration completed!';
  RAISE NOTICE '';
  RAISE NOTICE 'Columns added:';
  RAISE NOTICE '- stripe_subscription_id (for monthly subscriptions)';
  RAISE NOTICE '';
  RAISE NOTICE 'Indexes created:';
  RAISE NOTICE '- idx_users_stripe_customer';
  RAISE NOTICE '- idx_users_stripe_subscription';
  RAISE NOTICE '- idx_users_premium_tier';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Configure Stripe API keys in server/.env';
  RAISE NOTICE '2. Create Stripe products and get Price IDs';
  RAISE NOTICE '3. Update server/index.js to mount Stripe routes';
  RAISE NOTICE '4. Test payment flow!';
END $$;
