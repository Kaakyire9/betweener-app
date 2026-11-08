-- Relationship Gist editorial cover images. Generation remains draft-only;
-- a separate human approval is required before an asset is reader-visible.
begin;

alter table public.relationship_gist_ai_environment_policies
  add column if not exists image_enabled boolean not null default false,
  add column if not exists image_model text not null default 'gpt-image-2.5-flare',
  add column if not exists image_quality text not null default 'low'
    check (image_quality in ('low', 'medium', 'high')),
  add column if not exists image_size text not null default '1536x1024'
    check (image_size in ('1024x1024', '1536x1024', '1024x1536')),
  add column if not exists daily_image_job_budget integer not null default 3
    check (daily_image_job_budget between 1 and 100),
  add column if not exists image_text_input_microusd_per_million bigint
    check (image_text_input_microusd_per_million >= 0),
  add column if not exists image_output_microusd_per_million bigint
    check (image_output_microusd_per_million >= 0);

-- Enable the tightly capped QA policy only when the database has already
-- proven it is the dedicated Betweener Staging project. Applying this
-- migration elsewhere leaves AI disabled and creates no environment policy.
do $$
begin
  if exists (
    select 1 from private.push_application_config config
    where config.id = true
      and config.app_environment = 'staging'
      and config.application_id = 'com.aduboffour.betweener.staging'
      and config.expo_project_id = '7f38a835-2da7-419b-a20b-e1a12e021547'::uuid
  ) then
    update public.relationship_gist_ai_environment_policies set is_current = false where is_current = true;
    insert into public.relationship_gist_ai_environment_policies(
      environment, is_current, enabled, provider, model,
      daily_job_budget, daily_token_budget, max_output_tokens, max_attempts,
      input_microusd_per_million, cached_input_microusd_per_million,
      output_microusd_per_million, image_enabled, image_model, image_quality,
      image_size, daily_image_job_budget, image_text_input_microusd_per_million,
      image_output_microusd_per_million, updated_at
    ) values (
      'staging', true, true, 'openai', 'gpt-6-luna',
      3, 30000, 3000, 2,
      100000, 10000, 500000,
      true, 'gpt-image-2.5-flare', 'low', '1536x1024', 3,
      5000000, 30000000, timezone('utc'::text, now())
    )
    on conflict(environment) do update set
      is_current = excluded.is_current,
      enabled = excluded.enabled,
      provider = excluded.provider,
      model = excluded.model,
      daily_job_budget = excluded.daily_job_budget,
      daily_token_budget = excluded.daily_token_budget,
      max_output_tokens = excluded.max_output_tokens,
      max_attempts = excluded.max_attempts,
      input_microusd_per_million = excluded.input_microusd_per_million,
      cached_input_microusd_per_million = excluded.cached_input_microusd_per_million,
      output_microusd_per_million = excluded.output_microusd_per_million,
      image_enabled = excluded.image_enabled,
      image_model = excluded.image_model,
      image_quality = excluded.image_quality,
      image_size = excluded.image_size,
      daily_image_job_budget = excluded.daily_image_job_budget,
      image_text_input_microusd_per_million = excluded.image_text_input_microusd_per_million,
      image_output_microusd_per_million = excluded.image_output_microusd_per_million,
      updated_at = excluded.updated_at;
  end if;
end;
$$;

create table if not exists public.relationship_gist_ai_image_jobs (
  id uuid primary key default gen_random_uuid(),
  environment text not null references public.relationship_gist_ai_environment_policies(environment) on delete restrict,
  revision_id uuid not null references public.relationship_gist_revisions(id) on delete restrict,
  perspective text not null check (perspective in (
    'general', 'christian', 'muslim', 'culture', 'safety', 'communication'
  )),
  requested_by_user_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key uuid not null,
  status text not null default 'queued' check (status in (
    'queued', 'processing', 'completed', 'failed', 'rejected_unsafe', 'budget_exceeded'
  )),
  provider text not null default 'openai' check (provider = 'openai'),
  model text not null,
  quality text not null check (quality in ('low', 'medium', 'high')),
  image_size text not null check (image_size in ('1024x1024', '1536x1024', '1024x1536')),
  prompt_version text not null default 'relationship_gist_cover_prompt_v1',
  attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  provider_request_id text,
  text_input_tokens integer check (text_input_tokens >= 0),
  image_output_tokens integer check (image_output_tokens >= 0),
  estimated_cost_microusd bigint check (estimated_cost_microusd >= 0),
  failure_code text,
  retryable boolean not null default false,
  claimed_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (environment, requested_by_user_id, idempotency_key)
);

