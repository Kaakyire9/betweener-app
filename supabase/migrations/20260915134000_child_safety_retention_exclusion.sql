-- Held or legally preserved evidence must never be claimed by normal retention.

create or replace function public.rpc_service_claim_moderation_evidence_retention(
  p_limit integer default 100,
  p_retention interval default interval '30 days'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_run_id uuid := gen_random_uuid();
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 250);
  v_retention interval := greatest(coalesce(p_retention, interval '30 days'), interval '7 days');
  v_content jsonb := '[]'::jsonb;
  v_profiles jsonb := '[]'::jsonb;
begin
  if current_user not in ('postgres', 'supabase_admin')
     and auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;

  with candidates as (
    select event_row.id
    from public.content_moderation_events event_row
    where event_row.status <> 'PENDING_REVIEW'
      and not event_row.evidence_hold
      and not event_row.legal_hold
      and event_row.evidence_redacted_at is null
      and event_row.created_at < timezone('utc', now()) - v_retention
      and event_row.evidence_retention_attempts < 8
      and (
        event_row.evidence_retention_claim_id is null
        or event_row.evidence_retention_claimed_at
          < timezone('utc', now()) - interval '15 minutes'
      )
    order by event_row.created_at
    for update skip locked
    limit v_limit
  ), claimed as (
    update public.content_moderation_events event_row
    set evidence_retention_claim_id = v_run_id,
        evidence_retention_claimed_at = timezone('utc', now()),
        evidence_retention_attempts = event_row.evidence_retention_attempts + 1,
        evidence_retention_failure = null
    from candidates
    where event_row.id = candidates.id
    returning event_row.id, event_row.storage_bucket, event_row.storage_path,
      event_row.evidence_retention_attempts
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', claimed.id,
    'storage_bucket', claimed.storage_bucket,
    'storage_path', claimed.storage_path,
    'attempts', claimed.evidence_retention_attempts
  )), '[]'::jsonb)
  into v_content
  from claimed;

  with candidates as (
    select event_row.id
    from public.profile_moderation_events event_row
    where event_row.resolved_at is not null
      and event_row.evidence_redacted_at is null
      and event_row.created_at < timezone('utc', now()) - v_retention
      and event_row.evidence_retention_attempts < 8
      and (
        event_row.evidence_retention_claim_id is null
        or event_row.evidence_retention_claimed_at
          < timezone('utc', now()) - interval '15 minutes'
      )
    order by event_row.created_at
    for update skip locked
    limit v_limit
  ), claimed as (
    update public.profile_moderation_events event_row
    set evidence_retention_claim_id = v_run_id,
        evidence_retention_claimed_at = timezone('utc', now()),
        evidence_retention_attempts = event_row.evidence_retention_attempts + 1,
        evidence_retention_failure = null
    from candidates
    where event_row.id = candidates.id
    returning event_row.id, event_row.evidence_retention_attempts
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', claimed.id,
    'attempts', claimed.evidence_retention_attempts
  )), '[]'::jsonb)
  into v_profiles
  from claimed;

  insert into public.moderation_evidence_retention_runs(
    id, content_claimed, profile_claimed
  ) values (
    v_run_id, jsonb_array_length(v_content), jsonb_array_length(v_profiles)
  );

  return jsonb_build_object(
    'run_id', v_run_id,
    'content', v_content,
    'profiles', v_profiles
  );
end;
$$;

revoke all on function public.rpc_service_claim_moderation_evidence_retention(integer, interval)
  from public, anon, authenticated;
grant execute on function public.rpc_service_claim_moderation_evidence_retention(integer, interval)
  to service_role;
