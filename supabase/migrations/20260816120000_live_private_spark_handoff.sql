-- Betweener Live Phase 3.1: mutually-consented, two-person Private Spark.
-- The public host can offer and safety-terminate a Spark, but can never read
-- private consent decisions or receive private-room RTC admission.

begin;

create table public.live_private_sparks (
  id uuid primary key default gen_random_uuid(),
  match_round_id uuid not null unique references public.live_match_rounds(id) on delete cascade,
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  participant_a_user_id uuid not null references auth.users(id) on delete cascade,
  participant_a_profile_id uuid not null references public.profiles(id) on delete cascade,
  participant_b_user_id uuid not null references auth.users(id) on delete cascade,
  participant_b_profile_id uuid not null references public.profiles(id) on delete cascade,
  state text not null default 'awaiting_consent',
  provider text not null default 'stream',
  provider_call_type text not null default 'betweener_live',
  provider_call_id text not null,
  consent_expires_at timestamptz not null default (timezone('utc',now()) + interval '5 minutes'),
  active_expires_at timestamptz,
  activated_at timestamptz,
  ended_at timestamptz,
  ended_by_user_id uuid references auth.users(id) on delete set null,
  end_reason text,
  version bigint not null default 1,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now()),
  constraint live_private_spark_users_distinct check (participant_a_user_id <> participant_b_user_id),
  constraint live_private_spark_profiles_distinct check (participant_a_profile_id <> participant_b_profile_id),
  constraint live_private_spark_state_valid check (state in (
    'awaiting_consent','active','declined','expired','ended','terminated'
  )),
  constraint live_private_spark_provider_call_unique unique (provider,provider_call_id),
  constraint live_private_spark_provider_call_length check (char_length(provider_call_id) between 8 and 160),
  constraint live_private_spark_active_expiry_valid check (
    (state <> 'active') or (activated_at is not null and active_expires_at > activated_at)
  )
);

create table public.live_private_spark_responses (
  id uuid primary key default gen_random_uuid(),
  private_spark_id uuid not null references public.live_private_sparks(id) on delete cascade,
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  decision text not null,
  responded_at timestamptz not null default timezone('utc',now()),
  constraint live_private_spark_response_valid check (decision in ('accepted','declined')),
  constraint live_private_spark_response_unique unique (private_spark_id,user_id)
);

create index live_private_sparks_participant_a_idx
  on public.live_private_sparks(participant_a_user_id,state,updated_at desc);
create index live_private_sparks_participant_b_idx
  on public.live_private_sparks(participant_b_user_id,state,updated_at desc);
create index live_private_spark_responses_spark_idx
  on public.live_private_spark_responses(private_spark_id,responded_at);

create trigger live_private_sparks_set_updated_at
before update on public.live_private_sparks
for each row execute function public.set_updated_at();

create or replace function public.enforce_live_private_spark_transition()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if new.state=old.state then return new; end if;
  if not (
    (old.state='awaiting_consent' and new.state in ('active','declined','expired','terminated'))
    or (old.state='active' and new.state in ('ended','expired','terminated'))
  ) then
    raise exception 'invalid_live_private_spark_transition:%:%',old.state,new.state using errcode='23514';
  end if;
  new.version := old.version + 1;
  return new;
end;
$$;

create trigger live_private_spark_transition_guard
before update of state on public.live_private_sparks
for each row execute function public.enforce_live_private_spark_transition();

create or replace function public.enforce_live_private_spark_response_participant()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if not exists (
    select 1 from public.live_private_sparks s
    where s.id=new.private_spark_id and s.session_id=new.session_id
      and new.user_id in (s.participant_a_user_id,s.participant_b_user_id)
  ) then
    raise exception 'live_private_spark_response_participant_invalid' using errcode='23514';
  end if;
  return new;
end;
$$;

create trigger live_private_spark_response_participant_guard
before insert or update on public.live_private_spark_responses
for each row execute function public.enforce_live_private_spark_response_participant();

create or replace function public.enforce_live_private_spark_availability()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if exists (
    select 1
    from public.live_private_sparks existing
    where existing.state in ('awaiting_consent','active')
      and (
        new.participant_a_user_id in (
          existing.participant_a_user_id,
          existing.participant_b_user_id
        )
        or new.participant_b_user_id in (
          existing.participant_a_user_id,
          existing.participant_b_user_id
        )
      )
  ) then
    raise exception 'live_private_spark_participant_busy' using errcode='23505';
  end if;
  return new;
end;
$$;

create trigger live_private_spark_availability_guard
before insert on public.live_private_sparks
for each row execute function public.enforce_live_private_spark_availability();

