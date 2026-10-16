import assert from 'node:assert/strict';
import test from 'node:test';

import { generateRelationshipGistAIDraft } from '../features/relationship-gists/ai/relationship-gist-ai-repository.ts';

const functionError = (payload: Record<string, unknown>) => ({
  message: 'Edge Function returned a non-2xx status code',
  context: {
    clone() { return this; },
    async json() { return payload; },
  },
});

test('AI draft invocation retries the same idempotent job once after a retryable failure', async () => {
  const calls: { body: Record<string, unknown> }[] = [];
  const client = {
    rpc: async () => ({ data: null, error: null }),
    functions: {
      invoke: async (_name: string, options: { body: Record<string, unknown> }) => {
        calls.push(options);
        if (calls.length === 1) {
          return {
            data: null,
            error: functionError({ code: 'GIST_AI_GENERATION_FAILED', jobId: 'job-1', retryable: true }),
          };
        }
        return { data: { ok: true, revisionId: 'revision-1' }, error: null };
      },
    },
  };

  const result = await generateRelationshipGistAIDraft(client, 'topic-1', 'idempotency-1');

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].body, calls[1].body);
  assert.equal(result.revisionId, 'revision-1');
});

test('AI draft invocation exposes allowlisted function codes without retrying terminal failures', async () => {
  let calls = 0;
  const client = {
    rpc: async () => ({ data: null, error: null }),
    functions: {
      invoke: async () => {
        calls += 1;
        return {
          data: null,
          error: functionError({ code: 'GIST_AI_OUTPUT_INVALID', jobId: 'job-2', retryable: false }),
        };
      },
    },
  };

  await assert.rejects(
    generateRelationshipGistAIDraft(client, 'topic-2', 'idempotency-2'),
    (error: any) => error.code === 'GIST_AI_OUTPUT_INVALID' && error.jobId === 'job-2',
  );
  assert.equal(calls, 1);
});
