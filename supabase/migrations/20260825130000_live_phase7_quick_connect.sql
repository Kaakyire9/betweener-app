-- Betweener Live Phase 7: server-authoritative Quick Connect rotations.
-- Pairing, time, reconnect grace and decisions are durable. A transport loss
-- is explicitly not a romantic decision.

begin;

-- Keep the original public-beta scheduler callable by installed clients. New
-- clients use this versioned contract so the Live format and Chemistry First
-- mode are chosen explicitly and validated on the server.
create or replace function public.rpc_schedule_live_session_v2(
  p_title text,
  p_description text,
  p_scheduled_start timestamptz,
  p_format text default 'hosted_match_night',
  p_chemistry_first_enabled boolean default false
)
returns public.live_sessions
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
  v_maximum_publishers integer;
begin
  if not public.rpc_can_schedule_live_session() then
    raise exception 'live_schedule_forbidden' using errcode = '42501';
  end if;
  if p_scheduled_start < timezone('utc', now()) + interval '10 minutes'
     or p_scheduled_start > timezone('utc', now()) + interval '90 days' then
    raise exception 'live_schedule_time_invalid' using errcode = '22023';
  end if;
  if p_format not in ('hosted_match_night', 'quick_connect') then
    raise exception 'live_schedule_format_invalid' using errcode = '22023';
  end if;

  v_maximum_publishers := case when p_format = 'quick_connect' then 2 else 4 end;
  v_session := public.rpc_create_live_session(
    nullif(btrim(p_title), ''), p_format, 'global', null, null, null, p_scheduled_start
  );
  update public.live_sessions
  set description = nullif(btrim(p_description), ''),
      maximum_publishers = v_maximum_publishers,
      chemistry_first_enabled = coalesce(p_chemistry_first_enabled, false),
      recording_enabled = false,
      configuration = configuration || jsonb_build_object(
        'beta', 'public_v1',
        'quick_connect_round_seconds', 180,
        'quick_connect_reconnect_grace_seconds', 30
      )
  where id = v_session.id
  returning * into v_session;
  return v_session;
end;
$$;

revoke all on function public.rpc_schedule_live_session_v2(
  text, text, timestamptz, text, boolean
) from public, anon;
grant execute on function public.rpc_schedule_live_session_v2(
  text, text, timestamptz, text, boolean
) to authenticated;

create table public.live_quick_connect_participants (
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  state text not null default 'waiting',
  current_pairing_id uuid,
  connection_state text not null default 'connected',
  reconnect_deadline timestamptz,
  pairing_key uuid not null default gen_random_uuid(),
  last_seen_at timestamptz not null default timezone('utc', now()),
  joined_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (session_id,user_id),
  constraint live_quick_participant_state_valid check (state in (
    'waiting','paired','disconnected','left','unavailable'
  )),
  constraint live_quick_connection_state_valid check (connection_state in (
    'connected','disconnected','left_session'
  ))
);

create table public.live_quick_connect_rounds (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  round_number integer not null,
  state text not null default 'open',
  starts_at timestamptz not null default timezone('utc', now()),
  ends_at timestamptz not null,
  completed_at timestamptz,
  version bigint not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint live_quick_round_state_valid check (state in ('open','active','completed','cancelled')),
  constraint live_quick_round_number_valid check (round_number > 0),
  constraint live_quick_round_time_valid check (ends_at > starts_at),
  constraint live_quick_round_session_number_unique unique(session_id,round_number)
);

create table public.live_quick_connect_pairings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  round_id uuid not null references public.live_quick_connect_rounds(id) on delete cascade,
  participant_a_user_id uuid not null references auth.users(id) on delete cascade,
  participant_a_profile_id uuid not null references public.profiles(id) on delete cascade,
  participant_b_user_id uuid not null references auth.users(id) on delete cascade,
  participant_b_profile_id uuid not null references public.profiles(id) on delete cascade,
  state text not null default 'active',
  provider text not null default 'stream',
  provider_call_type text not null default 'betweener_live',
  provider_call_id text not null,
  starts_at timestamptz not null default timezone('utc', now()),
  ends_at timestamptz not null,
  reconnect_deadline timestamptz,
  completed_at timestamptz,
  shared_outcome text,
  version bigint not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint live_quick_pairing_users_distinct check (participant_a_user_id <> participant_b_user_id),
  constraint live_quick_pairing_profiles_distinct check (participant_a_profile_id <> participant_b_profile_id),
  constraint live_quick_pairing_state_valid check (state in (
    'active','reconnect_grace','completed','round_incomplete','cancelled'
  )),
  constraint live_quick_pairing_outcome_valid check (shared_outcome is null or shared_outcome in (
    'mutual_continue','friendship','closed'
  )),
  constraint live_quick_pairing_time_valid check (ends_at > starts_at),
  constraint live_quick_provider_call_unique unique(provider,provider_call_id),
  constraint live_quick_pair_once_per_session unique(
    session_id,
    participant_a_user_id,
    participant_b_user_id
  )
);

