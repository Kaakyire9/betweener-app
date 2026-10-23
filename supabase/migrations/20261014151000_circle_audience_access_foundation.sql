-- Separate Circle discovery reach and membership access. Existing visibility fields and
-- RPC signatures remain available for installed clients.

alter table public.circles
  add column if not exists reach_scope text,
  add column if not exists access_policy text,
  add column if not exists diaspora_origin_country_codes text[] not null default '{}'::text[],
  add column if not exists diaspora_destination_country_codes text[] not null default '{}'::text[],
  add column if not exists membership_eligibility_policy text not null default 'recommend_only',
  add column if not exists live_discovery_policy text not null default 'members_only';

update public.circles
set reach_scope = case
      when visibility_scope in ('local', 'country', 'diaspora', 'global') then visibility_scope
      when nullif(btrim(city), '') is not null then 'local'
      when nullif(btrim(country_code), '') is not null or nullif(btrim(country_name), '') is not null then 'country'
      else 'global'
    end,
    access_policy = case
      when visibility = 'private' or visibility_scope = 'invite_only' then 'invite_only'
      when requires_join_approval then 'approval_required'
      else 'open'
    end,
    diaspora_origin_country_codes = case
      when visibility_scope = 'diaspora'
        and cardinality(diaspora_origin_country_codes) = 0
        and nullif(btrim(country_code), '') is not null
      then array[upper(btrim(country_code))]::text[]
      else diaspora_origin_country_codes
    end
where reach_scope is null
   or access_policy is null;

alter table public.circles
  alter column reach_scope set default 'country',
  alter column reach_scope set not null,
  alter column access_policy set default 'open',
  alter column access_policy set not null;

alter table public.circles
  drop constraint if exists circles_reach_scope_check,
  add constraint circles_reach_scope_check
    check (reach_scope in ('local', 'country', 'diaspora', 'global')),
  drop constraint if exists circles_access_policy_check,
  add constraint circles_access_policy_check
    check (access_policy in ('open', 'approval_required', 'invite_only')),
  drop constraint if exists circles_membership_eligibility_policy_check,
  add constraint circles_membership_eligibility_policy_check
    check (membership_eligibility_policy in ('recommend_only', 'target_only')),
  drop constraint if exists circles_live_discovery_policy_check,
  add constraint circles_live_discovery_policy_check
    check (live_discovery_policy in ('members_only', 'discoverable_join_required')),
  drop constraint if exists circles_diaspora_country_count_check,
  add constraint circles_diaspora_country_count_check
    check (
      cardinality(diaspora_origin_country_codes) <= 12
      and cardinality(diaspora_destination_country_codes) <= 24
    );

create or replace function public.normalize_circle_audience_fields()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    new.reach_scope := case
      when new.visibility_scope in ('local', 'country', 'diaspora', 'global') then new.visibility_scope
      when nullif(btrim(new.city), '') is not null then 'local'
      when nullif(btrim(new.country_code), '') is not null or nullif(btrim(new.country_name), '') is not null then 'country'
      else 'global'
    end;
    new.access_policy := case
      when new.visibility = 'private' or new.visibility_scope = 'invite_only' then 'invite_only'
      when new.requires_join_approval then 'approval_required'
      else 'open'
    end;
  elsif new.reach_scope is not distinct from old.reach_scope
    and new.visibility_scope is distinct from old.visibility_scope then
    new.reach_scope := case
      when new.visibility_scope in ('local', 'country', 'diaspora', 'global') then new.visibility_scope
      else old.reach_scope
    end;
  end if;

  if tg_op = 'UPDATE'
    and new.access_policy is not distinct from old.access_policy
    and (
      new.visibility is distinct from old.visibility
      or new.visibility_scope is distinct from old.visibility_scope
      or new.requires_join_approval is distinct from old.requires_join_approval
    ) then
    new.access_policy := case
      when new.visibility = 'private' or new.visibility_scope = 'invite_only' then 'invite_only'
      when new.requires_join_approval then 'approval_required'
      else 'open'
    end;
  end if;

  new.reach_scope := lower(btrim(coalesce(new.reach_scope, 'country')));
  new.access_policy := lower(btrim(coalesce(new.access_policy, 'open')));
  new.membership_eligibility_policy := lower(btrim(coalesce(new.membership_eligibility_policy, 'recommend_only')));
  new.live_discovery_policy := lower(btrim(coalesce(new.live_discovery_policy, 'members_only')));
  new.country_code := nullif(upper(btrim(coalesce(new.country_code, ''))), '');

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

  if new.reach_scope in ('local', 'country')
    and new.country_code is null
    and nullif(btrim(coalesce(new.country_name, '')), '') is null then
    raise exception 'circle_country_required' using errcode = '22023';
  end if;
  if new.reach_scope = 'local' and nullif(btrim(coalesce(new.city, '')), '') is null then
    raise exception 'circle_city_required' using errcode = '22023';
  end if;
  if new.access_policy = 'invite_only' then
    new.visibility := 'private';
    new.visibility_scope := 'invite_only';
    new.requires_join_approval := true;
    new.live_discovery_policy := 'members_only';
  else
    new.visibility := 'public';
    new.visibility_scope := new.reach_scope;
    new.requires_join_approval := new.access_policy = 'approval_required';
  end if;
  return new;
