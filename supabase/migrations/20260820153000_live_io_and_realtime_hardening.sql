-- Keep high-frequency Live liveness traffic out of the durable participant
-- roster and out of Supabase Realtime. Structural participant transitions
-- remain durable; disposable heartbeats live in an unlogged lease table.

create unlogged table if not exists public.live_presence_leases (
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  participant_id uuid not null references public.live_participants(id) on delete cascade,
  heartbeat_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default timezone('utc', now()) + interval '90 seconds',
  primary key (session_id, user_id),
  constraint live_presence_leases_participant_unique unique (participant_id),
  constraint live_presence_leases_expiry_valid check (expires_at > heartbeat_at)
);

create index if not exists live_presence_leases_expiry_idx
  on public.live_presence_leases(expires_at, session_id);

-- This table is intentionally update-heavy and tiny. Keep enough page room
-- for repeated lease renewal and vacuum dead tuples before they accumulate.
alter table public.live_presence_leases set (
  fillfactor=80,
  autovacuum_vacuum_scale_factor=0.02,
  autovacuum_vacuum_threshold=50,
  autovacuum_analyze_scale_factor=0.05,
  autovacuum_analyze_threshold=50
);

create index if not exists live_comments_visible_session_feed_idx
  on public.live_comments(session_id, created_at desc)
  where status='visible';

alter table public.live_presence_leases enable row level security;
revoke all on table public.live_presence_leases from public, anon, authenticated;

create or replace function public.sync_live_presence_lease_from_participant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if new.state in ('backstage','audience','stage_requested','on_stage','temporarily_disconnected') then
    insert into public.live_presence_leases(
      session_id,user_id,participant_id,heartbeat_at,expires_at
    ) values (
      new.session_id,new.user_id,new.id,timezone('utc',now()),
      timezone('utc',now())+interval '90 seconds'
    )
    on conflict(session_id,user_id) do update
    set participant_id=excluded.participant_id,
        heartbeat_at=excluded.heartbeat_at,
        expires_at=excluded.expires_at;
  else
    delete from public.live_presence_leases lease
    where lease.session_id=new.session_id and lease.user_id=new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists live_participants_sync_presence_lease on public.live_participants;
create trigger live_participants_sync_presence_lease
after insert or update of state on public.live_participants
for each row execute function public.sync_live_presence_lease_from_participant();

-- Give already-connected clients one lease window to publish their first
-- isolated heartbeat after this migration is applied.
insert into public.live_presence_leases(
  session_id,user_id,participant_id,heartbeat_at,expires_at
)
select
  participant.session_id,participant.user_id,participant.id,
  timezone('utc',now()),timezone('utc',now())+interval '90 seconds'
from public.live_participants participant
join public.live_sessions session on session.id=participant.session_id
where session.status in ('backstage','live','ending')
  and participant.state in ('backstage','audience','stage_requested','on_stage','temporarily_disconnected')
on conflict(session_id,user_id) do update
set participant_id=excluded.participant_id,
    heartbeat_at=excluded.heartbeat_at,
    expires_at=excluded.expires_at;

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
  v_now timestamptz := timezone('utc',now());
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode='42501';
  end if;

  select participant.* into v_participant
  from public.live_participants participant
  join public.live_sessions session on session.id=participant.session_id
  where participant.session_id=p_session_id
    and participant.user_id=auth.uid()
    and participant.state not in ('left','removed','banned')
    and session.status in ('backstage','live','ending')
  for update of participant;

  if v_participant.id is null then
    raise exception 'live_heartbeat_unavailable' using errcode='42501';
  end if;

  -- Only a genuine reconnect is a durable structural transition. Normal
  -- heartbeats never update the Realtime-published participant row.
  if v_participant.state='temporarily_disconnected' then
    v_restore_state := coalesce(
      v_participant.reconnect_state,
      case when v_participant.role='host' then 'on_stage' else 'audience' end
    );
    update public.live_participants
    set state=v_restore_state,reconnect_state=null,left_at=null
    where id=v_participant.id
    returning * into v_participant;
  end if;

  insert into public.live_presence_leases as current_lease(
    session_id,user_id,participant_id,heartbeat_at,expires_at
  ) values (
    p_session_id,auth.uid(),v_participant.id,v_now,v_now+interval '90 seconds'
  )
  on conflict(session_id,user_id) do update
  set participant_id=excluded.participant_id,
      heartbeat_at=excluded.heartbeat_at,
      expires_at=excluded.expires_at
  -- Released builds heartbeat every 15 seconds. Coalesce those calls at the
  -- database boundary so rolling deployment does not recreate write churn.
  where current_lease.heartbeat_at <= excluded.heartbeat_at-interval '20 seconds';

  return v_participant;
