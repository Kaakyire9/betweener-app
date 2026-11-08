-- Make Live audience eligibility server authoritative without changing legacy
-- scheduling or reader RPC signatures. Circle Live inherits Circle Reach and
-- direct Live sessions created through v2 receive an explicit policy.

create table if not exists public.live_session_audience_policies (
  session_id uuid primary key references public.live_sessions(id) on delete cascade,
  policy_mode text not null default 'explicit',
  reach_scopes text[] not null default array['global']::text[],
  country_code text,
  country_name text,
  region text,
  city text,
  diaspora_origin_country_codes text[] not null default '{}'::text[],
  diaspora_destination_country_codes text[] not null default '{}'::text[],
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint live_session_audience_policy_mode_check
    check (policy_mode in ('explicit', 'inherit_circle', 'legacy_public')),
  constraint live_session_audience_reach_count_check
    check (cardinality(reach_scopes) between 0 and 2),
  constraint live_session_audience_reach_values_check
    check (reach_scopes <@ array['global','country','local','diaspora','circle_members','invite_only']::text[]),
  constraint live_session_audience_diaspora_country_count_check
    check (
      cardinality(diaspora_origin_country_codes) <= 12
      and cardinality(diaspora_destination_country_codes) <= 24
    )
);

alter table public.live_session_audience_policies enable row level security;
revoke all on table public.live_session_audience_policies from public, anon, authenticated;

create or replace function public.normalize_live_session_audience_policy_v1()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_circle_id uuid;
begin
  new.policy_mode := lower(btrim(coalesce(new.policy_mode, 'explicit')));
  new.country_code := nullif(upper(btrim(coalesce(new.country_code, ''))), '');
  new.country_name := nullif(btrim(coalesce(new.country_name, '')), '');
  new.region := nullif(btrim(coalesce(new.region, '')), '');
  new.city := nullif(btrim(coalesce(new.city, '')), '');

  select coalesce(array_agg(value order by value), '{}'::text[])
    into new.reach_scopes
  from (
    select distinct lower(btrim(item)) as value
    from unnest(coalesce(new.reach_scopes, '{}'::text[])) item
    where lower(btrim(item)) = any(array[
      'global','country','local','diaspora','circle_members','invite_only'
    ]::text[])
  ) normalized;

  select coalesce(array_agg(value order by value), '{}'::text[])
    into new.diaspora_origin_country_codes
  from (
    select distinct upper(btrim(item)) as value
    from unnest(coalesce(new.diaspora_origin_country_codes, '{}'::text[])) item
    where btrim(item) ~* '^[a-z]{2}$'
  ) normalized;

  select coalesce(array_agg(value order by value), '{}'::text[])
    into new.diaspora_destination_country_codes
  from (
    select distinct upper(btrim(item)) as value
    from unnest(coalesce(new.diaspora_destination_country_codes, '{}'::text[])) item
    where btrim(item) ~* '^[a-z]{2}$'
  ) normalized;

  select session.circle_id into v_circle_id
  from public.live_sessions session
  where session.id = new.session_id;

  if new.policy_mode = 'inherit_circle' then
    if v_circle_id is null then
      raise exception 'live_audience_circle_required' using errcode = '22023';
    end if;
    new.reach_scopes := '{}'::text[];
    new.country_code := null;
    new.country_name := null;
    new.region := null;
    new.city := null;
    new.diaspora_origin_country_codes := '{}'::text[];
    new.diaspora_destination_country_codes := '{}'::text[];
  elsif new.policy_mode = 'legacy_public' then
    new.reach_scopes := '{}'::text[];
    new.country_code := null;
    new.country_name := null;
    new.region := null;
    new.city := null;
    new.diaspora_origin_country_codes := '{}'::text[];
    new.diaspora_destination_country_codes := '{}'::text[];
  else
    if cardinality(new.reach_scopes) < 1 then
      raise exception 'live_audience_scope_required' using errcode = '22023';
    end if;
    if ('global' = any(new.reach_scopes) or 'invite_only' = any(new.reach_scopes)
        or 'circle_members' = any(new.reach_scopes))
       and cardinality(new.reach_scopes) <> 1 then
      raise exception 'live_audience_scope_combination_invalid' using errcode = '22023';
    end if;
    if 'local' = any(new.reach_scopes) and 'country' = any(new.reach_scopes) then
      raise exception 'live_audience_scope_combination_invalid' using errcode = '22023';
    end if;
    if ('country' = any(new.reach_scopes) or 'local' = any(new.reach_scopes))
       and new.country_code is null and new.country_name is null then
      raise exception 'live_audience_country_required' using errcode = '22023';
    end if;
    if 'local' = any(new.reach_scopes) and new.city is null then
      raise exception 'live_audience_city_required' using errcode = '22023';
    end if;
    if 'diaspora' = any(new.reach_scopes)
       and cardinality(new.diaspora_origin_country_codes) = 0 then
      raise exception 'live_audience_diaspora_origin_required' using errcode = '22023';
    end if;
  end if;

  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists live_session_audience_policy_normalize_v1
