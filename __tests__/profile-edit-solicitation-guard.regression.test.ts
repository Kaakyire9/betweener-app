import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import {
  validatePublicProfileFields,
  validatePublicProfilePrompt,
} from '../lib/profile-guard/public-profile-fields.ts';
import { PROFILE_EDUCATION_OPTIONS } from '../lib/profile/education-options.ts';

const read = (path: string) => readFileSync(path, 'utf8');

test('edit-profile public fields reject solicitation while normal profile copy remains valid', () => {
  const normal = validatePublicProfileFields({
    full_name: 'Ama Mensah',
    bio: 'I enjoy museums, cooking, and long weekend walks.',
    occupation: 'Designer',
  });
  assert.equal(normal.allowed, true);

  const contact = validatePublicProfileFields({
    bio: 'WhatsApp me at +44 7700 900123',
  });
  assert.equal(contact.allowed, false);
  assert.ok(contact.fieldErrors.bio);
});

test('aggregate validation catches a contact number split across public fields', () => {
  const splitContact = validatePublicProfileFields({
    bio: 'Message me at +44 7700',
    occupation: '900123',
  });
  assert.equal(splitContact.allowed, false);
  assert.ok(splitContact.aggregateError);
});

test('custom and guess prompts share the same solicitation preflight', () => {
  assert.equal(validatePublicProfilePrompt({
    title: 'My ideal weekend',
    answer: 'A gallery, good food, and a long walk.',
  }).allowed, true);
  assert.equal(validatePublicProfilePrompt({
    title: 'Find me elsewhere',
    answer: 'WhatsApp me at +44 7700 900123',
  }).allowed, false);
});

test('v1.2 edit-profile media is approved at selection time and legacy staging remains gated', () => {
  const modal = read('components/ProfileEditModal.tsx');
  assert.match(modal, /const approveProfileMediaDraft/);
  assert.match(modal, /guardAndPublishProfileMediaV1_2/);
  assert.match(modal, /if \(isProfileMediaGuardV1_2Runtime\(\)\) \{/);
  assert.match(modal, /await approveProfileMediaDraft\(\{/);
  assert.match(modal, /Photo approved and protected/);
  assert.doesNotMatch(
    modal,
    /console\.error\('Error (?:uploading image|opening gallery|refining avatar media|refining hero media):', error\);\s*if \(presentProfileMediaError\(error\)\)/,
  );
});

test('offline reliability stays internal without a member-facing sync activity surface', () => {
  const queue = read('lib/offline/mutation-queue.ts');
  const layout = read('app/_layout.tsx');
  const memberFacingSources = [
    'app/(tabs)/profile.tsx',
    'app/profile-insights.tsx',
    'app/profile-view.tsx',
    'app/moments/index.tsx',
    'app/my-moments.tsx',
    'components/ProfileEditModal.tsx',
    'components/MomentCommentsModal.tsx',
    'components/profile/MeProfileStatusStack.tsx',
    'components/profile/BoostComposerModal.tsx',
  ].map(read).join('\n');
  assert.equal(existsSync('app/sync-activity.tsx'), false);
  assert.equal(existsSync('components/OfflineSyncStatusPill.tsx'), false);
  assert.equal(existsSync('components/OfflineSyncHistoryHydrator.tsx'), false);
  assert.equal(existsSync('components/profile/PremiumSyncNotice.tsx'), false);
  assert.equal(existsSync('hooks/useOfflineSyncStatus.ts'), false);
  assert.equal(existsSync('hooks/usePremiumOfflineQueueStatus.ts'), false);
  assert.equal(existsSync('lib/offline/offline-sync-history.ts'), false);
  assert.equal(existsSync('lib/offline/offline-sync-presenter.ts'), false);
  assert.equal(existsSync('lib/offline/moment-sync-issues.ts'), false);
  assert.doesNotMatch(layout, /OfflineSyncStatusPill|OfflineSyncHistoryHydrator/);
  assert.doesNotMatch(
    memberFacingSources,
    /Review sync|sync issue|sync status|Retry sync|PremiumSyncNotice|profileSync(?:Pending|Failed)/i,
  );
  assert.match(queue, /export async function drainOfflineMutationQueue/);
  assert.match(layout, /<OfflineMutationQueueHydrator \/>/);
});

test('Ghana and Global profiles share neutral education levels instead of a country school list', () => {
  const modal = read('components/ProfileEditModal.tsx');
  const options = [...PROFILE_EDUCATION_OPTIONS];
  assert.ok(options.includes('Vocational or trade school'));
  assert.ok(options.includes('Undergraduate student'));
  assert.ok(options.includes('Prefer not to say'));
  assert.equal(options.some((value) => /KNUST|University of Ghana|UPSA|Ashesi/i.test(value)), false);
  assert.match(modal, /<Text style=\{styles\.sectionTitle\}>Education<\/Text>/);
  assert.match(modal, /School, institution or qualification/);
  assert.doesNotMatch(modal, /formIsGhanaProfile \? 'Education' : 'Professional'/);
});
