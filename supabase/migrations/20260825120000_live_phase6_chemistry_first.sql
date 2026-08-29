-- Betweener Live Phase 6: Chemistry First.
-- Readiness is private: clients can read their own decision and the shared
-- reveal state, but never the other participant's readiness.

begin;

create table public.live_chemistry_conversations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  source_kind text not null,
  source_id uuid not null,
  participant_a_user_id uuid not null references auth.users(id) on delete cascade,
  participant_a_profile_id uuid not null references public.profiles(id) on delete cascade,
  participant_b_user_id uuid not null references auth.users(id) on delete cascade,
  participant_b_profile_id uuid not null references public.profiles(id) on delete cascade,
  state text not null default 'concealed',
  reveal_offered_at timestamptz,
  mutually_ready_at timestamptz,
  revealed_at timestamptz,
  ended_at timestamptz,
  version bigint not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint live_chemistry_source_valid check (source_kind in ('private_spark','quick_connect')),
  constraint live_chemistry_state_valid check (state in ('concealed','revealed','ended')),
  constraint live_chemistry_users_distinct check (participant_a_user_id <> participant_b_user_id),
  constraint live_chemistry_profiles_distinct check (participant_a_profile_id <> participant_b_profile_id),
  constraint live_chemistry_source_unique unique (source_kind, source_id),
  constraint live_chemistry_reveal_coherent check (
    (state = 'revealed' and mutually_ready_at is not null and revealed_at is not null)
    or state <> 'revealed'
  )
);

create table public.live_chemistry_readiness (
  conversation_id uuid not null references public.live_chemistry_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ready_at timestamptz not null default timezone('utc', now()),
  primary key (conversation_id, user_id)
);

create table public.live_chemistry_events (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.live_chemistry_conversations(id) on delete cascade,
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint live_chemistry_event_type_valid check (event_type in (
    'created','reveal_offered','participant_ready','mutual_reveal','ended'
  )),
  constraint live_chemistry_event_metadata_object check (jsonb_typeof(metadata) = 'object')
);

-- Realtime clients subscribe to this content-free invalidation row. They must
-- never subscribe to readiness rows because that would disclose who is
-- delaying the reveal.
create table public.live_chemistry_updates (
  conversation_id uuid primary key references public.live_chemistry_conversations(id) on delete cascade,
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  version bigint not null default 1,
  updated_at timestamptz not null default timezone('utc', now())
);

create index live_chemistry_session_idx
  on public.live_chemistry_conversations(session_id, updated_at desc);
create index live_chemistry_events_conversation_idx
  on public.live_chemistry_events(conversation_id, created_at desc);

create trigger live_chemistry_conversations_set_updated_at
before update on public.live_chemistry_conversations
for each row execute function public.set_updated_at();

create or replace function public.enforce_live_chemistry_transition()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if new.state = old.state then return new; end if;
  if not (
    (old.state = 'concealed' and new.state in ('revealed','ended'))
    or (old.state = 'revealed' and new.state = 'ended')
  ) then
    raise exception 'invalid_live_chemistry_transition:%:%', old.state, new.state
      using errcode = '23514';
  end if;
  new.version := old.version + 1;
  return new;
end;
$$;

create trigger live_chemistry_transition_guard
before update of state on public.live_chemistry_conversations
for each row execute function public.enforce_live_chemistry_transition();

create or replace function public.bump_live_chemistry_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_conversation public.live_chemistry_conversations;
begin
  select * into v_conversation
  from public.live_chemistry_conversations c
  where c.id = case
    when tg_table_name = 'live_chemistry_conversations' then new.id
    else new.conversation_id
  end;

  insert into public.live_chemistry_updates(conversation_id, session_id, version)
  values(v_conversation.id, v_conversation.session_id, 1)
  on conflict(conversation_id) do update set
    version = public.live_chemistry_updates.version + 1,
    updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger live_chemistry_conversation_bump
after insert or update on public.live_chemistry_conversations
for each row execute function public.bump_live_chemistry_update();

create trigger live_chemistry_readiness_bump
after insert or update on public.live_chemistry_readiness
for each row execute function public.bump_live_chemistry_update();

