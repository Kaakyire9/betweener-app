-- Betweener Live Phase 3: server-authoritative hosted introductions.
-- Raw consent stays private. Only derived round outcomes reach clients.

begin;

create table public.live_match_rounds (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  client_proposal_id uuid not null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  participant_a_user_id uuid not null references auth.users(id) on delete cascade,
  participant_a_profile_id uuid not null references public.profiles(id) on delete cascade,
  participant_b_user_id uuid not null references auth.users(id) on delete cascade,
  participant_b_profile_id uuid not null references public.profiles(id) on delete cascade,
  state text not null default 'awaiting_consent',
  connection_signals jsonb not null default '[]'::jsonb,
  conversation_spark jsonb not null default '{}'::jsonb,
  invited_at timestamptz not null default timezone('utc', now()),
  consent_resolved_at timestamptz,
  introduction_started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null default (timezone('utc', now()) + interval '10 minutes'),
  version bigint not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint live_match_round_participants_distinct check (participant_a_user_id <> participant_b_user_id),
  constraint live_match_round_profiles_distinct check (participant_a_profile_id <> participant_b_profile_id),
  constraint live_match_round_state_valid check (state in (
    'proposed','awaiting_consent','both_accepted','public_introduction',
    'declined','expired','completed','cancelled'
  )),
  constraint live_match_round_signals_array check (jsonb_typeof(connection_signals) = 'array'),
  constraint live_match_round_spark_object check (jsonb_typeof(conversation_spark) = 'object'),
  constraint live_match_round_expiry_valid check (expires_at > invited_at),
  constraint live_match_round_id_session_unique unique (id, session_id),
  constraint live_match_round_client_id_unique unique (session_id, created_by_user_id, client_proposal_id)
);

create table public.live_match_round_responses (
  id uuid primary key default gen_random_uuid(),
  match_round_id uuid not null,
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  decision text not null,
  responded_at timestamptz not null default timezone('utc', now()),
  constraint live_match_response_decision_valid check (decision in ('accepted','declined')),
  constraint live_match_response_round_session_fk foreign key (match_round_id,session_id)
    references public.live_match_rounds(id,session_id) on delete cascade,
  constraint live_match_response_one_per_user unique (match_round_id, user_id)
);

-- A deliberately content-free realtime invalidation row. Clients subscribe to
-- this pulse, then retrieve their capability-filtered snapshot through RPC.
create table public.live_match_round_updates (
  session_id uuid primary key references public.live_sessions(id) on delete cascade,
  version bigint not null default 1,
  updated_at timestamptz not null default timezone('utc',now())
);

create unique index live_match_round_one_active_per_session
  on public.live_match_rounds(session_id)
  where state in ('proposed','awaiting_consent','both_accepted','public_introduction');

create unique index live_match_round_pair_once_per_session
  on public.live_match_rounds(
    session_id,
    least(participant_a_user_id, participant_b_user_id),
    greatest(participant_a_user_id, participant_b_user_id)
  );

create index live_match_round_participant_a_idx
  on public.live_match_rounds(participant_a_user_id, state, updated_at desc);
create index live_match_round_participant_b_idx
  on public.live_match_rounds(participant_b_user_id, state, updated_at desc);
create index live_match_round_responses_round_idx
  on public.live_match_round_responses(match_round_id, responded_at);

create trigger live_match_rounds_set_updated_at
before update on public.live_match_rounds
for each row execute function public.set_updated_at();

create or replace function public.enforce_live_match_round_transition()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if new.state = old.state then return new; end if;
  if not (
    (old.state='proposed' and new.state in ('awaiting_consent','cancelled'))
    or (old.state='awaiting_consent' and new.state in ('both_accepted','declined','expired','cancelled'))
    or (old.state='both_accepted' and new.state in ('public_introduction','cancelled'))
    or (old.state='public_introduction' and new.state in ('completed','cancelled'))
  ) then
    raise exception 'invalid_live_match_round_transition:%:%',old.state,new.state using errcode='23514';
  end if;
  new.version := old.version + 1;
  return new;
end;
$$;

