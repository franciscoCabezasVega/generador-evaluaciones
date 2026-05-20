-- Add theme_preference column to user_profiles
-- Nota: ADD COLUMN IF NOT EXISTS es atómica en PostgreSQL — si la columna ya
-- existiera, toda la instrucción (incluyendo CHECK y DEFAULT) se omitiría.
-- Por eso se separa en pasos individuales idempotentes.

-- 1. Agregar la columna solo si no existe (sin constraint ni default aún)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS theme_preference text;

-- 2. Asegurar el DEFAULT idempotentemente
ALTER TABLE public.user_profiles
  ALTER COLUMN theme_preference SET DEFAULT 'system';

-- 3. Asegurar el CHECK constraint idempotentemente
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_profiles_theme_preference_check'
      AND conrelid = 'public.user_profiles'::regclass
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_theme_preference_check
      CHECK (theme_preference IN ('light', 'dark', 'system'));
  END IF;
END $$;

COMMENT ON COLUMN public.user_profiles.theme_preference IS
  'Preferencia de tema UI elegida por el usuario. NULL/system = sigue al SO.';
