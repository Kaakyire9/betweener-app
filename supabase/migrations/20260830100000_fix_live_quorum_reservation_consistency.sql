-- Keep confirmed lifecycle and current attendance viability distinct.
-- A confirmed event remains confirmed, but its projection must not claim that
-- current reservations still satisfy quorum after attendance changes.

begin;

create or replace function public.live_quorum_snapshot_internal(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_catalog
set row_security=off
as $$
declare
  v_session public.live_sessions;
  v_users uuid[];
  v_used uuid[] := '{}'::uuid[];
  v_user uuid;
  v_peer uuid;
  v_attendance integer := 0;
  v_intro_count integer := 0;
  v_pairs integer := 0;
  v_currently_viable boolean;
  v_confirmed boolean;
begin
  select * into v_session from public.live_sessions where id=p_session_id;
  if v_session.id is null then raise exception 'live_session_not_found' using errcode='P0002'; end if;

  select count(*)::integer,
         count(*) filter(where p.open_to_introductions and p.role<>'host')::integer,
         coalesce(array_agg(p.user_id order by p.created_at) filter(where p.open_to_introductions and p.role<>'host'),'{}'::uuid[])
    into v_attendance,v_intro_count,v_users
  from public.live_participants p
  join public.profiles pr on pr.id=p.profile_id
  where p.session_id=p_session_id and p.rsvp_status='going'
    and p.state not in ('left','removed','banned')
    and pr.deleted_at is null and pr.account_state='active' and pr.profile_completed;

  foreach v_user in array v_users loop
    if v_user=any(v_used) then continue; end if;
    select candidate into v_peer
    from unnest(v_users) candidate
    where candidate<>v_user and not(candidate=any(v_used))
      and public.live_match_pair_is_eligible(p_session_id,v_user,candidate)
    limit 1;
    if v_peer is not null then
      v_used:=array_append(array_append(v_used,v_user),v_peer);
      v_pairs:=v_pairs+1;
    end if;
    v_peer:=null;
  end loop;

  v_currently_viable:=v_attendance>=v_session.minimum_participants
    and (not v_session.quorum_pairability_required or v_pairs>=v_session.quorum_required_pairs);
  v_confirmed:=v_currently_viable or v_session.status in ('confirmed','backstage','live','ending','ended');

  return jsonb_build_object(
    'session_id',v_session.id,
    'status',case when v_confirmed then 'confirmed' else 'almost_ready' end,
    'attendance_count',v_attendance,
    'minimum_attendance',v_session.minimum_participants,
    'introduction_ready_count',v_intro_count,
    'viable_pair_count',v_pairs,
    'required_pair_count',case when v_session.quorum_pairability_required then v_session.quorum_required_pairs else 0 end,
    'pairability_required',v_session.quorum_pairability_required,
    'currently_viable',v_currently_viable,
    'reached',v_confirmed,
    'server_now',timezone('utc',now())
  );
end;
$$;

revoke all on function public.live_quorum_snapshot_internal(uuid) from public,anon,authenticated;

commit;
