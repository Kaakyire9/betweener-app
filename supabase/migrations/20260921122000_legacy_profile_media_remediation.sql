-- Background remediation for profile images published before the 1.2 immutable
-- moderation boundary. This is additive and does not change 1.1.1 write paths.

create table if not exists public.profile_media_remediation_jobs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  field_name text not null check (field_name in ('avatar_url', 'hero_image_url', 'photos')),
  item_index integer not null default 0 check (item_index >= 0),
  source_url text not null check (char_length(source_url) between 1 and 2000),
  priority integer not null default 0,
  status text not null default 'PENDING' check (status in (
    'PENDING', 'PROCESSING', 'RETRY', 'SAFE', 'REMOVED', 'STALE', 'DEAD_LETTER'
  )),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  claim_token uuid,
  claimed_at timestamptz,
  next_retry_at timestamptz,
  needs_source_cleanup boolean not null default false,
  sha256 text check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  decision_categories text[] not null default '{}',
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (profile_id, field_name, item_index, source_url)
);

create index if not exists profile_media_remediation_claim_idx
  on public.profile_media_remediation_jobs(priority desc, next_retry_at, created_at)
  where status in ('PENDING', 'RETRY');

alter table public.profile_media_remediation_jobs enable row level security;
revoke all on table public.profile_media_remediation_jobs from public, anon, authenticated;
grant select, insert, update, delete on table public.profile_media_remediation_jobs to service_role;

insert into public.profile_media_remediation_jobs(
  profile_id, user_id, field_name, item_index, source_url, priority
)
select profile.id, profile.user_id, media.field_name, media.item_index, media.source_url,
  case
    when coalesce(profile.profile_moderation_state, 'CLEAR') <> 'CLEAR' then 100
    when profile.updated_at >= timezone('utc', now()) - interval '30 days' then 50
    else 0
  end
from public.profiles profile
cross join lateral (
  select 'avatar_url'::text, 0, profile.avatar_url
  union all select 'hero_image_url'::text, 0, profile.hero_image_url
  union all
  select 'photos'::text, photo.ordinality::integer - 1, photo.url
  from unnest(coalesce(profile.photos, '{}'::text[])) with ordinality as photo(url, ordinality)
) as media(field_name, item_index, source_url)
where profile.deleted_at is null
  and nullif(btrim(coalesce(media.source_url, '')), '') is not null
  and media.source_url not like '%/storage/v1/object/public/moderated-profile-media/%'
on conflict (profile_id, field_name, item_index, source_url) do nothing;

create or replace function public.rpc_service_claim_profile_media_remediation(p_limit integer default 10)
returns table (
  id uuid, profile_id uuid, user_id uuid, field_name text, item_index integer,
  source_url text, claim_token uuid, attempt_count integer, needs_source_cleanup boolean
)
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;

  update public.profile_media_remediation_jobs job
  set status = case when job.attempt_count >= 8 then 'DEAD_LETTER' else 'RETRY' end,
      next_retry_at = case when job.attempt_count >= 8 then null else timezone('utc', now()) end,
      claim_token = null,
      claimed_at = null,
      last_error = coalesce(job.last_error, 'STALE_WORKER_CLAIM'),
      updated_at = timezone('utc', now())
  where job.status = 'PROCESSING'
    and job.claimed_at < timezone('utc', now()) - interval '15 minutes';

  return query
  with candidates as (
    select job.id
    from public.profile_media_remediation_jobs job
    where job.status in ('PENDING', 'RETRY')
      and coalesce(job.next_retry_at, '-infinity'::timestamptz) <= timezone('utc', now())
      and job.attempt_count < 8
    order by job.needs_source_cleanup desc, job.priority desc, job.created_at, job.id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 25))
  )
  update public.profile_media_remediation_jobs job
  set status = 'PROCESSING',
      attempt_count = job.attempt_count + 1,
      claim_token = gen_random_uuid(),
      claimed_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  from candidates
  where job.id = candidates.id
  returning job.id, job.profile_id, job.user_id, job.field_name, job.item_index,
    job.source_url, job.claim_token, job.attempt_count, job.needs_source_cleanup;
end;
$$;

revoke all on function public.rpc_service_claim_profile_media_remediation(integer)
  from public, anon, authenticated;