on public.live_session_audience_policies;
create trigger live_session_audience_policy_normalize_v1
before insert or update on public.live_session_audience_policies
for each row execute function public.normalize_live_session_audience_policy_v1();

revoke all on function public.normalize_live_session_audience_policy_v1()
from public, anon, authenticated, service_role;

create or replace function public.ensure_live_session_audience_policy_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  insert into public.live_session_audience_policies(
    session_id,
    policy_mode,
    reach_scopes
  ) values (
    new.id,
    case
      when new.circle_id is not null then 'inherit_circle'
      when new.context_type = 'diaspora' then 'legacy_public'
      else 'explicit'
    end,
    case
      when new.circle_id is not null or new.context_type = 'diaspora' then '{}'::text[]
      when new.context_type in ('global','match_night','special_event') then array['global']::text[]
      else array['invite_only']::text[]
    end
  ) on conflict (session_id) do nothing;
  return new;
end;
$$;

drop trigger if exists live_sessions_ensure_audience_policy_v1 on public.live_sessions;
create trigger live_sessions_ensure_audience_policy_v1
after insert on public.live_sessions
for each row execute function public.ensure_live_session_audience_policy_v1();

revoke all on function public.ensure_live_session_audience_policy_v1()
from public, anon, authenticated, service_role;

insert into public.live_session_audience_policies(session_id, policy_mode, reach_scopes)
select
  session.id,
  case
    when session.circle_id is not null then 'inherit_circle'
    when session.context_type = 'diaspora' then 'legacy_public'
    else 'explicit'
  end,
  case
    when session.circle_id is not null or session.context_type = 'diaspora' then '{}'::text[]
    when session.context_type in ('global','match_night','special_event') then array['global']::text[]
    else array['invite_only']::text[]
  end
from public.live_sessions session
on conflict (session_id) do nothing;

