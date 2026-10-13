-- Relationship Gist 2.0: immutable revisions, explicit review workflow,
-- server-authoritative scheduling and a stable saved-library projection.

begin;

create table if not exists public.relationship_gist_editions (
  id uuid primary key default gen_random_uuid(),
  legacy_gist_id uuid not null unique references public.relationship_gists(id) on delete restrict,
  lifecycle_status text not null default 'draft'
    check (lifecycle_status in (
      'draft', 'in_review', 'approved', 'scheduled', 'published',
      'superseded', 'unpublished', 'archived'
    )),
  current_revision_id uuid,
  published_revision_id uuid,
  lock_version bigint not null default 0 check (lock_version >= 0),
  targeting_enforced boolean not null default false check (targeting_enforced = false),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create table if not exists public.relationship_gist_revisions (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.relationship_gist_editions(id) on delete restrict,
  revision_number integer not null check (revision_number > 0),
  status text not null default 'draft'
    check (status in (
      'draft', 'in_review', 'approved', 'scheduled', 'published',
      'superseded', 'unpublished', 'archived'
    )),
  primary_perspective text not null default 'general'
    check (primary_perspective in (
      'general', 'christian', 'muslim', 'culture', 'safety', 'communication'
    )),
  requires_safety_review boolean not null default false,
  audience_rules jsonb not null default '{}'::jsonb check (audience_rules = '{}'::jsonb),
  -- Nullable only for imported legacy rows whose historical author cannot be
  -- mapped. All new revisions are created by authenticated RPCs and are non-null.
  authored_by_user_id uuid references auth.users(id) on delete restrict,
  source_revision_id uuid references public.relationship_gist_revisions(id) on delete restrict,
  quality_approved_by_user_id uuid references auth.users(id) on delete restrict,
  quality_approved_at timestamptz,
  safety_approved_by_user_id uuid references auth.users(id) on delete restrict,
  safety_approved_at timestamptz,
  scheduled_for timestamptz,
  published_at timestamptz,
  superseded_at timestamptz,
  unpublished_at timestamptz,
  archived_at timestamptz,
  transition_reason text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  unique (edition_id, revision_number),
  check (
    (quality_approved_by_user_id is null) = (quality_approved_at is null)
    and (safety_approved_by_user_id is null) = (safety_approved_at is null)
  )
);

create table if not exists public.relationship_gist_revision_variants (
  revision_id uuid not null references public.relationship_gist_revisions(id) on delete restrict,
  perspective text not null check (perspective in (
    'general', 'christian', 'muslim', 'culture', 'safety', 'communication'
  )),
  title text not null check (char_length(btrim(title)) between 3 and 140),
  short_body text check (short_body is null or char_length(btrim(short_body)) between 1 and 420),
  body text not null check (char_length(btrim(body)) between 20 and 5000),
  created_at timestamptz not null default timezone('utc'::text, now()),
  primary key (revision_id, perspective)
);

alter table public.relationship_gist_editions
  add constraint relationship_gist_editions_current_revision_fk
  foreign key (current_revision_id) references public.relationship_gist_revisions(id) on delete restrict;

alter table public.relationship_gist_editions
  add constraint relationship_gist_editions_published_revision_fk
  foreign key (published_revision_id) references public.relationship_gist_revisions(id) on delete restrict;

create table if not exists public.relationship_gist_editorial_audit_events (
  id bigint generated always as identity primary key,
  edition_id uuid not null references public.relationship_gist_editions(id) on delete restrict,
  revision_id uuid references public.relationship_gist_revisions(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete restrict,
  action text not null,
  from_status text,
  to_status text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists relationship_gist_revisions_edition_status_idx
  on public.relationship_gist_revisions (edition_id, status, revision_number desc);
create index if not exists relationship_gist_revisions_schedule_idx
  on public.relationship_gist_revisions (scheduled_for)
  where status = 'scheduled';
create index if not exists relationship_gist_editorial_audit_edition_idx
  on public.relationship_gist_editorial_audit_events (edition_id, occurred_at desc, id desc);

alter table public.relationship_gist_editions enable row level security;
alter table public.relationship_gist_revisions enable row level security;
alter table public.relationship_gist_revision_variants enable row level security;
alter table public.relationship_gist_editorial_audit_events enable row level security;

revoke all on table public.relationship_gist_editions from public, anon, authenticated;
revoke all on table public.relationship_gist_revisions from public, anon, authenticated;
revoke all on table public.relationship_gist_revision_variants from public, anon, authenticated;
revoke all on table public.relationship_gist_editorial_audit_events from public, anon, authenticated;
grant all on table public.relationship_gist_editions to service_role;
grant all on table public.relationship_gist_revisions to service_role;
grant all on table public.relationship_gist_revision_variants to service_role;
grant all on table public.relationship_gist_editorial_audit_events to service_role;

create or replace function public.relationship_gist_v2_reject_immutable_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'relationship_gist_immutable_record' using errcode = '55000';
  end if;
  if tg_table_name = 'relationship_gist_revision_variants' then
    raise exception 'relationship_gist_variant_immutable' using errcode = '55000';
  end if;
  if tg_table_name = 'relationship_gist_editorial_audit_events' then
    raise exception 'relationship_gist_audit_immutable' using errcode = '55000';
  end if;
  if old.edition_id is distinct from new.edition_id
    or old.revision_number is distinct from new.revision_number
    or old.primary_perspective is distinct from new.primary_perspective
    or old.requires_safety_review is distinct from new.requires_safety_review
    or old.audience_rules is distinct from new.audience_rules
    or old.authored_by_user_id is distinct from new.authored_by_user_id
    or old.source_revision_id is distinct from new.source_revision_id
    or old.created_at is distinct from new.created_at then
    raise exception 'relationship_gist_revision_immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists relationship_gist_revisions_immutable_guard
  on public.relationship_gist_revisions;
create trigger relationship_gist_revisions_immutable_guard
before update or delete on public.relationship_gist_revisions
for each row execute function public.relationship_gist_v2_reject_immutable_change();

drop trigger if exists relationship_gist_revision_variants_immutable_guard
  on public.relationship_gist_revision_variants;
create trigger relationship_gist_revision_variants_immutable_guard
before update or delete on public.relationship_gist_revision_variants
for each row execute function public.relationship_gist_v2_reject_immutable_change();

drop trigger if exists relationship_gist_editorial_audit_immutable_guard
  on public.relationship_gist_editorial_audit_events;
create trigger relationship_gist_editorial_audit_immutable_guard
before update or delete on public.relationship_gist_editorial_audit_events
for each row execute function public.relationship_gist_v2_reject_immutable_change();

revoke all on function public.relationship_gist_v2_reject_immutable_change()
  from public, anon, authenticated;

-- Backfill every legacy global Gist into a stable edition and immutable revision.
insert into public.relationship_gist_editions (
  id, legacy_gist_id, lifecycle_status, created_at, updated_at
)
select
  gist.id,
  gist.id,
  case
    when gist.status = 'published' then 'published'
    when gist.status = 'archived' then 'archived'
    else 'draft'
  end,
  gist.created_at,
  gist.updated_at
from public.relationship_gists gist
where gist.circle_id is null
on conflict (legacy_gist_id) do nothing;

insert into public.relationship_gist_revisions (
  edition_id, revision_number, status, primary_perspective,
  requires_safety_review, authored_by_user_id, published_at, archived_at,
  created_at, updated_at
)
select
  edition.id,
  1,
  case
    when gist.status = 'published' then 'published'
    when gist.status = 'archived' then 'archived'
    else 'draft'
  end,
  case when gist.perspective in (
    'general', 'christian', 'muslim', 'culture', 'safety', 'communication'
  ) then gist.perspective else 'general' end,
  gist.perspective = 'safety',
  coalesce(gist.created_by_admin_id, profile.user_id),
  case when gist.status = 'published' then coalesce(gist.published_at, gist.updated_at) end,
  case when gist.status = 'archived' then gist.updated_at end,
  gist.created_at,
  gist.updated_at
from public.relationship_gists gist
join public.relationship_gist_editions edition on edition.legacy_gist_id = gist.id
left join public.profiles profile on profile.id = gist.created_by_profile_id
where gist.circle_id is null
  and not exists (
    select 1 from public.relationship_gist_revisions revision
    where revision.edition_id = edition.id
  );

insert into public.relationship_gist_revision_variants (
  revision_id, perspective, title, short_body, body, created_at
)
select
  revision.id,
  revision.primary_perspective,
  gist.title,
  gist.short_body,
  gist.body,
  revision.created_at
from public.relationship_gist_revisions revision
join public.relationship_gist_editions edition on edition.id = revision.edition_id
join public.relationship_gists gist on gist.id = edition.legacy_gist_id
where revision.revision_number = 1
on conflict (revision_id, perspective) do nothing;

update public.relationship_gist_editions edition
set current_revision_id = revision.id,
    published_revision_id = case when revision.status = 'published' then revision.id else null end
from public.relationship_gist_revisions revision
where revision.edition_id = edition.id
  and revision.revision_number = 1
  and edition.current_revision_id is null;

create or replace function public.relationship_gist_v2_record_audit(
  p_edition_id uuid,
  p_revision_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_from_status text,
  p_to_status text,
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
volatile
security definer
set search_path = public, pg_catalog
as $$
  insert into public.relationship_gist_editorial_audit_events (
    edition_id, revision_id, actor_user_id, action, from_status, to_status,
    reason, metadata
  ) values (
    p_edition_id, p_revision_id, p_actor_user_id, p_action, p_from_status,
    p_to_status, nullif(btrim(coalesce(p_reason, '')), ''), coalesce(p_metadata, '{}'::jsonb)
  );
$$;

revoke all on function public.relationship_gist_v2_record_audit(
  uuid, uuid, uuid, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.relationship_gist_v2_record_audit(
  uuid, uuid, uuid, text, text, text, text, jsonb
) to service_role;

create or replace function public.rpc_create_relationship_gist_revision(
  p_edition_id uuid default null,
  p_legacy_gist_id uuid default null,
  p_source_revision_id uuid default null,
  p_title text default null,
  p_short_body text default null,
  p_body text default null,
  p_perspective text default 'general',
  p_requires_safety_review boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_profile uuid;
  v_edition public.relationship_gist_editions%rowtype;
  v_legacy public.relationship_gists%rowtype;
  v_revision public.relationship_gist_revisions%rowtype;
  v_revision_number integer;
  v_perspective text := lower(nullif(btrim(coalesce(p_perspective, '')), ''));
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_short_body text := nullif(btrim(coalesce(p_short_body, '')), '');
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_now timestamptz := timezone('utc'::text, now());
begin
  if v_actor is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.has_relationship_gist_editorial_capability('draft', v_actor) then
    raise exception 'editorial_draft_forbidden' using errcode = '42501';
  end if;
  select profile.id into v_actor_profile
  from public.profiles profile
  where profile.user_id = v_actor and profile.deleted_at is null
  order by profile.created_at limit 1;
  if v_actor_profile is null then raise exception 'profile_not_found' using errcode = '42501'; end if;
  if v_title is null or char_length(v_title) not between 3 and 140 then raise exception 'gist_title_invalid'; end if;
  if v_short_body is not null and char_length(v_short_body) > 420 then raise exception 'gist_short_body_invalid'; end if;
  if v_body is null or char_length(v_body) not between 20 and 5000 then raise exception 'gist_body_invalid'; end if;
  if v_perspective not in ('general','christian','muslim','culture','safety','communication') then
    raise exception 'gist_perspective_invalid';
  end if;

  if p_edition_id is not null then
    select * into v_edition from public.relationship_gist_editions where id = p_edition_id;
  elsif p_legacy_gist_id is not null then
    select * into v_edition from public.relationship_gist_editions where legacy_gist_id = p_legacy_gist_id;
  else
    insert into public.relationship_gists (
      circle_id, title, short_body, body, perspective, status,
      created_by_profile_id, created_by_admin_id, scheduled_for, published_at
    ) values (
      null, v_title, v_short_body, v_body, v_perspective, 'draft',
      v_actor_profile, v_actor, null, null
    ) returning * into v_legacy;
    insert into public.relationship_gist_editions (
      id, legacy_gist_id, lifecycle_status, created_at, updated_at
    ) values (v_legacy.id, v_legacy.id, 'draft', v_now, v_now)
    returning * into v_edition;
  end if;
  if v_edition.id is null then raise exception 'gist_edition_not_found'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_edition.id::text || ':gist-revision', 0));
  if p_source_revision_id is not null and not exists (
    select 1 from public.relationship_gist_revisions source
    where source.id = p_source_revision_id and source.edition_id = v_edition.id
  ) then raise exception 'gist_source_revision_invalid'; end if;
  select coalesce(max(revision_number), 0) + 1 into v_revision_number
  from public.relationship_gist_revisions where edition_id = v_edition.id;

  insert into public.relationship_gist_revisions (
    edition_id, revision_number, status, primary_perspective,
    requires_safety_review, authored_by_user_id, source_revision_id,
    created_at, updated_at
  ) values (
    v_edition.id, v_revision_number, 'draft', v_perspective,
    p_requires_safety_review or v_perspective = 'safety', v_actor,
    p_source_revision_id, v_now, v_now
  ) returning * into v_revision;
  insert into public.relationship_gist_revision_variants (
    revision_id, perspective, title, short_body, body, created_at
  ) values (v_revision.id, v_perspective, v_title, v_short_body, v_body, v_now);

  update public.relationship_gist_editions
  set current_revision_id = v_revision.id,
      lifecycle_status = 'draft',
      lock_version = lock_version + 1,
      updated_at = v_now
  where id = v_edition.id;

  if v_edition.published_revision_id is null then
    update public.relationship_gists
    set title = v_title, short_body = v_short_body, body = v_body,
        perspective = v_perspective, status = 'draft', updated_at = v_now
    where id = v_edition.legacy_gist_id;
  end if;

  perform public.relationship_gist_v2_record_audit(
    v_edition.id, v_revision.id, v_actor, 'revision_created', null, 'draft', null,
    jsonb_build_object('revision_number', v_revision_number, 'source_revision_id', p_source_revision_id)
  );
  return jsonb_build_object(
    'edition_id', v_edition.id,
    'legacy_gist_id', v_edition.legacy_gist_id,
    'revision_id', v_revision.id,
    'revision_number', v_revision.revision_number,
    'status', v_revision.status
  );
end;
$$;

create or replace function public.rpc_add_relationship_gist_revision_variant(
  p_revision_id uuid,
  p_title text,
  p_short_body text,
  p_body text,
  p_perspective text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_revision public.relationship_gist_revisions%rowtype;
  v_perspective text := lower(nullif(btrim(coalesce(p_perspective, '')), ''));
begin
  if v_actor is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.has_relationship_gist_editorial_capability('draft', v_actor) then
    raise exception 'editorial_draft_forbidden' using errcode = '42501';
  end if;
  select * into v_revision from public.relationship_gist_revisions where id = p_revision_id for update;
  if v_revision.id is null then raise exception 'gist_revision_not_found'; end if;
  if v_revision.status <> 'draft' then raise exception 'gist_revision_immutable'; end if;
  if v_perspective not in ('general','christian','muslim','culture','safety','communication') then
    raise exception 'gist_perspective_invalid';
  end if;
  if v_perspective = 'safety' and not v_revision.requires_safety_review then
    raise exception 'gist_safety_review_required';
  end if;
  insert into public.relationship_gist_revision_variants (
    revision_id, perspective, title, short_body, body
  ) values (
    v_revision.id, v_perspective, nullif(btrim(p_title), ''),
    nullif(btrim(coalesce(p_short_body, '')), ''), nullif(btrim(p_body), '')
  );
  perform public.relationship_gist_v2_record_audit(
    v_revision.edition_id, v_revision.id, v_actor, 'variant_added', 'draft', 'draft', null,
    jsonb_build_object('perspective', v_perspective)
  );
  return jsonb_build_object('revision_id', v_revision.id, 'perspective', v_perspective);
end;
$$;

create or replace function public.rpc_transition_relationship_gist_revision(
  p_revision_id uuid,
  p_action text,
  p_scheduled_for timestamptz default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_action text := lower(nullif(btrim(coalesce(p_action, '')), ''));
  v_revision public.relationship_gist_revisions%rowtype;
  v_edition public.relationship_gist_editions%rowtype;
  v_variant public.relationship_gist_revision_variants%rowtype;
  v_from text;
  v_to text;
  v_now timestamptz := timezone('utc'::text, now());
  v_capability text;
begin
  if v_actor is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_capability := case
    when v_action = 'submit' then 'draft'
    when v_action = 'quality_approve' then 'quality_approve'
    when v_action = 'safety_approve' then 'safety_review'
    when v_action in ('schedule','cancel_schedule','publish','unpublish') then 'publish'
    when v_action = 'archive' then 'archive'
    else null
  end;
  if v_capability is null then raise exception 'gist_transition_invalid'; end if;
  if not public.has_relationship_gist_editorial_capability(v_capability, v_actor) then
    raise exception 'editorial_%_forbidden', v_capability using errcode = '42501';
  end if;

  select * into v_revision from public.relationship_gist_revisions
  where id = p_revision_id for update;
  if v_revision.id is null then raise exception 'gist_revision_not_found'; end if;
  select * into v_edition from public.relationship_gist_editions
  where id = v_revision.edition_id for update;
  v_from := v_revision.status;

  if v_action = 'submit' then
    if v_revision.status <> 'draft' then raise exception 'gist_transition_not_allowed'; end if;
    v_to := 'in_review';
    update public.relationship_gist_revisions set status = v_to, updated_at = v_now
    where id = v_revision.id;
  elsif v_action = 'quality_approve' then
    if v_revision.status <> 'in_review' or v_revision.quality_approved_at is not null then
      raise exception 'gist_transition_not_allowed';
    end if;
    if v_revision.authored_by_user_id = v_actor then
      raise exception 'gist_self_approval_forbidden' using errcode = '42501';
    end if;
    v_to := case
      when not v_revision.requires_safety_review or v_revision.safety_approved_at is not null
        then 'approved' else 'in_review' end;
    update public.relationship_gist_revisions
    set quality_approved_by_user_id = v_actor, quality_approved_at = v_now,
        status = v_to, updated_at = v_now
    where id = v_revision.id;
  elsif v_action = 'safety_approve' then
    if v_revision.status <> 'in_review' or not v_revision.requires_safety_review
      or v_revision.safety_approved_at is not null then
      raise exception 'gist_transition_not_allowed';
    end if;
    if v_revision.authored_by_user_id = v_actor
      or v_revision.quality_approved_by_user_id = v_actor then
      raise exception 'gist_separation_of_duties_required' using errcode = '42501';
    end if;
    v_to := case when v_revision.quality_approved_at is not null then 'approved' else 'in_review' end;
    update public.relationship_gist_revisions
    set safety_approved_by_user_id = v_actor, safety_approved_at = v_now,
        status = v_to, updated_at = v_now
    where id = v_revision.id;
  elsif v_action = 'schedule' then
    if v_revision.status <> 'approved' then raise exception 'gist_revision_not_approved'; end if;
    if v_actor = v_revision.authored_by_user_id
      or v_actor = v_revision.quality_approved_by_user_id
      or v_actor = v_revision.safety_approved_by_user_id then
      raise exception 'gist_publication_separation_required' using errcode = '42501';
    end if;
    if p_scheduled_for is null or p_scheduled_for <= v_now + interval '1 minute' then
      raise exception 'gist_schedule_must_be_future';
    end if;
    v_to := 'scheduled';
    update public.relationship_gist_revisions
    set status = v_to, scheduled_for = p_scheduled_for, updated_at = v_now
    where id = v_revision.id;
  elsif v_action = 'cancel_schedule' then
    if v_revision.status <> 'scheduled' then raise exception 'gist_transition_not_allowed'; end if;
    if v_revision.scheduled_for <= v_now then raise exception 'gist_schedule_already_effective'; end if;
    v_to := 'approved';
    update public.relationship_gist_revisions
    set status = v_to, scheduled_for = null, updated_at = v_now
    where id = v_revision.id;
  elsif v_action = 'publish' then
    if v_revision.status = 'scheduled' and v_revision.scheduled_for > v_now then
      raise exception 'gist_schedule_not_due';
    end if;
    if v_revision.status not in ('approved', 'scheduled')
      or v_revision.quality_approved_at is null
      or (v_revision.requires_safety_review and v_revision.safety_approved_at is null) then
      raise exception 'gist_revision_not_approved';
    end if;
    if v_actor = v_revision.authored_by_user_id
      or v_actor = v_revision.quality_approved_by_user_id
      or v_actor = v_revision.safety_approved_by_user_id then
      raise exception 'gist_publication_separation_required' using errcode = '42501';
    end if;
    v_to := 'published';
    insert into public.relationship_gist_editorial_audit_events (
      edition_id, revision_id, actor_user_id, action, from_status, to_status, reason
    )
    select edition_id, id, v_actor, 'superseded', status, 'superseded',
      'Superseded by revision ' || v_revision.revision_number::text
    from public.relationship_gist_revisions
    where edition_id = v_revision.edition_id and status = 'published' and id <> v_revision.id;
    update public.relationship_gist_revisions
    set status = 'superseded', superseded_at = v_now, updated_at = v_now
    where edition_id = v_revision.edition_id and status = 'published' and id <> v_revision.id;
    update public.relationship_gist_revisions
    set status = v_to, published_at = v_now, scheduled_for = null, updated_at = v_now
    where id = v_revision.id;
    select * into v_variant from public.relationship_gist_revision_variants
    where revision_id = v_revision.id and perspective = v_revision.primary_perspective;
    update public.relationship_gists
    set title = v_variant.title, short_body = v_variant.short_body, body = v_variant.body,
        perspective = v_variant.perspective, status = 'published',
        scheduled_for = null, published_at = v_now, updated_at = v_now
    where id = v_edition.legacy_gist_id;
    update public.relationship_gist_editions
    set published_revision_id = v_revision.id, current_revision_id = v_revision.id,
        lifecycle_status = v_to, lock_version = lock_version + 1, updated_at = v_now
    where id = v_edition.id;
  elsif v_action = 'unpublish' then
    if v_revision.status <> 'published' then raise exception 'gist_transition_not_allowed'; end if;
    v_to := 'unpublished';
    update public.relationship_gist_revisions
    set status = v_to, unpublished_at = v_now, updated_at = v_now
    where id = v_revision.id;
    update public.relationship_gist_editions
    set published_revision_id = null, lifecycle_status = v_to,
        lock_version = lock_version + 1, updated_at = v_now
    where id = v_edition.id;
    update public.relationship_gists set status = 'archived', updated_at = v_now
    where id = v_edition.legacy_gist_id;
  elsif v_action = 'archive' then
    if v_revision.status in ('published', 'scheduled') then
      raise exception 'gist_unpublish_or_cancel_first';
    end if;
    v_to := 'archived';
    update public.relationship_gist_revisions
    set status = v_to, archived_at = v_now, updated_at = v_now
    where id = v_revision.id;
  end if;

  if v_action not in ('publish', 'unpublish') then
    update public.relationship_gist_editions
    set current_revision_id = v_revision.id, lifecycle_status = v_to,
        lock_version = lock_version + 1, updated_at = v_now
    where id = v_edition.id;
  end if;
  perform public.relationship_gist_v2_record_audit(
    v_edition.id, v_revision.id, v_actor, v_action, v_from, v_to, p_reason,
    case when p_scheduled_for is null then '{}'::jsonb
      else jsonb_build_object('scheduled_for', p_scheduled_for) end
  );
  return jsonb_build_object(
    'edition_id', v_edition.id, 'revision_id', v_revision.id,
    'from_status', v_from, 'status', v_to, 'server_time', v_now
  );
end;
$$;

create or replace function public.rpc_create_relationship_gist_rollback_revision(
  p_edition_id uuid,
  p_source_revision_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_source public.relationship_gist_revisions%rowtype;
  v_revision public.relationship_gist_revisions%rowtype;
  v_number integer;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if v_actor is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.has_relationship_gist_editorial_capability('draft', v_actor) then
    raise exception 'editorial_draft_forbidden' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'rollback_reason_required'; end if;
  select * into v_source from public.relationship_gist_revisions
  where id = p_source_revision_id and edition_id = p_edition_id;
  if v_source.id is null then raise exception 'gist_source_revision_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_edition_id::text || ':gist-revision', 0));
  select coalesce(max(revision_number), 0) + 1 into v_number
  from public.relationship_gist_revisions where edition_id = p_edition_id;
  insert into public.relationship_gist_revisions (
    edition_id, revision_number, status, primary_perspective,
    requires_safety_review, authored_by_user_id, source_revision_id,
    transition_reason, created_at, updated_at
  ) values (
    p_edition_id, v_number, 'draft', v_source.primary_perspective,
    v_source.requires_safety_review, v_actor, v_source.id,
    btrim(p_reason), v_now, v_now
  ) returning * into v_revision;
  insert into public.relationship_gist_revision_variants (
    revision_id, perspective, title, short_body, body, created_at
  )
  select v_revision.id, perspective, title, short_body, body, v_now
  from public.relationship_gist_revision_variants where revision_id = v_source.id;
  update public.relationship_gist_editions
  set current_revision_id = v_revision.id, lifecycle_status = 'draft',
      lock_version = lock_version + 1, updated_at = v_now
  where id = p_edition_id;
  perform public.relationship_gist_v2_record_audit(
    p_edition_id, v_revision.id, v_actor, 'rollback_revision_created',
    null, 'draft', p_reason, jsonb_build_object('source_revision_id', v_source.id)
  );
  return jsonb_build_object(
    'edition_id', p_edition_id, 'revision_id', v_revision.id,
    'revision_number', v_number, 'status', 'draft'
  );
end;
$$;

create or replace function public.rpc_admin_get_relationship_gist_editions()
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
  updated_at timestamptz
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
    edition.lock_version, edition.targeting_enforced, revision.updated_at
  from public.relationship_gist_editions edition
  join public.relationship_gist_revisions revision on revision.edition_id = edition.id
  join public.relationship_gist_revision_variants variant
    on variant.revision_id = revision.id
   and variant.perspective = revision.primary_perspective
  order by revision.updated_at desc, revision.revision_number desc;
end;
$$;

create or replace function public.rpc_get_global_relationship_gists()
returns table (
  id uuid,
  title text,
  short_body text,
  body text,
  perspective text,
  published_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with viewer as (
    select auth.uid() as user_id
  ), effective_revision as (
    select edition.legacy_gist_id, candidate.*
    from public.relationship_gist_editions edition
    join lateral (
      select revision.*
      from public.relationship_gist_revisions revision
      where revision.edition_id = edition.id
        and (
          revision.status = 'published'
          or (revision.status = 'scheduled' and revision.scheduled_for <= timezone('utc'::text, now()))
        )
      order by
        case when revision.status = 'scheduled' then 0 else 1 end,
        coalesce(revision.scheduled_for, revision.published_at) desc nulls last,
        revision.revision_number desc
      limit 1
    ) candidate on true
  ), ranked as (
    select
      effective.legacy_gist_id as id,
      variant.title,
      variant.short_body,
      variant.body,
      variant.perspective,
      coalesce(effective.scheduled_for, effective.published_at) as published_at,
      effective.updated_at,
      row_number() over (
        partition by variant.perspective
        order by coalesce(effective.scheduled_for, effective.published_at) desc nulls last,
          effective.revision_number desc, effective.legacy_gist_id desc
      ) as position
    from effective_revision effective
    join public.relationship_gist_revision_variants variant on variant.revision_id = effective.id
    cross join viewer
    where viewer.user_id is not null
  )
  select id, title, short_body, body, perspective, published_at, updated_at
  from ranked where position = 1
  order by published_at desc nulls last, updated_at desc;
$$;

create or replace function public.rpc_get_my_saved_relationship_gists(
  p_perspective text default null
)
returns table (
  gist_id uuid,
  edition_id uuid,
  revision_id uuid,
  title text,
  short_body text,
  body text,
  selected_perspective text,
  availability text,
  unavailable_reason text,
  progress double precision,
  last_read_at timestamptz,
  last_opened_at timestamptz,
  last_anchor text,
  last_anchor_offset double precision,
  read_acknowledged_at timestamptz,
  saved_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_profile uuid;
  v_perspective text := lower(nullif(btrim(coalesce(p_perspective, '')), ''));
begin
  if v_user is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if v_perspective is not null and v_perspective not in (
    'general','christian','muslim','culture','safety','communication'
  ) then raise exception 'gist_perspective_invalid'; end if;
  select profile.id into v_profile from public.profiles profile
  where profile.user_id = v_user and profile.deleted_at is null
  order by profile.created_at limit 1;
  if v_profile is null then raise exception 'profile_not_found' using errcode = '42501'; end if;

  return query
  with saved as (
    select state.* from public.relationship_gist_user_states state
    where state.profile_id = v_profile and state.saved = true
  ), effective as (
    select edition.id as resolved_edition_id, edition.legacy_gist_id, candidate.*
    from public.relationship_gist_editions edition
    left join lateral (
      select revision.* from public.relationship_gist_revisions revision
      where revision.edition_id = edition.id
        and (
          revision.status = 'published'
          or (revision.status = 'scheduled' and revision.scheduled_for <= timezone('utc'::text, now()))
        )
      order by case when revision.status = 'scheduled' then 0 else 1 end,
        coalesce(revision.scheduled_for, revision.published_at) desc nulls last,
        revision.revision_number desc
      limit 1
    ) candidate on true
  )
  select
    saved.gist_id,
    edition.id,
    effective.id,
    coalesce(variant.title, legacy.title),
    coalesce(variant.short_body, legacy.short_body),
    case when effective.id is null then null else variant.body end,
    coalesce(variant.perspective, legacy.perspective, 'general'),
    case when effective.id is not null then 'available' else 'unavailable' end,
    case
      when effective.id is not null then null
      when edition.lifecycle_status = 'unpublished' then 'This Gist is no longer published.'
      when edition.lifecycle_status = 'archived' then 'This Gist has been archived.'
      when edition.lifecycle_status = 'superseded' then 'This edition has been replaced.'
      else 'This Gist is temporarily unavailable while editorial review continues.'
    end,
    saved.progress,
    saved.last_read_at,
    saved.last_opened_at,
    saved.last_anchor,
    saved.last_anchor_offset,
    saved.read_acknowledged_at,
    saved.updated_at
  from saved
  join public.relationship_gists legacy on legacy.id = saved.gist_id
  left join public.relationship_gist_editions edition on edition.legacy_gist_id = saved.gist_id
  left join effective on effective.resolved_edition_id = edition.id
  left join lateral (
    select candidate.* from public.relationship_gist_revision_variants candidate
    where candidate.revision_id = effective.id
    order by
      case
        when v_perspective is not null and candidate.perspective = v_perspective then 0
        when candidate.perspective = 'general' then 1
        when candidate.perspective = effective.primary_perspective then 2
        else 3
      end,
      candidate.perspective
    limit 1
  ) variant on true
  order by saved.updated_at desc, saved.gist_id;
end;
$$;

-- Installed reader clients retain the same zero-argument and state-RPC signatures.
-- Legacy editorial publication is retained only as an adapter to an approved revision.
create or replace function public.rpc_upsert_relationship_gist_editorial(
  p_gist_id uuid default null,
  p_actor_profile_id uuid default null,
  p_title text default null,
  p_short_body text default null,
  p_body text default null,
  p_perspective text default 'general',
  p_status text default 'draft'
)
returns public.relationship_gists
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_result jsonb;
  v_gist public.relationship_gists%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if lower(btrim(coalesce(p_status, ''))) <> 'draft' then
    raise exception 'gist_v2_review_required';
  end if;
  if not exists (
    select 1 from public.profiles profile
    where profile.id = p_actor_profile_id
      and profile.user_id = auth.uid()
      and profile.deleted_at is null
  ) then raise exception 'not_authorized' using errcode = '42501'; end if;

  v_result := public.rpc_create_relationship_gist_revision(
    null,
    p_gist_id,
    null,
    p_title,
    p_short_body,
    p_body,
    p_perspective,
    lower(btrim(coalesce(p_perspective, ''))) = 'safety'
  );
  select * into v_gist from public.relationship_gists
  where id = (v_result ->> 'legacy_gist_id')::uuid;
  v_gist.title := nullif(btrim(coalesce(p_title, '')), '');
  v_gist.short_body := nullif(btrim(coalesce(p_short_body, '')), '');
  v_gist.body := nullif(btrim(coalesce(p_body, '')), '');
  v_gist.perspective := lower(nullif(btrim(coalesce(p_perspective, '')), ''));
  v_gist.status := 'draft';
  return v_gist;
end;
$$;

create or replace function public.rpc_publish_relationship_gist(p_gist_id uuid)
returns public.relationship_gists
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_revision_id uuid;
  v_gist public.relationship_gists%rowtype;
begin
  select revision.id into v_revision_id
  from public.relationship_gist_editions edition
  join public.relationship_gist_revisions revision on revision.edition_id = edition.id
  where edition.legacy_gist_id = p_gist_id and revision.status in ('approved','scheduled')
  order by revision.revision_number desc limit 1;
  if v_revision_id is null then raise exception 'gist_revision_not_approved'; end if;
  perform public.rpc_transition_relationship_gist_revision(v_revision_id, 'publish', null, 'Legacy publication adapter');
  select * into v_gist from public.relationship_gists where id = p_gist_id;
  return v_gist;
end;
$$;

create or replace function public.rpc_archive_relationship_gist_editorial(
  p_gist_id uuid,
  p_actor_profile_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_revision_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.profiles profile
    where profile.id = p_actor_profile_id
      and profile.user_id = auth.uid()
      and profile.deleted_at is null
  ) then raise exception 'not_authorized' using errcode = '42501'; end if;
  select revision.id into v_revision_id
  from public.relationship_gist_editions edition
  join public.relationship_gist_revisions revision on revision.edition_id = edition.id
  where edition.legacy_gist_id = p_gist_id
  order by revision.revision_number desc limit 1;
  if v_revision_id is null then raise exception 'gist_revision_not_found'; end if;
  perform public.rpc_transition_relationship_gist_revision(
    v_revision_id, 'archive', null, 'Legacy archive adapter'
  );
  return true;
end;
$$;

revoke all on function public.rpc_create_relationship_gist_revision(uuid,uuid,uuid,text,text,text,text,boolean)
  from public, anon;
revoke all on function public.rpc_add_relationship_gist_revision_variant(uuid,text,text,text,text)
  from public, anon;
revoke all on function public.rpc_transition_relationship_gist_revision(uuid,text,timestamptz,text)
  from public, anon;
revoke all on function public.rpc_create_relationship_gist_rollback_revision(uuid,uuid,text)
  from public, anon;
revoke all on function public.rpc_admin_get_relationship_gist_editions() from public, anon;
revoke all on function public.rpc_get_global_relationship_gists() from public, anon;
revoke all on function public.rpc_get_my_saved_relationship_gists(text) from public, anon;
revoke all on function public.rpc_upsert_relationship_gist_editorial(uuid,uuid,text,text,text,text,text)
  from public, anon;
revoke all on function public.rpc_publish_relationship_gist(uuid) from public, anon;
revoke all on function public.rpc_archive_relationship_gist_editorial(uuid,uuid)
  from public, anon;

grant execute on function public.rpc_create_relationship_gist_revision(uuid,uuid,uuid,text,text,text,text,boolean)
  to authenticated, service_role;
grant execute on function public.rpc_add_relationship_gist_revision_variant(uuid,text,text,text,text)
  to authenticated, service_role;
grant execute on function public.rpc_transition_relationship_gist_revision(uuid,text,timestamptz,text)
  to authenticated, service_role;
grant execute on function public.rpc_create_relationship_gist_rollback_revision(uuid,uuid,text)
  to authenticated, service_role;
grant execute on function public.rpc_admin_get_relationship_gist_editions()
  to authenticated, service_role;
grant execute on function public.rpc_get_global_relationship_gists()
  to authenticated, service_role;
grant execute on function public.rpc_get_my_saved_relationship_gists(text)
  to authenticated, service_role;
grant execute on function public.rpc_upsert_relationship_gist_editorial(uuid,uuid,text,text,text,text,text)
  to authenticated, service_role;
grant execute on function public.rpc_publish_relationship_gist(uuid)
  to authenticated, service_role;
grant execute on function public.rpc_archive_relationship_gist_editorial(uuid,uuid)
  to authenticated, service_role;

commit;