alter table public.live_quick_connect_participants
  add constraint live_quick_current_pairing_fk foreign key(current_pairing_id)
  references public.live_quick_connect_pairings(id) on delete set null;

create unique index live_quick_unordered_pair_once_idx
on public.live_quick_connect_pairings(
  session_id,
  least(participant_a_user_id,participant_b_user_id),
  greatest(participant_a_user_id,participant_b_user_id)
);

create table public.live_quick_connect_decisions (
  pairing_id uuid not null references public.live_quick_connect_pairings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  decision text not null,
  decided_at timestamptz not null default timezone('utc',now()),
  primary key(pairing_id,user_id),
  constraint live_quick_decision_valid check (decision in ('continue','friendship','not_this_time'))
);

create table public.live_quick_connect_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  pairing_id uuid references public.live_quick_connect_pairings(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc',now()),
  constraint live_quick_event_valid check (event_type in (
    'queue_joined','paired','disconnected','reconnected','round_incomplete',
    'decision_submitted','pair_completed','queue_left'
  )),
  constraint live_quick_event_metadata_object check (jsonb_typeof(metadata)='object')
);

create table public.live_quick_connect_updates (
  session_id uuid primary key references public.live_sessions(id) on delete cascade,
  version bigint not null default 1,
  updated_at timestamptz not null default timezone('utc',now())
);

create index live_quick_waiting_idx
  on public.live_quick_connect_participants(session_id,state,connection_state,pairing_key)
  where state in ('waiting','disconnected');
create index live_quick_pairing_participants_idx
  on public.live_quick_connect_pairings(session_id,state,ends_at);
create index live_quick_events_session_idx
  on public.live_quick_connect_events(session_id,created_at desc);
create unique index live_quick_pair_lifecycle_event_once_idx
  on public.live_quick_connect_events(pairing_id,event_type)
  where pairing_id is not null
    and event_type in ('paired','round_incomplete','pair_completed');
create unique index live_quick_decision_event_once_idx
  on public.live_quick_connect_events(pairing_id,actor_user_id,event_type)
  where pairing_id is not null and actor_user_id is not null
    and event_type='decision_submitted';

create trigger live_quick_participant_updated_at before update on public.live_quick_connect_participants
for each row execute function public.set_updated_at();
create trigger live_quick_round_updated_at before update on public.live_quick_connect_rounds
for each row execute function public.set_updated_at();
create trigger live_quick_pairing_updated_at before update on public.live_quick_connect_pairings
for each row execute function public.set_updated_at();

create or replace function public.bump_live_quick_connect_update()
returns trigger language plpgsql security definer
set search_path=public,pg_catalog set row_security=off as $$
declare v_session_id uuid;
begin
  v_session_id := case when tg_op='DELETE' then old.session_id else new.session_id end;
  insert into public.live_quick_connect_updates(session_id,version)
  values(v_session_id,1)
  on conflict(session_id) do update set
    version=public.live_quick_connect_updates.version+1,
    updated_at=timezone('utc',now());
  return case when tg_op='DELETE' then old else new end;
end; $$;

create trigger live_quick_participants_bump after insert or update or delete
on public.live_quick_connect_participants for each row execute function public.bump_live_quick_connect_update();
create trigger live_quick_pairings_bump after insert or update or delete
on public.live_quick_connect_pairings for each row execute function public.bump_live_quick_connect_update();

