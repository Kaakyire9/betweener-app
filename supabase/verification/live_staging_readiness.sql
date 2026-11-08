-- Read-only Live staging readiness evidence. This query intentionally returns
-- configuration presence and environment classification, never secret values.
select jsonb_build_object(
  'live_table_count', (
    select count(*)
    from pg_catalog.pg_tables
    where schemaname = 'public' and tablename like 'live_%'
  ),
  'live_rls_enabled_count', (
    select count(*)
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname like 'live_%'
      and c.relkind in ('r', 'p')
      and c.relrowsecurity
  ),
  'live_policy_count', (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'public' and tablename like 'live_%'
  ),
  'live_rpc_count', (
    select count(*)
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'rpc_%live%' or p.proname like 'live_%')
  ),
  'realtime_live_tables', (
    select coalesce(jsonb_agg(tablename order by tablename), '[]'::jsonb)
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename like 'live_%'
  ),
  'buckets', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'public', public,
      'file_size_limit', file_size_limit,
      'allowed_mime_types', allowed_mime_types
    ) order by id), '[]'::jsonb)
    from storage.buckets
    where id in ('live-event-media', 'live-program-music')
  ),
  'storage_policy_count', (
    select count(*)
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        qual like '%live-event-media%'
        or with_check like '%live-event-media%'
        or qual like '%live-program-music%'
        or with_check like '%live-program-music%'
      )
  ),
  'cron_jobs', (
    select coalesce(jsonb_agg(jobname order by jobname), '[]'::jsonb)
    from cron.job
    where jobname like '%live%' or jobname like '%push%'
  ),
  'push_config', (
    select jsonb_build_object(
      'row_exists', count(*) = 1,
      'targets_staging', coalesce(bool_and(
        webhook_url like 'https://xsgzxadwuxuziubglvps.supabase.co/functions/v1/push-notifications%'
      ), false),
      'targets_production', coalesce(bool_or(
        webhook_url like '%jbyblhithbqwojhwlenv%'
      ), false),
      'has_active_key_id', coalesce(bool_and(
        nullif(btrim(active_signing_key_id), '') is not null
      ), false),
      'has_active_secret_name', coalesce(bool_and(
        nullif(btrim(active_signing_secret_name), '') is not null
      ), false),
      'has_legacy_webhook_secret', coalesce(bool_or(
        nullif(btrim(webhook_secret), '') is not null
      ), false)
    )
    from private.push_config
    where id = 1
  ),
  'pg_net_available',
    to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is not null
);