create trigger live_match_round_transition_guard
before update of state on public.live_match_rounds
for each row execute function public.enforce_live_match_round_transition();

create or replace function public.bump_live_match_round_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_session_id uuid;
begin
  if tg_op='DELETE' then
    v_session_id := old.session_id;
  else
    v_session_id := new.session_id;
  end if;
  insert into public.live_match_round_updates(session_id,version,updated_at)
  values(v_session_id,1,timezone('utc',now()))
  on conflict(session_id) do update set
    version=public.live_match_round_updates.version+1,
    updated_at=excluded.updated_at;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

create trigger live_match_rounds_bump_update
after insert or update or delete on public.live_match_rounds
for each row execute function public.bump_live_match_round_update();

create trigger live_match_responses_bump_update
after insert or update or delete on public.live_match_round_responses
for each row execute function public.bump_live_match_round_update();

create or replace function public.enforce_live_match_response_participant()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if not exists (
    select 1 from public.live_match_rounds r
    where r.id=new.match_round_id
      and r.session_id=new.session_id
      and new.user_id in (r.participant_a_user_id,r.participant_b_user_id)
  ) then
    raise exception 'live_match_response_participant_invalid' using errcode='23514';
  end if;
  return new;
end;
$$;

create trigger live_match_response_participant_guard
before insert or update on public.live_match_round_responses
for each row execute function public.enforce_live_match_response_participant();

