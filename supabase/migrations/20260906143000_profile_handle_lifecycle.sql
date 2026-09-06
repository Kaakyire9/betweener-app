-- A controlled, optional @handle lifecycle built on profiles.username.
-- Existing profile ids and display names remain the canonical identity model.

begin;

-- Keep the ACCESS EXCLUSIVE profiles lock bounded to the additive metadata
-- change. Released clients can continue reading/writing as soon as this short
-- transaction commits.
set local lock_timeout = '5s';

alter table public.profiles
  add column if not exists username_searchable boolean not null default false,
  add column if not exists username_claimed_at timestamptz,
  add column if not exists username_changed_at timestamptz;

comment on column public.profiles.username_searchable is
  'Member-controlled consent for discovery through @handle lookup.';
comment on column public.profiles.username_claimed_at is
  'First successful claim time for the current profile handle lifecycle.';
comment on column public.profiles.username_changed_at is
  'Last claim or rename time used to enforce the rename cooldown.';

commit;

-- Existing username rows are upgraded separately so their row locks are not
-- held while the handle functions and private tables are installed.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';

update public.profiles
set username_claimed_at = coalesce(username_claimed_at, created_at)
where nullif(btrim(username), '') is not null
  and username_claimed_at is null;

commit;

begin;

set local lock_timeout = '5s';

create table if not exists public.profile_handle_reservations (
  normalized_username text primary key,
  username_skeleton text not null,
  reason text not null default 'protected',
  created_at timestamptz not null default timezone('utc', now()),
  constraint profile_handle_reservations_normalized_check
    check (normalized_username = lower(normalized_username))
);

create table if not exists public.profile_handle_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  changed_by_user_id uuid not null,
  change_kind text not null,
  previous_username text,
  new_username text,
  previous_searchable boolean not null,
  new_searchable boolean not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint profile_handle_history_kind_check
    check (change_kind in ('claim', 'rename', 'privacy'))
);

create table if not exists public.profile_handle_rate_limits (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  window_started_at timestamptz not null default timezone('utc', now()),
  attempt_count integer not null default 1,
  primary key (profile_id, action),
  constraint profile_handle_rate_limits_action_check
    check (action in ('availability', 'update')),
  constraint profile_handle_rate_limits_count_check
    check (attempt_count > 0)
);

alter table public.profile_handle_reservations enable row level security;
alter table public.profile_handle_history enable row level security;
alter table public.profile_handle_rate_limits enable row level security;

create index if not exists idx_profile_handle_history_profile_created
  on public.profile_handle_history(profile_id, created_at desc);

create index if not exists idx_profile_handle_history_previous_quarantine
  on public.profile_handle_history(lower(previous_username), created_at desc)
  where previous_username is not null and change_kind = 'rename';

commit;

begin;

create or replace function public.profile_handle_normalize(p_username text)
returns text
language sql
immutable
set search_path = public, pg_catalog
as $$
  select lower(regexp_replace(btrim(coalesce(p_username, '')), '^@+', ''));
$$;

create or replace function public.profile_handle_skeleton(p_username text)
returns text
language sql
immutable
set search_path = public, pg_catalog
as $$
  select regexp_replace(
    translate(public.profile_handle_normalize(p_username), '013457', 'oieast'),
    '[._]',
    '',
    'g'
  );
$$;

insert into public.profile_handle_reservations (
  normalized_username,
  username_skeleton,
  reason
)
select
  reserved_name,
  public.profile_handle_skeleton(reserved_name),
  reserved_reason
