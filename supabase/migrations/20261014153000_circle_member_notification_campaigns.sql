-- Durable, member-scoped Circle notification campaigns. Activity is queued by
-- cron and never fans out inside a membership or Live lifecycle transaction.

create table if not exists public.circle_member_notification_preferences (
  circle_id uuid not null references public.circles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_level text not null default 'important_only',
  live_notifications boolean not null default true,
  gathering_reminders boolean not null default true,
  discussion_activity boolean not null default true,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key(circle_id, user_id),
  constraint circle_member_notification_level_valid
    check (notification_level in ('all_activity', 'important_only', 'muted'))
);

alter table public.circle_member_notification_preferences enable row level security;
alter table public.circle_member_notification_preferences force row level security;
drop policy if exists circle_member_notification_preferences_self on public.circle_member_notification_preferences;
create policy circle_member_notification_preferences_self
on public.circle_member_notification_preferences
for all to authenticated
using (user_id = auth.uid() and public.is_circle_member(circle_id, auth.uid()))
with check (user_id = auth.uid() and public.is_circle_member(circle_id, auth.uid()));
revoke all on table public.circle_member_notification_preferences from public, anon;
grant select, insert, update, delete on table public.circle_member_notification_preferences to authenticated;
grant all on table public.circle_member_notification_preferences to service_role;

