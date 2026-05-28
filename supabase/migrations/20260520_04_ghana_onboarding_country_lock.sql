alter table public.profiles
  add column if not exists country_lock_policy text not null default 'none';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_country_lock_policy_check'
  ) then
    alter table public.profiles
      add constraint profiles_country_lock_policy_check
      check (country_lock_policy in ('none', 'ghana_locked', 'ghana_unlocked_precise_abroad'));
  end if;
end
$$;

create index if not exists profiles_country_lock_policy_idx
  on public.profiles (country_lock_policy)
  where country_lock_policy <> 'none';

update public.profiles
set
  country_lock_policy = 'ghana_locked',
  current_country = 'Ghana',
  current_country_code = 'GH',
  origin_country = 'Ghana',
  origin_country_code = 'GH',
  origin_country_source = case
    when coalesce(origin_country_source, 'unknown') = 'explicit' then 'explicit'
    else 'residence_backfill'
  end,
  updated_at = timezone('utc'::text, now())
where coalesce(country_lock_policy, 'none') = 'none'
  and coalesce(current_country_code, '') = 'GH'
  and lower(coalesce(current_country, '')) = 'ghana'
  and lower(coalesce(location, '')) = 'ghana'
  and city is null
  and lower(coalesce(region, '')) in (
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
  and coalesce(location_precision::text, '') <> 'EXACT';

update public.profiles
set
  country_lock_policy = 'ghana_unlocked_precise_abroad',
  updated_at = timezone('utc'::text, now())
where country_lock_policy = 'ghana_locked'
  and location_precision = 'EXACT'
  and coalesce(current_country_code, '') <> ''
  and current_country_code <> 'GH';

create or replace function public.profiles_guard_sensitive_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_country_lock_policy text := coalesce(old.country_lock_policy, 'none');
begin
  if auth.uid() is null
    or coalesce(auth.role(), '') in ('service_role', 'supabase_admin')
    or coalesce(current_setting('app.server_managed_update', true), '') = 'on' then
    return new;
  end if;

  if new.country_lock_policy is distinct from old.country_lock_policy then
    raise exception 'country_lock_policy is server-managed';
  end if;

  if new.verification_level is distinct from old.verification_level then
    raise exception 'verification_level is server-managed';
  end if;

  if new.phone_verified is distinct from old.phone_verified then
    raise exception 'phone_verified is server-managed';
  end if;

  if new.phone_verification_score is distinct from old.phone_verification_score then
    raise exception 'phone_verification_score is server-managed';
  end if;

  if new.superlikes_left is distinct from old.superlikes_left then
    raise exception 'superlikes_left is server-managed';
  end if;

  if new.superlikes_reset_at is distinct from old.superlikes_reset_at then
    raise exception 'superlikes_reset_at is server-managed';
  end if;

  if new.ai_score is distinct from old.ai_score then
    raise exception 'ai_score is server-managed';
  end if;

  if new.ai_score_updated_at is distinct from old.ai_score_updated_at then
    raise exception 'ai_score_updated_at is server-managed';
  end if;

  if v_country_lock_policy = 'ghana_locked' then
    if new.current_country is distinct from 'Ghana'
      or coalesce(new.current_country_code, '') <> 'GH' then
      raise exception 'ghana_onboarding_current_country_locked' using errcode = '42501';
    end if;

    if new.origin_country is distinct from 'Ghana'
      or coalesce(new.origin_country_code, '') <> 'GH' then
      raise exception 'ghana_onboarding_origin_country_locked' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;
