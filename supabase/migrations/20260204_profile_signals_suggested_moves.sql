-- Migration: profile signals + suggested moves RPCs

create table if not exists public.profile_signals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  target_profile_id uuid not null references public.profiles(id) on delete cascade,
  opened_profile_count int not null default 0,
  liked boolean not null default false,
  intro_video_started boolean not null default false,
  intro_video_completed boolean not null default false,
  dwell_score int not null default 0,
  last_interacted_at timestamptz not null default now(),
  constraint profile_signals_unique unique (profile_id, target_profile_id),
  constraint profile_signals_no_self check (profile_id <> target_profile_id)
);

create index if not exists profile_signals_profile_id_idx
  on public.profile_signals (profile_id, last_interacted_at desc);
create index if not exists profile_signals_target_profile_id_idx
  on public.profile_signals (target_profile_id);

alter table public.profile_signals enable row level security;

drop policy if exists "Profile signals select" on public.profile_signals;
create policy "Profile signals select"
on public.profile_signals
for select
to authenticated
using (
  auth.uid() in (select user_id from public.profiles where id = profile_id)
);

drop policy if exists "Profile signals insert" on public.profile_signals;
create policy "Profile signals insert"
on public.profile_signals
for insert
to authenticated
with check (
  auth.uid() in (select user_id from public.profiles where id = profile_id)
);

drop policy if exists "Profile signals update" on public.profile_signals;
create policy "Profile signals update"
on public.profile_signals
for update
to authenticated
using (
  auth.uid() in (select user_id from public.profiles where id = profile_id)
)
with check (
  auth.uid() in (select user_id from public.profiles where id = profile_id)
);

