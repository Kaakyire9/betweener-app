const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createDockerRunner, cleanupResources, SQL_TIMEOUT_MS } = require('../scripts/lib/connect-test-runtime.cjs');

test('Docker commands have a hard deadline and cannot leak credential arguments', () => {
  const args = ['exec', '-e', 'PGPASSWORD=private-password', 'db', 'psql'];
  const runner = createDockerRunner({ execSync: (_command, _args, options) => {
    assert.equal(options.timeout, 30_000);
    assert.equal(options.killSignal, 'SIGKILL');
    throw Object.assign(new Error(`Command failed: ${args.join(' ')}`), {
      code: 'ETIMEDOUT', stderr: 'private-password postgres://admin:secret@db/postgres',
    });
  } });
  assert.throws(() => runner.sync(args), error => {
    assert.equal(error.code, 'LOCAL_DOCKER_TIMEOUT');
    assert.doesNotMatch(error.stack + error.stderr, /private-password|admin:secret/);
    return true;
  });
});

test('SQL authorization errors stay available without including command arguments', () => {
  const runner = createDockerRunner({ execSync: () => {
    throw Object.assign(new Error('unsafe command'), { stderr: 'ERROR: permission denied for table connect_sessions' });
  } });
  assert.throws(() => runner.sync(['exec', 'db', 'psql']), /permission denied/);
  assert.throws(() => runner.sync(['run', '-e', 'PGRST_JWT_SECRET=secret']), error => {
    assert.equal(error.message, 'LOCAL_DOCKER_FAILED'); return true;
  });
});

function processFixture() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
  child.stdin.end = input => { child.input = input; };
  child.kill = signal => { child.killedWith = signal; };
  return child;
}

test('stalled concurrent SQL rejects promptly and ignores late completion', async () => {
  const child = processFixture();
  const runner = createDockerRunner({ spawnProcess: () => child });
  await assert.rejects(runner.concurrent(['exec', 'db', 'psql'], 'select 1', 10), { code: 'LOCAL_DOCKER_TIMEOUT' });
  assert.equal(child.killedWith, 'SIGKILL');
  child.emit('close', 0); child.emit('error', new Error('late failure'));
  assert.equal(child.input, 'select 1');
  assert.equal(SQL_TIMEOUT_MS, 120_000);
});

test('concurrent SQL returns output and preserves SQL failures', async () => {
  for (const code of [0, 1]) {
    const child = processFixture();
    const runner = createDockerRunner({ spawnProcess: () => child });
    const result = runner.concurrent(['exec', 'db', 'psql'], 'select 1');
    child.stdout.emit('data', '1\n'); child.stderr.emit('data', 'permission denied'); child.emit('close', code);
    if (code === 0) assert.equal(await result, '1\n');
    else await assert.rejects(result, /permission denied/);
  }
});

test('failed REST removal still attempts database removal and reports accurate outcomes', () => {
  const attempted = [];
  const result = cleanupResources([
    ['rest', () => { attempted.push('rest'); throw new Error('LOCAL_DOCKER_TIMEOUT'); }],
    ['database', () => { attempted.push('database'); }],
  ]);
  assert.deepEqual(attempted, ['rest', 'database']);
  assert.deepEqual(result.removed, { rest: false, database: true });
  assert.equal(result.errors.length, 1);
});

for (const failingOperation of ['createdb', 'run', 'unhealthy']) {
  test(`database harness handles ${failingOperation} before creation acknowledgement safely`, async () => {
    const calls = []; const receipts = []; const module = { exports: {} };
    const source = fs.readFileSync('scripts/lib/connect-test-database.cjs', 'utf8');
    const fakeDocker = args => {
      calls.push(args);
      if (args[0] === 'inspect' && args.includes('--format')) return failingOperation === 'unhealthy' ? 'unhealthy' : 'healthy';
      if (args.includes('createdb') && failingOperation === 'createdb' || args[0] === failingOperation) {
        throw Object.assign(new Error('LOCAL_DOCKER_TIMEOUT'), { code: 'LOCAL_DOCKER_TIMEOUT' });
      }
      if (args.includes('-Atc')) return 'f';
      if (args[0] === 'inspect') return JSON.stringify([{
        Config: { Env: ['POSTGRES_PASSWORD=local-fixture', 'PGRST_DB_URI=postgres://fixture@db/postgres'], Image: 'local-fixture-only' },
        NetworkSettings: { Networks: { fixture: {} } },
      }]);
      if (args[0] === 'ps') return 'owned-fixture-container';
      return Array.from({ length: 88 }, (_, i) => `ok ${i + 1}`).join('\n');
    };
    vm.runInNewContext(source, {
      module, __dirname: path.resolve('scripts/lib'), process: { pid: 12345 }, URL,
      console: { log: line => receipts.push(JSON.parse(line)) },
      require: name => name === './connect-test-runtime.cjs' ? {
        createDockerRunner: () => ({ sync: fakeDocker, concurrent: () => assert.fail('no concurrent SQL expected') }),
        cleanupResources, SQL_TIMEOUT_MS,
      } : name === 'node:fs' ? { readFileSync: () => '--fixture only' } : require(name),
    });
    await assert.rejects(module.exports.withConnectDatabase(() => assert.fail('test body must not run')),
      failingOperation === 'unhealthy' ? /unhealthy/ : { code: 'LOCAL_DOCKER_TIMEOUT' });
    const dropped = calls.filter(args => args.includes('dropdb'));
    assert.equal(dropped.length, failingOperation === 'unhealthy' ? 0 : 1);
    if (dropped.length) assert.match(dropped[0].at(-1), /^betweener_connect_security_test_12345_[a-f0-9]{16}$/);
    assert.equal(calls.filter(args => args[0] === 'rm').length, failingOperation === 'run' ? 1 : 0);
    assert.equal(receipts.at(-1).cleanupFailures, 0);
    assert.equal(receipts.at(-1).sharedAppDatabaseModified, false);
  });
}
