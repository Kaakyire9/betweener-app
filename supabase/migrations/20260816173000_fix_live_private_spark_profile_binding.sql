-- Bind Private Spark RTC admission to the exact profile captured by the
-- accepted match round. A user may have historical profile rows; selecting an
-- arbitrary row by user_id can deny one member of an otherwise valid pair.

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
  v_participant_state text;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select *
  into v_spark
  from public.live_private_sparks
  where id = p_private_spark_id;

  if v_spark.id is null
     or v_spark.state <> 'active'
     or v_spark.active_expires_at <= timezone('utc', now())
     or auth.uid() not in (
       v_spark.participant_a_user_id,
       v_spark.participant_b_user_id
     ) then
    raise exception 'live_private_spark_admission_forbidden' using errcode = '42501';
  end if;

  v_expected_profile_id := case
    when auth.uid() = v_spark.participant_a_user_id
      then v_spark.participant_a_profile_id
    else v_spark.participant_b_profile_id
  end;

  select *
  into v_profile
  from public.profiles
  where id = v_expected_profile_id
    and user_id = auth.uid();

  if v_profile.id is null
     or v_profile.deleted_at is not null
     or v_profile.account_state is distinct from 'active'
     or (
       coalesce(v_profile.verification_level, 0) < 1
       and not public.is_admin_user(auth.uid())
     ) then
    raise exception 'live_private_spark_account_ineligible' using errcode = '42501';
  end if;

  select participant.state
  into v_participant_state
  from public.live_participants participant
  where participant.session_id = v_spark.session_id
    and participant.user_id = auth.uid();

  if v_participant_state is distinct from 'private_spark' then
    raise exception 'live_private_spark_participant_state_invalid' using errcode = '42501';
  end if;

  if exists(
    select 1
    from public.blocks block_record
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
