-- =====================================================
-- Affiliate / Streamer Referral System
-- =====================================================

-- 1. Affiliates Table (Streamers)
CREATE TABLE IF NOT EXISTS public.affiliates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL, -- Optional link to user
    code VARCHAR(20) UNIQUE NOT NULL, -- The code users type (e.g., "SUMMIT1G")
    commission_rate NUMERIC DEFAULT 0.20, -- 20% by default
    total_earnings NUMERIC DEFAULT 0, -- Running total of commissions
    payout_details TEXT, -- Placeholder for PayPal/Bank info
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Referrals Table (Tracking user acquisition)
CREATE TABLE IF NOT EXISTS public.referrals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    referred_user_id UUID NOT NULL REFERENCES public.users(id), -- The player who signed up/paid
    affiliate_id UUID NOT NULL REFERENCES public.affiliates(id),
    used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(referred_user_id) -- Enforce 1 referrer per user
);

-- 3. Earnings Ledger (Financial Audit Trail)
CREATE TABLE IF NOT EXISTS public.affiliate_earnings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    affiliate_id UUID NOT NULL REFERENCES public.affiliates(id),
    source_user_id UUID REFERENCES public.users(id), -- Who made the purchase
    stripe_session_id VARCHAR(100), -- Link to Stripe payment
    transaction_amount NUMERIC NOT NULL, -- Amount paid by user
    commission_amount NUMERIC NOT NULL, -- Amount owed to streamer
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_affiliates_code ON public.affiliates(code);
CREATE INDEX IF NOT EXISTS idx_referrals_affiliate ON public.referrals(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_earnings_affiliate ON public.affiliate_earnings(affiliate_id);

-- RLS Policies
ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_earnings ENABLE ROW LEVEL SECURITY;

-- Public can read affiliate codes to validate them
CREATE POLICY "Affiliate codes are public" ON public.affiliates
    FOR SELECT USING (true);

-- Only admins can manage affiliates
CREATE POLICY "Admins manage affiliates" ON public.affiliates
    FOR ALL USING (
        auth.uid() IN (SELECT id FROM public.users WHERE metadata->>'role' = 'admin')
    );

-- Users can read their own earnings (if linked)
CREATE POLICY "Affiliates read own earnings" ON public.affiliate_earnings
    FOR SELECT USING (
        affiliate_id IN (SELECT id FROM public.affiliates WHERE user_id = auth.uid())
    );

SELECT 'Affiliate system schema created.' as status;
