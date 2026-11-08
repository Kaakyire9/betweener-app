-- Premium Live reactions: persist accepted events for safety/recap, then emit
-- an anonymous, private Broadcast for the transient audience animation.

alter table public.live_reactions
  drop constraint if exists live_reactions_value_valid;

alter table public.live_reactions
  add constraint live_reactions_value_valid
  check (reaction in (
    'heart', 'spark', 'applause', 'support',
    'joy', 'wow', 'insight', 'celebrate'
  ));

create or replace function public.can_receive_live_reaction_broadcast(
  p_topic text,
  p_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session_id uuid;
begin
  if p_user_id is null or p_topic is null or p_topic !~* '^live-reactions:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return false;
  end if;

  begin
    v_session_id := split_part(p_topic, ':', 2)::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  return exists (
    select 1
    from public.live_sessions session
    where session.id = v_session_id
      and session.status = 'live'
  ) and public.has_live_capability(v_session_id, 'live.join', p_user_id);
end;
$$;

revoke all on function public.can_receive_live_reaction_broadcast(text, uuid) from public;
grant execute on function public.can_receive_live_reaction_broadcast(text, uuid) to authenticated, service_role;

drop policy if exists live_reaction_broadcast_receive on realtime.messages;
create policy live_reaction_broadcast_receive
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and public.can_receive_live_reaction_broadcast(
    (select realtime.topic()),
    (select auth.uid())
  )
);

create or replace function public.rpc_create_live_reaction(
  p_session_id uuid,
  p_client_event_id uuid,
  p_reaction text
)
returns public.live_reactions
language plpgsql
security definer
set search_path = public, realtime, pg_catalog
set row_security = off
as $$
declare
  v_profile public.profiles;
  v_reaction public.live_reactions;
begin
  v_profile := public.live_active_profile(auth.uid());
  if not public.has_live_capability(p_session_id, 'live.react')
     or not exists (
       select 1 from public.live_sessions session
       where session.id = p_session_id and session.status = 'live'
     ) then
    raise exception 'live_reaction_forbidden' using errcode = '42501';
  end if;

  select * into v_reaction
  from public.live_reactions
  where session_id = p_session_id
    and user_id = auth.uid()
    and client_event_id = p_client_event_id;
  if v_reaction.id is not null then
    return v_reaction;
  end if;

  if (
    select count(*)
    from public.live_reactions reaction
    where reaction.session_id = p_session_id
      and reaction.user_id = auth.uid()
      and reaction.created_at > timezone('utc', now()) - interval '10 seconds'
  ) >= 20 then
    raise exception 'live_reaction_rate_limited' using errcode = 'P0001';
  end if;

  insert into public.live_reactions (
    session_id, user_id, profile_id, client_event_id, reaction
  ) values (
    p_session_id, auth.uid(), v_profile.id, p_client_event_id, p_reaction
  ) returning * into v_reaction;

  perform realtime.send(
    jsonb_build_object(
      'eventId', v_reaction.client_event_id,
      'sessionId', v_reaction.session_id,
      'reaction', v_reaction.reaction,
      'emittedAt', v_reaction.created_at
    ),
    'reaction',
    'live-reactions:' || p_session_id::text,
    true
  );

  return v_reaction;
end;
$$;

revoke all on function public.rpc_create_live_reaction(uuid, uuid, text) from public, anon;
grant execute on function public.rpc_create_live_reaction(uuid, uuid, text) to authenticated;

comment on function public.rpc_create_live_reaction(uuid, uuid, text) is
  'Persists a capability-checked Live reaction and atomically emits its anonymous private Broadcast.';