create or replace function public.live_circle_reach_matches_user_v1(
  p_circle_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  with viewer as (
    select
      upper(btrim(coalesce(profile.current_country_code, ''))) as current_country_code,
      upper(btrim(coalesce(profile.origin_country_code, ''))) as origin_country_code,
      public.normalize_location_key(profile.current_country) as current_country_key,
      public.normalize_location_key(profile.city) as city_key
    from public.profiles profile
    where profile.user_id = p_user_id
      and profile.deleted_at is null
      and profile.account_state = 'active'
      and coalesce(profile.is_active, true)
    limit 1
  ), target as (
    select
      circle.*,
      case
        when cardinality(coalesce(circle.reach_scopes, '{}'::text[])) > 0
          then circle.reach_scopes
        else array[lower(btrim(coalesce(nullif(circle.reach_scope, ''), nullif(circle.visibility_scope, ''), 'country')))]::text[]
      end as resolved_reaches
    from public.circles circle
    where circle.id = p_circle_id
  )
  select coalesce(
    public.is_circle_member(p_circle_id, p_user_id)
    or exists (
      select 1
      from target circle
      join viewer on true
      where
        'global' = any(circle.resolved_reaches)
        or (
          'country' = any(circle.resolved_reaches)
          and (
            (
              viewer.current_country_code <> ''
              and upper(btrim(coalesce(circle.country_code, ''))) <> ''
              and viewer.current_country_code = upper(btrim(circle.country_code))
            )
            or (
              viewer.current_country_key is not null
              and public.normalize_location_key(circle.country_name) is not null
              and viewer.current_country_key = public.normalize_location_key(circle.country_name)
            )
          )
        )
        or (
          'local' = any(circle.resolved_reaches)
          and viewer.city_key is not null
          and public.normalize_location_key(circle.city) is not null
          and viewer.city_key = public.normalize_location_key(circle.city)
          and (
            (
              viewer.current_country_code <> ''
              and upper(btrim(coalesce(circle.country_code, ''))) <> ''
              and viewer.current_country_code = upper(btrim(circle.country_code))
            )
            or (
              viewer.current_country_key is not null
              and public.normalize_location_key(circle.country_name) is not null
              and viewer.current_country_key = public.normalize_location_key(circle.country_name)
            )
          )
        )
        or (
          'diaspora' = any(circle.resolved_reaches)
          and viewer.origin_country_code <> ''
          and viewer.current_country_code <> ''
          and viewer.current_country_code <> viewer.origin_country_code
          and viewer.origin_country_code = any(coalesce(circle.diaspora_origin_country_codes, '{}'::text[]))
          and (
            cardinality(coalesce(circle.diaspora_destination_country_codes, '{}'::text[])) = 0
            or viewer.current_country_code = any(circle.diaspora_destination_country_codes)
          )
        )
    ),
    false
  );
$$;

revoke all on function public.live_circle_reach_matches_user_v1(uuid, uuid)
from public, anon, authenticated, service_role;

create or replace function public.live_audience_policy_matches_user_v1(
  p_session_id uuid,
  p_user_id uuid default auth.uid(),
  p_purpose text default 'admission'
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
  v_policy public.live_session_audience_policies;
  v_profile public.profiles;
  v_same_country boolean := false;
  v_same_city boolean := false;
  v_diaspora_match boolean := false;
begin
  if p_user_id is null then return false; end if;
  if lower(btrim(coalesce(p_purpose, 'admission'))) not in ('admission', 'discovery') then
    raise exception 'live_audience_purpose_invalid' using errcode = '22023';
  end if;

  select * into v_session from public.live_sessions where id = p_session_id;
  if v_session.id is null then return false; end if;

  if public.is_admin_user(p_user_id)
     or v_session.created_by_user_id = p_user_id
     or exists (
       select 1 from public.live_participants participant
       where participant.session_id = p_session_id
         and participant.user_id = p_user_id
         and participant.state <> 'banned'
     ) then
    return true;
  end if;

  select * into v_policy
  from public.live_session_audience_policies
  where session_id = p_session_id;

  if v_policy.session_id is null or v_policy.policy_mode = 'legacy_public' then
    return v_session.context_type in ('global','match_night','diaspora','special_event');
  end if;

  if v_policy.policy_mode = 'inherit_circle' then
    if lower(btrim(coalesce(p_purpose, 'admission'))) = 'discovery' then
      return public.live_circle_reach_matches_user_v1(v_session.circle_id, p_user_id);
    end if;
    return public.is_circle_member(v_session.circle_id, p_user_id);
  end if;

  if 'global' = any(v_policy.reach_scopes) then return true; end if;
  if 'invite_only' = any(v_policy.reach_scopes) then return false; end if;
  if 'circle_members' = any(v_policy.reach_scopes) then
    return v_session.circle_id is not null
      and public.is_circle_member(v_session.circle_id, p_user_id);
  end if;

  select * into v_profile
  from public.profiles profile
  where profile.user_id = p_user_id
    and profile.deleted_at is null
    and profile.account_state = 'active'
    and coalesce(profile.is_active, true)
  limit 1;
  if v_profile.id is null then return false; end if;

  v_same_country := (
    nullif(upper(btrim(coalesce(v_profile.current_country_code, ''))), '') is not null
    and v_policy.country_code is not null
    and upper(btrim(v_profile.current_country_code)) = v_policy.country_code
  ) or (
    public.normalize_location_key(v_profile.current_country) is not null
    and public.normalize_location_key(v_policy.country_name) is not null
    and public.normalize_location_key(v_profile.current_country)
      = public.normalize_location_key(v_policy.country_name)
  );
  v_same_city := v_same_country
    and public.normalize_location_key(v_profile.city) is not null
    and public.normalize_location_key(v_policy.city) is not null
    and public.normalize_location_key(v_profile.city)
      = public.normalize_location_key(v_policy.city);
  v_diaspora_match := (
    nullif(upper(btrim(coalesce(v_profile.origin_country_code, ''))), '') is not null
    and nullif(upper(btrim(coalesce(v_profile.current_country_code, ''))), '') is not null
    and upper(btrim(v_profile.current_country_code)) <> upper(btrim(v_profile.origin_country_code))
    and upper(btrim(v_profile.origin_country_code)) = any(v_policy.diaspora_origin_country_codes)
    and (
      cardinality(v_policy.diaspora_destination_country_codes) = 0
      or upper(btrim(v_profile.current_country_code)) = any(v_policy.diaspora_destination_country_codes)
    )
  );

  return ('country' = any(v_policy.reach_scopes) and v_same_country)
    or ('local' = any(v_policy.reach_scopes) and v_same_city)
    or ('diaspora' = any(v_policy.reach_scopes) and v_diaspora_match);
end;
$$;

revoke all on function public.live_audience_policy_matches_user_v1(uuid, uuid, text)
from public, anon, authenticated, service_role;

create or replace function public.can_view_live_session(
  p_session_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_allowed boolean;
begin
  if p_user_id is null then return false; end if;
  if p_user_id is distinct from auth.uid()
     and coalesce(auth.role(), '') <> 'service_role'
     and not public.is_admin_user(auth.uid()) then
    raise exception 'live_session_subject_forbidden' using errcode = '42501';
  end if;

  select exists (
    select 1
    from public.live_sessions session
    where session.id = p_session_id
      and (
        public.is_admin_user(p_user_id)
        or session.created_by_user_id = p_user_id
        or exists (
          select 1 from public.live_participants participant
          where participant.session_id = session.id
            and participant.user_id = p_user_id
            and participant.state <> 'banned'
        )
        or (
          session.status in ('scheduled','waiting_for_quorum','confirmed','backstage','live','ending')
          and public.live_audience_policy_matches_user_v1(session.id, p_user_id, 'admission')
        )
      )
  ) into v_allowed;
  return coalesce(v_allowed, false);
end;
$$;

create or replace function public.rpc_list_discoverable_circle_live_previews(
  p_limit integer default 24
)
returns table(
  session_id uuid,
  circle_id uuid,
  circle_name text,
  circle_slug text,
  live_title text,
  live_description text,
  live_status text,
  scheduled_start timestamptz,
  poster_path text,
  reach_scope text,
  access_policy text,
  country_code text,
  country_name text,
  region text,
  city text,
  member_count integer,
  viewer_membership_status text
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  return query
  select
    session.id,
    circle.id,
    circle.name,
    circle.slug,
    session.title,
    session.description,
    session.status,
    session.scheduled_start,
    session.configuration #>> '{event_media,poster_path}',
    circle.reach_scope,
    circle.access_policy,
    circle.country_code,
    circle.country_name,
    circle.region,
    circle.city,
    circle.member_count,
    membership.status
  from public.live_sessions session
  join public.circles circle on circle.id = session.circle_id
  left join public.circle_members membership
    on membership.circle_id = circle.id
   and membership.user_id = auth.uid()
   and membership.left_at is null
  where session.context_type = 'circle'
    and session.status in ('scheduled', 'waiting_for_quorum', 'confirmed', 'backstage', 'live')
    and circle.status = 'approved'
    and circle.archived_at is null
    and circle.visibility = 'public'
    and circle.access_policy <> 'invite_only'
    and circle.live_discovery_policy = 'discoverable_join_required'
    and public.live_audience_policy_matches_user_v1(session.id, auth.uid(), 'discovery')
  order by
    case when session.status in ('live', 'backstage') then 0 else 1 end,
    session.scheduled_start asc nulls last,
    session.created_at desc
  limit least(greatest(coalesce(p_limit, 24), 1), 48);
end;
$$;

create or replace function public.rpc_set_live_session_audience_policy_v1(
  p_session_id uuid,
  p_expected_version bigint,
  p_reach_scopes text[],
  p_country_code text default null,
  p_country_name text default null,
  p_region text default null,
  p_city text default null,
  p_diaspora_origin_country_codes text[] default '{}'::text[],
  p_diaspora_destination_country_codes text[] default '{}'::text[]
)
returns public.live_session_audience_policies
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session public.live_sessions;
  v_policy public.live_session_audience_policies;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  select * into v_session
  from public.live_sessions session
  where session.id = p_session_id
  for update;
  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;
  if v_session.created_by_user_id <> auth.uid()
     and not public.is_admin_user(auth.uid()) then
    raise exception 'live_audience_manage_forbidden' using errcode = '42501';
  end if;
  if v_session.version <> p_expected_version then
    raise exception 'live_session_version_conflict' using errcode = '40001';
  end if;
  if v_session.status not in ('scheduled','waiting_for_quorum','confirmed') then
    raise exception 'live_audience_edit_locked' using errcode = '23514';
  end if;
  if v_session.circle_id is not null then
    raise exception 'circle_live_audience_inherited' using errcode = '23514';
  end if;

  insert into public.live_session_audience_policies(
    session_id, policy_mode, reach_scopes, country_code, country_name, region, city,
    diaspora_origin_country_codes, diaspora_destination_country_codes
  ) values (
    v_session.id, 'explicit', p_reach_scopes, p_country_code, p_country_name, p_region, p_city,
    coalesce(p_diaspora_origin_country_codes, '{}'::text[]),
    coalesce(p_diaspora_destination_country_codes, '{}'::text[])
  )
  on conflict (session_id) do update set
    policy_mode = excluded.policy_mode,
    reach_scopes = excluded.reach_scopes,
    country_code = excluded.country_code,
    country_name = excluded.country_name,
    region = excluded.region,
    city = excluded.city,
    diaspora_origin_country_codes = excluded.diaspora_origin_country_codes,
    diaspora_destination_country_codes = excluded.diaspora_destination_country_codes
  returning * into v_policy;

  insert into public.live_session_events(
    session_id, actor_user_id, event_type, to_state, metadata
  ) values (
    v_session.id,
    auth.uid(),
    'audience_policy_updated',
    v_session.status,
    jsonb_build_object('reach_scopes', v_policy.reach_scopes)
  );
  return v_policy;
end;
$$;

create or replace function public.rpc_schedule_live_studio_session_v2(
  p_client_request_id uuid,
  p_title text,
  p_description text,
  p_scheduled_start timestamptz,
  p_duration_minutes integer,
  p_format text default 'hosted_match_night',
  p_chemistry_first_enabled boolean default false,
  p_circle_id uuid default null,
  p_minimum_participants integer default 2,
  p_audience_scopes text[] default array['global']::text[],
  p_country_code text default null,
  p_country_name text default null,
  p_region text default null,
  p_city text default null,
  p_diaspora_origin_country_codes text[] default '{}'::text[],
  p_diaspora_destination_country_codes text[] default '{}'::text[]
)
returns public.live_sessions
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_existing public.live_sessions;
  v_session public.live_sessions;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into v_existing
  from public.live_sessions session
  where session.created_by_user_id = auth.uid()
    and session.creation_request_id = p_client_request_id;
  if v_existing.id is not null then return v_existing; end if;

  v_session := public.rpc_schedule_live_studio_session_v1(
    p_client_request_id,
    p_title,
    p_description,
    p_scheduled_start,
    p_duration_minutes,
    p_format,
    p_chemistry_first_enabled,
    p_circle_id,
    p_minimum_participants
  );

  if p_circle_id is not null then
    update public.live_session_audience_policies
    set policy_mode = 'inherit_circle', reach_scopes = '{}'::text[]
    where session_id = v_session.id;
  else
    update public.live_session_audience_policies
    set policy_mode = 'explicit',
        reach_scopes = coalesce(p_audience_scopes, array['global']::text[]),
        country_code = p_country_code,
        country_name = p_country_name,
        region = p_region,
        city = p_city,
        diaspora_origin_country_codes = coalesce(p_diaspora_origin_country_codes, '{}'::text[]),
        diaspora_destination_country_codes = coalesce(p_diaspora_destination_country_codes, '{}'::text[])
    where session_id = v_session.id;
  end if;

  return v_session;
end;
$$;

revoke all on function public.rpc_set_live_session_audience_policy_v1(uuid,bigint,text[],text,text,text,text,text[],text[])
from public, anon;
grant execute on function public.rpc_set_live_session_audience_policy_v1(uuid,bigint,text[],text,text,text,text,text[],text[])
to authenticated, service_role;

revoke all on function public.rpc_schedule_live_studio_session_v2(uuid,text,text,timestamptz,integer,text,boolean,uuid,integer,text[],text,text,text,text,text[],text[])
from public, anon;
grant execute on function public.rpc_schedule_live_studio_session_v2(uuid,text,text,timestamptz,integer,text,boolean,uuid,integer,text[],text,text,text,text,text[],text[])
to authenticated, service_role;

-- Preserve established public contracts after CREATE OR REPLACE.
revoke all on function public.can_view_live_session(uuid, uuid) from public, anon;
grant execute on function public.can_view_live_session(uuid, uuid) to authenticated, service_role;
revoke all on function public.rpc_list_discoverable_circle_live_previews(integer) from public, anon;
grant execute on function public.rpc_list_discoverable_circle_live_previews(integer)
to authenticated, service_role;

comment on table public.live_session_audience_policies is
  'Server-authoritative Live discovery and admission targeting. Circle Live inherits Circle Reach.';
comment on function public.rpc_schedule_live_studio_session_v2(uuid,text,text,timestamptz,integer,text,boolean,uuid,integer,text[],text,text,text,text,text[],text[]) is
  'Schedules a Live session with an explicit audience policy, or inherited Circle Reach.';