create trigger live_private_sparks_bump_update
after insert or update or delete on public.live_private_sparks
for each row execute function public.bump_live_match_round_update();

create trigger live_private_spark_responses_bump_update
after insert or update or delete on public.live_private_spark_responses
for each row execute function public.bump_live_match_round_update();

-- Private Spark starts after the public introduction has returned both people
-- to the audience; the durable participant guard must allow that promotion.
create or replace function public.enforce_live_participant_state_transition()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if new.state = old.state then return new; end if;
  if not (
    (old.state = 'invited' and new.state in ('confirmed','declined','waitlisted','left','removed','banned'))
    or (old.state = 'confirmed' and new.state in ('backstage','audience','waitlisted','left','removed','banned'))
    or (old.state = 'waitlisted' and new.state in ('confirmed','backstage','audience','left','removed','banned'))
    or (old.state = 'backstage' and new.state in ('audience','stage_requested','on_stage','temporarily_disconnected','left','removed','banned'))
    or (old.state = 'audience' and new.state in ('stage_requested','backstage','on_stage','private_spark','temporarily_disconnected','left','removed','banned'))
    or (old.state = 'stage_requested' and new.state in ('backstage','audience','on_stage','temporarily_disconnected','left','removed','banned'))
    or (old.state = 'on_stage' and new.state in ('backstage','audience','private_spark','temporarily_disconnected','left','removed','banned'))
    or (old.state = 'private_spark' and new.state in ('on_stage','audience','temporarily_disconnected','left','removed','banned'))
    or (old.state = 'temporarily_disconnected' and new.state in ('backstage','audience','stage_requested','on_stage','private_spark','left','removed','banned'))
    or (old.state = 'left' and new.state in ('confirmed','backstage','audience','removed','banned'))
    or (old.state = 'removed' and new.state in ('confirmed','banned'))
  ) then
    raise exception 'invalid_live_participant_transition:%:%',old.state,new.state using errcode='23514';
  end if;
  return new;
end;
$$;

