create or replace function public.rpc_update_circle_request(
  p_circle_id uuid,
  p_name text,
  p_description text default null,
  p_short_description text default null,
  p_circle_type text default 'gold_community',
  p_visibility_scope text default 'country',
  p_country_code text default null,
  p_country_name text default null,
  p_region text default null,
  p_city text default null,
  p_diaspora_tags text[] default '{}',
  p_culture_tags text[] default '{}',
  p_faith_tags text[] default '{}',
  p_interest_tags text[] default '{}',
  p_audience_tags text[] default '{}',
  p_requires_join_approval boolean default false,
  p_rules text default null
)
returns public.circles
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_is_admin boolean;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_circle public.circles%rowtype;
  v_slug_base text;
  v_slug text;
  v_status text;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if p_circle_id is null then
    raise exception 'circle_not_found';
  end if;

  if v_name is null or char_length(v_name) < 3 or char_length(v_name) > 80 then
    raise exception 'invalid_name';
  end if;

  if p_visibility_scope not in ('local', 'country', 'diaspora', 'global', 'invite_only') then
    raise exception 'invalid_visibility';
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

  if not v_is_admin and not public.has_gold_entitlement(v_user_id, v_profile.id) then
    raise exception 'gold_required' using errcode = '42501';
  end if;

  select *
    into v_circle
  from public.circles c
  where c.id = p_circle_id
    and c.archived_at is null
    and (
      v_is_admin
      or c.created_by_user_id = v_user_id
      or c.created_by_profile_id = v_profile.id
    )
  for update;

  if v_circle.id is null then
    raise exception 'circle_not_found';
  end if;

  if not v_is_admin and v_circle.status not in ('draft', 'pending_review', 'rejected') then
    raise exception 'circle_not_editable';
  end if;

  if not v_is_admin and coalesce(p_circle_type, 'gold_community') not in ('gold_community', 'community', 'private') then
    raise exception 'invalid_circle_type';
  end if;

  v_slug_base := public.slugify(v_name);
  v_slug := case
    when v_circle.slug is null or public.slugify(coalesce(v_circle.name, '')) <> v_slug_base then v_slug_base
    else v_circle.slug
  end;

  if exists (
    select 1
    from public.circles c
    where c.id <> p_circle_id
      and c.status = 'approved'
      and public.slugify(c.name) = v_slug_base
      and coalesce(upper(c.country_code), '') = coalesce(upper(p_country_code), '')
      and coalesce(lower(c.city), '') = coalesce(lower(p_city), '')
      and c.archived_at is null
  ) then
    raise exception 'duplicate_circle';
  end if;

  while exists (
    select 1
    from public.circles c
    where c.id <> p_circle_id
      and c.slug = v_slug
  ) loop
    v_slug := v_slug_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  end loop;

  v_status := case when v_is_admin then 'approved' else 'pending_review' end;

  update public.circles
  set name = v_name,
      slug = v_slug,
      description = nullif(btrim(coalesce(p_description, '')), ''),
      short_description = nullif(btrim(coalesce(p_short_description, '')), ''),
      visibility = case when p_visibility_scope = 'invite_only' or p_circle_type = 'private' then 'private' else 'public' end,
      circle_type = case
        when v_is_admin then coalesce(nullif(p_circle_type, ''), v_circle.circle_type, 'official')
        when p_circle_type = 'private' then 'private'
        else 'gold_community'
      end,
      status = v_status,
      visibility_scope = p_visibility_scope,
      country_code = upper(nullif(btrim(coalesce(p_country_code, '')), '')),
      country_name = nullif(btrim(coalesce(p_country_name, '')), ''),
      region = nullif(btrim(coalesce(p_region, '')), ''),
      city = nullif(btrim(coalesce(p_city, '')), ''),
      diaspora_tags = coalesce(p_diaspora_tags, '{}'),
      culture_tags = coalesce(p_culture_tags, '{}'),
      faith_tags = coalesce(p_faith_tags, '{}'),
      interest_tags = coalesce(p_interest_tags, '{}'),
      audience_tags = coalesce(p_audience_tags, '{}'),
      is_official = v_is_admin and coalesce(p_circle_type, 'official') = 'official',
      is_partner = v_is_admin and coalesce(p_circle_type, '') = 'partner',
      requires_join_approval = coalesce(p_requires_join_approval, false),
      rejected_reason = null,
      approved_by_admin_id = case when v_is_admin then v_user_id else null end,
      approved_at = case when v_is_admin then timezone('utc'::text, now()) else null end,
      rules = nullif(btrim(coalesce(p_rules, '')), ''),
      updated_at = timezone('utc'::text, now())
  where id = p_circle_id
  returning * into v_circle;

  return v_circle;
end;
$$;

grant execute on function public.rpc_update_circle_request(
  uuid, text, text, text, text, text, text, text, text, text, text[], text[], text[], text[], text[], boolean, text
) to authenticated;

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
  p_safety_note text default null
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
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_slug_base text;
  v_slug text;
  v_gathering public.gatherings%rowtype;
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

  if not v_is_admin and not public.has_gold_entitlement(v_user_id, v_profile.id) then
    raise exception 'gold_required' using errcode = '42501';
  end if;

  select *
    into v_gathering
  from public.gatherings g
  where g.id = p_gathering_id
    and (
      v_is_admin
      or g.created_by_user_id = v_user_id
      or g.created_by_profile_id = v_profile.id
    )
  for update;

  if v_gathering.id is null then
    raise exception 'gathering_not_found';
  end if;

  if not v_is_admin and v_gathering.status not in ('draft', 'pending_review', 'rejected') then
    raise exception 'gathering_not_editable';
  end if;

  if p_circle_id is not null and not exists (
    select 1
    from public.circles c
    where c.id = p_circle_id
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
  set circle_id = p_circle_id,
      title = v_title,
      slug = v_slug,
      description = nullif(btrim(coalesce(p_description, '')), ''),
      gathering_type = p_gathering_type,
      status = case when v_is_admin then 'approved' else 'pending_review' end,
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
      approved_by_admin_id = case when v_is_admin then v_user_id else null end,
      approved_at = case when v_is_admin then timezone('utc'::text, now()) else null end,
      tags = coalesce(p_tags, '{}'),
      safety_note = nullif(btrim(coalesce(p_safety_note, '')), ''),
      rejected_reason = null,
      updated_at = timezone('utc'::text, now())
  where id = p_gathering_id
  returning * into v_gathering;

  return v_gathering;
end;
$$;

grant execute on function public.rpc_update_gathering_request(
  uuid, uuid, text, text, text, text, text, text, text, text, text, text, text, text, timestamptz, timestamptz, text, integer, text[], text
) to authenticated;
