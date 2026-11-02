const assert = require('node:assert/strict');
const { json, sha } = require('./prepare.cjs');
const measured = json('tmp/connect-m3-2-inspection-45/shared-readiness.json').data;
const legacy = json('tmp/connect-m3-2-inspection-45/relationship-catalog.json').rows;
const catalog = sql => JSON.parse(sql(`select coalesce(json_agg(json_build_object('schema',n.nspname,'name',p.proname,
  'args',pg_get_function_identity_arguments(p.oid),'md5',md5(pg_get_functiondef(p.oid))) order by n.nspname,p.proname,p.oid),'[]')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private') and p.prokind='f'`));
function baseline(receipt) {
  return ({ sql, file }) => {
    const install = name => { sql(file(`supabase/migrations/${name}.sql`)); receipt.reconstructed.push(name); };
    if (sql("select to_regclass('public.live_notification_campaigns') is not null") === 'f') install('20260913200000_live_notification_campaigns');
    if (sql("select to_regclass('private.push_notification_events') is not null") === 'f') {
      for (const name of ['20260914123000_push_notification_event_security','20260914124000_push_notification_delivery_reservations',
        '20260914125000_push_notification_dispatch_reliability','20260914126000_push_notification_atomic_rate_limits','20260914127000_push_notification_expiry_lifecycle']) install(name);
    }
    sql("insert into private.push_config(id,webhook_url) values(1,'https://xsgzxadwuxuziubglvps.supabase.co/functions/v1/push-notifications') on conflict(id) do update set webhook_url=excluded.webhook_url");
    if (sql("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='push_tokens' and column_name='installation_id')") === 'f') install('20261006150000_push_environment_provenance_hardening');
    install('20261006170000_update_staging_push_eas_project_identity');
    if (sql("select to_regclass('public.live_notification_campaign_recipients') is not null") === 'f') {
      const source = file('supabase/migrations/20261016165616_live_broadcast_authority_and_step_up.sql');
      const start = source.indexOf('create table public.live_notification_campaign_recipients (');
      const end = source.indexOf('drop policy if exists live_in_app_announcements_select_authenticated', start);
      sql(source.slice(start, end));
      for (const name of ['rpc_service_list_live_campaign_tokens_v1','rpc_service_claim_live_notification_campaign_v1']) {
        const definition = source.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`, 'i'))?.[0];
        assert.ok(definition, name); sql(definition);
      }
      sql('revoke all on function public.rpc_service_list_live_campaign_tokens_v1(uuid,uuid,integer) from public,anon,authenticated;grant execute on function public.rpc_service_list_live_campaign_tokens_v1(uuid,uuid,integer) to service_role');
      receipt.campaignReconstruction = { source: '20261016165616_live_broadcast_authority_and_step_up.sql', sha256: sha(source),
        scope: 'recipient table/ACL and two exact function definitions only; not deployed staging parity evidence' };
    }
    const expected = measured.pushFunctions.find(f => f.name === 'rpc_service_reserve_push_notification_deliveries_v1');
    const current = catalog(sql).find(f => f.schema === 'public' && f.name === expected.name);
    if (current?.md5 !== expected.definitionMd5) {
      const source = file('supabase/migrations/20260914124000_push_notification_delivery_reservations.sql');
      const definition = source.match(/create or replace function public\.rpc_service_reserve_push_notification_deliveries_v1\([\s\S]*?\n\$\$;/i)?.[0];
      assert.ok(definition); sql(definition);
      receipt.restoredBaseline = { name: expected.name, sourceSha256: sha(source), previousLocalMd5: current?.md5 };
    }
    const actual = catalog(sql);
    receipt.compared = [...measured.pushFunctions, ...legacy].map(e => ({ name: `${e.schema}.${e.name}`,
      expected: e.definitionMd5, actual: actual.find(a => a.schema === e.schema && a.name === e.name)?.md5 }));
    assert.equal(receipt.compared.length, 16);
    assert.ok(receipt.compared.every(e => e.expected === e.actual), 'measured staging function drift');
    Object.defineProperty(receipt,'dispatcherDefinition',{value:sql("select pg_get_functiondef('private.dispatch_push_notification_event_v1(uuid)'::regprocedure)"),enumerable:false});
    // No Vault content copied, no HTTP dispatcher allowed. Only the disposable clone is patched.
    sql('create or replace function private.dispatch_push_notification_event_v1(p_event_id uuid) returns boolean language sql as $$select false$$');
    receipt.limitations = ['schema-only local baseline, not full staging clone','16 retained function hashes verified; other staging definitions/data not attested',
      'dispatcher is a no-egress test double after its real definition was measured','synthetic credentials/providers, no hosted gateway/provisioning evidence'];
  };
}
module.exports = { baseline, catalog };
