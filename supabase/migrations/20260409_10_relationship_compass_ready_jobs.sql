-- Send Relationship Compass ready reminders from the server.
-- This replaces the previous app-local scheduling so reminders stay consistent across devices.

create table if not exists public.relationship_compass_nudges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'ready',
  compass_updated_at timestamptz not null,
  sent_at timestamptz not null default timezone('utc'::text, now()),
  metadata jsonb not null default '{}'::jsonb,
  constraint relationship_compass_nudges_dedupe unique (user_id, kind, compass_updated_at)
);

create index if not exists relationship_compass_nudges_user_idx
  on public.relationship_compass_nudges (user_id, sent_at desc);

create index if not exists relationship_compass_nudges_profile_idx
  on public.relationship_compass_nudges (profile_id, sent_at desc);

create or replace function public.rpc_process_relationship_compass_jobs(
  p_ready_after interval default interval '24 hours'
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_ready_sent integer := 0;
begin
  with candidates as (
    select
      p.id as profile_id,
      p.user_id,
      (p.relationship_compass->>'updatedAt')::timestamptz as compass_updated_at
    from public.profiles p
    left join public.notification_prefs np on np.user_id = p.user_id
    where p.user_id is not null
      and jsonb_typeof(coalesce(p.relationship_compass, '{}'::jsonb)) = 'object'
      and nullif(btrim(coalesce(p.relationship_compass->>'updatedAt', '')), '') is not null
      and ((p.relationship_compass->>'updatedAt')::timestamptz + p_ready_after) <= now()
      and coalesce(np.push_enabled, true) = true
      and public.is_quiet_hours(p.user_id) = false
  ),
  reserved as (
    insert into public.relationship_compass_nudges (
      user_id,
      profile_id,
      kind,
      compass_updated_at,
      metadata
    )
    select
      c.user_id,
      c.profile_id,
      'ready',
      c.compass_updated_at,
      jsonb_build_object(
        'ready_after_hours',
        floor(extract(epoch from p_ready_after) / 3600)
      )
    from candidates c
    on conflict (user_id, kind, compass_updated_at) do nothing
    returning user_id, profile_id, compass_updated_at
  ),
  pushes as (
    select private.send_push_webhook(
      jsonb_build_object(
        'user_id', r.user_id,
        'title', 'Relationship Compass',
        'body', 'Your Love Compass is ready again. Fresh curated profiles are waiting.',
        'data', jsonb_build_object(
          'type', 'relationship_compass_ready',
          'profile_id', r.profile_id,
          'compass_updated_at', r.compass_updated_at,
          'route', '/relationship-compass'
        )
      )
    ) as _sent
    from reserved r
  )
  select count(*) into v_ready_sent from pushes;

  return jsonb_build_object(
    'ready_sent', v_ready_sent
  );
end;
$$;

revoke all on function public.rpc_process_relationship_compass_jobs(interval) from public;
grant execute on function public.rpc_process_relationship_compass_jobs(interval) to service_role;
