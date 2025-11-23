-- Update game thumbnails to point to correct local assets
UPDATE public.games SET thumbnail_url = '/avatars/games/bingo.png' WHERE id = 'bingo';
UPDATE public.games SET thumbnail_url = '/avatars/games/cluescale.png' WHERE id = 'cluescale';
UPDATE public.games SET thumbnail_url = '/avatars/games/ddf.png' WHERE id = 'ddf';
UPDATE public.games SET thumbnail_url = '/avatars/games/schooled.png' WHERE id = 'schooled';
UPDATE public.games SET thumbnail_url = '/avatars/games/susd.png' WHERE id = 'susd';
UPDATE public.games SET thumbnail_url = '/avatars/games/thinkalike.png' WHERE id = 'thinkalike';

-- Verify
SELECT id, name, thumbnail_url FROM public.games ORDER BY id;