create or replace function public.live_match_pair_is_eligible(
  p_session_id uuid,
  p_user_a uuid,
  p_user_b uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select p_user_a is not null
    and p_user_b is not null
    and p_user_a <> p_user_b
    and exists (
      select 1
      from public.live_participants a
      join public.live_participants b on b.session_id=a.session_id
      join public.profiles pa on pa.id=a.profile_id
      join public.profiles pb on pb.id=b.profile_id
      where a.session_id=p_session_id
        and a.user_id=p_user_a
        and b.user_id=p_user_b
        and a.open_to_introductions
        and b.open_to_introductions
        and a.role <> 'host'
        and b.role <> 'host'
        and a.state in ('audience','stage_requested','backstage','on_stage')
        and b.state in ('audience','stage_requested','backstage','on_stage')
        and pa.deleted_at is null and pb.deleted_at is null
        and pa.profile_completed and pb.profile_completed
        and coalesce(pa.is_active,true) and coalesce(pb.is_active,true)
        and (pa.min_age_interest is null or pb.age is null or pb.age >= pa.min_age_interest)
        and (pa.max_age_interest is null or pb.age is null or pb.age <= pa.max_age_interest)
        and (pb.min_age_interest is null or pa.age is null or pa.age >= pb.min_age_interest)
        and (pb.max_age_interest is null or pa.age is null or pa.age <= pb.max_age_interest)
        and not exists (
          select 1 from public.blocks blocked
          where (blocked.blocker_id=p_user_a and blocked.blocked_id=p_user_b)
             or (blocked.blocker_id=p_user_b and blocked.blocked_id=p_user_a)
        )
    );
$$;

create or replace function public.live_build_connection_signals(
  p_profile_a uuid,
  p_profile_b uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_a public.profiles;
  v_b public.profiles;
  v_shared text[];
  v_signals jsonb := '[]'::jsonb;
begin
  select * into v_a from public.profiles where id=p_profile_a;
  select * into v_b from public.profiles where id=p_profile_b;

  if nullif(lower(btrim(coalesce(v_a.looking_for,''))),'') is not null
     and lower(btrim(v_a.looking_for))=lower(btrim(coalesce(v_b.looking_for,''))) then
    v_signals := v_signals || jsonb_build_array(jsonb_build_object(
      'code','shared_intent','text','Shared relationship intent'
    ));
  end if;

  select coalesce(array_agg(name order by name),array[]::text[]) into v_shared
  from (
    select distinct i.name
    from public.profile_interests ia
    join public.profile_interests ib on ib.interest_id=ia.interest_id
    join public.interests i on i.id=ia.interest_id
    where ia.profile_id=p_profile_a and ib.profile_id=p_profile_b
    order by i.name
    limit 3
  ) shared;
  if cardinality(v_shared)>0 then
    v_signals := v_signals || jsonb_build_array(jsonb_build_object(
      'code','shared_interests',
      'text',case when cardinality(v_shared)=1 then 'A shared interest in '||v_shared[1]
        else cardinality(v_shared)::text||' shared interests: '||array_to_string(v_shared,', ') end
    ));
  end if;

  if nullif(lower(btrim(coalesce(v_a.roots_region,''))),'') is not null
     and lower(btrim(v_a.roots_region))=lower(btrim(coalesce(v_b.roots_region,''))) then
    v_signals := v_signals || jsonb_build_array(jsonb_build_object(
      'code','shared_roots','text','Shared roots in '||btrim(v_a.roots_region)
    ));
  end if;

  if jsonb_array_length(v_signals)=0 then
    v_signals := jsonb_build_array(jsonb_build_object(
      'code','open_to_introduction','text','Both are open to an intentional introduction'
    ));
  end if;
  return v_signals;
end;
$$;

create or replace function public.live_build_conversation_spark(
  p_profile_a uuid,
  p_profile_b uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_a public.profiles;
  v_b public.profiles;
  v_interest text;
begin
  select * into v_a from public.profiles where id=p_profile_a;
  select * into v_b from public.profiles where id=p_profile_b;
  select i.name into v_interest
  from public.profile_interests ia
  join public.profile_interests ib on ib.interest_id=ia.interest_id
  join public.interests i on i.id=ia.interest_id
  where ia.profile_id=p_profile_a and ib.profile_id=p_profile_b
  order by i.name limit 1;

  if v_interest is not null then
    return jsonb_build_object(
      'context','You both made room for '||v_interest||' in your story.',
      'question','What does '||v_interest||' add to the kind of life you would love to share?'
    );
  end if;
  if nullif(lower(btrim(coalesce(v_a.looking_for,''))),'') is not null
     and lower(btrim(v_a.looking_for))=lower(btrim(coalesce(v_b.looking_for,''))) then
    return jsonb_build_object(
      'context','You are both looking for a similar kind of connection.',
      'question','What would make that connection feel grounded in everyday life?'
    );
  end if;
  if nullif(lower(btrim(coalesce(v_a.roots_region,''))),'') is not null
     and lower(btrim(v_a.roots_region))=lower(btrim(coalesce(v_b.roots_region,''))) then
    return jsonb_build_object(
      'context','Your stories share roots in '||btrim(v_a.roots_region)||'.',
      'question','What tradition from your roots would you want to carry into your future home?'
    );
  end if;
  return jsonb_build_object(
    'context','You both chose to be open to a thoughtful introduction.',
    'question','What is something you hope a good connection makes more possible in your life?'
  );
end;
$$;

create or replace function public.live_hosted_matching_snapshot(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_round public.live_match_rounds;
  v_can_manage boolean := public.has_live_capability(p_session_id,'live.create_match_round');
  v_is_participant boolean;
  v_my_response text;
begin
  if auth.uid() is null or not public.can_view_live_session(p_session_id,auth.uid()) then
    raise exception 'live_hosted_matching_forbidden' using errcode='42501';
  end if;
  select * into v_round
  from public.live_match_rounds r
  where r.session_id=p_session_id
    and r.state in ('proposed','awaiting_consent','both_accepted','public_introduction')
    and (r.state <> 'awaiting_consent' or r.expires_at > timezone('utc',now()))
    and (
      v_can_manage
      or r.participant_a_user_id=auth.uid()
      or r.participant_b_user_id=auth.uid()
      or r.state='public_introduction'
    )
  order by r.updated_at desc
  limit 1;

  v_is_participant := v_round.id is not null and auth.uid() in (v_round.participant_a_user_id,v_round.participant_b_user_id);
  if v_is_participant then
    select decision into v_my_response from public.live_match_round_responses
    where match_round_id=v_round.id and user_id=auth.uid();
  end if;

  return jsonb_build_object(
    'canManage',v_can_manage,
    'candidates',case when v_can_manage then coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id',p.user_id,'profile_id',p.profile_id,'full_name',pr.full_name,
        'avatar_url',public.live_profile_avatar(pr),'age',pr.age,'city',pr.city,
        'verified',coalesce(pr.verification_level,0)>0,'looking_for',pr.looking_for,
        'origin_context_type',p.origin_context_type,
        'paired_with_user_ids',coalesce((
          select jsonb_agg(
            case when history.participant_a_user_id=p.user_id
              then history.participant_b_user_id else history.participant_a_user_id end
            order by history.created_at
          )
          from public.live_match_rounds history
          where history.session_id=p_session_id
            and p.user_id in (history.participant_a_user_id,history.participant_b_user_id)
        ),'[]'::jsonb)
      ) order by p.joined_at nulls last,p.created_at)
      from public.live_participants p
      join public.profiles pr on pr.id=p.profile_id
      where p.session_id=p_session_id and p.open_to_introductions
        and p.role <> 'host'
        and p.state in ('audience','stage_requested','backstage','on_stage')
        and pr.deleted_at is null and pr.profile_completed and coalesce(pr.is_active,true)
        and not exists (
          select 1 from public.live_match_rounds active
          where active.session_id=p_session_id
            and active.state in ('proposed','awaiting_consent','both_accepted','public_introduction')
            and (active.state <> 'awaiting_consent' or active.expires_at > timezone('utc',now()))
            and p.user_id in (active.participant_a_user_id,active.participant_b_user_id)
        )
    ),'[]'::jsonb) else '[]'::jsonb end,
    'activeRound',case when v_round.id is null then null else jsonb_build_object(
      'id',v_round.id,'session_id',v_round.session_id,'state',v_round.state,
      'participant_a',(
        select jsonb_build_object('user_id',v_round.participant_a_user_id,'profile_id',pr.id,
          'full_name',pr.full_name,'avatar_url',public.live_profile_avatar(pr),'age',pr.age,'city',pr.city)
        from public.profiles pr where pr.id=v_round.participant_a_profile_id
      ),
      'participant_b',(
        select jsonb_build_object('user_id',v_round.participant_b_user_id,'profile_id',pr.id,
          'full_name',pr.full_name,'avatar_url',public.live_profile_avatar(pr),'age',pr.age,'city',pr.city)
        from public.profiles pr where pr.id=v_round.participant_b_profile_id
      ),
      'connection_signals',case when v_can_manage or v_round.state='public_introduction'
        then v_round.connection_signals else '[]'::jsonb end,
      'conversation_spark',case when v_can_manage or v_round.state in ('both_accepted','public_introduction')
        then v_round.conversation_spark else '{}'::jsonb end,
      'my_response',v_my_response,
      'is_participant',v_is_participant,
      'expires_at',v_round.expires_at
    ) end
  );