from (values
  ('admin', 'staff_identity'),
  ('administrator', 'staff_identity'),
  ('betweener', 'brand_identity'),
  ('betweenerapp', 'brand_identity'),
  ('circle', 'product_identity'),
  ('circles', 'product_identity'),
  ('help', 'staff_identity'),
  ('live', 'product_identity'),
  ('moderation', 'staff_identity'),
  ('moderator', 'staff_identity'),
  ('nyansapa', 'brand_identity'),
  ('official', 'trust_identity'),
  ('root', 'system_identity'),
  ('safety', 'staff_identity'),
  ('security', 'staff_identity'),
  ('staff', 'staff_identity'),
  ('support', 'staff_identity'),
  ('system', 'system_identity'),
  ('team', 'staff_identity'),
  ('verified', 'trust_identity')
) as reserved(reserved_name, reserved_reason)
on conflict (normalized_username) do update
set username_skeleton = excluded.username_skeleton,
    reason = excluded.reason;

create or replace function public.profile_handle_validation_reason(p_username text)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_username text := public.profile_handle_normalize(p_username);
  v_skeleton text := public.profile_handle_skeleton(p_username);
  v_reason text;
  v_assessment jsonb;
begin
  if char_length(v_username) < 3 then return 'too_short'; end if;
  if char_length(v_username) > 24 then return 'too_long'; end if;
  if v_username !~ '^[a-z0-9]+([._][a-z0-9]+)*$' then return 'invalid_format'; end if;
  if v_username !~ '[a-z]' then return 'letters_required'; end if;

  select reservation.reason
  into v_reason
  from public.profile_handle_reservations reservation
  where reservation.normalized_username = v_username
     or reservation.username_skeleton = v_skeleton
     or v_username like reservation.normalized_username || '.%'
     or left(v_username, char_length(reservation.normalized_username) + 1)
       = reservation.normalized_username || '_'
     or (
       reservation.reason = 'brand_identity'
       and v_skeleton like reservation.username_skeleton || '%'
     )
  order by char_length(reservation.normalized_username) desc
  limit 1;

  if v_reason is not null then return 'reserved'; end if;

  v_assessment := public.profile_guard_assess(replace(replace(v_username, '.', ' '), '_', ' '));
  if coalesce(v_assessment->>'decision', '') <> 'ALLOW' then return 'not_allowed'; end if;

  return null;
end;
$$;

