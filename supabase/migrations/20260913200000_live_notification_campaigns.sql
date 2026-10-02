-- Durable, retryable all-user notifications for public Betweener Live sessions.
-- The database schedules work; the Edge Function owns paged Expo delivery.

begin;

create table public.live_notification_campaigns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  kind text not null,
  schedule_revision integer not null default 0,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default timezone('utc', now()),
  claimed_at timestamptz,
  completed_at timestamptz,
  recipient_count integer not null default 0,
  accepted_ticket_count integer not null default 0,
  failure_reason text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint live_notification_campaign_kind_valid
    check (kind in ('starting_soon','live_now')),
  constraint live_notification_campaign_status_valid
    check (status in ('pending','processing','completed','failed')),
  constraint live_notification_campaign_counts_valid
    check (attempt_count >= 0 and recipient_count >= 0 and accepted_ticket_count >= 0),
  constraint live_notification_campaign_payload_valid
    check (jsonb_typeof(data) = 'object'),
  unique(session_id, kind, schedule_revision)
);

create index live_notification_campaigns_dispatch_idx
  on public.live_notification_campaigns(status, next_attempt_at, created_at)
  where status in ('pending','processing','failed');

alter table public.live_notification_campaigns enable row level security;
alter table public.live_notification_campaigns force row level security;
revoke all on table public.live_notification_campaigns from public, anon, authenticated;
grant all on table public.live_notification_campaigns to service_role;

create table public.live_in_app_announcements (
  id uuid primary key references public.live_notification_campaigns(id) on delete cascade,
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  kind text not null check (kind in ('starting_soon','live_now')),
  title text not null,
  body text not null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.live_in_app_announcements enable row level security;
alter table public.live_in_app_announcements force row level security;
create policy live_in_app_announcements_select_authenticated
on public.live_in_app_announcements for select to authenticated using (true);
revoke all on table public.live_in_app_announcements from public, anon, authenticated;
grant select on table public.live_in_app_announcements to authenticated;
grant all on table public.live_in_app_announcements to service_role;

create or replace function public.publish_live_in_app_announcement_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
begin
  insert into public.live_in_app_announcements(id, session_id, kind, title, body)
  values(new.id, new.session_id, new.kind, new.title, new.body)
  on conflict(id) do nothing;
  return new;
end;
$$;

create trigger live_notification_campaign_publish_in_app
after insert on public.live_notification_campaigns
for each row execute function public.publish_live_in_app_announcement_v1();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_in_app_announcements'
  ) then
    alter publication supabase_realtime add table public.live_in_app_announcements;
  end if;
end;
$$;

create or replace function public.rpc_service_claim_live_notification_campaign_v1(
  p_campaign_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_campaign public.live_notification_campaigns;
  v_session public.live_sessions;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('live-notification:' || p_campaign_id::text, 0));
  select * into v_campaign
  from public.live_notification_campaigns campaign
  where campaign.id = p_campaign_id
  for update;

  if v_campaign.id is null then
    raise exception 'live_notification_campaign_not_found' using errcode = 'P0002';
  end if;
  if v_campaign.status = 'completed' then
    return null;
  end if;
  if v_campaign.next_attempt_at > v_now
    or (v_campaign.status = 'processing' and v_campaign.claimed_at > v_now - interval '10 minutes') then
    return null;
  end if;

  select * into v_session from public.live_sessions where id = v_campaign.session_id;
  if v_session.id is null
    or coalesce(v_session.schedule_revision, 0) <> v_campaign.schedule_revision
    or (v_campaign.kind = 'starting_soon' and (
      v_session.status not in ('scheduled','waiting_for_quorum','confirmed','backstage')
      or v_session.scheduled_start <= v_now
      or v_session.scheduled_start > v_now + interval '15 minutes'
    ))
    or (v_campaign.kind = 'live_now' and v_session.status not in ('live','ending')) then
    update public.live_notification_campaigns
    set status = 'completed', completed_at = v_now,
        failure_reason = 'superseded', updated_at = v_now
    where id = p_campaign_id;
    return null;
  end if;

  update public.live_notification_campaigns
  set status = 'processing',
      attempt_count = attempt_count + 1,
      claimed_at = v_now,
      failure_reason = null,
      updated_at = v_now
  where id = p_campaign_id
  returning * into v_campaign;

  return jsonb_build_object(
    'id', v_campaign.id,
    'sessionId', v_campaign.session_id,
    'kind', v_campaign.kind,
    'title', v_campaign.title,
    'body', v_campaign.body,
    'data', v_campaign.data,
    'attemptCount', v_campaign.attempt_count
  );
end;
$$;

