-- LikeMEME Round 1 E2E schema.
-- Review before applying. This migration intentionally stops after one round.

alter table public.rooms drop constraint if exists rooms_status_check;
alter table public.rooms
  add constraint rooms_status_check
  check (status in ('waiting', 'playing', 'round_1_complete'));

alter table public.players
  add column camera_ready_at timestamptz;

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  round_number smallint not null check (round_number = 1),
  reference_meme_id text not null,
  reference_image_path text not null,
  key_category text not null check (key_category in ('expression', 'pose', 'style')),
  starts_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'judging', 'complete', 'invalid')),
  judging_started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (room_id, round_number)
);

create table public.round_players (
  round_id uuid not null references public.rounds(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  primary key (round_id, player_id)
);

create table public.round_submissions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  storage_object_path text not null unique,
  submitted_at timestamptz not null default now(),
  unique (round_id, player_id),
  foreign key (round_id, player_id)
    references public.round_players(round_id, player_id) on delete cascade
);

create table public.round_scores (
  round_id uuid not null,
  player_id uuid not null,
  expression smallint not null check (expression between 0 and 10),
  pose smallint not null check (pose between 0 and 10),
  style smallint not null check (style between 0 and 10),
  total smallint generated always as (expression + pose + style) stored,
  is_winner boolean not null default false,
  primary key (round_id, player_id),
  foreign key (round_id, player_id)
    references public.round_players(round_id, player_id) on delete cascade
);

create index round_players_player_id_idx on public.round_players(player_id);
create index round_submissions_round_id_idx on public.round_submissions(round_id);

alter table public.rounds enable row level security;
alter table public.round_players enable row level security;
alter table public.round_submissions enable row level security;
alter table public.round_scores enable row level security;

revoke all on table public.rounds from anon, authenticated;
revoke all on table public.round_players from anon, authenticated;
revoke all on table public.round_submissions from anon, authenticated;
revoke all on table public.round_scores from anon, authenticated;
grant select on table public.rounds to authenticated;
grant select on table public.round_players to authenticated;
grant select on table public.round_submissions to authenticated;
grant select on table public.round_scores to authenticated;

create policy "members can read rounds"
on public.rounds for select to authenticated
using (public.is_room_member(room_id));

create policy "members can read round players"
on public.round_players for select to authenticated
using (
  exists (
    select 1 from public.rounds r
    where r.id = round_id and public.is_room_member(r.room_id)
  )
);

create policy "members can read submission state"
on public.round_submissions for select to authenticated
using (
  exists (
    select 1 from public.rounds r
    where r.id = round_id and public.is_room_member(r.room_id)
  )
);

create policy "members can read round scores"
on public.round_scores for select to authenticated
using (
  exists (
    select 1 from public.rounds r
    where r.id = round_id and public.is_room_member(r.room_id)
  )
);

