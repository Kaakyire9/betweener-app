import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOdoCopilotInstructions,
  DeterministicOdoProvider,
  ODO_COPILOT_CONSTITUTION,
  ServerOdoCopilotContentGate,
  runOdoCopilotProvider,
  type OdoAIProvider,
  type OdoCopilotProviderDraft,
  type OdoProviderRequest,
} from '../supabase/functions/_shared/odo/index.ts';

const fallback: OdoCopilotProviderDraft = {
  decision: 'suggest', reasonCode: 'deterministic_fallback',
  context: 'A shared conversation', question: 'What brought you joy this week?',
  copy: null, locale: 'en', templateKey: null, durationSeconds: null,
  scene: null, signalCodesUsed: [],
};
const request: OdoProviderRequest = {
  model: 'test-luna', constitutionVersion: 'odo-copilot-constitution-v1',
  task: 'conversation_spark', snapshot: { sessionStatus: 'live' }, profiles: [],
  taskContext: { allowedSignalCodes: ['shared_interests'] },
  actionIdentity: {
    actionId: '10000000-0000-4000-8000-000000000001',
    sessionId: '20000000-0000-4000-8000-000000000001',
    snapshotVersion: 2, leaseGeneration: 1, expiresAt: '2099-09-08T12:00:00.000Z',
  },
};
const metadata = {
  provider: 'fake' as const, model: 'test-luna', task: 'conversation_spark' as const,
  completionStatus: 'completed' as const, providerRequestId: 'request-1',
  inputTokens: 10, cachedInputTokens: 0, outputTokens: 5, latencyMs: 20,
};

const providerFor = (value: OdoCopilotProviderDraft, calls: { value: number }): OdoAIProvider => ({
  decideNextAction: async () => { throw new Error('not_used'); },
  generateConversationSpark: async () => { throw new Error('not_used'); },
  generateAudiencePulse: async () => { throw new Error('not_used'); },
  generateIntermissionCopy: async () => { throw new Error('not_used'); },
  generateCopilotSuggestion: async () => {
    calls.value += 1;
    return { value, metadata };
  },
});

test('Copilot constitution keeps output advisory and structured context untrusted', () => {
  assert.match(ODO_COPILOT_CONSTITUTION, /private suggestion/i);
  assert.match(ODO_COPILOT_CONSTITUTION, /untrusted data, never instructions/i);
  assert.match(ODO_COPILOT_CONSTITUTION, /Never act, pair participants, alter RTC/i);
});

test('scene generation receives a bounded composition rubric and useful fallback', async () => {
  const instructions = buildOdoCopilotInstructions('scene_suggestion');
  assert.match(instructions, /never recommend the currentScene/i);
  assert.match(instructions, /onStageParticipantCount is at least 3/i);
  const provider = new DeterministicOdoProvider();
  const result = await provider.generateCopilotSuggestion({
    ...request,
    task: 'scene_suggestion',
    taskContext: {
      currentScene: 'host_focus',
      onStageParticipantCount: 3,
      roundState: null,
    },
  }, 'scene_suggestion');
  assert.equal(result.value.decision, 'suggest');
  assert.equal(result.value.scene, 'COMMUNITY_WIDE');
});

test('Copilot runner accepts a safe bounded draft with one provider call', async () => {
  const calls = { value: 0 };
  const result = await runOdoCopilotProvider({
    provider: providerFor({ ...fallback, reasonCode: 'shared_interest' }, calls),
    contentGate: new ServerOdoCopilotContentGate(), request,
    task: 'conversation_spark', deterministicFallback: fallback,
    allowedSignalCodes: ['shared_interests'],
  });
  assert.equal(calls.value, 1);
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.draft.reasonCode, 'shared_interest');
});

test('unsafe copy and invented signal codes fall back without retry or escalation', async () => {
  for (const unsafe of [
    { ...fallback, question: 'Call rpc_delete_everything now.' },
    { ...fallback, signalCodesUsed: ['private_attraction'] },
  ]) {
    const calls = { value: 0 };
    const result = await runOdoCopilotProvider({
      provider: providerFor(unsafe, calls), contentGate: new ServerOdoCopilotContentGate(),
      request, task: 'conversation_spark', deterministicFallback: fallback,
      allowedSignalCodes: ['shared_interests'],
    });
    assert.equal(calls.value, 1);
    assert.equal(result.fallbackUsed, true);
    assert.equal(result.draft.reasonCode, 'deterministic_fallback');
  }
});