end;
$$;

create or replace function public.rpc_set_live_introduction_availability(
  p_session_id uuid,
  p_open boolean
)
returns public.live_participants
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_participant public.live_participants;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select * into v_participant from public.live_participants
  where session_id=p_session_id and user_id=auth.uid() for update;
  if v_participant.id is null
     or v_participant.role='host'
     or v_participant.state not in ('confirmed','audience','stage_requested','backstage','on_stage') then
    raise exception 'live_introduction_availability_forbidden' using errcode='42501';
  end if;
  if exists (
    select 1 from public.live_match_rounds r
    where r.session_id=p_session_id
      and auth.uid() in (r.participant_a_user_id,r.participant_b_user_id)
      and r.state in ('proposed','awaiting_consent','both_accepted','public_introduction')
      and (r.state <> 'awaiting_consent' or r.expires_at > timezone('utc',now()))
  ) then
    raise exception 'live_introduction_round_active' using errcode='22023';
  end if;
  update public.live_participants set open_to_introductions=p_open
  where id=v_participant.id returning * into v_participant;
  insert into public.live_session_events(session_id,actor_user_id,event_type,metadata)
  values(p_session_id,auth.uid(),'introduction_availability_updated',jsonb_build_object('open',p_open));
  return v_participant;
end;
$$;

