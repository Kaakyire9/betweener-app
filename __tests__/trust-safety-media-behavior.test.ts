import assert from 'node:assert/strict';
import test from 'node:test';
import QRCode from 'qrcode';
import sharp from 'sharp';
import {
  publishCapturedBytes,
  requireSafeViewOncePlaintextHash,
  type ImmutableMediaStore,
} from '../supabase/functions/_shared/immutable-media-publication.ts';
import {
  assessMediaExtractedText,
} from '../supabase/functions/_shared/media-extracted-text-policy.ts';
import { decodeQrPayloads } from '../supabase/functions/_shared/qr-decoder.ts';
import {
  combineProfileMediaEvidence,
  parseProfileMediaProviderPayload,
  profileMediaProviderFailureReason,
  type ProfileMediaPolicyAssessment,
} from '../supabase/functions/_shared/profile-media-policy-v1-2.ts';

const providerAssessment = (
  overrides: Partial<ProfileMediaPolicyAssessment> = {},
): ProfileMediaPolicyAssessment => ({
  decision: 'ALLOW',
  reason: 'NONE',
  categories: [],
  riskScore: 0,
  provider: 'test',
  model: 'test',
  providerRequestId: null,
  extractedText: null,
  scores: { nudity: 0, sexual: 0, violence: 0, hate: 0, contact: 0, promotion: 0, qr_code: 0 },
  failureReason: null,
  faceCount: 0,
  primaryFaceClear: false,
  visualSignals: {
    visibleContactInformation: false,
    visibleExternalUrl: false,
    visibleSocialHandle: false,
    commercialPromotion: false,
    paidContentPromotion: false,
    sexualSolicitation: false,
    qrPresent: false,
    qrPayloadCategory: 'none',
  },
  providerVetoSuppressed: false,
  diagnostics: {
    requestBytes: 0,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    reasoningEffort: null,
  },
  ...overrides,
});

class MemoryMediaStore implements ImmutableMediaStore {
  objects = new Map<string, Uint8Array>();

  key(bucket: string, path: string) { return `${bucket}/${path}`; }

  async read(bucket: string, path: string) {
    const value = this.objects.get(this.key(bucket, path));
    if (!value) throw new Error('not_found');
    return value.slice();
  }

  async write(bucket: string, path: string, bytes: Uint8Array) {
    const key = this.key(bucket, path);
    if (this.objects.has(key)) throw new Error('immutable_conflict');
    this.objects.set(key, bytes.slice());
  }

  async remove(bucket: string, paths: string[]) {
    paths.forEach((path) => this.objects.delete(this.key(bucket, path)));
  }
}

test('normal chat publishes the captured bytes even if staging is overwritten after scan', async () => {
  const store = new MemoryMediaStore();
  const stagingKey = store.key('staging', 'sender/message/image.jpg');
  const original = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
  const attackerReplacement = new Uint8Array([0xff, 0xd8, 0xff, 9, 9, 9]);
  store.objects.set(stagingKey, original.slice());

  const captured = await store.read('staging', 'sender/message/image.jpg');
  store.objects.set(stagingKey, attackerReplacement.slice());
  await publishCapturedBytes({
    store,
    capturedBytes: captured,
    finalBucket: 'chat-media',
    finalPath: 'sender/receiver/message/immutable.jpg',
    mime: 'image/jpeg',
  });

  assert.deepEqual(
    await store.read('chat-media', 'sender/receiver/message/immutable.jpg'),
    original,
  );
  assert.notDeepEqual(
    await store.read('chat-media', 'sender/receiver/message/immutable.jpg'),
    attackerReplacement,
  );
});

test('content-addressed profile publication reuses only byte-identical immutable objects', async () => {
  const store = new MemoryMediaStore();
  const exact = new Uint8Array([0xff, 0xd8, 0xff, 4, 5, 6]);
  const different = new Uint8Array([0xff, 0xd8, 0xff, 7, 8, 9]);
  const finalPath = `user/${'a'.repeat(64)}.jpg`;
  store.objects.set(store.key('moderated-profile-media', finalPath), exact.slice());

  await publishCapturedBytes({
    store,
    capturedBytes: exact,
    finalBucket: 'moderated-profile-media',
    finalPath,
    mime: 'image/jpeg',
    allowExistingExact: true,
  });
  await assert.rejects(publishCapturedBytes({
    store,
    capturedBytes: different,
    finalBucket: 'moderated-profile-media',
    finalPath,
    mime: 'image/jpeg',
    allowExistingExact: true,
  }), /immutable_conflict/);
  assert.deepEqual(await store.read('moderated-profile-media', finalPath), exact);
});

