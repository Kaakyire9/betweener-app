-- Phase 5: Audience Pulse.
-- Polls are deliberately created from server-owned templates so an audience
-- can shape a conversation without voting on attraction or romantic outcomes.

begin;

alter table public.live_session_capability_assignments
  drop constraint if exists live_capability_name_valid;

alter table public.live_session_capability_assignments
  add constraint live_capability_name_valid check (capability in (
    'live.create_session','live.join','live.react','live.comment','live.report','live.block','live.request_seat',
    'live.publish','live.manage_stage','live.approve_seat_request','live.moderate_comments',
    'live.mute_public_participant','live.remove_participant','live.suspend_participant',
    'live.suggest_match','live.create_match_round','live.manage_audience_pulse',
    'live.start_session','live.end_session','live.terminate_private_spark',
    'live.view_host_console','live.view_safety_console','live.emergency_terminate'
  ));

create or replace function public.live_role_capabilities(p_role text)
returns text[]
language sql
immutable
set search_path = public, pg_catalog
as $$
  select case lower(coalesce(p_role, ''))
    when 'audience' then array['live.join','live.react','live.comment','live.report','live.block','live.request_seat']::text[]
    when 'participant' then array['live.join','live.react','live.comment','live.report','live.block','live.request_seat','live.publish']::text[]
    when 'matchmaker' then array['live.join','live.react','live.comment','live.report','live.block','live.request_seat','live.suggest_match','live.create_match_round','live.manage_audience_pulse','live.view_host_console']::text[]
    when 'moderator' then array['live.join','live.react','live.comment','live.report','live.block','live.request_seat','live.manage_audience_pulse','live.moderate_comments','live.mute_public_participant','live.remove_participant','live.suspend_participant','live.terminate_private_spark','live.view_safety_console']::text[]
    when 'host' then array['live.create_session','live.join','live.react','live.comment','live.report','live.block','live.request_seat','live.publish','live.manage_stage','live.approve_seat_request','live.manage_audience_pulse','live.moderate_comments','live.mute_public_participant','live.remove_participant','live.suspend_participant','live.terminate_private_spark','live.suggest_match','live.create_match_round','live.start_session','live.end_session','live.view_host_console','live.view_safety_console']::text[]
    when 'internal_admin' then array['live.join','live.report','live.manage_audience_pulse','live.moderate_comments','live.mute_public_participant','live.remove_participant','live.suspend_participant','live.terminate_private_spark','live.view_safety_console','live.emergency_terminate']::text[]
    else array[]::text[]
  end;
$$;

create table public.live_audience_poll_templates (
  template_key text primary key,
  poll_kind text not null,
  prompt text not null,
  options jsonb not null,
  display_order smallint not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint live_audience_poll_template_key_valid
    check (template_key ~ '^[a-z0-9_]{3,64}$'),
  constraint live_audience_poll_template_kind_valid
    check (poll_kind in ('question_poll','room_poll')),
  constraint live_audience_poll_template_prompt_valid
    check (char_length(btrim(prompt)) between 8 and 180),
  constraint live_audience_poll_template_options_valid check (
    jsonb_typeof(options) = 'array'
    and jsonb_array_length(options) between 2 and 4
  )
);

create table public.live_audience_polls (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  template_key text not null references public.live_audience_poll_templates(template_key) on delete restrict,
  poll_kind text not null,
  prompt text not null,
  state text not null default 'open',
  opened_by_user_id uuid not null references auth.users(id) on delete restrict,
  client_request_id uuid not null,
  opened_at timestamptz not null default timezone('utc', now()),
  closes_at timestamptz not null,
  closed_at timestamptz,
  constraint live_audience_poll_kind_valid
    check (poll_kind in ('question_poll','room_poll')),
  constraint live_audience_poll_state_valid
    check (state in ('open','closed','cancelled')),
  constraint live_audience_poll_time_valid check (
    closes_at > opened_at
    and closes_at <= opened_at + interval '5 minutes'
    and ((state = 'open' and closed_at is null) or (state <> 'open' and closed_at is not null))
  ),
  constraint live_audience_poll_request_unique
    unique (session_id, opened_by_user_id, client_request_id)
);

