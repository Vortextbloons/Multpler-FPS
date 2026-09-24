-- NEON FORGE schema (already applied to project jkyatcblkxqtcdaxkvks via MCP migration)
-- Project: neon-arena-ffa | Room: public-1 (forever FFA)

create extension if not exists "pgcrypto";

create table if not exists public.arena_profiles (
  guest_id text primary key,
  display_name text not null,
  color text not null default '#22d3ee',
  kills int not null default 0,
  deaths int not null default 0,
  best_streak int not null default 0,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.arena_kill_events (
  id uuid primary key default gen_random_uuid(),
  room text not null default 'public-1',
  killer_id text,
  killer_name text,
  victim_id text,
  victim_name text,
  weapon text,
  created_at timestamptz not null default now()
);
create index if not exists idx_kill_events_room_time on public.arena_kill_events (room, created_at desc);

create table if not exists public.arena_rooms (
  room_id text primary key,
  name text not null default 'PUBLIC ARENA 01',
  max_players int not null default 8,
  map text not null default 'neon-forge',
  updated_at timestamptz not null default now()
);
insert into public.arena_rooms (room_id, name, max_players, map)
values ('public-1', 'PUBLIC ARENA 01', 8, 'neon-forge')
on conflict (room_id) do nothing;

alter table public.arena_profiles enable row level security;
alter table public.arena_kill_events enable row level security;
alter table public.arena_rooms enable row level security;

drop policy if exists "guest_open_profiles" on public.arena_profiles;
create policy "guest_open_profiles" on public.arena_profiles for all using (true) with check (true);

drop policy if exists "guest_open_kills" on public.arena_kill_events;
create policy "guest_open_kills" on public.arena_kill_events for all using (true) with check (true);

drop policy if exists "guest_open_rooms" on public.arena_rooms;
create policy "guest_open_rooms" on public.arena_rooms for all using (true) with check (true);

-- realtime
-- alter publication supabase_realtime add table public.arena_kill_events;
-- alter publication supabase_realtime add table public.arena_profiles;
