-- Phase 10C callers use ordinary integer literals for event priority. Keep the
-- compact smallint storage contract while providing an unambiguous SQL entry
-- point for those callers.

create or replace function public.live_odo_guarded_enqueue_event_v1(
  p_session_id uuid,
  p_trigger_type text,
  p_origin_key text,
  p_source_kind text,
  p_source_id uuid,
  p_source_version bigint,
  p_priority integer,
  p_not_before timestamptz,
  p_ttl_seconds integer
)
returns bigint
language sql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select public.live_odo_guarded_enqueue_event_v1(
    p_session_id,
    p_trigger_type,
    p_origin_key,
    p_source_kind,
    p_source_id,
    p_source_version,
    p_priority::smallint,
    p_not_before,
    p_ttl_seconds
  );
$$;

revoke all on function public.live_odo_guarded_enqueue_event_v1(
  uuid,text,text,text,uuid,bigint,integer,timestamptz,integer
) from public, anon, authenticated, service_role;
