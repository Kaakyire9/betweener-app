// No native media/provider operations: exercise call-owned source/sender controls.
const test=require('node:test'),assert=require('node:assert/strict');
const {createNativeMicrophonePause}=require('../features/connect/media/native-microphone-pause.ts');
const {deferred,settle,fixture:productFixture}=require('./fixtures/connect-product-fixture.cjs');
const track=(kind='audio')=>({kind,enabled:true,readyState:'live',stop(){this.enabled=false;this.readyState='ended';}});
function fixture(){
  const capture=track(),sender=track(),secondSender=track(),video=track('video'),remote=track(),events=[];
  let current=true,status='enabled',captures=[capture],published=[sender,secondSender,video];
  const port={current:()=>current,capture:()=>captures,published:()=>published,status:()=>status,
    setStatus:value=>{status=value;events.push(value);},enable:async()=>{events.push('sdk-enable');},disable:async()=>{events.push('sdk-stop');}};
  return {control:createNativeMicrophonePause(port),port,capture,sender,secondSender,video,remote,events,
    status:()=>status,retire(){current=false;},empty(){captures=[];published=[];status='disabled';},
    replace(){const next=track();published=[next];return next;}};
}
test('encrypted mute pauses the source and every sender clone without SDK unpublish or remote/video changes',()=>{
  const f=fixture();f.control.mute();
  for(const t of [f.capture,f.sender,f.secondSender]){assert.equal(t.enabled,false);assert.equal(t.readyState,'live');}
  assert.equal(f.video.enabled,true);assert.equal(f.remote.enabled,true);
  assert.equal(f.status(),'disabled');assert.deepEqual(f.events,['disabled']);
});
test('unmute restores the same encrypted sender tracks without SDK publish, new capture or renegotiation',async()=>{
  const f=fixture();f.control.mute();await f.control.enable();
  assert.ok([f.capture,f.sender,f.secondSender].every(t=>t.enabled&&t.readyState==='live'));
  assert.equal(f.status(),'enabled');assert.deepEqual(f.events,['disabled','enabled']);
});
test('a fresh muted join does not acquire or enable any capture',async()=>{
  const f=fixture();f.empty();f.control.mute();assert.deepEqual(f.events,[]);
  await f.control.enable();assert.deepEqual(f.events,['sdk-enable']);
});
test('replaced senders remain muted and cannot be resumed by a stale pause',async()=>{
  const f=fixture();f.control.mute();const next=f.replace();
  assert.throws(()=>f.control.enforce(),/pause_changed/);assert.equal(next.enabled,false);
  await assert.rejects(f.control.enable(),/pause_changed/);
  assert.ok([f.capture,f.sender,f.secondSender,next].every(t=>!t.enabled));
});
test('retired pause cannot re-enable source or sender clones',async()=>{
  const f=fixture();f.control.mute();f.retire();await assert.rejects(f.control.enable(),/owner_retired/);
  assert.ok([f.capture,f.sender,f.secondSender].every(t=>!t.enabled));
});

test('retired encrypted admission cannot enable a fresh microphone either',async()=>{
  const f=fixture();f.empty();f.retire();await assert.rejects(f.control.enable(),/owner_retired/);assert.deepEqual(f.events,[]);
});
test('a partial unmute failure rolls every owned audio track back to muted',async()=>{
  const f=fixture();f.control.mute();
  Object.defineProperty(f.sender,'enabled',{get:()=>false,set:value=>{if(value)throw Error('synthetic native failure');}});
  await assert.rejects(f.control.enable());assert.equal(f.capture.enabled,false);assert.equal(f.secondSender.enabled,false);
  assert.equal(f.status(),'disabled');
});
test('End stops retained source and sender clones before waiting for a hung SDK stop',async()=>{
  const f=fixture(),gate=deferred();f.control.mute();f.port.disable=async()=>{f.events.push('sdk-stop');await gate.promise;};
  const stopping=f.control.stop();
  assert.ok([f.capture,f.sender,f.secondSender].every(t=>t.readyState==='ended'&&!t.enabled));
  assert.equal(f.video.readyState,'live');gate.resolve();await stopping;
});
test('failed track shutdown still attempts the independent SDK stop',async()=>{
  const f=fixture();f.control.mute();f.sender.stop=()=>{throw Error('synthetic native stop failure');};
  await assert.rejects(f.control.stop(),/pause_unconfirmed/);assert.ok(f.events.includes('sdk-stop'));
  assert.equal(f.capture.readyState,'ended');assert.equal(f.secondSender.readyState,'ended');
});
test('an explicit mute during connecting survives startup recovery',async()=>{
  const f=productFixture(false,{connectionRecovery:true}),gate=deferred();
  try{
    await f.start();f.model.state='CONNECTING';f.model.version++;
    const select=f.composition.transport.selectRoute.bind(f.composition.transport);
    f.composition.transport.selectRoute=async route=>{await select(route);await gate.promise;};
    const connecting=f.composition.controller.refresh();await settle();await settle();
    assert.equal(f.composition.controller.getSnapshot().audioSetupStage,'audio_output');
    // Setup is still muted in the UI; the explicit system mute must become intent.
    await f.composition.controller.setSystemMuted(true);
    f.emit('reconnecting');const recovery=f.composition.controller.connectionLost();
    gate.resolve();await Promise.all([connecting,recovery]);await settle();
    assert.equal(f.composition.controller.getSnapshot().muted,true);
    assert.equal(f.sdkState.audioPublishing,false);
  }finally{gate.resolve();await f.product.dispose();}
});

test('a system mute before native join completes prevents initial microphone capture',async()=>{
  const f=productFixture(false,{connectionRecovery:true}),gate=deferred();
  try{
    const join=f.handle.join;f.handle.join=async()=>{await gate.promise;await join();};
    await f.start();f.model.state='CONNECTING';f.model.version++;
    const connecting=f.composition.controller.refresh();await settle();
    await f.composition.controller.setSystemMuted(true);gate.resolve();await connecting;
    assert.equal(f.composition.controller.getSnapshot().muted,true);
    assert.equal(f.events.includes('capture'),false);
  }finally{gate.resolve();await f.product.dispose();}
});
