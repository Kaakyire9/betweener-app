create or replace function public.apply_profile_country_lock_policy(
  p_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_profile public.profiles%rowtype;
  v_region_lower text;
  v_should_lock boolean := false;
  v_next_policy text;
  v_next_origin_country text;
  v_next_origin_country_code text;
  v_next_origin_country_source text;
begin
  if p_profile_id is null then
    return;
  end if;

  select *
    into v_profile
  from public.profiles
  where id = p_profile_id
  limit 1;

  if v_profile.id is null then
    return;
  end if;

  v_region_lower := lower(btrim(coalesce(v_profile.region, '')));
  v_should_lock :=
    coalesce(v_profile.current_country_code, '') = 'GH'
    and lower(btrim(coalesce(v_profile.current_country, ''))) = 'ghana'
    and lower(btrim(coalesce(v_profile.location, ''))) = 'ghana'
    and v_profile.city is null
    and v_region_lower in (
      'ahafo',
      'ashanti',
      'bono',
      'bono east',
      'central',
      'eastern',
      'greater accra',
      'north east',
      'northern',
      'oti',
      'savannah',
      'upper east',
      'upper west',
      'volta',
      'western',
      'western north'
    )
    and coalesce(v_profile.location_precision::text, '') <> 'EXACT';

  if v_should_lock then
    v_next_policy := 'ghana_locked';
    v_next_origin_country := 'Ghana';
    v_next_origin_country_code := 'GH';
    v_next_origin_country_source := case
      when coalesce(v_profile.origin_country_source, 'unknown') = 'explicit' then 'explicit'
      else 'residence_backfill'
    end;
  elsif v_profile.country_lock_policy = 'ghana_locked'
    and v_profile.location_precision = 'EXACT'
    and coalesce(v_profile.current_country_code, '') <> ''
    and v_profile.current_country_code <> 'GH' then
    v_next_policy := 'ghana_unlocked_precise_abroad';
    v_next_origin_country := v_profile.origin_country;
    v_next_origin_country_code := v_profile.origin_country_code;
    v_next_origin_country_source := v_profile.origin_country_source;
  else
    v_next_policy := case
      when v_profile.country_lock_policy in ('ghana_locked', 'ghana_unlocked_precise_abroad') then v_profile.country_lock_policy
      else 'none'
    end;
    v_next_origin_country := v_profile.origin_country;
    v_next_origin_country_code := v_profile.origin_country_code;
    v_next_origin_country_source := v_profile.origin_country_source;
  end if;

  perform set_config('app.server_managed_update', 'on', true);

  update public.profiles
  set country_lock_policy = v_next_policy,
      current_country = case when v_next_policy = 'ghana_locked' then 'Ghana' else current_country end,
      current_country_code = case when v_next_policy = 'ghana_locked' then 'GH' else current_country_code end,
      origin_country = case when v_next_policy = 'ghana_locked' then v_next_origin_country else origin_country end,
      origin_country_code = case when v_next_policy = 'ghana_locked' then v_next_origin_country_code else origin_country_code end,
      origin_country_source = case when v_next_policy = 'ghana_locked' then v_next_origin_country_source else origin_country_source end,
      updated_at = timezone('utc'::text, now())
  where id = p_profile_id
    and (
      country_lock_policy is distinct from v_next_policy
      or (v_next_policy = 'ghana_locked' and current_country is distinct from 'Ghana')
      or (v_next_policy = 'ghana_locked' and coalesce(current_country_code, '') <> 'GH')
      or (v_next_policy = 'ghana_locked' and origin_country is distinct from v_next_origin_country)
      or (v_next_policy = 'ghana_locked' and coalesce(origin_country_code, '') is distinct from coalesce(v_next_origin_country_code, ''))
      or (v_next_policy = 'ghana_locked' and coalesce(origin_country_source, '') is distinct from coalesce(v_next_origin_country_source, ''))
    );
end;
$$;

revoke all on function public.apply_profile_country_lock_policy(uuid) from public;

create or replace function public.trg_apply_profile_country_lock_policy()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  perform public.apply_profile_country_lock_policy(new.id);
  return null;
end;
$$;

revoke all on function public.trg_apply_profile_country_lock_policy() from public;

drop trigger if exists apply_profile_country_lock_policy on public.profiles;
create trigger apply_profile_country_lock_policy
after insert or update of region, city, location, current_country, current_country_code, location_precision, origin_country, origin_country_code, origin_country_source
on public.profiles
for each row
execute function public.trg_apply_profile_country_lock_policy();
