-- A public Live room must always expose its host as canonical stage slot one.
-- Earlier trigger logic only promoted hosts from backstage, so legacy or
-- raced host rows could remain confirmed/invited while the room was live.

create or replace function public.live_profile_avatar(p_profile public.profiles)
returns text
language sql
immutable
set search_path = public, pg_catalog
as $$
  select coalesce(
    nullif(btrim(p_profile.avatar_url), ''),
    nullif(btrim(p_profile.hero_image_url), ''),
    (
      select nullif(btrim(photo_url), '')
      from unnest(coalesce(p_profile.photos, array[]::text[])) with ordinality as media(photo_url, position)
      where nullif(btrim(photo_url), '') is not null
      order by position
      limit 1
    )
  );
$$;

create or replace function public.sync_live_host_participant_state()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if new.status = old.status then return new; end if;
  if new.status = 'backstage' then
    update public.live_participants
    set state='backstage',stage_slot=1,last_seen_at=timezone('utc',now())
    where session_id=new.id and user_id=new.created_by_user_id and role='host'
      and state not in ('removed','banned');
  elsif new.status in ('live','ending') then
    update public.live_participants
    set state='on_stage',stage_slot=1,
        stage_joined_at=coalesce(stage_joined_at,timezone('utc',now())),
        stage_left_at=null,left_at=null,last_seen_at=timezone('utc',now())
    where session_id=new.id and user_id=new.created_by_user_id and role='host'
      and state not in ('removed','banned');
  end if;
  return new;
end;
$$;

-- Repair rooms already affected before enforcing the read-side invariant.
do $$
declare
  v_room record;
  v_replacement_slot integer;
begin
  for v_room in
    select s.id as session_id
    from public.live_sessions s
    join public.live_participants host
      on host.session_id=s.id
     and host.user_id=s.created_by_user_id
     and host.role='host'
    where s.status in ('live','ending')
      and host.state not in ('removed','banned')
      and (host.state <> 'on_stage' or host.stage_slot is distinct from 1)
  loop
    select slot into v_replacement_slot
    from generate_series(2,4) as slots(slot)
    where not exists (
      select 1 from public.live_participants occupied
      where occupied.session_id=v_room.session_id and occupied.stage_slot=slots.slot
    )
    order by slot
    limit 1;

    update public.live_participants
    set stage_slot=v_replacement_slot
    where session_id=v_room.session_id
      and stage_slot=1
      and role <> 'host'
      and v_replacement_slot is not null;

    update public.live_participants
    set state='audience',stage_slot=null,stage_left_at=timezone('utc',now())
    where session_id=v_room.session_id
      and stage_slot=1
      and role <> 'host'
      and v_replacement_slot is null;
  end loop;
end;
$$;

update public.live_participants p
set state='on_stage',stage_slot=1,
    stage_joined_at=coalesce(p.stage_joined_at,s.started_at,timezone('utc',now())),
    stage_left_at=null,left_at=null,last_seen_at=timezone('utc',now())
from public.live_sessions s
where s.id=p.session_id
  and p.user_id=s.created_by_user_id
  and p.role='host'
  and s.status in ('live','ending')
  and p.state not in ('removed','banned')
  and (p.state <> 'on_stage' or p.stage_slot is distinct from 1);

create or replace function public.rpc_get_live_session_snapshot(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
  v_me public.live_participants;
begin
  if auth.uid() is null or not public.can_view_live_session(p_session_id,auth.uid()) then
    raise exception 'live_session_forbidden' using errcode='42501';
  end if;
  select * into v_session from public.live_sessions where id=p_session_id;
  if v_session.id is null then raise exception 'live_session_not_found' using errcode='P0002'; end if;
  select * into v_me from public.live_participants where session_id=p_session_id and user_id=auth.uid();
  return jsonb_build_object(
    'session',to_jsonb(v_session),
    'me',case when v_me.id is null then null else to_jsonb(v_me) end,
    'capabilities',public.resolve_live_capabilities(p_session_id,auth.uid()),
    'stage',coalesce((select jsonb_agg(
        to_jsonb(p) || jsonb_build_object(
          'full_name',pr.full_name,
          'avatar_url',public.live_profile_avatar(pr)
        ) order by case when p.user_id=v_session.created_by_user_id then 0 else 1 end,
          p.stage_slot nulls last,p.stage_joined_at)
      from public.live_participants p
      join public.profiles pr on pr.id=p.profile_id
      where p.session_id=p_session_id
        and (
          p.state='on_stage'
          or (
            p.user_id=v_session.created_by_user_id
            and p.role='host'
            and v_session.status in ('live','ending')
            and p.state not in ('removed','banned')
          )
        )),'[]'::jsonb),
    'backstage',case when public.has_live_capability(p_session_id,'live.manage_stage')
      then coalesce((select jsonb_agg(
          to_jsonb(p) || jsonb_build_object(
            'full_name',pr.full_name,
            'avatar_url',public.live_profile_avatar(pr)
          ) order by p.joined_at)
        from public.live_participants p
        join public.profiles pr on pr.id=p.profile_id
        where p.session_id=p_session_id and p.state='backstage' and p.role <> 'host'),'[]'::jsonb)
      else '[]'::jsonb end,
    'audienceCount',(select count(*) from public.live_participants p
      where p.session_id=p_session_id and p.state in ('audience','stage_requested')),
    'seatRequests',case when public.has_live_capability(p_session_id,'live.approve_seat_request')
      then coalesce((select jsonb_agg(
          to_jsonb(r) || jsonb_build_object(
            'full_name',pr.full_name,
            'avatar_url',public.live_profile_avatar(pr)
          ) order by r.requested_at)
        from public.live_seat_requests r
        join public.profiles pr on pr.id=r.profile_id
        where r.session_id=p_session_id and r.status='pending'),'[]'::jsonb)
      else '[]'::jsonb end,
    'comments',coalesce((select jsonb_agg(
        to_jsonb(c) || jsonb_build_object(
          'full_name',pr.full_name,
          'avatar_url',public.live_profile_avatar(pr)
        ) order by c.created_at)
      from (select * from public.live_comments lc where lc.session_id=p_session_id and lc.status='visible'
        order by lc.created_at desc limit 80) c
      join public.profiles pr on pr.id=c.profile_id),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.live_profile_avatar(public.profiles) from public, anon, authenticated;
grant execute on function public.live_profile_avatar(public.profiles) to service_role;
revoke all on function public.rpc_get_live_session_snapshot(uuid) from public, anon;
grant execute on function public.rpc_get_live_session_snapshot(uuid) to authenticated, service_role;
