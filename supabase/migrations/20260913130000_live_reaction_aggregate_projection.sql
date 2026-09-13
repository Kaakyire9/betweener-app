-- Durable, anonymous Live reaction totals. Individual accepted reactions stay
-- available to trusted server roles for safety/recap, while clients receive a
-- capability-scoped aggregate snapshot with a monotonic version.

create table public.live_reaction_totals (
  session_id uuid primary key references public.live_sessions(id) on delete cascade,
  total_count bigint not null default 0,
  heart_count bigint not null default 0,
  spark_count bigint not null default 0,
  applause_count bigint not null default 0,
  support_count bigint not null default 0,
  joy_count bigint not null default 0,
  wow_count bigint not null default 0,
  insight_count bigint not null default 0,
  celebrate_count bigint not null default 0,
  version bigint not null default 0,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint live_reaction_totals_nonnegative check (
    total_count >= 0
    and heart_count >= 0
    and spark_count >= 0
    and applause_count >= 0
    and support_count >= 0
    and joy_count >= 0
    and wow_count >= 0
    and insight_count >= 0
    and celebrate_count >= 0
    and version >= 0
  ),
  constraint live_reaction_totals_balanced check (
    total_count = heart_count + spark_count + applause_count + support_count
      + joy_count + wow_count + insight_count + celebrate_count
  )
);

create index live_reactions_member_rate_limit_idx
  on public.live_reactions(session_id, user_id, created_at desc);

insert into public.live_reaction_totals (
  session_id,
  total_count,
  heart_count,
  spark_count,
  applause_count,
  support_count,
  joy_count,
  wow_count,
  insight_count,
  celebrate_count,
  version,
  updated_at
)
select
  reaction.session_id,
  count(*),
  count(*) filter (where reaction.reaction = 'heart'),
  count(*) filter (where reaction.reaction = 'spark'),
  count(*) filter (where reaction.reaction = 'applause'),
  count(*) filter (where reaction.reaction = 'support'),
  count(*) filter (where reaction.reaction = 'joy'),
  count(*) filter (where reaction.reaction = 'wow'),
  count(*) filter (where reaction.reaction = 'insight'),
  count(*) filter (where reaction.reaction = 'celebrate'),
  count(*),
  max(reaction.created_at)
from public.live_reactions reaction
group by reaction.session_id;

create or replace function public.project_live_reaction_total()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  insert into public.live_reaction_totals (
    session_id,
    total_count,
    heart_count,
    spark_count,
    applause_count,
    support_count,
    joy_count,
    wow_count,
    insight_count,
    celebrate_count,
    version,
    updated_at
  ) values (
    new.session_id,
    1,
    (new.reaction = 'heart')::integer,
    (new.reaction = 'spark')::integer,
    (new.reaction = 'applause')::integer,
    (new.reaction = 'support')::integer,
    (new.reaction = 'joy')::integer,
    (new.reaction = 'wow')::integer,
    (new.reaction = 'insight')::integer,
    (new.reaction = 'celebrate')::integer,
    1,
    new.created_at
  )
  on conflict (session_id) do update set
    total_count = live_reaction_totals.total_count + 1,
    heart_count = live_reaction_totals.heart_count + excluded.heart_count,
    spark_count = live_reaction_totals.spark_count + excluded.spark_count,
    applause_count = live_reaction_totals.applause_count + excluded.applause_count,
    support_count = live_reaction_totals.support_count + excluded.support_count,
    joy_count = live_reaction_totals.joy_count + excluded.joy_count,
    wow_count = live_reaction_totals.wow_count + excluded.wow_count,
    insight_count = live_reaction_totals.insight_count + excluded.insight_count,
    celebrate_count = live_reaction_totals.celebrate_count + excluded.celebrate_count,
    version = live_reaction_totals.version + 1,
    updated_at = excluded.updated_at;
  return new;
end;
$$;

revoke all on function public.project_live_reaction_total() from public, anon, authenticated;

create trigger live_reactions_project_total
after insert on public.live_reactions
for each row execute function public.project_live_reaction_total();