create or replace function public.live_quick_connect_pair_is_eligible(
  p_session_id uuid,p_user_a uuid,p_user_b uuid
) returns boolean language sql stable security definer
set search_path=public,pg_catalog set row_security=off as $$
  select p_user_a is not null
    and p_user_b is not null
    and p_user_a <> p_user_b
    and exists (
      select 1
      from public.live_sessions session
      join public.live_participants a on a.session_id=session.id
      join public.live_participants b on b.session_id=session.id
      join public.live_quick_connect_participants qa
        on qa.session_id=session.id and qa.user_id=a.user_id
      join public.live_quick_connect_participants qb
        on qb.session_id=session.id and qb.user_id=b.user_id
      join public.profiles pa on pa.id=a.profile_id and pa.user_id=a.user_id
      join public.profiles pb on pb.id=b.profile_id and pb.user_id=b.user_id
      where session.id=p_session_id
        and session.format='quick_connect'
        and session.status in ('live','backstage')
        and a.user_id=p_user_a
        and b.user_id=p_user_b
        and a.state in ('audience','stage_requested','backstage','on_stage')
        and b.state in ('audience','stage_requested','backstage','on_stage')
        and qa.state='waiting'
        and qb.state='waiting'
        and qa.connection_state='connected'
        and qb.connection_state='connected'
        and pa.deleted_at is null
        and pb.deleted_at is null
        and pa.profile_completed
        and pb.profile_completed
        and coalesce(pa.is_active,true)
        and coalesce(pb.is_active,true)
        and (
          upper(btrim(coalesce(pa.gender::text,''))) not in ('MALE','FEMALE')
          or upper(btrim(coalesce(pb.gender::text,''))) not in ('MALE','FEMALE')
          or upper(btrim(pa.gender::text)) <> upper(btrim(pb.gender::text))
        )
        and (
          pa.age_preference_confirmed_at is null
          or pa.min_age_interest is null or pb.age is null
          or pb.age >= pa.min_age_interest
        )
        and (
          pa.age_preference_confirmed_at is null
          or pa.max_age_interest is null or pb.age is null
          or pb.age <= pa.max_age_interest
        )
        and (
          pb.age_preference_confirmed_at is null
          or pb.min_age_interest is null or pa.age is null
          or pa.age >= pb.min_age_interest
        )
        and (
          pb.age_preference_confirmed_at is null
          or pb.max_age_interest is null or pa.age is null
          or pa.age <= pb.max_age_interest
        )
        and not exists (
          select 1 from public.blocks blocked
          where (blocked.blocker_id=p_user_a and blocked.blocked_id=p_user_b)
             or (blocked.blocker_id=p_user_b and blocked.blocked_id=p_user_a)
        )
    )
    and not exists (
      select 1 from public.live_private_sparks s
      where s.state in ('awaiting_consent','active')
        and (p_user_a in (s.participant_a_user_id,s.participant_b_user_id)
          or p_user_b in (s.participant_a_user_id,s.participant_b_user_id))
    )
    and not exists (
      select 1 from public.live_quick_connect_pairings q
      where q.session_id=p_session_id
        and least(q.participant_a_user_id,q.participant_b_user_id)=least(p_user_a,p_user_b)
        and greatest(q.participant_a_user_id,q.participant_b_user_id)=greatest(p_user_a,p_user_b)
    );
$$;

revoke all on function public.live_quick_connect_pair_is_eligible(uuid,uuid,uuid)
from public,anon,authenticated;