create or replace function public.live_chemistry_private_projection(p_conversation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_conversation public.live_chemistry_conversations;
  v_user_id uuid := auth.uid();
  v_other_profile public.profiles;
  v_my_ready boolean;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into v_conversation
  from public.live_chemistry_conversations c
  where c.id = p_conversation_id
    and v_user_id in (c.participant_a_user_id, c.participant_b_user_id);

  if v_conversation.id is null then
    raise exception 'live_chemistry_unavailable' using errcode = 'P0002';
  end if;

  select p.* into v_other_profile
  from public.profiles p
  where p.id = case
    when v_user_id = v_conversation.participant_a_user_id
      then v_conversation.participant_b_profile_id
    else v_conversation.participant_a_profile_id
  end;

  select exists (
    select 1 from public.live_chemistry_readiness r
    where r.conversation_id = v_conversation.id and r.user_id = v_user_id
  ) into v_my_ready;

  return jsonb_build_object(
    'id', v_conversation.id,
    'session_id', v_conversation.session_id,
    'source_kind', v_conversation.source_kind,
    'source_id', v_conversation.source_id,
    'state', v_conversation.state,
    'my_ready', v_my_ready,
    'reveal_offered_at', v_conversation.reveal_offered_at,
    'revealed_at', v_conversation.revealed_at,
    'version', v_conversation.version,
    'other_person_context', jsonb_build_object(
      'full_name', v_other_profile.full_name,
      'age', v_other_profile.age,
      'city', coalesce(v_other_profile.city, v_other_profile.location),
      'looking_for', v_other_profile.looking_for,
      'values', coalesce(v_other_profile.relationship_compass -> 'values', '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.rpc_get_live_chemistry_for_private_spark(p_private_spark_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_spark public.live_private_sparks;
  v_session public.live_sessions;
  v_conversation_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into v_spark from public.live_private_sparks s
  where s.id = p_private_spark_id
    and v_user_id in (s.participant_a_user_id, s.participant_b_user_id);
  if v_spark.id is null then
    raise exception 'live_private_spark_admission_denied' using errcode = '42501';
  end if;

  select * into v_session from public.live_sessions s where s.id = v_spark.session_id;
  if not coalesce(v_session.chemistry_first_enabled, false) then return null; end if;

  insert into public.live_chemistry_conversations(
    session_id, source_kind, source_id,
    participant_a_user_id, participant_a_profile_id,
    participant_b_user_id, participant_b_profile_id
  ) values (
    v_spark.session_id, 'private_spark', v_spark.id,
    v_spark.participant_a_user_id, v_spark.participant_a_profile_id,
    v_spark.participant_b_user_id, v_spark.participant_b_profile_id
  )
  on conflict (source_kind, source_id) do update
    set updated_at = public.live_chemistry_conversations.updated_at
  returning id into v_conversation_id;

  if not exists (
    select 1 from public.live_chemistry_events e
    where e.conversation_id = v_conversation_id and e.event_type = 'created'
  ) then
    insert into public.live_chemistry_events(conversation_id,session_id,event_type)
    values(v_conversation_id,v_spark.session_id,'created');
  end if;

  return public.live_chemistry_private_projection(v_conversation_id);
end;
$$;

create or replace function public.rpc_offer_live_chemistry_reveal(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare v_conversation public.live_chemistry_conversations; v_user_id uuid := auth.uid();
begin
  select * into v_conversation from public.live_chemistry_conversations c
  where c.id = p_conversation_id for update;
  if v_user_id is null or v_user_id not in (
    v_conversation.participant_a_user_id, v_conversation.participant_b_user_id
  ) then raise exception 'live_chemistry_forbidden' using errcode = '42501'; end if;
  if v_conversation.state = 'concealed' and v_conversation.reveal_offered_at is null then
    update public.live_chemistry_conversations
    set reveal_offered_at = timezone('utc', now()) where id = v_conversation.id;
    insert into public.live_chemistry_events(conversation_id,session_id,actor_user_id,event_type)
    values(v_conversation.id,v_conversation.session_id,v_user_id,'reveal_offered');
  end if;
  return public.live_chemistry_private_projection(v_conversation.id);
end;
$$;

create or replace function public.rpc_set_live_chemistry_ready(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_conversation public.live_chemistry_conversations;
  v_user_id uuid := auth.uid();
  v_ready_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_conversation_id::text, 0));
  select * into v_conversation from public.live_chemistry_conversations c
  where c.id = p_conversation_id for update;
  if v_user_id is null or v_user_id not in (
    v_conversation.participant_a_user_id, v_conversation.participant_b_user_id
  ) then raise exception 'live_chemistry_forbidden' using errcode = '42501'; end if;
  if v_conversation.state = 'ended' then
    raise exception 'live_chemistry_ended' using errcode = '23514';
  end if;
  if v_conversation.state = 'concealed'
    and v_conversation.reveal_offered_at is null then
    raise exception 'live_chemistry_reveal_not_offered' using errcode = '23514';
  end if;

  insert into public.live_chemistry_readiness(conversation_id,user_id)
  values(v_conversation.id,v_user_id) on conflict do nothing;
  if found then
    insert into public.live_chemistry_events(conversation_id,session_id,actor_user_id,event_type)
    values(v_conversation.id,v_conversation.session_id,v_user_id,'participant_ready');
  end if;

  select count(*) into v_ready_count from public.live_chemistry_readiness r
  where r.conversation_id = v_conversation.id
    and r.user_id in (v_conversation.participant_a_user_id,v_conversation.participant_b_user_id);

  if v_ready_count = 2 and v_conversation.state = 'concealed' then
    update public.live_chemistry_conversations
    set state='revealed', mutually_ready_at=timezone('utc',now()),
        revealed_at=timezone('utc',now())
    where id=v_conversation.id;
    insert into public.live_chemistry_events(conversation_id,session_id,event_type)
    values(v_conversation.id,v_conversation.session_id,'mutual_reveal');
  end if;
  return public.live_chemistry_private_projection(v_conversation.id);
end;
$$;

alter table public.live_chemistry_conversations enable row level security;
alter table public.live_chemistry_readiness enable row level security;
alter table public.live_chemistry_events enable row level security;
alter table public.live_chemistry_updates enable row level security;

create policy "Chemistry participants can read shared state"
on public.live_chemistry_conversations for select to authenticated
using (auth.uid() in (participant_a_user_id,participant_b_user_id));

create policy "Chemistry participants can observe private invalidations"
on public.live_chemistry_updates for select to authenticated
using (exists (
  select 1 from public.live_chemistry_conversations c
  where c.id = live_chemistry_updates.conversation_id
    and auth.uid() in (c.participant_a_user_id, c.participant_b_user_id)
));

revoke all on public.live_chemistry_conversations, public.live_chemistry_readiness,
  public.live_chemistry_events, public.live_chemistry_updates from anon, authenticated;
grant select on public.live_chemistry_conversations, public.live_chemistry_updates to authenticated;
grant all on public.live_chemistry_conversations, public.live_chemistry_readiness,
  public.live_chemistry_events, public.live_chemistry_updates to service_role;

revoke all on function public.enforce_live_chemistry_transition()
from public, anon, authenticated;
revoke all on function public.bump_live_chemistry_update()
from public, anon, authenticated;
revoke all on function public.live_chemistry_private_projection(uuid)
from public, anon, authenticated;
revoke all on function public.rpc_get_live_chemistry_for_private_spark(uuid),
  public.rpc_offer_live_chemistry_reveal(uuid),
  public.rpc_set_live_chemistry_ready(uuid)
from public, anon, authenticated;
grant execute on function public.rpc_get_live_chemistry_for_private_spark(uuid) to authenticated;
grant execute on function public.rpc_offer_live_chemistry_reveal(uuid) to authenticated;
grant execute on function public.rpc_set_live_chemistry_ready(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'live_chemistry_updates'
    ) then
    alter publication supabase_realtime add table public.live_chemistry_updates;
  end if;
end;
$$;

commit;