create index if not exists relationship_gist_ai_image_jobs_queue_idx
  on public.relationship_gist_ai_image_jobs(environment, status, created_at);

create table if not exists public.relationship_gist_revision_images (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.relationship_gist_revisions(id) on delete restrict,
  perspective text not null check (perspective in (
    'general', 'christian', 'muslim', 'culture', 'safety', 'communication'
  )),
  generation_job_id uuid not null unique references public.relationship_gist_ai_image_jobs(id) on delete restrict,
  status text not null default 'generated' check (status in ('generated', 'approved', 'rejected', 'superseded')),
  storage_path text not null unique check (storage_path ~ '^[a-z0-9/_-]+[.]webp$'),
  mime_type text not null default 'image/webp' check (mime_type = 'image/webp'),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  alt_text text not null check (char_length(btrim(alt_text)) between 10 and 300),
  prompt text not null check (char_length(btrim(prompt)) between 20 and 4000),
  generated_by_user_id uuid not null references auth.users(id) on delete restrict,
  approved_by_user_id uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  rejected_by_user_id uuid references auth.users(id) on delete restrict,
  rejected_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  check ((approved_by_user_id is null) = (approved_at is null)),
  check ((rejected_by_user_id is null) = (rejected_at is null))
);

create unique index if not exists relationship_gist_revision_images_one_approved_idx
  on public.relationship_gist_revision_images(revision_id, perspective)
  where status = 'approved';

