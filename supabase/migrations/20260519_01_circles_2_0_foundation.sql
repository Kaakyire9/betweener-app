-- Circles 2.0 foundation.
--
-- Extends the existing Circles v1 schema instead of replacing it. The v1 app
-- still reads visibility = public/private and roles = leader/matchmaker/member,
-- so those legacy values remain accepted while the new curated model rolls out.

create extension if not exists pgcrypto;

create or replace function public.slugify(p_value text)
returns text
language sql
immutable
set search_path = public, pg_catalog
as $$
  select trim(both '-' from regexp_replace(regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', '-', 'g'), '-+', '-', 'g'));
$$;

create or replace function public.is_admin_user(p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from public.internal_admins ia
      where ia.user_id = p_user_id
    ),
    false
  );
$$;

revoke all on function public.is_admin_user(uuid) from public;
grant execute on function public.is_admin_user(uuid) to authenticated;

create or replace function public.has_gold_entitlement(
  p_user_id uuid default auth.uid(),
  p_profile_id uuid default null
)
returns boolean
language plpgsql
security definer
stable
set search_path = public, pg_catalog
as $$
declare
  v_plan public.subscription_type := 'FREE';
  v_profile_user_id uuid;
begin
  if p_user_id is null and p_profile_id is not null then
    select p.user_id
      into v_profile_user_id
    from public.profiles p
    where p.id = p_profile_id
      and p.deleted_at is null
    limit 1;

    p_user_id := v_profile_user_id;
  end if;

  if p_user_id is null then
    return false;
  end if;

  if public.is_admin_user(p_user_id) then
    return true;
  end if;

  v_plan := public.get_active_subscription_plan(p_user_id);
  return v_plan = 'GOLD'::public.subscription_type;
end;
$$;

revoke all on function public.has_gold_entitlement(uuid, uuid) from public;
grant execute on function public.has_gold_entitlement(uuid, uuid) to authenticated;

alter table public.circles
  add column if not exists slug text,
  add column if not exists short_description text,
  add column if not exists cover_image_url text,
  add column if not exists icon_url text,
  add column if not exists circle_type text not null default 'community',
  add column if not exists status text not null default 'pending_review',
  add column if not exists visibility_scope text not null default 'country',
  add column if not exists country_code text,
  add column if not exists country_name text,
  add column if not exists region text,
  add column if not exists city text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists diaspora_tags text[] not null default '{}',
  add column if not exists culture_tags text[] not null default '{}',
  add column if not exists faith_tags text[] not null default '{}',
  add column if not exists interest_tags text[] not null default '{}',
  add column if not exists audience_tags text[] not null default '{}',
  add column if not exists is_official boolean not null default false,
  add column if not exists is_partner boolean not null default false,
  add column if not exists is_featured boolean not null default false,
  add column if not exists requires_join_approval boolean not null default false,
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists approved_by_admin_id uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_reason text,
  add column if not exists rules text,
  add column if not exists safety_note text,
  add column if not exists report_count integer not null default 0,
  add column if not exists member_count integer not null default 0,
  add column if not exists active_this_week_count integer not null default 0,
  add column if not exists gathering_count integer not null default 0,
  add column if not exists archived_at timestamptz;

alter table public.circles
  alter column created_by_profile_id drop not null;

alter table public.circles
  drop constraint if exists circles_created_by_profile_id_fkey;

alter table public.circles
  add constraint circles_created_by_profile_id_fkey
  foreign key (created_by_profile_id) references public.profiles(id) on delete set null;

update public.circles c
set
  slug = coalesce(nullif(c.slug, ''), public.slugify(c.name) || '-' || left(c.id::text, 8)),
  status = case
    when c.status in ('draft', 'pending_review', 'approved', 'rejected', 'archived') then c.status
    else 'approved'
  end,
  circle_type = case
    when c.circle_type in ('official', 'partner', 'gold_community', 'private', 'community') then c.circle_type
    when c.visibility = 'private' then 'private'
    else 'community'
  end,
  visibility_scope = case
    when c.visibility_scope in ('local', 'country', 'diaspora', 'global', 'invite_only') then c.visibility_scope
    when c.visibility = 'private' then 'invite_only'
    else 'country'
  end,
  created_by_user_id = coalesce(c.created_by_user_id, p.user_id),
  approved_at = case when c.status = 'approved' then coalesce(c.approved_at, c.created_at) else c.approved_at end
from public.profiles p
where c.created_by_profile_id = p.id;

update public.circles
set status = 'approved',
    approved_at = coalesce(approved_at, created_at)
where status = 'pending_review'
  and created_at < timezone('utc'::text, now()) - interval '1 minute';

do $$
begin
  alter table public.circles drop constraint if exists circles_type_valid;
  alter table public.circles add constraint circles_type_valid
    check (circle_type in ('official', 'partner', 'gold_community', 'private', 'community')) not valid;

  alter table public.circles drop constraint if exists circles_status_valid;
  alter table public.circles add constraint circles_status_valid
    check (status in ('draft', 'pending_review', 'approved', 'rejected', 'archived')) not valid;

  alter table public.circles drop constraint if exists circles_visibility_scope_valid;
  alter table public.circles add constraint circles_visibility_scope_valid
    check (visibility_scope in ('local', 'country', 'diaspora', 'global', 'invite_only')) not valid;

  alter table public.circles drop constraint if exists circles_name_length_valid;
  alter table public.circles add constraint circles_name_length_valid
    check (char_length(btrim(name)) between 3 and 80) not valid;

  alter table public.circles drop constraint if exists circles_description_length_valid;
  alter table public.circles add constraint circles_description_length_valid
    check (description is null or char_length(description) <= 2000) not valid;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'circles_slug_unique_idx'
  )
  and not exists (
    select 1
    from public.circles
    where slug is not null
    group by slug
    having count(*) > 1
  ) then
    create unique index circles_slug_unique_idx
      on public.circles (slug)
      where slug is not null;
  end if;