create or replace function public.live_reaction_summary_payload(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select jsonb_build_object(
    'sessionId', requested.session_id,
    'totalCount', coalesce(total.total_count, 0),
    'version', coalesce(total.version, 0),
    'updatedAt', total.updated_at,
    'counts', jsonb_build_object(
      'heart', coalesce(total.heart_count, 0),
      'spark', coalesce(total.spark_count, 0),
      'applause', coalesce(total.applause_count, 0),
      'support', coalesce(total.support_count, 0),
      'joy', coalesce(total.joy_count, 0),
      'wow', coalesce(total.wow_count, 0),
      'insight', coalesce(total.insight_count, 0),
      'celebrate', coalesce(total.celebrate_count, 0)
    )
  )
  from (select p_session_id as session_id) requested
  left join public.live_reaction_totals total on total.session_id = requested.session_id;
$$;

revoke all on function public.live_reaction_summary_payload(uuid) from public, anon, authenticated;

create or replace function public.rpc_get_live_reaction_summary(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if not exists (
    select 1 from public.live_sessions session
    where session.id = p_session_id and session.status = 'live'
  ) or not public.has_live_capability(p_session_id, 'live.join') then
    raise exception 'live_reaction_summary_forbidden' using errcode = '42501';
  end if;

  return public.live_reaction_summary_payload(p_session_id);
end;
$$;

revoke all on function public.rpc_get_live_reaction_summary(uuid) from public, anon;
grant execute on function public.rpc_get_live_reaction_summary(uuid) to authenticated;

drop function public.rpc_create_live_reaction(uuid, uuid, text);

create function public.rpc_create_live_reaction(
  p_session_id uuid,
  p_client_event_id uuid,
  p_reaction text
)
returns jsonb
language plpgsql
security definer
set search_path = public, realtime, pg_catalog
set row_security = off
as $$
declare
  v_profile public.profiles;
  v_reaction public.live_reactions;
  v_created boolean := false;
  v_payload jsonb;
begin
  v_profile := public.live_active_profile(auth.uid());
  if not public.has_live_capability(p_session_id, 'live.react')
     or not exists (
       select 1 from public.live_sessions session
       where session.id = p_session_id and session.status = 'live'
     ) then
    raise exception 'live_reaction_forbidden' using errcode = '42501';
  end if;
  if p_reaction is null or p_reaction not in (
    'heart', 'spark', 'applause', 'support',
    'joy', 'wow', 'insight', 'celebrate'
  ) then
    raise exception 'live_reaction_invalid' using errcode = '22023';
  end if;

  -- Serialize one member's short rate-limit window so concurrent taps cannot
  -- bypass the limit or race the idempotency key.
  perform pg_advisory_xact_lock(
    hashtextextended(p_session_id::text || ':' || auth.uid()::text, 0)
  );

  select * into v_reaction
  from public.live_reactions
  where session_id = p_session_id
    and user_id = auth.uid()
    and client_event_id = p_client_event_id;

  if v_reaction.id is null then
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
    v_created := true;
  end if;

  v_payload := jsonb_build_object(
    'eventId', v_reaction.client_event_id,
    'sessionId', v_reaction.session_id,
    'reaction', v_reaction.reaction,
    'emittedAt', v_reaction.created_at,
    'summary', public.live_reaction_summary_payload(p_session_id)
  );

  if v_created then
    perform realtime.send(
      v_payload,
      'reaction',
      'live-reactions:' || p_session_id::text,
      true
    );
  end if;

  return v_payload;
end;
$$;

revoke all on function public.rpc_create_live_reaction(uuid, uuid, text) from public, anon;
grant execute on function public.rpc_create_live_reaction(uuid, uuid, text) to authenticated;

-- Aggregate reads are RPC-only. This preserves anonymous audience feedback
-- while retaining trusted server access to event rows for safety and recaps.
drop policy if exists live_reactions_select_scoped on public.live_reactions;
revoke select on public.live_reactions from authenticated;
grant select on public.live_reactions, public.live_reaction_totals to service_role;

alter table public.live_reaction_totals enable row level security;
revoke all on public.live_reaction_totals from public, anon, authenticated;

comment on table public.live_reaction_totals is
  'Server-owned anonymous aggregate projection for durable Live reaction totals and mix.';
comment on function public.rpc_get_live_reaction_summary(uuid) is
  'Returns the authorized anonymous reaction total and mix for one active Live room.';
comment on function public.rpc_create_live_reaction(uuid, uuid, text) is
  'Persists one idempotent reaction and returns/broadcasts its monotonic anonymous aggregate receipt.';