alter table public.relationship_gist_ai_image_jobs enable row level security;
alter table public.relationship_gist_revision_images enable row level security;
revoke all on table public.relationship_gist_ai_image_jobs from public, anon, authenticated;
revoke all on table public.relationship_gist_revision_images from public, anon, authenticated;
grant all on table public.relationship_gist_ai_image_jobs to service_role;
grant all on table public.relationship_gist_revision_images to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('relationship-gist-covers', 'relationship-gist-covers', false, 8388608, array['image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.relationship_gist_can_read_cover(p_storage_path text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.relationship_gist_revision_images image
    join public.relationship_gist_revisions revision on revision.id = image.revision_id
    join public.relationship_gist_editions edition on edition.id = revision.edition_id
    where image.storage_path = p_storage_path
      and (
        (image.status = 'approved' and edition.published_revision_id = image.revision_id
          and edition.lifecycle_status = 'published')
        or public.has_relationship_gist_editorial_capability('read', auth.uid())
      )
  );
$$;

revoke all on function public.relationship_gist_can_read_cover(text) from public, anon;
grant execute on function public.relationship_gist_can_read_cover(text) to authenticated, service_role;

drop policy if exists relationship_gist_cover_read on storage.objects;
create policy relationship_gist_cover_read on storage.objects
for select to authenticated
using (
  bucket_id = 'relationship-gist-covers'
  and public.relationship_gist_can_read_cover(storage.objects.name)
);

create or replace function public.rpc_request_relationship_gist_ai_image_generation(
  p_revision_id uuid,
  p_perspective text,
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
  v_revision public.relationship_gist_revisions%rowtype;
  v_job public.relationship_gist_ai_image_jobs%rowtype;
  v_today timestamptz := date_trunc('day', timezone('utc'::text, now()));
  v_jobs integer;
  v_perspective text := lower(btrim(coalesce(p_perspective, '')));
begin
  if v_actor is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.has_relationship_gist_editorial_capability('draft', v_actor) then
    raise exception 'editorial_draft_forbidden' using errcode = '42501';
  end if;
  select * into v_policy from public.relationship_gist_ai_environment_policies
  where is_current = true for update;
  if v_policy.environment is null or not v_policy.enabled or not v_policy.image_enabled then
    raise exception 'gist_ai_image_disabled' using errcode = '55000';
  end if;
  select * into v_revision from public.relationship_gist_revisions where id = p_revision_id;
  if v_revision.id is null then raise exception 'gist_revision_not_found'; end if;
  if v_revision.status not in ('draft', 'in_review') then raise exception 'gist_revision_immutable'; end if;
  if not exists (
    select 1 from public.relationship_gist_ai_draft_metadata metadata where metadata.revision_id = v_revision.id
  ) then raise exception 'gist_ai_image_requires_ai_draft'; end if;
  if not exists (
    select 1 from public.relationship_gist_revision_variants variant
    where variant.revision_id = v_revision.id and variant.perspective = v_perspective
  ) then raise exception 'gist_perspective_not_found'; end if;
  select * into v_job from public.relationship_gist_ai_image_jobs
  where environment = v_policy.environment and requested_by_user_id = v_actor
    and idempotency_key = p_idempotency_key;
  if v_job.id is not null then return to_jsonb(v_job); end if;
  select count(*) into v_jobs from public.relationship_gist_ai_image_jobs
  where environment = v_policy.environment and created_at >= v_today
    and status not in ('failed', 'rejected_unsafe', 'budget_exceeded');
  if v_jobs >= v_policy.daily_image_job_budget then
    insert into public.relationship_gist_ai_image_jobs(
      environment, revision_id, perspective, requested_by_user_id, idempotency_key,
      status, model, quality, image_size, failure_code, failed_at
    ) values (
      v_policy.environment, v_revision.id, v_perspective, v_actor, p_idempotency_key,
      'budget_exceeded', v_policy.image_model, v_policy.image_quality,
      v_policy.image_size, 'daily_image_budget_exceeded', timezone('utc'::text, now())
    ) returning * into v_job;
    return to_jsonb(v_job);
  end if;
  insert into public.relationship_gist_ai_image_jobs(
    environment, revision_id, perspective, requested_by_user_id, idempotency_key,
    model, quality, image_size
  ) values (
    v_policy.environment, v_revision.id, v_perspective, v_actor, p_idempotency_key,
    v_policy.image_model, v_policy.image_quality, v_policy.image_size
  ) returning * into v_job;
  return to_jsonb(v_job);
end;
$$;

create or replace function public.rpc_service_claim_relationship_gist_ai_image_job(
  p_job_id uuid,
  p_environment text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_job public.relationship_gist_ai_image_jobs%rowtype;
  v_policy public.relationship_gist_ai_environment_policies%rowtype;
  v_variant public.relationship_gist_revision_variants%rowtype;
  v_metadata public.relationship_gist_ai_draft_metadata%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  select * into v_policy from public.relationship_gist_ai_environment_policies
  where environment = p_environment and is_current = true and enabled = true and image_enabled = true;
  if v_policy.environment is null then raise exception 'gist_ai_environment_mismatch' using errcode = '42501'; end if;
  select * into v_job from public.relationship_gist_ai_image_jobs
  where id = p_job_id and environment = p_environment for update;
  if v_job.id is null then raise exception 'gist_ai_image_job_not_found'; end if;
  if v_job.status = 'processing' and v_job.claimed_at > v_now - interval '5 minutes' then
    raise exception 'gist_ai_image_job_already_claimed' using errcode = '55000';
  end if;
  if v_job.status not in ('queued', 'processing') or v_job.attempt_count >= v_policy.max_attempts then
    raise exception 'gist_ai_image_job_not_claimable' using errcode = '55000';
  end if;
  select * into v_variant from public.relationship_gist_revision_variants
  where revision_id = v_job.revision_id and perspective = v_job.perspective;
  select * into v_metadata from public.relationship_gist_ai_draft_metadata
  where revision_id = v_job.revision_id;
  update public.relationship_gist_ai_image_jobs
  set status = 'processing', attempt_count = attempt_count + 1, claimed_at = v_now,
      updated_at = v_now, failure_code = null, retryable = false
  where id = v_job.id;
  return jsonb_build_object(
    'job_id', v_job.id, 'revision_id', v_job.revision_id, 'perspective', v_job.perspective,
    'requested_by_user_id', v_job.requested_by_user_id,
    'title', v_variant.title, 'summary', v_variant.short_body,
    'takeaway', v_metadata.takeaway, 'safety_level', v_metadata.safety_level,
    'sensitive_topics', v_metadata.sensitive_topics,
    'model', v_policy.image_model, 'quality', v_policy.image_quality, 'image_size', v_policy.image_size,
    'text_input_rate', v_policy.image_text_input_microusd_per_million,
    'image_output_rate', v_policy.image_output_microusd_per_million
  );
end;
$$;

create or replace function public.rpc_service_complete_relationship_gist_ai_image_job(
  p_job_id uuid,
  p_environment text,
  p_storage_path text,
  p_sha256 text,
  p_width integer,
  p_height integer,
  p_alt_text text,
  p_prompt text,
  p_provider_request_id text,
  p_text_input_tokens integer,
  p_image_output_tokens integer,
  p_estimated_cost_microusd bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_job public.relationship_gist_ai_image_jobs%rowtype;
  v_image public.relationship_gist_revision_images%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  select * into v_job from public.relationship_gist_ai_image_jobs
  where id = p_job_id and environment = p_environment for update;
  if v_job.id is null or v_job.status <> 'processing' then raise exception 'gist_ai_image_job_not_processing'; end if;
  insert into public.relationship_gist_revision_images(
    revision_id, perspective, generation_job_id, storage_path, width, height,
    sha256, alt_text, prompt, generated_by_user_id
  ) values (
    v_job.revision_id, v_job.perspective, v_job.id, p_storage_path, p_width, p_height,
    lower(p_sha256), btrim(p_alt_text), btrim(p_prompt), v_job.requested_by_user_id
  ) returning * into v_image;
  update public.relationship_gist_ai_image_jobs
  set status = 'completed', provider_request_id = left(p_provider_request_id, 255),
      text_input_tokens = greatest(0, p_text_input_tokens),
      image_output_tokens = greatest(0, p_image_output_tokens),
      estimated_cost_microusd = case when p_estimated_cost_microusd is null then null else greatest(0, p_estimated_cost_microusd) end,
      completed_at = v_now, updated_at = v_now
  where id = v_job.id;
  return jsonb_build_object('job_id', v_job.id, 'status', 'completed', 'image_id', v_image.id);
end;
$$;

create or replace function public.rpc_service_fail_relationship_gist_ai_image_job(
  p_job_id uuid,
  p_environment text,
  p_status text,
  p_failure_code text,
  p_retryable boolean,
  p_provider_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_job public.relationship_gist_ai_image_jobs%rowtype;
  v_policy public.relationship_gist_ai_environment_policies%rowtype;
  v_to text;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required' using errcode = '42501'; end if;
  if p_status not in ('failed', 'rejected_unsafe') then raise exception 'gist_ai_image_failure_status_invalid'; end if;
  select * into v_job from public.relationship_gist_ai_image_jobs
  where id = p_job_id and environment = p_environment for update;
  select * into v_policy from public.relationship_gist_ai_environment_policies
  where environment = p_environment and is_current = true;
  if v_job.id is null or v_job.status <> 'processing' then raise exception 'gist_ai_image_job_not_processing'; end if;
  v_to := case when p_retryable and v_job.attempt_count < v_policy.max_attempts then 'queued' else p_status end;
  update public.relationship_gist_ai_image_jobs
  set status = v_to, failure_code = left(btrim(p_failure_code), 120), retryable = v_to = 'queued',
      provider_request_id = left(p_provider_request_id, 255),
      failed_at = case when v_to = 'queued' then null else v_now end,
      claimed_at = case when v_to = 'queued' then null else claimed_at end,
      updated_at = v_now
  where id = v_job.id;
  return jsonb_build_object('job_id', v_job.id, 'status', v_to, 'retryable', v_to = 'queued');
end;
$$;

create or replace function public.rpc_get_relationship_gist_ai_image_studio()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.has_relationship_gist_editorial_capability('read', auth.uid()) then
    raise exception 'editorial_read_forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'jobs', coalesce((select jsonb_agg(to_jsonb(job) order by job.created_at desc)
      from public.relationship_gist_ai_image_jobs job), '[]'::jsonb),
    'images', coalesce((select jsonb_agg(to_jsonb(image) order by image.created_at desc)
      from public.relationship_gist_revision_images image), '[]'::jsonb)
  );
end;
$$;

create or replace function public.rpc_review_relationship_gist_ai_image(
  p_image_id uuid,
  p_decision text,
  p_alt_text text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_image public.relationship_gist_revision_images%rowtype;
  v_revision public.relationship_gist_revisions%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if v_actor is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.has_relationship_gist_editorial_capability('quality_approve', v_actor) then
    raise exception 'editorial_quality_approve_forbidden' using errcode = '42501';
  end if;
  if p_decision not in ('approve', 'reject') then raise exception 'gist_ai_image_decision_invalid'; end if;
  select * into v_image from public.relationship_gist_revision_images where id = p_image_id for update;
  if v_image.id is null or v_image.status <> 'generated' then raise exception 'gist_ai_image_not_reviewable'; end if;
  if v_image.generated_by_user_id = v_actor then raise exception 'gist_ai_image_self_approval_forbidden' using errcode = '42501'; end if;
  select * into v_revision from public.relationship_gist_revisions where id = v_image.revision_id;
  if v_revision.status not in ('draft', 'in_review') then raise exception 'gist_revision_immutable'; end if;
  if p_decision = 'approve' then
    if char_length(btrim(coalesce(p_alt_text, ''))) not between 10 and 300 then raise exception 'gist_ai_image_alt_text_invalid'; end if;
    update public.relationship_gist_revision_images
    set status = 'superseded', updated_at = v_now
    where revision_id = v_image.revision_id and perspective = v_image.perspective and status = 'approved';
    update public.relationship_gist_revision_images
    set status = 'approved', alt_text = btrim(p_alt_text), approved_by_user_id = v_actor,
        approved_at = v_now, updated_at = v_now
    where id = v_image.id;
  else
    update public.relationship_gist_revision_images
    set status = 'rejected', rejected_by_user_id = v_actor, rejected_at = v_now, updated_at = v_now
    where id = v_image.id;
  end if;
  return jsonb_build_object('image_id', v_image.id, 'status', case when p_decision = 'approve' then 'approved' else 'rejected' end);
end;
$$;

create or replace function public.rpc_get_relationship_gist_cover(
  p_gist_id uuid,
  p_perspective text default 'general'
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select coalesce((
    select jsonb_build_object(
      'id', image.id, 'revision_id', image.revision_id, 'perspective', image.perspective,
      'storage_path', image.storage_path, 'alt_text', image.alt_text,
      'width', image.width, 'height', image.height, 'sha256', image.sha256
    )
    from public.relationship_gist_editions edition
    join public.relationship_gist_revision_images image on image.revision_id = edition.published_revision_id
    where edition.legacy_gist_id = p_gist_id and image.status = 'approved'
      and edition.lifecycle_status = 'published'
      and image.perspective in (lower(btrim(coalesce(p_perspective, 'general'))), 'general')
    order by (image.perspective = lower(btrim(coalesce(p_perspective, 'general')))) desc
    limit 1
  ), '{}'::jsonb)
  where auth.uid() is not null;
$$;

revoke all on function public.rpc_request_relationship_gist_ai_image_generation(uuid,text,uuid) from public, anon;
revoke all on function public.rpc_get_relationship_gist_ai_image_studio() from public, anon;
revoke all on function public.rpc_review_relationship_gist_ai_image(uuid,text,text) from public, anon;
revoke all on function public.rpc_get_relationship_gist_cover(uuid,text) from public, anon;
grant execute on function public.rpc_request_relationship_gist_ai_image_generation(uuid,text,uuid) to authenticated;
grant execute on function public.rpc_get_relationship_gist_ai_image_studio() to authenticated;
grant execute on function public.rpc_review_relationship_gist_ai_image(uuid,text,text) to authenticated;
grant execute on function public.rpc_get_relationship_gist_cover(uuid,text) to authenticated;

revoke all on function public.rpc_service_claim_relationship_gist_ai_image_job(uuid,text) from public, anon, authenticated;
revoke all on function public.rpc_service_complete_relationship_gist_ai_image_job(uuid,text,text,text,integer,integer,text,text,text,integer,integer,bigint) from public, anon, authenticated;
revoke all on function public.rpc_service_fail_relationship_gist_ai_image_job(uuid,text,text,text,boolean,text) from public, anon, authenticated;
grant execute on function public.rpc_service_claim_relationship_gist_ai_image_job(uuid,text) to service_role;
grant execute on function public.rpc_service_complete_relationship_gist_ai_image_job(uuid,text,text,text,integer,integer,text,text,text,integer,integer,bigint) to service_role;
grant execute on function public.rpc_service_fail_relationship_gist_ai_image_job(uuid,text,text,text,boolean,text) to service_role;

commit;