create or replace function public.rpc_create_live_match_round(
  p_session_id uuid,
  p_participant_a_user_id uuid,
  p_participant_b_user_id uuid,
  p_client_proposal_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_existing public.live_match_rounds;
  v_a public.live_participants;
  v_b public.live_participants;
  v_session public.live_sessions;
  v_round_id uuid;
begin
  if auth.uid() is null or not public.has_live_capability(p_session_id,'live.create_match_round') then
    raise exception 'live_match_round_forbidden' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('live-match:'||p_session_id::text,0));
  update public.live_match_rounds
  set state='expired',consent_resolved_at=timezone('utc',now())
  where session_id=p_session_id and state='awaiting_consent'
    and expires_at <= timezone('utc',now());
  select * into v_existing from public.live_match_rounds
  where session_id=p_session_id and created_by_user_id=auth.uid() and client_proposal_id=p_client_proposal_id;
  if v_existing.id is not null then
    if least(v_existing.participant_a_user_id,v_existing.participant_b_user_id)
       <> least(p_participant_a_user_id,p_participant_b_user_id)
       or greatest(v_existing.participant_a_user_id,v_existing.participant_b_user_id)
       <> greatest(p_participant_a_user_id,p_participant_b_user_id) then
      raise exception 'live_match_proposal_id_conflict' using errcode='23505';
    end if;
    return public.live_hosted_matching_snapshot(p_session_id);
  end if;
  select * into v_session from public.live_sessions where id=p_session_id for update;
  if v_session.id is null then raise exception 'live_session_not_found' using errcode='P0002'; end if;
  if v_session.status <> 'live' or v_session.format <> 'hosted_match_night' then
    raise exception 'live_match_round_session_invalid' using errcode='22023';
  end if;
  if not public.live_match_pair_is_eligible(p_session_id,p_participant_a_user_id,p_participant_b_user_id) then
    raise exception 'live_match_pair_ineligible' using errcode='42501';
  end if;
  select * into v_a from public.live_participants where session_id=p_session_id and user_id=p_participant_a_user_id;
  select * into v_b from public.live_participants where session_id=p_session_id and user_id=p_participant_b_user_id;
  insert into public.live_match_rounds(
    session_id,client_proposal_id,created_by_user_id,
    participant_a_user_id,participant_a_profile_id,participant_b_user_id,participant_b_profile_id,
    state,connection_signals,conversation_spark
  ) values (
    p_session_id,p_client_proposal_id,auth.uid(),
    v_a.user_id,v_a.profile_id,v_b.user_id,v_b.profile_id,
    'awaiting_consent',public.live_build_connection_signals(v_a.profile_id,v_b.profile_id),
    public.live_build_conversation_spark(v_a.profile_id,v_b.profile_id)
  ) returning id into v_round_id;
  insert into public.live_session_events(session_id,actor_user_id,event_type,to_state,metadata)
  values(p_session_id,auth.uid(),'match_round_invited','awaiting_consent',jsonb_build_object('matchRoundId',v_round_id));
  return public.live_hosted_matching_snapshot(p_session_id);
end;
$$;

