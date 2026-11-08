begin;

create extension if not exists pg_trgm with schema extensions;

create table if not exists public.relationship_gist_ai_environment_policies (
  environment text primary key check (environment in ('local', 'staging', 'production')),
  is_current boolean not null default false,
  enabled boolean not null default false,
  provider text not null default 'openai' check (provider = 'openai'),
  model text not null check (char_length(btrim(model)) between 1 and 120),
  daily_job_budget integer not null default 10 check (daily_job_budget between 1 and 1000),
  daily_token_budget bigint not null default 100000 check (daily_token_budget between 1000 and 1000000000),
  max_output_tokens integer not null default 3000 check (max_output_tokens between 500 and 10000),
  max_attempts integer not null default 2 check (max_attempts between 1 and 3),
  input_microusd_per_million bigint check (input_microusd_per_million >= 0),
  cached_input_microusd_per_million bigint check (cached_input_microusd_per_million >= 0),
  output_microusd_per_million bigint check (output_microusd_per_million >= 0),
  configured_by_user_id uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create unique index if not exists relationship_gist_ai_one_current_environment_idx
  on public.relationship_gist_ai_environment_policies (is_current)
  where is_current = true;

create table if not exists public.relationship_gist_ai_topic_calendar (
  id uuid primary key default gen_random_uuid(),
  environment text not null references public.relationship_gist_ai_environment_policies(environment) on delete restrict,
  topic_key text not null check (topic_key ~ '^[a-z0-9][a-z0-9_-]{2,95}$'),
  topic_title text not null check (char_length(btrim(topic_title)) between 3 and 200),
  topic_fingerprint text not null check (char_length(topic_fingerprint) between 3 and 200),
  topic_brief text not null check (char_length(btrim(topic_brief)) between 20 and 2000),
  requested_perspective text not null check (requested_perspective in (
    'general', 'christian', 'muslim', 'culture', 'safety', 'communication'
  )),
  planned_for date not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'cancelled', 'consumed')),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  approved_by_user_id uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  cancelled_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (environment, topic_key),
  check ((approved_by_user_id is null) = (approved_at is null))
);

create index if not exists relationship_gist_ai_topic_calendar_schedule_idx
  on public.relationship_gist_ai_topic_calendar (environment, planned_for, status);
do $$
declare
  v_operator_schema text;
begin
  select namespace.nspname into v_operator_schema
  from pg_catalog.pg_opclass operator
  join pg_catalog.pg_namespace namespace on namespace.oid = operator.opcnamespace
  where operator.opcname = 'gin_trgm_ops'
  limit 1;
  if v_operator_schema is null then raise exception 'pg_trgm_operator_class_missing'; end if;
  execute format(
    'create index if not exists relationship_gist_ai_topic_calendar_fingerprint_idx '
    'on public.relationship_gist_ai_topic_calendar using gin (topic_fingerprint %I.gin_trgm_ops)',
    v_operator_schema
  );
end;
$$;

create table if not exists public.relationship_gist_ai_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  environment text not null references public.relationship_gist_ai_environment_policies(environment) on delete restrict,
  topic_id uuid not null references public.relationship_gist_ai_topic_calendar(id) on delete restrict,
  requested_by_user_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key uuid not null,
  status text not null default 'queued' check (status in (
    'queued', 'processing', 'completed', 'failed', 'rejected_unsafe',
    'rejected_duplicate', 'budget_exceeded', 'rejected_by_editor'
  )),
  schema_version text not null check (schema_version = 'relationship_gist_ai_draft_v1'),
  prompt_version text not null check (prompt_version = 'relationship_gist_editorial_prompt_v1'),
  provider text not null check (provider = 'openai'),
  model text not null,
  attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  provider_request_id text,
  input_tokens integer check (input_tokens >= 0),
  cached_input_tokens integer check (cached_input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  estimated_cost_microusd bigint check (estimated_cost_microusd >= 0),
  cost_estimate_status text not null default 'unconfigured'
    check (cost_estimate_status in ('configured', 'unconfigured')),
  generated_revision_id uuid references public.relationship_gist_revisions(id) on delete restrict,
  failure_code text,
  retryable boolean not null default false,
  claimed_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (environment, requested_by_user_id, idempotency_key)
);

create index if not exists relationship_gist_ai_jobs_queue_idx
  on public.relationship_gist_ai_generation_jobs (environment, status, created_at);
create index if not exists relationship_gist_ai_jobs_budget_idx
  on public.relationship_gist_ai_generation_jobs (environment, created_at, status);

create table if not exists public.relationship_gist_ai_job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.relationship_gist_ai_generation_jobs(id) on delete restrict,
  environment text not null,
  actor_user_id uuid references auth.users(id) on delete restrict,
  event_type text not null,
  from_status text,
  to_status text,
  failure_code text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.relationship_gist_ai_draft_metadata (
  revision_id uuid primary key references public.relationship_gist_revisions(id) on delete restrict,
  generation_job_id uuid not null references public.relationship_gist_ai_generation_jobs(id) on delete restrict,
  schema_version text not null check (schema_version = 'relationship_gist_ai_draft_v1'),
  prompt_version text not null check (prompt_version = 'relationship_gist_editorial_prompt_v1'),
  provider text not null check (provider = 'openai'),
  model text not null,
  takeaway text not null check (char_length(btrim(takeaway)) between 1 and 500),
  discussion_prompt text not null check (char_length(btrim(discussion_prompt)) between 1 and 500),
  safety_level text not null check (safety_level in ('low', 'sensitive', 'high_risk')),
  sensitive_topics text[] not null default '{}'::text[],
  safety_rationale text not null check (char_length(btrim(safety_rationale)) between 1 and 500),
  human_edited boolean not null default false,
  claims_verified_by_user_id uuid references auth.users(id) on delete restrict,
  claims_verified_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  check ((claims_verified_by_user_id is null) = (claims_verified_at is null))
);

create table if not exists public.relationship_gist_ai_source_suggestions (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.relationship_gist_revisions(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 240),
  url text not null check (url ~ '^https://[^[:space:]]+$' and char_length(url) <= 1000),
  publisher text not null check (char_length(btrim(publisher)) between 1 and 200),
  why_suggested text not null check (char_length(btrim(why_suggested)) between 1 and 500),
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'verified', 'rejected')),
  reviewed_by_user_id uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  unique (revision_id, url),
  check ((reviewed_by_user_id is null) = (reviewed_at is null))
);

