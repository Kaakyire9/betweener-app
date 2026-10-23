-- Relationship Gist editorial authorization is action-specific.
-- This migration depends only on the baseline internal_admins role model.

begin;

create or replace function public.has_relationship_gist_editorial_capability(
  p_action text,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select coalesce((
    select case lower(btrim(coalesce(p_action, '')))
      when 'read' then admin.role in ('operations', 'moderation', 'super_admin')
      when 'draft' then admin.role in ('operations', 'super_admin')
      -- Quality approval remains distinct from authoring and publication.
      -- The immutable review workflow introduced later will consume this action.
      when 'quality_approve' then admin.role = 'super_admin'
      -- Moderation is intentionally limited to safety review, never publishing.
      when 'safety_review' then admin.role in ('moderation', 'super_admin')
      when 'publish' then admin.role in ('operations', 'super_admin')
      when 'archive' then admin.role in ('operations', 'super_admin')
      else false
    end
    from public.internal_admins admin
    where admin.user_id = p_user_id
  ), false);
$$;

revoke all on function public.has_relationship_gist_editorial_capability(text, uuid)
  from public, anon, authenticated;
grant execute on function public.has_relationship_gist_editorial_capability(text, uuid)
  to service_role;

create or replace function public.rpc_get_my_relationship_gist_editorial_permissions()
returns table (
  can_read boolean,
  can_draft boolean,
  can_quality_approve boolean,
  can_safety_review boolean,
  can_publish boolean,
  can_archive boolean
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    public.has_relationship_gist_editorial_capability('read', auth.uid()),
    public.has_relationship_gist_editorial_capability('draft', auth.uid()),
    public.has_relationship_gist_editorial_capability('quality_approve', auth.uid()),
    public.has_relationship_gist_editorial_capability('safety_review', auth.uid()),
    public.has_relationship_gist_editorial_capability('publish', auth.uid()),
    public.has_relationship_gist_editorial_capability('archive', auth.uid())
  where auth.uid() is not null;
$$;

revoke all on function public.rpc_get_my_relationship_gist_editorial_permissions()
  from public, anon;
grant execute on function public.rpc_get_my_relationship_gist_editorial_permissions()
  to authenticated, service_role;

create or replace function public.rpc_admin_get_relationship_gists()
returns setof public.relationship_gists
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if not public.has_relationship_gist_editorial_capability('read', auth.uid()) then
    raise exception 'editorial_read_forbidden' using errcode = '42501';
  end if;

  return query
  select *
  from public.relationship_gists
  order by
    case status when 'draft' then 0 when 'published' then 1 else 2 end,
    coalesce(published_at, scheduled_for, created_at) desc;
end;
$$;

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
  v_action text;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  v_action := case when v_status = 'published' then 'publish' else 'draft' end;
  if not public.has_relationship_gist_editorial_capability(v_action, auth.uid()) then
    raise exception 'editorial_%_forbidden', v_action using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.profiles actor
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

create or replace function public.rpc_archive_relationship_gist_editorial(
  p_gist_id uuid,
  p_actor_profile_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if not public.has_relationship_gist_editorial_capability('archive', auth.uid()) then
    raise exception 'editorial_archive_forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.profiles actor
    where actor.id = p_actor_profile_id
      and actor.user_id = auth.uid()
      and actor.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.relationship_gists
  set status = 'archived',
      scheduled_for = null,
      updated_at = timezone('utc'::text, now())
  where id = p_gist_id
    and status <> 'archived';

  if not found then
    raise exception 'gist_not_found';
  end if;
  return true;
end;
$$;

create or replace function public.rpc_publish_relationship_gist(p_gist_id uuid)
returns public.relationship_gists
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_gist public.relationship_gists%rowtype;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if not public.has_relationship_gist_editorial_capability('publish', auth.uid()) then
    raise exception 'editorial_publish_forbidden' using errcode = '42501';
  end if;

  update public.relationship_gists
  set status = 'published',
      published_at = coalesce(published_at, timezone('utc'::text, now())),
      created_by_admin_id = coalesce(created_by_admin_id, auth.uid()),
      updated_at = timezone('utc'::text, now())
  where id = p_gist_id
  returning * into v_gist;

  if v_gist.id is null then
    raise exception 'gist_not_found';
  end if;
  return v_gist;
end;
$$;

revoke all on function public.rpc_admin_get_relationship_gists() from public, anon;
revoke all on function public.rpc_upsert_relationship_gist_editorial(uuid, uuid, text, text, text, text, text)
  from public, anon;
revoke all on function public.rpc_archive_relationship_gist_editorial(uuid, uuid)
  from public, anon;
revoke all on function public.rpc_publish_relationship_gist(uuid)
  from public, anon;

grant execute on function public.rpc_admin_get_relationship_gists()
  to authenticated, service_role;
grant execute on function public.rpc_upsert_relationship_gist_editorial(uuid, uuid, text, text, text, text, text)
  to authenticated, service_role;
grant execute on function public.rpc_archive_relationship_gist_editorial(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.rpc_publish_relationship_gist(uuid)
  to authenticated, service_role;

commit;