create or replace function public.rpc_respond_live_match_round(p_match_round_id uuid,p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_round public.live_match_rounds;
  v_existing text;
  v_accepted integer;
  v_next text;
  v_decision text := case when p_accept then 'accepted' else 'declined' end;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select * into v_round from public.live_match_rounds where id=p_match_round_id for update;
  if v_round.id is null then raise exception 'live_match_round_not_found' using errcode='P0002'; end if;
  if auth.uid() not in (v_round.participant_a_user_id,v_round.participant_b_user_id) then
    raise exception 'live_match_response_forbidden' using errcode='42501';
  end if;
  select decision into v_existing from public.live_match_round_responses
  where match_round_id=v_round.id and user_id=auth.uid();
  if v_existing is not null then
    if v_existing <> v_decision then
      raise exception 'live_match_response_already_recorded' using errcode='23505';
    end if;
    return public.live_hosted_matching_snapshot(v_round.session_id);
  end if;
  if v_round.state <> 'awaiting_consent' then
    raise exception 'live_match_round_not_awaiting_consent' using errcode='22023';
  end if;
  if v_round.expires_at <= timezone('utc',now()) then
    update public.live_match_rounds set state='expired',consent_resolved_at=timezone('utc',now()) where id=v_round.id;
    return public.live_hosted_matching_snapshot(v_round.session_id);
  end if;
  insert into public.live_match_round_responses(match_round_id,session_id,user_id,decision)
  values(v_round.id,v_round.session_id,auth.uid(),v_decision);
  if not p_accept then
    v_next := 'declined';
  else
    select count(*) into v_accepted from public.live_match_round_responses
    where match_round_id=v_round.id and decision='accepted';
    if v_accepted=2 then v_next := 'both_accepted'; end if;
  end if;
  if v_next is not null then
    update public.live_match_rounds set state=v_next,consent_resolved_at=timezone('utc',now()) where id=v_round.id;
    insert into public.live_session_events(session_id,actor_user_id,event_type,to_state,metadata)
    values(v_round.session_id,null,'match_round_consent_resolved',v_next,jsonb_build_object('matchRoundId',v_round.id));
  else
    -- Touch the round so realtime subscribers receive a canonical refresh,
    -- without exposing which participant responded.
    update public.live_match_rounds set updated_at=timezone('utc',now()) where id=v_round.id;
  end if;
  return public.live_hosted_matching_snapshot(v_round.session_id);
end;
$$;

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
begin
  select * into v_round from public.live_match_rounds where id=p_match_round_id for update;
  if v_round.id is null then raise exception 'live_match_round_not_found' using errcode='P0002'; end if;
  if not public.has_live_capability(v_round.session_id,'live.create_match_round') then
    raise exception 'live_match_round_transition_forbidden' using errcode='42501';
  end if;
  if p_target_state='public_introduction' then
    if v_round.state <> 'both_accepted' then raise exception 'live_match_consent_incomplete' using errcode='22023'; end if;
    select * into v_session from public.live_sessions where id=v_round.session_id for update;
    select count(*) into v_other_publishers
    from public.live_participants p
    where p.session_id=v_round.session_id
      and (p.role='host' or p.state='on_stage')
      and p.user_id not in (v_round.participant_a_user_id,v_round.participant_b_user_id);
    if v_other_publishers + 2 > v_session.maximum_publishers then
      raise exception 'live_match_stage_capacity_exceeded' using errcode='22023';
    end if;
    perform public.rpc_set_live_stage_participant(v_round.session_id,v_round.participant_a_user_id,true);
    perform public.rpc_set_live_stage_participant(v_round.session_id,v_round.participant_b_user_id,true);
    update public.live_match_rounds set state='public_introduction',introduction_started_at=timezone('utc',now()) where id=v_round.id;
  elsif p_target_state='completed' then
    if v_round.state <> 'public_introduction' then raise exception 'live_match_introduction_not_active' using errcode='22023'; end if;
    perform public.rpc_set_live_stage_participant(v_round.session_id,v_round.participant_a_user_id,false);
    perform public.rpc_set_live_stage_participant(v_round.session_id,v_round.participant_b_user_id,false);
    update public.live_match_rounds set state='completed',completed_at=timezone('utc',now()) where id=v_round.id;
  elsif p_target_state='cancelled' then
    if v_round.state not in ('proposed','awaiting_consent','both_accepted','public_introduction') then
      raise exception 'live_match_round_not_cancellable' using errcode='22023';
    end if;
    if v_round.state='public_introduction' then
      perform public.rpc_set_live_stage_participant(v_round.session_id,v_round.participant_a_user_id,false);
      perform public.rpc_set_live_stage_participant(v_round.session_id,v_round.participant_b_user_id,false);
    end if;
    update public.live_match_rounds set state='cancelled',completed_at=timezone('utc',now()) where id=v_round.id;
  else
    raise exception 'live_match_target_state_invalid' using errcode='22023';
  end if;
  insert into public.live_session_events(session_id,actor_user_id,event_type,to_state,metadata)
  values(v_round.session_id,auth.uid(),'match_round_transitioned',p_target_state,jsonb_build_object('matchRoundId',v_round.id));
  return public.live_hosted_matching_snapshot(v_round.session_id);
end;
$$;

create or replace function public.cleanup_live_match_rounds()
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_count integer;
begin
  update public.live_match_rounds
  set state='expired',consent_resolved_at=timezone('utc',now())
  where state='awaiting_consent' and expires_at <= timezone('utc',now());
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

alter table public.live_match_rounds enable row level security;
alter table public.live_match_round_responses enable row level security;
alter table public.live_match_round_updates enable row level security;

create policy live_match_round_updates_select_session
on public.live_match_round_updates for select to authenticated
using (public.can_view_live_session(session_id,auth.uid()));

-- Deliberately no authenticated SELECT policies. Participants receive only a
-- capability-filtered projection through live_hosted_matching_snapshot().

revoke all on public.live_match_rounds,public.live_match_round_responses,public.live_match_round_updates
from public,anon,authenticated;
grant select on public.live_match_round_updates to authenticated;

revoke all on function public.live_match_pair_is_eligible(uuid,uuid,uuid),
  public.live_build_connection_signals(uuid,uuid),public.live_build_conversation_spark(uuid,uuid),
  public.live_hosted_matching_snapshot(uuid),
  public.rpc_set_live_introduction_availability(uuid,boolean),
  public.rpc_create_live_match_round(uuid,uuid,uuid,uuid),
  public.rpc_respond_live_match_round(uuid,boolean),
  public.rpc_transition_live_match_round(uuid,text),public.cleanup_live_match_rounds()
from public,anon,authenticated;
grant execute on function public.live_hosted_matching_snapshot(uuid),
  public.rpc_set_live_introduction_availability(uuid,boolean),
  public.rpc_create_live_match_round(uuid,uuid,uuid,uuid),
  public.rpc_respond_live_match_round(uuid,boolean),
  public.rpc_transition_live_match_round(uuid,text)
to authenticated;
grant execute on function public.cleanup_live_match_rounds() to service_role;

-- Realtime only publishes the content-free invalidation row. Every client
-- subsequently reads its private, capability-filtered projection via RPC.
do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
     and not exists(
       select 1 from pg_publication_tables
       where pubname='supabase_realtime'
         and schemaname='public'
         and tablename='live_match_round_updates'
     ) then
    alter publication supabase_realtime add table public.live_match_round_updates;
  end if;
end;
$$;

-- Hosts need hosted-matching authority; matchmakers retain it without gaining
-- moderation capability.
create or replace function public.live_role_capabilities(p_role text)
returns text[]
language sql
immutable
set search_path = public, pg_catalog
as $$
  select case lower(coalesce(p_role,''))
    when 'audience' then array['live.join','live.react','live.comment','live.report','live.block','live.request_seat']::text[]
    when 'participant' then array['live.join','live.react','live.comment','live.report','live.block','live.request_seat','live.publish']::text[]
    when 'matchmaker' then array['live.join','live.react','live.comment','live.report','live.block','live.request_seat','live.suggest_match','live.create_match_round','live.view_host_console']::text[]
    when 'moderator' then array['live.join','live.react','live.comment','live.report','live.block','live.request_seat','live.moderate_comments','live.mute_public_participant','live.remove_participant','live.suspend_participant','live.terminate_private_spark','live.view_safety_console']::text[]
    when 'host' then array['live.create_session','live.join','live.react','live.comment','live.report','live.block','live.request_seat','live.publish','live.manage_stage','live.approve_seat_request','live.moderate_comments','live.mute_public_participant','live.remove_participant','live.suspend_participant','live.suggest_match','live.create_match_round','live.terminate_private_spark','live.start_session','live.end_session','live.view_host_console','live.view_safety_console']::text[]
    when 'internal_admin' then array['live.join','live.report','live.moderate_comments','live.mute_public_participant','live.remove_participant','live.suspend_participant','live.terminate_private_spark','live.view_safety_console','live.emergency_terminate']::text[]
    else array[]::text[]
  end;
$$;

do $$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname='live-match-round-expiry';
    perform cron.schedule(
      'live-match-round-expiry',
      '* * * * *',
      'select public.cleanup_live_match_rounds();'
    );
  end if;
end;
$$;

commit;
