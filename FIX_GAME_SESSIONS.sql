-- Fix game_sessions table structure
-- 1. Make ID primary key and auto-generated
ALTER TABLE public.game_sessions 
ADD PRIMARY KEY (id);

ALTER TABLE public.game_sessions 
ALTER COLUMN id SET DEFAULT uuid_generate_v4();

-- 2. Set defaults for timestamps
ALTER TABLE public.game_sessions 
ALTER COLUMN created_at SET DEFAULT now();

-- 3. Ensure game_type is present (optional)
-- ALTER TABLE public.game_sessions ALTER COLUMN game_type SET NOT NULL;

SELECT 'Game sessions table fixed' as status;
