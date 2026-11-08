// Synthetic security checks in one disposable local schema. No hosted APIs or media.
const assert = require('node:assert/strict');
const { withConnectDatabase } = require('./lib/connect-test-database.cjs');

withConnectDatabase(async ({ sql, file }) => {
  const configuration = sql('select to_jsonb(c) from private.connect_config c');
  const phone = sql('begin;\n'
    + file('supabase/migrations/20261106055934_bind_phone_verification_to_account.sql') + '\n'
    + file('supabase/migrations/20261106062850_expire_missing_phone_challenge.sql') + '\n'
    + file('supabase/tests/phone_verification_account_binding.sql') + '\nrollback;');
  assert.match(phone, /PHONE_VERIFICATION_ACCOUNT_BINDING_PASS/);
  console.log('ok - real phone ownership, actor binding, retries and replay checks');

  // Schema-only clones omit bucket data. Reapply the canonical private bucket
  // configuration before the later media migrations; staging already uses it.
  sql(file('supabase/migrations/20261007223000_circle_staging_readiness_hardening.sql'));

  for (const migration of [
    '20261105231527_circle_media_asset_authority_v1',
    '20261105231539_circle_media_lifecycle_v1',
    '20261105231608_circle_media_consent_moderation_v1',
    '20261105231623_circle_media_hub_engagement_v1',
    '20261105232008_circle_media_performance_hardening',
  ]) sql(file(`supabase/migrations/${migration}.sql`));

  assert.equal(sql(`select count(*) >= 5 and bool_and(c.relrowsecurity)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname like 'circle_media_%' and c.relkind='r'`), 't');
  console.log('ok - every Circle Media table enforces RLS');
  assert.equal(sql(`select bool_and(not has_table_privilege('anon', c.oid, 'SELECT')
      and not has_table_privilege('authenticated', c.oid, 'INSERT')
      and not has_table_privilege('authenticated', c.oid, 'UPDATE')
      and not has_table_privilege('authenticated', c.oid, 'DELETE'))
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname like 'circle_media_%' and c.relkind='r'`), 't');
  console.log('ok - clients cannot enumerate anonymous media or forge authoritative media rows');
  const moderation = 'public.rpc_service_complete_circle_media_moderation(uuid,text,text,text,text[],jsonb,text,text)';
  assert.equal(sql(`select has_function_privilege('service_role','${moderation}','EXECUTE')
    and not has_function_privilege('authenticated','${moderation}','EXECUTE')
    and not has_function_privilege('anon','${moderation}','EXECUTE')`), 't');
  console.log('ok - only the service role can complete moderation');
  assert.equal(sql("select not public from storage.buckets where id='circle-pulse-media'"), 't');
  console.log('ok - Circle Media storage is private');
  assert.equal(sql('select to_jsonb(c) from private.connect_config c'), configuration);
  console.log(JSON.stringify({ passed: 6, failed: 0, hosted: false, providerCalls: 0, sharedDatabaseModified: false }));
}).catch(error => { console.error(error.message); process.exitCode = 1; });
