-- Relationship Gist AI owner-review workflow.
--
-- AI remains draft-only. A super admin may prepare a brief, manually review
-- every source and specialist concern, attest claims, and publish the AI draft
-- in one audited owner action. Existing independent-review RPCs remain intact.

begin;

create table if not exists public.relationship_gist_ai_owner_review_events (
  id bigint generated always as identity primary key,
  environment text not null,
  topic_id uuid references public.relationship_gist_ai_topic_calendar(id) on delete restrict,
  revision_id uuid references public.relationship_gist_revisions(id) on delete restrict,
  image_id uuid references public.relationship_gist_revision_images(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in (
    'brief_prepared', 'claims_attested', 'source_reviewed',
    'specialist_reviewed', 'image_reviewed', 'published'
  )),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default timezone('utc'::text, now()),
  check (num_nonnulls(topic_id, revision_id, image_id) > 0)
);

create index if not exists relationship_gist_ai_owner_review_events_revision_idx
  on public.relationship_gist_ai_owner_review_events (revision_id, occurred_at desc, id desc);

alter table public.relationship_gist_ai_owner_review_events enable row level security;
revoke all on table public.relationship_gist_ai_owner_review_events
  from public, anon, authenticated, service_role;

drop trigger if exists relationship_gist_ai_owner_review_events_immutable_guard
  on public.relationship_gist_ai_owner_review_events;
create trigger relationship_gist_ai_owner_review_events_immutable_guard
before update or delete on public.relationship_gist_ai_owner_review_events
for each row execute function public.relationship_gist_ai_reject_event_mutation();

