-- Expose the already consent-safe hosted-match Conversation Spark to the two
-- Private Spark participants. No private RTC media or transcript enters this
-- projection.

create or replace function public.live_private_spark_projection(p_spark_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_spark public.live_private_sparks;
  v_can_manage boolean;
  v_is_participant boolean;
  v_my_response text;
  v_conversation_spark jsonb;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select * into v_spark from public.live_private_sparks where id=p_spark_id;
  if v_spark.id is null then return null; end if;
  v_can_manage := public.has_live_capability(v_spark.session_id,'live.terminate_private_spark');
  v_is_participant := auth.uid() in (v_spark.participant_a_user_id,v_spark.participant_b_user_id);
  if not v_is_participant and not v_can_manage then
    raise exception 'live_private_spark_forbidden' using errcode='42501';
  end if;
  if v_is_participant then
    select response.decision into v_my_response
    from public.live_private_spark_responses response
    where response.private_spark_id=v_spark.id and response.user_id=auth.uid();
  end if;
  select round.conversation_spark into v_conversation_spark
  from public.live_match_rounds round
  where round.id=v_spark.match_round_id;
  return jsonb_build_object(
    'id',v_spark.id,'session_id',v_spark.session_id,'match_round_id',v_spark.match_round_id,
    'state',v_spark.state,'is_participant',v_is_participant,'can_manage',v_can_manage,
    'my_response',v_my_response,'consent_expires_at',v_spark.consent_expires_at,
    'active_expires_at',v_spark.active_expires_at,
    'conversation_spark',v_conversation_spark,
    'participant_a',(select jsonb_build_object(
      'user_id',v_spark.participant_a_user_id,'profile_id',p.id,
      'full_name',p.full_name,'avatar_url',public.live_profile_avatar(p)
    ) from public.profiles p where p.id=v_spark.participant_a_profile_id),
    'participant_b',(select jsonb_build_object(
      'user_id',v_spark.participant_b_user_id,'profile_id',p.id,
      'full_name',p.full_name,'avatar_url',public.live_profile_avatar(p)
    ) from public.profiles p where p.id=v_spark.participant_b_profile_id)
  );
end;
$$;

revoke all on function public.live_private_spark_projection(uuid) from public;
