-- Server-side premium renewal reminders.
--
-- Run `rpc_process_subscription_renewal_jobs()` on a schedule (recommended: every 15 minutes)
-- through a scheduled edge function or external cron so reminders still land when the app is closed.

create table if not exists public.subscription_renewal_nudges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  kind text not null check (kind in ('renewal_7d', 'renewal_24h')),
  ends_at timestamptz not null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  metadata jsonb not null default '{}'::jsonb,
  constraint subscription_renewal_nudges_dedupe
    unique (user_id, subscription_id, kind, ends_at)
);

create index if not exists subscription_renewal_nudges_user_created_idx
  on public.subscription_renewal_nudges (user_id, created_at desc);

create index if not exists subscription_renewal_nudges_subscription_idx
  on public.subscription_renewal_nudges (subscription_id, created_at desc);

alter table public.subscription_renewal_nudges enable row level security;
revoke all on public.subscription_renewal_nudges from anon, authenticated;

create or replace function public.rpc_process_subscription_renewal_jobs(
  p_first_remind_before interval default interval '7 days',
  p_final_remind_before interval default interval '24 hours',
  p_include_sandbox boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_inbox_created integer := 0;
  v_push_scheduled integer := 0;
  v_has_inbox_items boolean := to_regclass('public.inbox_items') is not null;
  v_run_key uuid := gen_random_uuid();
begin
  if p_first_remind_before <= p_final_remind_before then
    raise exception 'invalid_reminder_window';
  end if;

  create temporary table if not exists pg_temp.subscription_renewal_candidates (
    subscription_id uuid not null,
    user_id uuid not null,
    type public.subscription_type not null,
    ends_at timestamptz not null,
    inapp_enabled boolean not null,
    push_enabled boolean not null,
    kind text not null,
    title text not null,
    body text not null
  ) on commit drop;

  create temporary table if not exists pg_temp.subscription_renewal_delivery (
    subscription_id uuid not null,
    user_id uuid not null,
    type public.subscription_type not null,
    ends_at timestamptz not null,
    inapp_enabled boolean not null,
    push_enabled boolean not null,
    kind text not null,
    title text not null,
    body text not null
  ) on commit drop;

  truncate table pg_temp.subscription_renewal_candidates;
  truncate table pg_temp.subscription_renewal_delivery;

  insert into pg_temp.subscription_renewal_candidates (
    subscription_id,
    user_id,
    type,
    ends_at,
    inapp_enabled,
    push_enabled,
    kind,
    title,
    body
  )
  with base as (
    select
      s.id as subscription_id,
      s.user_id,
      s.type,
      s.ends_at,
      coalesce(np.inapp_enabled, true) as inapp_enabled,
      coalesce(np.push_enabled, true) as push_enabled
    from public.subscriptions s
    left join public.notification_prefs np
      on np.user_id = s.user_id
    where s.is_active = true
      and s.type in ('SILVER', 'GOLD')
      and s.ends_at > timezone('utc'::text, now())
      and (
        coalesce(p_include_sandbox, false)
        or upper(coalesce(s.external_environment, '')) <> 'SANDBOX'
      )
  ),
  candidates as (
    select
      b.subscription_id,
      b.user_id,
      b.type,
      b.ends_at,
      b.inapp_enabled,
      b.push_enabled,
      case
        when (b.ends_at - timezone('utc'::text, now())) <= p_final_remind_before then 'renewal_24h'
        else 'renewal_7d'
      end as kind,
      case
        when (b.ends_at - timezone('utc'::text, now())) <= p_final_remind_before
          then b.type::text || ' renews within 24 hours'
        else b.type::text || ' renews soon'
      end as title,
      case
        when (b.ends_at - timezone('utc'::text, now())) <= p_final_remind_before
          then 'Your ' || lower(b.type::text) || ' plan renews within 24 hours. Review or change it now to keep your premium signals uninterrupted.'
        else 'Your ' || lower(b.type::text) || ' plan renews in the next 7 days. Review it now so your premium visibility stays uninterrupted.'
      end as body
    from base b
    where (b.ends_at - timezone('utc'::text, now())) <= p_first_remind_before
      and not exists (
        select 1
        from public.subscription_renewal_nudges n
        where n.subscription_id = b.subscription_id
          and n.user_id = b.user_id
          and n.kind = case
            when (b.ends_at - timezone('utc'::text, now())) <= p_final_remind_before then 'renewal_24h'
            else 'renewal_7d'
          end
          and n.ends_at = b.ends_at
      )
  )
  select
    c.subscription_id,
    c.user_id,
    c.type,
    c.ends_at,
    c.inapp_enabled,
    c.push_enabled,
    c.kind,
    c.title,
    c.body
  from candidates c;

  insert into public.subscription_renewal_nudges (
    user_id,
    subscription_id,
    kind,
    ends_at,
    metadata
  )
  select
    c.user_id,
    c.subscription_id,
    c.kind,
    c.ends_at,
    jsonb_build_object(
      'subscription_type', c.type,
      'ends_at', c.ends_at,
      'run_key', v_run_key
    )
  from pg_temp.subscription_renewal_candidates c
  on conflict (user_id, subscription_id, kind, ends_at) do nothing;

  insert into pg_temp.subscription_renewal_delivery (
    subscription_id,
    user_id,
    type,
    ends_at,
    inapp_enabled,
    push_enabled,
    kind,
    title,
    body
  )
  select
    c.subscription_id,
    c.user_id,
    c.type,
    c.ends_at,
    c.inapp_enabled,
    c.push_enabled,
    c.kind,
    c.title,
    c.body
  from pg_temp.subscription_renewal_candidates c
  join public.subscription_renewal_nudges n
    on n.subscription_id = c.subscription_id
   and n.user_id = c.user_id
   and n.kind = c.kind
   and n.ends_at = c.ends_at
   and n.metadata->>'run_key' = v_run_key::text;

  if v_has_inbox_items then
    execute $sql$
      insert into public.inbox_items (
        user_id,
        type,
        actor_id,
        entity_id,
        entity_type,
        title,
        body,
        action_required,
        metadata
      )
      select
        d.user_id,
        'SYSTEM',
        null,
        d.subscription_id,
        'subscription_renewal',
        d.title,
        d.body,
        true,
        jsonb_build_object(
          'type', 'subscription_renewal',
          'kind', d.kind,
          'plan', d.type,
          'ends_at', d.ends_at,
          'route', '/premium-plans'
        )
      from pg_temp.subscription_renewal_delivery d
      where d.inapp_enabled = true
    $sql$;

    get diagnostics v_inbox_created = row_count;
  end if;

  perform private.send_push_webhook(
    jsonb_build_object(
      'user_id', d.user_id,
      'title', d.title,
      'body', d.body,
      'data', jsonb_build_object(
        'type', 'subscription_renewal',
        'kind', d.kind,
        'plan', d.type,
        'ends_at', d.ends_at,
        'route', '/premium-plans'
      )
    )
  )
  from pg_temp.subscription_renewal_delivery d
  where d.push_enabled = true
    and public.is_quiet_hours(d.user_id) = false;

  get diagnostics v_push_scheduled = row_count;

  return jsonb_build_object(
    'inbox_created', v_inbox_created,
    'push_scheduled', v_push_scheduled
  );
end;
$$;

revoke all on function public.rpc_process_subscription_renewal_jobs(interval, interval, boolean) from public;
grant execute on function public.rpc_process_subscription_renewal_jobs(interval, interval, boolean) to service_role;