end;
$$;

create index if not exists circles_status_idx on public.circles (status);
create index if not exists circles_type_idx on public.circles (circle_type);
create index if not exists circles_country_code_idx on public.circles (country_code);
create index if not exists circles_city_idx on public.circles (city);
create index if not exists circles_visibility_scope_idx on public.circles (visibility_scope);
create index if not exists circles_featured_idx on public.circles (is_featured);
create index if not exists circles_created_by_user_idx on public.circles (created_by_user_id);
create index if not exists circles_diaspora_tags_gin_idx on public.circles using gin (diaspora_tags);
create index if not exists circles_faith_tags_gin_idx on public.circles using gin (faith_tags);
create index if not exists circles_interest_tags_gin_idx on public.circles using gin (interest_tags);
create index if not exists circles_audience_tags_gin_idx on public.circles using gin (audience_tags);

alter table public.circle_members
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists joined_at timestamptz not null default timezone('utc'::text, now()),
  add column if not exists left_at timestamptz,
  add column if not exists updated_at timestamptz not null default timezone('utc'::text, now());

update public.circle_members cm
set user_id = coalesce(cm.user_id, p.user_id),
    joined_at = coalesce(cm.joined_at, cm.created_at)
from public.profiles p
where cm.profile_id = p.id;

do $$
begin
  alter table public.circle_members drop constraint if exists circle_members_role_check;
  alter table public.circle_members add constraint circle_members_role_check
    check (role in ('member', 'host', 'moderator', 'admin', 'leader', 'matchmaker')) not valid;

  alter table public.circle_members drop constraint if exists circle_members_status_check;
  alter table public.circle_members add constraint circle_members_status_check
    check (status in ('pending', 'active', 'removed', 'left', 'banned', 'invited')) not valid;
end;
$$;

create index if not exists circle_members_user_id_idx on public.circle_members (user_id);
create index if not exists circle_members_role_idx on public.circle_members (role);
create index if not exists circle_members_status_role_idx on public.circle_members (status, role);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

