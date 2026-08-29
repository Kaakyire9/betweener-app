-- Make Chemistry First an immutable property of each created private room.
-- This prevents later Live-session edits from revealing an already-created
-- room, and exposes the authoritative flag to fail-closed clients.

begin;

alter table public.live_private_sparks
  add column if not exists chemistry_first_enabled boolean;

alter table public.live_quick_connect_pairings
  add column if not exists chemistry_first_enabled boolean;

update public.live_private_sparks spark
set chemistry_first_enabled = coalesce(session.chemistry_first_enabled, false)
from public.live_sessions session
where session.id = spark.session_id
  and spark.chemistry_first_enabled is null;

update public.live_quick_connect_pairings pairing
set chemistry_first_enabled = coalesce(session.chemistry_first_enabled, false)
from public.live_sessions session
where session.id = pairing.session_id
  and pairing.chemistry_first_enabled is null;

update public.live_private_sparks
set chemistry_first_enabled = false
where chemistry_first_enabled is null;

update public.live_quick_connect_pairings
set chemistry_first_enabled = false
where chemistry_first_enabled is null;

alter table public.live_private_sparks
  alter column chemistry_first_enabled set default false,
  alter column chemistry_first_enabled set not null;

alter table public.live_quick_connect_pairings
  alter column chemistry_first_enabled set default false,
  alter column chemistry_first_enabled set not null;

create or replace function public.snapshot_live_private_spark_chemistry_first()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  select coalesce(session.chemistry_first_enabled, false)
  into new.chemistry_first_enabled
  from public.live_sessions session
  where session.id = new.session_id;
  new.chemistry_first_enabled := coalesce(new.chemistry_first_enabled, false);
  return new;
end;
$$;

drop trigger if exists live_private_spark_snapshot_chemistry_first
  on public.live_private_sparks;
create trigger live_private_spark_snapshot_chemistry_first
before insert or update of session_id on public.live_private_sparks
for each row execute function public.snapshot_live_private_spark_chemistry_first();

create or replace function public.protect_live_private_spark_chemistry_first()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if new.chemistry_first_enabled is distinct from old.chemistry_first_enabled then
    raise exception 'live_private_spark_chemistry_first_immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists live_private_spark_protect_chemistry_first
  on public.live_private_sparks;
create trigger live_private_spark_protect_chemistry_first
before update of chemistry_first_enabled on public.live_private_sparks
for each row execute function public.protect_live_private_spark_chemistry_first();

create or replace function public.snapshot_live_quick_pairing_chemistry_first()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  select coalesce(session.chemistry_first_enabled, false)
  into new.chemistry_first_enabled
  from public.live_sessions session
  where session.id = new.session_id;
  new.chemistry_first_enabled := coalesce(new.chemistry_first_enabled, false);
  return new;
end;
$$;

drop trigger if exists live_quick_pairing_snapshot_chemistry_first
  on public.live_quick_connect_pairings;
create trigger live_quick_pairing_snapshot_chemistry_first
before insert or update of session_id on public.live_quick_connect_pairings
for each row execute function public.snapshot_live_quick_pairing_chemistry_first();

create or replace function public.protect_live_quick_pairing_chemistry_first()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if new.chemistry_first_enabled is distinct from old.chemistry_first_enabled then
    raise exception 'live_quick_pairing_chemistry_first_immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists live_quick_pairing_protect_chemistry_first
  on public.live_quick_connect_pairings;
create trigger live_quick_pairing_protect_chemistry_first
before update of chemistry_first_enabled on public.live_quick_connect_pairings
for each row execute function public.protect_live_quick_pairing_chemistry_first();

