/**
 * Ad Impressions Tracking Migration
 *
 * Creates tables and functions for tracking ad impressions and revenue.
 * This migration adds the infrastructure needed for AdSense integration.
 */

-- ===== AD IMPRESSIONS TABLE =====
-- Already exists from types, but let's ensure it's properly configured

-- Add indexes for better query performance on ad_impressions
CREATE INDEX IF NOT EXISTS idx_ad_impressions_user_id
  ON public.ad_impressions(user_id);

CREATE INDEX IF NOT EXISTS idx_ad_impressions_created_at
  ON public.ad_impressions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ad_impressions_placement
  ON public.ad_impressions(ad_placement);

CREATE INDEX IF NOT EXISTS idx_ad_impressions_network
  ON public.ad_impressions(ad_network);

-- Composite index for revenue queries
CREATE INDEX IF NOT EXISTS idx_ad_impressions_revenue_query
  ON public.ad_impressions(created_at DESC, ad_placement, revenue_cents);

-- ===== AD REVENUE STATISTICS VIEW =====
-- Provides easy access to ad revenue statistics

CREATE OR REPLACE VIEW public.ad_revenue_stats AS
SELECT
  date_trunc('day', created_at) as date,
  ad_placement,
  ad_network,
  COUNT(*) as impressions,
  SUM(revenue_cents) as total_revenue_cents,
  AVG(cpm_cents) as average_cpm_cents,
  COUNT(DISTINCT user_id) as unique_users
FROM public.ad_impressions
GROUP BY date_trunc('day', created_at), ad_placement, ad_network
ORDER BY date DESC;

-- Grant access to the view
GRANT SELECT ON public.ad_revenue_stats TO authenticated;
GRANT SELECT ON public.ad_revenue_stats TO service_role;

-- ===== CLEANUP FUNCTION FOR OLD AD IMPRESSIONS =====
-- Automatically removes ad impressions older than 90 days

CREATE OR REPLACE FUNCTION public.cleanup_old_ad_impressions()
RETURNS TABLE(
  deleted_count bigint,
  cutoff_date timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cutoff_date timestamp with time zone;
  v_deleted_count bigint;
BEGIN
  -- Calculate cutoff date (90 days ago)
  v_cutoff_date := NOW() - INTERVAL '90 days';

  -- Delete old impressions
  WITH deleted AS (
    DELETE FROM public.ad_impressions
    WHERE created_at < v_cutoff_date
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted_count FROM deleted;

  -- Return results
  deleted_count := v_deleted_count;
  cutoff_date := v_cutoff_date;

  RETURN NEXT;
END;
$$;

-- ===== USER AD ELIGIBILITY FUNCTION =====
-- Check if a user should see ads based on subscription status

CREATE OR REPLACE FUNCTION public.should_show_ads(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_premium boolean;
BEGIN
  -- Check if user has active premium subscription
  SELECT EXISTS (
    SELECT 1
    FROM public.user_subscriptions
    WHERE user_id = p_user_id
      AND status = 'active'
      AND tier_id = 'premium'
  ) INTO v_is_premium;

  -- Show ads if NOT premium
  RETURN NOT v_is_premium;
END;
$$;

-- ===== RLS POLICIES FOR AD IMPRESSIONS =====
-- Ensure users can only see their own ad data

-- Enable RLS on ad_impressions if not already enabled
ALTER TABLE public.ad_impressions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own ad impressions" ON public.ad_impressions;
DROP POLICY IF EXISTS "Service role has full access to ad impressions" ON public.ad_impressions;
DROP POLICY IF EXISTS "Allow anonymous ad impression tracking" ON public.ad_impressions;

-- Policy: Users can view their own ad impressions
CREATE POLICY "Users can view their own ad impressions"
  ON public.ad_impressions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: Service role has full access
CREATE POLICY "Service role has full access to ad impressions"
  ON public.ad_impressions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Allow anonymous ad impression tracking
CREATE POLICY "Allow anonymous ad impression tracking"
  ON public.ad_impressions
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- ===== SCHEDULED CLEANUP JOB =====
-- Schedule daily cleanup of old ad impressions
-- Note: This uses pg_cron extension if available

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    -- Remove existing job if it exists
    PERFORM cron.unschedule('cleanup-old-ad-impressions');

    -- Schedule daily cleanup at 2 AM
    PERFORM cron.schedule(
      'cleanup-old-ad-impressions',
      '0 2 * * *', -- Every day at 2 AM
      $$SELECT public.cleanup_old_ad_impressions()$$
    );
  END IF;
END$$;

-- ===== GRANT PERMISSIONS =====

GRANT SELECT, INSERT ON public.ad_impressions TO authenticated;
GRANT ALL ON public.ad_impressions TO service_role;
GRANT EXECUTE ON FUNCTION public.should_show_ads(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_ad_impressions() TO service_role;

-- ===== COMMENTS FOR DOCUMENTATION =====

COMMENT ON TABLE public.ad_impressions IS 'Tracks all ad impressions for revenue analytics';
COMMENT ON VIEW public.ad_revenue_stats IS 'Aggregated ad revenue statistics by day, placement, and network';
COMMENT ON FUNCTION public.cleanup_old_ad_impressions() IS 'Removes ad impressions older than 90 days';
COMMENT ON FUNCTION public.should_show_ads(uuid) IS 'Returns true if user should see ads (i.e., not premium)';

COMMENT ON COLUMN public.ad_impressions.cpm_cents IS 'Cost per mille (CPM) in cents';
COMMENT ON COLUMN public.ad_impressions.revenue_cents IS 'Actual revenue earned in cents';
COMMENT ON COLUMN public.ad_impressions.ad_placement IS 'Where the ad was shown (e.g., banner, sidebar)';
COMMENT ON COLUMN public.ad_impressions.ad_network IS 'Ad network used (e.g., adsense)';
