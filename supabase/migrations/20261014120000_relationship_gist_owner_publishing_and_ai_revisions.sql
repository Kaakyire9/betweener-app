-- Streamlined owner publishing, actionable AI queues, and immutable AI rewrites.
-- Existing multi-role editorial transitions remain available for non-owner teams.
begin;

alter table public.relationship_gist_ai_topic_calendar
  add column if not exists source_revision_id uuid
    references public.relationship_gist_revisions(id) on delete restrict,
  add column if not exists revision_instruction text
    check (revision_instruction is null or char_length(btrim(revision_instruction)) between 10 and 1200);

create index if not exists relationship_gist_ai_topic_source_revision_idx
  on public.relationship_gist_ai_topic_calendar(source_revision_id)
  where source_revision_id is not null;

create or replace function public.rpc_publish_relationship_gist_owner_review(
  p_revision_id uuid,
  p_confirmation text,
  p_safety_acknowledged boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_revision public.relationship_gist_revisions%rowtype;
  v_edition public.relationship_gist_editions%rowtype;
  v_variant public.relationship_gist_revision_variants%rowtype;
  v_from text;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if v_actor is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.relationship_gist_ai_is_owner_editor(v_actor) then
    raise exception 'gist_owner_review_forbidden' using errcode = '42501';
  end if;
  if btrim(coalesce(p_confirmation, '')) <> 'I reviewed this Gist and accept publishing responsibility.' then
    raise exception 'gist_owner_confirmation_required';
  end if;

  select * into v_revision
  from public.relationship_gist_revisions
  where id = p_revision_id
  for update;
  if v_revision.id is null then raise exception 'gist_revision_not_found'; end if;
  if v_revision.authored_by_user_id is distinct from v_actor then
    raise exception 'gist_owner_may_only_publish_own_revision' using errcode = '42501';
  end if;
  if v_revision.status not in ('draft', 'in_review', 'approved') then
    raise exception 'gist_transition_not_allowed';
  end if;
  if exists (
    select 1 from public.relationship_gist_ai_draft_metadata metadata
    where metadata.revision_id = v_revision.id
  ) then
    raise exception 'gist_ai_owner_review_required';
  end if;
  if v_revision.requires_safety_review and not coalesce(p_safety_acknowledged, false) then
    raise exception 'gist_owner_safety_acknowledgement_required';
  end if;

  select * into v_edition
  from public.relationship_gist_editions
  where id = v_revision.edition_id
  for update;
  if v_edition.id is null then raise exception 'gist_edition_not_found'; end if;
  select * into v_variant
  from public.relationship_gist_revision_variants
  where revision_id = v_revision.id
    and perspective = v_revision.primary_perspective;
  if v_variant.revision_id is null then raise exception 'gist_variant_not_found'; end if;
  v_from := v_revision.status;

  insert into public.relationship_gist_editorial_audit_events (
    edition_id, revision_id, actor_user_id, action, from_status, to_status, reason
  )
  select edition_id, id, v_actor, 'superseded', status, 'superseded',
    'Superseded by owner-reviewed revision ' || v_revision.revision_number::text
  from public.relationship_gist_revisions
  where edition_id = v_revision.edition_id
    and status = 'published'
    and id <> v_revision.id;

  update public.relationship_gist_revisions
  set status = 'superseded', superseded_at = v_now, updated_at = v_now
  where edition_id = v_revision.edition_id
    and status = 'published'
    and id <> v_revision.id;

  update public.relationship_gist_revisions
  set status = 'published',
      quality_approved_by_user_id = coalesce(quality_approved_by_user_id, v_actor),
      quality_approved_at = coalesce(quality_approved_at, v_now),
      safety_approved_by_user_id = case
        when requires_safety_review then coalesce(safety_approved_by_user_id, v_actor)
        else safety_approved_by_user_id
      end,
      safety_approved_at = case
        when requires_safety_review then coalesce(safety_approved_at, v_now)
        else safety_approved_at
      end,
      published_at = v_now, scheduled_for = null,
      transition_reason = 'Published after explicit owner review',
      updated_at = v_now
  where id = v_revision.id;

  update public.relationship_gists
  set title = v_variant.title, short_body = v_variant.short_body,
      body = v_variant.body, perspective = v_variant.perspective,
      status = 'published', scheduled_for = null,
      published_at = v_now, updated_at = v_now
  where id = v_edition.legacy_gist_id;

  update public.relationship_gist_editions
  set published_revision_id = v_revision.id,
      current_revision_id = v_revision.id,
      lifecycle_status = 'published',
      lock_version = lock_version + 1,
      updated_at = v_now
  where id = v_edition.id;

  perform public.relationship_gist_v2_record_audit(
    v_edition.id, v_revision.id, v_actor,
    'owner_review_published', v_from, 'published',
    'Owner manually reviewed and accepted publishing responsibility',
    jsonb_build_object(
      'owner_review', true,
      'ai_generated', false,
      'safety_acknowledged', v_revision.requires_safety_review
    )
  );

  return jsonb_build_object(
    'edition_id', v_edition.id, 'revision_id', v_revision.id,
    'from_status', v_from, 'status', 'published',
    'published_at', v_now, 'owner_review', true
  );
end;
$$;

revoke all on function public.rpc_publish_relationship_gist_owner_review(uuid,text,boolean)
  from public, anon, service_role;
grant execute on function public.rpc_publish_relationship_gist_owner_review(uuid,text,boolean)
  to authenticated;

create or replace function public.rpc_create_relationship_gist_ai_revision_topic(
  p_source_revision_id uuid,
  p_instruction text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_environment text;
  v_source public.relationship_gist_revisions%rowtype;
  v_variant public.relationship_gist_revision_variants%rowtype;
  v_instruction text := btrim(coalesce(p_instruction, ''));
  v_topic public.relationship_gist_ai_topic_calendar%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if v_actor is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.relationship_gist_ai_is_owner_editor(v_actor) then
    raise exception 'gist_ai_owner_review_forbidden' using errcode = '42501';
  end if;
  if char_length(v_instruction) not between 10 and 1200 then
    raise exception 'gist_ai_revision_instruction_invalid';
  end if;
  select policy.environment into v_environment
  from public.relationship_gist_ai_environment_policies policy
  where policy.is_current = true and policy.enabled = true;
  if v_environment is null then raise exception 'gist_ai_disabled' using errcode = '55000'; end if;

  select revision.* into v_source
  from public.relationship_gist_revisions revision
  join public.relationship_gist_editions edition
    on edition.id = revision.edition_id
   and edition.published_revision_id = revision.id
  where revision.id = p_source_revision_id
    and revision.status = 'published';
  if v_source.id is null then raise exception 'gist_ai_source_revision_not_current'; end if;
  select * into v_variant
  from public.relationship_gist_revision_variants
  where revision_id = v_source.id
    and perspective = v_source.primary_perspective;
  if v_variant.revision_id is null then raise exception 'gist_variant_not_found'; end if;

  insert into public.relationship_gist_ai_topic_calendar (
    environment, topic_key, topic_title, topic_fingerprint, topic_brief,
    requested_perspective, planned_for, status,
    created_by_user_id, approved_by_user_id, approved_at,
    source_revision_id, revision_instruction, created_at, updated_at
  ) values (
    v_environment,
    'revision-' || replace(gen_random_uuid()::text, '-', ''),
    left('Revise: ' || v_variant.title, 200),
    left(public.relationship_gist_ai_normalize_topic(v_variant.title || ' ' || v_instruction), 200),
    v_instruction,
    v_variant.perspective,
    v_now::date,
    'approved',
    v_actor, v_actor, v_now,
    v_source.id, v_instruction, v_now, v_now
  ) returning * into v_topic;

  perform public.relationship_gist_v2_record_audit(
    v_source.edition_id, v_source.id, v_actor,
    'ai_revision_requested', 'published', 'published', null,
    jsonb_build_object('topic_id', v_topic.id, 'source_revision_id', v_source.id)
  );
  return jsonb_build_object(
    'topic_id', v_topic.id,
    'source_revision_id', v_source.id,
    'status', v_topic.status
  );
end;
$$;

revoke all on function public.rpc_create_relationship_gist_ai_revision_topic(uuid,text)
  from public, anon, service_role;
grant execute on function public.rpc_create_relationship_gist_ai_revision_topic(uuid,text)
  to authenticated;

create or replace function public.rpc_admin_get_relationship_gist_editions_v2()
returns table (
  edition_id uuid,
  legacy_gist_id uuid,
  revision_id uuid,
  revision_number integer,
  status text,
  title text,
  short_body text,
  body text,
  perspective text,
  perspectives text[],
  requires_safety_review boolean,
  quality_approved_at timestamptz,
  safety_approved_at timestamptz,
  scheduled_for timestamptz,
  published_at timestamptz,
  authored_by_user_id uuid,
  lock_version bigint,
  targeting_enforced boolean,
  updated_at timestamptz,
  ai_generated boolean
)
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
  return query
  select
    edition.id, edition.legacy_gist_id, revision.id, revision.revision_number,
    revision.status, variant.title, variant.short_body, variant.body,
    variant.perspective,
    array(
      select available.perspective
      from public.relationship_gist_revision_variants available
      where available.revision_id = revision.id
      order by available.perspective
    ),
    revision.requires_safety_review,
    revision.quality_approved_at, revision.safety_approved_at,
    revision.scheduled_for, revision.published_at, revision.authored_by_user_id,
    edition.lock_version, edition.targeting_enforced, revision.updated_at,
    exists (
      select 1 from public.relationship_gist_ai_draft_metadata metadata
      where metadata.revision_id = revision.id
    )
  from public.relationship_gist_editions edition
  join public.relationship_gist_revisions revision on revision.edition_id = edition.id
  join public.relationship_gist_revision_variants variant
    on variant.revision_id = revision.id
   and variant.perspective = revision.primary_perspective
  order by revision.updated_at desc, revision.revision_number desc;
end;
$$;

revoke all on function public.rpc_admin_get_relationship_gist_editions_v2()
  from public, anon;
grant execute on function public.rpc_admin_get_relationship_gist_editions_v2()
  to authenticated, service_role;

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
  v_today timestamptz := date_trunc('day', timezone('utc'::text, now()));
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
        and topic.status in ('draft', 'approved')
    ), '[]'::jsonb),
    'jobs', coalesce((
      select jsonb_agg(to_jsonb(actionable) order by actionable.created_at desc)
      from (
        select job.*
        from public.relationship_gist_ai_generation_jobs job
        where job.environment = v_environment
          and (
            job.status in ('queued', 'processing')
            or (
              job.status in ('failed', 'rejected_unsafe', 'rejected_duplicate', 'budget_exceeded')
              and not exists (
                select 1 from public.relationship_gist_ai_generation_jobs recovered
                where recovered.topic_id = job.topic_id
                  and recovered.status = 'completed'
                  and recovered.created_at > job.created_at
              )
            )
          )
        order by job.created_at desc
        limit 20
      ) actionable
    ), '[]'::jsonb),
    'job_summary', jsonb_build_object(
      'active_count', (select count(*) from public.relationship_gist_ai_generation_jobs job
        where job.environment = v_environment and job.status in ('queued', 'processing')),
      'unresolved_failure_count', (select count(*) from public.relationship_gist_ai_generation_jobs job
        where job.environment = v_environment
          and job.status in ('failed', 'rejected_unsafe', 'rejected_duplicate', 'budget_exceeded')
          and not exists (
            select 1 from public.relationship_gist_ai_generation_jobs recovered
            where recovered.topic_id = job.topic_id and recovered.status = 'completed'
              and recovered.created_at > job.created_at
          )),
      'today_completed_count', (select count(*) from public.relationship_gist_ai_generation_jobs job
        where job.environment = v_environment and job.status = 'completed' and job.created_at >= v_today),
      'today_estimated_cost_microusd', (select coalesce(sum(job.estimated_cost_microusd), 0)
        from public.relationship_gist_ai_generation_jobs job
        where job.environment = v_environment and job.created_at >= v_today)
    )
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
    where revision.status in ('draft', 'in_review', 'approved')
  ), '[]'::jsonb);
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
  v_source_variant public.relationship_gist_revision_variants%rowtype;
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
  if v_topic.source_revision_id is not null then
    select variant.* into v_source_variant
    from public.relationship_gist_revision_variants variant
    join public.relationship_gist_revisions revision
      on revision.id = variant.revision_id
     and variant.perspective = revision.primary_perspective
    where variant.revision_id = v_topic.source_revision_id;
    if v_source_variant.revision_id is null then raise exception 'gist_ai_source_revision_invalid'; end if;
  end if;
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
    'source_revision_id', v_topic.source_revision_id,
    'revision_instruction', v_topic.revision_instruction,
    'source_title', v_source_variant.title,
    'source_summary', v_source_variant.short_body,
    'source_body', v_source_variant.body,
    'model', v_policy.model,
    'max_output_tokens', v_policy.max_output_tokens,
    'max_attempts', v_policy.max_attempts,
    'input_microusd_per_million', v_policy.input_microusd_per_million,
    'cached_input_microusd_per_million', v_policy.cached_input_microusd_per_million,
    'output_microusd_per_million', v_policy.output_microusd_per_million
  );
