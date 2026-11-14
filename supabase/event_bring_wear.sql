-- Bereits im separaten JOKER-Kemmental-Projekt angewendet.
-- Supabase-Projekt: dyujnqhgabtlsbdevxxi (niemals ThurSky).
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS bring_wear text NOT NULL DEFAULT '';
ALTER TABLE public.events
  ADD CONSTRAINT joker_bring_wear_length
  CHECK (char_length(bring_wear) <= 2000);