create table if not exists public.circle_notification_campaigns (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  session_id uuid references public.live_sessions(id) on delete cascade,
  gathering_id uuid references public.gatherings(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  kind text not null,
  revision bigint not null default 0,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  constraint circle_notification_campaign_kind_valid
    check (kind in ('live_starting_soon', 'live_now', 'gathering_starting_soon')),
  constraint circle_notification_campaign_status_valid
    check (status in ('pending', 'processing', 'completed', 'cancelled')),
  constraint circle_notification_campaign_data_valid check (jsonb_typeof(data) = 'object'),
  unique(session_id, kind, revision),
  unique(gathering_id, kind, revision)
);

create table if not exists public.circle_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.circle_notification_campaigns(id) on delete cascade,
  circle_id uuid not null references public.circles(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default timezone('utc', now()),
  dispatched_at timestamptz,
  seen_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint circle_notification_delivery_status_valid
    check (status in ('pending', 'processing', 'dispatched', 'failed', 'cancelled')),
  constraint circle_notification_delivery_attempt_valid check (attempt_count >= 0),
  unique(campaign_id, recipient_user_id)
);

create index if not exists circle_notification_deliveries_dispatch_idx
  on public.circle_notification_deliveries(status, next_attempt_at, created_at)
  where status in ('pending', 'failed');
create index if not exists circle_notification_deliveries_recipient_idx
  on public.circle_notification_deliveries(recipient_user_id, created_at desc);

alter table public.circle_notification_campaigns enable row level security;
alter table public.circle_notification_campaigns force row level security;
alter table public.circle_notification_deliveries enable row level security;
alter table public.circle_notification_deliveries force row level security;
revoke all on table public.circle_notification_campaigns, public.circle_notification_deliveries from public, anon, authenticated;
grant all on table public.circle_notification_campaigns, public.circle_notification_deliveries to service_role;
grant select on table public.circle_notification_deliveries to authenticated;
drop policy if exists circle_notification_deliveries_recipient_select on public.circle_notification_deliveries;
create policy circle_notification_deliveries_recipient_select
on public.circle_notification_deliveries for select to authenticated
using (recipient_user_id = auth.uid());

create or replace function public.enqueue_circle_live_notification_campaigns_v1()
returns integer
language plpgsql
security definer
set search_path = public, private, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_created integer := 0;
  v_count integer := 0;
  v_delivery record;
begin
  insert into public.circle_notification_campaigns(
    circle_id, gathering_id, actor_user_id, kind, revision, title, body, data
  )
  select
    gathering.circle_id,
    gathering.id,
    gathering.created_by_user_id,
    'gathering_starting_soon',
    floor(extract(epoch from gathering.starts_at))::bigint,
    gathering.title || ' is tomorrow',
    circle.name || ' has a Gathering starting within 24 hours.',
    jsonb_build_object(
      'type', 'circle_gathering_reminder',
      'circle_id', circle.id,
      'gathering_id', gathering.id,
      'starts_at', gathering.starts_at
    )
  from public.gatherings gathering
  join public.circles circle on circle.id = gathering.circle_id
  where gathering.circle_id is not null
    and gathering.status = 'approved'
    and gathering.cancelled_at is null
    and gathering.starts_at > v_now
    and gathering.starts_at <= v_now + interval '24 hours'
    and circle.status = 'approved'
    and circle.archived_at is null
  on conflict(gathering_id, kind, revision) do nothing;
  get diagnostics v_created = row_count;

  insert into public.circle_notification_campaigns(
    circle_id, session_id, actor_user_id, kind, revision, title, body, data
  )
  select
    session.circle_id,
    session.id,
    session.created_by_user_id,
    'live_starting_soon',
    coalesce(session.schedule_revision, 0),
    session.title || ' starts soon',
    circle.name || ' is opening a Live room in about 15 minutes.',
    jsonb_build_object(
      'type', 'circle_live_starting_soon',
      'circle_id', circle.id,
      'session_id', session.id,
      'scheduled_start', session.scheduled_start
    )
  from public.live_sessions session
  join public.circles circle on circle.id = session.circle_id
  where session.context_type = 'circle'
    and session.status in ('scheduled', 'waiting_for_quorum', 'confirmed', 'backstage')
    and session.scheduled_start > v_now
    and session.scheduled_start <= v_now + interval '15 minutes'
    and circle.status = 'approved'
    and circle.archived_at is null
  on conflict(session_id, kind, revision) do nothing;
  get diagnostics v_count = row_count;
  v_created := v_created + v_count;

  insert into public.circle_notification_campaigns(
    circle_id, session_id, actor_user_id, kind, revision, title, body, data
  )
  select
    session.circle_id,
    session.id,
    session.created_by_user_id,
    'live_now',
    coalesce(session.schedule_revision, 0),
    session.title || ' is Live',
    circle.name || ' is Live now. Join your Circle when you are ready.',
    jsonb_build_object(
      'type', 'circle_live_now',
      'circle_id', circle.id,
      'session_id', session.id
    )
  from public.live_sessions session
  join public.circles circle on circle.id = session.circle_id
  where session.context_type = 'circle'
    and session.status in ('live', 'ending')
    and coalesce(session.started_at, session.scheduled_start) >= v_now - interval '12 hours'
    and circle.status = 'approved'
    and circle.archived_at is null
  on conflict(session_id, kind, revision) do nothing;
  get diagnostics v_count = row_count;
  v_created := v_created + v_count;

  insert into public.circle_notification_deliveries(campaign_id, circle_id, recipient_user_id)
  select campaign.id, campaign.circle_id, member.user_id
  from public.circle_notification_campaigns campaign
  join public.circle_members member
    on member.circle_id = campaign.circle_id
   and member.status = 'active'
   and member.left_at is null
  left join public.circle_member_notification_preferences circle_pref
    on circle_pref.circle_id = campaign.circle_id
   and circle_pref.user_id = member.user_id
  left join public.notification_prefs global_pref on global_pref.user_id = member.user_id
  where campaign.status in ('pending', 'processing')
    and member.user_id is not null
    and member.user_id is distinct from campaign.actor_user_id
    and coalesce(circle_pref.notification_level, 'important_only') <> 'muted'
    and case
      when campaign.kind in ('live_starting_soon', 'live_now')
        then coalesce(circle_pref.live_notifications, true)
      when campaign.kind = 'gathering_starting_soon'
        then coalesce(circle_pref.gathering_reminders, true)
      else true
    end
    and coalesce(global_pref.push_enabled, true)
    and case
      when campaign.kind = 'live_starting_soon' then coalesce(global_pref.live_reminders, true)
      when campaign.kind = 'live_now' then coalesce(global_pref.live_started, true)
      else true
    end
    and not public.is_quiet_hours(member.user_id)
    and not exists (
      select 1 from public.blocks block
      where campaign.actor_user_id is not null
        and ((block.blocker_id = member.user_id and block.blocked_id = campaign.actor_user_id)
          or (block.blocker_id = campaign.actor_user_id and block.blocked_id = member.user_id))
    )
  on conflict(campaign_id, recipient_user_id) do nothing;

  update public.circle_notification_campaigns
  set status = 'processing'
  where status = 'pending'
    and exists (
      select 1 from public.circle_notification_deliveries delivery
      where delivery.campaign_id = circle_notification_campaigns.id
        and delivery.status in ('pending', 'failed')
    );

  update public.circle_notification_campaigns campaign
  set status = 'completed', completed_at = v_now
  where campaign.status = 'pending'
    and not exists (
      select 1 from public.circle_notification_deliveries delivery
      where delivery.campaign_id = campaign.id
    );

  for v_delivery in
    select delivery.id, delivery.recipient_user_id, campaign.title, campaign.body, campaign.data
    from public.circle_notification_deliveries delivery
    join public.circle_notification_campaigns campaign on campaign.id = delivery.campaign_id
    where delivery.status in ('pending', 'failed')
      and delivery.next_attempt_at <= v_now
      and delivery.attempt_count < 5
    order by delivery.created_at
    limit 200
    for update of delivery skip locked
  loop
    begin
      update public.circle_notification_deliveries
      set status = 'processing', attempt_count = attempt_count + 1, updated_at = v_now
      where id = v_delivery.id;

      perform private.send_push_webhook(jsonb_build_object(
        'user_id', v_delivery.recipient_user_id,
        'title', v_delivery.title,
        'body', v_delivery.body,
        'data', v_delivery.data
      ));

      update public.circle_notification_deliveries
      set status = 'dispatched', dispatched_at = v_now, failure_reason = null, updated_at = v_now
      where id = v_delivery.id;
    exception when others then
      update public.circle_notification_deliveries
      set status = 'failed',
          next_attempt_at = v_now + make_interval(mins => least(60, greatest(2, attempt_count * 5))),
          failure_reason = left(sqlstate || ':' || sqlerrm, 500),
          updated_at = v_now
      where id = v_delivery.id;
    end;
  end loop;

  update public.circle_notification_campaigns campaign
  set status = 'completed', completed_at = v_now
  where campaign.status = 'processing'
    and not exists (
      select 1 from public.circle_notification_deliveries delivery
      where delivery.campaign_id = campaign.id
        and delivery.status in ('pending', 'processing', 'failed')
        and delivery.attempt_count < 5
    );

  return v_created;
end;
$$;

revoke all on function public.enqueue_circle_live_notification_campaigns_v1()
from public, anon, authenticated, service_role;

create or replace function public.rpc_mark_circle_notification_seen_v1(p_delivery_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  update public.circle_notification_deliveries
  set seen_at = coalesce(seen_at, timezone('utc', now())), updated_at = timezone('utc', now())
  where id = p_delivery_id and recipient_user_id = auth.uid();
  return found;
end;
$$;

revoke all on function public.rpc_mark_circle_notification_seen_v1(uuid) from public, anon;
grant execute on function public.rpc_mark_circle_notification_seen_v1(uuid) to authenticated, service_role;

create or replace function public.rpc_list_my_circle_notifications_v1(p_limit integer default 30)
returns table(
  delivery_id uuid,
  circle_id uuid,
  circle_name text,
  kind text,
  title text,
  body text,
  data jsonb,
  created_at timestamptz,
  dispatched_at timestamptz,
  seen_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  return query
  select
    delivery.id,
    delivery.circle_id,
    circle.name,
    campaign.kind,
    campaign.title,
    campaign.body,
    campaign.data,
    delivery.created_at,
    delivery.dispatched_at,
    delivery.seen_at
  from public.circle_notification_deliveries delivery
  join public.circle_notification_campaigns campaign on campaign.id = delivery.campaign_id
  join public.circles circle on circle.id = delivery.circle_id
  where delivery.recipient_user_id = auth.uid()
    and delivery.status = 'dispatched'
  order by delivery.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;

revoke all on function public.rpc_list_my_circle_notifications_v1(integer) from public, anon;
grant execute on function public.rpc_list_my_circle_notifications_v1(integer) to authenticated, service_role;

create or replace function public.enqueue_circle_pulse_push(
  p_target_user_id uuid,
  p_actor_user_id uuid,
  p_pref_kind text,
  p_title text,
  p_body text,
  p_data jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_circle_id uuid;
  v_level text := 'important_only';
  v_discussion_activity boolean := true;
begin
  if p_target_user_id is null
    or p_actor_user_id is null
    or p_target_user_id = p_actor_user_id then
    return false;
  end if;

  begin
    v_circle_id := nullif(p_data->>'circle_id', '')::uuid;
  exception when invalid_text_representation then
    v_circle_id := null;
  end;

  if v_circle_id is not null then
    select preference.notification_level, preference.discussion_activity
      into v_level, v_discussion_activity
    from public.circle_member_notification_preferences preference
    where preference.circle_id = v_circle_id
      and preference.user_id = p_target_user_id;

    v_level := coalesce(v_level, 'important_only');
    v_discussion_activity := coalesce(v_discussion_activity, true);
    if v_level = 'muted'
      or (p_pref_kind = 'circle_discussions' and (v_level <> 'all_activity' or not v_discussion_activity)) then
      return false;
    end if;
  end if;

  if exists (
    select 1
    from public.notification_prefs preference
    where preference.user_id = p_target_user_id
      and (
        preference.push_enabled = false
        or (p_pref_kind = 'messages' and preference.messages = false)
        or (p_pref_kind = 'reactions' and preference.reactions = false)
        or (p_pref_kind = 'circle_discussions' and preference.circle_discussions = false)
      )
  ) then
    return false;
  end if;

  if public.is_quiet_hours(p_target_user_id) then
    return false;
  end if;

  if exists (
    select 1 from public.blocks block
    where (block.blocker_id = p_target_user_id and block.blocked_id = p_actor_user_id)
       or (block.blocker_id = p_actor_user_id and block.blocked_id = p_target_user_id)
  ) then
    return false;
  end if;

  perform private.send_push_webhook(jsonb_build_object(
    'user_id', p_target_user_id,
    'title', p_title,
    'body', p_body,
    'data', p_data
  ));
  return true;
end;
$$;

revoke all on function public.enqueue_circle_pulse_push(uuid, uuid, text, text, text, jsonb)
from public, anon, authenticated, service_role;

do $$
declare
  v_job record;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron unavailable; Circle notification scheduling must be invoked externally.';
    return;
  end if;
  for v_job in select jobid from cron.job where jobname = 'circle-member-notification-campaigns'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
  perform cron.schedule(
    'circle-member-notification-campaigns',
    '* * * * *',
    'select public.enqueue_circle_live_notification_campaigns_v1();'
  );
end;
$$;

comment on table public.circle_notification_campaigns is
  'Durable high-signal Circle notification work. Recipient fan-out happens asynchronously.';
comment on table public.circle_notification_deliveries is
  'Per-recipient Circle notification delivery and in-app inbox state.';
