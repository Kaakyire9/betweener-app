-- Relationship Gist is a global Betweener editorial surface.
-- Supabase owns current publication selection and durable reader state.

alter table public.relationship_gists
  add constraint relationship_gists_short_body_length
  check (
    short_body is null
    or char_length(btrim(short_body)) between 1 and 420
  ) not valid;

drop policy if exists relationship_gists_select_published
  on public.relationship_gists;

create policy relationship_gists_select_global_published
  on public.relationship_gists
  for select
  to authenticated
  using (
    public.is_admin_user(auth.uid())
    or (
      circle_id is null
      and status = 'published'
      and (scheduled_for is null or scheduled_for <= timezone('utc'::text, now()))
    )
  );

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
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  return query
  with ranked as (
    select
      gist.id,
      gist.title,
      gist.short_body,
      gist.body,
      gist.perspective,
      gist.published_at,
      gist.updated_at,
      row_number() over (
        partition by gist.perspective
        order by gist.published_at desc nulls last, gist.updated_at desc, gist.id desc
      ) as position
    from public.relationship_gists gist
    where gist.circle_id is null
      and gist.status = 'published'
      and (gist.scheduled_for is null or gist.scheduled_for <= timezone('utc'::text, now()))
  )
  select
    ranked.id,
    ranked.title,
    ranked.short_body,
    ranked.body,
    ranked.perspective,
    ranked.published_at,
    ranked.updated_at
  from ranked
  where ranked.position = 1
  order by ranked.published_at desc nulls last, ranked.updated_at desc;
end;
$$;

revoke all on function public.rpc_get_global_relationship_gists() from public;
revoke all on function public.rpc_get_global_relationship_gists() from anon;
grant execute on function public.rpc_get_global_relationship_gists() to authenticated;
grant execute on function public.rpc_get_global_relationship_gists() to service_role;

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
  v_gist public.relationship_gists%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_short_body text := nullif(btrim(coalesce(p_short_body, '')), '');
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_perspective text := lower(nullif(btrim(coalesce(p_perspective, '')), ''));
  v_status text := lower(nullif(btrim(coalesce(p_status, '')), ''));
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if not public.is_admin_user(auth.uid()) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles actor
    where actor.id = p_actor_profile_id
      and actor.user_id = auth.uid()
      and actor.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if v_title is null or char_length(v_title) not between 3 and 140 then
    raise exception 'gist_title_invalid';
  end if;
  if v_short_body is not null and char_length(v_short_body) > 420 then
    raise exception 'gist_short_body_invalid';
  end if;
  if v_body is null or char_length(v_body) not between 20 and 5000 then
    raise exception 'gist_body_invalid';
  end if;
  if v_perspective not in ('general', 'christian', 'muslim', 'culture', 'safety', 'communication') then
    raise exception 'gist_perspective_invalid';
  end if;
  if v_status not in ('draft', 'published') then
    raise exception 'gist_status_invalid';
  end if;

  if p_gist_id is null then
    insert into public.relationship_gists (
      circle_id, title, short_body, body, perspective, status,
      created_by_profile_id, created_by_admin_id, published_at, scheduled_for
    ) values (
      null, v_title, v_short_body, v_body, v_perspective, v_status,
      p_actor_profile_id, auth.uid(),
      case when v_status = 'published' then v_now else null end,
      null
    ) returning * into v_gist;
    return v_gist;
  end if;

  update public.relationship_gists
  set circle_id = null,
      title = v_title,
      short_body = v_short_body,
      body = v_body,
      perspective = v_perspective,
      status = v_status,
      created_by_profile_id = p_actor_profile_id,
      created_by_admin_id = auth.uid(),
      published_at = case when v_status = 'published' then v_now else null end,
      scheduled_for = null,
      updated_at = v_now
  where id = p_gist_id
    and status <> 'archived'
  returning * into v_gist;

  if v_gist.id is null then
    raise exception 'gist_not_found';
  end if;
  return v_gist;
end;
$$;

revoke execute on function public.rpc_admin_get_relationship_gists() from anon;
revoke execute on function public.rpc_archive_relationship_gist_editorial(uuid, uuid) from anon;
revoke execute on function public.rpc_publish_relationship_gist(uuid) from anon;
revoke execute on function public.rpc_upsert_relationship_gist_editorial(uuid, uuid, text, text, text, text, text) from anon;

create table if not exists public.relationship_gist_user_states (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  gist_id uuid not null references public.relationship_gists(id) on delete cascade,
  saved boolean not null default false,
  progress double precision not null default 0,
  last_read_at timestamptz,
  last_opened_at timestamptz,
  last_perspective text,
  updated_at timestamptz not null default timezone('utc'::text, now()),
  primary key (profile_id, gist_id),
  constraint relationship_gist_user_states_progress_valid
    check (progress >= 0 and progress <= 1),
  constraint relationship_gist_user_states_perspective_valid
    check (
      last_perspective is null
      or last_perspective in ('general', 'christian', 'muslim', 'culture', 'safety', 'communication')
    )
);