create or replace function public.live_quick_connect_sync(p_session_id uuid)
returns void language plpgsql security definer
set search_path=public,pg_catalog set row_security=off as $$
declare
  v_now timestamptz := timezone('utc',now());
  v_session public.live_sessions;
  v_a public.live_quick_connect_participants;
  v_b public.live_quick_connect_participants;
  v_round_id uuid;
  v_round_number integer;
  v_pairing_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('quick:'||p_session_id::text,0));
  select * into v_session from public.live_sessions where id=p_session_id for update;
  if v_session.id is null or v_session.format <> 'quick_connect' then
    raise exception 'live_quick_connect_session_invalid' using errcode='23514';
  end if;

  insert into public.live_quick_connect_events(session_id,pairing_id,event_type,metadata)
  select q.session_id,q.id,'round_incomplete',jsonb_build_object('reason','reconnect_grace_expired')
  from public.live_quick_connect_pairings q
  where q.session_id=p_session_id and q.state='reconnect_grace'
    and q.reconnect_deadline <= v_now
  on conflict do nothing;
  update public.live_quick_connect_rounds r set
    state='cancelled',completed_at=v_now,version=r.version+1
  where r.session_id=p_session_id and r.state in ('open','active')
    and exists (
      select 1 from public.live_quick_connect_pairings q
      where q.round_id=r.id and q.state='reconnect_grace'
        and q.reconnect_deadline <= v_now
    );
  update public.live_quick_connect_pairings q set
    state='round_incomplete',completed_at=v_now,version=q.version+1
  where q.session_id=p_session_id and q.state='reconnect_grace'
    and q.reconnect_deadline <= v_now;

  insert into public.live_quick_connect_events(session_id,pairing_id,event_type,metadata)
  select q.session_id,q.id,'pair_completed',jsonb_build_object('reason','round_timer_elapsed')
  from public.live_quick_connect_pairings q
  where q.session_id=p_session_id and q.state='active' and q.ends_at <= v_now
  on conflict do nothing;
  update public.live_quick_connect_rounds r set
    state='completed',completed_at=v_now,version=r.version+1
  where r.session_id=p_session_id and r.state in ('open','active')
    and exists (
      select 1 from public.live_quick_connect_pairings q
      where q.round_id=r.id and q.state='active' and q.ends_at <= v_now
    );
  update public.live_quick_connect_pairings q set
    state='completed',completed_at=v_now,shared_outcome=coalesce(q.shared_outcome,'closed'),version=q.version+1
  where q.session_id=p_session_id and q.state='active' and q.ends_at <= v_now;

  update public.live_quick_connect_participants p set
    state=case when p.connection_state='connected' then 'waiting' else 'unavailable' end,
    current_pairing_id=null,pairing_key=gen_random_uuid()
  where p.session_id=p_session_id and p.state in ('paired','disconnected')
    and not exists (
      select 1 from public.live_quick_connect_pairings q
      where q.id=p.current_pairing_id and q.state in ('active','reconnect_grace')
    );

  loop
    select * into v_a from public.live_quick_connect_participants p
    where p.session_id=p_session_id and p.state='waiting'
      and p.connection_state='connected'
      and exists (
        select 1 from public.live_quick_connect_participants candidate
        where candidate.session_id=p_session_id
          and candidate.state='waiting'
          and candidate.connection_state='connected'
          and candidate.user_id<>p.user_id
          and public.live_quick_connect_pair_is_eligible(
            p_session_id,p.user_id,candidate.user_id
          )
      )
    order by p.pairing_key,p.user_id limit 1 for update skip locked;
    exit when v_a.user_id is null;

    select * into v_b from public.live_quick_connect_participants p
    where p.session_id=p_session_id and p.state='waiting'
      and p.connection_state='connected' and p.user_id<>v_a.user_id
      and public.live_quick_connect_pair_is_eligible(p_session_id,v_a.user_id,p.user_id)
    order by p.pairing_key,p.user_id limit 1 for update skip locked;
    exit when v_b.user_id is null;

    select coalesce(max(round_number),0)+1 into v_round_number
    from public.live_quick_connect_rounds where session_id=p_session_id;
    insert into public.live_quick_connect_rounds(session_id,round_number,state,ends_at)
    values(p_session_id,v_round_number,'active',v_now+interval '3 minutes') returning id into v_round_id;
    insert into public.live_quick_connect_pairings(
      session_id,round_id,participant_a_user_id,participant_a_profile_id,
      participant_b_user_id,participant_b_profile_id,provider_call_id,ends_at
    ) values (
      p_session_id,v_round_id,v_a.user_id,v_a.profile_id,v_b.user_id,v_b.profile_id,
      'quick_'||replace(gen_random_uuid()::text,'-',''),v_now+interval '3 minutes'
    ) returning id into v_pairing_id;
    update public.live_quick_connect_participants set state='paired',current_pairing_id=v_pairing_id
    where session_id=p_session_id and user_id in(v_a.user_id,v_b.user_id);
    insert into public.live_quick_connect_events(session_id,pairing_id,event_type)
    values(p_session_id,v_pairing_id,'paired');
    v_a := null; v_b := null;
  end loop;
end; $$;

revoke all on function public.live_quick_connect_sync(uuid)
from public,anon,authenticated;