end;
$$;

-- Recreate admission so capacity is based on fresh leases, not heartbeat
-- timestamps on the structural roster.
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
  select * into v_session from public.live_sessions where id=p_session_id for update;

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

  select count(*) into v_other_occupants
  from public.live_participants participant
  where participant.session_id=p_session_id
    and participant.user_id <> auth.uid()
    and participant.state in ('backstage','audience','stage_requested','on_stage','private_spark','temporarily_disconnected')
    and (
      participant.user_id=v_session.created_by_user_id
      or exists (
        select 1 from public.live_presence_leases lease
        where lease.session_id=participant.session_id
          and lease.user_id=participant.user_id
          and lease.expires_at > timezone('utc',now())
      )
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
        reconnect_state=null,rsvp_status='going',
        joined_at=coalesce(joined_at,timezone('utc',now())),
        last_seen_at=timezone('utc',now()),left_at=null
    where id=v_participant.id
    returning * into v_participant;
  end if;

  insert into public.live_presence_leases(
    session_id,user_id,participant_id,heartbeat_at,expires_at
  ) values (
    p_session_id,auth.uid(),v_participant.id,timezone('utc',now()),
    timezone('utc',now())+interval '90 seconds'
  )
  on conflict(session_id,user_id) do update
  set participant_id=excluded.participant_id,
      heartbeat_at=excluded.heartbeat_at,
      expires_at=excluded.expires_at;

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
  v_disconnected bigint := 0;
  v_released bigint := 0;
  v_leases_removed bigint := 0;
begin
  if current_user <> 'postgres'
     and coalesce(auth.role(),'') <> 'service_role'
     and not public.is_admin_user(auth.uid()) then
    raise exception 'live_presence_cleanup_forbidden' using errcode='42501';
  end if;

  -- UNLOGGED leases are intentionally discarded after a database crash or
  -- restart. Give connected clients two heartbeat cycles to reconstruct the
  -- lease set before interpreting an empty lease table as abandonment.
  if timezone('utc',now())-pg_postmaster_start_time() < interval '2 minutes' then
    return jsonb_build_object(
      'status','restart_grace',
      'participantsMarkedDisconnected',0,
      'publisherGrantsReleased',0,
      'staleLeasesRemoved',0
    );
  end if;

  update public.live_participants participant
  set reconnect_state=participant.state,state='temporarily_disconnected'
  from public.live_sessions session
  where session.id=participant.session_id
    and session.status in ('backstage','live','ending')
    and participant.state in ('backstage','audience','stage_requested','on_stage')
    and participant.user_id <> session.created_by_user_id
    and not exists (
      select 1 from public.live_presence_leases lease
      where lease.session_id=participant.session_id
        and lease.user_id=participant.user_id
        and lease.expires_at > timezone('utc',now())
    );
  get diagnostics v_disconnected = row_count;

  with expired as (
    update public.live_participants participant
    set state='left',stage_slot=null,reconnect_state=null,
        stage_left_at=case when participant.stage_slot is not null
          then timezone('utc',now()) else participant.stage_left_at end,
        left_at=timezone('utc',now())
    from public.live_sessions session
    where session.id=participant.session_id
      and session.status in ('backstage','live','ending')
      and participant.role <> 'host'
      and participant.state='temporarily_disconnected'
      and not exists (
        select 1 from public.live_presence_leases lease
        where lease.session_id=participant.session_id
          and lease.user_id=participant.user_id
          and lease.heartbeat_at > timezone('utc',now())-interval '2 minutes'
      )
    returning participant.session_id,participant.user_id,participant.profile_id
  ), recorded_events as (
    insert into public.live_session_events(
      session_id,actor_user_id,event_type,to_state,metadata
    )
    select
      item.session_id,item.user_id,'participant_presence_expired','left',
      jsonb_build_object('profileId',item.profile_id)
    from expired item
    returning 1
  ), removed_grants as (
    delete from public.live_session_capability_assignments assignment
    using expired item
    where assignment.session_id=item.session_id
      and assignment.user_id=item.user_id
      and assignment.capability='live.publish'
      and assignment.effect='grant'
    returning 1
  )
  select count(*) into v_released from removed_grants;

  update public.live_seat_requests request
  set status='withdrawn',resolved_at=timezone('utc',now())
  from public.live_participants participant
  where participant.session_id=request.session_id
    and participant.user_id=request.user_id
    and participant.state='left'
    and request.status='pending';

  delete from public.live_presence_leases lease
  where lease.heartbeat_at < timezone('utc',now())-interval '10 minutes'
     or not exists (
       select 1 from public.live_sessions session
       where session.id=lease.session_id
         and session.status in ('backstage','live','ending')
     );
  get diagnostics v_leases_removed = row_count;

  return jsonb_build_object(
    'participantsMarkedDisconnected',v_disconnected,
    'publisherGrantsReleased',v_released,
    'staleLeasesRemoved',v_leases_removed
  );
end;
$$;

create or replace function public.rpc_get_live_room_pulse(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select jsonb_build_object(
    'commentCount',(select count(*) from public.live_comments comment
      where comment.session_id=p_session_id and comment.status='visible'),
    'comments',public.rpc_list_live_comments(p_session_id,40,null)
  )
  where auth.uid() is not null
    and public.can_view_live_session(p_session_id,auth.uid());
$$;

-- One guarded maintenance entry point replaces three independent cron
-- transactions. Failures are isolated so one cleanup cannot starve the rest.
create table if not exists public.live_maintenance_failures (
  id bigint generated always as identity primary key,
  task_name text not null,
  sqlstate text not null,
  error_message text not null,
  occurred_at timestamptz not null default timezone('utc',now())
);

create index if not exists live_maintenance_failures_recent_idx
  on public.live_maintenance_failures(occurred_at desc);

alter table public.live_maintenance_failures enable row level security;
revoke all on table public.live_maintenance_failures from public,anon,authenticated;

create or replace function public.run_live_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_presence jsonb := '{}'::jsonb;
  v_rounds integer := 0;
  v_sparks integer := 0;
  v_errors jsonb := '[]'::jsonb;
begin
  if current_user <> 'postgres' and coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'live_maintenance_forbidden' using errcode='42501';
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended('betweener:live-maintenance',0)) then
    return jsonb_build_object('status','skipped_locked');
  end if;

  begin
    v_presence := public.cleanup_live_stale_participants();
  exception when others then
    insert into public.live_maintenance_failures(task_name,sqlstate,error_message)
    values('presence',sqlstate,sqlerrm);
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('task','presence','code',sqlstate));
  end;
  begin
    v_rounds := public.cleanup_live_match_rounds();
  exception when others then
    insert into public.live_maintenance_failures(task_name,sqlstate,error_message)
    values('match_rounds',sqlstate,sqlerrm);
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('task','match_rounds','code',sqlstate));
  end;
  begin
    v_sparks := public.cleanup_live_private_sparks();
  exception when others then
    insert into public.live_maintenance_failures(task_name,sqlstate,error_message)
    values('private_sparks',sqlstate,sqlerrm);
    v_errors := v_errors || jsonb_build_array(jsonb_build_object('task','private_sparks','code',sqlstate));
  end;

  delete from public.live_maintenance_failures
  where occurred_at < timezone('utc',now())-interval '14 days';

  return jsonb_build_object(
    'status',case when jsonb_array_length(v_errors)=0 then 'ok' else 'partial' end,
    'presence',v_presence,'matchRoundsExpired',v_rounds,
    'privateSparksExpired',v_sparks,'errors',v_errors
  );