end;
$$;

drop trigger if exists circles_normalize_audience_fields on public.circles;
create trigger circles_normalize_audience_fields
before insert or update of
  visibility, visibility_scope, reach_scope, access_policy, country_code, city,
  diaspora_origin_country_codes, diaspora_destination_country_codes,
  membership_eligibility_policy, live_discovery_policy
on public.circles
for each row execute function public.normalize_circle_audience_fields();

revoke all on function public.normalize_circle_audience_fields()
from public, anon, authenticated, service_role;

create index if not exists circles_reach_access_idx
  on public.circles(reach_scope, access_policy, status)
  where archived_at is null;
create index if not exists circles_diaspora_origin_countries_gin_idx
  on public.circles using gin(diaspora_origin_country_codes);
create index if not exists circles_diaspora_destination_countries_gin_idx
  on public.circles using gin(diaspora_destination_country_codes);

create or replace function public.rpc_create_circle_request_v2(
  p_name text,
  p_description text default null,
  p_short_description text default null,
  p_circle_type text default 'gold_community',
  p_reach_scope text default 'country',
  p_access_policy text default 'open',
  p_country_code text default null,
  p_country_name text default null,
  p_region text default null,
  p_city text default null,
  p_diaspora_origin_country_codes text[] default '{}'::text[],
  p_diaspora_destination_country_codes text[] default '{}'::text[],
  p_membership_eligibility_policy text default 'recommend_only',
  p_live_discovery_policy text default 'members_only',
  p_culture_tags text[] default '{}'::text[],
  p_faith_tags text[] default '{}'::text[],
  p_interest_tags text[] default '{}'::text[],
  p_audience_tags text[] default '{}'::text[],
  p_rules text default null
)
returns public.circles
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_circle public.circles;
  v_reach text := lower(btrim(coalesce(p_reach_scope, 'country')));
  v_access text := lower(btrim(coalesce(p_access_policy, 'open')));
begin
  if v_reach not in ('local', 'country', 'diaspora', 'global') then
    raise exception 'circle_reach_scope_invalid' using errcode = '22023';
  end if;
  if v_access not in ('open', 'approval_required', 'invite_only') then
    raise exception 'circle_access_policy_invalid' using errcode = '22023';
  end if;
  if v_reach = 'diaspora' and cardinality(coalesce(p_diaspora_origin_country_codes, '{}'::text[])) = 0 then
    raise exception 'circle_diaspora_origin_required' using errcode = '22023';
  end if;

  v_circle := public.rpc_create_circle_request(
    p_name,
    p_description,
    p_short_description,
    p_circle_type,
    case when v_access = 'invite_only' then 'invite_only' else v_reach end,
    p_country_code,
    p_country_name,
    p_region,
    p_city,
    coalesce(p_diaspora_origin_country_codes, '{}'::text[]) || coalesce(p_diaspora_destination_country_codes, '{}'::text[]),
    p_culture_tags,
    p_faith_tags,
    p_interest_tags,
    p_audience_tags,
    v_access <> 'open',
    p_rules
  );

  update public.circles
  set reach_scope = v_reach,
      access_policy = v_access,
      diaspora_origin_country_codes = p_diaspora_origin_country_codes,
      diaspora_destination_country_codes = p_diaspora_destination_country_codes,
      membership_eligibility_policy = p_membership_eligibility_policy,
      live_discovery_policy = p_live_discovery_policy
  where id = v_circle.id
  returning * into v_circle;
  return v_circle;