create or replace function public.rpc_join_live_quick_connect(p_session_id uuid)
returns jsonb language plpgsql security definer
set search_path=public,pg_catalog set row_security=off as $$
declare v_user_id uuid:=auth.uid(); v_profile_id uuid; v_session public.live_sessions;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select * into v_session from public.live_sessions where id=p_session_id;
  if v_session.format<>'quick_connect' or v_session.status not in ('live','backstage') then
    raise exception 'live_quick_connect_unavailable' using errcode='23514'; end if;
  select id into v_profile_id from public.profiles where user_id=v_user_id and account_state='active'
    and profile_completed=true and deleted_at is null;
  if v_profile_id is null then raise exception 'live_quick_connect_profile_ineligible' using errcode='42501'; end if;
  if not exists(select 1 from public.live_participants where session_id=p_session_id and user_id=v_user_id) then
    raise exception 'live_quick_connect_participant_required' using errcode='42501'; end if;
  -- Entering Quick Connect is its own explicit, session-scoped consent. Do not
  -- silently change the member's hosted-introduction preference.
  update public.live_participants set last_seen_at=timezone('utc',now())
  where session_id=p_session_id and user_id=v_user_id;
  insert into public.live_quick_connect_participants(session_id,user_id,profile_id)
  values(p_session_id,v_user_id,v_profile_id)
  on conflict(session_id,user_id) do update set
    state=case when public.live_quick_connect_participants.state='paired' then 'paired' else 'waiting' end,
    connection_state='connected',reconnect_deadline=null,last_seen_at=timezone('utc',now()),
    pairing_key=case
      when public.live_quick_connect_participants.state='paired'
        then public.live_quick_connect_participants.pairing_key
      else gen_random_uuid()
    end;
  insert into public.live_quick_connect_events(session_id,actor_user_id,event_type)
  values(p_session_id,v_user_id,'queue_joined');
  perform public.live_quick_connect_sync(p_session_id);
  return public.rpc_get_live_quick_connect(p_session_id);
end; $$;

create or replace function public.rpc_get_live_quick_connect(p_session_id uuid)
returns jsonb language plpgsql security definer
set search_path=public,pg_catalog set row_security=off as $$
declare
  v_user_id uuid:=auth.uid(); v_participant public.live_quick_connect_participants;
  v_pairing public.live_quick_connect_pairings; v_other public.profiles; v_my_decision text;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode='42501'; end if;
  perform public.live_quick_connect_sync(p_session_id);
  select * into v_participant from public.live_quick_connect_participants p
  where p.session_id=p_session_id and p.user_id=v_user_id;
  if v_participant.user_id is null then
    return jsonb_build_object('session_id',p_session_id,'state','not_joined','server_now',timezone('utc',now()));
  end if;
  if v_participant.current_pairing_id is not null then
    select * into v_pairing from public.live_quick_connect_pairings where id=v_participant.current_pairing_id;
    select p.* into v_other from public.profiles p where p.id=case
      when v_user_id=v_pairing.participant_a_user_id then v_pairing.participant_b_profile_id
      else v_pairing.participant_a_profile_id end;
    select d.decision into v_my_decision from public.live_quick_connect_decisions d
    where d.pairing_id=v_pairing.id and d.user_id=v_user_id;
  end if;
  return jsonb_build_object(
    'session_id',p_session_id,'state',v_participant.state,
    'connection_state',v_participant.connection_state,'server_now',timezone('utc',now()),
    'pairing',case when v_pairing.id is null then null else jsonb_build_object(
      'id',v_pairing.id,'state',v_pairing.state,'starts_at',v_pairing.starts_at,
      'ends_at',v_pairing.ends_at,'reconnect_deadline',v_pairing.reconnect_deadline,
      'my_decision',v_my_decision,'shared_outcome',v_pairing.shared_outcome,
      'other_person',jsonb_build_object('user_id',v_other.user_id,'profile_id',v_other.id,
        'full_name',v_other.full_name,'avatar_url',v_other.avatar_url,'age',v_other.age,
        'city',coalesce(v_other.city,v_other.location),'looking_for',v_other.looking_for),
      'provider_call_type',v_pairing.provider_call_type,'provider_call_id',v_pairing.provider_call_id
    ) end
  );
end; $$;

