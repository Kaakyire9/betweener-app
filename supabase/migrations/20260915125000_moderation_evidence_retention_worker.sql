-- Concurrency-safe moderation evidence retention and server-owned scheduling.

alter table public.content_moderation_events
  add column if not exists evidence_retention_claim_id uuid,
  add column if not exists evidence_retention_claimed_at timestamptz,
  add column if not exists evidence_retention_attempts integer not null default 0,
  add column if not exists evidence_retention_failure text;

alter table public.profile_moderation_events
  add column if not exists evidence_retention_claim_id uuid,
  add column if not exists evidence_retention_claimed_at timestamptz,
  add column if not exists evidence_retention_attempts integer not null default 0,
  add column if not exists evidence_retention_failure text;

create table if not exists public.moderation_evidence_retention_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  content_claimed integer not null default 0,
  profile_claimed integer not null default 0,
  redacted_count integer not null default 0,
  failed_count integer not null default 0,
  dead_letter_count integer not null default 0,
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'failed')),
  error text
);

create index if not exists moderation_evidence_retention_runs_started_idx
  on public.moderation_evidence_retention_runs(started_at desc);

alter table public.moderation_evidence_retention_runs enable row level security;
revoke all on table public.moderation_evidence_retention_runs
  from public, anon, authenticated;
grant select, insert, update on table public.moderation_evidence_retention_runs
  to service_role;

create table if not exists public.moderation_evidence_retention_config (
  singleton boolean primary key default true check (singleton),
  endpoint text not null,
  cron_secret text not null check (char_length(cron_secret) >= 32),
  enabled boolean not null default true,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.moderation_evidence_retention_config enable row level security;
revoke all on table public.moderation_evidence_retention_config
  from public, anon, authenticated, service_role;

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

create or replace function public.invoke_moderation_evidence_retention_worker()
returns bigint
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_config public.moderation_evidence_retention_config%rowtype;
  v_request_id bigint;
begin
  select * into v_config
  from public.moderation_evidence_retention_config
  where singleton and enabled;

  if v_config.endpoint is null then return null; end if;
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    raise exception using errcode = '55000', message = 'pg_net_http_post_unavailable';
  end if;

  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 55000)'
    into v_request_id
    using v_config.endpoint,
      jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', v_config.cron_secret
      ),
      jsonb_build_object('execute', true);
  return v_request_id;
end;
$$;

revoke all on function public.invoke_moderation_evidence_retention_worker()
  from public, anon, authenticated;
grant execute on function public.invoke_moderation_evidence_retention_worker()
  to service_role;

create or replace function public.configure_moderation_evidence_retention_worker(
  p_endpoint text,
  p_cron_secret text
)
returns boolean
language plpgsql
security definer
set search_path = public, cron, pg_catalog
as $$
declare
  v_job_id bigint;
begin
  if current_user not in ('postgres', 'supabase_admin')
     and auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'service_role_required';
  end if;
  if p_endpoint !~ '^https://[A-Za-z0-9.-]+/functions/v1/moderation-evidence-retention$'
     or char_length(coalesce(p_cron_secret, '')) < 32 then
    raise exception using errcode = '22023', message = 'invalid_retention_worker_configuration';
  end if;
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise exception using errcode = '55000', message = 'pg_cron_unavailable';
  end if;

  insert into public.moderation_evidence_retention_config(
    singleton, endpoint, cron_secret, enabled
  ) values (true, p_endpoint, p_cron_secret, true)
  on conflict (singleton) do update
    set endpoint = excluded.endpoint,
        cron_secret = excluded.cron_secret,
        enabled = true,
        updated_at = timezone('utc', now());

  select jobid into v_job_id
  from cron.job
  where jobname = 'moderation-evidence-retention'
  limit 1;
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;

  perform cron.schedule(
    'moderation-evidence-retention',
    '17 3 * * *',
    'select public.invoke_moderation_evidence_retention_worker();'
  );
  return true;
end;
$$;

revoke all on function public.configure_moderation_evidence_retention_worker(text, text)
  from public, anon, authenticated;
grant execute on function public.configure_moderation_evidence_retention_worker(text, text)
  to service_role;
