-- Add subscription_canceled_at field to track when users cancel their subscription
-- This allows us to show "Canceled but active until [date]" status

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS subscription_canceled_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.users.subscription_canceled_at IS 'Timestamp when user canceled their subscription (but may still have active access until premium_expires_at)';
