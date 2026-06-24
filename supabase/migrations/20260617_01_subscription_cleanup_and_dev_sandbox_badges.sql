update public.subscriptions
set is_active = false,
    updated_at = timezone('utc'::text, now())
where is_active = true
  and ends_at <= timezone('utc'::text, now());

create or replace function public.get_subscription_badge_plan(
  p_user_id uuid default auth.uid(),
  p_include_sandbox_preview boolean default false
)
returns public.subscription_type
language plpgsql
security definer
stable
set search_path = public, pg_catalog
as $$
declare
  resolved_plan public.subscription_type := 'FREE';
begin
  if p_user_id is null then
    return 'FREE';
  end if;

  select s.type
    into resolved_plan
  from public.subscriptions s
  where s.user_id = p_user_id
    and s.is_active = true
    and s.ends_at > timezone('utc'::text, now())
  order by
    case s.type
      when 'GOLD' then 2
      when 'SILVER' then 1
      else 0
    end desc,
    s.ends_at desc
  limit 1;

  if resolved_plan is not null then
    return resolved_plan;
  end if;

  if coalesce(p_include_sandbox_preview, false) then
    select s.type
      into resolved_plan
    from public.subscriptions s
    where s.user_id = p_user_id
      and s.source = 'revenuecat'
      and upper(coalesce(s.external_environment, '')) = 'SANDBOX'
    order by
      case s.type
        when 'GOLD' then 2
        when 'SILVER' then 1
        else 0
      end desc,
      coalesce(s.ends_at, s.started_at) desc,
      s.updated_at desc nulls last
    limit 1;
  end if;

  return coalesce(resolved_plan, 'FREE');
end;
$$;

create or replace function public.rpc_get_profile_card_context(
  p_profile_ids uuid[],
  p_include_sandbox_preview boolean default false
)
returns table (
  profile_id uuid,
  premium_plan text,
  is_new_here boolean,
  interest_relevance_score integer
)
language sql
security definer
stable
set search_path = public, pg_catalog
as $$
  with viewer as (
    select profile.id
    from public.profiles profile
    where profile.user_id = auth.uid()
      and profile.deleted_at is null
    limit 1
  ),
  recent as (
    select
      event_row.viewer_profile_id,
      event_row.event_type
    from public.vibes_events event_row
    join viewer on viewer.id = event_row.target_profile_id
    where event_row.viewer_profile_id = any(coalesce(p_profile_ids, '{}'::uuid[]))
      and event_row.created_at > timezone('utc'::text, now()) - interval '30 days'
  ),
  visit_counts as (
    select
      recent.viewer_profile_id,
      count(*)::integer as visit_count
    from recent
    where recent.event_type in ('profile_opened', 'full_profile_opened')
    group by recent.viewer_profile_id
  ),
  interest as (
    select
      recent.viewer_profile_id,
      public.profile_interest_score(
        count(*) filter (where recent.event_type = 'profile_opened')::integer,
        count(*) filter (where recent.event_type = 'full_profile_opened')::integer,
        count(*) filter (where recent.event_type in ('intro_played', 'intro_completed'))::integer,
        count(*) filter (where recent.event_type = 'profile_saved')::integer,
        coalesce(greatest(max(visit_counts.visit_count) - 1, 0), 0),
        count(*) filter (where recent.event_type = 'intent_opened')::integer
      ) as score
    from recent
    left join visit_counts
      on visit_counts.viewer_profile_id = recent.viewer_profile_id
    group by recent.viewer_profile_id
  )
  select
    profile.id,
    public.get_subscription_badge_plan(profile.user_id, coalesce(p_include_sandbox_preview, false))::text,
    profile.created_at > timezone('utc'::text, now()) - interval '14 days',
    coalesce(interest.score, 0)
  from public.profiles profile
  left join interest on interest.viewer_profile_id = profile.id
  where auth.uid() is not null
    and profile.id = any(coalesce(p_profile_ids, '{}'::uuid[]))
    and profile.deleted_at is null;
$$;

create or replace function public.rpc_get_my_saved_profiles(
  p_include_sandbox_preview boolean default false
)
returns table (
  profile_id uuid,
  saved_at timestamptz,
  full_name text,
  age integer,
  avatar_url text,
  city text,
  region text,
  current_country text,
  current_country_code text,
  premium_plan text,
  is_new_here boolean
)
language plpgsql
security definer
stable
set search_path = public, pg_catalog
as $$
declare
  v_viewer_profile_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select profile.id
    into v_viewer_profile_id
  from public.profiles profile
  where profile.user_id = auth.uid()
    and profile.deleted_at is null
  limit 1;

  if v_viewer_profile_id is null then
    raise exception 'profile required' using errcode = '42501';
  end if;

  return query
  select
    target.id as profile_id,
    save_row.created_at as saved_at,
    target.full_name,
    target.age,
    target.avatar_url,
    target.city,
    target.region,
    target.current_country,
    target.current_country_code,
    public.get_subscription_badge_plan(target.user_id, coalesce(p_include_sandbox_preview, false))::text as premium_plan,
    target.created_at > timezone('utc'::text, now()) - interval '14 days' as is_new_here
  from public.profile_saves save_row
  join public.profiles target
    on target.id = save_row.target_profile_id
  where save_row.viewer_profile_id = v_viewer_profile_id
    and target.deleted_at is null
  order by save_row.created_at desc;
end;
$$;

revoke all on function public.get_subscription_badge_plan(uuid, boolean) from public;
grant execute on function public.get_subscription_badge_plan(uuid, boolean) to authenticated;

revoke all on function public.rpc_get_profile_card_context(uuid[], boolean) from public;
grant execute on function public.rpc_get_profile_card_context(uuid[], boolean) to authenticated;

revoke all on function public.rpc_get_my_saved_profiles(boolean) from public;
grant execute on function public.rpc_get_my_saved_profiles(boolean) to authenticated;
