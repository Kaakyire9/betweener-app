-- Existing verified profiles remain valid. Only challenges issued after this
-- migration can establish new phone ownership.
create table private.phone_verification_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  signup_session_id uuid not null,
  phone_number text not null check (phone_number ~ '^\+[1-9][0-9]{6,14}$'),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  dispatch_id uuid not null,
  dispatch_started_at timestamptz not null,
  verification_sid text unique check (verification_sid ~ '^VE[0-9a-fA-F]{32}$'),
  confidence_score integer not null default 0 check (confidence_score between 0 and 100),
  check_id uuid,
  check_started_at timestamptz,
  result jsonb
);
alter table private.phone_verification_challenges enable row level security;
revoke all on private.phone_verification_challenges from public, anon, authenticated, service_role;
create index phone_verification_challenges_phone_latest
  on private.phone_verification_challenges(phone_number, created_at desc);
create index phone_verification_challenges_user
  on private.phone_verification_challenges(user_id);

drop policy if exists "Admins can view all phone verifications" on public.phone_verifications;
drop policy if exists "Admins can update phone verifications" on public.phone_verifications;
drop policy if exists "Users can insert their own phone verifications" on public.phone_verifications;
drop policy if exists "Users can update their own phone verifications" on public.phone_verifications;
drop policy if exists "Users can view their own phone verifications" on public.phone_verifications;
drop policy if exists phone_verifications_select_owner on public.phone_verifications;
alter table public.phone_verifications enable row level security;
revoke all on public.phone_verifications from public, anon, authenticated;
-- Compatibility for the exact REST projection used by shipped Auth clients.
grant select (user_id, phone_number, status, is_verified, verified_at)
  on public.phone_verifications to authenticated;
create policy phone_verifications_select_owner on public.phone_verifications
  for select to authenticated using (user_id = (select auth.uid()));

-- A verified profile phone is part of the same ownership boundary. Existing
-- upsert clients may echo a phone that the server has already verified.
create function private.guard_profile_phone_verification_v1()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then return new; end if;
  if tg_op = 'INSERT' then
    if new.phone_verified is true and not exists (
      select 1 from public.profiles p
      where p.user_id = new.user_id and p.phone_verified
        and p.phone_number = new.phone_number and p.deleted_at is null
    ) then
      raise exception using errcode = '42501', message = 'PHONE_VERIFICATION_SERVER_MANAGED';
    end if;
  elsif new.phone_verified is distinct from old.phone_verified
     or (old.phone_verified is true and new.phone_number is distinct from old.phone_number) then
    raise exception using errcode = '42501', message = 'PHONE_VERIFICATION_SERVER_MANAGED';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_profile_phone_verification_v1() from public, anon, authenticated;
create trigger phone_verification_guard_profile
  before insert or update of phone_verified, phone_number on public.profiles
  for each row execute function private.guard_profile_phone_verification_v1();

-- Preserve the legacy signature while removing its ability to claim a row.
create or replace function public.rpc_link_phone_verification(p_signup_session_id text)
returns boolean
language sql stable security invoker set search_path = ''
as $$ select false $$;
revoke all on function public.rpc_link_phone_verification(text) from public, anon, authenticated, service_role;
revoke all on function public.cleanup_phone_verifications_orphans() from public, anon, authenticated;

-- The profile is the established status. An old verification row is not
-- authority to grant a new phone verification.
create or replace function public.rpc_get_phone_verification_status()
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object('verified', true, 'phone_number', p.phone_number)
    from public.profiles p
    where p.user_id = (select auth.uid()) and p.phone_verified
      and p.phone_number is not null and p.deleted_at is null
  ), jsonb_build_object('verified', false));
$$;
revoke all on function public.rpc_get_phone_verification_status() from public, anon;
grant execute on function public.rpc_get_phone_verification_status() to authenticated;

