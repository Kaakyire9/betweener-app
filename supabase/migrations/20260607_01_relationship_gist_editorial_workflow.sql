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
      circle_id,
      title,
      short_body,
      body,
      perspective,
      status,
      created_by_profile_id,
      created_by_admin_id,
      published_at,
      scheduled_for
    )
    values (
      null,
      v_title,
      v_short_body,
      v_body,
      v_perspective,
      v_status,
      p_actor_profile_id,
      auth.uid(),
      case when v_status = 'published' then v_now else null end,
      null
    )
    returning * into v_gist;

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
      published_at = case when v_status = 'published' then coalesce(published_at, v_now) else null end,
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

  if not public.is_admin_user(auth.uid()) then
    raise exception 'admin access required' using errcode = '42501';
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

revoke all on function public.rpc_upsert_relationship_gist_editorial(uuid, uuid, text, text, text, text, text) from public;
revoke all on function public.rpc_archive_relationship_gist_editorial(uuid, uuid) from public;

grant execute on function public.rpc_upsert_relationship_gist_editorial(uuid, uuid, text, text, text, text, text) to authenticated;
grant execute on function public.rpc_archive_relationship_gist_editorial(uuid, uuid) to authenticated;
