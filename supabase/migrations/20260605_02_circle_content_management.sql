create or replace function public.rpc_update_circle_prompt(
  p_prompt_id uuid,
  p_circle_id uuid,
  p_title text,
  p_prompt text,
  p_prompt_type text default 'host',
  p_expires_at timestamptz default null
)
returns public.circle_prompts
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_prompt public.circle_prompts%rowtype;
  v_circle public.circles%rowtype;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_body text := nullif(btrim(coalesce(p_prompt, '')), '');
  v_is_admin boolean := false;
  v_can_publish boolean := false;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if p_prompt_id is null or p_circle_id is null then
    raise exception 'prompt_not_found';
  end if;

  if v_title is null or char_length(v_title) < 3 or char_length(v_title) > 120 then
    raise exception 'invalid_title';
  end if;

  if v_body is null or char_length(v_body) < 3 or char_length(v_body) > 500 then
    raise exception 'invalid_prompt';
  end if;

  if coalesce(p_prompt_type, 'host') not in ('daily', 'weekly', 'featured', 'host') then
    raise exception 'invalid_prompt_type';
  end if;

  select *
    into v_profile
  from public.profiles p
  where p.user_id = v_user_id
    and p.deleted_at is null
  limit 1;

  if v_profile.id is null then
    raise exception 'profile_not_found';
  end if;

  select *
    into v_circle
  from public.circles c
  where c.id = p_circle_id
    and c.archived_at is null
  limit 1;

  if v_circle.id is null or v_circle.status <> 'approved' then
    raise exception 'circle_not_found';
  end if;

  select *
    into v_prompt
  from public.circle_prompts cp
  where cp.id = p_prompt_id
    and cp.circle_id = p_circle_id
    and cp.status <> 'archived'
  for update;

  if v_prompt.id is null then
    raise exception 'prompt_not_found';
  end if;

  v_is_admin := public.is_admin_user(v_user_id);
  v_can_publish := v_is_admin
    or public.is_circle_owner(p_circle_id, v_user_id)
    or public.is_circle_host(p_circle_id, v_profile.id);

  if not v_can_publish then
    raise exception 'host_required' using errcode = '42501';
  end if;

  if p_expires_at is not null and p_expires_at <= timezone('utc'::text, now()) then
    raise exception 'invalid_expiry';
  end if;

  update public.circle_prompts
  set title = v_title,
      prompt = v_body,
      prompt_type = coalesce(p_prompt_type, 'host'),
      expires_at = p_expires_at,
      updated_at = timezone('utc'::text, now())
  where id = p_prompt_id
  returning * into v_prompt;

  return v_prompt;
end;
$$;

