-- Live room capacity and presence must be enforced by Supabase, not inferred
-- from a client roster. Room Pulse also gets a paginated, capability-filtered
-- read contract for large rooms.

update public.live_sessions
set maximum_participants=least(maximum_participants,100)
where maximum_participants > 100;

alter table public.live_sessions
  alter column maximum_participants set default 100,
  drop constraint if exists live_sessions_capacity_valid;

alter table public.live_sessions
  add constraint live_sessions_capacity_valid check (
    minimum_participants between 1 and 100
    and maximum_participants between minimum_participants and 100
    and maximum_publishers between 1 and 4
    and maximum_publishers <= maximum_participants
  );

alter table public.live_participants
  add column if not exists reconnect_state text;

alter table public.live_participants
  drop constraint if exists live_participants_reconnect_state_valid;

alter table public.live_participants
  add constraint live_participants_reconnect_state_valid check (
    reconnect_state is null
    or reconnect_state in ('backstage','audience','stage_requested','on_stage')
  );

create or replace function public.rpc_heartbeat_live_session(p_session_id uuid)
returns public.live_participants
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_participant public.live_participants;
  v_restore_state text;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode='42501';
  end if;

  select * into v_participant
  from public.live_participants
  where session_id=p_session_id and user_id=auth.uid()
  for update;

  if v_participant.id is null
     or v_participant.state in ('left','removed','banned')
     or not exists (
       select 1 from public.live_sessions s
       where s.id=p_session_id and s.status in ('backstage','live','ending')
     ) then
    raise exception 'live_heartbeat_unavailable' using errcode='42501';
  end if;

  if v_participant.state='temporarily_disconnected' then
    v_restore_state := coalesce(
      v_participant.reconnect_state,
      case when v_participant.role='host' then 'on_stage' else 'audience' end
    );
  else
    v_restore_state := v_participant.state;
  end if;

  update public.live_participants
  set state=v_restore_state,
      reconnect_state=null,
      last_seen_at=timezone('utc',now()),
      left_at=null
  where id=v_participant.id
  returning * into v_participant;

  return v_participant;
end;
$$;

create or replace function public.rpc_get_live_rtc_admission_v2(p_session_id uuid)
returns table(
  session_id uuid,
  user_id uuid,
  profile_id uuid,
  primary_role text,
  roles text[],
  participant_state text,
  session_status text,
  provider text,
  provider_call_type text,
  provider_call_id text,
  capabilities text[],
  maximum_participants integer
)
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_profile public.profiles;
  v_session public.live_sessions;
  v_participant public.live_participants;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode='42501'; end if;
  select * into v_profile from public.profiles p where p.user_id=auth.uid() limit 1;
  if v_profile.id is null or v_profile.deleted_at is not null or v_profile.account_state <> 'active'
     or (coalesce(v_profile.verification_level,0) < 1 and not public.is_admin_user(auth.uid())) then
    raise exception 'live_admission_account_ineligible' using errcode='42501';
  end if;
  select * into v_session from public.live_sessions s where s.id=p_session_id;
  if v_session.id is null or v_session.status not in ('backstage','live','ending') then
    raise exception 'live_admission_session_unavailable' using errcode='42501';
  end if;
  select * into v_participant from public.live_participants lp
  where lp.session_id=p_session_id and lp.user_id=auth.uid();
  if v_participant.id is null
     or v_participant.state not in ('confirmed','backstage','audience','stage_requested','on_stage','temporarily_disconnected')
     or not public.has_live_capability(p_session_id,'live.join') then
    raise exception 'live_admission_forbidden' using errcode='42501';
  end if;

  return query select
    v_session.id,auth.uid(),v_profile.id,v_participant.role,
    coalesce(
      (select array_agg(lpr.role order by lpr.role)
       from public.live_participant_roles lpr
       where lpr.session_id=v_session.id and lpr.user_id=auth.uid()),
      array[v_participant.role]
    ),
    v_participant.state,v_session.status,v_session.provider,
    v_session.provider_call_type,v_session.provider_call_id,
    public.resolve_live_capabilities(v_session.id,auth.uid()),
    v_session.maximum_participants;
end;
$$;

create or replace function public.rpc_join_live_session(p_session_id uuid)
returns public.live_participants
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_profile public.profiles;
  v_session public.live_sessions;
  v_participant public.live_participants;
  v_other_occupants bigint;
