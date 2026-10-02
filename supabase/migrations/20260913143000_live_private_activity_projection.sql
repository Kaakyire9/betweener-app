begin;

-- Public Live receives atmosphere, never private membership. The opaque round
-- key only lets clients finish a transition for a pairing that was already
-- introduced publicly; it reveals no consent response or private-room media.
create or replace function public.rpc_get_live_private_activity_v1(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_hosted_pairs integer := 0;
  v_quick_pairs integer := 0;
  v_latest_round_id uuid;
  v_latest_activated_at timestamptz;
begin
  if auth.uid() is null or not public.can_view_live_session(p_session_id, auth.uid()) then
    raise exception 'live_private_activity_forbidden' using errcode = '42501';
  end if;

  select count(*)::integer
  into v_hosted_pairs
  from public.live_private_sparks spark
  where spark.session_id = p_session_id
    and spark.state = 'active'
    and (spark.active_expires_at is null or spark.active_expires_at > timezone('utc', now()));

  select count(*)::integer
  into v_quick_pairs
  from public.live_quick_connect_pairings pairing
  where pairing.session_id = p_session_id
    and pairing.state in ('active', 'reconnect_grace')
    and (
      pairing.state = 'active' and pairing.ends_at > timezone('utc', now())
      or pairing.state = 'reconnect_grace'
        and pairing.reconnect_deadline is not null
        and pairing.reconnect_deadline > timezone('utc', now())
    );

  select spark.match_round_id, spark.activated_at
  into v_latest_round_id, v_latest_activated_at
  from public.live_private_sparks spark
  where spark.session_id = p_session_id
    and spark.state = 'active'
    and spark.activated_at is not null
    and (spark.active_expires_at is null or spark.active_expires_at > timezone('utc', now()))
  order by spark.activated_at desc
  limit 1;

  return jsonb_build_object(
    'session_id', p_session_id,
    'hosted_pair_count', v_hosted_pairs,
    'quick_connect_pair_count', v_quick_pairs,
    'latest_hosted_pair_round_id', v_latest_round_id,
    'latest_hosted_pair_activated_at', v_latest_activated_at,
    'server_now', timezone('utc', now())
  );
end;
$$;

revoke all on function public.rpc_get_live_private_activity_v1(uuid) from public, anon;
grant execute on function public.rpc_get_live_private_activity_v1(uuid) to authenticated, service_role;

comment on function public.rpc_get_live_private_activity_v1(uuid) is
  'Count-only public atmosphere for active private Live conversations; never exposes pair identities or consent.';

commit;
