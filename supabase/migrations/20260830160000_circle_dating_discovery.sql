-- Dating-first Circle discovery. Membership is community consent; it is not
-- romantic-discovery consent. This migration keeps discovery preferences
-- private and reuses the existing intent, match and chat pipelines.

begin;

create table if not exists public.circle_dating_preferences (
  circle_id uuid not null references public.circles(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  opted_in boolean not null default false,
  open_to_intents boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (circle_id, profile_id)
);

alter table public.circle_dating_preferences enable row level security;

drop policy if exists circle_dating_preferences_select_own on public.circle_dating_preferences;
create policy circle_dating_preferences_select_own
on public.circle_dating_preferences
for select
to authenticated
using (exists (
  select 1 from public.profiles viewer
  where viewer.id = circle_dating_preferences.profile_id
    and viewer.user_id = auth.uid()
    and viewer.deleted_at is null
));

revoke all on table public.circle_dating_preferences from public, anon;
grant select on table public.circle_dating_preferences to authenticated;

create table if not exists public.circle_dating_passes (
  circle_id uuid not null references public.circles(id) on delete cascade,
  actor_profile_id uuid not null references public.profiles(id) on delete cascade,
  target_profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (circle_id, actor_profile_id, target_profile_id),
  constraint circle_dating_passes_distinct_profiles check (actor_profile_id <> target_profile_id)
);

alter table public.circle_dating_passes enable row level security;
revoke all on table public.circle_dating_passes from public, anon, authenticated;

create table if not exists public.match_origins (
  match_id uuid primary key references public.matches(id) on delete cascade,
  context_type text not null,
  context_id uuid not null,
  intent_request_id uuid references public.intent_requests(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint match_origins_context_type_check check (context_type in ('circle', 'live', 'vibes', 'direct'))
);

alter table public.match_origins enable row level security;

drop policy if exists match_origins_select_participant on public.match_origins;
create policy match_origins_select_participant
on public.match_origins
for select
to authenticated
using (exists (
  select 1
  from public.matches match_row
  join public.profiles viewer
    on viewer.user_id = auth.uid()
   and viewer.deleted_at is null
  where match_row.id = match_origins.match_id
    and (match_row.user1_id = viewer.id or match_row.user2_id = viewer.id)
));

revoke all on table public.match_origins from public, anon;
grant select on table public.match_origins to authenticated;

create or replace function public.capture_circle_match_origin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_request public.intent_requests%rowtype;
begin
  if lower(coalesce(new.status::text, '')) <> 'accepted' then
    return new;
  end if;

  select request.* into v_request
  from public.intent_requests request
  where request.status in ('accepted', 'matched')
    and request.metadata ->> 'source' = 'circles'
    and nullif(request.metadata ->> 'circle_id', '') is not null
    and ((request.actor_id = new.user1_id and request.recipient_id = new.user2_id)
      or (request.actor_id = new.user2_id and request.recipient_id = new.user1_id))
  order by request.created_at desc
  limit 1;

  if v_request.id is not null then
    insert into public.match_origins (match_id, context_type, context_id, intent_request_id)
    values (new.id, 'circle', (v_request.metadata ->> 'circle_id')::uuid, v_request.id)
    on conflict (match_id) do nothing;
  end if;
  return new;
exception when invalid_text_representation then
  return new;
end;
$$;

drop trigger if exists capture_circle_match_origin_trigger on public.matches;
create trigger capture_circle_match_origin_trigger
after insert or update of status on public.matches
for each row execute function public.capture_circle_match_origin();

revoke all on function public.capture_circle_match_origin() from public, anon, authenticated;

create index if not exists circle_dating_preferences_discovery_idx
  on public.circle_dating_preferences(circle_id, profile_id)
  where opted_in and open_to_intents;

create index if not exists circle_dating_passes_recent_idx
  on public.circle_dating_passes(circle_id, actor_profile_id, created_at desc);

create or replace function public.rpc_get_my_circle_dating_preference(p_circle_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_profile_id uuid;
  v_is_member boolean;
  v_preference public.circle_dating_preferences%rowtype;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select profile.id into v_profile_id
  from public.profiles profile
  where profile.user_id = auth.uid() and profile.deleted_at is null
  limit 1;

  select exists (
    select 1 from public.circle_members member
    where member.circle_id = p_circle_id
      and member.profile_id = v_profile_id
      and member.status = 'active'
      and member.is_visible is not false
  ) into v_is_member;

  select * into v_preference
  from public.circle_dating_preferences preference
  where preference.circle_id = p_circle_id
    and preference.profile_id = v_profile_id;

  return jsonb_build_object(
    'is_member', v_is_member,
    'opted_in', coalesce(v_preference.opted_in, false),
    'open_to_intents', coalesce(v_preference.open_to_intents, true),
    'updated_at', v_preference.updated_at
  );
end;
$$;

create or replace function public.rpc_set_my_circle_dating_preference(
  p_circle_id uuid,
  p_opted_in boolean,
  p_open_to_intents boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_profile_id uuid;
  v_row public.circle_dating_preferences%rowtype;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select profile.id into v_profile_id
  from public.profiles profile
  where profile.user_id = auth.uid()
    and profile.deleted_at is null
    and coalesce(profile.is_active, true)
  limit 1;

  if v_profile_id is null or not exists (
    select 1 from public.circle_members member
    where member.circle_id = p_circle_id
      and member.profile_id = v_profile_id
      and member.status = 'active'
      and member.is_visible is not false
  ) then
    raise exception 'circle_membership_required' using errcode = '42501';
  end if;

  insert into public.circle_dating_preferences (
    circle_id, profile_id, opted_in, open_to_intents, updated_at
  ) values (
    p_circle_id, v_profile_id, coalesce(p_opted_in, false),
    coalesce(p_open_to_intents, true), timezone('utc', now())
  )
  on conflict (circle_id, profile_id) do update
  set opted_in = excluded.opted_in,
      open_to_intents = excluded.open_to_intents,
      updated_at = excluded.updated_at
  returning * into v_row;

  return jsonb_build_object(
    'is_member', true,
    'opted_in', v_row.opted_in,
    'open_to_intents', v_row.open_to_intents,
    'updated_at', v_row.updated_at
  );
end;
$$;

create or replace function public.rpc_pass_circle_dating_candidate(
  p_circle_id uuid,
  p_target_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_profile_id uuid;
begin
  select profile.id into v_profile_id
  from public.profiles profile
  where profile.user_id = auth.uid() and profile.deleted_at is null
  limit 1;

  if v_profile_id is null or v_profile_id = p_target_profile_id or not exists (
    select 1 from public.circle_dating_preferences preference
    join public.circle_members member
      on member.circle_id = preference.circle_id
     and member.profile_id = preference.profile_id
     and member.status = 'active'
     and member.is_visible is not false
    where preference.circle_id = p_circle_id
      and preference.profile_id = v_profile_id
      and preference.opted_in
  ) then
    raise exception 'circle_discovery_not_available' using errcode = '42501';
  end if;

  insert into public.circle_dating_passes (
    circle_id, actor_profile_id, target_profile_id, created_at
  ) values (p_circle_id, v_profile_id, p_target_profile_id, timezone('utc', now()))
  on conflict (circle_id, actor_profile_id, target_profile_id) do update
  set created_at = excluded.created_at;
end;
$$;

create or replace function public.rpc_get_circle_dating_candidates(
  p_circle_id uuid,
  p_limit integer default 20
)
returns table (
  profile_id uuid,
  full_name text,
  age integer,
  avatar_url text,
  city text,
  country text,
  looking_for text,
  verification_level integer,
  reason text
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_profile_id uuid;
begin
  select profile.id into v_profile_id
  from public.profiles profile
  where profile.user_id = auth.uid()
    and profile.deleted_at is null
    and coalesce(profile.is_active, true)
  limit 1;

  if v_profile_id is null or not exists (
    select 1 from public.circle_dating_preferences preference
    join public.circle_members member
      on member.circle_id = preference.circle_id
     and member.profile_id = preference.profile_id
     and member.status = 'active'
     and member.is_visible is not false
    where preference.circle_id = p_circle_id
      and preference.profile_id = v_profile_id
      and preference.opted_in
  ) then
    return;
  end if;

  return query
  with viewer as (
    select * from public.profiles profile where profile.id = v_profile_id
  ), candidates as (
    select
      candidate.id,
      candidate.full_name,
      candidate.age,
      candidate.avatar_url,
      candidate.city,
      candidate.current_country,
      candidate.looking_for,
      candidate.verification_level,
      candidate.last_active,
      coalesce(shared.shared_interest_count, 0) as shared_interest_count
    from viewer
    join public.circle_members member
      on member.circle_id = p_circle_id
     and member.profile_id <> viewer.id
     and member.status = 'active'
     and member.is_visible is not false
    join public.circle_dating_preferences preference
      on preference.circle_id = member.circle_id
     and preference.profile_id = member.profile_id
     and preference.opted_in
     and preference.open_to_intents
    join public.profiles candidate
      on candidate.id = member.profile_id
     and candidate.deleted_at is null
     and coalesce(candidate.is_active, true)
     and coalesce(candidate.profile_completed, false)
     and coalesce(candidate.discoverable_in_vibes, true)
     and coalesce(candidate.matchmaking_mode, false) = false
     and candidate.user_id is not null
    left join lateral (
      select count(*)::integer as shared_interest_count
      from public.profile_interests candidate_interest
      join public.profile_interests viewer_interest
        on viewer_interest.interest_id = candidate_interest.interest_id
       and viewer_interest.profile_id = viewer.id
      where candidate_interest.profile_id = candidate.id
    ) shared on true
    where (
        upper(btrim(coalesce(viewer.gender::text, ''))) not in ('MALE', 'FEMALE')
        or upper(btrim(coalesce(candidate.gender::text, ''))) not in ('MALE', 'FEMALE')
        or upper(btrim(viewer.gender::text)) <> upper(btrim(candidate.gender::text))
      )
      and (viewer.age_preference_confirmed_at is null or viewer.min_age_interest is null or candidate.age is null or candidate.age >= viewer.min_age_interest)
      and (viewer.age_preference_confirmed_at is null or viewer.max_age_interest is null or candidate.age is null or candidate.age <= viewer.max_age_interest)
      and (candidate.age_preference_confirmed_at is null or candidate.min_age_interest is null or viewer.age is null or viewer.age >= candidate.min_age_interest)
      and (candidate.age_preference_confirmed_at is null or candidate.max_age_interest is null or viewer.age is null or viewer.age <= candidate.max_age_interest)
      and not exists (
        select 1 from public.blocks blocked
        where (blocked.blocker_id = viewer.user_id and blocked.blocked_id = candidate.user_id)
           or (blocked.blocker_id = candidate.user_id and blocked.blocked_id = viewer.user_id)
      )
      and not exists (
        select 1 from public.matches match_row
        where lower(coalesce(match_row.status::text, '')) in ('pending', 'accepted')
          and ((match_row.user1_id = viewer.id and match_row.user2_id = candidate.id)
            or (match_row.user1_id = candidate.id and match_row.user2_id = viewer.id))
      )
      and not exists (
        select 1 from public.intent_requests request
        where request.status = 'pending' and request.expires_at > timezone('utc', now())
          and ((request.actor_id = viewer.id and request.recipient_id = candidate.id)
            or (request.actor_id = candidate.id and request.recipient_id = viewer.id))
      )
      and not exists (
        select 1 from public.circle_dating_passes pass
        where pass.circle_id = p_circle_id
          and pass.actor_profile_id = viewer.id
          and pass.target_profile_id = candidate.id
          and pass.created_at > timezone('utc', now()) - interval '14 days'
      )
  )
  select
    candidate.id,
    coalesce(nullif(btrim(candidate.full_name), ''), 'Circle member'),
    candidate.age,
    candidate.avatar_url,
    candidate.city,
    candidate.current_country,
    candidate.looking_for,
    coalesce(candidate.verification_level, 0),
    concat_ws(' · ',
      'Shared Circle',
      case when candidate.shared_interest_count > 0 then
        candidate.shared_interest_count::text || case when candidate.shared_interest_count = 1 then ' shared interest' else ' shared interests' end
      end,
      case when candidate.last_active >= timezone('utc', now()) - interval '24 hours' then 'Active recently' end
    )
  from candidates candidate
  order by candidate.shared_interest_count desc, candidate.last_active desc nulls last, candidate.id
  limit greatest(1, least(coalesce(p_limit, 20), 40));
end;
$$;

create or replace function public.rpc_get_circle_dating_connections(p_circle_id uuid)
returns table (
  request_id uuid,
  peer_profile_id uuid,
  full_name text,
  age integer,
  avatar_url text,
  direction text,
  intent_type text,
  intent_status text,
  match_id uuid,
  occurred_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_profile_id uuid;
begin
  select profile.id into v_profile_id
  from public.profiles profile
  where profile.user_id = auth.uid() and profile.deleted_at is null
  limit 1;

  if v_profile_id is null or not exists (
    select 1 from public.circle_members member
    where member.circle_id = p_circle_id
      and member.profile_id = v_profile_id
      and member.status = 'active'
  ) then
    raise exception 'circle_membership_required' using errcode = '42501';
  end if;

  return query
  select
    request.id,
    peer.id,
    coalesce(nullif(btrim(peer.full_name), ''), 'Circle member'),
    peer.age,
    peer.avatar_url,
    case when request.actor_id = v_profile_id then 'sent' else 'received' end,
    request.type,
    request.status,
    match_row.id,
    request.created_at
  from public.intent_requests request
  join public.profiles peer
    on peer.id = case when request.actor_id = v_profile_id then request.recipient_id else request.actor_id end
   and peer.deleted_at is null
  left join public.matches match_row
    on lower(coalesce(match_row.status::text, '')) = 'accepted'
   and ((match_row.user1_id = v_profile_id and match_row.user2_id = peer.id)
     or (match_row.user1_id = peer.id and match_row.user2_id = v_profile_id))
  where (request.actor_id = v_profile_id or request.recipient_id = v_profile_id)
    and request.metadata ->> 'source' = 'circles'
    and request.metadata ->> 'circle_id' = p_circle_id::text
    and request.status in ('pending', 'accepted', 'matched')
  order by request.created_at desc;
end;
$$;

revoke all on function public.rpc_get_my_circle_dating_preference(uuid) from public, anon;
revoke all on function public.rpc_set_my_circle_dating_preference(uuid, boolean, boolean) from public, anon;
revoke all on function public.rpc_pass_circle_dating_candidate(uuid, uuid) from public, anon;
revoke all on function public.rpc_get_circle_dating_candidates(uuid, integer) from public, anon;
revoke all on function public.rpc_get_circle_dating_connections(uuid) from public, anon;

grant execute on function public.rpc_get_my_circle_dating_preference(uuid) to authenticated;
grant execute on function public.rpc_set_my_circle_dating_preference(uuid, boolean, boolean) to authenticated;
grant execute on function public.rpc_pass_circle_dating_candidate(uuid, uuid) to authenticated;
grant execute on function public.rpc_get_circle_dating_candidates(uuid, integer) to authenticated;
grant execute on function public.rpc_get_circle_dating_connections(uuid) to authenticated;

commit;
