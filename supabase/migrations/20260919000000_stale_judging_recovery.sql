-- Recover a judging invocation that was terminated before its catch handler ran.
-- The server must derive requester_user_id from a verified Supabase JWT.

create or replace function public.invalidate_stale_round_judging(
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
    where rp.round_id = target_round_id
      and p.user_id = requester_user_id
  ) then
    raise exception using
      errcode = '42501',
      message = 'Not an active round player';
  end if;

  update public.rounds
  set
    status = 'invalid',
    completed_at = now(),
    result_ends_at = now() + interval '5 seconds'
  where id = target_round_id
    and status = 'judging'
    and judging_started_at <= now() - interval '65 seconds';

  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end;
$$;

revoke all on function public.invalidate_stale_round_judging(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.invalidate_stale_round_judging(uuid, uuid)
  to service_role;
