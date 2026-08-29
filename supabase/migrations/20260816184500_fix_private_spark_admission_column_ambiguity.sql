-- The table-returning admission function exposes an output column named
-- user_id. Qualify profile columns so PL/pgSQL never confuses output variables
-- with columns from public.profiles.

begin;

create or replace function public.rpc_get_live_private_spark_rtc_admission(
  p_private_spark_id uuid
)
returns table(
  private_spark_id uuid,
  source_session_id uuid,
  user_id uuid,
  profile_id uuid,
  primary_role text,
  roles text[],
  participant_state text,
  session_status text,
  provider text,
  provider_call_type text,
  provider_call_id text,
  capabilities text[],
  maximum_participants integer,
  participant_user_ids uuid[]
)
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_spark public.live_private_sparks;
  v_profile public.profiles;
  v_expected_profile_id uuid;
  v_accepted_participants integer;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select spark_record.*
  into v_spark
  from public.live_private_sparks as spark_record
  where spark_record.id = p_private_spark_id;

  if v_spark.id is null
     or v_spark.state <> 'active'
     or v_spark.active_expires_at <= timezone('utc', now())
     or auth.uid() not in (
       v_spark.participant_a_user_id,
       v_spark.participant_b_user_id
     ) then
    raise exception 'live_private_spark_admission_forbidden' using errcode = '42501';
  end if;

  select count(distinct response_record.user_id)
  into v_accepted_participants
  from public.live_private_spark_responses as response_record
  where response_record.private_spark_id = v_spark.id
    and response_record.decision = 'accepted'
    and response_record.user_id in (
      v_spark.participant_a_user_id,
      v_spark.participant_b_user_id
    );

  if v_accepted_participants <> 2 then
    raise exception 'live_private_spark_consent_incomplete' using errcode = '42501';
  end if;

  v_expected_profile_id := case
    when auth.uid() = v_spark.participant_a_user_id
      then v_spark.participant_a_profile_id
    else v_spark.participant_b_profile_id
  end;

  select profile_record.*
  into v_profile
  from public.profiles as profile_record
  where profile_record.id = v_expected_profile_id
    and profile_record.user_id = auth.uid();

  if v_profile.id is null
     or v_profile.deleted_at is not null
     or v_profile.account_state is distinct from 'active'
     or (
       coalesce(v_profile.verification_level, 0) < 1
       and not public.is_admin_user(auth.uid())
     ) then
    raise exception 'live_private_spark_account_ineligible' using errcode = '42501';
  end if;

  if exists(
    select 1
    from public.blocks as block_record
    where (
      block_record.blocker_id = v_spark.participant_a_user_id
      and block_record.blocked_id = v_spark.participant_b_user_id
    ) or (
      block_record.blocker_id = v_spark.participant_b_user_id
      and block_record.blocked_id = v_spark.participant_a_user_id
    )
  ) then
    raise exception 'live_private_spark_blocked' using errcode = '42501';
  end if;

  return query
  select
    v_spark.id,
    v_spark.session_id,
    auth.uid(),
    v_profile.id,
    'audience'::text,
    array['audience']::text[],
    'private_spark'::text,
    'live'::text,
    v_spark.provider,
    v_spark.provider_call_type,
    v_spark.provider_call_id,
    array['live.join', 'live.publish', 'live.report', 'live.block']::text[],
    2,
    array[
      v_spark.participant_a_user_id,
      v_spark.participant_b_user_id
    ]::uuid[];
end;
$$;

revoke all on function public.rpc_get_live_private_spark_rtc_admission(uuid)
  from public, anon;
grant execute on function public.rpc_get_live_private_spark_rtc_admission(uuid)
  to authenticated;

commit;
