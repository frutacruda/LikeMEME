-- FollowMe multiplayer proof of concept.
-- Clients use anonymous Supabase Auth. All writes go through the atomic RPCs below.

create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[0-9]{6}$'),
  host_user_id uuid not null,
  status text not null default 'waiting' check (status in ('waiting', 'playing')),
  created_at timestamptz not null default now(),
  started_at timestamptz
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null,
  nickname text not null check (char_length(nickname) between 1 and 20 and nickname = btrim(nickname)),
  seat smallint not null check (seat between 1 and 4),
  joined_at timestamptz not null default now(),
  unique (room_id, user_id),
  unique (room_id, seat)
);

create unique index if not exists players_room_nickname_ci_key
  on public.players (room_id, lower(nickname));
create index if not exists players_room_joined_at_idx
  on public.players (room_id, joined_at, id);

alter table public.rooms enable row level security;
alter table public.players enable row level security;

-- SECURITY DEFINER avoids recursive players policies. It only returns membership
-- for the current auth identity, so exposing it to authenticated users is safe.
create or replace function public.is_room_member(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.players p
    where p.room_id = target_room_id and p.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_room_member(uuid) from public, anon;
grant execute on function public.is_room_member(uuid) to authenticated;

drop policy if exists "members can read rooms" on public.rooms;
create policy "members can read rooms"
on public.rooms for select to authenticated
using (host_user_id = (select auth.uid()) or public.is_room_member(id));

drop policy if exists "members can read players" on public.players;
create policy "members can read players"
on public.players for select to authenticated
using (public.is_room_member(room_id));

revoke all on table public.rooms from anon, authenticated;
revoke all on table public.players from anon, authenticated;
grant select on table public.rooms to authenticated;
grant select on table public.players to authenticated;

create or replace function public.create_room()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  generated_code text;
  attempt integer;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  for attempt in 1..20 loop
    generated_code := lpad(floor(random() * 1000000)::integer::text, 6, '0');
    begin
      insert into public.rooms (code, host_user_id)
      values (generated_code, auth.uid());
      return generated_code;
    exception when unique_violation then
      -- Retry the extremely unlikely room-code collision.
    end;
  end loop;

  raise exception using errcode = 'P0001', message = 'Could not allocate a room code';
end;
$$;

create or replace function public.get_room_snapshot(room_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_room public.rooms%rowtype;
begin
  select * into target_room from public.rooms where code = room_code;
  if not found then
    raise exception using errcode = 'P0002', message = 'Room not found';
  end if;
  if auth.uid() is null or not (
    target_room.host_user_id = auth.uid()
    or exists (
      select 1 from public.players p
      where p.room_id = target_room.id and p.user_id = auth.uid()
    )
  ) then
    raise exception using errcode = '42501', message = 'Not a room member';
  end if;

  return jsonb_build_object(
    'id', target_room.id,
    'code', target_room.code,
    'status', target_room.status,
    'is_host', target_room.host_user_id = auth.uid(),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'nickname', p.nickname,
        'seat', p.seat,
        'is_host', p.user_id = target_room.host_user_id
      ) order by p.seat)
      from public.players p
      where p.room_id = target_room.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.join_room(room_code text, requested_nickname text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_room public.rooms%rowtype;
  clean_nickname text := btrim(requested_nickname);
  next_seat smallint;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if room_code !~ '^[0-9]{6}$' then
    raise exception using errcode = '22023', message = 'Room code must be 6 digits';
  end if;
  if clean_nickname is null or char_length(clean_nickname) not between 1 and 20 then
    raise exception using errcode = '22023', message = 'Nickname must be 1-20 characters';
  end if;

  select * into target_room
  from public.rooms
  where code = room_code
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Room not found';
  end if;
  if target_room.status <> 'waiting' then
    raise exception using errcode = 'P0001', message = 'Game already started';
  end if;

  -- An auth identity reconnecting to its room gets the existing player.
  if exists (
    select 1 from public.players
    where room_id = target_room.id and user_id = auth.uid()
  ) then
    return public.get_room_snapshot(room_code);
  end if;

  select candidate.seat into next_seat
  from generate_series(1, 4) as candidate(seat)
  where not exists (
    select 1 from public.players p
    where p.room_id = target_room.id and p.seat = candidate.seat
  )
  order by candidate.seat
  limit 1;

  if next_seat is null then
    raise exception using errcode = 'P0001', message = 'Room is full';
  end if;

  begin
    insert into public.players (room_id, user_id, nickname, seat)
    values (target_room.id, auth.uid(), clean_nickname, next_seat);
  exception when unique_violation then
    raise exception using errcode = '23505', message = 'Nickname is already in use';
  end;

  return public.get_room_snapshot(room_code);
end;
$$;

create or replace function public.start_game(room_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_room public.rooms%rowtype;
  player_count integer;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select * into target_room
  from public.rooms
  where code = room_code
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Room not found';
  end if;
  if target_room.host_user_id <> auth.uid() then
    raise exception using errcode = '42501', message = 'Only the host can start';
  end if;
  if target_room.status <> 'waiting' then
    raise exception using errcode = 'P0001', message = 'Room is not waiting';
  end if;
  if not exists (
    select 1 from public.players
    where room_id = target_room.id and user_id = auth.uid()
  ) then
    raise exception using errcode = '42501', message = 'Host must join the room first';
  end if;

  select count(*) into player_count
  from public.players where room_id = target_room.id;
  if player_count < 2 then
    raise exception using errcode = 'P0001', message = 'At least 2 players are required';
  end if;

  update public.rooms
  set status = 'playing', started_at = now()
  where id = target_room.id and status = 'waiting';

  return public.get_room_snapshot(room_code);
end;
$$;

revoke all on function public.create_room() from public, anon;
revoke all on function public.join_room(text, text) from public, anon;
revoke all on function public.get_room_snapshot(text) from public, anon;
revoke all on function public.start_game(text) from public, anon;
grant execute on function public.create_room() to authenticated;
grant execute on function public.join_room(text, text) to authenticated;
grant execute on function public.get_room_snapshot(text) to authenticated;
grant execute on function public.start_game(text) to authenticated;

-- Postgres Changes requires the tables in the Realtime publication.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms'
  ) then
    alter publication supabase_realtime add table public.rooms;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'players'
  ) then
    alter publication supabase_realtime add table public.players;
  end if;
end $$;