end;
$$;

create or replace function public.rpc_update_circle_request_v2(
  p_circle_id uuid,
  p_name text,
  p_description text default null,
  p_short_description text default null,
  p_circle_type text default 'gold_community',
  p_reach_scope text default 'country',
  p_access_policy text default 'open',
  p_country_code text default null,
  p_country_name text default null,
  p_region text default null,
  p_city text default null,
  p_diaspora_origin_country_codes text[] default '{}'::text[],
  p_diaspora_destination_country_codes text[] default '{}'::text[],
  p_membership_eligibility_policy text default 'recommend_only',
  p_live_discovery_policy text default 'members_only',
  p_culture_tags text[] default '{}'::text[],
  p_faith_tags text[] default '{}'::text[],
  p_interest_tags text[] default '{}'::text[],
  p_audience_tags text[] default '{}'::text[],
  p_rules text default null
)
returns public.circles
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_circle public.circles;
  v_reach text := lower(btrim(coalesce(p_reach_scope, 'country')));
  v_access text := lower(btrim(coalesce(p_access_policy, 'open')));
begin
  if v_reach not in ('local', 'country', 'diaspora', 'global') then
    raise exception 'circle_reach_scope_invalid' using errcode = '22023';
  end if;
  if v_access not in ('open', 'approval_required', 'invite_only') then
    raise exception 'circle_access_policy_invalid' using errcode = '22023';
  end if;
  if v_reach = 'diaspora' and cardinality(coalesce(p_diaspora_origin_country_codes, '{}'::text[])) = 0 then
    raise exception 'circle_diaspora_origin_required' using errcode = '22023';
  end if;

  v_circle := public.rpc_update_circle_request(
    p_circle_id,
    p_name,
    p_description,
    p_short_description,
    p_circle_type,
    case when v_access = 'invite_only' then 'invite_only' else v_reach end,
    p_country_code,
    p_country_name,
    p_region,
    p_city,
    coalesce(p_diaspora_origin_country_codes, '{}'::text[]) || coalesce(p_diaspora_destination_country_codes, '{}'::text[]),
    p_culture_tags,
    p_faith_tags,
    p_interest_tags,
    p_audience_tags,
    v_access <> 'open',
    p_rules
  );

  update public.circles
  set reach_scope = v_reach,
      access_policy = v_access,
      diaspora_origin_country_codes = p_diaspora_origin_country_codes,
      diaspora_destination_country_codes = p_diaspora_destination_country_codes,
      membership_eligibility_policy = p_membership_eligibility_policy,
      live_discovery_policy = p_live_discovery_policy
  where id = v_circle.id
  returning * into v_circle;
  return v_circle;
end;
$$;

revoke all on function public.rpc_create_circle_request_v2(text,text,text,text,text,text,text,text,text,text,text[],text[],text,text,text[],text[],text[],text[],text)
from public, anon;
revoke all on function public.rpc_update_circle_request_v2(uuid,text,text,text,text,text,text,text,text,text,text,text[],text[],text,text,text[],text[],text[],text[],text)
from public, anon;
grant execute on function public.rpc_create_circle_request_v2(text,text,text,text,text,text,text,text,text,text,text[],text[],text,text,text[],text[],text[],text[],text)
to authenticated, service_role;
grant execute on function public.rpc_update_circle_request_v2(uuid,text,text,text,text,text,text,text,text,text,text,text[],text[],text,text,text[],text[],text[],text[],text)
to authenticated, service_role;

comment on column public.circles.reach_scope is 'Discovery reach only: local, country, diaspora or global.';
comment on column public.circles.access_policy is 'Membership access: open, approval_required or invite_only.';
comment on column public.circles.live_discovery_policy is 'Controls preview discovery only. Full Circle Live access always requires active membership.';