-- Return only profile facts that actually exist. In particular, do not use
-- the legacy `location` display string as a city and do not manufacture
-- default values that the member never selected.
create or replace function public.live_chemistry_profile_context(p_profile_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_profile public.profiles;
  v_values text[];
  v_context jsonb;
begin
  select profile.* into v_profile
  from public.profiles profile
  where profile.id = p_profile_id;

  if v_profile.id is null then
    return '{}'::jsonb;
  end if;

  v_values := array_remove(array[
    case
      when nullif(btrim(v_profile.religion::text), '') is not null
        and v_profile.religion::text <> 'prefer_not_to_say'
      then initcap(replace(v_profile.religion::text, '_', ' '))
    end,
    case when v_profile.relationship_compass #>> '{priorities,family}' = 'essential'
      then 'Family' end,
    case when v_profile.relationship_compass #>> '{priorities,lifestyle}' = 'essential'
      then 'Lifestyle' end,
    case when v_profile.relationship_compass #>> '{priorities,interests}' = 'essential'
      then 'Shared interests' end,
    case when v_profile.relationship_compass #>> '{priorities,education}' = 'essential'
      then 'Education' end,
    case when v_profile.relationship_compass #>> '{priorities,career}' = 'essential'
      then 'Career' end
  ], null);

  v_context := jsonb_strip_nulls(jsonb_build_object(
    'full_name', nullif(btrim(v_profile.full_name), ''),
    'age', v_profile.age,
    'city', nullif(btrim(v_profile.city), ''),
    'looking_for', nullif(btrim(coalesce(
      v_profile.relationship_compass ->> 'intention',
      v_profile.looking_for
    )), '')
  ));

  if coalesce(cardinality(v_values), 0) > 0 then
    v_context := v_context || jsonb_build_object('values', to_jsonb(v_values));
  end if;

  return v_context;
end;
$$;

revoke all on function public.live_chemistry_profile_context(uuid)
from public, anon, authenticated;

revoke all on function public.snapshot_live_private_spark_chemistry_first(),
  public.protect_live_private_spark_chemistry_first(),
  public.snapshot_live_quick_pairing_chemistry_first(),
  public.protect_live_quick_pairing_chemistry_first()
from public, anon, authenticated;

create or replace function public.live_chemistry_private_projection(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_conversation public.live_chemistry_conversations;
  v_user_id uuid := auth.uid();
  v_other_profile_id uuid;
  v_my_ready boolean;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into v_conversation
  from public.live_chemistry_conversations conversation
  where conversation.id = p_conversation_id
    and v_user_id in (
      conversation.participant_a_user_id,
      conversation.participant_b_user_id
    );

  if v_conversation.id is null then
    raise exception 'live_chemistry_unavailable' using errcode = 'P0002';
  end if;

  v_other_profile_id := case
    when v_user_id = v_conversation.participant_a_user_id
      then v_conversation.participant_b_profile_id
    else v_conversation.participant_a_profile_id
  end;

  select exists (
    select 1
    from public.live_chemistry_readiness readiness
    where readiness.conversation_id = v_conversation.id
      and readiness.user_id = v_user_id
  ) into v_my_ready;

  return jsonb_build_object(
    'id', v_conversation.id,
    'session_id', v_conversation.session_id,
    'source_kind', v_conversation.source_kind,
    'source_id', v_conversation.source_id,
    'state', v_conversation.state,
    'my_ready', v_my_ready,
    'reveal_offered_at', v_conversation.reveal_offered_at,
    'revealed_at', v_conversation.revealed_at,
    'version', v_conversation.version,
    'other_person_context', public.live_chemistry_profile_context(v_other_profile_id)
  );
end;
$$;

create or replace function public.rpc_get_live_chemistry_for_private_spark(
  p_private_spark_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_spark public.live_private_sparks;
  v_conversation_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into v_spark
  from public.live_private_sparks spark
  where spark.id = p_private_spark_id
    and v_user_id in (spark.participant_a_user_id, spark.participant_b_user_id);

  if v_spark.id is null then
    raise exception 'live_private_spark_admission_denied' using errcode = '42501';
  end if;
  if not v_spark.chemistry_first_enabled then return null; end if;

  insert into public.live_chemistry_conversations(
    session_id, source_kind, source_id,
    participant_a_user_id, participant_a_profile_id,
    participant_b_user_id, participant_b_profile_id
  ) values (
    v_spark.session_id, 'private_spark', v_spark.id,
    v_spark.participant_a_user_id, v_spark.participant_a_profile_id,
    v_spark.participant_b_user_id, v_spark.participant_b_profile_id
  )
  on conflict (source_kind, source_id) do update
    set updated_at = public.live_chemistry_conversations.updated_at
  returning id into v_conversation_id;

  if not exists (
    select 1 from public.live_chemistry_events event
    where event.conversation_id = v_conversation_id
      and event.event_type = 'created'
  ) then
    insert into public.live_chemistry_events(conversation_id, session_id, event_type)
    values (v_conversation_id, v_spark.session_id, 'created');
  end if;

  return public.live_chemistry_private_projection(v_conversation_id);
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
  v_my_exit_decision text;
  v_conversation_spark jsonb;
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
    select response.decision into v_my_response
    from public.live_private_spark_responses response
    where response.private_spark_id=v_spark.id and response.user_id=auth.uid();

    select response.decision into v_my_exit_decision
    from public.live_private_spark_exit_responses response
    where response.private_spark_id=v_spark.id and response.user_id=auth.uid();
  end if;
  select round.conversation_spark into v_conversation_spark
  from public.live_match_rounds round
  where round.id=v_spark.match_round_id;
  return jsonb_build_object(
    'id',v_spark.id,
    'chemistry_first_enabled',v_spark.chemistry_first_enabled,
    'session_id',v_spark.session_id,'match_round_id',v_spark.match_round_id,
    'state',v_spark.state,'is_participant',v_is_participant,'can_manage',v_can_manage,
    'my_response',v_my_response,'consent_expires_at',v_spark.consent_expires_at,
    'active_expires_at',v_spark.active_expires_at,
    'conversation_spark',v_conversation_spark,
    'my_exit_decision',case when v_is_participant then v_my_exit_decision else null end,
    'exit_outcome',case when v_is_participant then v_spark.exit_outcome else null end,
    'match_id',case
      when v_is_participant and v_spark.exit_outcome='mutual_connection' then v_spark.match_id
      else null
    end,
    'participant_a',(select jsonb_build_object(
      'user_id',v_spark.participant_a_user_id,'profile_id',profile.id,
      'full_name',profile.full_name,'avatar_url',public.live_profile_avatar(profile)
    ) from public.profiles profile where profile.id=v_spark.participant_a_profile_id),
    'participant_b',(select jsonb_build_object(
      'user_id',v_spark.participant_b_user_id,'profile_id',profile.id,
      'full_name',profile.full_name,'avatar_url',public.live_profile_avatar(profile)
    ) from public.profiles profile where profile.id=v_spark.participant_b_profile_id)
  );
end;
$$;

create or replace function public.rpc_get_live_quick_connect(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
set row_security=off
as $$
declare
  v_user_id uuid:=auth.uid();
  v_participant public.live_quick_connect_participants;
  v_pairing public.live_quick_connect_pairings;
  v_other public.profiles;
  v_my_decision text;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode='42501'; end if;
  perform public.live_quick_connect_sync(p_session_id);
  select * into v_participant from public.live_quick_connect_participants participant
  where participant.session_id=p_session_id and participant.user_id=v_user_id;
  if v_participant.user_id is null then
    return jsonb_build_object(
      'session_id',p_session_id,'state','not_joined','server_now',timezone('utc',now())
    );
  end if;
  if v_participant.current_pairing_id is not null then
    select * into v_pairing from public.live_quick_connect_pairings
    where id=v_participant.current_pairing_id;
    select profile.* into v_other from public.profiles profile where profile.id=case
      when v_user_id=v_pairing.participant_a_user_id then v_pairing.participant_b_profile_id
      else v_pairing.participant_a_profile_id end;
    select decision.decision into v_my_decision from public.live_quick_connect_decisions decision
    where decision.pairing_id=v_pairing.id and decision.user_id=v_user_id;
  end if;
  return jsonb_build_object(
    'session_id',p_session_id,'state',v_participant.state,
    'connection_state',v_participant.connection_state,'server_now',timezone('utc',now()),
    'pairing',case when v_pairing.id is null then null else jsonb_build_object(
      'id',v_pairing.id,
      'chemistry_first_enabled',v_pairing.chemistry_first_enabled,
      'state',v_pairing.state,'starts_at',v_pairing.starts_at,
      'ends_at',v_pairing.ends_at,'reconnect_deadline',v_pairing.reconnect_deadline,
      'my_decision',v_my_decision,'shared_outcome',v_pairing.shared_outcome,
      'other_person',jsonb_build_object(
        'user_id',v_other.user_id,'profile_id',v_other.id,
        'full_name',v_other.full_name,'avatar_url',v_other.avatar_url,'age',v_other.age,
        'city',v_other.city,
        'looking_for',coalesce(v_other.relationship_compass ->> 'intention',v_other.looking_for)
      ),
      'provider_call_type',v_pairing.provider_call_type,
      'provider_call_id',v_pairing.provider_call_id
    ) end
  );
end;
$$;

create or replace function public.rpc_get_live_chemistry_for_quick_connect(p_pairing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
set row_security=off
as $$
declare
  v_pairing public.live_quick_connect_pairings;
  v_conversation_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select * into v_pairing from public.live_quick_connect_pairings pairing
  where pairing.id=p_pairing_id
    and v_user_id in(pairing.participant_a_user_id,pairing.participant_b_user_id);
  if v_pairing.id is null then
    raise exception 'live_quick_connect_pairing_forbidden' using errcode='42501';
  end if;
  if not v_pairing.chemistry_first_enabled then return null; end if;

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

  if not exists(
    select 1 from public.live_chemistry_events event
    where event.conversation_id=v_conversation_id and event.event_type='created'
  ) then
    insert into public.live_chemistry_events(conversation_id,session_id,event_type)
    values(v_conversation_id,v_pairing.session_id,'created');
  end if;
  return public.live_chemistry_private_projection(v_conversation_id);
end;
$$;

commit;