test('view-once exact hash matcher runs and a match prevents later encryption', async () => {
  const calls: string[] = [];
  let encrypted = false;
  await assert.rejects(async () => {
    await requireSafeViewOncePlaintextHash({
      sha256: 'a'.repeat(64),
      match: async (sha256) => {
        calls.push(sha256);
        return { authorized: true, matched: true };
      },
    });
    encrypted = true;
  }, /unsafe_hash_matched/);
  assert.deepEqual(calls, ['a'.repeat(64)]);
  assert.equal(encrypted, false);
});

test('surface-aware OCR text policy enforces public contact rules without overblocking chat', () => {
  assert.equal(assessMediaExtractedText('Welcome to Bristol', 'public_profile_media').decision, 'ALLOW');
  assert.equal(assessMediaExtractedText('WhatsApp +44 7123 456789', 'public_profile_media').decision, 'BLOCK');
  assert.equal(assessMediaExtractedText('Find me @testuser', 'public_profile_media').decision, 'BLOCK');
  assert.equal(assessMediaExtractedText('example.com/private', 'public_profile_media').decision, 'BLOCK');
  assert.equal(assessMediaExtractedText('Subscribe to my private page', 'public_profile_media').decision, 'BLOCK');
  assert.equal(assessMediaExtractedText('Call me on +44 7123 456789', 'private_chat_media').decision, 'ALLOW');
  assert.equal(assessMediaExtractedText('Subscribe to my private page', 'private_chat_media').decision, 'BLOCK');
});

test('OCR policy normalizes international decimal digits and invisible separators', () => {
  assert.equal(
    assessMediaExtractedText('WhatsApp +٤٤​ ٧١٢٣ ٤٥٦٧٨٩', 'public_profile_media').decision,
    'BLOCK',
  );
  assert.equal(
    assessMediaExtractedText('WhatsApp +۴۴ ۷۱۲۳ ۴۵۶۷۸۹', 'public_profile_media').decision,
    'BLOCK',
  );
  assert.equal(
    assessMediaExtractedText('WhatsApp +４４ ７１２３ ４５６７８９', 'public_profile_media').decision,
    'BLOCK',
  );
});

test('deterministic QR decoder exposes an external contact URL to public-profile policy', async () => {
  const png = await QRCode.toBuffer('https://example.com/private', { type: 'png', width: 320 });
  const decoded = await decodeQrPayloads(new Uint8Array(png), 'image/png');
  assert.equal(decoded.failureReason, null);
  assert.deepEqual(decoded.payloads, ['https://example.com/private']);
  assert.equal(assessMediaExtractedText(decoded.payloads.join(' '), 'public_profile_media').decision, 'BLOCK');
});

test('benign QR payload is decoded and allowed by the actual destination policy', async () => {
  const png = await QRCode.toBuffer('Welcome to Bristol', { type: 'png', width: 320 });
  const decoded = await decodeQrPayloads(new Uint8Array(png), 'image/png');
  assert.equal(decoded.failureReason, null);
  assert.deepEqual(decoded.payloads, ['Welcome to Bristol']);
  assert.equal(assessMediaExtractedText(decoded.payloads.join(' '), 'public_profile_media').decision, 'ALLOW');
});

test('public-profile QR payload matrix evaluates decoded content, not QR presence', async () => {
  const cases = [
    ['Welcome to Bristol', 'ALLOW'],
    ['Be kind', 'ALLOW'],
    ['https://example.com/private', 'BLOCK'],
    ['+44 7123 456789', 'BLOCK'],
    ['@testuser', 'BLOCK'],
    ['Subscribe to my private page', 'BLOCK'],
  ] as const;
  for (const [payload, expected] of cases) {
    const png = await QRCode.toBuffer(payload, { type: 'png', width: 320 });
    const decoded = await decodeQrPayloads(new Uint8Array(png), 'image/png');
    assert.deepEqual(decoded.payloads, [payload]);
    assert.equal(
      assessMediaExtractedText(decoded.payloads.join(' '), 'public_profile_media').decision,
      expected,
      payload,
    );
  }
});

test('1024px policy-scan derivatives preserve QR payload decisions', async () => {
  const cases = [
    ['Welcome to Bristol', 'ALLOW'],
    ['https://example.com/private', 'BLOCK'],
    ['+44 7123 456789', 'BLOCK'],
    ['@testuser', 'BLOCK'],
    ['Subscribe to my private page', 'BLOCK'],
  ] as const;
  for (const [payload, expected] of cases) {
    const original = await QRCode.toBuffer(payload, { type: 'png', width: 1600 });
    const derivative = await sharp(original).resize({
      width: 1024,
      height: 1024,
      fit: 'contain',
    }).png().toBuffer();
    const decoded = await decodeQrPayloads(new Uint8Array(derivative), 'image/png');
    assert.equal(decoded.width, 1024);
    assert.equal(decoded.height, 1024);
    assert.deepEqual(decoded.payloads, [payload]);
    assert.equal(
      assessMediaExtractedText(decoded.payloads.join(' '), 'public_profile_media').decision,
      expected,
      payload,
    );
  }
});

