begin;

-- Quick Connect is a public Live experience first. Members explicitly join a
-- durable pool while the host owns when rotations may create private pairs.
create table if not exists public.live_quick_connect_interests (
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  from_user_id uuid not null references auth.users(id) on delete cascade,
  to_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (session_id, from_user_id, to_user_id),
  constraint live_quick_connect_interest_not_self check (from_user_id <> to_user_id)
);

alter table public.live_quick_connect_interests enable row level security;
revoke all on table public.live_quick_connect_interests from public, anon, authenticated;

create trigger live_quick_connect_interest_updated_at
before update on public.live_quick_connect_interests
for each row execute function public.set_updated_at();

create trigger live_quick_connect_interests_bump
after insert or update or delete on public.live_quick_connect_interests
for each row execute function public.bump_live_quick_connect_update();

-- Explicit pool membership is allowed before a rotation opens. Draining and
-- ended rooms remain terminal, and a facilitator host cannot enter by accident.
create or replace function public.rpc_join_live_quick_connect(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.live_sessions;
  v_control public.live_quick_connect_controls;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select session.* into v_session
  from public.live_sessions session
  where session.id = p_session_id;

  if v_session.id is null
     or v_session.format <> 'quick_connect'
     or v_session.status not in ('live', 'backstage') then
    raise exception 'live_quick_connect_session_invalid' using errcode = '23514';
  end if;

  select control.* into v_control
  from public.live_quick_connect_controls control
  where control.session_id = p_session_id;

  if v_control.session_id is null then
    raise exception 'live_quick_connect_control_missing' using errcode = 'P0002';
  end if;

  if v_control.state in ('draining', 'ended') then
    raise exception 'live_quick_connect_not_accepting_members' using errcode = '55000';
  end if;

  if v_session.created_by_user_id = v_user_id
     and v_control.creator_mode = 'facilitator' then
    raise exception 'live_quick_connect_host_facilitator' using errcode = '42501';
  end if;

  return public.rpc_join_live_quick_connect_uncontrolled(p_session_id);
end;
$$;

revoke all on function public.rpc_join_live_quick_connect(uuid) from public, anon;
grant execute on function public.rpc_join_live_quick_connect(uuid) to authenticated;

create or replace function public.rpc_get_live_quick_connect_pool(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.live_sessions;
  v_control public.live_quick_connect_controls;
  v_me public.live_quick_connect_participants;
  v_members jsonb := '[]'::jsonb;
  v_queue jsonb := null;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select session.* into v_session
  from public.live_sessions session
  where session.id = p_session_id;

  if v_session.id is null or v_session.format <> 'quick_connect' then
    raise exception 'live_quick_connect_session_invalid' using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.live_participants participant
    where participant.session_id = p_session_id
      and participant.user_id = v_user_id
      and participant.state in ('audience', 'stage_requested', 'backstage', 'on_stage')
  ) then
    raise exception 'live_participant_required' using errcode = '42501';
  end if;

  select control.* into v_control
  from public.live_quick_connect_controls control
  where control.session_id = p_session_id;

  select participant.* into v_me
  from public.live_quick_connect_participants participant
  where participant.session_id = p_session_id
    and participant.user_id = v_user_id;

  if v_me.user_id is not null then
    perform public.live_quick_connect_sync(p_session_id);
    v_queue := public.rpc_get_live_quick_connect(p_session_id);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', member.user_id,
    'profile_id', member.profile_id,
    'full_name', profile.full_name,
    'avatar_url', profile.avatar_url,
    'age', profile.age,
    'city', coalesce(profile.city, profile.location),
    'expressed_interest', exists (
      select 1 from public.live_quick_connect_interests interest
      where interest.session_id = p_session_id
        and interest.from_user_id = v_user_id
        and interest.to_user_id = member.user_id
    )
  ) order by member.joined_at, member.user_id), '[]'::jsonb)
  into v_members
  from public.live_quick_connect_participants member
  join public.live_participants public_member
    on public_member.session_id = member.session_id
   and public_member.user_id = member.user_id
  join public.profiles profile
    on profile.id = member.profile_id
   and profile.user_id = member.user_id
  where member.session_id = p_session_id
    and member.state = 'waiting'
    and member.connection_state = 'connected'
    and public_member.state in ('audience', 'stage_requested', 'backstage', 'on_stage')
    and not (
      member.user_id = v_session.created_by_user_id
      and coalesce(v_control.creator_mode, 'facilitator') = 'facilitator'
    );

  return jsonb_build_object(
    'session_id', p_session_id,
    'control_state', coalesce(v_control.state, 'closed'),
    'creator_mode', coalesce(v_control.creator_mode, 'facilitator'),
    'server_now', timezone('utc', now()),
    'is_host', v_session.created_by_user_id = v_user_id,
    'is_opted_in', coalesce(v_me.state in ('waiting', 'paired', 'disconnected'), false),
    'my_state', coalesce(v_me.state, 'not_joined'),
    'can_opt_in', coalesce(v_control.state in ('closed', 'open', 'paused'), false)
      and not (v_session.created_by_user_id = v_user_id
        and coalesce(v_control.creator_mode, 'facilitator') = 'facilitator'),
    'members', v_members,
    'queue', v_queue
  );
