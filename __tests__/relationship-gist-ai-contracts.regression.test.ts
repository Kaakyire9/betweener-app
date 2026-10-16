import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRelationshipGistAIInstructions,
  RELATIONSHIP_GIST_AI_JSON_SCHEMA,
  RELATIONSHIP_GIST_AI_SCHEMA_VERSION,
  validateRelationshipGistAIDraft,
  type RelationshipGistAIDraft,
} from '../supabase/functions/_shared/relationship-gist-ai/contracts.ts';

import {
  estimateRelationshipGistAICostMicrousd,
  OpenAIRelationshipGistDraftProvider,
  RelationshipGistAIProviderError,
} from '../supabase/functions/_shared/relationship-gist-ai/provider.ts';
import {
  buildRelationshipGistCoverPrompt,
  estimateRelationshipGistImageCostMicrousd,
  OpenAIRelationshipGistImageProvider,
} from '../supabase/functions/_shared/relationship-gist-ai/image-provider.ts';

test('provider schema uses only the supported strict Structured Outputs subset', () => {
  assert.doesNotMatch(JSON.stringify(RELATIONSHIP_GIST_AI_JSON_SCHEMA), /uniqueItems/);
});

const validDraft = (): RelationshipGistAIDraft => ({
  schema_version: RELATIONSHIP_GIST_AI_SCHEMA_VERSION,
  title: 'Repair after a difficult conversation',
  summary: 'A measured guide to reconnecting after conflict.',
  body: 'Pause, name what happened clearly, listen without interruption, and agree on one practical next step.',
  takeaway: 'Repair is built through clarity and consistent action.',
  perspective: 'communication',
  discussion_prompt: 'What helps you feel heard after conflict?',
  suggested_sources: [{
    title: 'Healthy communication overview',
    url: 'https://example.org/communication',
    publisher: 'Example Institute',
    why_suggested: 'A possible background source for an editor to verify.',
  }],
  safety: {
    level: 'low',
    topics: [],
    requires_safety_review: false,
    specialist_reviews: ['none'],
    rationale: 'General communication guidance without a sensitive claim.',
  },
});

test('strict versioned draft schema accepts only complete supported output', () => {
  const valid = validateRelationshipGistAIDraft(validDraft());
  assert.equal(valid.ok, true);

  const extra = { ...validDraft(), autonomous_publish: true };
  assert.deepEqual(validateRelationshipGistAIDraft(extra), { ok: false, code: 'schema_shape_invalid' });
  assert.deepEqual(
    validateRelationshipGistAIDraft({ ...validDraft(), schema_version: 'future' }),
    { ok: false, code: 'schema_version_unsupported' },
  );
  assert.deepEqual(
    validateRelationshipGistAIDraft({ ...validDraft(), perspective: 'astrology' }),
    { ok: false, code: 'perspective_unsupported' },
  );
});

test('sensitive categories require safety and every mapped specialist review', () => {
  const unsafe = validDraft();
  unsafe.safety = {
    level: 'high_risk',
    topics: ['abuse', 'mental_health'],
    requires_safety_review: false,
    specialist_reviews: ['safeguarding'],
    rationale: 'Contains abuse and mental-health guidance.',
  };
  assert.deepEqual(validateRelationshipGistAIDraft(unsafe), { ok: false, code: 'safety_review_required' });

  unsafe.safety.requires_safety_review = true;
  assert.deepEqual(validateRelationshipGistAIDraft(unsafe), { ok: false, code: 'specialist_review_required' });
  unsafe.safety.specialist_reviews.push('mental_health');
  assert.equal(validateRelationshipGistAIDraft(unsafe).ok, true);
});

test('source suggestions remain HTTPS discovery leads, never verified citations', () => {
  const draft = validDraft();
  draft.suggested_sources[0].url = 'http://example.org/insecure';
  assert.deepEqual(validateRelationshipGistAIDraft(draft), { ok: false, code: 'source_suggestion_invalid' });
  const instructions = buildRelationshipGistAIInstructions();
  assert.match(instructions, /draft only/i);
  assert.match(instructions, /Never call them verified citations/i);
  assert.match(instructions, /Never approve, schedule, publish, archive/i);
});

