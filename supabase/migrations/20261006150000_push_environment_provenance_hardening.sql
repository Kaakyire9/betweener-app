-- Bind push destinations to an explicit application/environment tuple.
-- Legacy rows are quarantined until the current native app re-registers them.

begin;

alter table public.push_tokens
  add column if not exists app_environment text,
  add column if not exists application_id text,
  add column if not exists expo_project_id uuid,
  add column if not exists installation_id uuid,
  add column if not exists provenance_status text not null default 'unverified',
  add column if not exists verified_at timestamptz,
  add column if not exists quarantined_at timestamptz,
  add column if not exists quarantine_reason text;

alter table public.push_tokens
  drop constraint if exists push_tokens_app_environment_valid,
  add constraint push_tokens_app_environment_valid
    check (app_environment is null or app_environment in ('staging', 'production')),
  drop constraint if exists push_tokens_application_id_valid,
  add constraint push_tokens_application_id_valid
    check (
      application_id is null
      or application_id in (
        'com.aduboffour.betweener',
        'com.aduboffour.betweener.staging'
      )
    ),
  drop constraint if exists push_tokens_provenance_status_valid,
  add constraint push_tokens_provenance_status_valid
    check (provenance_status in ('unverified', 'verified', 'quarantined')),
  drop constraint if exists push_tokens_provenance_shape_valid,
  add constraint push_tokens_provenance_shape_valid check (
    provenance_status <> 'verified'
    or (
      app_environment is not null
      and application_id is not null
      and expo_project_id is not null
      and installation_id is not null
      and verified_at is not null
      and quarantined_at is null
      and quarantine_reason is null
    )
  );

create unique index if not exists push_tokens_application_installation_unique_idx
  on public.push_tokens(app_environment, application_id, installation_id)
  where installation_id is not null;

create index if not exists push_tokens_verified_delivery_idx
  on public.push_tokens(app_environment, application_id, expo_project_id, last_seen_at desc)
  where provenance_status = 'verified' and quarantined_at is null;

create table if not exists private.push_application_config (
  id boolean primary key default true check (id),
  app_environment text not null check (app_environment in ('staging', 'production')),
  application_id text not null check (
    application_id in (
      'com.aduboffour.betweener',
      'com.aduboffour.betweener.staging'
    )
  ),
  expo_project_id uuid not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint push_application_config_identity_valid check (
    (app_environment = 'staging' and application_id = 'com.aduboffour.betweener.staging')
    or (app_environment = 'production' and application_id = 'com.aduboffour.betweener')
  )
);

revoke all on table private.push_application_config
from public, anon, authenticated, service_role;

do $$
declare
  v_webhook_url text;
begin
  select config.webhook_url into v_webhook_url
  from private.push_config config
  where config.id = 1;

  if v_webhook_url like '%xsgzxadwuxuziubglvps.supabase.co/%' then
    insert into private.push_application_config(
      id, app_environment, application_id, expo_project_id, updated_at
    ) values (
      true,
      'staging',
      'com.aduboffour.betweener.staging',
      '7de6cdc4-8616-446f-99de-82764af3a7e6'::uuid,
      timezone('utc', now())
    )
    on conflict(id) do update set
      app_environment = excluded.app_environment,
      application_id = excluded.application_id,
      expo_project_id = excluded.expo_project_id,
      updated_at = excluded.updated_at;
  elsif v_webhook_url like '%jbyblhithbqwojhwlenv.supabase.co/%' then
    insert into private.push_application_config(
      id, app_environment, application_id, expo_project_id, updated_at
    ) values (
      true,
      'production',
      'com.aduboffour.betweener',
      '7de6cdc4-8616-446f-99de-82764af3a7e6'::uuid,
      timezone('utc', now())
    )
    on conflict(id) do update set
      app_environment = excluded.app_environment,
      application_id = excluded.application_id,
      expo_project_id = excluded.expo_project_id,
      updated_at = excluded.updated_at;
  else
    raise exception 'push_application_environment_unrecognized';
  end if;
