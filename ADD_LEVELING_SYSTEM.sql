-- =====================================================
-- GameBuddies Leveling System
-- =====================================================

-- 1. Add XP and Level columns to users
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;

-- 2. Create table for XP transaction history (audit trail)
CREATE TABLE IF NOT EXISTS public.xp_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    game_id VARCHAR(50) REFERENCES public.games(id), -- which game awarded this?
    amount INTEGER NOT NULL,
    source VARCHAR(50) NOT NULL, -- e.g., 'match_won', 'participation', 'daily_bonus'
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Index for performance
CREATE INDEX IF NOT EXISTS idx_xp_history_user ON public.xp_history(user_id);
CREATE INDEX IF NOT EXISTS idx_users_level_xp ON public.users(level DESC, xp DESC); -- For leaderboards

-- 4. Function to handle Level Up logic (Database Side)
CREATE OR REPLACE FUNCTION public.add_xp(
    p_user_id UUID,
    p_amount INTEGER,
    p_game_id VARCHAR DEFAULT NULL,
    p_source VARCHAR DEFAULT 'gameplay'
)
RETURNS JSONB AS $$
DECLARE
    current_xp INTEGER;
    current_level INTEGER;
    new_xp INTEGER;
    new_level INTEGER;
    xp_for_next_level INTEGER;
    leveled_up BOOLEAN := false;
BEGIN
    -- Get current state
    SELECT xp, level INTO current_xp, current_level FROM public.users WHERE id = p_user_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'User not found');
    END IF;

    -- Calculate new state
    new_xp := current_xp + p_amount;
    
    -- Simple Level Curve: Level * 1000 (Level 1->2 needs 1000xp, 2->3 needs 2000xp...)
    -- Cumulative formula approximately: 500 * L * (L-1)
    -- Iterative check for level up (handles multi-level jumps)
    new_level := current_level;
    LOOP
        xp_for_next_level := new_level * 1000;
        IF new_xp >= xp_for_next_level THEN
            new_xp := new_xp - xp_for_next_level;
            new_level := new_level + 1;
            leveled_up := true;
        ELSE
            EXIT;
        END IF;
    END LOOP;

    -- Update User
    UPDATE public.users 
    SET xp = new_xp, level = new_level, last_seen = NOW()
    WHERE id = p_user_id;

    -- Log History
    INSERT INTO public.xp_history (user_id, game_id, amount, source)
    VALUES (p_user_id, p_game_id, p_amount, p_source);

    RETURN jsonb_build_object(
        'user_id', p_user_id,
        'old_level', current_level,
        'new_level', new_level,
        'current_xp', new_xp,
        'next_level_at', new_level * 1000,
        'leveled_up', leveled_up
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Output confirmation
SELECT 'Leveling system installed successfully.' as status;
