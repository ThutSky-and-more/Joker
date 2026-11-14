-- JOKER Kemmental · Datenbank für Netlify Identity + Netlify Functions.
-- Einmal in einem NEUEN, leeren Supabase-Projekt im SQL Editor ausführen.
-- AUTH läuft ausschliesslich über Netlify Identity. Keine Supabase-Auth notwendig.
-- WICHTIG: Alle Tabellen für anon / authenticated gesperrt; nur die Netlify Function
-- greift mit dem streng serverseitigen SUPABASE_SERVICE_ROLE_KEY darauf zu.

begin;

create table public.profiles (
  id text primary key,
  email text not null unique check (char_length(email) <= 254),
  full_name text not null default '' check (char_length(full_name) <= 120),
  phone text not null default '' check (char_length(phone) <= 40),
  alternate_contact_name text not null default '' check (char_length(alternate_contact_name) <= 120),
  alternate_contact_phone text not null default '' check (char_length(alternate_contact_phone) <= 40),
  created_at timestamptz not null default now()
);

create table public.children (
  id uuid primary key default gen_random_uuid(),
  parent_id text not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  age smallint not null check (age between 4 and 18),
  photo_consent boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_children_parent on public.children(parent_id);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 2 and 160),
  description text not null default '' check (char_length(description) <= 3000),
  event_date date not null,
  start_time time not null default '14:00',
  end_time time,
  location text not null default 'JuHu Hugelshofen' check (char_length(location) <= 150),
  registration_open boolean not null default true,
  is_published boolean not null default true,
  registration_deadline date,
  created_by text references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint valid_event_times check (end_time is null or end_time > start_time),
  constraint deadline_not_after_event check (registration_deadline is null or registration_deadline <= event_date)
);
create index idx_events_date on public.events(event_date);

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (event_id, child_id)
);
create index idx_regs_child on public.registrations(child_id);
create index idx_regs_event on public.registrations(event_id);

create table public.gallery_photos (
  id uuid primary key default gen_random_uuid(),
  file_path text not null unique,
  caption text not null check (char_length(btrim(caption)) between 2 and 150),
  created_by text references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Ein nicht angemeldeter Browser darf auch mit einem sichtbaren anon-Key
-- keinerlei personenbezogene Datensätze direkt abfragen oder bearbeiten.
alter table public.profiles enable row level security;
alter table public.children enable row level security;
alter table public.events enable row level security;
alter table public.registrations enable row level security;
alter table public.gallery_photos enable row level security;
revoke all on public.profiles,public.children,public.events,public.registrations,public.gallery_photos from anon,authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('joker-gallery','joker-gallery',true,2500000,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
-- Die Galerie ist öffentlich sichtbar. Hochladen, Löschen und DB-Schreiben
-- passiert AUSSCHLIESSLICH nach serverseitiger Prüfung des admin-Tags.

commit;
