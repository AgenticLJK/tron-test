-- Run once in the Supabase SQL Editor. Safe to run again.

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  room_code text not null,
  winner_name text not null,
  loser_name text not null,
  ticks integer not null,
  played_at timestamptz not null default now()
);

alter table public.matches enable row level security;

-- The public anon key may read and insert rows, and nothing else.
revoke all on table public.matches from anon, authenticated;
grant select, insert on table public.matches to anon;

drop policy if exists "anon can read matches" on public.matches;
create policy "anon can read matches" on public.matches
  for select to anon using (true);

drop policy if exists "anon can insert matches" on public.matches;
create policy "anon can insert matches" on public.matches
  for insert to anon with check (true);
