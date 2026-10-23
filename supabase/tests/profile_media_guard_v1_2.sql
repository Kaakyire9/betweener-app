begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;
set local role postgres;
select extensions.plan(9);

select extensions.ok(
  exists (select 1 from storage.buckets
    where id = 'profile-media-staging-v1-2' and not public),
  '1.2 staging bucket is private'
);

select extensions.ok(
  not exists (select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and cmd = 'UPDATE'
      and coalesce(with_check, qual, '') like '%profile-media-staging-v1-2%'),
  'staged profile bytes cannot be updated in place'
);

select extensions.ok(
  exists (select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and cmd = 'INSERT' and roles @> array['authenticated']::name[]
      and with_check like '%profile-media-staging-v1-2%'),
  'authenticated users can stage only through the scoped insert policy'
);

select extensions.has_table('public', 'profile_media_guard_events_v1_2',
  '1.2 decisions have a dedicated audit table');

select extensions.has_function('public', 'rpc_service_apply_profile_media_v1_2',
  array['uuid', 'text', 'text', 'text[]', 'text'],
  '1.2 atomic media publication RPC exists');

select extensions.ok(
  not has_function_privilege('anon',
    'public.rpc_service_apply_profile_media_v1_2(uuid,text,text,text[],text)', 'EXECUTE'),
  'anon cannot publish profile media'
);

select extensions.ok(
  not has_function_privilege('authenticated',
    'public.rpc_service_apply_profile_media_v1_2(uuid,text,text,text[],text)', 'EXECUTE'),
  'authenticated clients cannot bypass media moderation'
);

select extensions.ok(
  has_function_privilege('service_role',
    'public.rpc_service_apply_profile_media_v1_2(uuid,text,text,text[],text)', 'EXECUTE'),
  'only the service boundary can publish approved profile media'
);

select extensions.ok(
  pg_get_functiondef('public.rpc_service_apply_profile_media_v1_2(uuid,text,text,text[],text)'::regprocedure)
    like '%PROFILE_MEDIA_URL_NOT_APPROVED%',
  'publication RPC rejects unapproved URLs'
);

select * from extensions.finish();
rollback;
