-- Nur für das eigenständige Supabase-Projekt JOKER Kemmental.
-- Bereits im JOKER-Projekt angewendet (Migration track_event_attendance).
-- Anwesenheit ist an die konkrete Terminanmeldung gebunden.
alter table public.registrations add column if not exists checked_in_at timestamptz;
create index if not exists joker_registrations_event_attendance_idx
  on public.registrations(event_id, checked_in_at);