create function public.rpc_reserve_phone_challenge_v1(
  p_user_id uuid, p_signup_session_id uuid, p_phone text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  challenge private.phone_verification_challenges%rowtype;
  at_time timestamptz;
begin
  if p_user_id is null or p_signup_session_id is null or p_phone is null
     or p_phone !~ '^\+[1-9][0-9]{6,14}$' then
    return jsonb_build_object('state', 'invalid');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('phone-verification:' || p_phone, 0));
  at_time := clock_timestamp();
  select * into challenge from private.phone_verification_challenges
    where phone_number = p_phone order by created_at desc limit 1 for update;
  if found and challenge.expires_at > at_time then
    if challenge.user_id <> p_user_id or challenge.signup_session_id <> p_signup_session_id then
      return jsonb_build_object('state', 'busy');
    end if;
    if challenge.result is not null then
      return jsonb_build_object('state', 'complete');
    end if;
    if challenge.dispatch_started_at > at_time - interval '30 seconds'
       or challenge.check_started_at > at_time - interval '35 seconds' then
      return jsonb_build_object('state', 'busy');
    end if;
    update private.phone_verification_challenges
      set dispatch_id = gen_random_uuid(), dispatch_started_at = at_time
      where id = challenge.id returning * into challenge;
  else
    insert into private.phone_verification_challenges
      (user_id, signup_session_id, phone_number, created_at, expires_at, dispatch_id, dispatch_started_at)
    values (p_user_id, p_signup_session_id, p_phone, at_time, at_time + interval '10 minutes',
            gen_random_uuid(), at_time)
    returning * into challenge;
  end if;
  return jsonb_build_object('state', 'send', 'id', challenge.id, 'dispatch_id', challenge.dispatch_id);
end;
$$;

create function public.rpc_record_phone_dispatch_v1(
  p_user_id uuid, p_id uuid, p_dispatch_id uuid, p_sid text, p_score integer
) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if p_sid is null or p_sid !~ '^VE[0-9a-fA-F]{32}$' then
    return false;
  end if;
  update private.phone_verification_challenges
  set verification_sid = p_sid, confidence_score = p_score
  where id = p_id and user_id = p_user_id and dispatch_id = p_dispatch_id
    and expires_at > clock_timestamp() and result is null
    and (verification_sid is null or verification_sid = p_sid);
  return found;
exception when unique_violation then
  -- A provider SID previously bound to another attempt cannot be transferred.
  return false;
end;
$$;

