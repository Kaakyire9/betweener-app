-- Give every mutual Private Spark a durable, server-authored origin story in
-- the existing chat timeline. Private decisions never enter chat metadata.

begin;

create or replace function public.enrich_live_private_spark_chat_origin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_spark public.live_private_sparks;
  v_session public.live_sessions;
  v_origin_at timestamptz;
begin
  if new.event_type <> 'live_private_spark_mutual' then
    return new;
  end if;

  if coalesce(new.metadata->>'private_spark_id', '')
      !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    raise exception 'live_private_spark_origin_invalid' using errcode = '22023';
  end if;

  select spark.*
  into v_spark
  from public.live_private_sparks as spark
  where spark.id = (new.metadata->>'private_spark_id')::uuid;

  if v_spark.id is null
     or new.user_id not in (v_spark.participant_a_user_id, v_spark.participant_b_user_id)
     or new.peer_user_id not in (v_spark.participant_a_user_id, v_spark.participant_b_user_id)
     or new.user_id = new.peer_user_id then
    raise exception 'live_private_spark_origin_forbidden' using errcode = '42501';
  end if;

  select session.*
  into v_session
  from public.live_sessions as session
  where session.id = v_spark.session_id;

  if v_session.id is null then
    raise exception 'live_private_spark_origin_session_missing' using errcode = '23503';
  end if;

  v_origin_at := coalesce(
    v_session.started_at,
    v_session.scheduled_start,
    v_spark.activated_at,
    v_session.created_at
  );

  new.text := format(
    E'You met during\n\n%s\n%s\n\nHosted on Betweener Live',
    v_session.title,
    to_char(v_origin_at at time zone 'UTC', 'FMDD FMMonth YYYY')
  );
  new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
    'source', 'betweener_live',
    'origin_type', 'private_spark',
    'live_session_id', v_session.id,
    'live_session_title', v_session.title,
    'live_session_started_at', v_origin_at,
    'origin_schema_version', 1
  );

  return new;
end;
$$;

revoke all on function public.enrich_live_private_spark_chat_origin() from public, anon, authenticated;

drop trigger if exists system_messages_enrich_live_private_spark_origin
  on public.system_messages;
create trigger system_messages_enrich_live_private_spark_origin
before insert on public.system_messages
for each row
when (new.event_type = 'live_private_spark_mutual')
execute function public.enrich_live_private_spark_chat_origin();

-- Bring already-created Phase 4 origin messages up to the same canonical
-- representation. This update never reads or publishes either exit decision.
update public.system_messages as message
set
  text = format(
    E'You met during\n\n%s\n%s\n\nHosted on Betweener Live',
    session.title,
    to_char(
      coalesce(session.started_at, session.scheduled_start, spark.activated_at, session.created_at)
        at time zone 'UTC',
      'FMDD FMMonth YYYY'
    )
  ),
  metadata = coalesce(message.metadata, '{}'::jsonb) || jsonb_build_object(
    'source', 'betweener_live',
    'origin_type', 'private_spark',
    'live_session_id', session.id,
    'live_session_title', session.title,
    'live_session_started_at', coalesce(
      session.started_at,
      session.scheduled_start,
      spark.activated_at,
      session.created_at
    ),
    'origin_schema_version', 1
  )
from public.live_private_sparks as spark
join public.live_sessions as session on session.id = spark.session_id
where message.event_type = 'live_private_spark_mutual'
  and message.metadata->>'private_spark_id' = spark.id::text;

commit;