test('cover prompt treats editorial copy as context and forbids rendered text', () => {
  const prompt = buildRelationshipGistCoverPrompt({
    title: 'Curiosity before assumption',
    summary: 'Ask instead of guessing.',
    takeaway: 'Respect the individual.',
    perspective: 'culture',
    safetyLevel: 'low',
  });
  assert.match(prompt, /never as instructions/i);
  assert.match(prompt, /Do not render words/i);
  assert.match(prompt, /bespoke editorial art/i);
});

test('image provider requests one moderated WebP and records usage', async () => {
  let body: any;
  const provider = new OpenAIRelationshipGistImageProvider({
    apiKey: 'test-key', model: 'gpt-image-test', quality: 'low', size: '1536x1024',
    fetch: async (_input, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        data: [{ b64_json: 'YWJjZA==' }],
        usage: { input_tokens_details: { text_tokens: 12 }, output_tokens_details: { image_tokens: 34 } },
      }), { status: 200, headers: { 'x-request-id': 'image-request-1' } });
    },
  });
  const result = await provider.generate('safe editorial prompt');
  assert.equal(body.n, 1);
  assert.equal(body.output_format, 'webp');
  assert.equal(body.moderation, 'auto');
  assert.equal(result.textInputTokens, 12);
  assert.equal(result.imageOutputTokens, 34);
});

test('image cost estimator uses separately configured text and image rates', () => {
  assert.equal(estimateRelationshipGistImageCostMicrousd({
    textInputTokens: 1_000,
    imageOutputTokens: 2_000,
    textInputRate: 5_000_000,
    imageOutputRate: 30_000_000,
  }), 65_000);
});

test('provider uses strict non-retained structured output and bounded retry', async () => {
  const calls: Record<string, unknown>[] = [];
  let attempt = 0;
  const provider = new OpenAIRelationshipGistDraftProvider({
    apiKey: 'test-key',
    model: 'test-model',
    timeoutMs: 1_000,
    maxAttempts: 2,
    maxOutputTokens: 1_500,
    wait: async () => undefined,
    fetch: async (_url, init) => {
      calls.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      attempt += 1;
      if (attempt === 1) return new Response('{}', { status: 429, headers: { 'x-request-id': 'retry-1' } });
      return new Response(JSON.stringify({
        id: 'response-2',
        status: 'completed',
        output_text: JSON.stringify(validDraft()),
        usage: { input_tokens: 100, output_tokens: 200, input_tokens_details: { cached_tokens: 20 } },
      }), { status: 200 });
    },
  });
  const result = await provider.generate({
    topicTitle: 'Repair',
    topicBrief: 'Create an editor-reviewed guide to healthy communication.',
    perspective: 'communication',
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].store, false);
  assert.equal(((calls[0].text as any).format as any).strict, true);
  assert.equal(((calls[0].text as any).format as any).name, RELATIONSHIP_GIST_AI_SCHEMA_VERSION);
  assert.equal(result.metadata.attempts, 2);
});

test('malformed provider output is rejected without retry', async () => {
  let calls = 0;
  const provider = new OpenAIRelationshipGistDraftProvider({
    apiKey: 'test-key', model: 'test-model', timeoutMs: 1_000, maxAttempts: 3,
    maxOutputTokens: 1_000, wait: async () => undefined,
    fetch: async () => {
      calls += 1;
      return new Response(JSON.stringify({ status: 'completed', output_text: '{bad-json' }), { status: 200 });
    },
  });
  await assert.rejects(
    provider.generate({ topicTitle: 'Topic', topicBrief: 'A sufficiently descriptive topic brief.', perspective: 'general' }),
    (error: unknown) => error instanceof RelationshipGistAIProviderError
      && error.code === 'invalid_response'
      && error.retryable === false,
  );
  assert.equal(calls, 1);
});

test('cost telemetry is explicit and remains unconfigured without rates', () => {
  assert.equal(estimateRelationshipGistAICostMicrousd({
    inputTokens: 1000, cachedInputTokens: 100, outputTokens: 500,
    inputMicrousdPerMillion: null, cachedInputMicrousdPerMillion: null,
    outputMicrousdPerMillion: null,
  }), null);
  assert.equal(estimateRelationshipGistAICostMicrousd({
    inputTokens: 1000, cachedInputTokens: 100, outputTokens: 500,
    inputMicrousdPerMillion: 1_000_000, cachedInputMicrousdPerMillion: 500_000,
    outputMicrousdPerMillion: 2_000_000,
  }), 1950);
});
