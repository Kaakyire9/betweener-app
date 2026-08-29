-- Chemistry projections are read frequently and are also refreshed by realtime.
-- Existing conversations must therefore be true reads: a no-op upsert would fire
-- the conversation update trigger, publish another invalidation, and create a
-- self-sustaining refresh/write loop. Serialize first-time creation per source,
-- then return the caller-bound private projection without mutating existing rows.

begin;

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
  v_created boolean := false;
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
  if not v_spark.chemistry_first_enabled then
    return null;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('live_chemistry:private_spark:' || p_private_spark_id::text, 0)
  );

  select conversation.id into v_conversation_id
  from public.live_chemistry_conversations conversation
  where conversation.source_kind = 'private_spark'
    and conversation.source_id = p_private_spark_id;

  if v_conversation_id is null then
    insert into public.live_chemistry_conversations(
      session_id, source_kind, source_id,
      participant_a_user_id, participant_a_profile_id,
      participant_b_user_id, participant_b_profile_id
    ) values (
      v_spark.session_id, 'private_spark', v_spark.id,
      v_spark.participant_a_user_id, v_spark.participant_a_profile_id,
      v_spark.participant_b_user_id, v_spark.participant_b_profile_id
    )
    on conflict (source_kind, source_id) do nothing
    returning id into v_conversation_id;

    v_created := v_conversation_id is not null;

    if v_conversation_id is null then
      select conversation.id into v_conversation_id
      from public.live_chemistry_conversations conversation
      where conversation.source_kind = 'private_spark'
        and conversation.source_id = p_private_spark_id;
    end if;
  end if;

  if v_conversation_id is null then
    raise exception 'live_chemistry_initialization_failed' using errcode = 'P0001';
  end if;

  if v_created then
    insert into public.live_chemistry_events(conversation_id, session_id, event_type)
    values (v_conversation_id, v_spark.session_id, 'created');
  end if;

  return public.live_chemistry_private_projection(v_conversation_id);
end;
$$;

create or replace function public.rpc_get_live_chemistry_for_quick_connect(
  p_pairing_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_pairing public.live_quick_connect_pairings;
  v_conversation_id uuid;
  v_created boolean := false;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into v_pairing
  from public.live_quick_connect_pairings pairing
  where pairing.id = p_pairing_id
    and v_user_id in (pairing.participant_a_user_id, pairing.participant_b_user_id);

  if v_pairing.id is null then
    raise exception 'live_quick_connect_pairing_forbidden' using errcode = '42501';
  end if;
  if not v_pairing.chemistry_first_enabled then
    return null;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('live_chemistry:quick_connect:' || p_pairing_id::text, 0)
  );

  select conversation.id into v_conversation_id
  from public.live_chemistry_conversations conversation
  where conversation.source_kind = 'quick_connect'
    and conversation.source_id = p_pairing_id;

  if v_conversation_id is null then
    insert into public.live_chemistry_conversations(
      session_id, source_kind, source_id,
      participant_a_user_id, participant_a_profile_id,
      participant_b_user_id, participant_b_profile_id
    ) values (
      v_pairing.session_id, 'quick_connect', v_pairing.id,
      v_pairing.participant_a_user_id, v_pairing.participant_a_profile_id,
      v_pairing.participant_b_user_id, v_pairing.participant_b_profile_id
    )
    on conflict (source_kind, source_id) do nothing
    returning id into v_conversation_id;

    v_created := v_conversation_id is not null;

    if v_conversation_id is null then
      select conversation.id into v_conversation_id
      from public.live_chemistry_conversations conversation
      where conversation.source_kind = 'quick_connect'
        and conversation.source_id = p_pairing_id;
    end if;
  end if;

  if v_conversation_id is null then
    raise exception 'live_chemistry_initialization_failed' using errcode = 'P0001';
  end if;

  if v_created then
    insert into public.live_chemistry_events(conversation_id, session_id, event_type)
    values (v_conversation_id, v_pairing.session_id, 'created');
  end if;

  return public.live_chemistry_private_projection(v_conversation_id);
end;
$$;

revoke all on function public.rpc_get_live_chemistry_for_private_spark(uuid)
from public, anon;
revoke all on function public.rpc_get_live_chemistry_for_quick_connect(uuid)
from public, anon;
grant execute on function public.rpc_get_live_chemistry_for_private_spark(uuid)
to authenticated;
grant execute on function public.rpc_get_live_chemistry_for_quick_connect(uuid)
to authenticated;

comment on function public.rpc_get_live_chemistry_for_private_spark(uuid) is
  'Returns a caller-bound Chemistry First projection; existing reads perform no writes.';
comment on function public.rpc_get_live_chemistry_for_quick_connect(uuid) is
  'Returns a caller-bound Chemistry First projection; existing reads perform no writes.';

commit;