end;
$$;

update public.push_tokens
set provenance_status = 'quarantined',
    quarantined_at = coalesce(quarantined_at, timezone('utc', now())),
    quarantine_reason = coalesce(
      quarantine_reason,
      case
        when id in (
          'b737b6ba-cc72-4696-a249-762ebfb5ba4f'::uuid,
          '0e391087-a346-4274-87b4-6ece80797cdb'::uuid
        ) then 'PUSH_TOKEN_SHARED_ACROSS_ENVIRONMENTS'
        else 'PUSH_ENVIRONMENT_PROVENANCE_MISSING'
      end
    ),
    updated_at = timezone('utc', now())
where provenance_status <> 'verified'
   or app_environment is null
   or application_id is null
   or expo_project_id is null
   or installation_id is null;

create or replace function public.upsert_push_token_v2(
  p_user_id uuid,
  p_token text,
  p_platform text,
  p_device_id text,
  p_app_version text,
  p_app_environment text,
  p_application_id text,
  p_expo_project_id uuid,
  p_installation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private, pg_catalog
set row_security = off
as $$
declare
  v_config private.push_application_config;
  v_token_row public.push_tokens;
  v_installation_row public.push_tokens;
  v_now timestamptz := timezone('utc', now());
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_platform not in ('ios', 'android') then
    raise exception 'push_platform_invalid' using errcode = '22023';
  end if;
  if p_token is null
    or char_length(p_token) > 512
    or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$' then
    raise exception 'push_token_invalid' using errcode = '22023';
  end if;
  if p_installation_id is null then
    raise exception 'push_installation_id_required' using errcode = '22023';
  end if;

  select * into v_config
  from private.push_application_config config
  where config.id = true;

  if v_config.id is null
    or p_app_environment is distinct from v_config.app_environment
    or p_application_id is distinct from v_config.application_id
    or p_expo_project_id is distinct from v_config.expo_project_id then
    raise exception 'push_application_provenance_mismatch' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('push-installation:' || p_installation_id::text, 0)
  );

  select * into v_token_row
  from public.push_tokens token
  where token.token = p_token
  for update;

  if v_token_row.id is not null
    and v_token_row.quarantine_reason = 'PUSH_TOKEN_SHARED_ACROSS_ENVIRONMENTS' then
    raise exception 'push_token_cross_environment_collision' using errcode = '22023';
  end if;
  if v_token_row.id is not null
    and v_token_row.installation_id is not null
    and (
      v_token_row.installation_id <> p_installation_id
      or v_token_row.application_id is distinct from p_application_id
      or v_token_row.app_environment is distinct from p_app_environment
    ) then
    raise exception 'push_token_ownership_conflict' using errcode = '22023';
  end if;

  select * into v_installation_row
  from public.push_tokens token
  where token.app_environment = p_app_environment
    and token.application_id = p_application_id
    and token.installation_id = p_installation_id
  for update;

  if v_installation_row.id is not null
    and (v_token_row.id is null or v_installation_row.id <> v_token_row.id) then
    update public.push_tokens
    set user_id = p_user_id,
        token = p_token,
        platform = p_platform,
        device_id = p_device_id,
        app_version = p_app_version,
        expo_project_id = p_expo_project_id,
        provenance_status = 'verified',
        verified_at = v_now,
        quarantined_at = null,
        quarantine_reason = null,
        last_seen_at = v_now,
        updated_at = v_now
    where id = v_installation_row.id;
    return;
  end if;

  insert into public.push_tokens(
    user_id,
    token,
    platform,
    device_id,
    app_version,
    app_environment,
    application_id,
    expo_project_id,
    installation_id,
    provenance_status,
    verified_at,
    quarantined_at,
    quarantine_reason,
    last_seen_at,
    updated_at
  ) values (
    p_user_id,
    p_token,
    p_platform,
    p_device_id,
    p_app_version,
    p_app_environment,
    p_application_id,
    p_expo_project_id,
    p_installation_id,
    'verified',
    v_now,
    null,
    null,
    v_now,
    v_now
  )
  on conflict(token) do update set
    user_id = excluded.user_id,
    platform = excluded.platform,
    device_id = excluded.device_id,
    app_version = excluded.app_version,
    app_environment = excluded.app_environment,
    application_id = excluded.application_id,
    expo_project_id = excluded.expo_project_id,
    installation_id = excluded.installation_id,
    provenance_status = excluded.provenance_status,
    verified_at = excluded.verified_at,
    quarantined_at = null,
    quarantine_reason = null,
    last_seen_at = excluded.last_seen_at,
    updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.upsert_push_token(
  uuid, text, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.upsert_push_token_v2(
  uuid, text, text, text, text, text, text, uuid, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.upsert_push_token_v2(
  uuid, text, text, text, text, text, text, uuid, uuid
) to authenticated;

create or replace function public.rpc_service_resolve_push_destinations_v1(
  p_user_id uuid default null
)
returns table (
  token_id uuid,
  user_id uuid,
  token_hash_prefix text,
  app_environment text,
  application_id text,
  expo_project_id uuid,
  decision text,
  reason text
)
language plpgsql
security definer
set search_path = public, private, extensions, pg_catalog
set row_security = off
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  return query
  select
    token.id,
    token.user_id,
    left(encode(extensions.digest(token.token, 'sha256'), 'hex'), 16),
    token.app_environment,
    token.application_id,
    token.expo_project_id,
    case
      when token.provenance_status = 'verified'
        and token.quarantined_at is null
        and token.app_environment = config.app_environment
        and token.application_id = config.application_id
        and token.expo_project_id = config.expo_project_id
        and token.installation_id is not null
      then 'ALLOW'
      else 'DENY'
    end,
    case
      when token.quarantined_at is not null then coalesce(token.quarantine_reason, 'PUSH_TOKEN_QUARANTINED')
      when token.app_environment is null
        or token.application_id is null
        or token.expo_project_id is null then 'PUSH_ENVIRONMENT_PROVENANCE_MISSING'
      when token.app_environment <> config.app_environment then 'PUSH_ENVIRONMENT_MISMATCH'
      when token.application_id <> config.application_id then 'PUSH_APPLICATION_ID_MISMATCH'
      when token.expo_project_id <> config.expo_project_id then 'PUSH_PROJECT_ID_MISMATCH'
      when token.installation_id is null then 'PUSH_INSTALLATION_ID_MISSING'
      when token.provenance_status <> 'verified' then 'PUSH_PROVENANCE_NOT_VERIFIED'
      else null
    end
  from public.push_tokens token
  cross join private.push_application_config config
  where config.id = true
    and (p_user_id is null or token.user_id = p_user_id)
  order by token.created_at, token.id;
end;
$$;

revoke all on function public.rpc_service_resolve_push_destinations_v1(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.rpc_service_resolve_push_destinations_v1(uuid)
to service_role;

-- Infrastructure/synthetic sessions must explicitly opt into provider delivery.
-- A dry-run or disabled mode never creates a broadcast campaign.
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
    and coalesce(session.configuration ->> 'notification_delivery_mode', 'enabled') = 'enabled'
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
    and coalesce(session.configuration ->> 'notification_delivery_mode', 'enabled') = 'enabled'
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

revoke all on function public.enqueue_live_notification_campaigns_v1()
from public, anon, authenticated, service_role;

comment on function public.upsert_push_token_v2(
  uuid, text, text, text, text, text, text, uuid, uuid
) is 'Registers a push destination only when its native application tuple matches the server-owned environment configuration.';
comment on function public.rpc_service_resolve_push_destinations_v1(uuid)
is 'Provider-free dry-run push destination resolver; returns only sanitized token hashes and allow/deny reasons.';

commit;
