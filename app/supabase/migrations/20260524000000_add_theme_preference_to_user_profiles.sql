-- Add theme_preference column to user_profiles
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS theme_preference text
    CHECK (theme_preference IN ('light', 'dark', 'system'))
    DEFAULT 'system';

COMMENT ON COLUMN public.user_profiles.theme_preference IS
  'Preferencia de tema UI elegida por el usuario. NULL/system = sigue al SO.';