create or replace function public.rpc_service_complete_live_notification_campaign_v1(
  p_campaign_id uuid,
  p_succeeded boolean,
  p_recipient_count integer default 0,
  p_accepted_ticket_count integer default 0,
  p_failure_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
set row_security = off
as $$
declare
  v_now timestamptz := timezone('utc', now());
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  update public.live_notification_campaigns
  set status = case when p_succeeded then 'completed' else 'failed' end,
      completed_at = case when p_succeeded then v_now else null end,
      next_attempt_at = case
        when p_succeeded then v_now
        else v_now + make_interval(mins => least(60, greatest(2, attempt_count * 5)))
      end,
      recipient_count = greatest(0, coalesce(p_recipient_count, 0)),
      accepted_ticket_count = greatest(0, coalesce(p_accepted_ticket_count, 0)),
      failure_reason = case when p_succeeded then null else left(coalesce(p_failure_reason, 'delivery_failed'), 500) end,
      updated_at = v_now
  where id = p_campaign_id and status = 'processing';
end;
$$;

create or replace function public.enqueue_live_notification_campaigns_v1()
returns integer
language plpgsql
security definer
set search_path = public, private, pg_catalog
set row_security = off
as $$
declare
  v_enqueued integer := 0;
  v_inserted integer := 0;
  v_campaign record;
begin
  insert into public.live_notification_campaigns(
    session_id, kind, schedule_revision, title, body, data
  )
  select
    session.id,
    'starting_soon',
    coalesce(session.schedule_revision, 0),
    session.title || ' starts soon',
    'The room opens in about 15 minutes. Join Betweener Live when you are ready.',
    jsonb_build_object(
      'type', 'live_starting_soon',
      'session_id', session.id,
      'scheduled_start', session.scheduled_start,
      'route', '/live/event/' || session.id::text
    )
  from public.live_sessions session
  where session.ownership_type = 'human'
    and session.context_type in ('global','match_night','diaspora','special_event')
    and session.status in ('scheduled','waiting_for_quorum','confirmed','backstage')
    and session.scheduled_start > timezone('utc', now())
    and session.scheduled_start <= timezone('utc', now()) + interval '15 minutes'
  on conflict(session_id, kind, schedule_revision) do nothing;
  get diagnostics v_enqueued = row_count;

  insert into public.live_notification_campaigns(
    session_id, kind, schedule_revision, title, body, data
  )
  select
    session.id,
    'live_now',
    coalesce(session.schedule_revision, 0),
    session.title || ' is Live',
    'The room is open now. Step into Betweener Live.',
    jsonb_build_object(
      'type', 'live_now',
      'session_id', session.id,
      'route', '/live/' || session.id::text
    )
  from public.live_sessions session
  where session.ownership_type = 'human'
    and session.context_type in ('global','match_night','diaspora','special_event')
    and session.status in ('live','ending')
    and coalesce(session.started_at, session.scheduled_start) >= timezone('utc', now()) - interval '12 hours'
  on conflict(session_id, kind, schedule_revision) do nothing;
  get diagnostics v_inserted = row_count;
  v_enqueued := v_enqueued + v_inserted;

  for v_campaign in
    select id
    from public.live_notification_campaigns
    where status in ('pending','failed')
      and next_attempt_at <= timezone('utc', now())
      and attempt_count < 5
    order by created_at
    limit 10
  loop
    perform private.send_push_webhook(jsonb_build_object('campaign_id', v_campaign.id));
  end loop;

  return v_enqueued;
end;
$$;

revoke all on function public.rpc_service_claim_live_notification_campaign_v1(uuid),
  public.rpc_service_complete_live_notification_campaign_v1(uuid, boolean, integer, integer, text)
from public, anon, authenticated;
grant execute on function public.rpc_service_claim_live_notification_campaign_v1(uuid),
  public.rpc_service_complete_live_notification_campaign_v1(uuid, boolean, integer, integer, text)
to service_role;

revoke all on function public.enqueue_live_notification_campaigns_v1()
from public, anon, authenticated, service_role;

do $$
declare
  v_job record;
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron unavailable; live notification scheduling must be invoked externally.';
    return;
  end if;

  for v_job in select jobid from cron.job where jobname = 'live-public-notification-campaigns'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  perform cron.schedule(
    'live-public-notification-campaigns',
    '* * * * *',
    'select public.enqueue_live_notification_campaigns_v1();'
  );
end;
$$;

comment on table public.live_notification_campaigns is
  'Durable broadcast campaigns for public Live reminders; recipient identities stay inside the delivery worker.';
comment on table public.live_in_app_announcements is
  'Realtime foreground announcements for public Live campaigns; contains no recipient identity.';

commit;
