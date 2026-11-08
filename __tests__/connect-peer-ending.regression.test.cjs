const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, deferred, settle } = require('./fixtures/connect-product-fixture.cjs');

for (const state of ['ENDING', 'ENDED']) for (const transport of ['offline', 'left']) {
  test(`remote ${state} during ${transport} finishes without a recovery error, admission or extra End`, async () => {
    const f = fixture(false, { connectionRecovery: true });
    try {
      await f.active();
      let ends = 0;
      const act = f.services.api.act;
      f.services.api.act = async (...args) => { if (args[1] === 'end') ends++; return act(...args); };
      f.model.state = state; f.model.version++;
      if (state === 'ENDED') f.model.ended_at = new Date().toISOString();
      f.emit(transport);
      await f.composition.controller.connectionLost(); await settle();
      const view = f.composition.controller.getSnapshot();
      assert.equal(view.phase, 'ENDED');
      assert.equal(view.error, null);
      assert.equal(view.endStatus, state === 'ENDED' ? 'terminal' : 'pending');
      assert.equal(view.session.state, state);
      assert.equal(ends, 0);
      assert.equal(f.counts().credentialCount, 1);
      assert.equal(f.events.filter(event => event === 'client-created').length, 1);
      assert.ok(f.tracks.every(track => track.readyState === 'ended'));
    } finally { await f.product.dispose(); }
  });
}

test('simultaneous user and native End share one request; late End cannot reopen completed UI', async () => {
  const f = fixture(), gate = deferred();
  try {
    await f.active();
    let ends = 0;
    const act = f.services.api.act;
    f.services.api.act = async (...args) => {
      if (args[1] === 'end') { ends++; await gate.promise; }
      return act(...args);
    };
    const first = f.composition.controller.hangup();
    const duplicate = f.composition.controller.hangup();
    await settle();
    assert.equal(ends, 1);
    assert.equal(first, duplicate);
    assert.ok(f.tracks.every(track => track.readyState === 'ended'));
    gate.resolve(); await Promise.all([first, duplicate]); await settle();
    const phases = [];
    const unsubscribe = f.composition.controller.subscribe(() => phases.push(f.composition.controller.getSnapshot().phase));
    await f.composition.controller.hangup();
    unsubscribe();
    assert.equal(ends, 1);
    assert.ok(!phases.includes('ENDING'));
    assert.equal(f.composition.controller.getSnapshot().phase, 'ENDED');
  } finally { gate.resolve(); await f.product.dispose(); }
});

test('acknowledged ENDING is polled without native End sending another command', async () => {
  const f = fixture();
  try {
    await f.active(); let ends = 0;
    f.services.api.act = async () => { ends++; f.model.state = 'ENDING'; f.model.version++; return { ...f.model }; };
    await f.composition.controller.hangup(); await settle();
    const phases = [];
    const unsubscribe = f.composition.controller.subscribe(() => phases.push(f.composition.controller.getSnapshot().phase));
    await f.composition.controller.hangup(); await f.composition.controller.refreshEndStatus();
    assert.equal(ends, 1);
    assert.ok(!phases.includes('ENDING'));
    assert.equal(f.composition.controller.getSnapshot().endStatus, 'pending');
    f.model.state = 'ENDED'; f.model.version++; f.model.ended_at = new Date().toISOString();
    await f.composition.controller.refreshEndStatus(); unsubscribe();
    assert.equal(f.composition.controller.getSnapshot().endStatus, 'terminal');
  } finally { await f.product.dispose(); }
});

test('an unresolved End remains explicitly retryable after failed readback', async () => {
  const f = fixture();
  try {
    await f.active(); let ends = 0;
    const act = f.services.api.act, get = f.services.api.getCall;
    f.services.api.act = async (...args) => { ends++; if (ends === 1) throw Error('offline'); return act(...args); };
    f.services.api.getCall = async () => { throw Error('offline'); };
    await f.composition.controller.hangup(); await settle();
    assert.equal(f.composition.controller.getSnapshot().endStatus, 'unconfirmed');
    f.services.api.getCall = get;
    await f.composition.controller.hangup();
    assert.equal(ends, 2);
    assert.equal(f.composition.controller.getSnapshot().endStatus, 'terminal');
  } finally { await f.product.dispose(); }
});

