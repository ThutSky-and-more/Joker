-- Ergänzung für manuelle Kinderanmeldungen durch das JOKER-Leitungsteam.
-- Nur im separaten Supabase-Projekt JOKER Kemmental ausführen.
-- Bereits am 14.11.2026 in dyujnqhgabtlsbdevxxi angewendet.
alter table public.children
  alter column parent_id drop not null;
alter table public.children
  add column if not exists contact_name text,
  add column if not exists contact_phone text,
  add column if not exists contact_email text;
alter table public.children
  add constraint joker_manual_child_requires_contact
  check (
    parent_id is not null or (
      char_length(btrim(coalesce(contact_name,''))) between 2 and 120
      and char_length(btrim(coalesce(contact_phone,''))) between 6 and 40
      and char_length(coalesce(contact_email,'')) <= 254
    )
  );
