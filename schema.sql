-- =====================================================================
--  FAMILY PORTAL — Supabase schema + Row Level Security
--  Run this once in your Supabase project: SQL Editor → New query → paste → Run
-- =====================================================================

-- ---------- Tables ----------
create table if not exists public.households (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text default '',
  email      text default '',
  address    text default '',
  created_at timestamptz default now()
);

create table if not exists public.members (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  first_name   text not null,
  last_name    text default '',
  hebrew_name  text default '',
  relation     text default '',
  birthday     date,
  phone        text default '',
  cell         text default '',
  email        text default ''
);
alter table public.members add column if not exists phone text default '';
alter table public.members add column if not exists cell  text default '';
alter table public.members add column if not exists email text default '';

create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  type         text not null check (type in ('yahrzeit','birthday','anniversary','milestone')),
  title        text not null,
  greg_date    date not null,
  recurrence   text not null default 'hebrew' check (recurrence in ('hebrew','gregorian')),
  frequency    text not null default 'yearly' check (frequency in ('yearly','once')),
  recur_title  text default '',   -- name used in later years (e.g. "Anniversary of…")
  notes        text default '',
  remind       jsonb   -- { on, daysBefore, notify, emails, channels:{browser,push,email} }
);
-- add columns if the events table predates these features:
alter table public.events add column if not exists remind jsonb;
alter table public.events add column if not exists frequency   text not null default 'yearly';
alter table public.events add column if not exists recur_title text default '';

-- Web-push subscriptions (one row per browser/device a user enables app push on).
create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  sub        jsonb not null,
  created_at timestamptz default now()
);

-- Log of reminders already sent, so the scheduled job never double-sends.
create table if not exists public.reminder_log (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid,
  occ_date   date,
  channel    text,
  target     text,
  sent_at    timestamptz default now(),
  unique (event_id, occ_date, channel, target)
);

-- One profile per auth user. household_id links a login to its family.
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  household_id uuid references public.households(id) on delete set null,
  is_admin     boolean not null default false,
  created_at   timestamptz default now()
);

create table if not exists public.settings (
  key   text primary key,
  value text
);
insert into public.settings (key, value) values ('communityName','Our Family Portal')
  on conflict (key) do nothing;

-- ---------- Helper: is the current user an admin? ----------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- ---------- Helper: household of the current user ----------
create or replace function public.my_household()
returns uuid language sql stable security definer set search_path = public as $$
  select household_id from public.profiles where id = auth.uid();
$$;

-- ---------- Enable RLS ----------
alter table public.households enable row level security;
alter table public.members    enable row level security;
alter table public.events     enable row level security;
alter table public.profiles   enable row level security;
alter table public.settings   enable row level security;

-- ---------- Policies: everyone signed in can VIEW the whole directory/calendar ----------
drop policy if exists hh_read on public.households;
create policy hh_read on public.households for select to authenticated using (true);
drop policy if exists mm_read on public.members;
create policy mm_read on public.members for select to authenticated using (true);
drop policy if exists ee_read on public.events;
create policy ee_read on public.events for select to authenticated using (true);
drop policy if exists st_read on public.settings;
create policy st_read on public.settings for select to authenticated using (true);

-- ---------- Policies: a family edits only ITS OWN data; an admin edits everything ----------
-- households
drop policy if exists hh_write on public.households;
create policy hh_write on public.households for all to authenticated
  using ( public.is_admin() or id = public.my_household() )
  with check ( public.is_admin() or id = public.my_household() );

-- members
drop policy if exists mm_write on public.members;
create policy mm_write on public.members for all to authenticated
  using ( public.is_admin() or household_id = public.my_household() )
  with check ( public.is_admin() or household_id = public.my_household() );

-- events
drop policy if exists ee_write on public.events;
create policy ee_write on public.events for all to authenticated
  using ( public.is_admin() or household_id = public.my_household() )
  with check ( public.is_admin() or household_id = public.my_household() );

-- settings: only admins may change
drop policy if exists st_write on public.settings;
create policy st_write on public.settings for all to authenticated
  using ( public.is_admin() ) with check ( public.is_admin() );

-- ---------- Policies: profiles ----------
-- Read your own profile; admins read all.
drop policy if exists pr_read on public.profiles;
create policy pr_read on public.profiles for select to authenticated
  using ( id = auth.uid() or public.is_admin() );

-- Create your own profile row on first login.
drop policy if exists pr_insert on public.profiles;
create policy pr_insert on public.profiles for insert to authenticated
  with check ( id = auth.uid() );

-- Update your own profile (e.g. pick your household). Admins can update anyone,
-- but note: this policy intentionally lets a user set their own household_id.
-- It does NOT let a normal user set is_admin (that column is protected by the
-- trigger below).
drop policy if exists pr_update on public.profiles;
create policy pr_update on public.profiles for update to authenticated
  using ( id = auth.uid() or public.is_admin() )
  with check ( id = auth.uid() or public.is_admin() );

-- Prevent a non-admin from granting themselves admin.
create or replace function public.guard_admin_flag()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.is_admin is distinct from OLD.is_admin and not public.is_admin() then
    raise exception 'Only an admin can change is_admin';
  end if;
  return NEW;
end; $$;
drop trigger if exists trg_guard_admin on public.profiles;
create trigger trg_guard_admin before update on public.profiles
  for each row execute function public.guard_admin_flag();

-- =====================================================================
--  AFTER RUNNING THIS:
--  1. Authentication → Providers → Email: (optional) turn OFF "Confirm email"
--     for the simplest sign-up flow, or leave it on for extra security.
--  2. Sign up once in the portal with YOUR email.
--  3. Make yourself admin — run this with your email:
--       update public.profiles set is_admin = true
--       where id = (select id from auth.users where email = 'you@example.com');
--  4. Log in as admin → Admin tab → add each household.
--  5. Each family signs up and picks their household on first login.
-- =====================================================================
