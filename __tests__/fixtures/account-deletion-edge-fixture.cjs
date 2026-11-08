/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const userId = 'f0110000-0000-4000-8000-000000000001';
const profileId = 'f0120000-0000-4000-8000-000000000001';
const requestId = 'f0990000-0000-4000-8000-000000000001';
const sourcePath = path.resolve(__dirname, '../../supabase/functions/delete-account/index.ts');
const source = fs.readFileSync(sourcePath, 'utf8').replace(/^import .* from .*;\r?\n/gm, '');
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function accountDeletionFixture(options = {}) {
  const events = [];
  let handler;

  function query(table) {
    let operation = 'select';
    let payload;
    const filters = [];
    const builder = {
      select() { return builder; },
      insert(value) { operation = 'insert'; payload = value; return builder; },
      update(value) { operation = 'update'; payload = value; return builder; },
      delete() { operation = 'delete'; return builder; },
      eq(key, value) { filters.push([key, value]); return builder; },
      or(value) { filters.push(['or', value]); return builder; },
      limit() { return builder; },
      single() { return builder; },
      maybeSingle() { return builder; },
      then(resolve, reject) {
        events.push({ kind: 'query', table, operation, payload, filters });
        if (table === 'profiles' && operation !== 'select') {
          throw Error('Direct profile writes must use the guarded deletion RPC');
        }
        let data = null;
        if (table === 'profiles') data = options.noProfile ? null : { id: profileId };
        if (table === 'account_deletion_requests' && operation === 'insert') {
          data = options.missingRequest ? null : { id: requestId };
        }
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return builder;
  }

  const service = {
    from: query,
    async rpc(name, args) {
      events.push({ kind: 'mask', name, args });
      return {
        data: options.noProfile ? null : profileId,
        error: options.maskError ? { message: 'Mask failed' } : null,
      };
    },
    storage: {
      from(bucket) {
        return {
          async list(prefix) {
            events.push({ kind: 'storage-list', bucket, prefix });
            return { data: [], error: null };
          },
          async remove(paths) {
            events.push({ kind: 'storage-remove', bucket, paths });
            return { error: null };
          },
        };
      },
    },
    auth: {
      admin: {
        async deleteUser(id, softDelete) {
          events.push({ kind: 'auth-delete', userId: id, softDelete });
          return { error: null };
        },
      },
    },
  };
  vm.runInNewContext(javascript, {
    serve: callback => { handler = callback; },
    createClient(_url, key, config) {
      if (key === 'synthetic-public-key') {
        return { auth: { async getUser() {
          events.push({ kind: 'authenticate', header: config?.global?.headers?.Authorization });
          return options.unauthorized
            ? { data: { user: null }, error: { message: 'Unauthorized' } }
            : { data: { user: { id: userId, app_metadata: {} } }, error: null };
        } } };
      }
      return service;
    },
    getSupabasePublicApiKey: () => 'synthetic-public-key',
    getSupabaseAdminKey: () => 'synthetic-admin-key',
    corsHeaders: { 'Access-Control-Allow-Origin': '*' },
    Deno: { env: { get: () => 'https://unused.invalid' } },
    console: { warn() {}, error() {} },
    Response,
  }, { filename: sourcePath, timeout: 1000 });

  return {
    events, userId, profileId, requestId,
    run(body = { reasonKeys: ['privacy_concerns'] }) {
      return handler(new Request('https://unused.invalid/delete-account', {
        method: 'POST', headers: { Authorization: 'Bearer synthetic-owner', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }));
    },
  };
}
module.exports = { accountDeletionFixture };
