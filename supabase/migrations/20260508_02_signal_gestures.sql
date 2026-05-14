create table if not exists public.profile_signal_gestures (
  id uuid primary key default gen_random_uuid(),
  sender_profile_id uuid not null references public.profiles(id) on delete cascade,
  receiver_profile_id uuid not null references public.profiles(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  receiver_user_id uuid not null references auth.users(id) on delete cascade,
  reason_key text not null,
  reason_label text not null,
  note text null,
  source text not null default 'profile',
  source_moment_id uuid null,
  status text not null default 'sent',
  expires_at timestamptz not null default now() + interval '48 hours',
  seen_at timestamptz null,
  responded_at timestamptz null,
  dismissed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_signal_gestures_no_self check (sender_profile_id <> receiver_profile_id),
  constraint profile_signal_gestures_reason_key_len check (char_length(reason_key) between 2 and 80),
  constraint profile_signal_gestures_reason_label_len check (char_length(reason_label) <= 120),
  constraint profile_signal_gestures_note_len check (note is null or char_length(note) <= 120),
  constraint profile_signal_gestures_source_valid check (source in ('vibes_card', 'profile', 'moment', 'intent')),
  constraint profile_signal_gestures_status_valid check (status in ('sent', 'seen', 'responded', 'expired', 'dismissed'))
);

create index if not exists profile_signal_gestures_receiver_active_idx
  on public.profile_signal_gestures (receiver_profile_id, status, expires_at desc);
create index if not exists profile_signal_gestures_sender_created_idx
  on public.profile_signal_gestures (sender_profile_id, created_at desc);
create index if not exists profile_signal_gestures_pair_status_idx
  on public.profile_signal_gestures (sender_profile_id, receiver_profile_id, status);
create index if not exists profile_signal_gestures_expires_idx
  on public.profile_signal_gestures (expires_at);

create unique index if not exists profile_signal_gestures_one_active_pair_idx
  on public.profile_signal_gestures (sender_profile_id, receiver_profile_id)
  where status in ('sent', 'seen');

create or replace function public.set_profile_signal_gestures_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profile_signal_gestures_set_updated_at on public.profile_signal_gestures;
create trigger profile_signal_gestures_set_updated_at
before update on public.profile_signal_gestures
for each row execute function public.set_profile_signal_gestures_updated_at();

alter table public.profile_signal_gestures enable row level security;

drop policy if exists "Signal gestures select participants" on public.profile_signal_gestures;
create policy "Signal gestures select participants"
on public.profile_signal_gestures
for select
to authenticated
using (auth.uid() = sender_user_id or auth.uid() = receiver_user_id);

drop policy if exists "Signal gestures receiver update state" on public.profile_signal_gestures;
create policy "Signal gestures receiver update state"
on public.profile_signal_gestures
for update
to authenticated
using (auth.uid() = receiver_user_id)
with check (auth.uid() = receiver_user_id);

create or replace function public.signal_reason_label(p_reason_key text)
returns text
language sql
immutable
as $$
  select case p_reason_key
    when 'energy_stood_out' then 'Your energy stood out'
    when 'feels_intentional' then 'This feels intentional'
    when 'shared_real_vibe' then 'We share a real vibe'
    when 'intro_caught_me' then 'Your intro caught me'
    when 'noticed_music' then 'I noticed your music'
    when 'profile_feels_different' then 'Your profile feels different'
    when 'moment_stood_out' then 'That Moment stood out'
    when 'story_caught_me' then 'Your story caught me'
    when 'music_overlap' then 'I felt the music overlap'
    when 'sparked_curiosity' then 'This sparked curiosity'
    when 'shared_interests' then 'I noticed our shared interests'
    else null
  end;
$$;

create or replace function public.signal_limit_for_plan(p_plan public.subscription_type)
returns integer
language sql
immutable
as $$
  select case p_plan
    when 'GOLD' then 7
    when 'SILVER' then 3
    else 1
  end;
$$;

create or replace function public.rpc_get_signal_access()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_plan public.subscription_type := 'FREE';
  v_limit integer := 0;
  v_used integer := 0;
  v_period_start timestamptz := date_trunc('week', timezone('utc', now())) at time zone 'utc';
begin
  if v_user_id is null then
    return jsonb_build_object('plan', 'FREE', 'limit', 0, 'used', 0, 'remaining', 0, 'can_send', false);
  end if;

  select id into v_profile_id
  from public.profiles
  where user_id = v_user_id
  limit 1;

  v_plan := public.get_active_subscription_plan(v_user_id);
  v_limit := public.signal_limit_for_plan(v_plan);

  if v_profile_id is not null and v_plan = 'FREE' then
    select count(*)::integer into v_used
    from public.profile_signal_gestures
    where sender_profile_id = v_profile_id;
  elsif v_profile_id is not null then
    select count(*)::integer into v_used
    from public.profile_signal_gestures
    where sender_profile_id = v_profile_id
      and created_at >= v_period_start;
  end if;

  return jsonb_build_object(
    'plan', v_plan,
    'limit', v_limit,
    'used', coalesce(v_used, 0),
    'remaining', greatest(v_limit - coalesce(v_used, 0), 0),
    'can_send', v_limit > coalesce(v_used, 0)
  );
end;
$$;

create or replace function public.rpc_send_signal(
  p_receiver_profile_id uuid,
  p_reason_key text,
  p_note text default null,
  p_source text default 'profile',
  p_source_moment_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_sender_profile public.profiles%rowtype;
  v_receiver_profile public.profiles%rowtype;
  v_plan public.subscription_type := 'FREE';
  v_limit integer := 0;
  v_used integer := 0;
  v_remaining integer := 0;
  v_period_start timestamptz := date_trunc('week', timezone('utc', now())) at time zone 'utc';
  v_reason_key text := btrim(coalesce(p_reason_key, ''));
  v_reason_label text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_source text := coalesce(nullif(btrim(p_source), ''), 'profile');
  v_signal public.profile_signal_gestures%rowtype;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  select * into v_sender_profile
  from public.profiles
  where user_id = v_user_id
  limit 1;

  if v_sender_profile.id is null then
    raise exception 'profile_not_found';
  end if;

  select * into v_receiver_profile
  from public.profiles
  where id = p_receiver_profile_id
  limit 1;

  if v_receiver_profile.id is null then
    raise exception 'receiver_not_found';
  end if;

  if v_sender_profile.id = v_receiver_profile.id then
    raise exception 'self_signal_not_allowed';
  end if;

  if v_receiver_profile.user_id is null then
    raise exception 'receiver_not_found';
  end if;

  if exists (
    select 1
    from public.blocks b
    where (b.blocker_id = v_user_id and b.blocked_id = v_receiver_profile.user_id)
       or (b.blocker_id = v_receiver_profile.user_id and b.blocked_id = v_user_id)
  ) then
    raise exception 'blocked_or_unavailable';
  end if;

  if v_source not in ('vibes_card', 'profile', 'moment', 'intent') then
    raise exception 'invalid_source';
  end if;

  v_reason_label := public.signal_reason_label(v_reason_key);
  if v_reason_label is null then
    raise exception 'invalid_reason';
  end if;

  if v_note is not null and char_length(v_note) > 120 then
    raise exception 'invalid_note';
  end if;

  update public.profile_signal_gestures
  set status = 'expired'
  where sender_profile_id = v_sender_profile.id
    and receiver_profile_id = v_receiver_profile.id
    and status in ('sent', 'seen')
    and expires_at <= now();

  if exists (
    select 1
    from public.profile_signal_gestures
    where sender_profile_id = v_sender_profile.id
      and receiver_profile_id = v_receiver_profile.id
      and status in ('sent', 'seen')
      and expires_at > now()
  ) then
    raise exception 'duplicate_active_signal';
  end if;

  v_plan := public.get_active_subscription_plan(v_user_id);
  v_limit := public.signal_limit_for_plan(v_plan);

  if v_plan = 'FREE' then
    select count(*)::integer into v_used
    from public.profile_signal_gestures
    where sender_profile_id = v_sender_profile.id;
  else
    select count(*)::integer into v_used
    from public.profile_signal_gestures
    where sender_profile_id = v_sender_profile.id
      and created_at >= v_period_start;
  end if;

  if coalesce(v_used, 0) >= v_limit then
    if v_plan = 'FREE' then
      raise exception 'premium_required';
    else
      raise exception 'signal_quota_exceeded';
    end if;
  end if;

  insert into public.profile_signal_gestures (
    sender_profile_id,
    receiver_profile_id,
    sender_user_id,
    receiver_user_id,
    reason_key,
    reason_label,
    note,
    source,
    source_moment_id
  )
  values (
    v_sender_profile.id,
    v_receiver_profile.id,
    v_user_id,
    v_receiver_profile.user_id,
    v_reason_key,
    v_reason_label,
    v_note,
    v_source,
    p_source_moment_id
  )
  returning * into v_signal;

  v_remaining := greatest(v_limit - coalesce(v_used, 0) - 1, 0);

  insert into public.system_messages (
    user_id,
    peer_user_id,
    intent_request_id,
    event_type,
    text,
    metadata
  )
  values (
    v_receiver_profile.user_id,
    v_user_id,
    null,
    'signal_received',
    coalesce(v_sender_profile.full_name, 'Someone') || ' sent you a Signal.',
    jsonb_build_object(
      'signal_id', v_signal.id,
      'sender_profile_id', v_sender_profile.id,
      'receiver_profile_id', v_receiver_profile.id,
      'reason_key', v_reason_key,
      'reason_label', v_reason_label,
      'source', v_source,
      'expires_at', v_signal.expires_at
    )
  );

  return jsonb_build_object(
    'ok', true,
    'signal', jsonb_build_object(
      'id', v_signal.id,
      'reason_key', v_signal.reason_key,
      'reason', v_signal.reason_label,
      'note', v_signal.note,
      'expires_at', v_signal.expires_at
    ),
    'remainingSignals', v_remaining
  );
end;
$$;

create or replace function public.rpc_cancel_signal(
  p_signal_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated';
  end if;

  update public.profile_signal_gestures
  set status = 'dismissed',
      dismissed_at = now()
  where id = p_signal_id
    and sender_user_id = auth.uid()
    and status in ('sent', 'seen')
  returning id into v_id;

  if v_id is null then
    raise exception 'signal_not_cancellable';
  end if;

  return v_id;
end;
$$;

grant execute on function public.rpc_get_signal_access() to authenticated;
grant execute on function public.rpc_send_signal(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.rpc_cancel_signal(uuid) to authenticated;