create or replace function public.is_circle_member(p_circle_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
set row_security = off
as $$
declare
  v_exists boolean;
begin
  select exists (
    select 1
    from public.circle_members cm
    join public.profiles p on p.id = cm.profile_id
    where cm.circle_id = p_circle_id
      and cm.status = 'active'
      and p.user_id = p_user_id
  ) into v_exists;

  return coalesce(v_exists, false);
end;
$$;

create or replace function public.is_circle_owner(p_circle_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
set row_security = off
as $$
declare
  v_exists boolean;
begin
  select exists (
    select 1
    from public.circles c
    left join public.profiles p on p.id = c.created_by_profile_id
    where c.id = p_circle_id
      and (c.created_by_user_id = p_user_id or p.user_id = p_user_id)
  ) into v_exists;

  return coalesce(v_exists, false);
end;
$$;

create or replace function public.is_circle_host(p_circle_id uuid, p_profile_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
set row_security = off
as $$
declare
  v_exists boolean;
begin
  select exists (
    select 1
    from public.circle_members cm
    where cm.circle_id = p_circle_id
      and cm.profile_id = p_profile_id
      and cm.status = 'active'
      and cm.role in ('host', 'moderator', 'admin', 'leader', 'matchmaker')
  ) into v_exists;

  return coalesce(v_exists, false);
end;
$$;

revoke all on function public.is_circle_member(uuid, uuid) from public;
revoke all on function public.is_circle_owner(uuid, uuid) from public;
revoke all on function public.is_circle_host(uuid, uuid) from public;
grant execute on function public.is_circle_member(uuid, uuid) to authenticated;
grant execute on function public.is_circle_owner(uuid, uuid) to authenticated;
grant execute on function public.is_circle_host(uuid, uuid) to authenticated;

create table if not exists public.circle_prompts (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid references public.circles(id) on delete cascade,
  title text not null,
  prompt text not null,
  prompt_type text not null default 'weekly',
  status text not null default 'published',
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_by_admin_id uuid references auth.users(id) on delete set null,
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint circle_prompts_type_valid check (prompt_type in ('daily', 'weekly', 'featured', 'host')),
  constraint circle_prompts_status_valid check (status in ('draft', 'published', 'archived')),
  constraint circle_prompts_title_length check (char_length(btrim(title)) between 3 and 120),
  constraint circle_prompts_prompt_length check (char_length(btrim(prompt)) between 3 and 500)
);

create table if not exists public.circle_prompt_responses (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references public.circle_prompts(id) on delete cascade,
  circle_id uuid references public.circles(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  response text not null,
  reaction_count integer not null default 0,
  is_deleted boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint circle_prompt_responses_length check (char_length(btrim(response)) between 1 and 500),
  constraint circle_prompt_responses_unique unique (prompt_id, profile_id)
);

create table if not exists public.gatherings (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid references public.circles(id) on delete set null,
  title text not null,
  slug text unique,
  description text,
  poster_url text,
  gathering_type text not null default 'physical',
  status text not null default 'pending_review',
  country_code text,
  country_name text,
  region text,
  city text,
  venue_name text,
  venue_address text,
  latitude double precision,
  longitude double precision,
  address_visibility text not null default 'attendees_only',
  online_url text,
  platform text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  timezone text,
  is_official boolean not null default false,
  is_partner_venue boolean not null default false,
  safe_first_date_space boolean not null default false,
  safety_note text,
  max_attendees integer,
  attendee_count integer not null default 0,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_by_user_id uuid references auth.users(id) on delete set null,
  approved_by_admin_id uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  rejected_reason text,
  tags text[] not null default '{}',
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  cancelled_at timestamptz,
  constraint gatherings_type_valid check (gathering_type in ('online', 'physical', 'hybrid', 'partner_venue', 'livestream')),
  constraint gatherings_status_valid check (status in ('draft', 'pending_review', 'approved', 'rejected', 'cancelled', 'completed', 'archived')),
  constraint gatherings_address_visibility_valid check (address_visibility in ('hidden', 'attendees_only', 'public')),
  constraint gatherings_title_length check (char_length(btrim(title)) between 3 and 120),
  constraint gatherings_time_valid check (ends_at is null or ends_at > starts_at),
  constraint gatherings_capacity_valid check (max_attendees is null or max_attendees > 0)
);

create table if not exists public.gathering_attendees (
  id uuid primary key default gen_random_uuid(),
  gathering_id uuid not null references public.gatherings(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  status text not null default 'attending',
  visible_to_others boolean not null default false,
  checked_in_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint gathering_attendees_status_valid check (status in ('interested', 'attending', 'cancelled', 'checked_in')),
  constraint gathering_attendees_unique unique (gathering_id, profile_id)
);

create table if not exists public.relationship_gists (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  short_body text,
  perspective text not null default 'general',
  status text not null default 'draft',
  country_code text,
  city text,
  audience_tags text[] not null default '{}',
  faith_tags text[] not null default '{}',
  culture_tags text[] not null default '{}',
  relationship_intent_tags text[] not null default '{}',
  created_by_admin_id uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  scheduled_for timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint relationship_gists_perspective_valid check (perspective in ('general', 'christian', 'muslim', 'culture', 'safety', 'communication')),
  constraint relationship_gists_status_valid check (status in ('draft', 'published', 'archived')),
  constraint relationship_gists_title_length check (char_length(btrim(title)) between 3 and 140),
  constraint relationship_gists_body_length check (char_length(btrim(body)) between 20 and 5000)
);

create table if not exists public.warm_introductions (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid references public.circles(id) on delete set null,
  initiator_profile_id uuid references public.profiles(id) on delete set null,
  initiator_role text not null default 'host',
  profile_a_id uuid not null references public.profiles(id) on delete cascade,
  profile_b_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  shared_context text[] not null default '{}',
  status text not null default 'pending',
  expires_at timestamptz not null default timezone('utc'::text, now()) + interval '72 hours',
  accepted_by_a_at timestamptz,
  accepted_by_b_at timestamptz,
  declined_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint warm_introductions_role_valid check (initiator_role in ('host', 'admin', 'concierge', 'system')),
  constraint warm_introductions_status_valid check (status in ('pending', 'accepted_by_a', 'accepted_by_b', 'accepted', 'declined', 'expired', 'cancelled')),
  constraint warm_introductions_profiles_distinct check (profile_a_id <> profile_b_id),
  constraint warm_introductions_reason_length check (char_length(btrim(reason)) between 3 and 500)
);

create table if not exists public.circle_reports (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid references public.circles(id) on delete cascade,
  gathering_id uuid references public.gatherings(id) on delete cascade,
  prompt_response_id uuid references public.circle_prompt_responses(id) on delete cascade,
  reporter_profile_id uuid not null references public.profiles(id) on delete cascade,
  reporter_user_id uuid references auth.users(id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'pending',
  reviewed_by_admin_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint circle_reports_target_present check (
    circle_id is not null or gathering_id is not null or prompt_response_id is not null
  ),
  constraint circle_reports_status_valid check (status in ('pending', 'reviewing', 'resolved', 'dismissed'))
);

create table if not exists public.circle_roles (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'host',
  assigned_by_admin_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint circle_roles_role_valid check (role in ('host', 'moderator', 'admin')),
  constraint circle_roles_unique unique (circle_id, profile_id, role)
);

create index if not exists circle_prompts_circle_idx on public.circle_prompts (circle_id);
create index if not exists circle_prompts_status_idx on public.circle_prompts (status);
create index if not exists circle_prompts_starts_idx on public.circle_prompts (starts_at);
create index if not exists circle_prompts_expires_idx on public.circle_prompts (expires_at);
create index if not exists circle_prompt_responses_prompt_idx on public.circle_prompt_responses (prompt_id);
create index if not exists circle_prompt_responses_circle_idx on public.circle_prompt_responses (circle_id);
create index if not exists circle_prompt_responses_profile_idx on public.circle_prompt_responses (profile_id);

create index if not exists gatherings_status_idx on public.gatherings (status);
create index if not exists gatherings_type_idx on public.gatherings (gathering_type);
create index if not exists gatherings_circle_idx on public.gatherings (circle_id);
create index if not exists gatherings_country_code_idx on public.gatherings (country_code);
create index if not exists gatherings_city_idx on public.gatherings (city);
create index if not exists gatherings_starts_at_idx on public.gatherings (starts_at);
create index if not exists gatherings_created_by_profile_idx on public.gatherings (created_by_profile_id);
create index if not exists gatherings_tags_gin_idx on public.gatherings using gin (tags);

create index if not exists gathering_attendees_gathering_idx on public.gathering_attendees (gathering_id);
create index if not exists gathering_attendees_profile_idx on public.gathering_attendees (profile_id);
create index if not exists gathering_attendees_user_idx on public.gathering_attendees (user_id);
create index if not exists gathering_attendees_status_idx on public.gathering_attendees (status);

create index if not exists relationship_gists_status_idx on public.relationship_gists (status);
create index if not exists relationship_gists_perspective_idx on public.relationship_gists (perspective);
create index if not exists relationship_gists_country_idx on public.relationship_gists (country_code);
create index if not exists relationship_gists_published_idx on public.relationship_gists (published_at);
create index if not exists relationship_gists_audience_tags_gin_idx on public.relationship_gists using gin (audience_tags);
create index if not exists relationship_gists_faith_tags_gin_idx on public.relationship_gists using gin (faith_tags);

create index if not exists warm_introductions_profile_a_idx on public.warm_introductions (profile_a_id);
create index if not exists warm_introductions_profile_b_idx on public.warm_introductions (profile_b_id);
create index if not exists warm_introductions_circle_idx on public.warm_introductions (circle_id);
create index if not exists warm_introductions_status_idx on public.warm_introductions (status);

create index if not exists circle_reports_status_idx on public.circle_reports (status);
create index if not exists circle_reports_reporter_idx on public.circle_reports (reporter_profile_id);
create index if not exists circle_roles_circle_idx on public.circle_roles (circle_id);
create index if not exists circle_roles_profile_idx on public.circle_roles (profile_id);

drop trigger if exists circle_prompts_set_updated_at on public.circle_prompts;
create trigger circle_prompts_set_updated_at
before update on public.circle_prompts
for each row execute function public.set_updated_at();

drop trigger if exists circle_prompt_responses_set_updated_at on public.circle_prompt_responses;
create trigger circle_prompt_responses_set_updated_at
before update on public.circle_prompt_responses
for each row execute function public.set_updated_at();

drop trigger if exists gatherings_set_updated_at on public.gatherings;
create trigger gatherings_set_updated_at
before update on public.gatherings
for each row execute function public.set_updated_at();

drop trigger if exists gathering_attendees_set_updated_at on public.gathering_attendees;
create trigger gathering_attendees_set_updated_at
before update on public.gathering_attendees
for each row execute function public.set_updated_at();

drop trigger if exists relationship_gists_set_updated_at on public.relationship_gists;
create trigger relationship_gists_set_updated_at
before update on public.relationship_gists
for each row execute function public.set_updated_at();

drop trigger if exists warm_introductions_set_updated_at on public.warm_introductions;
create trigger warm_introductions_set_updated_at
before update on public.warm_introductions
for each row execute function public.set_updated_at();

alter table public.circle_prompts enable row level security;
alter table public.circle_prompt_responses enable row level security;
alter table public.gatherings enable row level security;
alter table public.gathering_attendees enable row level security;
alter table public.relationship_gists enable row level security;
alter table public.warm_introductions enable row level security;
alter table public.circle_reports enable row level security;
alter table public.circle_roles enable row level security;

drop policy if exists "circles_select_public_or_member" on public.circles;
create policy "circles_select_public_or_member"
on public.circles
for select
to authenticated
using (
  public.is_admin_user(auth.uid())
  or (
    status = 'approved'
    and archived_at is null
    and visibility_scope <> 'invite_only'
    and coalesce(visibility, 'public') = 'public'
  )
  or public.is_circle_member(circles.id, auth.uid())
  or public.is_circle_owner(circles.id, auth.uid())
);

drop policy if exists "circle_members_select_member" on public.circle_members;
create policy "circle_members_select_member"
on public.circle_members
for select
to authenticated
using (
  public.is_admin_user(auth.uid())
  or user_id = auth.uid()
  or exists (
    select 1 from public.profiles p
    where p.id = circle_members.profile_id
      and p.user_id = auth.uid()
  )
  or public.is_circle_member(circle_members.circle_id, auth.uid())
  or public.is_circle_owner(circle_members.circle_id, auth.uid())
);

drop policy if exists circle_prompts_select_visible on public.circle_prompts;
create policy circle_prompts_select_visible
on public.circle_prompts
for select
to authenticated
using (
  public.is_admin_user(auth.uid())
  or status = 'published'
  or (circle_id is not null and public.is_circle_member(circle_id, auth.uid()))
);

drop policy if exists circle_prompt_responses_select_member on public.circle_prompt_responses;
create policy circle_prompt_responses_select_member
on public.circle_prompt_responses
for select
to authenticated
using (
  public.is_admin_user(auth.uid())
  or (circle_id is not null and public.is_circle_member(circle_id, auth.uid()))
  or user_id = auth.uid()
);

drop policy if exists circle_prompt_responses_insert_own on public.circle_prompt_responses;
create policy circle_prompt_responses_insert_own
on public.circle_prompt_responses
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = profile_id
      and p.user_id = auth.uid()
  )
  and (circle_id is null or public.is_circle_member(circle_id, auth.uid()))
);

drop policy if exists circle_prompt_responses_update_own_or_host on public.circle_prompt_responses;
create policy circle_prompt_responses_update_own_or_host
on public.circle_prompt_responses
for update
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin_user(auth.uid())
  or exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and circle_prompt_responses.circle_id is not null
      and public.is_circle_host(circle_prompt_responses.circle_id, p.id)
  )
)
with check (
  user_id = auth.uid()
  or public.is_admin_user(auth.uid())
  or exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and circle_prompt_responses.circle_id is not null
      and public.is_circle_host(circle_prompt_responses.circle_id, p.id)
  )
);

drop policy if exists gatherings_select_visible on public.gatherings;
create policy gatherings_select_visible
on public.gatherings
for select
to authenticated
using (
  public.is_admin_user(auth.uid())
  or (
    status = 'approved'
    and cancelled_at is null
  )
  or created_by_user_id = auth.uid()
  or (circle_id is not null and public.is_circle_member(circle_id, auth.uid()))
);

drop policy if exists gathering_attendees_select_own_or_host on public.gathering_attendees;
create policy gathering_attendees_select_own_or_host
on public.gathering_attendees
for select
to authenticated
using (
  public.is_admin_user(auth.uid())
  or user_id = auth.uid()
  or visible_to_others = true
  or exists (
    select 1
    from public.gatherings g
    join public.profiles p on p.user_id = auth.uid()
    where g.id = gathering_attendees.gathering_id
      and g.circle_id is not null
      and public.is_circle_host(g.circle_id, p.id)
  )
);

drop policy if exists gathering_attendees_insert_own on public.gathering_attendees;
create policy gathering_attendees_insert_own
on public.gathering_attendees
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = profile_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists gathering_attendees_update_own on public.gathering_attendees;
create policy gathering_attendees_update_own
on public.gathering_attendees
for update
to authenticated
using (user_id = auth.uid() or public.is_admin_user(auth.uid()))
with check (user_id = auth.uid() or public.is_admin_user(auth.uid()));

drop policy if exists relationship_gists_select_published on public.relationship_gists;
create policy relationship_gists_select_published
on public.relationship_gists
for select
to authenticated
using (
  public.is_admin_user(auth.uid())
  or status = 'published'
);

drop policy if exists warm_introductions_select_involved on public.warm_introductions;
create policy warm_introductions_select_involved
on public.warm_introductions
for select
to authenticated
using (
  public.is_admin_user(auth.uid())
  or exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.id in (profile_a_id, profile_b_id, initiator_profile_id)
  )
);

