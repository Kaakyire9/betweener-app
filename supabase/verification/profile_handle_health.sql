-- Betweener @handle lifecycle health check.
-- Read-only. Run after the 20260906143000-20260906153000 handle rollout.

-- 1. Installation and authenticated execution boundaries.
with expected(name, signature, authenticated_execute) as (
  values
    ('state', 'public.rpc_get_my_profile_handle_state()', true),
    ('availability', 'public.rpc_check_profile_username_availability(text)', true),
    ('update', 'public.rpc_update_my_profile_username(text,boolean)', true),
    ('validation', 'public.profile_handle_validation_reason(text)', false),
    ('rate_limit', 'public.profile_handle_consume_rate_limit(uuid,text,integer,integer)', false)
), resolved as (
  select expected.*, to_regprocedure(expected.signature) as procedure_oid
  from expected
)
select
  resolved.name,
  resolved.procedure_oid is not null as installed,
  case when resolved.procedure_oid is null then false
    else has_function_privilege('authenticated', resolved.procedure_oid, 'EXECUTE')
      = resolved.authenticated_execute
  end as authenticated_boundary_healthy
from resolved
order by resolved.name;

-- 2. Storage, direct-write guard, and privacy-aware invite lookup.
select
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'username_searchable'
  ) as searchable_consent_installed,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'username_changed_at'
  ) as cooldown_state_installed,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profile_handle_reservations'
      and column_name = 'match_mode'
      and is_nullable = 'NO'
  ) as reservation_scopes_installed,
  (select count(*) = 14
    from public.profile_handle_reservations reservation
    where reservation.reason = 'cultural_character'
      and reservation.match_mode = 'exact') as cultural_exact_reservations_healthy,
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname = 'profile_control_handle_write'
      and not tgisinternal
  ) as direct_write_guard_active,
  exists (
    select 1
    from pg_index index_metadata
    where index_metadata.indexrelid =
        to_regclass('public.idx_profiles_searchable_username_trgm')
      and index_metadata.indrelid = 'public.profiles'::regclass
      and index_metadata.indisvalid
      and index_metadata.indisready
  ) as concurrent_search_index_healthy,
  pg_get_functiondef(
    'public.rpc_search_circle_invite_candidates_v2(uuid,uuid,text,text,text,integer,integer,integer)'::regprocedure
  ) like '%candidate.username_searchable%' as private_handles_excluded_from_invite_search;

-- 3. Data invariants. Every affected count must be zero.
with blockers as (
  select 'case_insensitive_duplicate_handle'::text as blocker, count(*)::bigint as affected
  from (
    select lower(btrim(profile.username))
    from public.profiles profile
    where profile.deleted_at is null and nullif(btrim(profile.username), '') is not null
    group by lower(btrim(profile.username))
    having count(*) > 1
  ) duplicates

  union all

  select 'searchable_profile_without_handle', count(*)
  from public.profiles profile
  where profile.deleted_at is null
    and profile.username_searchable
    and nullif(btrim(profile.username), '') is null

  union all

  select 'searchable_handle_fails_current_policy', count(*)
  from public.profiles profile
  where profile.deleted_at is null
    and profile.username_searchable
    and public.profile_handle_validation_reason(profile.username) is not null

  union all

  select 'active_handle_quarantined_by_another_profile', count(*)
  from public.profiles profile
  where profile.deleted_at is null
    and nullif(btrim(profile.username), '') is not null
    and exists (
      select 1 from public.profile_handle_history history
      where history.profile_id <> profile.id
        and history.change_kind = 'rename'
        and lower(history.previous_username) = lower(profile.username)
        and history.created_at > timezone('utc', now()) - interval '90 days'
    )
)
select blocker, affected, affected = 0 as healthy
from blockers
order by blocker;

-- 4. Existing owners of subsequently protected handles are grandfathered.
-- This is operational context rather than a blocker; only the count is shown.
select count(*)::bigint as grandfathered_reserved_handle_owners
from public.profiles profile
where profile.deleted_at is null
  and nullif(btrim(profile.username), '') is not null
  and exists (
    select 1
    from public.profile_handle_reservations reservation
    where reservation.normalized_username = lower(btrim(profile.username))
       or reservation.username_skeleton = public.profile_handle_skeleton(profile.username)
       or (
         reservation.match_mode in ('namespace', 'prefix')
         and (
           lower(btrim(profile.username)) like reservation.normalized_username || '.%'
           or left(
             lower(btrim(profile.username)),
             char_length(reservation.normalized_username) + 1
           ) = reservation.normalized_username || '_'
         )
       )
       or (
         reservation.match_mode = 'prefix'
         and (
           lower(btrim(profile.username)) like reservation.normalized_username || '%'
           or public.profile_handle_skeleton(profile.username)
             like reservation.username_skeleton || '%'
         )
       )
  );