end;
$$;

-- The service completion function is replaced below so rewrite jobs create a
-- new immutable revision in the existing edition while the published revision
-- remains live until the owner publishes its replacement.
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
  v_legacy_gist_id uuid;
  v_source_revision public.relationship_gist_revisions%rowtype;
  v_source_edition public.relationship_gist_editions%rowtype;
  v_revision public.relationship_gist_revisions%rowtype;
  v_revision_number integer;
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
  if v_topic.id is null then raise exception 'gist_ai_topic_not_found'; end if;

  if v_topic.source_revision_id is not null then
    select revision.* into v_source_revision
    from public.relationship_gist_revisions revision
    join public.relationship_gist_editions edition
      on edition.id = revision.edition_id
     and edition.published_revision_id = revision.id
    where revision.id = v_topic.source_revision_id
      and revision.status = 'published';
    if v_source_revision.id is null then raise exception 'gist_ai_source_revision_not_current'; end if;
    select * into v_source_edition
    from public.relationship_gist_editions
    where id = v_source_revision.edition_id
    for update;
  end if;

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
    where (
      public.relationship_gist_ai_similarity(lower(variant.title), lower(p_output ->> 'title')) >= 0.72
      or public.relationship_gist_ai_similarity(left(lower(variant.body), 1000), left(lower(p_output ->> 'body'), 1000)) >= 0.82
    )
    and (
      v_source_revision.id is null
      or not exists (
        select 1 from public.relationship_gist_revisions candidate
        where candidate.id = variant.revision_id
          and candidate.edition_id = v_source_revision.edition_id
      )
    )
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

  if v_source_revision.id is null then
    insert into public.relationship_gists (
      circle_id, title, short_body, body, perspective, status,
      created_by_profile_id, created_by_admin_id
    ) values (
      null, btrim(p_output ->> 'title'), btrim(p_output ->> 'summary'), v_body,
      p_output ->> 'perspective', 'draft', v_profile, v_job.requested_by_user_id
    ) returning * into v_legacy;
    v_legacy_gist_id := v_legacy.id;
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
  else
    perform pg_advisory_xact_lock(hashtextextended(v_source_revision.edition_id::text, 0));
    select coalesce(max(revision_number), 0) + 1 into v_revision_number
    from public.relationship_gist_revisions
    where edition_id = v_source_revision.edition_id;
    insert into public.relationship_gist_revisions (
      edition_id, revision_number, status, primary_perspective,
      requires_safety_review, authored_by_user_id, source_revision_id,
      created_at, updated_at
    ) values (
      v_source_revision.edition_id, v_revision_number, 'draft', p_output ->> 'perspective',
      v_sensitive, v_job.requested_by_user_id, v_source_revision.id,
      v_now, v_now
    ) returning * into v_revision;
    insert into public.relationship_gist_revision_variants (
      revision_id, perspective, title, short_body, body, created_at
    ) values (
      v_revision.id, p_output ->> 'perspective', btrim(p_output ->> 'title'),
      btrim(p_output ->> 'summary'), v_body, v_now
    );
    update public.relationship_gist_editions
    set current_revision_id = v_revision.id,
        lock_version = lock_version + 1,
        updated_at = v_now
    where id = v_source_revision.edition_id;
    v_legacy_gist_id := v_source_edition.legacy_gist_id;
  end if;

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
    jsonb_build_object(
      'revision_id', v_revision.id,
      'source_revision_id', v_topic.source_revision_id,
      'rewrite', v_topic.source_revision_id is not null
    )
  );
  perform public.relationship_gist_v2_record_audit(
    v_revision.edition_id, v_revision.id, v_job.requested_by_user_id,
    case when v_topic.source_revision_id is null then 'ai_draft_created' else 'ai_revision_created' end,
    null, 'draft', null,
    jsonb_build_object(
      'generation_job_id', v_job.id,
      'human_review_required', true,
      'source_revision_id', v_topic.source_revision_id,
      'rewrite', v_topic.source_revision_id is not null
    )
  );
  return jsonb_build_object(
    'job_id', v_job.id, 'status', 'completed', 'revision_id', v_revision.id,
    'legacy_gist_id', v_legacy_gist_id,
    'source_revision_id', v_topic.source_revision_id,
    'rewrite', v_topic.source_revision_id is not null
  );
end;
$$;

commit;