drop policy if exists circle_reports_insert_own on public.circle_reports;
create policy circle_reports_insert_own
on public.circle_reports
for insert
to authenticated
with check (
  reporter_user_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = reporter_profile_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists circle_reports_select_own_or_admin on public.circle_reports;
create policy circle_reports_select_own_or_admin
on public.circle_reports
for select
to authenticated
using (
  public.is_admin_user(auth.uid())
  or reporter_user_id = auth.uid()
);

drop policy if exists circle_roles_select_member_or_admin on public.circle_roles;
create policy circle_roles_select_member_or_admin
on public.circle_roles
for select
to authenticated
using (
  public.is_admin_user(auth.uid())
  or user_id = auth.uid()
  or public.is_circle_member(circle_id, auth.uid())
);

revoke all on public.circle_prompts from anon, authenticated;
revoke all on public.circle_prompt_responses from anon, authenticated;
revoke all on public.gatherings from anon, authenticated;
revoke all on public.gathering_attendees from anon, authenticated;
revoke all on public.relationship_gists from anon, authenticated;
revoke all on public.warm_introductions from anon, authenticated;
revoke all on public.circle_reports from anon, authenticated;
revoke all on public.circle_roles from anon, authenticated;

grant select on public.circle_prompts to authenticated;
grant select, insert, update on public.circle_prompt_responses to authenticated;
grant select on public.gatherings to authenticated;
grant select, insert, update on public.gathering_attendees to authenticated;
grant select on public.relationship_gists to authenticated;
grant select on public.warm_introductions to authenticated;
grant select, insert on public.circle_reports to authenticated;
grant select on public.circle_roles to authenticated;

create or replace function public.rpc_create_circle_request(
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
  v_slug_base text;
  v_slug text;
  v_status text;
  v_circle public.circles;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
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

  if not v_is_admin and coalesce(p_circle_type, 'gold_community') not in ('gold_community', 'community', 'private') then
    raise exception 'invalid_circle_type';
  end if;

  v_slug_base := public.slugify(v_name);
  v_slug := v_slug_base;

  if exists (
    select 1
    from public.circles c
    where c.status = 'approved'
      and public.slugify(c.name) = v_slug_base
      and coalesce(upper(c.country_code), '') = coalesce(upper(p_country_code), '')
      and coalesce(lower(c.city), '') = coalesce(lower(p_city), '')
      and c.archived_at is null
  ) then
    raise exception 'duplicate_circle';
  end if;

  while exists (select 1 from public.circles c where c.slug = v_slug) loop
    v_slug := v_slug_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  end loop;

  v_status := case when v_is_admin then 'approved' else 'pending_review' end;

  insert into public.circles (
    name,
    slug,
    description,
    short_description,
    visibility,
    circle_type,
    status,
    visibility_scope,
    country_code,
    country_name,
    region,
    city,
    diaspora_tags,
    culture_tags,
    faith_tags,
    interest_tags,
    audience_tags,
    is_official,
    is_partner,
    requires_join_approval,
    created_by_profile_id,
    created_by_user_id,
    approved_by_admin_id,
    approved_at,
    rules
  )
  values (
    v_name,
    v_slug,
    nullif(btrim(coalesce(p_description, '')), ''),
    nullif(btrim(coalesce(p_short_description, '')), ''),
    case when p_visibility_scope = 'invite_only' or p_circle_type = 'private' then 'private' else 'public' end,
    case
      when v_is_admin then coalesce(nullif(p_circle_type, ''), 'official')
      when p_circle_type = 'private' then 'private'
      else 'gold_community'
    end,
    v_status,
    p_visibility_scope,
    upper(nullif(btrim(coalesce(p_country_code, '')), '')),
    nullif(btrim(coalesce(p_country_name, '')), ''),
    nullif(btrim(coalesce(p_region, '')), ''),
    nullif(btrim(coalesce(p_city, '')), ''),
    coalesce(p_diaspora_tags, '{}'),
    coalesce(p_culture_tags, '{}'),
    coalesce(p_faith_tags, '{}'),
    coalesce(p_interest_tags, '{}'),
    coalesce(p_audience_tags, '{}'),
    v_is_admin and coalesce(p_circle_type, 'official') = 'official',
    v_is_admin and coalesce(p_circle_type, '') = 'partner',
    coalesce(p_requires_join_approval, false),
    v_profile.id,
    v_user_id,
    case when v_is_admin then v_user_id else null end,
    case when v_is_admin then timezone('utc'::text, now()) else null end,
    nullif(btrim(coalesce(p_rules, '')), '')
  )
  returning * into v_circle;

  insert into public.circle_members (circle_id, profile_id, user_id, role, status, is_visible, joined_at)
  values (
    v_circle.id,
    v_profile.id,
    v_user_id,
    case when v_is_admin then 'admin' else 'host' end,
    'active',
    true,
    timezone('utc'::text, now())
  )
  on conflict (circle_id, profile_id) do update
    set role = excluded.role,
        status = 'active',
        user_id = excluded.user_id,
        joined_at = coalesce(public.circle_members.joined_at, excluded.joined_at);

  return v_circle;
end;
$$;

create or replace function public.rpc_approve_circle(p_circle_id uuid)
returns public.circles
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_circle public.circles;
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  update public.circles
  set status = 'approved',
      approved_by_admin_id = auth.uid(),
      approved_at = timezone('utc'::text, now()),
      rejected_reason = null,
      archived_at = null,
      updated_at = timezone('utc'::text, now())
  where id = p_circle_id
    and status <> 'archived'
  returning * into v_circle;

  return v_circle;
end;
$$;

create or replace function public.rpc_reject_circle(p_circle_id uuid, p_reason text)
returns public.circles
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_circle public.circles;
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  update public.circles
  set status = 'rejected',
      rejected_reason = nullif(btrim(coalesce(p_reason, '')), ''),
      approved_by_admin_id = null,
      approved_at = null,
      updated_at = timezone('utc'::text, now())
  where id = p_circle_id
    and status in ('draft', 'pending_review', 'approved', 'rejected')
  returning * into v_circle;

  return v_circle;
end;
$$;

create or replace function public.rpc_create_gathering_request(
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
  v_gathering public.gatherings;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
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

  if p_circle_id is not null and not exists (
    select 1
    from public.circles c
    where c.id = p_circle_id
      and (c.status = 'approved' or c.created_by_user_id = v_user_id or public.is_admin_user(v_user_id))
  ) then
    raise exception 'circle_not_found';
  end if;

  v_slug_base := public.slugify(v_title);
  v_slug := v_slug_base;
  while exists (select 1 from public.gatherings g where g.slug = v_slug) loop
    v_slug := v_slug_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  end loop;

  insert into public.gatherings (
    circle_id,
    title,
    slug,
    description,
    gathering_type,
    status,
    country_code,
    country_name,
    region,
    city,
    venue_name,
    venue_address,
    address_visibility,
    online_url,
    platform,
    starts_at,
    ends_at,
    timezone,
    is_official,
    is_partner_venue,
    safe_first_date_space,
    max_attendees,
    created_by_profile_id,
    created_by_user_id,
    approved_by_admin_id,
    approved_at,
    tags,
    safety_note
  )
  values (
    p_circle_id,
    v_title,
    v_slug,
    nullif(btrim(coalesce(p_description, '')), ''),
    p_gathering_type,
    case when v_is_admin then 'approved' else 'pending_review' end,
    upper(nullif(btrim(coalesce(p_country_code, '')), '')),
    nullif(btrim(coalesce(p_country_name, '')), ''),
    nullif(btrim(coalesce(p_region, '')), ''),
    nullif(btrim(coalesce(p_city, '')), ''),
    nullif(btrim(coalesce(p_venue_name, '')), ''),
    nullif(btrim(coalesce(p_venue_address, '')), ''),
    case
      when v_is_admin then coalesce(nullif(p_address_visibility, ''), 'attendees_only')
      when p_gathering_type in ('physical', 'hybrid', 'partner_venue') then 'attendees_only'
      else coalesce(nullif(p_address_visibility, ''), 'hidden')
    end,
    nullif(btrim(coalesce(p_online_url, '')), ''),
    nullif(btrim(coalesce(p_platform, '')), ''),
    p_starts_at,
    p_ends_at,
    p_timezone,
    v_is_admin,
    v_is_admin and p_gathering_type = 'partner_venue',
    false,
    p_max_attendees,
    v_profile.id,
    v_user_id,
    case when v_is_admin then v_user_id else null end,
    case when v_is_admin then timezone('utc'::text, now()) else null end,
    coalesce(p_tags, '{}'),
    nullif(btrim(coalesce(p_safety_note, '')), '')
  )
  returning * into v_gathering;

  return v_gathering;
end;
$$;

create or replace function public.rpc_approve_gathering(p_gathering_id uuid)
returns public.gatherings
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_gathering public.gatherings;
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  update public.gatherings
  set status = 'approved',
      approved_by_admin_id = auth.uid(),
      approved_at = timezone('utc'::text, now()),
      rejected_reason = null,
      updated_at = timezone('utc'::text, now())
  where id = p_gathering_id
    and status <> 'archived'
  returning * into v_gathering;

  return v_gathering;
end;
$$;

create or replace function public.rpc_reject_gathering(p_gathering_id uuid, p_reason text)
returns public.gatherings
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_gathering public.gatherings;
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  update public.gatherings
  set status = 'rejected',
      rejected_reason = nullif(btrim(coalesce(p_reason, '')), ''),
      approved_by_admin_id = null,
      approved_at = null,
      updated_at = timezone('utc'::text, now())
  where id = p_gathering_id
    and status in ('draft', 'pending_review', 'approved', 'rejected')
  returning * into v_gathering;

  return v_gathering;
end;
$$;

create or replace function public.rpc_attend_gathering(
  p_gathering_id uuid,
  p_status text default 'attending',
  p_visible_to_others boolean default false
)
returns public.gathering_attendees
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_attendee public.gathering_attendees;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if p_status not in ('interested', 'attending', 'cancelled', 'checked_in') then
    raise exception 'invalid_status';
  end if;

  select p.id
    into v_profile_id
  from public.profiles p
  where p.user_id = v_user_id
    and p.deleted_at is null
  limit 1;

  if v_profile_id is null then
    raise exception 'profile_not_found';
  end if;

  if not exists (
    select 1
    from public.gatherings g
    where g.id = p_gathering_id
      and g.status = 'approved'
      and g.cancelled_at is null
      and (g.max_attendees is null or g.attendee_count < g.max_attendees or p_status = 'cancelled')
  ) then
    raise exception 'gathering_unavailable';
  end if;

  insert into public.gathering_attendees (gathering_id, profile_id, user_id, status, visible_to_others)
  values (p_gathering_id, v_profile_id, v_user_id, p_status, coalesce(p_visible_to_others, false))
  on conflict (gathering_id, profile_id) do update
    set status = excluded.status,
        visible_to_others = excluded.visible_to_others,
        updated_at = timezone('utc'::text, now())
  returning * into v_attendee;

  update public.gatherings g
  set attendee_count = (
    select count(*)::int
    from public.gathering_attendees ga
    where ga.gathering_id = g.id
      and ga.status in ('interested', 'attending', 'checked_in')
  )
  where g.id = p_gathering_id;

  return v_attendee;
end;
$$;

create or replace function public.rpc_answer_circle_prompt(
  p_prompt_id uuid,
  p_response text
)
returns public.circle_prompt_responses
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_circle_id uuid;
  v_body text := nullif(btrim(coalesce(p_response, '')), '');
  v_response public.circle_prompt_responses;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if v_body is null or char_length(v_body) > 500 then
    raise exception 'invalid_response';
  end if;

  select p.id
    into v_profile_id
  from public.profiles p
  where p.user_id = v_user_id
    and p.deleted_at is null
  limit 1;

  select cp.circle_id
    into v_circle_id
  from public.circle_prompts cp
  where cp.id = p_prompt_id
    and cp.status = 'published'
    and (cp.starts_at is null or cp.starts_at <= timezone('utc'::text, now()))
    and (cp.expires_at is null or cp.expires_at > timezone('utc'::text, now()))
  limit 1;

  if v_profile_id is null or v_circle_id is null then
    raise exception 'prompt_unavailable';
  end if;

  if v_circle_id is not null and not public.is_circle_member(v_circle_id, v_user_id) then
    raise exception 'circle_membership_required' using errcode = '42501';
  end if;

  insert into public.circle_prompt_responses (prompt_id, circle_id, profile_id, user_id, response)
  values (p_prompt_id, v_circle_id, v_profile_id, v_user_id, v_body)
  on conflict (prompt_id, profile_id) do update
    set response = excluded.response,
        is_deleted = false,
        updated_at = timezone('utc'::text, now())
  returning * into v_response;

  return v_response;
end;
$$;

create or replace function public.rpc_publish_relationship_gist(p_gist_id uuid)
returns public.relationship_gists
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_gist public.relationship_gists;
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  update public.relationship_gists
  set status = 'published',
      published_at = coalesce(published_at, timezone('utc'::text, now())),
      created_by_admin_id = coalesce(created_by_admin_id, auth.uid()),
      updated_at = timezone('utc'::text, now())
  where id = p_gist_id
  returning * into v_gist;

  return v_gist;
end;
$$;

create or replace function public.rpc_create_warm_introduction(
  p_circle_id uuid,
  p_profile_a_id uuid,
  p_profile_b_id uuid,
  p_reason text,
  p_shared_context text[] default '{}',
  p_expires_at timestamptz default null
)
returns public.warm_introductions
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_initiator_profile_id uuid;
  v_intro public.warm_introductions;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if p_profile_a_id = p_profile_b_id then
    raise exception 'profiles_must_differ';
  end if;

  select p.id
    into v_initiator_profile_id
  from public.profiles p
  where p.user_id = v_user_id
    and p.deleted_at is null
  limit 1;

  if not public.is_admin_user(v_user_id)
     and (p_circle_id is null or not public.is_circle_host(p_circle_id, v_initiator_profile_id)) then
    raise exception 'host_required' using errcode = '42501';
  end if;

  insert into public.warm_introductions (
    circle_id,
    initiator_profile_id,
    initiator_role,
    profile_a_id,
    profile_b_id,
    reason,
    shared_context,
    expires_at
  )
  values (
    p_circle_id,
    v_initiator_profile_id,
    case when public.is_admin_user(v_user_id) then 'admin' else 'host' end,
    p_profile_a_id,
    p_profile_b_id,
    nullif(btrim(coalesce(p_reason, '')), ''),
    coalesce(p_shared_context, '{}'),
    coalesce(p_expires_at, timezone('utc'::text, now()) + interval '72 hours')
  )
  returning * into v_intro;

  return v_intro;
end;
$$;

create or replace function public.rpc_respond_warm_introduction(
  p_intro_id uuid,
  p_decision text
)
returns public.warm_introductions
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_intro public.warm_introductions;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if p_decision not in ('accept', 'decline') then
    raise exception 'invalid_decision';
  end if;

  select p.id
    into v_profile_id
  from public.profiles p
  where p.user_id = v_user_id
    and p.deleted_at is null
  limit 1;

  select *
    into v_intro
  from public.warm_introductions wi
  where wi.id = p_intro_id
    and wi.status in ('pending', 'accepted_by_a', 'accepted_by_b')
    and wi.expires_at > timezone('utc'::text, now())
    and v_profile_id in (wi.profile_a_id, wi.profile_b_id)
  for update;

  if v_intro.id is null then
    raise exception 'introduction_unavailable';
  end if;

  if p_decision = 'decline' then
    update public.warm_introductions
    set status = 'declined',
        declined_by_profile_id = v_profile_id,
        updated_at = timezone('utc'::text, now())
    where id = p_intro_id
    returning * into v_intro;
    return v_intro;
  end if;

  update public.warm_introductions
  set accepted_by_a_at = case
        when profile_a_id = v_profile_id then coalesce(accepted_by_a_at, timezone('utc'::text, now()))
        else accepted_by_a_at
      end,
      accepted_by_b_at = case
        when profile_b_id = v_profile_id then coalesce(accepted_by_b_at, timezone('utc'::text, now()))
        else accepted_by_b_at
      end,
      status = case
        when (profile_a_id = v_profile_id or accepted_by_a_at is not null)
         and (profile_b_id = v_profile_id or accepted_by_b_at is not null)
          then 'accepted'
        when profile_a_id = v_profile_id then 'accepted_by_a'
        else 'accepted_by_b'
      end,
      updated_at = timezone('utc'::text, now())
  where id = p_intro_id
  returning * into v_intro;

  return v_intro;
end;
$$;

create or replace function public.rpc_join_circle(
  p_circle_id uuid,
  p_profile_id uuid
)
returns text
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_owner uuid;
  v_circle public.circles%rowtype;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select user_id into v_owner
  from public.profiles
  where id = p_profile_id
    and deleted_at is null
  limit 1;

  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'Not authorized';
  end if;

  select *
    into v_circle
  from public.circles
  where id = p_circle_id
  limit 1;

  if v_circle.id is null or v_circle.status <> 'approved' or v_circle.archived_at is not null then
    raise exception 'Circle not found';
  end if;

  v_status := case
    when v_circle.visibility = 'private'
      or v_circle.visibility_scope = 'invite_only'
      or coalesce(v_circle.requires_join_approval, false)
      then 'pending'
    else 'active'
  end;

  insert into public.circle_members (circle_id, profile_id, user_id, role, status, is_visible, joined_at, left_at)
  values (p_circle_id, p_profile_id, auth.uid(), 'member', v_status, true, timezone('utc'::text, now()), null)
  on conflict (circle_id, profile_id) do update
    set status = excluded.status,
        user_id = excluded.user_id,
        left_at = null,
        updated_at = timezone('utc'::text, now());

  update public.circles c
  set member_count = (
    select count(*)::int
    from public.circle_members cm
    where cm.circle_id = c.id
      and cm.status = 'active'
  )
  where c.id = p_circle_id;

  return v_status;
end;
$$;

create or replace function public.rpc_leave_circle(
  p_circle_id uuid,
  p_profile_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_owner uuid;
  v_role text;
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

  select role into v_role
  from public.circle_members
  where circle_id = p_circle_id and profile_id = p_profile_id
  limit 1;

  if v_role in ('leader', 'host', 'admin') then
    raise exception 'Host cannot leave circle';
  end if;

  update public.circle_members
  set status = 'left',
      left_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
  where circle_id = p_circle_id
    and profile_id = p_profile_id;

  update public.circles c
  set member_count = (
    select count(*)::int
    from public.circle_members cm
    where cm.circle_id = c.id
      and cm.status = 'active'
  )
  where c.id = p_circle_id;

  return found;
end;
$$;

create or replace function public.rpc_admin_get_circles_queue()
returns setof public.circles
language plpgsql
security definer
stable
set search_path = public, pg_catalog
as $$
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  return query
  select *
  from public.circles
  order by
    case status when 'pending_review' then 0 when 'rejected' then 1 when 'approved' then 2 else 3 end,
    created_at desc;
end;
$$;

create or replace function public.rpc_admin_get_gatherings_queue()
returns setof public.gatherings
language plpgsql
security definer
stable
set search_path = public, pg_catalog
as $$
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  return query
  select *
  from public.gatherings
  order by
    case status when 'pending_review' then 0 when 'rejected' then 1 when 'approved' then 2 else 3 end,
    starts_at asc;
end;
$$;

create or replace function public.rpc_admin_get_relationship_gists()
returns setof public.relationship_gists
language plpgsql
security definer
stable
set search_path = public, pg_catalog
as $$
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  return query
  select *
  from public.relationship_gists
  order by
    case status when 'draft' then 0 when 'published' then 1 else 2 end,
    coalesce(published_at, scheduled_for, created_at) desc;
end;
$$;

create or replace function public.rpc_admin_get_warm_introductions()
returns setof public.warm_introductions
language plpgsql
security definer
stable
set search_path = public, pg_catalog
as $$
begin
  if not public.is_admin_user(auth.uid()) then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  return query
  select *
  from public.warm_introductions
  order by created_at desc;
end;
$$;

revoke all on function public.rpc_create_circle_request(text, text, text, text, text, text, text, text, text, text[], text[], text[], text[], text[], boolean, text) from public;
revoke all on function public.rpc_approve_circle(uuid) from public;
revoke all on function public.rpc_reject_circle(uuid, text) from public;
revoke all on function public.rpc_create_gathering_request(uuid, text, text, text, text, text, text, text, text, text, text, text, text, timestamptz, timestamptz, text, integer, text[], text) from public;
revoke all on function public.rpc_approve_gathering(uuid) from public;
revoke all on function public.rpc_reject_gathering(uuid, text) from public;
revoke all on function public.rpc_attend_gathering(uuid, text, boolean) from public;
revoke all on function public.rpc_answer_circle_prompt(uuid, text) from public;
revoke all on function public.rpc_publish_relationship_gist(uuid) from public;
revoke all on function public.rpc_create_warm_introduction(uuid, uuid, uuid, text, text[], timestamptz) from public;
revoke all on function public.rpc_respond_warm_introduction(uuid, text) from public;
revoke all on function public.rpc_admin_get_circles_queue() from public;
revoke all on function public.rpc_admin_get_gatherings_queue() from public;
revoke all on function public.rpc_admin_get_relationship_gists() from public;
revoke all on function public.rpc_admin_get_warm_introductions() from public;

grant execute on function public.rpc_create_circle_request(text, text, text, text, text, text, text, text, text, text[], text[], text[], text[], text[], boolean, text) to authenticated;
grant execute on function public.rpc_approve_circle(uuid) to authenticated;
grant execute on function public.rpc_reject_circle(uuid, text) to authenticated;
grant execute on function public.rpc_create_gathering_request(uuid, text, text, text, text, text, text, text, text, text, text, text, text, timestamptz, timestamptz, text, integer, text[], text) to authenticated;
grant execute on function public.rpc_approve_gathering(uuid) to authenticated;
grant execute on function public.rpc_reject_gathering(uuid, text) to authenticated;
grant execute on function public.rpc_attend_gathering(uuid, text, boolean) to authenticated;
grant execute on function public.rpc_answer_circle_prompt(uuid, text) to authenticated;
grant execute on function public.rpc_publish_relationship_gist(uuid) to authenticated;
grant execute on function public.rpc_create_warm_introduction(uuid, uuid, uuid, text, text[], timestamptz) to authenticated;
grant execute on function public.rpc_respond_warm_introduction(uuid, text) to authenticated;
grant execute on function public.rpc_admin_get_circles_queue() to authenticated;
grant execute on function public.rpc_admin_get_gatherings_queue() to authenticated;
grant execute on function public.rpc_admin_get_relationship_gists() to authenticated;
grant execute on function public.rpc_admin_get_warm_introductions() to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.circles;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.circle_members;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.circle_prompts;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.gatherings;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.gathering_attendees;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.warm_introductions;
    exception when duplicate_object then null;
    end;
  end if;
end;
$$;