create or replace function public.relationship_gist_ai_is_owner_editor(
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select coalesce((
    select admin.role = 'super_admin'
    from public.internal_admins admin
    where admin.user_id = p_user_id
  ), false);
$$;

revoke all on function public.relationship_gist_ai_is_owner_editor(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.rpc_prepare_relationship_gist_ai_owner_topic(
  p_topic_id uuid
)
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
  if not public.relationship_gist_ai_is_owner_editor(v_actor) then
    raise exception 'gist_ai_owner_review_forbidden' using errcode = '42501';
  end if;

  select * into v_topic
  from public.relationship_gist_ai_topic_calendar
  where id = p_topic_id
  for update;

  if v_topic.id is null then raise exception 'gist_ai_topic_not_found'; end if;
  if v_topic.created_by_user_id <> v_actor then
    raise exception 'gist_ai_owner_topic_mismatch' using errcode = '42501';
  end if;
  if v_topic.status = 'approved' then
    return jsonb_build_object('topic_id', v_topic.id, 'status', v_topic.status);
  end if;
  if v_topic.status <> 'draft' then raise exception 'gist_ai_topic_not_draft'; end if;

  update public.relationship_gist_ai_topic_calendar
  set status = 'approved', approved_by_user_id = v_actor,
      approved_at = v_now, updated_at = v_now
  where id = v_topic.id;

  insert into public.relationship_gist_ai_owner_review_events (
    environment, topic_id, actor_user_id, action, metadata
  ) values (
    v_topic.environment, v_topic.id, v_actor, 'brief_prepared',
    jsonb_build_object('owner_review', true, 'purpose', 'ai_draft_generation_only')
  );

  return jsonb_build_object(
    'topic_id', v_topic.id, 'status', 'approved',
    'prepared_at', v_now, 'owner_review', true
  );
end;
$$;

create or replace function public.rpc_owner_attest_relationship_gist_ai_claims(
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
  v_environment text;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if v_actor is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.relationship_gist_ai_is_owner_editor(v_actor) then
    raise exception 'gist_ai_owner_review_forbidden' using errcode = '42501';
  end if;

  select revision.* into v_revision
  from public.relationship_gist_revisions revision
  join public.relationship_gist_ai_draft_metadata metadata on metadata.revision_id = revision.id
  where revision.id = p_revision_id
  for update of revision;

  if v_revision.id is null then raise exception 'gist_ai_draft_not_found'; end if;
  if v_revision.status not in ('draft', 'in_review') then raise exception 'gist_revision_immutable'; end if;
  select job.environment into v_environment
  from public.relationship_gist_ai_draft_metadata metadata
  join public.relationship_gist_ai_generation_jobs job on job.id = metadata.generation_job_id
  where metadata.revision_id = v_revision.id;

  update public.relationship_gist_ai_draft_metadata
  set claims_verified_by_user_id = v_actor, claims_verified_at = v_now
  where revision_id = v_revision.id;

  insert into public.relationship_gist_ai_owner_review_events (
    environment, revision_id, actor_user_id, action, metadata
  ) values (
    v_environment, v_revision.id, v_actor, 'claims_attested',
    jsonb_build_object('owner_review', true, 'manual_confirmation', true)
  );

  return jsonb_build_object(
    'revision_id', v_revision.id, 'claims_verified_at', v_now,
    'owner_review', true
  );
end;
$$;

create or replace function public.rpc_owner_review_relationship_gist_ai_source(
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
  v_environment text;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if v_actor is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.relationship_gist_ai_is_owner_editor(v_actor) then
    raise exception 'gist_ai_owner_review_forbidden' using errcode = '42501';
  end if;
  if p_status not in ('verified', 'rejected') then raise exception 'gist_ai_source_status_invalid'; end if;

  select * into v_source
  from public.relationship_gist_ai_source_suggestions
  where id = p_source_id
  for update;
  if v_source.id is null then raise exception 'gist_ai_source_not_found'; end if;

  select revision.* into v_revision
  from public.relationship_gist_revisions revision
  join public.relationship_gist_ai_draft_metadata metadata on metadata.revision_id = revision.id
  where revision.id = v_source.revision_id;
  if v_revision.id is null then raise exception 'gist_ai_draft_not_found'; end if;
  if v_revision.status not in ('draft', 'in_review') then raise exception 'gist_revision_immutable'; end if;
  select job.environment into v_environment
  from public.relationship_gist_ai_draft_metadata metadata
  join public.relationship_gist_ai_generation_jobs job on job.id = metadata.generation_job_id
  where metadata.revision_id = v_revision.id;

  update public.relationship_gist_ai_source_suggestions
  set verification_status = p_status, reviewed_by_user_id = v_actor,
      reviewed_at = v_now, review_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = v_source.id;

  insert into public.relationship_gist_ai_owner_review_events (
    environment, revision_id, actor_user_id, action, metadata
  ) values (
    v_environment, v_revision.id, v_actor, 'source_reviewed',
    jsonb_build_object(
      'owner_review', true, 'source_id', v_source.id,
      'decision', p_status, 'manual_confirmation', true
    )
  );

  return jsonb_build_object(
    'source_id', v_source.id, 'status', p_status,
    'reviewed_at', v_now, 'owner_review', true
  );
end;
$$;

create or replace function public.rpc_owner_acknowledge_relationship_gist_ai_specialist_review(
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
  v_environment text;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if v_actor is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.relationship_gist_ai_is_owner_editor(v_actor) then
    raise exception 'gist_ai_owner_review_forbidden' using errcode = '42501';
  end if;

  select revision.* into v_revision
  from public.relationship_gist_revisions revision
  join public.relationship_gist_ai_draft_metadata metadata on metadata.revision_id = revision.id
  where revision.id = p_revision_id
  for update of revision;

  if v_revision.id is null then raise exception 'gist_ai_draft_not_found'; end if;
  if v_revision.status not in ('draft', 'in_review') then raise exception 'gist_revision_immutable'; end if;
  select job.environment into v_environment
  from public.relationship_gist_ai_draft_metadata metadata
  join public.relationship_gist_ai_generation_jobs job on job.id = metadata.generation_job_id
  where metadata.revision_id = v_revision.id;

  update public.relationship_gist_specialist_reviews
  set approved_by_user_id = v_actor, approved_at = v_now,
      note = nullif(btrim(coalesce(p_note, '')), '')
  where revision_id = p_revision_id
    and review_type = p_review_type
    and approved_at is null;
  if not found then raise exception 'gist_specialist_review_not_pending'; end if;

  insert into public.relationship_gist_ai_owner_review_events (
    environment, revision_id, actor_user_id, action, metadata
  ) values (
    v_environment, v_revision.id, v_actor, 'specialist_reviewed',
    jsonb_build_object(
      'owner_review', true, 'review_type', p_review_type,
      'manual_confirmation', true
    )
  );

  return jsonb_build_object(
    'revision_id', p_revision_id, 'review_type', p_review_type,
    'approved_at', v_now, 'owner_review', true
  );
end;
$$;

create or replace function public.rpc_owner_review_relationship_gist_ai_image(
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
  v_environment text;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if v_actor is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.relationship_gist_ai_is_owner_editor(v_actor) then
    raise exception 'gist_ai_owner_review_forbidden' using errcode = '42501';
  end if;
  if p_decision not in ('approve', 'reject') then raise exception 'gist_ai_image_decision_invalid'; end if;

  select * into v_image
  from public.relationship_gist_revision_images
  where id = p_image_id
  for update;
  if v_image.id is null or v_image.status <> 'generated' then raise exception 'gist_ai_image_not_reviewable'; end if;

  select revision.* into v_revision
  from public.relationship_gist_revisions revision
  join public.relationship_gist_ai_draft_metadata metadata on metadata.revision_id = revision.id
  where revision.id = v_image.revision_id;
  if v_revision.id is null then raise exception 'gist_ai_draft_not_found'; end if;
  if v_revision.status not in ('draft', 'in_review') then raise exception 'gist_revision_immutable'; end if;
  select job.environment into v_environment
  from public.relationship_gist_ai_draft_metadata metadata
  join public.relationship_gist_ai_generation_jobs job on job.id = metadata.generation_job_id
  where metadata.revision_id = v_revision.id;

  if p_decision = 'approve' then
    if char_length(btrim(coalesce(p_alt_text, ''))) not between 10 and 300 then
      raise exception 'gist_ai_image_alt_text_invalid';
    end if;
    update public.relationship_gist_revision_images
    set status = 'superseded', updated_at = v_now
    where revision_id = v_image.revision_id
      and perspective = v_image.perspective
      and status = 'approved';
    update public.relationship_gist_revision_images
    set status = 'approved', alt_text = btrim(p_alt_text),
        approved_by_user_id = v_actor, approved_at = v_now, updated_at = v_now
    where id = v_image.id;
  else
    update public.relationship_gist_revision_images
    set status = 'rejected', rejected_by_user_id = v_actor,
        rejected_at = v_now, updated_at = v_now
    where id = v_image.id;
  end if;

  insert into public.relationship_gist_ai_owner_review_events (
    environment, revision_id, image_id, actor_user_id, action, metadata
  ) values (
    v_environment, v_revision.id, v_image.id, v_actor, 'image_reviewed',
    jsonb_build_object(
      'owner_review', true, 'decision', p_decision,
      'manual_confirmation', true
    )
  );

  return jsonb_build_object(
    'image_id', v_image.id,
    'status', case when p_decision = 'approve' then 'approved' else 'rejected' end,
    'owner_review', true
  );
end;
$$;

create or replace function public.rpc_publish_relationship_gist_ai_owner_review(
  p_revision_id uuid,
  p_confirmation text
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
  v_metadata public.relationship_gist_ai_draft_metadata%rowtype;
  v_environment text;
  v_from text;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if v_actor is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.relationship_gist_ai_is_owner_editor(v_actor) then
    raise exception 'gist_ai_owner_review_forbidden' using errcode = '42501';
  end if;
  if btrim(coalesce(p_confirmation, '')) <> 'I reviewed this Gist and accept publishing responsibility.' then
    raise exception 'gist_ai_owner_confirmation_required';
  end if;

  select * into v_revision
  from public.relationship_gist_revisions
  where id = p_revision_id
  for update;
  if v_revision.id is null then raise exception 'gist_revision_not_found'; end if;
  if v_revision.status not in ('draft', 'in_review', 'approved') then
    raise exception 'gist_transition_not_allowed';
  end if;

  select metadata.* into v_metadata
  from public.relationship_gist_ai_draft_metadata metadata
  where metadata.revision_id = v_revision.id;
  if v_metadata.revision_id is null then raise exception 'gist_ai_draft_not_found'; end if;
  select job.environment into v_environment
  from public.relationship_gist_ai_generation_jobs job
  where job.id = v_metadata.generation_job_id;
  if v_metadata.claims_verified_at is null then raise exception 'gist_ai_claims_verification_required'; end if;
  if exists (
    select 1 from public.relationship_gist_ai_source_suggestions source
    where source.revision_id = v_revision.id
      and source.verification_status = 'unverified'
  ) then raise exception 'gist_ai_source_review_required'; end if;
  if exists (
    select 1 from public.relationship_gist_specialist_reviews review
    where review.revision_id = v_revision.id and review.approved_at is null
  ) then raise exception 'gist_ai_specialist_review_required'; end if;
  if exists (
    select 1 from public.relationship_gist_revision_images image
    where image.revision_id = v_revision.id and image.status = 'generated'
  ) then raise exception 'gist_ai_image_review_required'; end if;

  select * into v_edition
  from public.relationship_gist_editions
  where id = v_revision.edition_id
  for update;
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
    'Superseded by owner-reviewed AI revision ' || v_revision.revision_number::text
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
      'ai_generated', true,
      'claims_attested', true,
      'source_decisions_complete', true,
      'specialist_checks_complete', true
    )
  );

  insert into public.relationship_gist_ai_owner_review_events (
    environment, revision_id, actor_user_id, action, metadata
  ) values (
    v_environment, v_revision.id, v_actor, 'published',
    jsonb_build_object(
      'owner_review', true,
      'safety_level', v_metadata.safety_level,
      'sensitive_topics', v_metadata.sensitive_topics,
      'manual_confirmation', true
    )
  );

  return jsonb_build_object(
    'edition_id', v_edition.id, 'revision_id', v_revision.id,
    'from_status', v_from, 'status', 'published',
    'published_at', v_now, 'owner_review', true
  );
end;
$$;

revoke all on function public.rpc_prepare_relationship_gist_ai_owner_topic(uuid)
  from public, anon, service_role;
revoke all on function public.rpc_owner_attest_relationship_gist_ai_claims(uuid)
  from public, anon, service_role;
revoke all on function public.rpc_owner_review_relationship_gist_ai_source(uuid,text,text)
  from public, anon, service_role;
revoke all on function public.rpc_owner_acknowledge_relationship_gist_ai_specialist_review(uuid,text,text)
  from public, anon, service_role;
revoke all on function public.rpc_owner_review_relationship_gist_ai_image(uuid,text,text)
  from public, anon, service_role;
revoke all on function public.rpc_publish_relationship_gist_ai_owner_review(uuid,text)
  from public, anon, service_role;

grant execute on function public.rpc_prepare_relationship_gist_ai_owner_topic(uuid)
  to authenticated;
grant execute on function public.rpc_owner_attest_relationship_gist_ai_claims(uuid)
  to authenticated;
grant execute on function public.rpc_owner_review_relationship_gist_ai_source(uuid,text,text)
  to authenticated;
grant execute on function public.rpc_owner_acknowledge_relationship_gist_ai_specialist_review(uuid,text,text)
  to authenticated;
grant execute on function public.rpc_owner_review_relationship_gist_ai_image(uuid,text,text)
  to authenticated;
grant execute on function public.rpc_publish_relationship_gist_ai_owner_review(uuid,text)
  to authenticated;

commit;