create or replace function public.profile_handle_consume_rate_limit(
  p_profile_id uuid,
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_row public.profile_handle_rate_limits%rowtype;
  v_now timestamptz := timezone('utc', now());
begin
  if p_action not in ('availability', 'update')
     or p_limit < 1
     or p_window_seconds < 1 then
    raise exception using errcode = '22023', message = 'PROFILE_HANDLE_RATE_LIMIT_INVALID';
  end if;

  insert into public.profile_handle_rate_limits(profile_id, action)
  values (p_profile_id, p_action)
  on conflict (profile_id, action) do nothing;

  select limiter.*
  into v_row
  from public.profile_handle_rate_limits limiter
  where limiter.profile_id = p_profile_id and limiter.action = p_action
  for update;

  if v_row.window_started_at <= v_now - make_interval(secs => p_window_seconds) then
    update public.profile_handle_rate_limits
    set window_started_at = v_now, attempt_count = 1
    where profile_id = p_profile_id and action = p_action;
    return;
  end if;

  if v_row.attempt_count >= p_limit then
    raise exception using errcode = 'P0001', message = 'PROFILE_HANDLE_RATE_LIMITED';
  end if;

  update public.profile_handle_rate_limits
  set attempt_count = attempt_count + 1
  where profile_id = p_profile_id and action = p_action;
end;
$$;

create or replace function public.profile_handle_prevent_unmanaged_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_managed_profile_id text := current_setting('app.profile_handle_profile_id', true);
  v_trusted_operator boolean := auth.role() = 'service_role'
    or (
      session_user = 'postgres'
      and current_user = 'postgres'
      and coalesce(auth.role(), '') not in ('authenticated', 'anon')
    );
begin
  if tg_op = 'INSERT' then
    if nullif(btrim(new.username), '') is null
       and new.username_searchable = false
       and new.username_claimed_at is null
       and new.username_changed_at is null then
      return new;
    end if;

    if not v_trusted_operator then
      raise exception using errcode = '42501', message = 'PROFILE_HANDLE_RPC_REQUIRED';
    end if;

    return new;
  end if;

  if new.username is not distinct from old.username
     and new.username_searchable is not distinct from old.username_searchable
     and new.username_claimed_at is not distinct from old.username_claimed_at
     and new.username_changed_at is not distinct from old.username_changed_at then
    return new;
  end if;

  if not v_trusted_operator and v_managed_profile_id is distinct from new.id::text then
    raise exception using errcode = '42501', message = 'PROFILE_HANDLE_RPC_REQUIRED';
  end if;

  return new;
end;
$$;

commit;

-- Installing the trigger needs a stronger profiles lock. Keep that lock in a
-- transaction containing only the trigger swap so it is released immediately.
begin;

set local lock_timeout = '5s';

drop trigger if exists profile_handle_prevent_unmanaged_write on public.profiles;
drop trigger if exists profile_control_handle_write on public.profiles;
create trigger profile_control_handle_write
before insert or update of username, username_searchable, username_claimed_at, username_changed_at
on public.profiles
for each row execute function public.profile_handle_prevent_unmanaged_write();

commit;

begin;

-- The established profile-content guard owns all public profile text. Teach it
-- to accept this narrowly scoped RPC after the handle policy has approved the
-- proposed value; every non-handle profile field must remain unchanged.
do $migration$
declare
  v_definition text;
  v_marker text := $marker$  if v_trusted_write then return new; end if;

  v_public_content_changed :=$marker$;
  v_replacement text := $replacement$  if v_trusted_write then return new; end if;

  if tg_op = 'UPDATE'
     and current_setting('app.profile_handle_profile_id', true) = new.id::text
     and auth.uid() = new.user_id
     and (
       to_jsonb(new) - array[
         'username', 'username_searchable', 'username_claimed_at',
         'username_changed_at', 'updated_at'
       ]::text[]
     ) = (
       to_jsonb(old) - array[
         'username', 'username_searchable', 'username_claimed_at',
         'username_changed_at', 'updated_at'
       ]::text[]
     )
     and public.profile_handle_validation_reason(new.username) is null then
    return new;
  end if;

  v_public_content_changed :=$replacement$;
begin
  v_definition := pg_get_functiondef(
    'public.profile_guard_prevent_direct_public_text_write()'::regprocedure
  );

  if position('app.profile_handle_profile_id' in v_definition) > 0 then
    return;
  end if;

  if position(v_marker in v_definition) = 0 then
    raise exception 'PROFILE_HANDLE_GUARD_PATCH_TARGET_NOT_FOUND';
  end if;

  execute replace(v_definition, v_marker, v_replacement);
end;
$migration$;

revoke all on function public.profile_guard_prevent_direct_public_text_write()
  from public, anon, authenticated;

create or replace function public.rpc_get_my_profile_handle_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_profile public.profiles%rowtype;
  v_next_change_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select profile.*
  into v_profile
  from public.profiles profile
  where profile.user_id = auth.uid() and profile.deleted_at is null
  limit 1;

  if v_profile.id is null then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  v_next_change_at := case
    when nullif(btrim(v_profile.username), '') is null then null
    when v_profile.username_changed_at is null then null
    else v_profile.username_changed_at + interval '30 days'
  end;

  return jsonb_build_object(
    'username', nullif(lower(btrim(v_profile.username)), ''),
    'usernameSearchable', coalesce(v_profile.username_searchable, false),
    'claimedAt', v_profile.username_claimed_at,
    'changedAt', v_profile.username_changed_at,
    'nextChangeAt', v_next_change_at,
    'canRename', v_next_change_at is null or v_next_change_at <= timezone('utc', now()),
    'cooldownDaysRemaining', case
      when v_next_change_at is null or v_next_change_at <= timezone('utc', now()) then 0
      else ceil(extract(epoch from (v_next_change_at - timezone('utc', now()))) / 86400.0)::integer
    end
  );
end;
$$;

create or replace function public.rpc_check_profile_username_availability(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_profile public.profiles%rowtype;
  v_username text := public.profile_handle_normalize(p_username);
  v_reason text;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select profile.*
  into v_profile
  from public.profiles profile
  where profile.user_id = auth.uid() and profile.deleted_at is null
  limit 1;

  if v_profile.id is null then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  perform public.profile_handle_consume_rate_limit(v_profile.id, 'availability', 60, 600);

  if lower(coalesce(v_profile.username, '')) = v_username and v_username <> '' then
    return jsonb_build_object(
      'username', v_username,
      'valid', true,
      'available', true,
      'ownedByViewer', true,
      'reason', null
    );
  end if;

  v_reason := public.profile_handle_validation_reason(v_username);
  if v_reason is not null then
    return jsonb_build_object(
      'username', v_username,
      'valid', false,
      'available', false,
      'ownedByViewer', false,
      'reason', v_reason
    );
  end if;

  if exists (
    select 1 from public.profiles profile
    where profile.id <> v_profile.id
      and profile.deleted_at is null
      and lower(profile.username) = v_username
  ) then
    v_reason := 'taken';
  elsif exists (
    select 1
    from public.profile_handle_history history
    where history.profile_id <> v_profile.id
      and history.change_kind = 'rename'
      and lower(history.previous_username) = v_username
      and history.created_at > timezone('utc', now()) - interval '90 days'
  ) then
    v_reason := 'quarantined';
  end if;

  return jsonb_build_object(
    'username', v_username,
    'valid', true,
    'available', v_reason is null,
    'ownedByViewer', false,
    'reason', v_reason
  );
end;
$$;

create or replace function public.rpc_update_my_profile_username(
  p_username text,
  p_searchable boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_profile public.profiles%rowtype;
  v_username text := public.profile_handle_normalize(p_username);
  v_previous_username text;
  v_previous_searchable boolean;
  v_reason text;
  v_now timestamptz := timezone('utc', now());
  v_next_change_at timestamptz;
  v_kind text;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select profile.*
  into v_profile
  from public.profiles profile
  where profile.user_id = auth.uid() and profile.deleted_at is null
  limit 1
  for update;

  if v_profile.id is null then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  perform public.profile_handle_consume_rate_limit(v_profile.id, 'update', 12, 3600);

  v_previous_username := nullif(lower(btrim(v_profile.username)), '');
  v_previous_searchable := coalesce(v_profile.username_searchable, false);

  if v_previous_username = v_username then
    if coalesce(p_searchable, false) and not v_previous_searchable then
      v_reason := public.profile_handle_validation_reason(v_username);
      if v_reason is not null then
        raise exception using errcode = '22023',
          message = 'PROFILE_HANDLE_' || upper(v_reason);
      end if;
    end if;

    if v_previous_searchable is distinct from coalesce(p_searchable, false) then
      perform set_config('app.profile_handle_profile_id', v_profile.id::text, true);
      update public.profiles
      set username_searchable = coalesce(p_searchable, false)
      where id = v_profile.id;

      insert into public.profile_handle_history(
        profile_id, changed_by_user_id, change_kind,
        previous_username, new_username,
        previous_searchable, new_searchable
      ) values (
        v_profile.id, auth.uid(), 'privacy',
        v_previous_username, v_previous_username,
        v_previous_searchable, coalesce(p_searchable, false)
      );
    end if;

    v_next_change_at := case
      when v_profile.username_changed_at is null then null
      else v_profile.username_changed_at + interval '30 days'
    end;

    return jsonb_build_object(
      'username', v_previous_username,
      'usernameSearchable', coalesce(p_searchable, false),
      'claimedAt', v_profile.username_claimed_at,
      'changedAt', v_profile.username_changed_at,
      'nextChangeAt', v_next_change_at,
      'canRename', v_next_change_at is null or v_next_change_at <= v_now,
      'cooldownDaysRemaining', case
        when v_next_change_at is null or v_next_change_at <= v_now then 0
        else ceil(extract(epoch from (v_next_change_at - v_now)) / 86400.0)::integer
      end
    );
  end if;

  v_reason := public.profile_handle_validation_reason(v_username);
  if v_reason is not null then
    raise exception using errcode = '22023',
      message = 'PROFILE_HANDLE_' || upper(v_reason);
  end if;

  if v_previous_username is not null
     and v_profile.username_changed_at is not null
     and v_profile.username_changed_at + interval '30 days' > v_now then
    raise exception using errcode = 'P0001', message = 'PROFILE_HANDLE_COOLDOWN';
  end if;

  if exists (
    select 1 from public.profiles profile
    where profile.id <> v_profile.id
      and profile.deleted_at is null
      and lower(profile.username) = v_username
  ) then
    raise exception using errcode = '23505', message = 'PROFILE_HANDLE_TAKEN';
  end if;

  if exists (
    select 1
    from public.profile_handle_history history
    where history.profile_id <> v_profile.id
      and history.change_kind = 'rename'
      and lower(history.previous_username) = v_username
      and history.created_at > v_now - interval '90 days'
  ) then
    raise exception using errcode = 'P0001', message = 'PROFILE_HANDLE_QUARANTINED';
  end if;

  v_kind := case when v_previous_username is null then 'claim' else 'rename' end;
  perform set_config('app.profile_handle_profile_id', v_profile.id::text, true);

  update public.profiles
  set username = v_username,
      username_searchable = coalesce(p_searchable, false),
      username_claimed_at = coalesce(username_claimed_at, v_now),
      username_changed_at = v_now
  where id = v_profile.id;

  insert into public.profile_handle_history(
    profile_id, changed_by_user_id, change_kind,
    previous_username, new_username,
    previous_searchable, new_searchable
  ) values (
    v_profile.id, auth.uid(), v_kind,
    v_previous_username, v_username,
    v_previous_searchable, coalesce(p_searchable, false)
  );

  return jsonb_build_object(
    'username', v_username,
    'usernameSearchable', coalesce(p_searchable, false),
    'claimedAt', coalesce(v_profile.username_claimed_at, v_now),
    'changedAt', v_now,
    'nextChangeAt', v_now + interval '30 days',
    'canRename', false,
    'cooldownDaysRemaining', 30
  );
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'PROFILE_HANDLE_TAKEN';
end;
$$;

-- Respect handle lookup consent while keeping name and location discovery intact.
create or replace function public.rpc_search_circle_invite_candidates_v2(
  p_circle_id uuid,
  p_actor_profile_id uuid,
  p_search text default null,
  p_country text default null,
  p_interest text default null,
  p_min_age integer default null,
  p_max_age integer default null,
  p_limit integer default 24
)
returns table (
  profile_id uuid,
  full_name text,
  username text,
  avatar_url text,
  age integer,
  location text,
  country text,
  interests text[]
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_username_search text := nullif(regexp_replace(
    btrim(coalesce(p_search, '')),
    '^@+',
    ''
  ), '');
  v_country text := nullif(btrim(coalesce(p_country, '')), '');
  v_interest text := nullif(btrim(coalesce(p_interest, '')), '');
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles actor
    where actor.id = p_actor_profile_id
      and actor.user_id = auth.uid()
      and actor.deleted_at is null
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if not public.can_invite_to_circle(p_circle_id, auth.uid()) then
    raise exception 'circle_membership_required' using errcode = '42501';
  end if;

  return query
  select
    candidate.id,
    coalesce(nullif(btrim(candidate.full_name), ''), 'Betweener member'),
    case when candidate.username_searchable then nullif(lower(btrim(candidate.username)), '') end,
    candidate.avatar_url,
    candidate.age,
    coalesce(
      nullif(btrim(candidate.city), ''),
      nullif(btrim(candidate.region), ''),
      nullif(btrim(candidate.location), '')
    ),
    coalesce(
      nullif(btrim(candidate.current_country), ''),
      nullif(btrim(candidate.current_country_code), '')
    ),
    array(
      select interest_row.name
      from public.profile_interests profile_interest
      join public.interests interest_row on interest_row.id = profile_interest.interest_id
      where profile_interest.profile_id = candidate.id
      order by interest_row.name
      limit 4
    )
  from public.profiles candidate
  where candidate.id <> p_actor_profile_id
    and candidate.deleted_at is null
    and coalesce(candidate.is_active, true)
    and not exists (
      select 1
      from public.circle_members membership
      where membership.circle_id = p_circle_id
        and membership.profile_id = candidate.id
        and membership.status in ('active', 'pending', 'invited')
    )
    and (
      v_search is null
      or concat_ws(
        ' ', candidate.full_name, candidate.city,
        candidate.region, candidate.current_country
      ) ilike '%' || v_search || '%'
      or (
        candidate.username_searchable
        and v_username_search is not null
        and lower(candidate.username) like '%' || lower(v_username_search) || '%'
      )
    )
    and (
      v_country is null
      or candidate.current_country ilike '%' || v_country || '%'
      or candidate.current_country_code ilike v_country
    )
    and (p_min_age is null or candidate.age >= p_min_age)
    and (p_max_age is null or candidate.age <= p_max_age)
    and (
      v_interest is null
      or exists (
        select 1
        from public.profile_interests profile_interest
        join public.interests interest_row on interest_row.id = profile_interest.interest_id
        where profile_interest.profile_id = candidate.id
          and interest_row.name ilike '%' || v_interest || '%'
      )
    )
  order by
    case
      when candidate.username_searchable
        and v_username_search is not null
        and lower(candidate.username) = lower(v_username_search) then 0
      when candidate.username_searchable
        and v_username_search is not null
        and lower(candidate.username) like lower(v_username_search) || '%' then 1
      when v_search is not null
        and candidate.full_name ilike v_search || '%' then 2
      else 3
    end,
    candidate.full_name asc nulls last,
    candidate.id
  limit greatest(1, least(coalesce(p_limit, 24), 50));
end;
$$;

revoke all on table public.profile_handle_reservations from public, anon, authenticated;
revoke all on table public.profile_handle_history from public, anon, authenticated;
revoke all on table public.profile_handle_rate_limits from public, anon, authenticated;

revoke all on function public.profile_handle_normalize(text) from public, anon, authenticated;
revoke all on function public.profile_handle_skeleton(text) from public, anon, authenticated;
revoke all on function public.profile_handle_validation_reason(text) from public, anon, authenticated;
revoke all on function public.profile_handle_consume_rate_limit(uuid, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.profile_handle_prevent_unmanaged_write()
  from public, anon, authenticated;

revoke all on function public.rpc_get_my_profile_handle_state() from public, anon;
grant execute on function public.rpc_get_my_profile_handle_state() to authenticated, service_role;

revoke all on function public.rpc_check_profile_username_availability(text) from public, anon;
grant execute on function public.rpc_check_profile_username_availability(text)
  to authenticated, service_role;

revoke all on function public.rpc_update_my_profile_username(text, boolean) from public, anon;
grant execute on function public.rpc_update_my_profile_username(text, boolean)
  to authenticated, service_role;

revoke all on function public.rpc_search_circle_invite_candidates_v2(
  uuid, uuid, text, text, text, integer, integer, integer
) from public, anon;
grant execute on function public.rpc_search_circle_invite_candidates_v2(
  uuid, uuid, text, text, text, integer, integer, integer
) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