create unique index live_audience_polls_one_open_per_session
  on public.live_audience_polls(session_id)
  where state = 'open';

create index live_audience_polls_session_recent_idx
  on public.live_audience_polls(session_id, opened_at desc);

create table public.live_audience_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.live_audience_polls(id) on delete cascade,
  option_index smallint not null,
  label text not null,
  constraint live_audience_poll_option_index_valid check (option_index between 0 and 3),
  constraint live_audience_poll_option_label_valid check (char_length(btrim(label)) between 1 and 80),
  constraint live_audience_poll_option_position_unique unique (poll_id, option_index),
  constraint live_audience_poll_option_identity_unique unique (poll_id, id)
);

create table public.live_audience_poll_votes (
  poll_id uuid not null references public.live_audience_polls(id) on delete cascade,
  option_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_vote_id uuid not null,
  voted_at timestamptz not null default timezone('utc', now()),
  primary key (poll_id, user_id),
  constraint live_audience_poll_vote_option_fk
    foreign key (poll_id, option_id)
    references public.live_audience_poll_options(poll_id, id) on delete cascade,
  constraint live_audience_poll_vote_request_unique
    unique (poll_id, user_id, client_vote_id)
);

-- This one-row-per-room projection is the only poll relation replicated to
-- clients. Raw ballots never enter Realtime or a client-readable policy.
create table public.live_audience_poll_updates (
  session_id uuid primary key references public.live_sessions(id) on delete cascade,
  version bigint not null default 1,
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.bump_live_audience_poll_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_session_id uuid;
begin
  if tg_table_name = 'live_audience_poll_votes' then
    select poll.session_id into v_session_id
    from public.live_audience_polls poll
    where poll.id = case when tg_op = 'DELETE' then old.poll_id else new.poll_id end;
  else
    v_session_id := case when tg_op = 'DELETE' then old.session_id else new.session_id end;
  end if;

  if v_session_id is not null then
    insert into public.live_audience_poll_updates(session_id, version, updated_at)
    values(v_session_id, 1, timezone('utc', now()))
    on conflict (session_id) do update
      set version = public.live_audience_poll_updates.version + 1,
          updated_at = excluded.updated_at;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger live_audience_polls_bump_update
after insert or update or delete on public.live_audience_polls
for each row execute function public.bump_live_audience_poll_update();

create trigger live_audience_poll_votes_bump_update
after insert or update or delete on public.live_audience_poll_votes
for each row execute function public.bump_live_audience_poll_update();

insert into public.live_audience_poll_templates(
  template_key, poll_kind, prompt, options, display_order
)
values
  (
    'host_question_next_topic',
    'question_poll',
    'What should the host ask next?',
    '["What shaped you?","What are you building?","What brings you joy?"]'::jsonb,
    10
  ),
  (
    'room_relocation',
    'room_poll',
    'Would you relocate for the right relationship?',
    '["Yes","Maybe","No"]'::jsonb,
    20
  ),
  (
    'room_distance_foundation',
    'room_poll',
    'What makes distance feel worth it?',
    '["Shared direction","Consistent effort","A clear plan"]'::jsonb,
    30
  ),
  (
    'room_conversation_theme',
    'question_poll',
    'Which theme should the room explore?',
    '["Roots and identity","Everyday partnership","Future plans"]'::jsonb,
    40
  )
on conflict (template_key) do update set
  poll_kind = excluded.poll_kind,
  prompt = excluded.prompt,
  options = excluded.options,
  display_order = excluded.display_order,
  enabled = true,
  updated_at = timezone('utc', now());

create or replace function public.live_audience_poll_json(
  p_poll_id uuid,
  p_user_id uuid default auth.uid()
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  with selected_poll as (
    select poll.*,
      case
        when poll.state = 'open' and poll.closes_at <= timezone('utc', now()) then 'closed'
        else poll.state
      end as effective_state
    from public.live_audience_polls poll
    where poll.id = p_poll_id
  ), totals as (
    select vote.poll_id, count(*)::integer as total_votes
    from public.live_audience_poll_votes vote
    where vote.poll_id = p_poll_id
    group by vote.poll_id
  ), option_counts as (
    select option.id, option.poll_id, option.option_index, option.label,
      count(vote.user_id)::integer as vote_count
    from public.live_audience_poll_options option
    left join public.live_audience_poll_votes vote
      on vote.poll_id = option.poll_id and vote.option_id = option.id
    where option.poll_id = p_poll_id
    group by option.id, option.poll_id, option.option_index, option.label
  )
  select jsonb_build_object(
    'id', poll.id,
    'session_id', poll.session_id,
    'template_key', poll.template_key,
    'poll_kind', poll.poll_kind,
    'prompt', poll.prompt,
    'state', poll.effective_state,
    'opened_at', poll.opened_at,
    'closes_at', poll.closes_at,
    'closed_at', poll.closed_at,
    'total_votes', coalesce(total.total_votes, 0),
    'my_option_id', (
      select vote.option_id from public.live_audience_poll_votes vote
      where vote.poll_id = poll.id and vote.user_id = p_user_id
    ),
    'options', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', option.id,
        'option_index', option.option_index,
        'label', option.label,
        'vote_count', option.vote_count,
        'percentage', case
          when coalesce(total.total_votes, 0) = 0 then 0
          else round((option.vote_count::numeric * 100) / total.total_votes)
        end
      ) order by option.option_index)
      from option_counts option
    ), '[]'::jsonb)
  )
  from selected_poll poll
  left join totals total on total.poll_id = poll.id;