test('an image without QR or contact text remains allowed', async () => {
  const png = await sharp({
    create: { width: 320, height: 320, channels: 4, background: '#f8f4ec' },
  }).png().toBuffer();
  const decoded = await decodeQrPayloads(new Uint8Array(png), 'image/png');
  assert.deepEqual(decoded.payloads, []);
  const text = assessMediaExtractedText('A quiet afternoon in Bristol', 'public_profile_media');
  assert.equal(text.decision, 'ALLOW');
  assert.equal(combineProfileMediaEvidence(providerAssessment(), text, false).decision, 'ALLOW');
});

test('visible contact text without QR is rejected deterministically', () => {
  const text = assessMediaExtractedText('Call me on +44 7123 456789', 'public_profile_media');
  const combined = combineProfileMediaEvidence(providerAssessment(), text, false);
  assert.equal(combined.decision, 'BLOCK');
  assert.equal(combined.reason, 'CONTACT_OR_PROMOTION');
});

test('explicit nudity remains the rejection reason when contact evidence also exists', () => {
  const provider = providerAssessment({
    decision: 'BLOCK',
    reason: 'EXPLICIT_NUDITY',
    categories: ['sexual'],
    riskScore: 0.99,
    scores: { nudity: 0.99, sexual: 0.96, violence: 0, hate: 0, contact: 0, promotion: 0, qr_code: 0 },
  });
  const text = assessMediaExtractedText('Call me on +44 7123 456789', 'public_profile_media');
  const combined = combineProfileMediaEvidence(provider, text, false);

  assert.equal(combined.decision, 'BLOCK');
  assert.equal(combined.reason, 'EXPLICIT_NUDITY');
  assert.ok(combined.categories.includes('sexual'));
  assert.ok(combined.categories.includes('PHONE_CONTACT'));
});

test('an unsubstantiated provider QR/contact veto cannot override benign decoded evidence', () => {
  const text = assessMediaExtractedText(
    'Welcome to Bristol A quiet afternoon',
    'public_profile_media',
  );
  const provider = providerAssessment({
    decision: 'BLOCK',
    reason: 'CONTACT_OR_PROMOTION',
    categories: ['contact_or_promotion'],
    riskScore: 1,
    scores: { nudity: 0, sexual: 0, violence: 0, hate: 0, contact: 1, promotion: 1, qr_code: 1 },
    visualSignals: {
      ...providerAssessment().visualSignals,
      qrPresent: true,
      qrPayloadCategory: 'plain_text',
    },
  });
  const combined = combineProfileMediaEvidence(provider, text, true);
  assert.equal(combined.decision, 'ALLOW');
  assert.equal(combined.reason, 'NONE');
  assert.equal(combined.providerVetoSuppressed, true);
});

test('explicit provider visual solicitation still rejects when OCR and QR miss it', () => {
  const provider = providerAssessment({
    decision: 'BLOCK',
    reason: 'CONTACT_OR_PROMOTION',
    categories: ['commercial_promotion'],
    riskScore: 0.98,
    visualSignals: {
      ...providerAssessment().visualSignals,
      commercialPromotion: true,
    },
  });
  const combined = combineProfileMediaEvidence(
    provider,
    assessMediaExtractedText('', 'public_profile_media'),
    false,
  );
  assert.equal(combined.decision, 'BLOCK');
  assert.equal(combined.providerVetoSuppressed, false);
});

test('malicious decoded QR evidence rejects even when the provider allows it', () => {
  const text = assessMediaExtractedText('https://example.com/private', 'public_profile_media');
  const combined = combineProfileMediaEvidence(providerAssessment(), text, true);
  assert.equal(combined.decision, 'BLOCK');
  assert.equal(combined.reason, 'QR_CODE');
  assert.ok(combined.categories.includes('EXTERNAL_URL'));
});

test('malformed profile-media provider output is never accepted as a final decision', () => {
  assert.equal(parseProfileMediaProviderPayload(null), null);
  assert.equal(parseProfileMediaProviderPayload({ decision: 'ALLOW' }), null);
  assert.equal(parseProfileMediaProviderPayload({
    decision: 'ALLOW',
    reason: 'NONE',
    categories: [],
    risk_score: 0,
    extracted_text: '',
    face_count: 0,
    primary_face_clear: false,
    qr_present: true,
    qr_payload_category: 'plain_text',
    scores: {},
  }), null);
});

test('profile-media provider timeouts remain retryable provider failures', () => {
  assert.equal(
    profileMediaProviderFailureReason(new DOMException('timed out', 'AbortError')),
    'OPENAI_PROFILE_MEDIA_TIMEOUT',
  );
  assert.equal(
    profileMediaProviderFailureReason(new Error('malformed response')),
    'OPENAI_PROFILE_MEDIA_INVALID_RESPONSE',
  );
});