create function public.rpc_begin_phone_check_v1(
  p_user_id uuid, p_signup_session_id uuid, p_phone text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  challenge private.phone_verification_challenges%rowtype;
  at_time timestamptz;
begin
  select * into challenge from private.phone_verification_challenges
    where phone_number = p_phone order by created_at desc limit 1 for update;
  at_time := clock_timestamp();
  if not found or challenge.user_id is distinct from p_user_id
     or challenge.signup_session_id is distinct from p_signup_session_id
     or challenge.expires_at <= at_time or challenge.verification_sid is null then
    return jsonb_build_object('state', 'missing');
  end if;
  if challenge.result is not null then
    return challenge.result;
  end if;
  if challenge.check_started_at > at_time - interval '35 seconds' then
    return jsonb_build_object('state', 'busy');
  end if;
  update private.phone_verification_challenges
    set check_id = gen_random_uuid(), check_started_at = at_time
    where id = challenge.id returning * into challenge;
  return jsonb_build_object('state', 'check', 'id', challenge.id,
    'check_id', challenge.check_id, 'verification_sid', challenge.verification_sid);
end;
$$;

create function public.rpc_finish_phone_check_v1(
  p_user_id uuid, p_id uuid, p_check_id uuid, p_sid text, p_approved boolean
) returns jsonb
-- Existing profile triggers resolve the managed unaccent extension in public.
language plpgsql security definer set search_path = pg_catalog, public, extensions, pg_temp
as $$
declare
  phone text;
  challenge private.phone_verification_challenges%rowtype;
  keeper public.profiles%rowtype;
  recovery_token uuid;
  outcome jsonb;
  at_time timestamptz;
begin
  select phone_number into phone from private.phone_verification_challenges
    where id = p_id and user_id = p_user_id;
  if phone is null then return jsonb_build_object('state', 'missing'); end if;
  perform pg_advisory_xact_lock(hashtextextended('phone-verification:' || phone, 0));
  select * into challenge from private.phone_verification_challenges
    where id = p_id and user_id = p_user_id for update;
  at_time := clock_timestamp();
  if not found or challenge.check_id is distinct from p_check_id
     or p_check_id is null or challenge.verification_sid is distinct from p_sid
     or p_sid is null or challenge.expires_at <= at_time then
    return jsonb_build_object('state', 'missing');
  end if;
  if challenge.result is not null then return challenge.result; end if;
  if p_approved is not true then
    update private.phone_verification_challenges set check_id = null, check_started_at = null
      where id = challenge.id;
    return jsonb_build_object('state', 'pending');
  end if;

  -- The verified-phone unique index is a second fence against a conflicting
  -- write by another server path. Report a conflict after that write wins.
  select * into keeper from public.profiles
    where phone_number = phone and phone_verified and deleted_at is null
      and user_id <> p_user_id;
  if keeper.id is null then
    begin
      insert into public.profiles (user_id, phone_number, phone_verified, phone_verified_at,
                                  phone_verification_score, verification_level)
      values (p_user_id, phone, true, at_time, challenge.confidence_score / 100.0, 1)
      on conflict (user_id) do update
      set phone_number = excluded.phone_number, phone_verified = true,
          phone_verified_at = at_time, phone_verification_score = excluded.phone_verification_score,
          verification_level = greatest(public.profiles.verification_level, 1),
          updated_at = at_time
      where public.profiles.deleted_at is null
        and coalesce(public.profiles.identity_status, '') not in
          ('recovered_into_existing_account', 'discarded_duplicate')
        and (public.profiles.phone_verified is not true
          or public.profiles.phone_number is null or public.profiles.phone_number = phone);
      if not found then
        outcome := jsonb_build_object('state', 'account_unavailable');
        update private.phone_verification_challenges set result = outcome where id = challenge.id;
        return outcome;
      end if;

      insert into public.phone_verifications
        (user_id, signup_session_id, phone_number, verification_sid, status, is_verified,
         verified_at, confidence_score)
      values (p_user_id, challenge.signup_session_id::text, phone, p_sid, 'verified', true,
              at_time, challenge.confidence_score);
      outcome := jsonb_build_object('state', 'verified', 'confidence_score', challenge.confidence_score);
    exception when unique_violation then
      select * into keeper from public.profiles
        where phone_number = phone and phone_verified and deleted_at is null
          and user_id <> p_user_id;
      if keeper.id is null then raise; end if;
    end;
  end if;
  if keeper.id is not null then
    insert into public.account_recovery_sessions
      (requester_user_id, conflicting_phone_number, owner_user_id, owner_profile_id, metadata)
    values (p_user_id, phone, keeper.user_id, keeper.id,
            jsonb_build_object('source', 'verified_phone_conflict'))
    returning account_recovery_sessions.recovery_token into recovery_token;
    outcome := jsonb_build_object('state', 'conflict', 'recovery_token', recovery_token);
  end if;
  update private.phone_verification_challenges set result = outcome
    where id = challenge.id;
  return outcome;
end;
$$;

revoke all on function public.rpc_reserve_phone_challenge_v1(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.rpc_record_phone_dispatch_v1(uuid, uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.rpc_begin_phone_check_v1(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.rpc_finish_phone_check_v1(uuid, uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.rpc_reserve_phone_challenge_v1(uuid, uuid, text) to service_role;
grant execute on function public.rpc_record_phone_dispatch_v1(uuid, uuid, uuid, text, integer) to service_role;
grant execute on function public.rpc_begin_phone_check_v1(uuid, uuid, text) to service_role;
grant execute on function public.rpc_finish_phone_check_v1(uuid, uuid, uuid, text, boolean) to service_role;
