-- Prevent AI rewrite completion from colliding with human-edit provenance cloning,
-- and resolve terminal generation briefs without deleting their audit history.
begin;

create or replace function public.relationship_gist_ai_clone_provenance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.source_revision_id is null then return new; end if;

  -- AI rewrite completion writes fresh provenance for the new provider job. The
  -- human-edit path must continue to clone provenance from its source revision.
  if auth.role() = 'service_role' and exists (
    select 1
    from public.relationship_gist_ai_generation_jobs job
    join public.relationship_gist_ai_topic_calendar topic on topic.id = job.topic_id
    where job.status = 'processing'
      and job.requested_by_user_id = new.authored_by_user_id
      and topic.source_revision_id = new.source_revision_id
  ) then
    return new;
  end if;

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

revoke all on function public.relationship_gist_ai_clone_provenance()
  from public, anon, authenticated, service_role;

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
  if v_to <> 'queued' then
    update public.relationship_gist_ai_topic_calendar topic
    set status = 'cancelled', cancelled_at = v_now, updated_at = v_now
    where topic.id = v_job.topic_id
      and topic.status = 'approved'
      and not exists (
        select 1 from public.relationship_gist_ai_generation_jobs active
        where active.topic_id = v_job.topic_id
          and active.id <> v_job.id
          and active.status in ('queued', 'processing', 'completed')
      );
  end if;
  return jsonb_build_object('job_id', v_job.id, 'status', v_to, 'retryable', v_to = 'queued');
end;
$$;

revoke all on function public.rpc_service_fail_relationship_gist_ai_job(
  uuid,text,text,text,boolean,text,integer,integer,integer,bigint
) from public, anon, authenticated;
grant execute on function public.rpc_service_fail_relationship_gist_ai_job(
  uuid,text,text,text,boolean,text,integer,integer,integer,bigint
) to service_role;

-- Resolve old terminal briefs in place. Jobs and immutable job events remain
-- available for operational audit; only actionable studio projections hide them.
update public.relationship_gist_ai_topic_calendar topic
set status = 'cancelled',
    cancelled_at = coalesce(topic.cancelled_at, timezone('utc'::text, now())),
    updated_at = timezone('utc'::text, now())
where topic.status = 'approved'
  and exists (
    select 1 from public.relationship_gist_ai_generation_jobs failed
    where failed.topic_id = topic.id
      and failed.status in ('failed', 'rejected_unsafe', 'rejected_duplicate', 'budget_exceeded')
  )
  and not exists (
    select 1 from public.relationship_gist_ai_generation_jobs active
    where active.topic_id = topic.id
      and active.status in ('queued', 'processing', 'completed')
  );

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
        join public.relationship_gist_ai_topic_calendar topic on topic.id = job.topic_id
        where job.environment = v_environment
          and topic.status <> 'cancelled'
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
      'active_count', (select count(*)
        from public.relationship_gist_ai_generation_jobs job
        join public.relationship_gist_ai_topic_calendar topic on topic.id = job.topic_id
        where job.environment = v_environment and topic.status <> 'cancelled'
          and job.status in ('queued', 'processing')),
      'unresolved_failure_count', (select count(*)
        from public.relationship_gist_ai_generation_jobs job
        join public.relationship_gist_ai_topic_calendar topic on topic.id = job.topic_id
        where job.environment = v_environment and topic.status <> 'cancelled'
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

revoke all on function public.rpc_get_relationship_gist_ai_studio()
  from public, anon;
grant execute on function public.rpc_get_relationship_gist_ai_studio()
  to authenticated, service_role;

commit;