create table if not exists public.relationship_gist_specialist_assignments (
  user_id uuid not null references auth.users(id) on delete cascade,
  review_type text not null check (review_type in (
    'safeguarding', 'mental_health', 'faith', 'medical', 'cultural'
  )),
  active boolean not null default true,
  assigned_by_user_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc'::text, now()),
  primary key (user_id, review_type)
);

create table if not exists public.relationship_gist_specialist_reviews (
  revision_id uuid not null references public.relationship_gist_revisions(id) on delete restrict,
  review_type text not null check (review_type in (
    'safeguarding', 'mental_health', 'faith', 'medical', 'cultural'
  )),
  approved_by_user_id uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  note text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  primary key (revision_id, review_type),
  check ((approved_by_user_id is null) = (approved_at is null))
);

alter table public.relationship_gist_ai_environment_policies enable row level security;
alter table public.relationship_gist_ai_topic_calendar enable row level security;
alter table public.relationship_gist_ai_generation_jobs enable row level security;
alter table public.relationship_gist_ai_job_events enable row level security;
alter table public.relationship_gist_ai_draft_metadata enable row level security;
alter table public.relationship_gist_ai_source_suggestions enable row level security;
alter table public.relationship_gist_specialist_assignments enable row level security;
alter table public.relationship_gist_specialist_reviews enable row level security;

revoke all on table public.relationship_gist_ai_environment_policies from public, anon, authenticated;
revoke all on table public.relationship_gist_ai_topic_calendar from public, anon, authenticated;
revoke all on table public.relationship_gist_ai_generation_jobs from public, anon, authenticated;
revoke all on table public.relationship_gist_ai_job_events from public, anon, authenticated;
revoke all on table public.relationship_gist_ai_draft_metadata from public, anon, authenticated;
revoke all on table public.relationship_gist_ai_source_suggestions from public, anon, authenticated;
revoke all on table public.relationship_gist_specialist_assignments from public, anon, authenticated;
revoke all on table public.relationship_gist_specialist_reviews from public, anon, authenticated;

grant all on table public.relationship_gist_ai_environment_policies to service_role;
grant all on table public.relationship_gist_ai_topic_calendar to service_role;
grant all on table public.relationship_gist_ai_generation_jobs to service_role;
grant all on table public.relationship_gist_ai_job_events to service_role;
grant all on table public.relationship_gist_ai_draft_metadata to service_role;
grant all on table public.relationship_gist_ai_source_suggestions to service_role;
grant all on table public.relationship_gist_specialist_assignments to service_role;
grant all on table public.relationship_gist_specialist_reviews to service_role;

create or replace function public.relationship_gist_ai_reject_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  raise exception 'relationship_gist_ai_event_immutable' using errcode = '55000';
end;
$$;

drop trigger if exists relationship_gist_ai_job_events_immutable_guard
  on public.relationship_gist_ai_job_events;
create trigger relationship_gist_ai_job_events_immutable_guard
before update or delete on public.relationship_gist_ai_job_events
for each row execute function public.relationship_gist_ai_reject_event_mutation();

revoke all on function public.relationship_gist_ai_reject_event_mutation()
  from public, anon, authenticated;

create or replace function public.relationship_gist_ai_record_event(
  p_job_id uuid,
  p_actor_user_id uuid,
  p_event_type text,
  p_from_status text,
  p_to_status text,
  p_failure_code text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
volatile
security definer
set search_path = public, pg_catalog
as $$
  insert into public.relationship_gist_ai_job_events (
    job_id, environment, actor_user_id, event_type, from_status, to_status,
    failure_code, metadata
  )
  select job.id, job.environment, p_actor_user_id, p_event_type, p_from_status,
    p_to_status, p_failure_code, coalesce(p_metadata, '{}'::jsonb)
  from public.relationship_gist_ai_generation_jobs job
  where job.id = p_job_id;
$$;

revoke all on function public.relationship_gist_ai_record_event(
  uuid, uuid, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.relationship_gist_ai_record_event(
  uuid, uuid, text, text, text, text, jsonb
) to service_role;

create or replace function public.relationship_gist_ai_normalize_topic(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select left(regexp_replace(lower(btrim(coalesce(p_value, ''))), '[^a-z0-9]+', ' ', 'g'), 200);
$$;

revoke all on function public.relationship_gist_ai_normalize_topic(text)
  from public, anon, authenticated;

create or replace function public.relationship_gist_ai_similarity(p_left text, p_right text)
returns real
language plpgsql
stable
set search_path = public, extensions, pg_catalog
as $$
declare
  v_result real;
begin
  if to_regprocedure('extensions.similarity(text,text)') is not null then
    execute 'select extensions.similarity($1, $2)' into v_result using p_left, p_right;
  else
    execute 'select public.similarity($1, $2)' into v_result using p_left, p_right;
  end if;
  return v_result;
end;
$$;

revoke all on function public.relationship_gist_ai_similarity(text,text)
  from public, anon, authenticated;

create or replace function public.rpc_get_relationship_gist_ai_studio()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_environment text;
begin
  if v_actor is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.has_relationship_gist_editorial_capability('read', v_actor) then
    raise exception 'editorial_read_forbidden' using errcode = '42501';
  end if;
  select policy.environment into v_environment
  from public.relationship_gist_ai_environment_policies policy
  where policy.is_current = true;
  return jsonb_build_object(
    'environment', v_environment,
    'enabled', coalesce((select enabled from public.relationship_gist_ai_environment_policies where environment = v_environment), false),
    'topics', coalesce((
      select jsonb_agg(to_jsonb(topic) order by topic.planned_for, topic.created_at)
      from public.relationship_gist_ai_topic_calendar topic
      where topic.environment = v_environment
    ), '[]'::jsonb),
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', job.id,
        'topic_id', job.topic_id,
        'status', job.status,
        'model', job.model,
        'attempt_count', job.attempt_count,
        'input_tokens', job.input_tokens,
        'output_tokens', job.output_tokens,
        'estimated_cost_microusd', job.estimated_cost_microusd,
        'cost_estimate_status', job.cost_estimate_status,
        'generated_revision_id', job.generated_revision_id,
        'failure_code', job.failure_code,
        'retryable', job.retryable,
        'created_at', job.created_at
      ) order by job.created_at desc)
      from public.relationship_gist_ai_generation_jobs job
      where job.environment = v_environment
      limit 100
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.rpc_get_relationship_gist_ai_review_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.has_relationship_gist_editorial_capability('read', v_actor) then
    raise exception 'editorial_read_forbidden' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'revision_id', revision.id,
      'edition_id', revision.edition_id,
      'revision_number', revision.revision_number,
      'status', revision.status,
      'title', variant.title,
      'summary', variant.short_body,
      'body', variant.body,
      'perspective', variant.perspective,
      'takeaway', metadata.takeaway,
      'discussion_prompt', metadata.discussion_prompt,
      'safety_level', metadata.safety_level,
      'sensitive_topics', metadata.sensitive_topics,
      'safety_rationale', metadata.safety_rationale,
      'human_edited', metadata.human_edited,
      'claims_verified_at', metadata.claims_verified_at,
      'sources', coalesce((
        select jsonb_agg(to_jsonb(source) order by source.created_at)
        from public.relationship_gist_ai_source_suggestions source
        where source.revision_id = revision.id
      ), '[]'::jsonb),
      'specialist_reviews', coalesce((
        select jsonb_agg(to_jsonb(review) order by review.review_type)
        from public.relationship_gist_specialist_reviews review
        where review.revision_id = revision.id
      ), '[]'::jsonb),
      'can_specialist_approve', exists (
        select 1 from public.relationship_gist_specialist_assignments assignment
        where assignment.user_id = v_actor and assignment.active = true
          and assignment.review_type in (
            select pending.review_type from public.relationship_gist_specialist_reviews pending
            where pending.revision_id = revision.id and pending.approved_at is null
          )
      ),
      'created_at', metadata.created_at
    ) order by metadata.created_at desc)
    from public.relationship_gist_ai_draft_metadata metadata
    join public.relationship_gist_revisions revision on revision.id = metadata.revision_id
    join public.relationship_gist_revision_variants variant
      on variant.revision_id = revision.id
     and variant.perspective = revision.primary_perspective
  ), '[]'::jsonb);