create or replace function public.live_private_spark_projection(p_spark_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_spark public.live_private_sparks;
  v_can_manage boolean;
  v_is_participant boolean;
  v_my_response text;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select * into v_spark from public.live_private_sparks where id=p_spark_id;
  if v_spark.id is null then return null; end if;
  v_can_manage := public.has_live_capability(v_spark.session_id,'live.terminate_private_spark');
  v_is_participant := auth.uid() in (v_spark.participant_a_user_id,v_spark.participant_b_user_id);
  if not v_is_participant and not v_can_manage then
    raise exception 'live_private_spark_forbidden' using errcode='42501';
  end if;
  if v_is_participant then
    select decision into v_my_response from public.live_private_spark_responses
    where private_spark_id=v_spark.id and user_id=auth.uid();
  end if;
  return jsonb_build_object(
    'id',v_spark.id,'session_id',v_spark.session_id,'match_round_id',v_spark.match_round_id,
    'state',v_spark.state,'is_participant',v_is_participant,'can_manage',v_can_manage,
    'my_response',v_my_response,'consent_expires_at',v_spark.consent_expires_at,
    'active_expires_at',v_spark.active_expires_at,
    'participant_a',(select jsonb_build_object(
      'user_id',v_spark.participant_a_user_id,'profile_id',p.id,
      'full_name',p.full_name,'avatar_url',public.live_profile_avatar(p)
    ) from public.profiles p where p.id=v_spark.participant_a_profile_id),
    'participant_b',(select jsonb_build_object(
      'user_id',v_spark.participant_b_user_id,'profile_id',p.id,
      'full_name',p.full_name,'avatar_url',public.live_profile_avatar(p)
    ) from public.profiles p where p.id=v_spark.participant_b_profile_id)
  );
end;
$$;

create or replace function public.rpc_get_live_private_spark(p_spark_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$ select public.live_private_spark_projection(p_spark_id); $$;

create or replace function public.rpc_get_live_private_spark_snapshot(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select s.id into v_id from public.live_private_sparks s
  where s.session_id=p_session_id
    and s.state in ('awaiting_consent','active')
    and (auth.uid() in (s.participant_a_user_id,s.participant_b_user_id)
      or public.has_live_capability(p_session_id,'live.terminate_private_spark'))
  order by s.updated_at desc limit 1;
  return case when v_id is null then null else public.live_private_spark_projection(v_id) end;
end;
$$;

create or replace function public.rpc_respond_live_private_spark(p_private_spark_id uuid,p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_spark public.live_private_sparks;
  v_existing text;
  v_decision text := case when p_accept then 'accepted' else 'declined' end;
  v_accepted integer;
  v_available integer;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_private_spark_id::text,0));
  select * into v_spark from public.live_private_sparks where id=p_private_spark_id for update;
  if v_spark.id is null then raise exception 'live_private_spark_not_found' using errcode='P0002'; end if;
  if auth.uid() not in (v_spark.participant_a_user_id,v_spark.participant_b_user_id) then
    raise exception 'live_private_spark_response_forbidden' using errcode='42501';
  end if;
  select decision into v_existing from public.live_private_spark_responses
  where private_spark_id=v_spark.id and user_id=auth.uid();
  if v_existing is not null then
    if v_existing<>v_decision then raise exception 'live_private_spark_response_already_recorded' using errcode='23505'; end if;
    return public.live_private_spark_projection(v_spark.id);
  end if;
  if v_spark.state<>'awaiting_consent' then raise exception 'live_private_spark_not_awaiting_consent' using errcode='22023'; end if;
  if v_spark.consent_expires_at<=timezone('utc',now()) then
    update public.live_private_sparks set state='expired',ended_at=timezone('utc',now()),end_reason='consent_timeout'
    where id=v_spark.id;
    return public.live_private_spark_projection(v_spark.id);
  end if;
  insert into public.live_private_spark_responses(private_spark_id,session_id,user_id,decision)
  values(v_spark.id,v_spark.session_id,auth.uid(),v_decision);
  if not p_accept then
    update public.live_private_sparks set state='declined',ended_at=timezone('utc',now()),end_reason='declined'
    where id=v_spark.id;
  else
    select count(*) into v_accepted from public.live_private_spark_responses
    where private_spark_id=v_spark.id and decision='accepted';
    if v_accepted=2 then
      select count(*) into v_available
      from public.live_participants p
      where p.session_id=v_spark.session_id
        and p.user_id in (v_spark.participant_a_user_id,v_spark.participant_b_user_id)
        and p.state in ('audience','on_stage','backstage','stage_requested','temporarily_disconnected');
      if v_available<>2 then
        update public.live_private_sparks set state='expired',ended_at=timezone('utc',now()),
          end_reason='participant_unavailable' where id=v_spark.id;
      else
        update public.live_private_sparks set state='active',activated_at=timezone('utc',now()),
          active_expires_at=timezone('utc',now())+interval '20 minutes' where id=v_spark.id;
        update public.live_participants set state='private_spark',stage_slot=null,
          open_to_introductions=false,stage_left_at=timezone('utc',now())
        where session_id=v_spark.session_id
          and user_id in (v_spark.participant_a_user_id,v_spark.participant_b_user_id)
          and state in ('audience','on_stage','backstage','stage_requested','temporarily_disconnected');
        insert into public.live_session_events(session_id,actor_user_id,event_type,to_state,metadata)
        values(v_spark.session_id,null,'private_spark_activated','active',jsonb_build_object('privateSparkId',v_spark.id));
      end if;
    end if;
  end if;
  return public.live_private_spark_projection(v_spark.id);
end;
$$;

create or replace function public.rpc_end_live_private_spark(p_private_spark_id uuid,p_reason text default 'left')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_spark public.live_private_sparks; v_target text;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_private_spark_id::text,0));
  select * into v_spark from public.live_private_sparks where id=p_private_spark_id for update;
  if v_spark.id is null then raise exception 'live_private_spark_not_found' using errcode='P0002'; end if;
  if auth.uid() in (v_spark.participant_a_user_id,v_spark.participant_b_user_id) then v_target:='ended';
  elsif public.has_live_capability(v_spark.session_id,'live.terminate_private_spark') then v_target:='terminated';
  else raise exception 'live_private_spark_end_forbidden' using errcode='42501'; end if;
  if v_spark.state in ('ended','terminated','declined','expired') then return public.live_private_spark_projection(v_spark.id); end if;
  update public.live_private_sparks set state=v_target,ended_at=timezone('utc',now()),
    ended_by_user_id=auth.uid(),end_reason=left(coalesce(nullif(btrim(p_reason),''),'left'),80)
  where id=v_spark.id;
  update public.live_participants set state='audience',stage_slot=null,last_seen_at=timezone('utc',now())
  where session_id=v_spark.session_id and user_id in (v_spark.participant_a_user_id,v_spark.participant_b_user_id)
    and state='private_spark';
  insert into public.live_session_events(session_id,actor_user_id,event_type,to_state,metadata)
  values(v_spark.session_id,auth.uid(),'private_spark_ended',v_target,jsonb_build_object('privateSparkId',v_spark.id));
  return public.live_private_spark_projection(v_spark.id);
