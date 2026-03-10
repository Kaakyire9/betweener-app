-- Secure subscription access and expose premium entitlements through RPCs.
-- Goals:
-- 1) stop authenticated clients from minting or editing their own subscriptions
-- 2) expose a narrow premium-state RPC for app surfaces
-- 3) gate profile boosts behind an active Silver/Gold subscription server-side

drop policy if exists "Users can view own subscriptions" on public.subscriptions;
drop policy if exists "Users can insert own subscriptions" on public.subscriptions;
drop policy if exists "Users can update own subscriptions" on public.subscriptions;

create policy "Users can view own subscriptions"
on public.subscriptions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can create boosts" on public.profile_boosts;

create or replace function public.get_active_subscription_plan(
  p_user_id uuid default auth.uid()
)
returns public.subscription_type
language plpgsql
security definer
stable
set search_path = public
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

  return coalesce(resolved_plan, 'FREE');
end;
$$;

create or replace function public.rpc_get_my_premium_state()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  resolved_plan public.subscription_type := 'FREE';
  resolved_started_at timestamptz;
  resolved_ends_at timestamptz;
  resolved_is_active boolean := false;
  viewer_profile_id uuid;
  active_boost_ends_at timestamptz;
begin
  if auth.uid() is null then
    return jsonb_build_object(
      'plan', 'FREE',
      'is_active', false,
      'started_at', null,
      'ends_at', null,
      'has_active_boost', false,
      'active_boost_ends_at', null
    );
  end if;

  select
    s.type,
    s.started_at,
    s.ends_at,
    s.is_active
    into
      resolved_plan,
      resolved_started_at,
      resolved_ends_at,
      resolved_is_active
  from public.subscriptions s
  where s.user_id = auth.uid()
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

  select p.id
    into viewer_profile_id
  from public.profiles p
  where p.user_id = auth.uid()
    and p.deleted_at is null
  limit 1;

  if viewer_profile_id is not null then
    select max(pb.ends_at)
      into active_boost_ends_at
    from public.profile_boosts pb
    where pb.user_id = viewer_profile_id
      and pb.ends_at > timezone('utc'::text, now());
  end if;

  return jsonb_build_object(
    'plan', coalesce(resolved_plan, 'FREE'),
    'is_active', coalesce(resolved_is_active, false),
    'started_at', resolved_started_at,
    'ends_at', resolved_ends_at,
    'has_active_boost', active_boost_ends_at is not null,
    'active_boost_ends_at', active_boost_ends_at
  );
end;
$$;

create or replace function public.rpc_create_profile_boost()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_plan public.subscription_type := 'FREE';
  viewer_profile_id uuid;
  active_boost_ends_at timestamptz;
  created_boost_ends_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  resolved_plan := public.get_active_subscription_plan(auth.uid());
  if resolved_plan not in ('SILVER', 'GOLD') then
    raise exception 'premium subscription required';
  end if;

  select p.id
    into viewer_profile_id
  from public.profiles p
  where p.user_id = auth.uid()
    and p.deleted_at is null
  limit 1;

  if viewer_profile_id is null then
    raise exception 'profile required';
  end if;

  select max(pb.ends_at)
    into active_boost_ends_at
  from public.profile_boosts pb
  where pb.user_id = viewer_profile_id
    and pb.ends_at > timezone('utc'::text, now());

  if active_boost_ends_at is not null then
    raise exception 'boost already active';
  end if;

  insert into public.profile_boosts (user_id, starts_at, ends_at)
  values (
    viewer_profile_id,
    timezone('utc'::text, now()),
    timezone('utc'::text, now()) + interval '30 minutes'
  )
  returning ends_at into created_boost_ends_at;

  return jsonb_build_object(
    'plan', resolved_plan,
    'profile_id', viewer_profile_id,
    'ends_at', created_boost_ends_at
  );
end;
$$;

revoke all on function public.get_active_subscription_plan(uuid) from public;
revoke all on function public.rpc_get_my_premium_state() from public;
revoke all on function public.rpc_create_profile_boost() from public;

grant execute on function public.get_active_subscription_plan(uuid) to authenticated;
grant execute on function public.rpc_get_my_premium_state() to authenticated;
grant execute on function public.rpc_create_profile_boost() to authenticated;
