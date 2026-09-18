-- LikeMEME five-round game loop.
-- Review before applying. Existing migrations remain unchanged.

create table public.memes (
  id text primary key,
  reference_image_path text not null unique,
  key_category text not null check (key_category in ('expression', 'pose', 'style')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.memes (id, reference_image_path, key_category)
values
  ('round-1-test', '/reference-memes/round-1-test.jpg', 'expression'),
  ('round-test-laugh', '/reference-memes/round-test-laugh.jpg', 'expression'),
  ('round-test-point', '/reference-memes/round-test-point.jpg', 'pose'),
  ('round-test-balance', '/reference-memes/round-test-balance.jpg', 'pose'),
  ('round-test-style', '/reference-memes/round-test-style.jpg', 'style')
on conflict (id) do update set
  reference_image_path = excluded.reference_image_path,
  key_category = excluded.key_category,
  active = true;

alter table public.memes enable row level security;
revoke all on table public.memes from public, anon, authenticated;

alter table public.rooms drop constraint if exists rooms_status_check;
update public.rooms set status = 'finished' where status = 'round_1_complete';
alter table public.rooms
  add constraint rooms_status_check
  check (status in ('waiting', 'playing', 'finished'));

alter table public.rounds drop constraint if exists rounds_round_number_check;
alter table public.rounds
  add constraint rounds_round_number_check
  check (round_number between 1 and 5);

alter table public.rounds drop constraint if exists rounds_status_check;
alter table public.rounds
  add constraint rounds_status_check
  check (status in ('pending', 'scheduled', 'judging', 'complete', 'invalid'));

alter table public.rounds alter column starts_at drop not null;
alter table public.rounds add column result_ends_at timestamptz;

create table public.final_results (
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  rank smallint not null check (rank between 1 and 4),
  round_wins smallint not null check (round_wins between 0 and 5),
  cumulative_total integer not null check (cumulative_total between 0 and 150),
  second_place_finishes smallint not null check (second_place_finishes between 0 and 5),
  worst_round_total smallint check (worst_round_total between 0 and 30),
  best_round_total smallint check (best_round_total between 0 and 30),
  created_at timestamptz not null default now(),
  primary key (room_id, player_id)
);

alter table public.final_results enable row level security;
revoke all on table public.final_results from public, anon, authenticated;
grant select on table public.final_results to authenticated;

create policy "members can read final results"
on public.final_results for select to authenticated
using (public.is_room_member(room_id));

create or replace function public.start_game(room_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_room public.rooms%rowtype;
  player_count integer;
  meme_count integer;
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

  select count(*) into meme_count from public.memes where active;
  if meme_count < 5 then
    raise exception using errcode = 'P0001', message = 'At least 5 active memes are required';
  end if;

  with candidates as (
    select m.*
    from public.memes m
    where m.active
    order by random()
    limit 5
  ), selected_memes as (
    select
      c.*,
      row_number() over (order by random())::smallint as round_number
    from candidates c
  )
  insert into public.rounds (
    room_id,
    round_number,
    reference_meme_id,
    reference_image_path,
    key_category,
    starts_at,
    status
  )
  select
    target_room.id,
    sm.round_number,
    sm.id,
    sm.reference_image_path,
    sm.key_category,
    case when sm.round_number = 1 then now() + interval '3 seconds' else null end,
    case when sm.round_number = 1 then 'scheduled' else 'pending' end
  from selected_memes sm;

  insert into public.round_players (round_id, player_id)
  select r.id, p.id
  from public.rounds r
  join public.players p on p.room_id = r.room_id
  where r.room_id = target_room.id;

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

  expected_path := target_round.room_id::text
    || '/' || target_round.round_number::text
    || '/' || target_player_id::text || '.jpg';
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
    'required_count', (
      select count(*) from public.round_players where round_id = target_round_id
    )
  ) into result
  from public.round_submissions where round_id = target_round_id;

  return result;
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

  if score_count <> (
      select count(*) from public.round_players where round_id = target_round_id
    ) or distinct_score_count <> score_count then
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

  -- Winner ordering exactly follows the functional specification:
  -- total, key category, lowest category, then second-lowest category.
  with ranked as (
    select
      rs.player_id,
      rank() over (
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
      ) as round_rank
    from public.round_scores rs
    where rs.round_id = target_round_id
  )
  update public.round_scores rs
  set is_winner = ranked.round_rank = 1
  from ranked
  where rs.round_id = target_round_id and rs.player_id = ranked.player_id;

  update public.rounds
  set
    status = 'complete',
    completed_at = now(),
    result_ends_at = now() + interval '8 seconds'
  where id = target_round_id;
end;
$$;

create or replace function public.invalidate_round_judging(target_round_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.rounds
  set
    status = 'invalid',
    completed_at = now(),
    result_ends_at = now() + interval '5 seconds'
  where id = target_round_id and status = 'judging';

  if not found then
    raise exception using errcode = 'P0001', message = 'Round is not being judged';
  end if;
end;
$$;

-- Any authenticated round player may ask the server to advance. The function is
-- service-role only, locks the room, verifies the result hold timestamp, and
-- performs a single authoritative transition.
create or replace function public.advance_game(
  target_round_id uuid,
  requester_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_round public.rounds%rowtype;
  target_room public.rooms%rowtype;
  affected_rows integer;
begin
  select * into target_round
  from public.rounds
  where id = target_round_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Round not found';
  end if;

  select * into target_room
  from public.rooms
  where id = target_round.room_id
  for update;

  if not exists (
    select 1
    from public.round_players rp
    join public.players p on p.id = rp.player_id
    where rp.round_id = target_round_id and p.user_id = requester_user_id
  ) then
    raise exception using errcode = '42501', message = 'Not an active round player';
  end if;

  if target_room.status = 'finished' then
    return 'already_finished';
  end if;
  if target_room.status <> 'playing' then
    raise exception using errcode = 'P0001', message = 'Room is not playing';
  end if;
  if target_round.status not in ('complete', 'invalid') then
    raise exception using errcode = 'P0001', message = 'Round result is not ready';
  end if;
  if target_round.result_ends_at is null or target_round.result_ends_at > now() then
    return 'result_hold';
  end if;
  if exists (
    select 1 from public.rounds r
    where r.room_id = target_round.room_id
      and r.round_number > target_round.round_number
      and r.status <> 'pending'
  ) then
    return 'already_advanced';
  end if;

  if target_round.round_number < 5 then
    update public.rounds
    set status = 'scheduled', starts_at = now() + interval '3 seconds'
    where room_id = target_round.room_id
      and round_number = target_round.round_number + 1
      and status = 'pending';

    get diagnostics affected_rows = row_count;
    if affected_rows <> 1 then
      raise exception using errcode = 'P0001', message = 'Next round is unavailable';
    end if;
    return 'round_started';
  end if;

  with valid_ranked_scores as (
    select
      r.room_id,
      rs.player_id,
      rs.total,
      rs.is_winner,
      rank() over (
        partition by rs.round_id
        order by
          rs.total desc,
          case r.key_category
            when 'expression' then rs.expression
            when 'pose' then rs.pose
            else rs.style
          end desc,
          least(rs.expression, rs.pose, rs.style) desc,
          (rs.expression + rs.pose + rs.style
            - least(rs.expression, rs.pose, rs.style)
            - greatest(rs.expression, rs.pose, rs.style)) desc
      ) as round_rank
    from public.round_scores rs
    join public.rounds r on r.id = rs.round_id
    where r.room_id = target_round.room_id and r.status = 'complete'
  ), player_stats as (
    select
      p.id as player_id,
      count(*) filter (where vrs.is_winner)::smallint as round_wins,
      coalesce(sum(vrs.total), 0)::integer as cumulative_total,
      count(*) filter (where vrs.round_rank = 2)::smallint as second_place_finishes,
      min(vrs.total)::smallint as worst_round_total,
      max(vrs.total)::smallint as best_round_total
    from public.players p
    left join valid_ranked_scores vrs on vrs.player_id = p.id
    where p.room_id = target_round.room_id
    group by p.id
  ), final_ranked as (
    select
      ps.*,
      rank() over (
        order by
          ps.round_wins desc,
          ps.cumulative_total desc,
          ps.second_place_finishes desc,
          ps.worst_round_total desc nulls last,
          ps.best_round_total desc nulls last
      )::smallint as final_rank
    from player_stats ps
  )
  insert into public.final_results (
    room_id,
    player_id,
    rank,
    round_wins,
    cumulative_total,
    second_place_finishes,
    worst_round_total,
    best_round_total
  )
  select
    target_round.room_id,
    fr.player_id,
    fr.final_rank,
    fr.round_wins,
    fr.cumulative_total,
    fr.second_place_finishes,
    fr.worst_round_total,
    fr.best_round_total
  from final_ranked fr;

  update public.rooms
  set status = 'finished'
  where id = target_round.room_id;

  return 'game_finished';
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
        'result_ends_at', r.result_ends_at,
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
      where r.room_id = target_room.id and r.status <> 'pending'
      order by r.round_number desc
      limit 1
    ),
    'final_results', coalesce((
      select jsonb_agg(jsonb_build_object(
        'player_id', fr.player_id,
        'rank', fr.rank,
        'round_wins', fr.round_wins,
        'cumulative_total', fr.cumulative_total,
        'second_place_finishes', fr.second_place_finishes,
        'worst_round_total', fr.worst_round_total,
        'best_round_total', fr.best_round_total
      ) order by fr.rank, p.seat)
      from public.final_results fr
      join public.players p on p.id = fr.player_id
      where fr.room_id = target_room.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.advance_game(uuid, uuid) from public, anon, authenticated;
grant execute on function public.advance_game(uuid, uuid) to service_role;

drop policy if exists "players upload their own round photo" on storage.objects;
create policy "players upload their own round photo"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'round-submissions'
  and (storage.foldername(name))[1] is not null
  and (storage.foldername(name))[2] ~ '^[1-5]$'
  and name ~ '^[0-9a-f-]{36}/[1-5]/[0-9a-f-]{36}[.]jpg$'
  and exists (
    select 1
    from public.players p
    join public.rounds r on r.room_id = p.room_id
      and r.round_number::text = (storage.foldername(name))[2]
    join public.round_players rp on rp.round_id = r.id and rp.player_id = p.id
    where p.user_id = (select auth.uid())
      and storage.filename(name) = p.id::text || '.jpg'
      and p.room_id::text = (storage.foldername(name))[1]
      and r.status = 'scheduled'
  )
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'final_results'
  ) then
    alter publication supabase_realtime add table public.final_results;
  end if;
end $$;