grant execute on function public.rpc_service_claim_profile_media_remediation(integer)
  to service_role;

create or replace function public.rpc_service_resolve_profile_media_remediation(
  p_job_id uuid,
  p_claim_token uuid,
  p_outcome text,
  p_sha256 text default null,
  p_categories text[] default '{}',
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_job public.profile_media_remediation_jobs%rowtype;
  v_profile public.profiles%rowtype;
  v_current_url text;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_outcome not in ('SAFE', 'REMOVE', 'RETRY', 'CLEANUP_DONE') then
    raise exception using errcode = '22023', message = 'REMEDIATION_OUTCOME_INVALID';
  end if;

  select * into v_job
  from public.profile_media_remediation_jobs job
  where job.id = p_job_id and job.claim_token = p_claim_token and job.status = 'PROCESSING'
  for update;
  if not found then
    raise exception using errcode = '40001', message = 'REMEDIATION_CLAIM_STALE';
  end if;

  if p_outcome = 'RETRY' then
    update public.profile_media_remediation_jobs
    set status = case when attempt_count >= 8 then 'DEAD_LETTER' else 'RETRY' end,
        next_retry_at = case when attempt_count >= 8 then null else
          timezone('utc', now()) + make_interval(secs => least(3600, 15 * (2 ^ least(attempt_count, 8))::integer)) end,
        claim_token = null, claimed_at = null,
        last_error = left(coalesce(p_error, 'REMEDIATION_RETRY'), 500),
        updated_at = timezone('utc', now())
    where id = v_job.id;
    return jsonb_build_object('ok', true, 'status',
      case when v_job.attempt_count >= 8 then 'DEAD_LETTER' else 'RETRY' end);
  end if;

  if p_outcome = 'CLEANUP_DONE' then
    if not v_job.needs_source_cleanup then
      raise exception using errcode = '22023', message = 'SOURCE_CLEANUP_NOT_REQUIRED';
    end if;
    update public.profile_media_remediation_jobs
    set status = 'REMOVED', needs_source_cleanup = false, claim_token = null,
        claimed_at = null, completed_at = timezone('utc', now()),
        updated_at = timezone('utc', now()), last_error = null
    where id = v_job.id;
    return jsonb_build_object('ok', true, 'status', 'REMOVED');
  end if;

  select * into v_profile from public.profiles profile
  where profile.id = v_job.profile_id and profile.user_id = v_job.user_id
    and profile.deleted_at is null
  for update;
  if not found then
    update public.profile_media_remediation_jobs
    set status = 'STALE', claim_token = null, claimed_at = null,
        completed_at = timezone('utc', now()), updated_at = timezone('utc', now())
    where id = v_job.id;
    return jsonb_build_object('ok', true, 'status', 'STALE');
  end if;

  v_current_url := case v_job.field_name
    when 'avatar_url' then v_profile.avatar_url
    when 'hero_image_url' then v_profile.hero_image_url
    else case when v_job.source_url = any(coalesce(v_profile.photos, '{}'::text[]))
      then v_job.source_url else null end
  end;
  if v_current_url is distinct from v_job.source_url then
    update public.profile_media_remediation_jobs
    set status = 'STALE', claim_token = null, claimed_at = null,
        completed_at = timezone('utc', now()), updated_at = timezone('utc', now())
    where id = v_job.id;
    return jsonb_build_object('ok', true, 'status', 'STALE');
  end if;

  if p_outcome = 'REMOVE' then
    perform set_config('app.profile_guard_write', 'on', true);
    update public.profiles
    set avatar_url = case when v_job.field_name = 'avatar_url' then null else avatar_url end,
        hero_image_url = case when v_job.field_name = 'hero_image_url' then null else hero_image_url end,
        photos = case when v_job.field_name = 'photos' then coalesce((
          select array_agg(photo.url order by photo.ordinality)
          from unnest(coalesce(photos, '{}'::text[])) with ordinality as photo(url, ordinality)
          where photo.url is distinct from v_job.source_url
        ), '{}'::text[]) else photos end,
        updated_at = timezone('utc', now())
    where id = v_profile.id;
  end if;

  update public.profile_media_remediation_jobs
  set status = case when p_outcome = 'SAFE' then 'SAFE' else 'RETRY' end,
      needs_source_cleanup = p_outcome = 'REMOVE',
      next_retry_at = case when p_outcome = 'REMOVE' then timezone('utc', now()) else null end,
      sha256 = nullif(lower(coalesce(p_sha256, '')), ''),
      decision_categories = coalesce(p_categories, '{}'),
      claim_token = null, claimed_at = null,
      completed_at = case when p_outcome = 'SAFE' then timezone('utc', now()) else null end,
      last_error = null, updated_at = timezone('utc', now())
  where id = v_job.id;

  return jsonb_build_object('ok', true, 'status',
    case when p_outcome = 'SAFE' then 'SAFE' else 'CLEANUP_PENDING' end);
end;
$$;

revoke all on function public.rpc_service_resolve_profile_media_remediation(
  uuid, uuid, text, text, text[], text
) from public, anon, authenticated;
grant execute on function public.rpc_service_resolve_profile_media_remediation(
  uuid, uuid, text, text, text[], text
) to service_role;

create table if not exists public.profile_media_remediation_config (
  singleton boolean primary key default true check (singleton),
  endpoint text not null,
  cron_secret text not null check (char_length(cron_secret) >= 32),
  enabled boolean not null default true,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.profile_media_remediation_config enable row level security;
revoke all on table public.profile_media_remediation_config from public, anon, authenticated;
grant select, insert, update, delete on table public.profile_media_remediation_config to service_role;

create or replace function public.invoke_profile_media_remediation_worker()
returns bigint
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_config public.profile_media_remediation_config%rowtype;
  v_request_id bigint;
begin
  select * into v_config from public.profile_media_remediation_config
  where singleton and enabled;
  if v_config.endpoint is null then return null; end if;
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    raise exception using errcode = '55000', message = 'PG_NET_HTTP_POST_UNAVAILABLE';
  end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 55000)'
    into v_request_id
    using v_config.endpoint,
      jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_config.cron_secret),
      jsonb_build_object('execute', true);
  return v_request_id;