end;
$$;

create or replace function public.rpc_create_relationship_gist_ai_topic(
  p_topic_key text,
  p_topic_title text,
  p_topic_brief text,
  p_requested_perspective text,
  p_planned_for date
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_environment text;
  v_fingerprint text := public.relationship_gist_ai_normalize_topic(p_topic_title);
  v_topic public.relationship_gist_ai_topic_calendar%rowtype;
begin
  if v_actor is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.has_relationship_gist_editorial_capability('draft', v_actor) then
    raise exception 'editorial_draft_forbidden' using errcode = '42501';
  end if;
  select environment into v_environment
  from public.relationship_gist_ai_environment_policies where is_current = true and enabled = true;
  if v_environment is null then raise exception 'gist_ai_disabled' using errcode = '55000'; end if;
  if lower(btrim(coalesce(p_requested_perspective, ''))) not in (
    'general','christian','muslim','culture','safety','communication'
  ) then raise exception 'gist_perspective_invalid'; end if;
  if v_fingerprint = '' or exists (
    select 1 from public.relationship_gist_ai_topic_calendar topic
    where topic.environment = v_environment
      and topic.status <> 'cancelled'
      and (
        topic.topic_fingerprint = v_fingerprint
        or public.relationship_gist_ai_similarity(topic.topic_fingerprint, v_fingerprint) >= 0.72
      )
  ) then raise exception 'gist_ai_topic_duplicate' using errcode = '23505'; end if;
  insert into public.relationship_gist_ai_topic_calendar (
    environment, topic_key, topic_title, topic_fingerprint, topic_brief,
    requested_perspective, planned_for, created_by_user_id
  ) values (
    v_environment, lower(btrim(p_topic_key)), btrim(p_topic_title), v_fingerprint,
    btrim(p_topic_brief), lower(btrim(p_requested_perspective)), p_planned_for, v_actor
  ) returning * into v_topic;
  return to_jsonb(v_topic);
end;
$$;

create or replace function public.rpc_approve_relationship_gist_ai_topic(p_topic_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_topic public.relationship_gist_ai_topic_calendar%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if v_actor is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.has_relationship_gist_editorial_capability('quality_approve', v_actor) then
    raise exception 'editorial_quality_approve_forbidden' using errcode = '42501';
  end if;
  select * into v_topic from public.relationship_gist_ai_topic_calendar
  where id = p_topic_id for update;
  if v_topic.id is null then raise exception 'gist_ai_topic_not_found'; end if;
  if v_topic.status <> 'draft' then raise exception 'gist_ai_topic_not_draft'; end if;
  if v_topic.created_by_user_id = v_actor then
    raise exception 'gist_ai_topic_self_approval_forbidden' using errcode = '42501';
  end if;
  update public.relationship_gist_ai_topic_calendar
  set status = 'approved', approved_by_user_id = v_actor, approved_at = v_now, updated_at = v_now
  where id = v_topic.id;
  return jsonb_build_object('topic_id', v_topic.id, 'status', 'approved', 'approved_at', v_now);
end;
$$;

create or replace function public.rpc_request_relationship_gist_ai_generation(
  p_topic_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_policy public.relationship_gist_ai_environment_policies%rowtype;
  v_topic public.relationship_gist_ai_topic_calendar%rowtype;
  v_job public.relationship_gist_ai_generation_jobs%rowtype;
  v_today timestamptz := date_trunc('day', timezone('utc'::text, now()));
  v_jobs integer;
  v_tokens bigint;
begin
  if v_actor is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.has_relationship_gist_editorial_capability('draft', v_actor) then
    raise exception 'editorial_draft_forbidden' using errcode = '42501';
  end if;
  select * into v_policy from public.relationship_gist_ai_environment_policies
  where is_current = true for update;
  if v_policy.environment is null or not v_policy.enabled then
    raise exception 'gist_ai_disabled' using errcode = '55000';
  end if;
  select * into v_topic from public.relationship_gist_ai_topic_calendar
  where id = p_topic_id and environment = v_policy.environment for update;
  if v_topic.id is null then raise exception 'gist_ai_topic_not_found'; end if;
  if v_topic.status <> 'approved' then raise exception 'gist_ai_topic_not_approved'; end if;
  select * into v_job from public.relationship_gist_ai_generation_jobs
  where environment = v_policy.environment
    and requested_by_user_id = v_actor
    and idempotency_key = p_idempotency_key;
  if v_job.id is not null then return to_jsonb(v_job); end if;
  select count(*), coalesce(sum(coalesce(input_tokens, 0) + coalesce(output_tokens, 0)), 0)
  into v_jobs, v_tokens
  from public.relationship_gist_ai_generation_jobs
  where environment = v_policy.environment and created_at >= v_today
    and status not in ('failed', 'rejected_unsafe', 'rejected_duplicate', 'budget_exceeded');
  if v_jobs >= v_policy.daily_job_budget
    or v_tokens + v_policy.max_output_tokens > v_policy.daily_token_budget then
    insert into public.relationship_gist_ai_generation_jobs (
      environment, topic_id, requested_by_user_id, idempotency_key, status,
      schema_version, prompt_version, provider, model, failure_code, failed_at
    ) values (
      v_policy.environment, v_topic.id, v_actor, p_idempotency_key, 'budget_exceeded',
      'relationship_gist_ai_draft_v1', 'relationship_gist_editorial_prompt_v1',
      v_policy.provider, v_policy.model, 'daily_budget_exceeded', timezone('utc'::text, now())
    ) returning * into v_job;
    perform public.relationship_gist_ai_record_event(
      v_job.id, v_actor, 'budget_exceeded', null, 'budget_exceeded',
      'daily_budget_exceeded', '{}'::jsonb
    );
    return to_jsonb(v_job);
  end if;
  insert into public.relationship_gist_ai_generation_jobs (
    environment, topic_id, requested_by_user_id, idempotency_key, schema_version,
    prompt_version, provider, model
  ) values (
    v_policy.environment, v_topic.id, v_actor, p_idempotency_key,
    'relationship_gist_ai_draft_v1', 'relationship_gist_editorial_prompt_v1',
    v_policy.provider, v_policy.model
  ) returning * into v_job;
  perform public.relationship_gist_ai_record_event(
    v_job.id, v_actor, 'queued', null, 'queued', null,
    jsonb_build_object('topic_id', v_topic.id)
  );
  return to_jsonb(v_job);
end;
$$;

create or replace function public.rpc_service_claim_relationship_gist_ai_job(
  p_job_id uuid,
  p_environment text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_job public.relationship_gist_ai_generation_jobs%rowtype;
  v_policy public.relationship_gist_ai_environment_policies%rowtype;
  v_topic public.relationship_gist_ai_topic_calendar%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  select * into v_policy from public.relationship_gist_ai_environment_policies
  where environment = p_environment and is_current = true and enabled = true;
  if v_policy.environment is null then raise exception 'gist_ai_environment_mismatch' using errcode = '42501'; end if;
  select * into v_job from public.relationship_gist_ai_generation_jobs
  where id = p_job_id and environment = p_environment for update;
  if v_job.id is null then raise exception 'gist_ai_job_not_found'; end if;
  if v_job.status = 'processing' and v_job.claimed_at > v_now - interval '5 minutes' then
    raise exception 'gist_ai_job_already_claimed' using errcode = '55000';
  end if;
  if v_job.status not in ('queued', 'processing') or v_job.attempt_count >= v_policy.max_attempts then
    raise exception 'gist_ai_job_not_claimable' using errcode = '55000';
  end if;
  select * into v_topic from public.relationship_gist_ai_topic_calendar where id = v_job.topic_id;
  update public.relationship_gist_ai_generation_jobs
  set status = 'processing', attempt_count = attempt_count + 1,
      claimed_at = v_now, updated_at = v_now, failure_code = null, retryable = false
  where id = v_job.id;
  perform public.relationship_gist_ai_record_event(
    v_job.id, null, 'claimed', v_job.status, 'processing', null,
    jsonb_build_object('attempt', v_job.attempt_count + 1)
  );
  return jsonb_build_object(
    'job_id', v_job.id,
    'environment', v_job.environment,
    'topic_title', v_topic.topic_title,
    'topic_brief', v_topic.topic_brief,
    'perspective', v_topic.requested_perspective,
    'model', v_policy.model,
    'max_output_tokens', v_policy.max_output_tokens,
    'max_attempts', v_policy.max_attempts,
    'input_microusd_per_million', v_policy.input_microusd_per_million,
    'cached_input_microusd_per_million', v_policy.cached_input_microusd_per_million,
    'output_microusd_per_million', v_policy.output_microusd_per_million
  );
end;
$$;

create or replace function public.rpc_service_complete_relationship_gist_ai_job(
  p_job_id uuid,
  p_environment text,
  p_output jsonb,
  p_provider_request_id text,
  p_input_tokens integer,
  p_cached_input_tokens integer,
  p_output_tokens integer,
  p_estimated_cost_microusd bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  v_job public.relationship_gist_ai_generation_jobs%rowtype;
  v_topic public.relationship_gist_ai_topic_calendar%rowtype;
  v_profile uuid;
  v_legacy public.relationship_gists%rowtype;
  v_revision public.relationship_gist_revisions%rowtype;
  v_source jsonb;
  v_review text;
  v_now timestamptz := timezone('utc'::text, now());
  v_body text;
  v_sensitive boolean;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  select * into v_job from public.relationship_gist_ai_generation_jobs
  where id = p_job_id and environment = p_environment for update;
  if v_job.id is null then raise exception 'gist_ai_job_not_found'; end if;
  if v_job.status <> 'processing' then raise exception 'gist_ai_job_not_processing'; end if;
  if not exists (
    select 1 from public.relationship_gist_ai_environment_policies policy
    where policy.environment = p_environment and policy.is_current = true and policy.enabled = true
  ) then raise exception 'gist_ai_environment_mismatch' using errcode = '42501'; end if;
  select * into v_topic from public.relationship_gist_ai_topic_calendar where id = v_job.topic_id;
  if p_output ->> 'schema_version' <> 'relationship_gist_ai_draft_v1'
    or jsonb_typeof(p_output -> 'suggested_sources') <> 'array'
    or jsonb_array_length(p_output -> 'suggested_sources') > 8
    or jsonb_typeof(p_output -> 'safety') <> 'object'
    or p_output ->> 'perspective' not in ('general','christian','muslim','culture','safety','communication')
    or p_output ->> 'perspective' <> v_topic.requested_perspective
    or char_length(btrim(coalesce(p_output ->> 'title', ''))) not between 3 and 140
    or char_length(btrim(coalesce(p_output ->> 'summary', ''))) not between 1 and 420
    or char_length(btrim(coalesce(p_output ->> 'body', ''))) not between 20 and 5000
    or char_length(btrim(coalesce(p_output ->> 'takeaway', ''))) not between 1 and 500
    or char_length(btrim(coalesce(p_output ->> 'discussion_prompt', ''))) not between 1 and 500 then
    raise exception 'gist_ai_output_invalid';
  end if;
  if (select count(*) from jsonb_object_keys(p_output)) <> 9
    or exists (
      select 1 from jsonb_object_keys(p_output) key
      where key not in (
        'schema_version','title','summary','body','takeaway','perspective',
        'discussion_prompt','suggested_sources','safety'
      )
    ) then raise exception 'gist_ai_output_shape_invalid'; end if;
  if jsonb_typeof(p_output -> 'safety' -> 'topics') <> 'array'
    or jsonb_typeof(p_output -> 'safety' -> 'specialist_reviews') <> 'array'
    or jsonb_typeof(p_output -> 'safety' -> 'requires_safety_review') <> 'boolean'
    or (select count(*) from jsonb_object_keys(p_output -> 'safety')) <> 5
    or exists (
      select 1 from jsonb_object_keys(p_output -> 'safety') key
      where key not in ('level','topics','requires_safety_review','specialist_reviews','rationale')
    ) then raise exception 'gist_ai_safety_shape_invalid'; end if;
  if p_output -> 'safety' ->> 'level' not in ('low','sensitive','high_risk')
    or char_length(btrim(coalesce(p_output -> 'safety' ->> 'rationale', ''))) not between 1 and 500
    or exists (
      select 1 from jsonb_array_elements_text(p_output -> 'safety' -> 'topics') topic
      where topic not in ('abuse','coercion','mental_health','faith','medical','cultural_claims')
    )
    or exists (
      select 1 from jsonb_array_elements_text(p_output -> 'safety' -> 'specialist_reviews') review
      where review not in ('none','safeguarding','mental_health','faith','medical','cultural')
    )
    or (select count(*) from jsonb_array_elements_text(p_output -> 'safety' -> 'topics'))
      <> (select count(distinct topic) from jsonb_array_elements_text(p_output -> 'safety' -> 'topics') topic)
    or (select count(*) from jsonb_array_elements_text(p_output -> 'safety' -> 'specialist_reviews'))
      <> (select count(distinct review) from jsonb_array_elements_text(p_output -> 'safety' -> 'specialist_reviews') review)
    then raise exception 'gist_ai_safety_classification_invalid'; end if;
  v_sensitive := (p_output -> 'safety' ->> 'level') <> 'low'
    or jsonb_array_length(p_output -> 'safety' -> 'topics') > 0;
  if (v_sensitive and coalesce((p_output -> 'safety' ->> 'requires_safety_review')::boolean, false) is not true)
    or (v_sensitive and (p_output -> 'safety' -> 'specialist_reviews') ? 'none')
    or (not v_sensitive and p_output -> 'safety' -> 'specialist_reviews' <> '["none"]'::jsonb)
    or exists (
      select 1
      from (values
        ('abuse','safeguarding'), ('coercion','safeguarding'),
        ('mental_health','mental_health'), ('faith','faith'),
        ('medical','medical'), ('cultural_claims','cultural')
      ) as required(topic, review)
      where (p_output -> 'safety' -> 'topics') ? required.topic
        and not ((p_output -> 'safety' -> 'specialist_reviews') ? required.review)
    ) then raise exception 'gist_ai_specialist_review_invalid'; end if;
  if exists (
    select 1 from public.relationship_gist_revision_variants variant
    where public.relationship_gist_ai_similarity(lower(variant.title), lower(p_output ->> 'title')) >= 0.72
      or public.relationship_gist_ai_similarity(left(lower(variant.body), 1000), left(lower(p_output ->> 'body'), 1000)) >= 0.82
  ) then
    update public.relationship_gist_ai_generation_jobs
    set status = 'rejected_duplicate', failure_code = 'duplicate_content', retryable = false,
        provider_request_id = left(p_provider_request_id, 255),
        input_tokens = greatest(0, p_input_tokens),
        cached_input_tokens = greatest(0, p_cached_input_tokens),
        output_tokens = greatest(0, p_output_tokens),
        estimated_cost_microusd = case when p_estimated_cost_microusd is null
          then null else greatest(0, p_estimated_cost_microusd) end,
        cost_estimate_status = case when p_estimated_cost_microusd is null then 'unconfigured' else 'configured' end,
        failed_at = v_now, updated_at = v_now
    where id = v_job.id;
    perform public.relationship_gist_ai_record_event(
      v_job.id, null, 'duplicate_rejected', 'processing', 'rejected_duplicate',
      'duplicate_content', '{}'::jsonb
    );
    return jsonb_build_object('job_id', v_job.id, 'status', 'rejected_duplicate');
  end if;
  select profile.id into v_profile from public.profiles profile
  where profile.user_id = v_job.requested_by_user_id and profile.deleted_at is null
  order by profile.created_at limit 1;
  if v_profile is null then raise exception 'profile_not_found'; end if;
  v_body := btrim(p_output ->> 'body') || E'\n\nTakeaway: ' || btrim(p_output ->> 'takeaway');
  insert into public.relationship_gists (
    circle_id, title, short_body, body, perspective, status,
    created_by_profile_id, created_by_admin_id
  ) values (
    null, btrim(p_output ->> 'title'), btrim(p_output ->> 'summary'), v_body,
    p_output ->> 'perspective', 'draft', v_profile, v_job.requested_by_user_id
  ) returning * into v_legacy;
  insert into public.relationship_gist_editions (
    id, legacy_gist_id, lifecycle_status, created_at, updated_at
  ) values (v_legacy.id, v_legacy.id, 'draft', v_now, v_now);
  insert into public.relationship_gist_revisions (
    edition_id, revision_number, status, primary_perspective,
    requires_safety_review, authored_by_user_id, created_at, updated_at
  ) values (
    v_legacy.id, 1, 'draft', p_output ->> 'perspective',
    v_sensitive, v_job.requested_by_user_id, v_now, v_now
  ) returning * into v_revision;
  insert into public.relationship_gist_revision_variants (
    revision_id, perspective, title, short_body, body, created_at
  ) values (
    v_revision.id, p_output ->> 'perspective', btrim(p_output ->> 'title'),
    btrim(p_output ->> 'summary'), v_body, v_now
  );
  update public.relationship_gist_editions
  set current_revision_id = v_revision.id, lock_version = 1, updated_at = v_now
  where id = v_legacy.id;
  insert into public.relationship_gist_ai_draft_metadata (
    revision_id, generation_job_id, schema_version, prompt_version, provider, model,
    takeaway, discussion_prompt, safety_level, sensitive_topics, safety_rationale
  ) values (
    v_revision.id, v_job.id, v_job.schema_version, v_job.prompt_version, v_job.provider,
    v_job.model, btrim(p_output ->> 'takeaway'), btrim(p_output ->> 'discussion_prompt'),
    p_output -> 'safety' ->> 'level',
    array(select jsonb_array_elements_text(coalesce(p_output -> 'safety' -> 'topics', '[]'::jsonb))),
    btrim(p_output -> 'safety' ->> 'rationale')
  );
  for v_source in select value from jsonb_array_elements(p_output -> 'suggested_sources') loop
    if (select count(*) from jsonb_object_keys(v_source)) <> 4
      or exists (
        select 1 from jsonb_object_keys(v_source) key
        where key not in ('title','url','publisher','why_suggested')
      )
      or char_length(btrim(coalesce(v_source ->> 'title', ''))) not between 1 and 240
      or coalesce(v_source ->> 'url', '') !~ '^https://[^[:space:]]+$'
      or char_length(btrim(coalesce(v_source ->> 'publisher', ''))) not between 1 and 200
      or char_length(btrim(coalesce(v_source ->> 'why_suggested', ''))) not between 1 and 500 then
      raise exception 'gist_ai_source_invalid';
    end if;
    insert into public.relationship_gist_ai_source_suggestions (
      revision_id, title, url, publisher, why_suggested
    ) values (
      v_revision.id, btrim(v_source ->> 'title'), v_source ->> 'url',
      btrim(v_source ->> 'publisher'), btrim(v_source ->> 'why_suggested')
    );
  end loop;
  for v_review in select jsonb_array_elements_text(
    coalesce(p_output -> 'safety' -> 'specialist_reviews', '[]'::jsonb)
  ) loop
    if v_review <> 'none' then
      insert into public.relationship_gist_specialist_reviews (revision_id, review_type)
      values (v_revision.id, v_review);
    end if;
  end loop;
  update public.relationship_gist_ai_generation_jobs
  set status = 'completed', provider_request_id = left(p_provider_request_id, 255),
      input_tokens = greatest(0, p_input_tokens),
      cached_input_tokens = greatest(0, p_cached_input_tokens),
      output_tokens = greatest(0, p_output_tokens),
      estimated_cost_microusd = case when p_estimated_cost_microusd is null
        then null else greatest(0, p_estimated_cost_microusd) end,
      cost_estimate_status = case when p_estimated_cost_microusd is null then 'unconfigured' else 'configured' end,
      generated_revision_id = v_revision.id, completed_at = v_now, updated_at = v_now,
      retryable = false
  where id = v_job.id;
  update public.relationship_gist_ai_topic_calendar
  set status = 'consumed', consumed_at = v_now, updated_at = v_now
  where id = v_topic.id;
  perform public.relationship_gist_ai_record_event(
    v_job.id, null, 'draft_created', 'processing', 'completed', null,
    jsonb_build_object('revision_id', v_revision.id)
  );
  perform public.relationship_gist_v2_record_audit(
    v_revision.edition_id, v_revision.id, v_job.requested_by_user_id,
    'ai_draft_created', null, 'draft', null,
    jsonb_build_object('generation_job_id', v_job.id, 'human_review_required', true)
  );
  return jsonb_build_object(
    'job_id', v_job.id, 'status', 'completed', 'revision_id', v_revision.id,
    'legacy_gist_id', v_legacy.id
  );
end;
$$;

create or replace function public.rpc_service_fail_relationship_gist_ai_job(
  p_job_id uuid,
  p_environment text,
  p_status text,
  p_failure_code text,
  p_retryable boolean,
  p_provider_request_id text default null,
  p_input_tokens integer default null,
  p_cached_input_tokens integer default null,
  p_output_tokens integer default null,
  p_estimated_cost_microusd bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_job public.relationship_gist_ai_generation_jobs%rowtype;
  v_to text;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  if p_status not in ('failed', 'rejected_unsafe', 'rejected_duplicate', 'budget_exceeded') then
    raise exception 'gist_ai_failure_status_invalid';
  end if;
  select * into v_job from public.relationship_gist_ai_generation_jobs
  where id = p_job_id and environment = p_environment for update;
  if v_job.id is null then raise exception 'gist_ai_job_not_found'; end if;
  if v_job.status <> 'processing' then raise exception 'gist_ai_job_not_processing'; end if;
  v_to := case
    when p_retryable and v_job.attempt_count < (
      select max_attempts from public.relationship_gist_ai_environment_policies
      where environment = p_environment and is_current = true
    ) then 'queued'
    else p_status
  end;
  update public.relationship_gist_ai_generation_jobs
  set status = v_to, failure_code = left(btrim(p_failure_code), 120),
      retryable = v_to = 'queued', provider_request_id = left(p_provider_request_id, 255),
      input_tokens = case when p_input_tokens is null then input_tokens else greatest(0, p_input_tokens) end,
      cached_input_tokens = case when p_cached_input_tokens is null then cached_input_tokens else greatest(0, p_cached_input_tokens) end,
      output_tokens = case when p_output_tokens is null then output_tokens else greatest(0, p_output_tokens) end,
      estimated_cost_microusd = case when p_estimated_cost_microusd is null
        then estimated_cost_microusd else greatest(0, p_estimated_cost_microusd) end,
      cost_estimate_status = case when p_estimated_cost_microusd is null
        then cost_estimate_status else 'configured' end,
      failed_at = case when v_to = 'queued' then null else v_now end,
      claimed_at = case when v_to = 'queued' then null else claimed_at end,
      updated_at = v_now
  where id = v_job.id;
  perform public.relationship_gist_ai_record_event(
    v_job.id, null, case when v_to = 'queued' then 'retry_queued' else 'failed' end,
    v_job.status, v_to, p_failure_code, jsonb_build_object('retryable', v_to = 'queued')
  );
  return jsonb_build_object('job_id', v_job.id, 'status', v_to, 'retryable', v_to = 'queued');
end;
$$;

create or replace function public.relationship_gist_ai_clone_provenance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.source_revision_id is null then return new; end if;
  insert into public.relationship_gist_ai_draft_metadata (
    revision_id, generation_job_id, schema_version, prompt_version, provider, model,
    takeaway, discussion_prompt, safety_level, sensitive_topics, safety_rationale, human_edited
  )
  select new.id, source.generation_job_id, source.schema_version, source.prompt_version,
    source.provider, source.model, source.takeaway, source.discussion_prompt,
    source.safety_level, source.sensitive_topics, source.safety_rationale, true
  from public.relationship_gist_ai_draft_metadata source
  where source.revision_id = new.source_revision_id;
  if found then
    insert into public.relationship_gist_ai_source_suggestions (
      revision_id, title, url, publisher, why_suggested
    )
    select new.id, title, url, publisher, why_suggested
    from public.relationship_gist_ai_source_suggestions
    where revision_id = new.source_revision_id;
    insert into public.relationship_gist_specialist_reviews (revision_id, review_type)
    select new.id, review_type from public.relationship_gist_specialist_reviews
    where revision_id = new.source_revision_id;
  end if;
  return new;
end;
$$;

drop trigger if exists relationship_gist_ai_clone_provenance_trigger
  on public.relationship_gist_revisions;
create trigger relationship_gist_ai_clone_provenance_trigger
after insert on public.relationship_gist_revisions
for each row execute function public.relationship_gist_ai_clone_provenance();

create or replace function public.relationship_gist_ai_enforce_review_gate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not exists (
    select 1 from public.relationship_gist_ai_draft_metadata metadata
    where metadata.revision_id = new.id
  ) then return new; end if;
  if new.quality_approved_at is not null and old.quality_approved_at is null then
    if exists (
      select 1 from public.relationship_gist_ai_draft_metadata metadata
      where metadata.revision_id = new.id and metadata.claims_verified_at is null
    ) then raise exception 'gist_ai_claims_verification_required'; end if;
    if exists (
      select 1 from public.relationship_gist_ai_source_suggestions source
      where source.revision_id = new.id and source.verification_status = 'unverified'
    ) then raise exception 'gist_ai_source_review_required'; end if;
  end if;
  if new.status in ('approved', 'scheduled', 'published') and exists (
    select 1 from public.relationship_gist_specialist_reviews review
    where review.revision_id = new.id and review.approved_at is null
  ) then raise exception 'gist_ai_specialist_review_required'; end if;
  return new;
end;
$$;

drop trigger if exists relationship_gist_ai_review_gate_trigger
  on public.relationship_gist_revisions;
create trigger relationship_gist_ai_review_gate_trigger
before update on public.relationship_gist_revisions
for each row execute function public.relationship_gist_ai_enforce_review_gate();

create or replace function public.rpc_attest_relationship_gist_ai_claims(
  p_revision_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_revision public.relationship_gist_revisions%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if v_actor is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.has_relationship_gist_editorial_capability('quality_approve', v_actor) then
    raise exception 'editorial_quality_approve_forbidden' using errcode = '42501'; end if;
  select * into v_revision from public.relationship_gist_revisions where id = p_revision_id;
  if v_revision.id is null then raise exception 'gist_revision_not_found'; end if;
  if v_revision.status not in ('draft', 'in_review') then raise exception 'gist_revision_immutable'; end if;
  if v_revision.authored_by_user_id = v_actor then raise exception 'gist_self_approval_forbidden' using errcode = '42501'; end if;
  update public.relationship_gist_ai_draft_metadata
  set claims_verified_by_user_id = v_actor, claims_verified_at = v_now
  where revision_id = v_revision.id;
  if not found then raise exception 'gist_ai_metadata_not_found'; end if;
  return jsonb_build_object('revision_id', v_revision.id, 'claims_verified_at', v_now);
end;
$$;

create or replace function public.rpc_review_relationship_gist_ai_source(
  p_source_id uuid,
  p_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_source public.relationship_gist_ai_source_suggestions%rowtype;
  v_revision public.relationship_gist_revisions%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if v_actor is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.has_relationship_gist_editorial_capability('quality_approve', v_actor) then
    raise exception 'editorial_quality_approve_forbidden' using errcode = '42501'; end if;
  if p_status not in ('verified', 'rejected') then raise exception 'gist_ai_source_status_invalid'; end if;
  select * into v_source from public.relationship_gist_ai_source_suggestions where id = p_source_id for update;
  if v_source.id is null then raise exception 'gist_ai_source_not_found'; end if;
  select * into v_revision from public.relationship_gist_revisions where id = v_source.revision_id;
  if v_revision.authored_by_user_id = v_actor then raise exception 'gist_self_approval_forbidden' using errcode = '42501'; end if;
  update public.relationship_gist_ai_source_suggestions
  set verification_status = p_status, reviewed_by_user_id = v_actor,
      reviewed_at = v_now, review_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = v_source.id;
  return jsonb_build_object('source_id', v_source.id, 'status', p_status, 'reviewed_at', v_now);
end;
$$;

create or replace function public.rpc_approve_relationship_gist_specialist_review(
  p_revision_id uuid,
  p_review_type text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_revision public.relationship_gist_revisions%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if v_actor is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.relationship_gist_specialist_assignments assignment
    join public.internal_admins admin on admin.user_id = assignment.user_id
    where assignment.user_id = v_actor and assignment.review_type = p_review_type
      and assignment.active = true
      and admin.role in ('moderation', 'super_admin')
  ) then raise exception 'gist_specialist_review_forbidden' using errcode = '42501'; end if;
  select * into v_revision from public.relationship_gist_revisions where id = p_revision_id;
  if v_revision.id is null then raise exception 'gist_revision_not_found'; end if;
  if v_actor = v_revision.authored_by_user_id
    or v_actor = v_revision.quality_approved_by_user_id
    or v_actor = v_revision.safety_approved_by_user_id then
    raise exception 'gist_separation_of_duties_required' using errcode = '42501';
  end if;
  update public.relationship_gist_specialist_reviews
  set approved_by_user_id = v_actor, approved_at = v_now,
      note = nullif(btrim(coalesce(p_note, '')), '')
  where revision_id = p_revision_id and review_type = p_review_type and approved_at is null;
  if not found then raise exception 'gist_specialist_review_not_pending'; end if;
  return jsonb_build_object('revision_id', p_revision_id, 'review_type', p_review_type, 'approved_at', v_now);
end;
$$;

create or replace function public.rpc_reject_relationship_gist_ai_draft(
  p_revision_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_revision public.relationship_gist_revisions%rowtype;
  v_job uuid;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if v_actor is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.has_relationship_gist_editorial_capability('archive', v_actor) then
    raise exception 'editorial_archive_forbidden' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'gist_ai_rejection_reason_required'; end if;
  select revision.* into v_revision
  from public.relationship_gist_revisions revision
  join public.relationship_gist_ai_draft_metadata metadata on metadata.revision_id = revision.id
  where revision.id = p_revision_id for update of revision;
  if v_revision.id is null then raise exception 'gist_ai_draft_not_found'; end if;
  select metadata.generation_job_id into v_job
  from public.relationship_gist_ai_draft_metadata metadata
  where metadata.revision_id = v_revision.id;
  if v_revision.status not in ('draft', 'in_review') then raise exception 'gist_transition_not_allowed'; end if;
  update public.relationship_gist_revisions
  set status = 'archived', archived_at = v_now, transition_reason = btrim(p_reason), updated_at = v_now
  where id = v_revision.id;
  update public.relationship_gist_ai_generation_jobs
  set status = 'rejected_by_editor', failure_code = 'editor_rejected', retryable = false, updated_at = v_now
  where id = v_job and generated_revision_id = v_revision.id;
  if found then
    perform public.relationship_gist_ai_record_event(
      v_job, v_actor, 'editor_rejected', 'completed', 'rejected_by_editor',
      'editor_rejected', '{}'::jsonb
    );
  end if;
  perform public.relationship_gist_v2_record_audit(
    v_revision.edition_id, v_revision.id, v_actor, 'ai_draft_rejected',
    v_revision.status, 'archived', p_reason, jsonb_build_object('generation_job_id', v_job)
  );
  return jsonb_build_object('revision_id', v_revision.id, 'status', 'archived');
end;
$$;

revoke all on function public.rpc_get_relationship_gist_ai_studio() from public, anon;
revoke all on function public.rpc_get_relationship_gist_ai_review_queue() from public, anon;
revoke all on function public.rpc_create_relationship_gist_ai_topic(text,text,text,text,date) from public, anon;
revoke all on function public.rpc_approve_relationship_gist_ai_topic(uuid) from public, anon;
revoke all on function public.rpc_request_relationship_gist_ai_generation(uuid,uuid) from public, anon;
revoke all on function public.rpc_attest_relationship_gist_ai_claims(uuid) from public, anon;
revoke all on function public.rpc_review_relationship_gist_ai_source(uuid,text,text) from public, anon;
revoke all on function public.rpc_approve_relationship_gist_specialist_review(uuid,text,text) from public, anon;
revoke all on function public.rpc_reject_relationship_gist_ai_draft(uuid,text) from public, anon;

grant execute on function public.rpc_get_relationship_gist_ai_studio() to authenticated;
grant execute on function public.rpc_get_relationship_gist_ai_review_queue() to authenticated;
grant execute on function public.rpc_create_relationship_gist_ai_topic(text,text,text,text,date) to authenticated;
grant execute on function public.rpc_approve_relationship_gist_ai_topic(uuid) to authenticated;
grant execute on function public.rpc_request_relationship_gist_ai_generation(uuid,uuid) to authenticated;
grant execute on function public.rpc_attest_relationship_gist_ai_claims(uuid) to authenticated;
grant execute on function public.rpc_review_relationship_gist_ai_source(uuid,text,text) to authenticated;
grant execute on function public.rpc_approve_relationship_gist_specialist_review(uuid,text,text) to authenticated;
grant execute on function public.rpc_reject_relationship_gist_ai_draft(uuid,text) to authenticated;

revoke all on function public.rpc_service_claim_relationship_gist_ai_job(uuid,text)
  from public, anon, authenticated;
revoke all on function public.rpc_service_complete_relationship_gist_ai_job(
  uuid,text,jsonb,text,integer,integer,integer,bigint
) from public, anon, authenticated;
revoke all on function public.rpc_service_fail_relationship_gist_ai_job(
  uuid,text,text,text,boolean,text,integer,integer,integer,bigint
) from public, anon, authenticated;

grant execute on function public.rpc_service_claim_relationship_gist_ai_job(uuid,text)
  to service_role;
grant execute on function public.rpc_service_complete_relationship_gist_ai_job(
  uuid,text,jsonb,text,integer,integer,integer,bigint
) to service_role;
grant execute on function public.rpc_service_fail_relationship_gist_ai_job(
  uuid,text,text,text,boolean,text,integer,integer,integer,bigint
) to service_role;

commit;