create or replace function public.rpc_heartbeat_live_quick_connect(
  p_session_id uuid,p_connected boolean default true
) returns jsonb language plpgsql security definer
set search_path=public,pg_catalog set row_security=off as $$
declare v_user_id uuid:=auth.uid(); v_pairing_id uuid;
  v_participant public.live_quick_connect_participants;
  v_pairing public.live_quick_connect_pairings;
  v_all_connected boolean := false;
  v_now timestamptz := timezone('utc',now());
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;
  select * into v_participant
  from public.live_quick_connect_participants p
  where p.session_id=p_session_id and p.user_id=v_user_id
  for update;
  if v_participant.user_id is null then
    raise exception 'live_quick_connect_participant_required' using errcode='42501';
  end if;
  v_pairing_id := v_participant.current_pairing_id;
  update public.live_quick_connect_participants set
    state=case when p_connected and state in ('disconnected','unavailable') then
      case when current_pairing_id is null then 'waiting' else 'paired' end
      when not p_connected and state='paired' then 'disconnected' else state end,
    connection_state=case when p_connected then 'connected' else 'disconnected' end,
    reconnect_deadline=case when p_connected then null else v_now+interval '30 seconds' end,
    last_seen_at=v_now
  where session_id=p_session_id and user_id=v_user_id;
  if (p_connected and v_participant.connection_state is distinct from 'connected')
      or (not p_connected and v_participant.connection_state is distinct from 'disconnected') then
    insert into public.live_quick_connect_events(
      session_id,pairing_id,actor_user_id,event_type
    ) values(
      p_session_id,v_pairing_id,v_user_id,
      case when p_connected then 'reconnected' else 'disconnected' end
    );
  end if;
  if v_pairing_id is not null then
    select * into v_pairing
    from public.live_quick_connect_pairings q where q.id=v_pairing_id for update;
    select count(*)=2 and bool_and(p.connection_state='connected')
    into v_all_connected
    from public.live_quick_connect_participants p
    where p.current_pairing_id=v_pairing_id and p.state in ('paired','disconnected');
    if v_pairing.state in ('active','reconnect_grace') then
      update public.live_quick_connect_pairings q set
        state=case when v_all_connected then 'active' else 'reconnect_grace' end,
        reconnect_deadline=case
          when v_all_connected then null
          else coalesce(q.reconnect_deadline,v_now+interval '30 seconds')
        end,
        version=q.version+1
      where q.id=v_pairing_id
        and (
          q.state is distinct from case when v_all_connected then 'active' else 'reconnect_grace' end
          or q.reconnect_deadline is distinct from case
            when v_all_connected then null
            else coalesce(q.reconnect_deadline,v_now+interval '30 seconds')
          end
        );
    end if;
  end if;
  perform public.live_quick_connect_sync(p_session_id);
  return public.rpc_get_live_quick_connect(p_session_id);
end; $$;

create or replace function public.rpc_submit_live_quick_connect_decision(
  p_pairing_id uuid,p_decision text
) returns jsonb language plpgsql security definer
set search_path=public,pg_catalog set row_security=off as $$
declare v_user_id uuid:=auth.uid(); v_pairing public.live_quick_connect_pairings;
  v_count int; v_continue int; v_friendship int; v_existing_decision text;
begin
  if p_decision not in ('continue','friendship','not_this_time') then
    raise exception 'live_quick_decision_invalid' using errcode='23514'; end if;
  perform pg_advisory_xact_lock(hashtextextended('quick-pair:'||p_pairing_id::text,0));
  select * into v_pairing from public.live_quick_connect_pairings where id=p_pairing_id for update;
  if v_user_id is null or v_user_id not in(v_pairing.participant_a_user_id,v_pairing.participant_b_user_id) then
    raise exception 'live_quick_decision_forbidden' using errcode='42501'; end if;
  select d.decision into v_existing_decision
  from public.live_quick_connect_decisions d
  where d.pairing_id=p_pairing_id and d.user_id=v_user_id;
  if v_existing_decision is not null and v_existing_decision<>p_decision then
    raise exception 'live_quick_decision_already_submitted' using errcode='23514';
  end if;
  if v_pairing.state not in ('active','reconnect_grace') then
    if v_existing_decision=p_decision then
      return public.rpc_get_live_quick_connect(v_pairing.session_id);
    end if;
    raise exception 'live_quick_decision_closed' using errcode='23514';
  end if;
  insert into public.live_quick_connect_decisions(pairing_id,user_id,decision)
  values(p_pairing_id,v_user_id,p_decision)
  on conflict(pairing_id,user_id) do nothing;
  select count(*),count(*) filter(where decision='continue'),count(*) filter(where decision='friendship')
  into v_count,v_continue,v_friendship from public.live_quick_connect_decisions where pairing_id=p_pairing_id;
  if v_count=2 then
    update public.live_quick_connect_rounds set
      state='completed',completed_at=timezone('utc',now()),version=version+1
    where id=v_pairing.round_id and state in ('open','active');
    update public.live_quick_connect_pairings set state='completed',completed_at=timezone('utc',now()),
      shared_outcome=case when v_continue=2 then 'mutual_continue'
        when v_friendship=2 then 'friendship' else 'closed' end,version=version+1
    where id=p_pairing_id and state in('active','reconnect_grace');
    insert into public.live_quick_connect_events(
      session_id,pairing_id,event_type,metadata
    ) values(
      v_pairing.session_id,p_pairing_id,'pair_completed',
      jsonb_build_object('reason','both_decisions_submitted')
    ) on conflict do nothing;
  end if;
  insert into public.live_quick_connect_events(session_id,pairing_id,actor_user_id,event_type)
  values(v_pairing.session_id,p_pairing_id,v_user_id,'decision_submitted')
  on conflict do nothing;
  return public.rpc_get_live_quick_connect(v_pairing.session_id);
