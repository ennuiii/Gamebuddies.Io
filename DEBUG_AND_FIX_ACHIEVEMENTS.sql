-- =====================================================
-- GameBuddies - Debug & Force Refresh Achievements
-- =====================================================

-- 1. Create a helper to view raw metrics for a user
CREATE OR REPLACE FUNCTION debug_user_metrics(p_username TEXT)
RETURNS TABLE (
  metric_key VARCHAR,
  value BIGINT,
  game_id VARCHAR
) AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM public.users WHERE username = p_username;
  
  RETURN QUERY 
  SELECT m.metric_key, m.value, m.game_id 
  FROM public.user_metrics m 
  WHERE m.user_id = v_user_id;
END;
$$ LANGUAGE plpgsql;

-- 2. Force Update of Progress for All Users
-- This recalculates the 'progress' column in user_achievements based on current metrics.
DO $$
DECLARE
  r RECORD;
  v_count INTEGER := 0;
BEGIN
  RAISE NOTICE 'Starting achievement progress refresh...';
  
  FOR r IN SELECT id FROM public.users LOOP
    -- Refresh "Social" (Rooms Hosted)
    PERFORM check_achievements(r.id, 'room_hosted');
    
    -- Refresh "Games Played"
    PERFORM check_achievements(r.id, 'game_completed');
    
    -- Refresh "Wins"
    PERFORM check_achievements(r.id, 'game_completed', '{"won": true}'::jsonb);
    
    v_count := v_count + 1;
  END LOOP;
  
  RAISE NOTICE 'Refreshed achievements for % users.', v_count;
END $$;