test('a stale ENDING version cannot certify completion or request new admission', async () => {
  const f = fixture(false, { connectionRecovery: true });
  try {
    await f.active(); const previous = { ...f.model };
    f.services.api.getCall = async () => ({ ...previous, state: 'ENDING', version: previous.version - 1 });
    f.emit('offline'); await f.composition.controller.connectionLost(); await settle();
    assert.equal(f.counts().credentialCount, 1);
    assert.notEqual(f.composition.controller.getSnapshot().error, null);
    assert.equal(f.events.filter(event => event === 'client-created').length, 1);
  } finally { await f.product.dispose(); }
});

test('synchronous End callbacks share the published request before native teardown starts', async () => {
  const f = fixture(), gate = deferred();
  let unsubscribe = () => {};
  try {
    await f.active(); let ends = 0, nested, invoked = false;
    const owner = f.composition.owner();
    const act = f.services.api.act;
    f.services.api.act = async (...args) => { ends++; await gate.promise; return act(...args); };
    unsubscribe = f.composition.controller.subscribe(() => {
      if (!invoked && f.composition.controller.getSnapshot().phase === 'ENDING') {
        invoked = true; nested = f.composition.controller.hangup();
      }
    });
    const first = f.composition.controller.hangup();
    assert.equal(nested, first);
    assert.equal(ends, 1);
    gate.resolve(); await first; await owner.release(); await settle();
    assert.equal(f.composition.controller.canDismissCompletedCall(), true);
  } finally { unsubscribe(); gate.resolve(); await f.product.dispose(); }
});

test('failed SDK teardown cannot be certified by repeating an acknowledged backend End', async () => {
  const f = fixture();
  try {
    await f.active(); let ends = 0;
    const act = f.services.api.act, leave = f.handle.leave;
    f.services.api.act = async (...args) => { ends++; return act(...args); };
    f.handle.leave = async () => { throw Error('SDK release unavailable'); };
    await f.composition.controller.hangup(); await settle();
    assert.equal(f.composition.controller.getSnapshot().localShutdown.sdkLeave, 'failed');
    assert.equal(f.composition.controller.canDismissCompletedCall(), false);
    f.handle.leave = leave;
    await f.composition.controller.hangup();
    assert.equal(ends, 1);
    assert.equal(f.composition.controller.getSnapshot().phase, 'ENDED');
    assert.equal(f.composition.controller.getSnapshot().localShutdown.sdkLeave, 'failed');
    assert.equal(f.composition.controller.canDismissCompletedCall(), false);
  } finally { await f.product.dispose(); }
});

test('an old pending End cannot block or overwrite a successor after independent terminal readback', async () => {
  const f = fixture(), gate = deferred();
  try {
    await f.active();
    const old = { ...f.model }, act = f.services.api.act;
    let ends = 0;
    f.services.api.act = async (...args) => {
      if (args[1] === 'end') ends++;
      if (args[0] === old.id) {
        await gate.promise;
        return { ...old, state: 'ENDED', version: old.version + 1, ended_at: new Date().toISOString() };
      }
      return act(...args);
    };
    const first = f.composition.controller.hangup();
    await settle();
    f.model.state = 'ENDED'; f.model.version++; f.model.ended_at = new Date().toISOString();
    await f.composition.controller.refresh(); await settle();
    assert.equal(f.composition.controller.dismissCompletedCall(), true);
    await f.active();
    const successorId = f.model.id;
    assert.notEqual(successorId, old.id);
    const second = f.composition.controller.hangup();
    assert.notEqual(first, second);
    await second; await settle();
    gate.resolve(); await first;
    const view = f.composition.controller.getSnapshot();
    assert.equal(ends, 2);
    assert.equal(view.session.id, successorId);
    assert.equal(view.phase, 'ENDED');
    assert.equal(view.endStatus, 'terminal');
  } finally { gate.resolve(); await f.product.dispose(); }
});