end;
$$;

create or replace function public.rpc_get_live_private_spark_rtc_admission(p_private_spark_id uuid)
returns table(
  private_spark_id uuid, source_session_id uuid, user_id uuid, profile_id uuid,
  primary_role text, roles text[], participant_state text, session_status text,
  provider text, provider_call_type text, provider_call_id text, capabilities text[],
  maximum_participants integer, participant_user_ids uuid[]
)
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_spark public.live_private_sparks; v_profile public.profiles;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode='42501'; end if;
  select * into v_spark from public.live_private_sparks where id=p_private_spark_id;
  if v_spark.id is null or v_spark.state<>'active'
     or v_spark.active_expires_at<=timezone('utc',now())
     or auth.uid() not in (v_spark.participant_a_user_id,v_spark.participant_b_user_id) then
    raise exception 'live_private_spark_admission_forbidden' using errcode='42501';
  end if;
  select * into v_profile from public.profiles where user_id=auth.uid() limit 1;
  if v_profile.id is null or v_profile.deleted_at is not null or v_profile.account_state<>'active'
     or (coalesce(v_profile.verification_level,0)<1 and not public.is_admin_user(auth.uid())) then
    raise exception 'live_private_spark_account_ineligible' using errcode='42501';
  end if;
  if exists(select 1 from public.blocks b where
    (b.blocker_id=v_spark.participant_a_user_id and b.blocked_id=v_spark.participant_b_user_id)
    or (b.blocker_id=v_spark.participant_b_user_id and b.blocked_id=v_spark.participant_a_user_id)) then
    raise exception 'live_private_spark_blocked' using errcode='42501';
  end if;
  return query select v_spark.id,v_spark.session_id,auth.uid(),v_profile.id,
    'audience'::text,array['audience']::text[],'private_spark'::text,'live'::text,
    v_spark.provider,v_spark.provider_call_type,v_spark.provider_call_id,
    array['live.join','live.publish','live.report','live.block']::text[],2,
    array[v_spark.participant_a_user_id,v_spark.participant_b_user_id]::uuid[];
end;
$$;

create or replace function public.cleanup_live_private_sparks()
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_count integer;
begin
  with expired as (
    update public.live_private_sparks set state='expired',ended_at=timezone('utc',now()),
      end_reason=case when state='active' then 'session_timeout' else 'consent_timeout' end
    where (state='awaiting_consent' and consent_expires_at<=timezone('utc',now()))
       or (state='active' and active_expires_at<=timezone('utc',now()))
    returning session_id,participant_a_user_id,participant_b_user_id
  ), restored as (
    update public.live_participants p set state='audience',stage_slot=null,last_seen_at=timezone('utc',now())
    from expired e where p.session_id=e.session_id
      and p.user_id in (e.participant_a_user_id,e.participant_b_user_id) and p.state='private_spark'
    returning p.id
  ) select count(*) into v_count from expired;
  return v_count;
end;
$$;