create or replace function public.rpc_upsert_profile_signal(
  p_profile_id uuid,
  p_target_profile_id uuid,
  p_opened_delta int default 0,
  p_liked boolean default null,
  p_intro_video_started boolean default null,
  p_intro_video_completed boolean default null,
  p_dwell_delta int default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_id uuid;
  v_opened_delta int := greatest(coalesce(p_opened_delta, 0), 0);
  v_dwell_delta int := greatest(coalesce(p_dwell_delta, 0), 0);
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select user_id into v_owner
  from public.profiles
  where id = p_profile_id
  limit 1;

  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  if p_profile_id = p_target_profile_id then
    raise exception 'Cannot signal self';
  end if;

  if not exists (select 1 from public.profiles where id = p_target_profile_id) then
    raise exception 'Target not found';
  end if;

  insert into public.profile_signals (
    profile_id,
    target_profile_id,
    opened_profile_count,
    liked,
    intro_video_started,
    intro_video_completed,
    dwell_score,
    last_interacted_at
  )
  values (
    p_profile_id,
    p_target_profile_id,
    v_opened_delta,
    coalesce(p_liked, false),
    coalesce(p_intro_video_started, false),
    coalesce(p_intro_video_completed, false),
    least(100, v_dwell_delta),
    now()
  )
  on conflict (profile_id, target_profile_id) do update
  set opened_profile_count = public.profile_signals.opened_profile_count + v_opened_delta,
      liked = public.profile_signals.liked or coalesce(p_liked, false),
      intro_video_started = public.profile_signals.intro_video_started or coalesce(p_intro_video_started, false),
      intro_video_completed = public.profile_signals.intro_video_completed or coalesce(p_intro_video_completed, false),
      dwell_score = least(100, public.profile_signals.dwell_score + v_dwell_delta),
      last_interacted_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.rpc_get_user_taste(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_taste jsonb;
begin
  if auth.uid() is null then
    return null;
  end if;

  select user_id into v_owner
  from public.profiles
  where id = p_profile_id
  limit 1;

  if v_owner is null or v_owner <> auth.uid() then
    return null;
  end if;

  with top_targets as (
    select ps.target_profile_id
    from public.profile_signals ps
    where ps.profile_id = p_profile_id
    order by ps.liked desc,
             ps.intro_video_completed desc,
             ps.dwell_score desc,
             ps.last_interacted_at desc
    limit 20
  ),
  target_profiles as (
    select p.*
    from public.profiles p
    join top_targets t on t.target_profile_id = p.id
  ),
  interest_counts as (
    select i.name, count(*) as cnt
    from public.profile_interests pi
    join public.interests i on i.id = pi.interest_id
    join top_targets t on t.target_profile_id = pi.profile_id
    group by i.name
    order by cnt desc, i.name asc
    limit 5
  ),
  interest_list as (
    select coalesce(array_agg(name), '{}'::text[]) as top_interests
    from interest_counts
  ),
  stats as (
    select
      min(age) as age_min,
      max(age) as age_max,
      count(*) as total_count,
      count(*) filter (where profile_video is not null) as video_count,
      bool_or(last_active > now() - interval '3 days') as active_recently
    from target_profiles
  )
  select jsonb_build_object(
    'preferred_age_min', (select age_min from stats),
    'preferred_age_max', (select age_max from stats),
    'top_interests', (select top_interests from interest_list),
    'prefers_intro_video', (
      case
        when (select total_count from stats) > 0
          then ((select video_count from stats)::double precision / (select total_count from stats)) >= 0.5
        else false
      end
    ),
    'active_recently', coalesce((select active_recently from stats), false)
  ) into v_taste;

  return v_taste;
end;
$$;

create or replace function public.rpc_get_suggested_moves(
  p_profile_id uuid,
  p_limit integer default 6
)
returns table (
  id uuid,
  full_name text,
  age integer,
  avatar_url text,
  short_tags text[],
  has_intro_video boolean,
  distance_km double precision
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  my_user_id uuid;
  my_lat double precision;
  my_lon double precision;
begin
  if auth.uid() is null then
    return;
  end if;

  select user_id, latitude, longitude
    into my_user_id, my_lat, my_lon
  from public.profiles
  where id = p_profile_id
    and user_id = auth.uid()
  limit 1;

  if my_user_id is null then
    return;
  end if;

  return query
  with top_targets as (
    select ps.target_profile_id
    from public.profile_signals ps
    where ps.profile_id = p_profile_id
    order by ps.liked desc,
             ps.intro_video_completed desc,
             ps.dwell_score desc,
             ps.last_interacted_at desc
    limit 20
  ),
  taste_interests as (
    select i.name
    from public.profile_interests pi
    join public.interests i on i.id = pi.interest_id
    join top_targets t on t.target_profile_id = pi.profile_id
    group by i.name
    order by count(*) desc, i.name asc
    limit 5
  ),
  taste as (
    select coalesce(array_agg(name), '{}'::text[]) as top_interests
    from taste_interests
  ),
  candidates as (
    select
      p.id,
      p.full_name,
      p.age,
      p.avatar_url,
      p.profile_video,
      p.latitude,
      p.longitude,
      p.online,
      p.last_active,
      (
        select count(*)
        from public.profile_interests pi
        join public.interests i on i.id = pi.interest_id
        where pi.profile_id = p.id
          and i.name = any((select top_interests from taste))
      ) as shared_interest_count
    from public.profiles p
    where p.id <> p_profile_id
      and p.deleted_at is null
      and p.is_active = true
      and not exists (
        select 1 from public.intent_requests ir
        where ((ir.actor_id = p_profile_id and ir.recipient_id = p.id)
            or (ir.actor_id = p.id and ir.recipient_id = p_profile_id))
          and ir.status in ('pending','accepted','passed')
      )
      and not exists (
        select 1 from public.matches m
        where (m.user1_id = p_profile_id and m.user2_id = p.id)
           or (m.user1_id = p.id and m.user2_id = p_profile_id)
      )
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = my_user_id and b.blocked_id = p.user_id)
           or (b.blocker_id = p.user_id and b.blocked_id = my_user_id)
      )
  ),
  scored as (
    select
      c.*,
      (
        case
          when my_lat is null or my_lon is null or c.latitude is null or c.longitude is null
            then null::double precision
          else (6371 * 2 * asin(sqrt(
            power(sin(radians(c.latitude - my_lat) / 2), 2) +
            cos(radians(my_lat)) * cos(radians(c.latitude)) *
            power(sin(radians(c.longitude - my_lon) / 2), 2)
          )))
        end
      ) as distance_km,
      (
        (case when c.shared_interest_count > 0 then c.shared_interest_count * 2 else 0 end)
        + (case when c.profile_video is not null then 2 else 0 end)
        + (case when c.online = true then 1 else 0 end)
        + (case when c.last_active > now() - interval '3 days' then 1 else 0 end)
      ) as score
    from candidates c
  )
  select
    s.id,
    s.full_name,
    s.age,
    s.avatar_url,
    (array_remove(array[
      case when s.profile_video is not null then 'Intro video' end,
      case when s.shared_interest_count > 0 then 'Shared interests' end,
      case when s.online = true then 'Active now' end
    ], null))[1:2] as short_tags,
    (s.profile_video is not null) as has_intro_video,
    s.distance_km
  from scored s
  order by s.score desc, s.distance_km asc nulls last, s.last_active desc
  limit p_limit;
end;
$$;

grant execute on function public.rpc_upsert_profile_signal(uuid, uuid, int, boolean, boolean, boolean, int) to authenticated;
grant execute on function public.rpc_get_user_taste(uuid) to authenticated;
grant execute on function public.rpc_get_suggested_moves(uuid, integer) to authenticated;