$$;

create or replace function public.rpc_get_live_audience_pulse(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_active_poll_id uuid;
  v_recent_poll_id uuid;
  v_can_manage boolean;
begin
  if auth.uid() is null or not public.can_view_live_session(p_session_id, auth.uid()) then
    raise exception 'live_audience_pulse_forbidden' using errcode = '42501';
  end if;

  v_can_manage := public.has_live_capability(
    p_session_id,
    'live.manage_audience_pulse',
    auth.uid()
  );

  select poll.id into v_active_poll_id
  from public.live_audience_polls poll
  where poll.session_id = p_session_id
    and poll.state = 'open'
    and poll.closes_at > timezone('utc', now())
  order by poll.opened_at desc
  limit 1;

  select poll.id into v_recent_poll_id
  from public.live_audience_polls poll
  where poll.session_id = p_session_id
    and poll.id is distinct from v_active_poll_id
  order by poll.opened_at desc
  limit 1;

  return jsonb_build_object(
    'canManage', v_can_manage,
    'templates', case when v_can_manage then coalesce((
      select jsonb_agg(jsonb_build_object(
        'template_key', template.template_key,
        'poll_kind', template.poll_kind,
        'prompt', template.prompt,
        'options', template.options
      ) order by template.display_order, template.template_key)
      from public.live_audience_poll_templates template
      where template.enabled
    ), '[]'::jsonb) else '[]'::jsonb end,
    'activePoll', case when v_active_poll_id is null then null
      else public.live_audience_poll_json(v_active_poll_id, auth.uid()) end,
    'recentPoll', case when v_recent_poll_id is null then null
      else public.live_audience_poll_json(v_recent_poll_id, auth.uid()) end
  );
end;
$$;

create or replace function public.rpc_open_live_audience_poll(
  p_session_id uuid,
  p_template_key text,
  p_client_request_id uuid,
  p_duration_seconds integer default 90
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_template public.live_audience_poll_templates;
  v_poll public.live_audience_polls;
  v_session public.live_sessions;
  v_duration integer := greatest(30, least(coalesce(p_duration_seconds, 90), 300));
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into v_poll
  from public.live_audience_polls poll
  where poll.session_id = p_session_id
    and poll.opened_by_user_id = auth.uid()
    and poll.client_request_id = p_client_request_id;
  if v_poll.id is not null then
    return public.live_audience_poll_json(v_poll.id, auth.uid());
  end if;

  select * into v_session
  from public.live_sessions session
  where session.id = p_session_id
  for update;

  if v_session.id is null then
    raise exception 'live_session_not_found' using errcode = 'P0002';
  end if;
  if v_session.status <> 'live'
     or not public.has_live_capability(
       p_session_id,
       'live.manage_audience_pulse',
       auth.uid()
     ) then
    raise exception 'live_audience_poll_manage_forbidden' using errcode = '42501';
  end if;

  -- The session lock serializes creators. Repeat the idempotency lookup after
  -- taking it so concurrent retries return the same canonical poll instead of
  -- racing the unique request constraint.
  select * into v_poll
  from public.live_audience_polls poll
  where poll.session_id = p_session_id
    and poll.opened_by_user_id = auth.uid()
    and poll.client_request_id = p_client_request_id;
  if v_poll.id is not null then
    return public.live_audience_poll_json(v_poll.id, auth.uid());
  end if;

  update public.live_audience_polls poll
  set state = 'closed', closed_at = timezone('utc', now())
  where poll.session_id = p_session_id
    and poll.state = 'open'
    and poll.closes_at <= timezone('utc', now());

  if exists(
    select 1 from public.live_audience_polls poll
    where poll.session_id = p_session_id and poll.state = 'open'
  ) then
    raise exception 'live_audience_poll_already_open' using errcode = '23514';
  end if;

  select * into v_template
  from public.live_audience_poll_templates template
  where template.template_key = p_template_key and template.enabled;
  if v_template.template_key is null then
    raise exception 'live_audience_poll_template_invalid' using errcode = '22023';
  end if;

  insert into public.live_audience_polls(
    session_id, template_key, poll_kind, prompt, opened_by_user_id,
    client_request_id, closes_at
  ) values (
    p_session_id, v_template.template_key, v_template.poll_kind,
    v_template.prompt, auth.uid(), p_client_request_id,
    timezone('utc', now()) + make_interval(secs => v_duration)
  ) returning * into v_poll;

  insert into public.live_audience_poll_options(poll_id, option_index, label)
  select v_poll.id, (option.ordinality - 1)::smallint, btrim(option.label)
  from jsonb_array_elements_text(v_template.options) with ordinality as option(label, ordinality);

  insert into public.live_session_events(
    session_id, actor_user_id, event_type, metadata
  ) values (
    p_session_id, auth.uid(), 'audience_poll_opened',
    jsonb_build_object(
      'pollId', v_poll.id,
      'templateKey', v_template.template_key,
      'pollKind', v_template.poll_kind,
      'durationSeconds', v_duration
    )
  );

  return public.live_audience_poll_json(v_poll.id, auth.uid());
end;
$$;

create or replace function public.rpc_vote_live_audience_poll(
  p_poll_id uuid,
  p_option_id uuid,
  p_client_vote_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_poll public.live_audience_polls;
  v_existing_option_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into v_poll
  from public.live_audience_polls poll
  where poll.id = p_poll_id
  for update;

  if v_poll.id is null then
    raise exception 'live_audience_poll_not_found' using errcode = 'P0002';
  end if;
  if v_poll.state <> 'open' or v_poll.closes_at <= timezone('utc', now()) then
    raise exception 'live_audience_poll_closed' using errcode = '23514';
  end if;
  if not public.can_view_live_session(v_poll.session_id, auth.uid())
     or not exists(
       select 1 from public.live_participants participant
       where participant.session_id = v_poll.session_id
         and participant.user_id = auth.uid()
         and participant.state in (
           'backstage','audience','stage_requested','on_stage',
           'private_spark','temporarily_disconnected'
         )
     ) then
    raise exception 'live_audience_poll_vote_forbidden' using errcode = '42501';
  end if;
  if not exists(
    select 1 from public.live_audience_poll_options option
    where option.poll_id = v_poll.id and option.id = p_option_id
  ) then
    raise exception 'live_audience_poll_option_invalid' using errcode = '22023';
  end if;

  select vote.option_id into v_existing_option_id
  from public.live_audience_poll_votes vote
  where vote.poll_id = v_poll.id and vote.user_id = auth.uid();

  if v_existing_option_id is not null then
    if v_existing_option_id <> p_option_id then
      raise exception 'live_audience_poll_vote_locked' using errcode = '23514';
    end if;
    return public.live_audience_poll_json(v_poll.id, auth.uid());
  end if;

  insert into public.live_audience_poll_votes(
    poll_id, option_id, user_id, client_vote_id
  ) values (v_poll.id, p_option_id, auth.uid(), p_client_vote_id)
  on conflict (poll_id, user_id) do nothing;

  return public.live_audience_poll_json(v_poll.id, auth.uid());
end;
$$;

create or replace function public.rpc_close_live_audience_poll(p_poll_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_poll public.live_audience_polls;
  v_changed boolean := false;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into v_poll
  from public.live_audience_polls poll
  where poll.id = p_poll_id
  for update;

  if v_poll.id is null then
    raise exception 'live_audience_poll_not_found' using errcode = 'P0002';
  end if;
  if not public.has_live_capability(
    v_poll.session_id,
    'live.manage_audience_pulse',
    auth.uid()
  ) then
    raise exception 'live_audience_poll_manage_forbidden' using errcode = '42501';
  end if;

  if v_poll.state = 'open' then
    update public.live_audience_polls poll
    set state = 'closed', closed_at = timezone('utc', now())
    where poll.id = v_poll.id
    returning * into v_poll;
    v_changed := true;
  end if;

  if v_changed then
    insert into public.live_session_events(
      session_id, actor_user_id, event_type, metadata
    ) values (
      v_poll.session_id, auth.uid(), 'audience_poll_closed',
      jsonb_build_object('pollId', v_poll.id, 'pollKind', v_poll.poll_kind)
    );
  end if;

  return public.live_audience_poll_json(v_poll.id, auth.uid());
end;
$$;

create or replace function public.rpc_get_live_room_pulse(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
  select jsonb_build_object(
    'commentCount', (
      select count(*) from public.live_comments comment
      where comment.session_id = p_session_id and comment.status = 'visible'
    ),
    'comments', public.rpc_list_live_comments(p_session_id, 40, null),
    'audiencePulse', public.rpc_get_live_audience_pulse(p_session_id)
  )
  where auth.uid() is not null
    and public.can_view_live_session(p_session_id, auth.uid());
$$;

alter table public.live_audience_poll_templates enable row level security;
alter table public.live_audience_polls enable row level security;
alter table public.live_audience_poll_options enable row level security;
alter table public.live_audience_poll_votes enable row level security;
alter table public.live_audience_poll_updates enable row level security;

create policy live_audience_poll_updates_select_scoped
on public.live_audience_poll_updates
for select to authenticated
using (public.can_view_live_session(session_id, auth.uid()));

revoke all on table public.live_audience_poll_templates,
  public.live_audience_polls,
  public.live_audience_poll_options,
  public.live_audience_poll_votes,
  public.live_audience_poll_updates
from public, anon, authenticated;

grant select on table public.live_audience_poll_updates to authenticated;

revoke all on function public.bump_live_audience_poll_update(),
  public.live_audience_poll_json(uuid, uuid),
  public.rpc_get_live_audience_pulse(uuid),
  public.rpc_open_live_audience_poll(uuid, text, uuid, integer),
  public.rpc_vote_live_audience_poll(uuid, uuid, uuid),
  public.rpc_close_live_audience_poll(uuid)
from public, anon, authenticated;

grant execute on function public.rpc_get_live_audience_pulse(uuid),
  public.rpc_open_live_audience_poll(uuid, text, uuid, integer),
  public.rpc_vote_live_audience_poll(uuid, uuid, uuid),
  public.rpc_close_live_audience_poll(uuid)
to authenticated;

do $$
begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists(
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'live_audience_poll_updates'
     ) then
    alter publication supabase_realtime add table public.live_audience_poll_updates;
  end if;
end;
$$;

commit;