-- Completion is now an idempotent offer of a private continuation, never an
-- automatic private-room admission.
create or replace function public.rpc_transition_live_match_round(p_match_round_id uuid,p_target_state text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_round public.live_match_rounds;
  v_session public.live_sessions;
  v_other_publishers integer;
  v_spark_id uuid;
begin
  select * into v_round from public.live_match_rounds where id=p_match_round_id for update;
  if v_round.id is null then raise exception 'live_match_round_not_found' using errcode='P0002'; end if;
  if not public.has_live_capability(v_round.session_id,'live.create_match_round') then
    raise exception 'live_match_round_transition_forbidden' using errcode='42501';
  end if;
  if p_target_state='public_introduction' then
    if v_round.state<>'both_accepted' then raise exception 'live_match_consent_incomplete' using errcode='22023'; end if;
    select * into v_session from public.live_sessions where id=v_round.session_id for update;
    select count(*) into v_other_publishers from public.live_participants p
    where p.session_id=v_round.session_id and (p.role='host' or p.state='on_stage')
      and p.user_id not in (v_round.participant_a_user_id,v_round.participant_b_user_id);
    if v_other_publishers+2>v_session.maximum_publishers then raise exception 'live_match_stage_capacity_exceeded' using errcode='22023'; end if;
    perform public.rpc_set_live_stage_participant(v_round.session_id,v_round.participant_a_user_id,true);
    perform public.rpc_set_live_stage_participant(v_round.session_id,v_round.participant_b_user_id,true);
    update public.live_match_rounds set state='public_introduction',introduction_started_at=timezone('utc',now()) where id=v_round.id;
  elsif p_target_state='completed' then
    if v_round.state='completed' then return public.live_hosted_matching_snapshot(v_round.session_id); end if;
    if v_round.state<>'public_introduction' then raise exception 'live_match_introduction_not_active' using errcode='22023'; end if;
    perform public.rpc_set_live_stage_participant(v_round.session_id,v_round.participant_a_user_id,false);
    perform public.rpc_set_live_stage_participant(v_round.session_id,v_round.participant_b_user_id,false);
    update public.live_match_rounds set state='completed',completed_at=timezone('utc',now()) where id=v_round.id;
    -- Serialize by both participant identities, in a stable order, so two
    -- concurrent hosts/sessions cannot create overlapping private rooms.
    perform pg_advisory_xact_lock(
      hashtextextended(least(v_round.participant_a_user_id,v_round.participant_b_user_id)::text,0)
    );
    perform pg_advisory_xact_lock(
      hashtextextended(greatest(v_round.participant_a_user_id,v_round.participant_b_user_id)::text,0)
    );
    insert into public.live_private_sparks(
      match_round_id,session_id,participant_a_user_id,participant_a_profile_id,
      participant_b_user_id,participant_b_profile_id,provider_call_id
    ) values (
      v_round.id,v_round.session_id,v_round.participant_a_user_id,v_round.participant_a_profile_id,
      v_round.participant_b_user_id,v_round.participant_b_profile_id,
      'private_'||replace(gen_random_uuid()::text,'-','')
    ) on conflict(match_round_id) do nothing returning id into v_spark_id;
    if v_spark_id is not null then
      -- A pending private continuation reserves both people. They must opt in
      -- again before the host can propose either person in another pairing.
      update public.live_participants
      set open_to_introductions=false,
          last_seen_at=timezone('utc',now())
      where session_id=v_round.session_id
        and user_id in (v_round.participant_a_user_id,v_round.participant_b_user_id);
      insert into public.live_session_events(session_id,actor_user_id,event_type,to_state,metadata)
      values(v_round.session_id,auth.uid(),'private_spark_consent_requested','awaiting_consent',jsonb_build_object('privateSparkId',v_spark_id));
    end if;
  elsif p_target_state='cancelled' then
    if v_round.state not in ('proposed','awaiting_consent','both_accepted','public_introduction') then raise exception 'live_match_round_not_cancellable' using errcode='22023'; end if;
    if v_round.state='public_introduction' then
      perform public.rpc_set_live_stage_participant(v_round.session_id,v_round.participant_a_user_id,false);
      perform public.rpc_set_live_stage_participant(v_round.session_id,v_round.participant_b_user_id,false);
    end if;
    update public.live_match_rounds set state='cancelled',completed_at=timezone('utc',now()) where id=v_round.id;
  else raise exception 'live_match_target_state_invalid' using errcode='22023'; end if;
  insert into public.live_session_events(session_id,actor_user_id,event_type,to_state,metadata)
  values(v_round.session_id,auth.uid(),'match_round_transitioned',p_target_state,jsonb_build_object('matchRoundId',v_round.id));
  return public.live_hosted_matching_snapshot(v_round.session_id);
end;
$$;

alter table public.live_private_sparks enable row level security;
alter table public.live_private_spark_responses enable row level security;
revoke all on public.live_private_sparks,public.live_private_spark_responses from public,anon,authenticated;

revoke all on function public.live_private_spark_projection(uuid),
  public.rpc_get_live_private_spark(uuid),public.rpc_get_live_private_spark_snapshot(uuid),
  public.rpc_respond_live_private_spark(uuid,boolean),public.rpc_end_live_private_spark(uuid,text),
  public.rpc_get_live_private_spark_rtc_admission(uuid),public.cleanup_live_private_sparks()
from public,anon,authenticated;
grant execute on function public.rpc_get_live_private_spark(uuid),
  public.rpc_get_live_private_spark_snapshot(uuid),public.rpc_respond_live_private_spark(uuid,boolean),
  public.rpc_end_live_private_spark(uuid,text),public.rpc_get_live_private_spark_rtc_admission(uuid)
to authenticated;
grant execute on function public.cleanup_live_private_sparks() to service_role;

do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname='live-private-spark-cleanup';
    perform cron.schedule('live-private-spark-cleanup','* * * * *','select public.cleanup_live_private_sparks();');
  end if;
end;
$$;

commit;
