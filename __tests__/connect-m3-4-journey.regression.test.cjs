const test=require('node:test');
const assert=require('node:assert/strict');
const {fixture,deferred,settle}=require('./fixtures/connect-product-fixture.cjs');
test('declining before media ownership can be dismissed without inventing hardware verification',async()=>{
  const f=fixture(true);await f.composition.controller.openCall(f.model.id);await f.composition.controller.decline();await settle();
  assert.equal(f.composition.controller.getSnapshot().localShutdown.microphone,'unverified');
  assert.equal(f.composition.controller.dismissCompletedCall(),true);assert.equal(f.composition.controller.getSnapshot().phase,'IDLE');
  assert.equal(f.counts().credentialCount,0);await f.product.dispose();
});
test('unconfirmed authoritative end cannot be dismissed as settled',async()=>{
  const f=fixture();await f.start();f.ports.rpc=async()=>({data:null,error:{message:'offline'}});await f.composition.controller.hangup();
  assert.equal(f.composition.controller.dismissCompletedCall(),false);assert.equal(f.composition.controller.getSnapshot().endStatus,'unconfirmed');await f.product.dispose();
});
test('hung native teardown cannot be dismissed while block/termination proceed independently',async()=>{
  const f=fixture();await f.active();const gate=deferred(),leave=f.handle.leave;f.handle.leave=async()=>{await gate.promise;await leave();};
  await f.composition.controller.endCallAndBlock();assert.equal(f.composition.controller.getSnapshot().endBlock.block,'saved');
  assert.equal(f.composition.controller.dismissCompletedCall(),false);gate.resolve();await f.composition.owner().release();await settle();
  assert.equal(f.composition.controller.dismissCompletedCall(),true);await f.product.dispose();
});
test('a retired pending credential operation cannot be dismissed and later restart media',async()=>{
  const f=fixture();await f.start();const gate=deferred(),issue=f.ports.credentials;f.ports.credentials=async(...args)=>{await gate.promise;return issue(...args);};
  f.model.state='ACTIVE';const joining=f.composition.controller.refresh();await settle();await f.composition.controller.hangup();
  assert.equal(f.composition.controller.dismissCompletedCall(),false);gate.resolve();await joining;await settle();
  assert.equal(f.events.filter(e=>e==='capture').length,0);assert.equal(f.composition.controller.dismissCompletedCall(),true);await f.product.dispose();
});
test('completed native owner may be dismissed but SDK observations never become hardware proof',async()=>{
  const f=fixture();await f.active();await f.composition.controller.hangup();await f.composition.owner().release();await settle();
  assert.equal(f.composition.controller.getSnapshot().localShutdown.microphone,'unverified');
  assert.equal(f.composition.controller.dismissCompletedCall(),true);await f.product.dispose();
});
test('new calls and history routes cannot replace terminal UI while its native cleanup is pending',async()=>{
  const f=fixture();await f.active();const gate=deferred(),leave=f.handle.leave;
  f.handle.leave=async()=>{await gate.promise;await leave();};f.model.state='ENDED';await f.composition.controller.refresh();
  const previous=f.composition.controller.getSnapshot().session.id,count=f.counts().createCount;
  await f.start();await f.composition.controller.openCall('a0330000-0000-4000-8000-000000000099');
  assert.equal(f.counts().createCount,count);assert.equal(f.composition.controller.getSnapshot().session.id,previous);
  assert.equal(f.composition.controller.dismissCompletedCall(),false);gate.resolve();await f.composition.owner().release();await settle();await f.product.dispose();
});
test('exhausted staging budget is preserved across the repository and shown as a test limit',async()=>{
  const f=fixture();f.ports.rpc=async()=>({data:null,error:{message:'connect_test_budget_exhausted'}});await f.start();
  assert.match(f.composition.controller.getSnapshot().error,/staging test has reached its call limit/);assert.equal(f.counts().credentialCount,0);
  await f.product.dispose();
});
test('failed credential setup continues polling pending end and permits Done after canonical cleanup',async()=>{
 const f=fixture();await f.start();const original=f.ports.rpc;
 f.ports.rpc=async(name,args,...rest)=>{
  if(name==='rpc_connect_act'&&args.p_action==='end'){f.model.state='ENDING';f.model.version++;return{data:{...f.model},error:null};}
  return original(name,args,...rest);
 };
 f.ports.credentials=async()=>{throw Error('credentials_unavailable');};f.model.state='ACTIVE';await f.composition.controller.refresh();await settle();
 assert.equal(f.composition.controller.getSnapshot().phase,'FAILED');assert.equal(f.composition.controller.getSnapshot().endStatus,'pending');
 f.model.state='ENDED';f.model.ended_at=new Date().toISOString();await f.composition.controller.tick();await f.composition.owner()?.release();await settle();
 assert.equal(f.composition.controller.getSnapshot().endStatus,'terminal');assert.equal(f.composition.controller.canDismissCompletedCall(),true);await f.product.dispose();
});
