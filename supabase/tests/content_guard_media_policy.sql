begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select is(
  (select count(*)::integer from public.content_guard_media_policies),
  3,
  'video, audio, and document policies exist'
);
select ok(
  (select bool_and(enabled and enforcement_mode = 'REPORT_ONLY')
   from public.content_guard_media_policies),
  'all incomplete media pipelines preserve 1.1.1 compatibility'
);
select ok(
  not has_table_privilege('authenticated', 'public.content_guard_media_policies', 'SELECT'),
  'authenticated clients cannot read server rollout policy directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.content_guard_media_policies', 'UPDATE'),
  'authenticated clients cannot change media enforcement'
);
select has_column('public', 'content_moderation_events', 'evidence_redacted_at',
  'content evidence has an idempotent retention marker');
select has_column('public', 'profile_moderation_events', 'evidence_redacted_at',
  'profile evidence has an idempotent retention marker');
select ok(
  exists (select 1 from pg_indexes where schemaname = 'public'
    and indexname = 'content_moderation_events_retention_idx'),
  'content evidence retention has a partial queue index'
);
select ok(
  exists (select 1 from pg_indexes where schemaname = 'public'
    and indexname = 'profile_moderation_events_retention_idx'),
  'profile evidence retention has a partial queue index'
);

select * from finish();
rollback;