end;
$$;

revoke all on function public.rpc_get_live_quick_connect_pool(uuid) from public, anon;
grant execute on function public.rpc_get_live_quick_connect_pool(uuid) to authenticated;

create or replace function public.rpc_signal_live_quick_connect_interest(
  p_session_id uuid,
  p_target_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_target_user_id uuid;
  v_shared_key uuid;
  v_is_mutual boolean := false;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.live_quick_connect_participants source
    where source.session_id = p_session_id
      and source.user_id = v_user_id
      and source.state = 'waiting'
      and source.connection_state = 'connected'
  ) then
    raise exception 'live_quick_connect_pool_membership_required' using errcode = '42501';
  end if;

  select target.user_id into v_target_user_id
  from public.live_quick_connect_participants target
  where target.session_id = p_session_id
    and target.profile_id = p_target_profile_id
    and target.state = 'waiting'
    and target.connection_state = 'connected';

  if v_target_user_id is null or v_target_user_id = v_user_id then
    raise exception 'live_quick_connect_interest_target_invalid' using errcode = '23514';
  end if;

  if not public.live_quick_connect_pair_is_eligible(
    p_session_id, v_user_id, v_target_user_id
  ) then
    raise exception 'live_quick_connect_pair_not_eligible' using errcode = '42501';
  end if;

  insert into public.live_quick_connect_interests(
    session_id, from_user_id, to_user_id
  ) values (
    p_session_id, v_user_id, v_target_user_id
  )
  on conflict (session_id, from_user_id, to_user_id)
  do update set updated_at = timezone('utc', now());

  select exists (
    select 1 from public.live_quick_connect_interests reciprocal
    where reciprocal.session_id = p_session_id
      and reciprocal.from_user_id = v_target_user_id
      and reciprocal.to_user_id = v_user_id
  ) into v_is_mutual;

  if v_is_mutual then
    v_shared_key := (
      substr(md5(p_session_id::text || least(v_user_id, v_target_user_id)::text
        || greatest(v_user_id, v_target_user_id)::text), 1, 8) || '-' ||
      substr(md5(p_session_id::text || least(v_user_id, v_target_user_id)::text
        || greatest(v_user_id, v_target_user_id)::text), 9, 4) || '-' ||
      substr(md5(p_session_id::text || least(v_user_id, v_target_user_id)::text
        || greatest(v_user_id, v_target_user_id)::text), 13, 4) || '-' ||
      substr(md5(p_session_id::text || least(v_user_id, v_target_user_id)::text
        || greatest(v_user_id, v_target_user_id)::text), 17, 4) || '-' ||
      substr(md5(p_session_id::text || least(v_user_id, v_target_user_id)::text
        || greatest(v_user_id, v_target_user_id)::text), 21, 12)
    )::uuid;

    update public.live_quick_connect_participants participant
    set pairing_key = v_shared_key
    where participant.session_id = p_session_id
      and participant.user_id in (v_user_id, v_target_user_id)
      and participant.state = 'waiting'
      and participant.connection_state = 'connected';

    perform public.live_quick_connect_sync(p_session_id);
  end if;

  return jsonb_build_object('saved', true, 'server_now', timezone('utc', now()));
end;
$$;

revoke all on function public.rpc_signal_live_quick_connect_interest(uuid, uuid)
from public, anon;
grant execute on function public.rpc_signal_live_quick_connect_interest(uuid, uuid)
to authenticated;

create or replace function public.cleanup_live_quick_connect_interests()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if new.state in ('left', 'unavailable') then
    delete from public.live_quick_connect_interests interest
    where interest.session_id = new.session_id
      and (interest.from_user_id = new.user_id or interest.to_user_id = new.user_id);
  end if;
  return new;
end;
$$;

create trigger live_quick_connect_interest_cleanup
after update of state on public.live_quick_connect_participants
for each row
when (old.state is distinct from new.state)
execute function public.cleanup_live_quick_connect_interests();

comment on table public.live_quick_connect_interests is
  'Private, unilateral Quick Connect preferences. Only mutual, eligible signals affect queue order.';
comment on function public.rpc_get_live_quick_connect_pool(uuid) is
  'Sanitized public-Live opt-in pool plus the caller private queue state.';

commit;
