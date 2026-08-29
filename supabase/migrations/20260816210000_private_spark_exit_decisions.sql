-- Private Spark post-call consent. Choices are write-only to other members;
-- only a mutual "continue" result is projected and promoted into the existing
-- Betweener match/chat system.

begin;

alter table public.live_private_sparks
  add column if not exists exit_outcome text not null default 'pending',
  add column if not exists match_id uuid references public.matches(id) on delete set null,
  add column if not exists exit_resolved_at timestamptz;

alter table public.live_private_sparks
  drop constraint if exists live_private_sparks_exit_outcome_valid;

alter table public.live_private_sparks
  add constraint live_private_sparks_exit_outcome_valid
  check (exit_outcome in ('pending','mutual_connection','completed'));

create table if not exists public.live_private_spark_exit_responses (
  private_spark_id uuid not null references public.live_private_sparks(id) on delete cascade,
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  decision text not null,
  responded_at timestamptz not null default timezone('utc',now()),
  primary key (private_spark_id,user_id),
  constraint live_private_spark_exit_response_valid
    check (decision in ('continue','friendship','not_this_time'))
);

alter table public.live_private_spark_exit_responses enable row level security;
revoke all on table public.live_private_spark_exit_responses from public, anon, authenticated;
grant all on table public.live_private_spark_exit_responses to service_role;

create index if not exists live_private_spark_exit_responses_session_idx
  on public.live_private_spark_exit_responses(session_id,responded_at desc);

create unique index if not exists system_messages_private_spark_mutual_unique
  on public.system_messages(user_id,peer_user_id,((metadata->>'private_spark_id')))
  where event_type='live_private_spark_mutual';

drop trigger if exists live_private_spark_exit_responses_bump_update
  on public.live_private_spark_exit_responses;
create trigger live_private_spark_exit_responses_bump_update
after insert or update or delete on public.live_private_spark_exit_responses
for each row execute function public.bump_live_match_round_update();

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
  v_my_exit_decision text;
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

    select response.decision into v_my_exit_decision
    from public.live_private_spark_exit_responses response
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
    'my_exit_decision',case when v_is_participant then v_my_exit_decision else null end,
    'exit_outcome',case when v_is_participant then v_spark.exit_outcome else null end,
    'match_id',case
      when v_is_participant and v_spark.exit_outcome='mutual_connection' then v_spark.match_id
      else null
    end,
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

create or replace function public.rpc_submit_live_private_spark_exit(
  p_private_spark_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_spark public.live_private_sparks;
  v_existing text;
  v_response_count integer;
  v_continue_count integer;
  v_match_id uuid;
  v_pair_key text;
  v_blocked boolean;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;
  if p_decision not in ('continue','friendship','not_this_time') then
    raise exception 'live_private_spark_exit_decision_invalid' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_private_spark_id::text,0));
  select * into v_spark
  from public.live_private_sparks spark
  where spark.id=p_private_spark_id
  for update;

  if v_spark.id is null then
    raise exception 'live_private_spark_not_found' using errcode='P0002';
  end if;
  if auth.uid() not in (v_spark.participant_a_user_id,v_spark.participant_b_user_id) then
    raise exception 'live_private_spark_exit_forbidden' using errcode='42501';
  end if;
  if v_spark.activated_at is null or v_spark.state not in ('ended','expired','terminated') then
    raise exception 'live_private_spark_exit_not_ready' using errcode='22023';
  end if;

  select response.decision into v_existing
  from public.live_private_spark_exit_responses response
  where response.private_spark_id=v_spark.id and response.user_id=auth.uid();

  if v_existing is not null then
    if v_existing<>p_decision then
      raise exception 'live_private_spark_exit_already_recorded' using errcode='23505';
    end if;
    return public.live_private_spark_projection(v_spark.id);
  end if;

  insert into public.live_private_spark_exit_responses(
    private_spark_id,session_id,user_id,decision
  ) values (
    v_spark.id,v_spark.session_id,auth.uid(),p_decision
  );

  select count(*),count(*) filter (where response.decision='continue')
  into v_response_count,v_continue_count
  from public.live_private_spark_exit_responses response
  where response.private_spark_id=v_spark.id;

  if v_response_count=2 then
    select exists(
      select 1 from public.blocks block
      where (block.blocker_id=v_spark.participant_a_user_id and block.blocked_id=v_spark.participant_b_user_id)
         or (block.blocker_id=v_spark.participant_b_user_id and block.blocked_id=v_spark.participant_a_user_id)
    ) into v_blocked;

    if v_continue_count=2 and not v_blocked then
      v_pair_key := least(v_spark.participant_a_profile_id::text,v_spark.participant_b_profile_id::text)
        || '|' || greatest(v_spark.participant_a_profile_id::text,v_spark.participant_b_profile_id::text);
      perform pg_advisory_xact_lock(hashtextextended(v_pair_key,0));

      select match.id into v_match_id
      from public.matches match
      where (match.user1_id=v_spark.participant_a_profile_id and match.user2_id=v_spark.participant_b_profile_id)
         or (match.user1_id=v_spark.participant_b_profile_id and match.user2_id=v_spark.participant_a_profile_id)
      for update;

      if v_match_id is null then
        insert into public.matches(user1_id,user2_id,status)
        values(v_spark.participant_a_profile_id,v_spark.participant_b_profile_id,'ACCEPTED')
        returning id into v_match_id;
      else
        update public.matches
        set status='ACCEPTED',updated_at=timezone('utc',now())
        where id=v_match_id and status<>'ACCEPTED';
      end if;

      update public.live_private_sparks
      set exit_outcome='mutual_connection',match_id=v_match_id,
        exit_resolved_at=timezone('utc',now())
      where id=v_spark.id;

      insert into public.system_messages(user_id,peer_user_id,event_type,text,metadata)
      values
        (
          v_spark.participant_a_user_id,v_spark.participant_b_user_id,
          'live_private_spark_mutual',
          'Your Private Spark was mutual. This conversation is now yours to continue.',
          jsonb_build_object('private_spark_id',v_spark.id,'session_id',v_spark.session_id,'match_id',v_match_id)
        ),
        (
          v_spark.participant_b_user_id,v_spark.participant_a_user_id,
          'live_private_spark_mutual',
          'Your Private Spark was mutual. This conversation is now yours to continue.',
          jsonb_build_object('private_spark_id',v_spark.id,'session_id',v_spark.session_id,'match_id',v_match_id)
        )
      on conflict do nothing;
    else
      update public.live_private_sparks
      set exit_outcome='completed',match_id=null,exit_resolved_at=timezone('utc',now())
      where id=v_spark.id;
    end if;
  end if;

  return public.live_private_spark_projection(v_spark.id);
end;
$$;

revoke all on function public.live_private_spark_projection(uuid) from public;
revoke all on function public.rpc_submit_live_private_spark_exit(uuid,text) from public, anon;
grant execute on function public.rpc_submit_live_private_spark_exit(uuid,text) to authenticated;
grant execute on function public.rpc_submit_live_private_spark_exit(uuid,text) to service_role;

commit;
