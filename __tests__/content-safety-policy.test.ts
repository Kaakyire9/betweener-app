import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessPrivateMessageRules,
  mergeChatImageSafetyAssessments,
  mergeContentSafetyAssessments,
} from '../supabase/functions/_shared/content-safety.ts';

for (const text of [
    'Would you like to visit the museum this weekend?',
    'Here is my number +44 7700 900000 if you prefer to call after our date.',
    'I work in banking and enjoy photography.',
  ]) {
  test(`allows ordinary conversation: ${text}`, () => {
    assert.equal(assessPrivateMessageRules(text).decision, 'ALLOW');
  });
}

for (const text of [
    'Subscribe to my private photos on onlyfans.',
    'Pay me in crypto for access to my private content.',
    'Message me on Signal +44 7700 900000 for my membership.',
    'My escort rates are available if you ask.',
    'I will hurt you if you report me.',
  ]) {
  test(`blocks explicit unsafe content: ${text}`, () => {
    assert.equal(assessPrivateMessageRules(text).decision, 'BLOCK');
  });
}

  test('recognizes compact platform evasion', () => {
    const result = assessPrivateMessageRules('Subscribe through o n l y f a n s for private photos');
    assert.equal(result.decision, 'BLOCK');
    assert.ok(result.categories.includes('paid_content_promotion'));
  });

  test('keeps the strongest result when provider assessments are merged', () => {
    const allow = assessPrivateMessageRules('Hello there');
    const review = { ...allow, decision: 'REVIEW' as const, riskScore: 0.7, categories: ['spam'] };
    const blocked = { ...allow, decision: 'BLOCK' as const, riskScore: 0.95, categories: ['violence'] };
    const result = mergeContentSafetyAssessments(allow, review, blocked);
    assert.equal(result.decision, 'BLOCK');
    assert.ok(result.categories.includes('spam'));
    assert.ok(result.categories.includes('violence'));
    assert.equal(result.riskScore, 0.95);
  });

test('does not penalize a safe private image for an OCR provider timeout', () => {
  const safe = assessPrivateMessageRules('safe image');
  const timeout = {
    ...safe,
    decision: 'REVIEW' as const,
    categories: ['provider_unavailable'],
    riskScore: 1,
    failureReason: 'OPENAI_VISION_TIMEOUT',
  };
  const result = mergeChatImageSafetyAssessments(safe, timeout);

  assert.equal(result.decision, 'ALLOW');
  assert.equal(result.riskScore, 0);
  assert.equal(result.failureReason, 'OPENAI_VISION_TIMEOUT');
  assert.ok(result.categories.includes('solicitation_scan_degraded'));
});

test('still holds a genuinely suspicious private image for review', () => {
  const safe = assessPrivateMessageRules('safe image');
  const suspicious = {
    ...safe,
    decision: 'REVIEW' as const,
    categories: ['paid_content_promotion'],
    riskScore: 0.72,
  };

  assert.equal(mergeChatImageSafetyAssessments(safe, suspicious).decision, 'REVIEW');
});

test('still blocks harmful private images when the OCR provider times out', () => {
  const safe = assessPrivateMessageRules('safe image');
  const harmful = {
    ...safe,
    decision: 'BLOCK' as const,
    categories: ['violence'],
    riskScore: 0.99,
  };
  const timeout = {
    ...safe,
    decision: 'REVIEW' as const,
    categories: ['provider_unavailable'],
    riskScore: 1,
    failureReason: 'OPENAI_VISION_TIMEOUT',
  };

  assert.equal(mergeChatImageSafetyAssessments(harmful, timeout).decision, 'BLOCK');
});
