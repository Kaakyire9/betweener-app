import assert from 'node:assert/strict';
import test from 'node:test';

import { relationshipGistAIErrorMessage } from '../features/relationship-gists/ai/relationship-gist-ai-errors.ts';

test('AI editorial errors direct owner briefs into the streamlined generation flow', () => {
  assert.equal(
    relationshipGistAIErrorMessage({
      code: '42501',
      message: 'gist_ai_topic_self_approval_forbidden',
    }),
    'Use “Generate AI draft” to prepare and generate from your own brief.',
  );
});

test('AI editorial errors explain incomplete owner review gates', () => {
  assert.equal(
    relationshipGistAIErrorMessage({ message: 'gist_ai_source_review_required' }),
    'Verify or reject every suggested source before publishing.',
  );
  assert.equal(
    relationshipGistAIErrorMessage({ message: 'gist_ai_specialist_review_required' }),
    'Complete every safety acknowledgement before publishing.',
  );
});

test('AI editorial errors do not expose unknown backend details', () => {
  assert.equal(
    relationshipGistAIErrorMessage({ code: 'XX000', details: 'private database detail' }),
    'The operation could not be completed.',
  );
});
