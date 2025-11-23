-- Add extra fields to affiliates table
ALTER TABLE public.affiliates 
ADD COLUMN IF NOT EXISTS name VARCHAR(255),
ADD COLUMN IF NOT EXISTS email VARCHAR(255),
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Refresh cache or notify (optional)
SELECT 'Affiliates schema updated successfully' as status;
