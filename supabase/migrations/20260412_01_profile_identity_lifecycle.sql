-- Identity lifecycle for early-created profile shells.
-- This keeps the current auth/bootstrap model but makes duplicate-shell
-- resolution explicit, auditable, and safe to enforce in product logic.

alter table public.profiles
  add column if not exists identity_status text not null default 'pending_phone_verification',
  add column if not exists duplicate_of_user_id uuid references auth.users(id) on delete set null,
  add column if not exists recovered_to_user_id uuid references auth.users(id) on delete set null,
  add column if not exists identity_status_updated_at timestamptz not null default timezone('utc'::text, now()),
  add column if not exists identity_disabled_at timestamptz null,
  add column if not exists phone_verified_at timestamptz null,
  add column if not exists onboarding_completed_at timestamptz null,
  add column if not exists identity_finalized_at timestamptz null,
  add column if not exists identity_resolution_reason text null,
  add column if not exists created_via_provider text null,
  add column if not exists last_successful_auth_provider text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_identity_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_identity_status_check
      check (
        identity_status in (
          'pending_phone_verification',
          'pending_onboarding',
          'active',
          'recovered_into_existing_account',
          'discarded_duplicate'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_created_via_provider_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_created_via_provider_check
      check (
        created_via_provider is null
        or created_via_provider in ('apple', 'google', 'email', 'magic_link')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_last_successful_auth_provider_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_last_successful_auth_provider_check
      check (
        last_successful_auth_provider is null
        or last_successful_auth_provider in ('apple', 'google', 'email', 'magic_link')
      );
  end if;
end
$$;

create index if not exists profiles_identity_status_idx
  on public.profiles (identity_status, updated_at desc);

create index if not exists profiles_duplicate_of_user_id_idx
  on public.profiles (duplicate_of_user_id)
  where duplicate_of_user_id is not null;

create index if not exists profiles_recovered_to_user_id_idx
  on public.profiles (recovered_to_user_id)
  where recovered_to_user_id is not null;

create or replace function public.set_profiles_identity_status_updated_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.identity_status_updated_at := coalesce(new.identity_status_updated_at, timezone('utc'::text, now()));
    return new;
  end if;

  if new.identity_status is distinct from old.identity_status then
    new.identity_status_updated_at := timezone('utc'::text, now());
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_identity_status_set_updated_at on public.profiles;
create trigger profiles_identity_status_set_updated_at
before insert or update of identity_status on public.profiles
for each row execute function public.set_profiles_identity_status_updated_at();

update public.profiles
set
  identity_status = case
    when coalesce(profile_completed, false) then 'active'
    when coalesce(phone_verified, false) then 'pending_onboarding'
    else 'pending_phone_verification'
  end,
  phone_verified_at = case
    when coalesce(phone_verified, false) and phone_verified_at is null
      then coalesce(updated_at, created_at, timezone('utc'::text, now()))
    else phone_verified_at
  end,
  onboarding_completed_at = case
    when coalesce(profile_completed, false) and onboarding_completed_at is null
      then coalesce(updated_at, created_at, timezone('utc'::text, now()))
    else onboarding_completed_at
  end,
  identity_finalized_at = case
    when coalesce(profile_completed, false) and identity_finalized_at is null
      then coalesce(updated_at, created_at, timezone('utc'::text, now()))
    else identity_finalized_at
  end,
  identity_status_updated_at = coalesce(updated_at, created_at, timezone('utc'::text, now()))
where identity_status not in (
  'pending_phone_verification',
  'pending_onboarding',
  'active',
  'recovered_into_existing_account',
  'discarded_duplicate'
)
or identity_status is null
or phone_verified_at is null
or onboarding_completed_at is null
or identity_finalized_at is null;

create table if not exists public.account_identity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists account_identity_events_user_idx
  on public.account_identity_events (user_id, created_at desc);

create index if not exists account_identity_events_profile_idx
  on public.account_identity_events (profile_id, created_at desc)
  where profile_id is not null;

alter table public.account_identity_events enable row level security;

revoke all on public.account_identity_events from anon, authenticated;

insert into public.account_identity_events (
  user_id,
  profile_id,
  actor_user_id,
  event_type,
  metadata
)
select
  p.user_id,
  p.id,
  null,
  'identity_status_backfill',
  jsonb_build_object(
    'identity_status', p.identity_status,
    'phone_verified', p.phone_verified,
    'profile_completed', p.profile_completed
  )
from public.profiles p
where p.user_id is not null
  and not exists (
    select 1
    from public.account_identity_events aie
    where aie.profile_id = p.id
      and aie.event_type = 'identity_status_backfill'
  );

create or replace function public.rpc_resolve_recovered_duplicate_shell(
  p_recovery_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_session public.account_recovery_sessions%rowtype;
  v_shell_profile public.profiles%rowtype;
  v_effective_owner_user_id uuid := auth.uid();
  v_now timestamptz := timezone('utc'::text, now());
  v_target_profile_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if p_recovery_token is null then
    raise exception 'recovery token is required';
  end if;

  select *
    into v_session
  from public.account_recovery_sessions
  where recovery_token = p_recovery_token
  order by created_at desc
  limit 1;

  if v_session.id is null then
    return jsonb_build_object(
      'resolved', false,
      'manual_review_required', true,
      'reason', 'recovery_session_not_found'
    );
  end if;

  select ma.target_user_id
    into v_effective_owner_user_id
  from public.merged_accounts ma
  where ma.source_user_id = v_session.owner_user_id
    and ma.status = 'active'
  limit 1;

  v_effective_owner_user_id := coalesce(v_effective_owner_user_id, v_session.owner_user_id);

  if auth.uid() <> v_effective_owner_user_id then
    return jsonb_build_object(
      'resolved', false,
      'manual_review_required', true,
      'reason', 'wrong_restored_account'
    );
  end if;

  select *
    into v_shell_profile
  from public.profiles
  where user_id = v_session.requester_user_id
  for update;

  if v_shell_profile.id is null then
    return jsonb_build_object(
      'resolved', false,
      'manual_review_required', true,
      'reason', 'shell_profile_missing'
    );
  end if;

  if v_shell_profile.user_id = v_effective_owner_user_id then
    return jsonb_build_object(
      'resolved', false,
      'manual_review_required', true,
      'reason', 'shell_matches_restored_account'
    );
  end if;

  if v_shell_profile.identity_status in ('recovered_into_existing_account', 'discarded_duplicate')
     and v_shell_profile.recovered_to_user_id = v_effective_owner_user_id then
    return jsonb_build_object(
      'resolved', true,
      'manual_review_required', false,
      'status', v_shell_profile.identity_status,
      'already_resolved', true,
      'shell_user_id', v_shell_profile.user_id,
      'restored_user_id', v_effective_owner_user_id
    );
  end if;

  if coalesce(v_shell_profile.profile_completed, false) then
    insert into public.account_identity_events (
      user_id,
      profile_id,
      actor_user_id,
      event_type,
      metadata
    )
    values (
      v_shell_profile.user_id,
      v_shell_profile.id,
      auth.uid(),
      'duplicate_shell_manual_review_required',
      jsonb_build_object(
        'reason', 'profile_completed_shell',
        'recovery_token', p_recovery_token,
        'restored_user_id', v_effective_owner_user_id
      )
    );

    return jsonb_build_object(
      'resolved', false,
      'manual_review_required', true,
      'reason', 'profile_completed_shell'
    );
  end if;

  select p.id
    into v_target_profile_id
  from public.profiles p
  where p.user_id = v_effective_owner_user_id
  limit 1;

  update public.profiles
     set identity_status = 'recovered_into_existing_account',
         duplicate_of_user_id = v_effective_owner_user_id,
         recovered_to_user_id = v_effective_owner_user_id,
         identity_disabled_at = coalesce(identity_disabled_at, v_now),
         identity_resolution_reason = 'verified_phone_recovery',
         discoverable_in_vibes = false,
         is_active = false,
         online = false,
         updated_at = v_now
   where id = v_shell_profile.id;

  update public.account_recovery_sessions
     set consumed_at = coalesce(consumed_at, v_now)
   where id = v_session.id;

  insert into public.account_identity_events (
    user_id,
    profile_id,
    actor_user_id,
    event_type,
    metadata
  )
  values (
    v_shell_profile.user_id,
    v_shell_profile.id,
    auth.uid(),
    'duplicate_shell_retired_after_recovery',
    jsonb_build_object(
      'recovery_token', p_recovery_token,
      'shell_user_id', v_shell_profile.user_id,
      'restored_user_id', v_effective_owner_user_id,
      'restored_profile_id', v_target_profile_id
    )
  );

  return jsonb_build_object(
    'resolved', true,
    'manual_review_required', false,
    'status', 'recovered_into_existing_account',
    'shell_user_id', v_shell_profile.user_id,
    'restored_user_id', v_effective_owner_user_id,
    'restored_profile_id', v_target_profile_id
  );
end;
$$;

revoke all on function public.rpc_resolve_recovered_duplicate_shell(uuid) from public;
grant execute on function public.rpc_resolve_recovered_duplicate_shell(uuid) to authenticated;