begin
  v_profile := public.live_active_profile(auth.uid());
  select * into v_session
  from public.live_sessions
  where id=p_session_id
  for update;

  if v_session.id is null or v_session.status <> 'live'
     or not public.can_view_live_session(p_session_id,auth.uid()) then
    raise exception 'live_join_unavailable' using errcode='42501';
  end if;

  select * into v_participant
  from public.live_participants
  where session_id=p_session_id and user_id=auth.uid()
  for update;

  if v_participant.state in ('removed','banned') then
    raise exception 'live_join_forbidden' using errcode='42501';
  end if;

  -- The locked session row serializes concurrent admissions. A disconnected
  -- member keeps a short two-minute reservation so a network handoff does not
  -- eject them, but abandoned rows cannot hold capacity indefinitely.
  select count(*) into v_other_occupants
  from public.live_participants p
  where p.session_id=p_session_id
    and p.user_id <> auth.uid()
    and p.state in ('backstage','audience','stage_requested','on_stage','private_spark','temporarily_disconnected')
    and (
      p.user_id=v_session.created_by_user_id
      or p.last_seen_at >= timezone('utc',now())-interval '2 minutes'
    );

  if v_other_occupants >= v_session.maximum_participants then
    raise exception 'live_room_capacity_reached' using errcode='23514';
  end if;

  if v_participant.id is null then
    insert into public.live_participants(
      session_id,user_id,profile_id,origin_context_type,origin_context_id,
      role,state,rsvp_status,joined_at,last_seen_at,reconnect_state
    ) values (
      p_session_id,auth.uid(),v_profile.id,v_session.context_type,v_session.context_id,
      'audience','audience','going',timezone('utc',now()),timezone('utc',now()),null
    ) returning * into v_participant;

    insert into public.live_participant_roles(session_id,user_id,role,assigned_by_user_id)
    values(p_session_id,auth.uid(),'audience',auth.uid())
    on conflict do nothing;
  else
    update public.live_participants
    set state=case
          when state='temporarily_disconnected' then coalesce(reconnect_state,'audience')
          when state in ('invited','confirmed','waitlisted','left') then 'audience'
          else state
        end,
        reconnect_state=null,
        rsvp_status='going',
        joined_at=coalesce(joined_at,timezone('utc',now())),
        last_seen_at=timezone('utc',now()),
        left_at=null
    where id=v_participant.id
    returning * into v_participant;
  end if;

  insert into public.live_session_events(session_id,actor_user_id,event_type,to_state)
  values(p_session_id,auth.uid(),'participant_joined',v_participant.state);
  return v_participant;
end;
$$;

create or replace function public.cleanup_live_stale_participants()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_disconnected bigint;
  v_released bigint;
begin
  if current_user <> 'postgres'
     and coalesce(auth.role(),'') <> 'service_role'
     and not public.is_admin_user(auth.uid()) then
    raise exception 'live_presence_cleanup_forbidden' using errcode='42501';
  end if;

  update public.live_participants p
  set reconnect_state=p.state,
      state='temporarily_disconnected'
  from public.live_sessions s
  where s.id=p.session_id
    and s.status in ('backstage','live','ending')
    and p.state in ('backstage','audience','stage_requested','on_stage')
    and p.last_seen_at < timezone('utc',now())-interval '45 seconds';
  get diagnostics v_disconnected = row_count;

  with expired as (
    update public.live_participants p
    set state='left',stage_slot=null,reconnect_state=null,
        stage_left_at=case when p.stage_slot is not null then timezone('utc',now()) else p.stage_left_at end,
        left_at=timezone('utc',now())
    from public.live_sessions s
    where s.id=p.session_id
      and s.status in ('backstage','live','ending')
      and p.role <> 'host'
      and p.state='temporarily_disconnected'
      and p.last_seen_at < timezone('utc',now())-interval '2 minutes'
    returning p.session_id,p.user_id,p.profile_id
  ), recorded_events as (
    insert into public.live_session_events(
      session_id,actor_user_id,event_type,to_state,metadata
    )
    select
      e.session_id,e.user_id,'participant_presence_expired','left',
      jsonb_build_object('profileId',e.profile_id)
    from expired e
    returning 1
  ), removed_grants as (
    delete from public.live_session_capability_assignments a
    using expired e
    where a.session_id=e.session_id
      and a.user_id=e.user_id
      and a.capability='live.publish'
      and a.effect='grant'
    returning 1
  )
  select count(*) into v_released from removed_grants;

  update public.live_seat_requests r
  set status='withdrawn',resolved_at=timezone('utc',now())
  from public.live_participants p
  where p.session_id=r.session_id
    and p.user_id=r.user_id
    and p.state='left'
    and r.status='pending';

  return jsonb_build_object(
    'participantsMarkedDisconnected',v_disconnected,
    'publisherGrantsReleased',v_released
  );
end;
$$;

create or replace function public.rpc_list_live_comments(
  p_session_id uuid,
  p_limit integer default 40,
  p_before timestamptz default null
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select coalesce(jsonb_agg(item order by created_at),'[]'::jsonb)
  from (
    select
      to_jsonb(c)
      || jsonb_build_object(
        'full_name',pr.full_name,
        'avatar_url',public.live_profile_avatar(pr),
        'role',coalesce(lp.role,'audience')
      ) as item,
      c.created_at
    from public.live_comments c
    join public.profiles pr on pr.id=c.profile_id
    left join public.live_participants lp
      on lp.session_id=c.session_id and lp.user_id=c.user_id
    where c.session_id=p_session_id
      and c.status='visible'
      and public.can_view_live_session(p_session_id,auth.uid())
      and (p_before is null or c.created_at < p_before)
    order by c.created_at desc
    limit greatest(1,least(coalesce(p_limit,40),80))
  ) feed;
$$;

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
    'commentCount',(select count(*) from public.live_comments c
      where c.session_id=p_session_id and c.status='visible'),
    'comments',public.rpc_list_live_comments(p_session_id,40,null)
  );
end;
$$;

revoke all on function public.rpc_heartbeat_live_session(uuid),
  public.rpc_get_live_rtc_admission_v2(uuid),public.rpc_join_live_session(uuid),
  public.rpc_list_live_comments(uuid,integer,timestamptz)
from public,anon,authenticated;
grant execute on function public.rpc_heartbeat_live_session(uuid),
  public.rpc_get_live_rtc_admission_v2(uuid),public.rpc_join_live_session(uuid),
  public.rpc_list_live_comments(uuid,integer,timestamptz)
to authenticated;

revoke all on function public.cleanup_live_stale_participants() from public,anon,authenticated;
grant execute on function public.cleanup_live_stale_participants() to service_role;

do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname='live-presence-cleanup';
    perform cron.schedule(
      'live-presence-cleanup',
      '* * * * *',
      'select public.cleanup_live_stale_participants();'
    );
  end if;
end;
$$;