end;
$$;

revoke all on function public.invoke_profile_media_remediation_worker()
  from public, anon, authenticated;
grant execute on function public.invoke_profile_media_remediation_worker() to service_role;

create or replace function public.configure_profile_media_remediation_worker(
  p_endpoint text,
  p_cron_secret text
)
returns boolean
language plpgsql
security definer
set search_path = public, cron, auth, pg_catalog
as $$
declare v_job_id bigint;
begin
  if current_user not in ('postgres', 'supabase_admin') and auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_endpoint !~ '^https://[A-Za-z0-9.-]+/functions/v1/profile-media-remediation-v1-2$'
     or char_length(coalesce(p_cron_secret, '')) < 32 then
    raise exception using errcode = '22023', message = 'REMEDIATION_CONFIGURATION_INVALID';
  end if;
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise exception using errcode = '55000', message = 'PG_CRON_UNAVAILABLE';
  end if;

  insert into public.profile_media_remediation_config(singleton, endpoint, cron_secret, enabled)
  values (true, p_endpoint, p_cron_secret, true)
  on conflict (singleton) do update set endpoint = excluded.endpoint,
    cron_secret = excluded.cron_secret, enabled = true,
    updated_at = timezone('utc', now());

  select jobid into v_job_id from cron.job
  where jobname = 'profile-media-remediation-v1-2' limit 1;
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule(
    'profile-media-remediation-v1-2', '*/5 * * * *',
    'select public.invoke_profile_media_remediation_worker();'
  );
  return true;
end;
$$;

revoke all on function public.configure_profile_media_remediation_worker(text, text)
  from public, anon, authenticated;
grant execute on function public.configure_profile_media_remediation_worker(text, text)
  to service_role;

create or replace function public.disable_profile_media_remediation_worker()
returns boolean
language plpgsql
security definer
set search_path = public, cron, auth, pg_catalog
as $$
declare v_job_id bigint;
begin
  if current_user not in ('postgres', 'supabase_admin') and auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  update public.profile_media_remediation_config
  set enabled = false, updated_at = timezone('utc', now()) where singleton;
  select jobid into v_job_id from cron.job
  where jobname = 'profile-media-remediation-v1-2' limit 1;
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  return true;
end;
$$;

revoke all on function public.disable_profile_media_remediation_worker()
  from public, anon, authenticated;
grant execute on function public.disable_profile_media_remediation_worker() to service_role;