end;
$$;

revoke all on function public.sync_live_presence_lease_from_participant(),
  public.rpc_heartbeat_live_session(uuid),public.rpc_join_live_session(uuid),
  public.cleanup_live_stale_participants(),public.rpc_get_live_room_pulse(uuid),
  public.run_live_maintenance()
from public,anon,authenticated;
grant execute on function public.rpc_heartbeat_live_session(uuid),
  public.rpc_join_live_session(uuid),public.rpc_get_live_room_pulse(uuid)
to authenticated;
grant execute on function public.cleanup_live_stale_participants(),
  public.run_live_maintenance()
to service_role;

-- Reactions are persisted for safety/analytics but the current client does
-- not consume reaction rows. Avoid replicating this high-volume table until
-- reaction animation moves to ephemeral Realtime Broadcast.
do $$
begin
  if exists(
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public' and tablename='live_reactions'
  ) then
    alter publication supabase_realtime drop table public.live_reactions;
  end if;

  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.unschedule(jobid) from cron.job
    where jobname in (
      'live-presence-cleanup','live-match-round-expiry',
      'live-private-spark-cleanup','live-maintenance'
    );
    perform cron.schedule(
      'live-maintenance','* * * * *','select public.run_live_maintenance();'
    );
  end if;
end;
$$;
