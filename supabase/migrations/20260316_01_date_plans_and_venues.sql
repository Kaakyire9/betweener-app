create table if not exists public.betweener_venues (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  address text not null,
  city text not null,
  region text,
  lat double precision not null,
  lng double precision not null,
  google_place_id text,
  map_link text,
  summary text,
  badges jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint betweener_venues_badges_is_array
    check (jsonb_typeof(badges) = 'array'),
  constraint betweener_venues_metadata_is_object
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists betweener_venues_active_sort_idx
  on public.betweener_venues (is_active, sort_order, city, name);

create or replace function public.set_betweener_venues_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists betweener_venues_set_updated_at on public.betweener_venues;
create trigger betweener_venues_set_updated_at
before update on public.betweener_venues
for each row execute function public.set_betweener_venues_updated_at();

insert into public.betweener_venues (
  slug,
  name,
  address,
  city,
  region,
  lat,
  lng,
  summary,
  badges,
  metadata,
  sort_order,
  is_active
)
values
  (
    'mikline-hotel-restaurant-kumasi',
    'Mikline Hotel Restaurant Kumasi',
    'Kumasi, Ghana',
    'Kumasi',
    'Ashanti',
    6.6885,
    -1.6244,
    'A calm dinner setting with Betweener-ready service.',
    '["Betweener Safe Venue","Betweener Discount","First-date surprise"]'::jsonb,
    jsonb_build_object(
      'partner', true,
      'planning_support', true,
      'date_vibe', 'Calm dinner energy',
      'trust_reasons', jsonb_build_array(
        'Well-lit setting',
        'Partner-aware team',
        'Easy-to-find arrival'
      ),
      'concierge_services', jsonb_build_array(
        'Reserve venue',
        'Arrange surprise touch',
        'Safer meetup support'
      )
    ),
    10,
    true
  ),
  (
    'mikline-hotel-restaurant-accra',
    'Mikline Hotel Restaurant Accra',
    'Accra, Ghana',
    'Accra',
    'Greater Accra',
    5.6037,
    -0.1870,
    'An easy city meet-up with a polished first-date feel.',
    '["Betweener Safe Venue","Betweener Discount","First-date surprise"]'::jsonb,
    jsonb_build_object(
      'partner', true,
      'planning_support', true,
      'date_vibe', 'Polished city meet-up',
      'trust_reasons', jsonb_build_array(
        'Central public location',
        'Smooth first-date arrival',
        'Comfortable social setting'
      ),
      'concierge_services', jsonb_build_array(
        'Reserve venue',
        'Arrange surprise touch',
        'Safer meetup support'
      )
    ),
    20,
    true
  )
on conflict (slug) do update set
  name = excluded.name,
  address = excluded.address,
  city = excluded.city,
  region = excluded.region,
  lat = excluded.lat,
  lng = excluded.lng,
  summary = excluded.summary,
  badges = excluded.badges,
  metadata = excluded.metadata,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();

alter table public.betweener_venues enable row level security;

drop policy if exists "betweener_venues_select_active" on public.betweener_venues;
create policy "betweener_venues_select_active"
on public.betweener_venues
for select
to authenticated
using (is_active = true);

create table if not exists public.date_plans (
  id uuid primary key default gen_random_uuid(),
  creator_profile_id uuid not null references public.profiles(id) on delete cascade,
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  parent_plan_id uuid references public.date_plans(id) on delete set null,
  venue_id uuid references public.betweener_venues(id) on delete set null,
  message_id uuid unique references public.messages(id) on delete set null,
  scheduled_for timestamptz not null,
  place_name text not null,
  place_address text,
  place_source text not null,
  place_badges jsonb not null default '[]'::jsonb,
  place_summary text,
  city text,
  lat double precision,
  lng double precision,
  note text,
  response_kind text not null default 'initial',
  status text not null default 'pending',
  accepted_at timestamptz,
  accepted_by_profile_id uuid references public.profiles(id) on delete set null,
  declined_at timestamptz,
  declined_by_profile_id uuid references public.profiles(id) on delete set null,
  concierge_requested boolean not null default false,
  concierge_requested_at timestamptz,
  concierge_requested_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint date_plans_creator_recipient_different
    check (creator_profile_id <> recipient_profile_id and creator_user_id <> recipient_user_id),
  constraint date_plans_place_source_valid
    check (place_source in ('betweener_pick', 'nearby', 'search', 'preferred')),
  constraint date_plans_response_kind_valid
    check (response_kind in ('initial', 'counter_time', 'counter_place', 'counter_both')),
  constraint date_plans_status_valid
    check (status in ('pending', 'accepted', 'declined', 'cancelled', 'countered')),
  constraint date_plans_place_badges_is_array
    check (jsonb_typeof(place_badges) = 'array')
);

alter table public.date_plans
  add column if not exists parent_plan_id uuid references public.date_plans(id) on delete set null,
  add column if not exists response_kind text not null default 'initial';

alter table public.date_plans
  drop constraint if exists date_plans_response_kind_valid;
alter table public.date_plans
  add constraint date_plans_response_kind_valid
    check (response_kind in ('initial', 'counter_time', 'counter_place', 'counter_both'));

alter table public.date_plans
  drop constraint if exists date_plans_status_valid;
alter table public.date_plans
  add constraint date_plans_status_valid
    check (status in ('pending', 'accepted', 'declined', 'cancelled', 'countered'));

create index if not exists date_plans_creator_user_status_idx
  on public.date_plans (creator_user_id, status, created_at desc);
create index if not exists date_plans_recipient_user_status_idx
  on public.date_plans (recipient_user_id, status, created_at desc);
create index if not exists date_plans_parent_plan_id_idx
  on public.date_plans (parent_plan_id, created_at desc);
create unique index if not exists date_plans_one_pending_per_pair_idx
  on public.date_plans (
    least(creator_profile_id, recipient_profile_id),
    greatest(creator_profile_id, recipient_profile_id)
  )
  where status = 'pending';

create or replace function public.set_date_plans_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists date_plans_set_updated_at on public.date_plans;
create trigger date_plans_set_updated_at
before update on public.date_plans
for each row execute function public.set_date_plans_updated_at();

alter table public.date_plans enable row level security;

drop policy if exists "date_plans_select_participants" on public.date_plans;
create policy "date_plans_select_participants"
on public.date_plans
for select
to authenticated
using (
  creator_user_id = auth.uid()
  or recipient_user_id = auth.uid()
  or public.is_internal_admin()
);

create table if not exists public.date_plan_concierge_requests (
  id uuid primary key default gen_random_uuid(),
  date_plan_id uuid not null references public.date_plans(id) on delete cascade,
  requested_by_profile_id uuid not null references public.profiles(id) on delete cascade,
  requested_by_user_id uuid not null references auth.users(id) on delete cascade,
  assigned_admin_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending',
  note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint date_plan_concierge_requests_status_valid
    check (status in ('pending', 'claimed', 'completed', 'cancelled')),
  unique (date_plan_id)
);

create index if not exists date_plan_concierge_requests_status_idx
  on public.date_plan_concierge_requests (status, created_at desc);

create or replace function public.set_date_plan_concierge_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists date_plan_concierge_requests_set_updated_at on public.date_plan_concierge_requests;
create trigger date_plan_concierge_requests_set_updated_at
before update on public.date_plan_concierge_requests
for each row execute function public.set_date_plan_concierge_requests_updated_at();

alter table public.date_plan_concierge_requests enable row level security;

drop policy if exists "date_plan_concierge_requests_select_scope" on public.date_plan_concierge_requests;
create policy "date_plan_concierge_requests_select_scope"
on public.date_plan_concierge_requests
for select
to authenticated
using (
  requested_by_user_id = auth.uid()
  or public.is_internal_admin()
  or exists (
    select 1
    from public.date_plans dp
    where dp.id = date_plan_concierge_requests.date_plan_id
      and (dp.creator_user_id = auth.uid() or dp.recipient_user_id = auth.uid())
  )
);

create or replace function public.rpc_send_date_plan(
  p_recipient_profile_id uuid,
  p_scheduled_for timestamptz,
  p_place_name text,
  p_place_address text default null,
  p_place_source text default 'search',
  p_place_badges jsonb default '[]'::jsonb,
  p_place_summary text default null,
  p_city text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_note text default null,
  p_venue_id uuid default null,
  p_parent_plan_id uuid default null,
  p_response_kind text default 'initial',
  p_reply_to_message_id uuid default null
)
returns table (
  plan_id uuid,
  message_id uuid
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor_profile public.profiles%rowtype;
  v_recipient_profile public.profiles%rowtype;
  v_message_id uuid;
  v_plan_id uuid;
  v_place_badges jsonb := coalesce(p_place_badges, '[]'::jsonb);
  v_has_match boolean := false;
  v_has_accepted_connect boolean := false;
  v_has_active_chat boolean := false;
  v_has_guess_interest boolean := false;
  v_has_strong_signals boolean := false;
  v_message_stats record;
  v_message_text text;
  v_parent_plan public.date_plans%rowtype;
  v_target_profile public.profiles%rowtype;
begin
  select *
  into v_actor_profile
  from public.profiles
  where user_id = auth.uid()
  limit 1;

  if v_actor_profile.id is null then
    raise exception 'actor_profile_not_found';
  end if;

  select *
  into v_recipient_profile
  from public.profiles
  where id = p_recipient_profile_id
  limit 1;

  if v_recipient_profile.id is null then
    raise exception 'recipient_profile_not_found';
  end if;

  if v_recipient_profile.user_id = auth.uid() then
    raise exception 'cannot_plan_date_with_yourself';
  end if;

  if p_scheduled_for <= now() then
    raise exception 'Choose a future time for the suggestion.';
  end if;

  if btrim(coalesce(p_place_name, '')) = '' then
    raise exception 'Choose a place before sending the suggestion.';
  end if;

  if p_place_source not in ('betweener_pick', 'nearby', 'search', 'preferred') then
    raise exception 'invalid_place_source';
  end if;

  if p_response_kind not in ('initial', 'counter_time', 'counter_place', 'counter_both') then
    raise exception 'invalid_response_kind';
  end if;

  if jsonb_typeof(v_place_badges) <> 'array' then
    raise exception 'invalid_place_badges';
  end if;

  if exists (
    select 1
    from public.blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = v_recipient_profile.user_id)
       or (b.blocker_id = v_recipient_profile.user_id and b.blocked_id = auth.uid())
  ) then
    raise exception 'blocked';
  end if;

  if p_venue_id is not null and not exists (
    select 1
    from public.betweener_venues bv
    where bv.id = p_venue_id
      and bv.is_active = true
  ) then
    raise exception 'venue_not_available';
  end if;

  select exists (
    select 1
    from public.matches m
    where m.status in ('PENDING', 'ACCEPTED')
      and (
        (m.user1_id = v_actor_profile.id and m.user2_id = v_recipient_profile.id)
        or (m.user1_id = v_recipient_profile.id and m.user2_id = v_actor_profile.id)
      )
  )
  into v_has_match;

  select exists (
    select 1
    from public.intent_requests ir
    where ir.type = 'connect'
      and ir.status in ('accepted', 'matched')
      and (
        (ir.actor_id = v_actor_profile.id and ir.recipient_id = v_recipient_profile.id)
        or (ir.actor_id = v_recipient_profile.id and ir.recipient_id = v_actor_profile.id)
      )
  )
  into v_has_accepted_connect;

  select exists (
    select 1
    from public.intent_requests ir
    where ir.type = 'connect'
      and lower(coalesce(ir.metadata->>'source', '')) = 'guess_prompt'
      and (
        (ir.actor_id = v_actor_profile.id and ir.recipient_id = v_recipient_profile.id)
        or (ir.actor_id = v_recipient_profile.id and ir.recipient_id = v_actor_profile.id)
      )
  )
  into v_has_guess_interest;

  select
    count(*) as total_count,
    count(*) filter (where sender_id = auth.uid()) as actor_count,
    count(*) filter (where sender_id = v_recipient_profile.user_id) as recipient_count
  into v_message_stats
  from public.messages m
  where (
    (m.sender_id = auth.uid() and m.receiver_id = v_recipient_profile.user_id)
    or (m.sender_id = v_recipient_profile.user_id and m.receiver_id = auth.uid())
  );

  v_has_active_chat := coalesce(v_message_stats.total_count, 0) > 0;
  v_has_strong_signals :=
    coalesce(v_message_stats.total_count, 0) >= 6
    and coalesce(v_message_stats.actor_count, 0) >= 2
    and coalesce(v_message_stats.recipient_count, 0) >= 2;

  if not (v_has_match or v_has_accepted_connect or v_has_active_chat or v_has_guess_interest or v_has_strong_signals) then
    raise exception 'Keep warming the connection first, then plan the date from chat.';
  end if;

  if p_parent_plan_id is not null then
    select *
    into v_parent_plan
    from public.date_plans
    where id = p_parent_plan_id
    limit 1;

    if v_parent_plan.id is null then
      raise exception 'date_plan_not_found';
    end if;

    if auth.uid() not in (v_parent_plan.creator_user_id, v_parent_plan.recipient_user_id) then
      raise exception 'Only participants can respond to this suggestion.';
    end if;

    if v_parent_plan.status not in ('pending', 'accepted') then
      raise exception 'This date suggestion can no longer be updated.';
    end if;

    if p_response_kind = 'initial' then
      raise exception 'counter_suggestion_requires_response_kind';
    end if;

    if auth.uid() = v_parent_plan.creator_user_id then
      select * into v_target_profile from public.profiles where id = v_parent_plan.recipient_profile_id limit 1;
    else
      select * into v_target_profile from public.profiles where id = v_parent_plan.creator_profile_id limit 1;
    end if;

    if v_target_profile.id is null then
      raise exception 'recipient_profile_not_found';
    end if;

    v_recipient_profile := v_target_profile;

  end if;

  if exists (
    select 1
    from public.date_plans dp
    where dp.status = 'pending'
      and (p_parent_plan_id is null or dp.id <> p_parent_plan_id)
      and (
        (dp.creator_profile_id = v_actor_profile.id and dp.recipient_profile_id = v_recipient_profile.id)
        or (dp.creator_profile_id = v_recipient_profile.id and dp.recipient_profile_id = v_actor_profile.id)
      )
  ) then
    raise exception 'There is already a date suggestion waiting for a response.';
  end if;

  if v_parent_plan.id is not null and v_parent_plan.status = 'pending' then
    update public.date_plans
    set status = 'countered',
        updated_at = now()
    where id = v_parent_plan.id;
  end if;

  insert into public.date_plans (
    creator_profile_id,
    creator_user_id,
    recipient_profile_id,
    recipient_user_id,
    parent_plan_id,
    venue_id,
    scheduled_for,
    place_name,
    place_address,
    place_source,
    place_badges,
    place_summary,
    city,
    lat,
    lng,
    note,
    response_kind
  )
  values (
    v_actor_profile.id,
    auth.uid(),
    v_recipient_profile.id,
    v_recipient_profile.user_id,
    p_parent_plan_id,
    p_venue_id,
    p_scheduled_for,
    btrim(p_place_name),
    nullif(btrim(coalesce(p_place_address, '')), ''),
    p_place_source,
    v_place_badges,
    nullif(btrim(coalesce(p_place_summary, '')), ''),
    nullif(btrim(coalesce(p_city, '')), ''),
    p_lat,
    p_lng,
    nullif(btrim(coalesce(p_note, '')), ''),
    p_response_kind
  )
  returning id into v_plan_id;

  v_message_text := 'date_plan::' || jsonb_build_object(
    'planId', v_plan_id,
    'parentPlanId', p_parent_plan_id,
    'venueId', p_venue_id,
    'scheduledFor', p_scheduled_for,
    'placeName', btrim(p_place_name),
    'placeAddress', nullif(btrim(coalesce(p_place_address, '')), ''),
    'source', p_place_source,
    'badges', v_place_badges,
    'summary', nullif(btrim(coalesce(p_place_summary, '')), ''),
    'city', nullif(btrim(coalesce(p_city, '')), ''),
    'lat', p_lat,
    'lng', p_lng,
    'note', nullif(btrim(coalesce(p_note, '')), ''),
    'responseKind', p_response_kind,
    'status', 'pending',
    'conciergeRequested', false
  )::text;

  insert into public.messages (
    text,
    sender_id,
    receiver_id,
    is_read,
    message_type,
    reply_to_message_id
  )
  values (
    v_message_text,
    auth.uid(),
    v_recipient_profile.user_id,
    false,
    'text',
    p_reply_to_message_id
  )
  returning id into v_message_id;

  update public.date_plans
  set message_id = v_message_id
  where id = v_plan_id;

  return query
  select v_plan_id, v_message_id;
end;
$$;

create or replace function public.rpc_accept_date_plan(
  p_plan_id uuid
)
returns table (
  plan_id uuid,
  status text,
  concierge_requested boolean
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_plan public.date_plans%rowtype;
  v_parent_plan public.date_plans%rowtype;
  v_actor_profile public.profiles%rowtype;
  v_creator_name text;
  v_recipient_name text;
begin
  select *
  into v_actor_profile
  from public.profiles
  where user_id = auth.uid()
  limit 1;

  if v_actor_profile.id is null then
    raise exception 'actor_profile_not_found';
  end if;

  select *
  into v_plan
  from public.date_plans
  where id = p_plan_id
  limit 1;

  if v_plan.id is null then
    raise exception 'date_plan_not_found';
  end if;

  if v_plan.recipient_user_id <> auth.uid() then
    raise exception 'Only the other person can accept this date suggestion.';
  end if;

  if v_plan.status = 'accepted' then
    return query
    select v_plan.id, v_plan.status, v_plan.concierge_requested;
    return;
  end if;

  if v_plan.status <> 'pending' then
    raise exception 'This date suggestion can no longer be accepted.';
  end if;

  update public.date_plans
  set status = 'accepted',
      accepted_at = now(),
      accepted_by_profile_id = v_actor_profile.id,
      declined_at = null,
      declined_by_profile_id = null,
      updated_at = now()
  where id = p_plan_id;

  if v_plan.parent_plan_id is not null then
    select *
    into v_parent_plan
    from public.date_plans
    where id = v_plan.parent_plan_id
    limit 1;

    if v_parent_plan.id is not null and v_parent_plan.status = 'accepted' then
      update public.date_plans
      set status = 'cancelled',
          accepted_at = null,
          accepted_by_profile_id = null,
          concierge_requested = false,
          concierge_requested_at = null,
          concierge_requested_by_profile_id = null,
          updated_at = now()
      where id = v_parent_plan.id;

      update public.date_plan_concierge_requests
      set status = 'cancelled',
          resolved_at = coalesce(resolved_at, now()),
          updated_at = now()
      where date_plan_id = v_parent_plan.id
        and public.date_plan_concierge_requests.status in ('pending', 'claimed');
    end if;
  end if;

  select full_name into v_creator_name from public.profiles where id = v_plan.creator_profile_id;
  select full_name into v_recipient_name from public.profiles where id = v_plan.recipient_profile_id;

  insert into public.system_messages (
    user_id,
    peer_user_id,
    event_type,
    text,
    metadata
  )
  values (
    v_plan.creator_user_id,
    v_plan.recipient_user_id,
    'date_plan_accepted',
    coalesce(v_recipient_name, 'They') || ' accepted your date suggestion. Betweener can help with the plan.',
    jsonb_build_object('date_plan_id', p_plan_id, 'role', 'requester')
  );

  insert into public.system_messages (
    user_id,
    peer_user_id,
    event_type,
    text,
    metadata
  )
  values (
    v_plan.recipient_user_id,
    v_plan.creator_user_id,
    'date_plan_accepted',
    'You accepted ' || coalesce(v_creator_name, 'their') || '''s date suggestion. Betweener can help if you want.',
    jsonb_build_object('date_plan_id', p_plan_id, 'role', 'accepter')
  );

  return query
  select p_plan_id, 'accepted', false;
end;
$$;

create or replace function public.rpc_decline_date_plan(
  p_plan_id uuid
)
returns table (
  plan_id uuid,
  status text,
  concierge_requested boolean
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_plan public.date_plans%rowtype;
  v_actor_profile public.profiles%rowtype;
  v_creator_name text;
  v_recipient_name text;
begin
  select *
  into v_actor_profile
  from public.profiles
  where user_id = auth.uid()
  limit 1;

  if v_actor_profile.id is null then
    raise exception 'actor_profile_not_found';
  end if;

  select *
  into v_plan
  from public.date_plans
  where id = p_plan_id
  limit 1;

  if v_plan.id is null then
    raise exception 'date_plan_not_found';
  end if;

  if v_plan.recipient_user_id <> auth.uid() then
    raise exception 'Only the other person can respond to this date suggestion.';
  end if;

  if v_plan.status = 'declined' then
    return query
    select v_plan.id, v_plan.status, v_plan.concierge_requested;
    return;
  end if;

  if v_plan.status <> 'pending' then
    raise exception 'This date suggestion can no longer be changed.';
  end if;

  update public.date_plans
  set status = 'declined',
      declined_at = now(),
      declined_by_profile_id = v_actor_profile.id,
      accepted_at = null,
      accepted_by_profile_id = null,
      updated_at = now()
  where id = p_plan_id;

  select full_name into v_creator_name from public.profiles where id = v_plan.creator_profile_id;
  select full_name into v_recipient_name from public.profiles where id = v_plan.recipient_profile_id;

  insert into public.system_messages (
    user_id,
    peer_user_id,
    event_type,
    text,
    metadata
  )
  values (
    v_plan.creator_user_id,
    v_plan.recipient_user_id,
    'date_plan_declined',
    coalesce(v_recipient_name, 'They') || ' passed on your date suggestion for now.',
    jsonb_build_object('date_plan_id', p_plan_id, 'role', 'requester')
  );

  insert into public.system_messages (
    user_id,
    peer_user_id,
    event_type,
    text,
    metadata
  )
  values (
    v_plan.recipient_user_id,
    v_plan.creator_user_id,
    'date_plan_declined',
    'You passed on ' || coalesce(v_creator_name, 'their') || '''s date suggestion.',
    jsonb_build_object('date_plan_id', p_plan_id, 'role', 'accepter')
  );

  return query
  select p_plan_id, 'declined', false;
end;
$$;

create or replace function public.rpc_cancel_date_plan(
  p_plan_id uuid
)
returns table (
  plan_id uuid,
  status text,
  concierge_requested boolean
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_plan public.date_plans%rowtype;
  v_actor_profile public.profiles%rowtype;
  v_cancelled_by_name text;
  v_requester_text text;
  v_actor_text text;
begin
  select *
  into v_actor_profile
  from public.profiles
  where user_id = auth.uid()
  limit 1;

  if v_actor_profile.id is null then
    raise exception 'actor_profile_not_found';
  end if;

  select *
  into v_plan
  from public.date_plans
  where id = p_plan_id
  limit 1;

  if v_plan.id is null then
    raise exception 'date_plan_not_found';
  end if;

  if auth.uid() not in (v_plan.creator_user_id, v_plan.recipient_user_id) then
    raise exception 'Only participants can cancel this date plan.';
  end if;

  if v_plan.status = 'cancelled' then
    return query
    select v_plan.id, v_plan.status, false;
    return;
  end if;

  if v_plan.status not in ('pending', 'accepted') then
    raise exception 'This date plan can no longer be cancelled.';
  end if;

  if v_plan.status = 'pending' and auth.uid() <> v_plan.creator_user_id then
    raise exception 'Only the person who suggested the plan can cancel it while it is waiting.';
  end if;

  update public.date_plans
  set status = 'cancelled',
      accepted_at = null,
      accepted_by_profile_id = null,
      declined_at = null,
      declined_by_profile_id = null,
      concierge_requested = false,
      concierge_requested_at = null,
      concierge_requested_by_profile_id = null,
      updated_at = now()
  where id = p_plan_id;

  update public.date_plan_concierge_requests
  set status = 'cancelled',
      resolved_at = coalesce(resolved_at, now()),
      updated_at = now()
  where date_plan_id = p_plan_id
    and public.date_plan_concierge_requests.status in ('pending', 'claimed');

  v_cancelled_by_name := coalesce(v_actor_profile.full_name, 'Someone');

  if v_plan.status = 'pending' then
    v_requester_text := v_cancelled_by_name || ' cancelled the date suggestion.';
    v_actor_text := 'You cancelled the date suggestion.';
  else
    v_requester_text := v_cancelled_by_name || ' cancelled the date plan.';
    v_actor_text := 'You cancelled the date plan.';
  end if;

  insert into public.system_messages (
    user_id,
    peer_user_id,
    event_type,
    text,
    metadata
  )
  values (
    v_plan.creator_user_id,
    v_plan.recipient_user_id,
    'date_plan_cancelled',
    case
      when auth.uid() = v_plan.creator_user_id then v_actor_text
      else v_requester_text
    end,
    jsonb_build_object('date_plan_id', p_plan_id, 'role', case when auth.uid() = v_plan.creator_user_id then 'requester' else 'participant' end)
  );

  insert into public.system_messages (
    user_id,
    peer_user_id,
    event_type,
    text,
    metadata
  )
  values (
    v_plan.recipient_user_id,
    v_plan.creator_user_id,
    'date_plan_cancelled',
    case
      when auth.uid() = v_plan.recipient_user_id then v_actor_text
      else v_requester_text
    end,
    jsonb_build_object('date_plan_id', p_plan_id, 'role', case when auth.uid() = v_plan.recipient_user_id then 'requester' else 'participant' end)
  );

  return query
  select p_plan_id, 'cancelled', false;
end;
$$;

create or replace function public.rpc_request_date_plan_concierge(
  p_plan_id uuid,
  p_note text default null
)
returns table (
  request_id uuid,
  plan_id uuid,
  concierge_requested boolean
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_plan public.date_plans%rowtype;
  v_actor_profile public.profiles%rowtype;
  v_request_id uuid;
  v_creator_name text;
  v_recipient_name text;
  v_first_request boolean := false;
begin
  select *
  into v_actor_profile
  from public.profiles
  where user_id = auth.uid()
  limit 1;

  if v_actor_profile.id is null then
    raise exception 'actor_profile_not_found';
  end if;

  select *
  into v_plan
  from public.date_plans
  where id = p_plan_id
  limit 1;

  if v_plan.id is null then
    raise exception 'date_plan_not_found';
  end if;

  if auth.uid() not in (v_plan.creator_user_id, v_plan.recipient_user_id) then
    raise exception 'Only participants can ask Betweener to help.';
  end if;

  if v_plan.status <> 'accepted' then
    raise exception 'Accept the date suggestion before asking Betweener to help.';
  end if;

  if not v_plan.concierge_requested then
    update public.date_plans
    set concierge_requested = true,
        concierge_requested_at = now(),
        concierge_requested_by_profile_id = v_actor_profile.id,
        updated_at = now()
    where id = p_plan_id;
    v_first_request := true;
  end if;

  insert into public.date_plan_concierge_requests (
    date_plan_id,
    requested_by_profile_id,
    requested_by_user_id,
    note
  )
  values (
    p_plan_id,
    v_actor_profile.id,
    auth.uid(),
    nullif(btrim(coalesce(p_note, '')), '')
  )
  on conflict (date_plan_id)
  do update set
    note = coalesce(excluded.note, public.date_plan_concierge_requests.note),
    updated_at = now()
  returning id into v_request_id;

  if v_first_request then
    select full_name into v_creator_name from public.profiles where id = v_plan.creator_profile_id;
    select full_name into v_recipient_name from public.profiles where id = v_plan.recipient_profile_id;

    insert into public.system_messages (
      user_id,
      peer_user_id,
      event_type,
      text,
      metadata
    )
    values (
      v_plan.creator_user_id,
      v_plan.recipient_user_id,
      'date_plan_concierge_requested',
      'Betweener is helping with your date plan with ' || coalesce(v_recipient_name, 'them') || '.',
      jsonb_build_object('date_plan_id', p_plan_id, 'role', case when auth.uid() = v_plan.creator_user_id then 'requester' else 'participant' end)
    );

    insert into public.system_messages (
      user_id,
      peer_user_id,
      event_type,
      text,
      metadata
    )
    values (
      v_plan.recipient_user_id,
      v_plan.creator_user_id,
      'date_plan_concierge_requested',
      'Betweener is helping with your date plan with ' || coalesce(v_creator_name, 'them') || '.',
      jsonb_build_object('date_plan_id', p_plan_id, 'role', case when auth.uid() = v_plan.recipient_user_id then 'requester' else 'participant' end)
    );
  end if;

  return query
  select v_request_id, p_plan_id, true;
end;
$$;

create or replace function public.rpc_admin_get_date_plan_concierge_queue()
returns table (
  request_id uuid,
  request_status text,
  request_note text,
  requested_at timestamptz,
  requested_by_profile_id uuid,
  requested_by_name text,
  date_plan_id uuid,
  date_plan_status text,
  scheduled_for timestamptz,
  place_name text,
  place_address text,
  city text,
  creator_profile_id uuid,
  creator_name text,
  recipient_profile_id uuid,
  recipient_name text,
  concierge_requested_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not public.is_internal_admin() then
    raise exception 'admin access required';
  end if;

  return query
  select
    dcr.id as request_id,
    dcr.status as request_status,
    dcr.note as request_note,
    dcr.created_at as requested_at,
    dcr.requested_by_profile_id,
    req.full_name as requested_by_name,
    dp.id as date_plan_id,
    dp.status as date_plan_status,
    dp.scheduled_for,
    dp.place_name,
    dp.place_address,
    dp.city,
    dp.creator_profile_id,
    creator.full_name as creator_name,
    dp.recipient_profile_id,
    recipient.full_name as recipient_name,
    dp.concierge_requested_at
  from public.date_plan_concierge_requests dcr
  join public.date_plans dp on dp.id = dcr.date_plan_id
  left join public.profiles req on req.id = dcr.requested_by_profile_id
  left join public.profiles creator on creator.id = dp.creator_profile_id
  left join public.profiles recipient on recipient.id = dp.recipient_profile_id
  order by dcr.created_at desc;
end;
$$;

grant execute on function public.rpc_send_date_plan(
  uuid,
  timestamptz,
  text,
  text,
  text,
  jsonb,
  text,
  text,
  double precision,
  double precision,
  text,
  uuid,
  uuid,
  text,
  uuid
) to authenticated;

grant execute on function public.rpc_accept_date_plan(uuid) to authenticated;
grant execute on function public.rpc_cancel_date_plan(uuid) to authenticated;
grant execute on function public.rpc_decline_date_plan(uuid) to authenticated;
grant execute on function public.rpc_request_date_plan_concierge(uuid, text) to authenticated;
grant execute on function public.rpc_admin_get_date_plan_concierge_queue() to authenticated;

alter table public.date_plans replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'date_plans'
  ) then
    alter publication supabase_realtime add table public.date_plans;
  end if;
end $$;