create or replace function public.set_camera_ready(room_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_room public.rooms%rowtype;
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
  if target_room.status <> 'waiting' then
    raise exception using errcode = 'P0001', message = 'Room is not waiting';
  end if;

  update public.players
  set camera_ready_at = now()
  where room_id = target_room.id and user_id = auth.uid();

  if not found then
    raise exception using errcode = '42501', message = 'Not a room member';
  end if;

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
  new_round_id uuid;
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
  if exists (
    select 1 from public.players
    where room_id = target_room.id and camera_ready_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'Every player camera must be ready';
  end if;

  insert into public.rounds (
    room_id, round_number, reference_meme_id, reference_image_path,
    key_category, starts_at
  ) values (
    target_room.id, 1, 'round-1-test', '/reference-memes/round-1-test.jpg',
    'expression', now() + interval '3 seconds'
  )
  returning id into new_round_id;

  insert into public.round_players (round_id, player_id)
  select new_round_id, id from public.players where room_id = target_room.id;

  update public.rooms
  set status = 'playing', started_at = now()
  where id = target_room.id;

  return public.get_room_snapshot(room_code);
end;
$$;

create or replace function public.record_round_submission(
  target_round_id uuid,
  object_path text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_round public.rounds%rowtype;
  target_player_id uuid;
  expected_path text;
  result jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select * into target_round
  from public.rounds
  where id = target_round_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Round not found';
  end if;
  if target_round.status <> 'scheduled' then
    raise exception using errcode = 'P0001', message = 'Round does not accept submissions';
  end if;

  select p.id into target_player_id
  from public.players p
  join public.round_players rp on rp.player_id = p.id
  where rp.round_id = target_round_id and p.user_id = auth.uid();

  if target_player_id is null then
    raise exception using errcode = '42501', message = 'Not an active round player';
  end if;

  expected_path := target_round.room_id::text || '/1/' || target_player_id::text || '.jpg';
  if object_path <> expected_path then
    raise exception using errcode = '22023', message = 'Invalid submission object path';
  end if;

  insert into public.round_submissions (round_id, player_id, storage_object_path)
  values (target_round_id, target_player_id, object_path)
  on conflict (round_id, player_id) do update
    set storage_object_path = excluded.storage_object_path
  where public.round_submissions.storage_object_path = excluded.storage_object_path;

  select jsonb_build_object(
    'submitted', true,
    'submission_count', count(*),
    'required_count', (select count(*) from public.round_players where round_id = target_round_id)
  ) into result
  from public.round_submissions where round_id = target_round_id;

  return result;
end;
$$;

-- Called only by the server with the service role after it validates the
-- requester's Supabase bearer token and derives requester_user_id from that
-- authenticated session. Never accept requester_user_id from client input.
-- The conditional UPDATE is the atomic judging claim.
create or replace function public.claim_round_judging(
  target_round_id uuid,
  requester_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_rows integer;
begin
  if not exists (
    select 1
    from public.round_players rp
    join public.players p on p.id = rp.player_id
    where rp.round_id = target_round_id and p.user_id = requester_user_id
  ) then
    return false;
  end if;

  update public.rounds r
  set status = 'judging', judging_started_at = now()
  where r.id = target_round_id
    and r.status = 'scheduled'
    and (select count(*) from public.round_submissions s where s.round_id = r.id)
      = (select count(*) from public.round_players rp where rp.round_id = r.id);

  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end;
$$;

create or replace function public.complete_round_judging(
  target_round_id uuid,
  score_rows jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_round public.rounds%rowtype;
  expected_count integer;
  score_count integer;
  distinct_score_count integer;
begin
  select * into target_round
  from public.rounds
  where id = target_round_id
  for update;

  if not found or target_round.status <> 'judging' then
    raise exception using errcode = 'P0001', message = 'Round is not being judged';
  end if;
  if jsonb_typeof(score_rows) <> 'array' then
    raise exception using errcode = '22023', message = 'Scores must be an array';
  end if;

  select count(*) into expected_count
  from public.round_players where round_id = target_round_id;

  with parsed as (
    select
      (item->>'player_id')::uuid as player_id,
      (item->>'expression')::smallint as expression,
      (item->>'pose')::smallint as pose,
      (item->>'style')::smallint as style
    from jsonb_array_elements(score_rows) item
  )
  select count(*), count(distinct player_id)
  into score_count, distinct_score_count
  from parsed
  where expression between 0 and 10
    and pose between 0 and 10
    and style between 0 and 10
    and exists (
      select 1 from public.round_players rp
      where rp.round_id = target_round_id and rp.player_id = parsed.player_id
    );

  if score_count <> (select count(*) from public.round_players where round_id = target_round_id)
     or distinct_score_count <> score_count then
    raise exception using errcode = '22023', message = 'Scores do not match active round players';
  end if;

  insert into public.round_scores (round_id, player_id, expression, pose, style)
  select
    target_round_id,
    (item->>'player_id')::uuid,
    (item->>'expression')::smallint,
    (item->>'pose')::smallint,
    (item->>'style')::smallint
  from jsonb_array_elements(score_rows) item;

  -- Winner ordering: total, key category, lowest category, second-lowest.
  with ranked as (
    select
      rs.player_id,
      dense_rank() over (
        order by
          rs.total desc,
          case target_round.key_category
            when 'expression' then rs.expression
            when 'pose' then rs.pose
            else rs.style
          end desc,
          least(rs.expression, rs.pose, rs.style) desc,
          (rs.expression + rs.pose + rs.style
            - least(rs.expression, rs.pose, rs.style)
            - greatest(rs.expression, rs.pose, rs.style)) desc
      ) as winner_rank
    from public.round_scores rs
    where rs.round_id = target_round_id
  )
  update public.round_scores rs
  set is_winner = ranked.winner_rank = 1
  from ranked
  where rs.round_id = target_round_id and rs.player_id = ranked.player_id;

  update public.rounds
  set status = 'complete', completed_at = now()
  where id = target_round_id;

  update public.rooms
  set status = 'round_1_complete'
  where id = target_round.room_id;
end;
$$;

create or replace function public.invalidate_round_judging(target_round_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_room_id uuid;
begin
  update public.rounds
  set status = 'invalid', completed_at = now()
  where id = target_round_id and status = 'judging'
  returning room_id into target_room_id;

  if target_room_id is null then
    raise exception using errcode = 'P0001', message = 'Round is not being judged';
  end if;

  update public.rooms set status = 'round_1_complete' where id = target_room_id;
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
    'current_player_id', (
      select p.id from public.players p
      where p.room_id = target_room.id and p.user_id = auth.uid()
    ),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'nickname', p.nickname,
        'seat', p.seat,
        'is_host', p.user_id = target_room.host_user_id,
        'camera_ready', p.camera_ready_at is not null
      ) order by p.seat)
      from public.players p
      where p.room_id = target_room.id
    ), '[]'::jsonb),
    'round', (
      select jsonb_build_object(
        'id', r.id,
        'number', r.round_number,
        'reference_meme_id', r.reference_meme_id,
        'reference_image_path', r.reference_image_path,
        'key_category', r.key_category,
        'starts_at', r.starts_at,
        'status', r.status,
        'submitted_player_ids', coalesce((
          select jsonb_agg(s.player_id order by s.submitted_at)
          from public.round_submissions s where s.round_id = r.id
        ), '[]'::jsonb),
        'scores', coalesce((
          select jsonb_agg(jsonb_build_object(
            'player_id', rs.player_id,
            'expression', rs.expression,
            'pose', rs.pose,
            'style', rs.style,
            'total', rs.total,
            'is_winner', rs.is_winner
          ) order by p.seat)
          from public.round_scores rs
          join public.players p on p.id = rs.player_id
          where rs.round_id = r.id
        ), '[]'::jsonb)
      )
      from public.rounds r
      where r.room_id = target_room.id and r.round_number = 1
    )
  );
end;
$$;

revoke all on function public.set_camera_ready(text) from public, anon;
revoke all on function public.record_round_submission(uuid, text) from public, anon;
revoke all on function public.claim_round_judging(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_round_judging(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.invalidate_round_judging(uuid) from public, anon, authenticated;
grant execute on function public.set_camera_ready(text) to authenticated;
grant execute on function public.record_round_submission(uuid, text) to authenticated;
grant execute on function public.claim_round_judging(uuid, uuid) to service_role;
grant execute on function public.complete_round_judging(uuid, jsonb) to service_role;
grant execute on function public.invalidate_round_judging(uuid) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'round-submissions',
  'round-submissions',
  false,
  10485760,
  array['image/jpeg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "players upload their own round photo"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'round-submissions'
  and (storage.foldername(name))[1] is not null
  and (storage.foldername(name))[2] = '1'
  and name ~ '^[0-9a-f-]{36}/1/[0-9a-f-]{36}[.]jpg$'
  and exists (
    select 1
    from public.players p
    join public.rooms room on room.id = p.room_id
    where p.user_id = (select auth.uid())
      and storage.filename(name) = p.id::text || '.jpg'
      and room.id::text = (storage.foldername(name))[1]
      and room.status = 'playing'
  )
);

create policy "players read their own round photo"
on storage.objects for select to authenticated
using (
  bucket_id = 'round-submissions'
  and exists (
    select 1 from public.players p
    where p.user_id = (select auth.uid())
      and storage.filename(name) = p.id::text || '.jpg'
      and p.room_id::text = (storage.foldername(name))[1]
  )
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rounds'
  ) then
    alter publication supabase_realtime add table public.rounds;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'round_submissions'
  ) then
    alter publication supabase_realtime add table public.round_submissions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'round_scores'
  ) then
    alter publication supabase_realtime add table public.round_scores;
  end if;
end $$;