end; $$;

create or replace function public.rpc_leave_live_quick_connect(p_session_id uuid)
returns void language plpgsql security definer
set search_path=public,pg_catalog set row_security=off as $$
declare v_user_id uuid:=auth.uid(); v_pairing_id uuid;
begin
  select p.current_pairing_id into v_pairing_id
  from public.live_quick_connect_participants p
  where p.session_id=p_session_id and p.user_id=v_user_id
  for update;
  update public.live_quick_connect_participants set
    state='left',connection_state='left_session',current_pairing_id=null,
    reconnect_deadline=null,last_seen_at=timezone('utc',now())
  where session_id=p_session_id and user_id=v_user_id;
  if v_pairing_id is not null then
    update public.live_quick_connect_rounds set
      state='cancelled',completed_at=timezone('utc',now()),version=version+1
    where id=(select round_id from public.live_quick_connect_pairings where id=v_pairing_id)
      and state in ('open','active');
    update public.live_quick_connect_pairings set state='round_incomplete',completed_at=timezone('utc',now()),
      shared_outcome=null,version=version+1 where id=v_pairing_id and state in('active','reconnect_grace');
    insert into public.live_quick_connect_events(
      session_id,pairing_id,actor_user_id,event_type,metadata
    ) values(
      p_session_id,v_pairing_id,v_user_id,'round_incomplete',
      jsonb_build_object('reason','participant_left_queue')
    ) on conflict do nothing;
  end if;
  insert into public.live_quick_connect_events(session_id,actor_user_id,event_type)
  values(p_session_id,v_user_id,'queue_left');
end; $$;

create or replace function public.rpc_get_live_chemistry_for_quick_connect(p_pairing_id uuid)
returns jsonb language plpgsql security definer
set search_path=public,pg_catalog set row_security=off as $$
declare
  v_pairing public.live_quick_connect_pairings;
  v_session public.live_sessions;
  v_conversation_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select * into v_pairing from public.live_quick_connect_pairings q
  where q.id=p_pairing_id and v_user_id in(q.participant_a_user_id,q.participant_b_user_id);
  if v_pairing.id is null then raise exception 'live_quick_connect_pairing_forbidden' using errcode='42501'; end if;
  select * into v_session from public.live_sessions s where s.id=v_pairing.session_id;
  if not coalesce(v_session.chemistry_first_enabled,false) then return null; end if;

  insert into public.live_chemistry_conversations(
    session_id,source_kind,source_id,
    participant_a_user_id,participant_a_profile_id,
    participant_b_user_id,participant_b_profile_id
  ) values(
    v_pairing.session_id,'quick_connect',v_pairing.id,
    v_pairing.participant_a_user_id,v_pairing.participant_a_profile_id,
    v_pairing.participant_b_user_id,v_pairing.participant_b_profile_id
  ) on conflict(source_kind,source_id) do update
    set updated_at=public.live_chemistry_conversations.updated_at
  returning id into v_conversation_id;

  if not exists(select 1 from public.live_chemistry_events e
    where e.conversation_id=v_conversation_id and e.event_type='created') then
    insert into public.live_chemistry_events(conversation_id,session_id,event_type)
    values(v_conversation_id,v_pairing.session_id,'created');
  end if;
  return public.live_chemistry_private_projection(v_conversation_id);
end; $$;