create or replace function public.rpc_delete_circle_prompt(
  p_prompt_id uuid,
  p_circle_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select *
    into v_profile
  from public.profiles p
  where p.user_id = v_user_id
    and p.deleted_at is null
  limit 1;

  if v_profile.id is null then
    raise exception 'profile_not_found';
  end if;

  if not (
    public.is_admin_user(v_user_id)
    or public.is_circle_owner(p_circle_id, v_user_id)
    or public.is_circle_host(p_circle_id, v_profile.id)
  ) then
    raise exception 'host_required' using errcode = '42501';
  end if;

  update public.circle_prompts
  set status = 'archived',
      expires_at = coalesce(expires_at, timezone('utc'::text, now())),
      updated_at = timezone('utc'::text, now())
  where id = p_prompt_id
    and circle_id = p_circle_id
    and status <> 'archived';

  update public.circle_pulse_items
  set status = 'archived'
  where circle_id = p_circle_id
    and prompt_id = p_prompt_id
    and status <> 'archived';

  return found;
end;
$$;

create or replace function public.rpc_update_circle_relationship_gist(
  p_gist_id uuid,
  p_circle_id uuid,
  p_actor_profile_id uuid,
  p_title text,
  p_short_body text,
  p_body text,
  p_perspective text default 'general'
)
returns public.relationship_gists
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_gist public.relationship_gists%rowtype;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_short_body text := nullif(btrim(coalesce(p_short_body, '')), '');
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_perspective text := lower(nullif(btrim(coalesce(p_perspective, '')), ''));
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
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

  if not public.can_manage_circle_pulse(p_circle_id, auth.uid()) then
    raise exception 'host_required' using errcode = '42501';
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

  update public.relationship_gists
  set title = v_title,
      short_body = v_short_body,
      body = v_body,
      perspective = v_perspective,
      status = 'published',
      published_at = coalesce(published_at, timezone('utc'::text, now())),
      updated_at = timezone('utc'::text, now())
  where id = p_gist_id
    and circle_id = p_circle_id
    and status <> 'archived'
  returning * into v_gist;

  if v_gist.id is null then
    raise exception 'gist_not_found';
  end if;

  return v_gist;
end;
$$;

create or replace function public.rpc_delete_circle_relationship_gist(
  p_gist_id uuid,
  p_circle_id uuid,
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

  if not exists (
    select 1
    from public.profiles actor
    where actor.id = p_actor_profile_id
      and actor.user_id = auth.uid()
      and actor.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if not public.can_manage_circle_pulse(p_circle_id, auth.uid()) then
    raise exception 'host_required' using errcode = '42501';
  end if;

  update public.relationship_gists
  set status = 'archived',
      updated_at = timezone('utc'::text, now())
  where id = p_gist_id
    and circle_id = p_circle_id
    and status <> 'archived';

  return found;
end;
$$;

drop function if exists public.rpc_update_gathering_request(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text, timestamptz, timestamptz, text, integer, text[], text, text
);

create or replace function public.rpc_update_gathering_request(
  p_gathering_id uuid,
  p_circle_id uuid default null,
  p_title text default null,
  p_description text default null,
  p_gathering_type text default 'physical',
  p_country_code text default null,
  p_country_name text default null,
  p_region text default null,
  p_city text default null,
  p_venue_name text default null,
  p_venue_address text default null,
  p_address_visibility text default 'attendees_only',
  p_online_url text default null,
  p_platform text default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_timezone text default null,
  p_max_attendees integer default null,
  p_tags text[] default '{}',
  p_safety_note text default null,
  p_poster_url text default null
)
returns public.gatherings
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_is_admin boolean;
  v_can_manage_circle boolean := false;
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_slug_base text;
  v_slug text;
  v_gathering public.gatherings%rowtype;
  v_target_circle_id uuid;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if p_gathering_id is null then
    raise exception 'gathering_not_found';
  end if;

  if v_title is null or char_length(v_title) < 3 or char_length(v_title) > 120 then
    raise exception 'invalid_title';
  end if;

  if p_gathering_type not in ('online', 'physical', 'hybrid', 'partner_venue', 'livestream') then
    raise exception 'invalid_gathering_type';
  end if;

  if p_starts_at is null or p_starts_at <= timezone('utc'::text, now()) then
    raise exception 'invalid_start_time';
  end if;

  if p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'invalid_end_time';
  end if;

  select *
    into v_profile
  from public.profiles p
  where p.user_id = v_user_id
    and p.deleted_at is null
  limit 1;

  if v_profile.id is null then
    raise exception 'profile_not_found';
  end if;

  v_is_admin := public.is_admin_user(v_user_id);

  select *
    into v_gathering
  from public.gatherings g
  where g.id = p_gathering_id
    and (
      v_is_admin
      or g.created_by_user_id = v_user_id
      or g.created_by_profile_id = v_profile.id
      or (g.circle_id is not null and public.can_manage_circle_pulse(g.circle_id, v_user_id))
    )
  for update;

  if v_gathering.id is null then
    raise exception 'gathering_not_found';
  end if;

  v_can_manage_circle := v_gathering.circle_id is not null and public.can_manage_circle_pulse(v_gathering.circle_id, v_user_id);

  if not v_is_admin and not v_can_manage_circle and not public.has_gold_entitlement(v_user_id, v_profile.id) then
    raise exception 'gold_required' using errcode = '42501';
  end if;

  if not v_is_admin and v_gathering.status not in ('draft', 'pending_review', 'approved', 'rejected') then
    raise exception 'gathering_not_editable';
  end if;

  v_target_circle_id := coalesce(p_circle_id, v_gathering.circle_id);

  if v_target_circle_id is not null and not exists (
    select 1
    from public.circles c
    where c.id = v_target_circle_id
      and (c.status = 'approved' or c.created_by_user_id = v_user_id or v_is_admin)
  ) then
    raise exception 'circle_not_found';
  end if;

  v_slug_base := public.slugify(v_title);
  v_slug := case
    when v_gathering.slug is null or public.slugify(coalesce(v_gathering.title, '')) <> v_slug_base then v_slug_base
    else v_gathering.slug
  end;

  while exists (
    select 1
    from public.gatherings g
    where g.id <> p_gathering_id
      and g.slug = v_slug
  ) loop
    v_slug := v_slug_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  end loop;

  update public.gatherings
  set circle_id = v_target_circle_id,
      title = v_title,
      slug = v_slug,
      description = nullif(btrim(coalesce(p_description, '')), ''),
      poster_url = nullif(btrim(coalesce(p_poster_url, '')), ''),
      gathering_type = p_gathering_type,
      status = case
        when v_is_admin then 'approved'
        when v_gathering.status = 'approved' then 'approved'
        else 'pending_review'
      end,
      country_code = upper(nullif(btrim(coalesce(p_country_code, '')), '')),
      country_name = nullif(btrim(coalesce(p_country_name, '')), ''),
      region = nullif(btrim(coalesce(p_region, '')), ''),
      city = nullif(btrim(coalesce(p_city, '')), ''),
      venue_name = nullif(btrim(coalesce(p_venue_name, '')), ''),
      venue_address = nullif(btrim(coalesce(p_venue_address, '')), ''),
      address_visibility = case
        when v_is_admin then coalesce(nullif(p_address_visibility, ''), 'attendees_only')
        when p_gathering_type in ('physical', 'hybrid', 'partner_venue') then 'attendees_only'
        else coalesce(nullif(p_address_visibility, ''), 'hidden')
      end,
      online_url = nullif(btrim(coalesce(p_online_url, '')), ''),
      platform = nullif(btrim(coalesce(p_platform, '')), ''),
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      timezone = p_timezone,
      is_official = v_is_admin,
      is_partner_venue = v_is_admin and p_gathering_type = 'partner_venue',
      safe_first_date_space = case when v_is_admin then v_gathering.safe_first_date_space else false end,
      max_attendees = p_max_attendees,
      approved_by_admin_id = case when v_is_admin then v_user_id else approved_by_admin_id end,
      approved_at = case when v_is_admin then timezone('utc'::text, now()) else approved_at end,
      tags = coalesce(p_tags, '{}'),
      safety_note = nullif(btrim(coalesce(p_safety_note, '')), ''),
      rejected_reason = null,
      updated_at = timezone('utc'::text, now())
  where id = p_gathering_id
  returning * into v_gathering;

  return v_gathering;
end;
$$;

create or replace function public.rpc_delete_gathering_request(
  p_gathering_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_circle_id uuid;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select *
    into v_profile
  from public.profiles p
  where p.user_id = v_user_id
    and p.deleted_at is null
  limit 1;

  if v_profile.id is null then
    raise exception 'profile_not_found';
  end if;

  select g.circle_id
    into v_circle_id
  from public.gatherings g
  where g.id = p_gathering_id
    and (
      public.is_admin_user(v_user_id)
      or g.created_by_user_id = v_user_id
      or g.created_by_profile_id = v_profile.id
      or (g.circle_id is not null and public.can_manage_circle_pulse(g.circle_id, v_user_id))
    )
  limit 1;

  if v_circle_id is null then
    raise exception 'gathering_not_found';
  end if;

  update public.gatherings
  set status = 'archived',
      cancelled_at = coalesce(cancelled_at, timezone('utc'::text, now())),
      updated_at = timezone('utc'::text, now())
  where id = p_gathering_id
    and status <> 'archived';

  update public.circle_pulse_items
  set status = 'archived'
  where gathering_id = p_gathering_id
    and status <> 'archived';

  return found;
end;
$$;

revoke all on function public.rpc_update_circle_prompt(uuid, uuid, text, text, text, timestamptz) from public;
revoke all on function public.rpc_delete_circle_prompt(uuid, uuid) from public;
revoke all on function public.rpc_update_circle_relationship_gist(uuid, uuid, uuid, text, text, text, text) from public;
revoke all on function public.rpc_delete_circle_relationship_gist(uuid, uuid, uuid) from public;
revoke all on function public.rpc_update_gathering_request(uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text, timestamptz, timestamptz, text, integer, text[], text, text) from public;
revoke all on function public.rpc_delete_gathering_request(uuid) from public;

grant execute on function public.rpc_update_circle_prompt(uuid, uuid, text, text, text, timestamptz) to authenticated;
grant execute on function public.rpc_delete_circle_prompt(uuid, uuid) to authenticated;
grant execute on function public.rpc_update_circle_relationship_gist(uuid, uuid, uuid, text, text, text, text) to authenticated;
grant execute on function public.rpc_delete_circle_relationship_gist(uuid, uuid, uuid) to authenticated;
grant execute on function public.rpc_update_gathering_request(uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text, timestamptz, timestamptz, text, integer, text[], text, text) to authenticated;
grant execute on function public.rpc_delete_gathering_request(uuid) to authenticated;
