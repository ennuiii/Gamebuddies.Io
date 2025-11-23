-- =====================================================
-- Upgrade Leveling System: Table-Based Curve
-- =====================================================

-- 1. Create Levels Table
CREATE TABLE IF NOT EXISTS public.levels (
    level INTEGER PRIMARY KEY,
    xp_required INTEGER NOT NULL,
    title VARCHAR(50), -- e.g. "Novice", "Expert"
    icon VARCHAR(10)   -- e.g. "🌱", "🔥"
);

-- 2. Populate Curve (Target: Lvl 10 ~= 1000 wins * 100xp = 100,000 XP)
-- Using a quadratic/exponential-ish curve
INSERT INTO public.levels (level, xp_required, title, icon) VALUES
(1, 0, 'Newbie', '🌱'),
(2, 500, 'Rookie', '🪵'),          --   5 wins
(3, 1500, 'Apprentice', '🔨'),     --  15 wins
(4, 3500, 'Amateur', '🥉'),        --  35 wins
(5, 7500, 'Pro', '🥈'),            --  75 wins
(6, 15000, 'Veteran', '🥇'),       -- 150 wins
(7, 25000, 'Expert', '💎'),        -- 250 wins
(8, 40000, 'Master', '🔥'),        -- 400 wins
(9, 65000, 'Legend', '👑'),        -- 650 wins
(10, 100000, 'Godlike', '⚡')      -- 1000 wins
ON CONFLICT (level) DO UPDATE 
SET xp_required = EXCLUDED.xp_required, title = EXCLUDED.title, icon = EXCLUDED.icon;

-- 3. Update add_xp function to use the table
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
    next_level_row RECORD;
    leveled_up BOOLEAN := false;
BEGIN
    -- Get current state
    SELECT xp, level INTO current_xp, current_level FROM public.users WHERE id = p_user_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'User not found');
    END IF;

    -- Calculate new state
    new_xp := current_xp + p_amount;
    new_level := current_level;

    -- Check if we reached the requirement for the NEXT level(s)
    LOOP
        -- Look for the requirement of the *next* level (current + 1)
        SELECT xp_required INTO next_level_row 
        FROM public.levels 
        WHERE level = new_level + 1;

        -- If no next level exists (max level reached) or XP not enough, stop
        IF NOT FOUND OR new_xp < next_level_row.xp_required THEN
            EXIT;
        ELSE
            new_level := new_level + 1;
            leveled_up := true;
        END IF;
    END LOOP;

    -- Update User
    UPDATE public.users 
    SET xp = new_xp, level = new_level, last_seen = NOW()
    WHERE id = p_user_id;

    -- Log History
    INSERT INTO public.xp_history (user_id, game_id, amount, source)
    VALUES (p_user_id, p_game_id, p_amount, p_source);

    -- Get requirement for the *upcoming* level to show progress
    SELECT xp_required INTO next_level_row FROM public.levels WHERE level = new_level + 1;
    
    -- If max level, set next target to current (100%) or null
    IF NOT FOUND THEN
       -- Max level handling
       RETURN jsonb_build_object(
        'user_id', p_user_id,
        'old_level', current_level,
        'new_level', new_level,
        'current_xp', new_xp,
        'next_level_at', new_xp, -- Maxed out
        'leveled_up', leveled_up,
        'is_max_level', true
       );
    END IF;

    RETURN jsonb_build_object(
        'user_id', p_user_id,
        'old_level', current_level,
        'new_level', new_level,
        'current_xp', new_xp,
        'next_level_at', next_level_row.xp_required,
        'leveled_up', leveled_up
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS
ALTER TABLE public.levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Levels are public" ON public.levels FOR SELECT USING (true);

SELECT 'Leveling system updated to table-based curve.' as status;