create or replace function public.rpc_get_live_quick_connect_rtc_admission(p_pairing_id uuid)
returns table(
  pairing_id uuid, source_session_id uuid, user_id uuid, profile_id uuid,
  primary_role text, roles text[], participant_state text, session_status text,
  provider text, provider_call_type text, provider_call_id text,
  capabilities text[], maximum_participants integer, participant_user_ids uuid[]
) language plpgsql security definer
set search_path=public,pg_catalog set row_security=off as $$
declare
  v_pairing public.live_quick_connect_pairings;
  v_participant public.live_quick_connect_participants;
  v_profile public.profiles;
  v_now timestamptz := timezone('utc',now());
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode='42501'; end if;
  select * into v_pairing from public.live_quick_connect_pairings q where q.id=p_pairing_id;
  if v_pairing.id is null
    or auth.uid() not in(v_pairing.participant_a_user_id,v_pairing.participant_b_user_id)
    or v_pairing.state not in('active','reconnect_grace')
    or (v_pairing.state='active' and v_pairing.ends_at<=v_now)
    or (v_pairing.state='reconnect_grace' and v_pairing.reconnect_deadline<=v_now)
  then raise exception 'live_quick_connect_admission_forbidden' using errcode='42501'; end if;

  select * into v_participant from public.live_quick_connect_participants p
  where p.session_id=v_pairing.session_id and p.user_id=auth.uid()
    and p.current_pairing_id=v_pairing.id and p.state in('paired','disconnected');
  if v_participant.user_id is null then
    raise exception 'live_quick_connect_admission_forbidden' using errcode='42501'; end if;
  select * into v_profile from public.profiles p
  where p.id=v_participant.profile_id and p.user_id=auth.uid()
    and p.account_state='active' and p.deleted_at is null and p.profile_completed=true;
  if v_profile.id is null then raise exception 'live_quick_connect_account_ineligible' using errcode='42501'; end if;

  return query select v_pairing.id,v_pairing.session_id,auth.uid(),v_profile.id,
    'participant'::text,array['participant']::text[],'private_spark'::text,'live'::text,
    v_pairing.provider,v_pairing.provider_call_type,v_pairing.provider_call_id,
    array['live.join','live.publish','live.report','live.block']::text[],2,
    array[v_pairing.participant_a_user_id,v_pairing.participant_b_user_id]::uuid[];
end; $$;

alter table public.live_quick_connect_participants enable row level security;
alter table public.live_quick_connect_rounds enable row level security;
alter table public.live_quick_connect_pairings enable row level security;
alter table public.live_quick_connect_decisions enable row level security;
alter table public.live_quick_connect_events enable row level security;
alter table public.live_quick_connect_updates enable row level security;

create policy "Quick Connect participants can read own queue row"
on public.live_quick_connect_participants for select to authenticated using(auth.uid()=user_id);
create policy "Quick Connect participants can read own pairing"
on public.live_quick_connect_pairings for select to authenticated
using(auth.uid() in(participant_a_user_id,participant_b_user_id));
create policy "Live members can observe Quick Connect invalidations"
on public.live_quick_connect_updates for select to authenticated using(
  exists(select 1 from public.live_participants p where p.session_id=live_quick_connect_updates.session_id
    and p.user_id=auth.uid() and p.state not in('removed','banned'))
);

revoke all on public.live_quick_connect_participants,public.live_quick_connect_rounds,
  public.live_quick_connect_pairings,public.live_quick_connect_decisions,
  public.live_quick_connect_events,public.live_quick_connect_updates from anon,authenticated;
grant select on public.live_quick_connect_participants,public.live_quick_connect_pairings,
  public.live_quick_connect_updates to authenticated;
grant all on public.live_quick_connect_participants,public.live_quick_connect_rounds,
  public.live_quick_connect_pairings,public.live_quick_connect_decisions,
  public.live_quick_connect_events,public.live_quick_connect_updates to service_role;

grant execute on function public.rpc_join_live_quick_connect(uuid) to authenticated;
grant execute on function public.rpc_get_live_quick_connect(uuid) to authenticated;
grant execute on function public.rpc_heartbeat_live_quick_connect(uuid,boolean) to authenticated;
grant execute on function public.rpc_submit_live_quick_connect_decision(uuid,text) to authenticated;
grant execute on function public.rpc_leave_live_quick_connect(uuid) to authenticated;
grant execute on function public.rpc_get_live_chemistry_for_quick_connect(uuid) to authenticated;
revoke all on function public.rpc_get_live_quick_connect_rtc_admission(uuid) from public,anon;
grant execute on function public.rpc_get_live_quick_connect_rtc_admission(uuid) to authenticated;
revoke all on function public.bump_live_quick_connect_update()
from public,anon,authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'live_quick_connect_updates'
    ) then
    alter publication supabase_realtime add table public.live_quick_connect_updates;
  end if;
end;
$$;

commit;
