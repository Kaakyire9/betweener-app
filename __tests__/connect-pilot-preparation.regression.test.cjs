const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs');
const {connectRuntimeAvailability}=require('../features/connect/config/connect-runtime-policy.ts');
const {ownedEndSql,emergencyStopSql}=require('../scripts/lib/connect-pilot-operator.cjs');
test('normal staging app does not depend on a special launcher or startup marker',()=>{
 assert.equal(fs.existsSync('scripts/start-connect-staging-preview.cjs'),false);
 assert.ok(!fs.readFileSync('features/connect/components/ConnectProductProvider.tsx','utf8').includes('STARTUP_MARKER'));
 const identity={development:true,platform:'ios',variant:'staging',environment:'staging',bundleIdentifier:'com.aduboffour.betweener.staging',supabaseUrl:'https://xsgzxadwuxuziubglvps.supabase.co'};
 assert.equal(connectRuntimeAvailability(identity).runtime,true);
 assert.equal(connectRuntimeAvailability({...identity,development:false}).runtime,false);
});
const binding={id:'00000000-0000-4000-8000-000000000001',callerUser:'00000000-0000-4000-8000-000000000002',recipientUser:'00000000-0000-4000-8000-000000000003',callerProfile:'00000000-0000-4000-8000-000000000004',recipientProfile:'00000000-0000-4000-8000-000000000005',createdAt:'2026-11-01T09:00:00.123456+00:00',providerSession:'owned-session'};
for(const patch of [{id:'bad'},{callerUser:binding.recipientUser},{callerProfile:binding.recipientProfile},{createdAt:'bad'},{providerSession:'unsafe $$ body'},{providerSession:"unsafe';"}])test(`operator refuses malformed binding ${JSON.stringify(patch)}`,()=>assert.throws(()=>ownedEndSql({...binding,...patch}),/binding_invalid/));
test('operator emergency stop retains cleanup execution and requires staging',()=>{assert.match(emergencyStopSql,/environment='staging'/);assert.match(emergencyStopSql,/staging_calls_remaining=0/);for(const forbidden of ['cron.','connect_provider_jobs','delete','truncate','push-notifications','live_'])assert.ok(!emergencyStopSql.includes(forbidden));});
test('owned end supports an explicitly observed null SFU session during ringing, but not missing evidence',()=>{assert.match(ownedEndSql({...binding,providerSession:null}),/provider_session_id is distinct from null::text/);const missing={...binding};delete missing.providerSession;assert.throws(()=>ownedEndSql(missing),/binding_invalid/);});
