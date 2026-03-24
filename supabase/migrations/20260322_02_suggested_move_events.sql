create table if not exists public.suggested_move_events (
  id uuid primary key default gen_random_uuid(),
  viewer_user_id uuid not null references auth.users(id) on delete cascade,
  viewer_profile_id uuid not null references public.profiles(id) on delete cascade,
  candidate_profile_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in (
    'impression',
    'preview_profile',
    'opener_revealed',
    'intent_opened',
    'intent_sent'
  )),
  surface text not null default 'intent_suggested',
  batch_key text,
  slot_index integer,
  is_hero boolean,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint suggested_move_events_distinct_profiles check (viewer_profile_id <> candidate_profile_id)
);

create index if not exists suggested_move_events_viewer_created_idx
  on public.suggested_move_events (viewer_profile_id, created_at desc);

create index if not exists suggested_move_events_candidate_event_idx
  on public.suggested_move_events (candidate_profile_id, event_type, created_at desc);

create index if not exists suggested_move_events_batch_idx
  on public.suggested_move_events (batch_key, created_at desc);

alter table public.suggested_move_events enable row level security;

revoke all on public.suggested_move_events from anon, authenticated;

drop function if exists public.rpc_log_suggested_move_event(uuid, uuid, text, text, text, integer, boolean, jsonb);

create or replace function public.rpc_log_suggested_move_event(
  p_viewer_profile_id uuid,
  p_candidate_profile_id uuid,
  p_event_type text,
  p_surface text default 'intent_suggested',
  p_batch_key text default null,
  p_slot_index integer default null,
  p_is_hero boolean default null,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if p_event_type not in ('impression', 'preview_profile', 'opener_revealed', 'intent_opened', 'intent_sent') then
    raise exception 'invalid suggested move event type';
  end if;

  if p_viewer_profile_id is null or p_candidate_profile_id is null or p_viewer_profile_id = p_candidate_profile_id then
    return false;
  end if;

  select p.user_id
    into v_user_id
  from public.profiles p
  where p.id = p_viewer_profile_id
  limit 1;

  if v_user_id is null or v_user_id <> auth.uid() then
    raise exception 'viewer profile does not belong to authenticated user';
  end if;

  insert into public.suggested_move_events (
    viewer_user_id,
    viewer_profile_id,
    candidate_profile_id,
    event_type,
    surface,
    batch_key,
    slot_index,
    is_hero,
    metadata
  )
  values (
    auth.uid(),
    p_viewer_profile_id,
    p_candidate_profile_id,
    p_event_type,
    coalesce(nullif(btrim(p_surface), ''), 'intent_suggested'),
    nullif(btrim(p_batch_key), ''),
    p_slot_index,
    p_is_hero,
    coalesce(p_metadata, '{}'::jsonb)
  );

  return true;
end;
$$;

revoke all on function public.rpc_log_suggested_move_event(uuid, uuid, text, text, text, integer, boolean, jsonb) from public;
grant execute on function public.rpc_log_suggested_move_event(uuid, uuid, text, text, text, integer, boolean, jsonb) to authenticated;