create index if not exists relationship_gist_user_states_saved_idx
  on public.relationship_gist_user_states (profile_id, updated_at desc)
  where saved = true;

alter table public.relationship_gist_user_states enable row level security;

create policy relationship_gist_user_states_select_own
  on public.relationship_gist_user_states
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles viewer
      where viewer.id = relationship_gist_user_states.profile_id
        and viewer.user_id = auth.uid()
        and viewer.deleted_at is null
    )
  );

revoke all on table public.relationship_gist_user_states from public;
revoke all on table public.relationship_gist_user_states from anon;
revoke all on table public.relationship_gist_user_states from authenticated;
grant select on table public.relationship_gist_user_states to authenticated;
grant all on table public.relationship_gist_user_states to service_role;

create or replace function public.rpc_upsert_relationship_gist_user_state(
  p_gist_id uuid,
  p_saved boolean default null,
  p_progress double precision default null,
  p_last_read_at timestamptz default null,
  p_mark_opened boolean default false,
  p_last_perspective text default null
)
returns public.relationship_gist_user_states
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_profile_id uuid;
  v_now timestamptz := timezone('utc'::text, now());
  v_state public.relationship_gist_user_states%rowtype;
  v_perspective text := lower(nullif(btrim(coalesce(p_last_perspective, '')), ''));
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select profile.id
  into v_profile_id
  from public.profiles profile
  where profile.user_id = auth.uid()
    and profile.deleted_at is null
  order by profile.created_at
  limit 1;

  if v_profile_id is null then
    raise exception 'profile_not_found' using errcode = '42501';
  end if;

  if p_progress is not null and (p_progress < 0 or p_progress > 1) then
    raise exception 'gist_progress_invalid';
  end if;

  if v_perspective is not null
    and v_perspective not in ('general', 'christian', 'muslim', 'culture', 'safety', 'communication') then
    raise exception 'gist_perspective_invalid';
  end if;

  if not exists (
    select 1
    from public.relationship_gists gist
    where gist.id = p_gist_id
      and gist.circle_id is null
      and gist.status = 'published'
      and (gist.scheduled_for is null or gist.scheduled_for <= v_now)
  ) then
    raise exception 'gist_not_available';
  end if;

  insert into public.relationship_gist_user_states as existing (
    profile_id,
    gist_id,
    saved,
    progress,
    last_read_at,
    last_opened_at,
    last_perspective,
    updated_at
  ) values (
    v_profile_id,
    p_gist_id,
    coalesce(p_saved, false),
    coalesce(p_progress, 0),
    p_last_read_at,
    case when p_mark_opened then v_now else null end,
    v_perspective,
    v_now
  )
  on conflict (profile_id, gist_id) do update
  set saved = coalesce(p_saved, existing.saved),
      progress = greatest(existing.progress, coalesce(p_progress, existing.progress)),
      last_read_at = case
        when p_last_read_at is null then existing.last_read_at
        when existing.last_read_at is null then p_last_read_at
        else greatest(existing.last_read_at, p_last_read_at)
      end,
      last_opened_at = case when p_mark_opened then v_now else existing.last_opened_at end,
      last_perspective = coalesce(v_perspective, existing.last_perspective),
      updated_at = v_now
  returning * into v_state;

  return v_state;
end;
$$;

revoke all on function public.rpc_upsert_relationship_gist_user_state(uuid, boolean, double precision, timestamptz, boolean, text) from public;
revoke all on function public.rpc_upsert_relationship_gist_user_state(uuid, boolean, double precision, timestamptz, boolean, text) from anon;
grant execute on function public.rpc_upsert_relationship_gist_user_state(uuid, boolean, double precision, timestamptz, boolean, text) to authenticated;
grant execute on function public.rpc_upsert_relationship_gist_user_state(uuid, boolean, double precision, timestamptz, boolean, text) to service_role;

-- Relationship Gist is global. Retire legacy Circle-scoped authoring from clients.
revoke execute on function public.rpc_create_circle_relationship_gist(uuid, uuid, text, text, text, text) from anon;
revoke execute on function public.rpc_create_circle_relationship_gist(uuid, uuid, text, text, text, text) from authenticated;
revoke execute on function public.rpc_update_circle_relationship_gist(uuid, uuid, uuid, text, text, text, text) from anon;
revoke execute on function public.rpc_update_circle_relationship_gist(uuid, uuid, uuid, text, text, text, text) from authenticated;
revoke execute on function public.rpc_delete_circle_relationship_gist(uuid, uuid, uuid) from anon;
revoke execute on function public.rpc_delete_circle_relationship_gist(uuid, uuid, uuid) from authenticated;
