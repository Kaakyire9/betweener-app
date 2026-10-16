import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatCircleMemberCount,
  groupCircleMemberPreviewRows,
  resolveCircleMemberPreviewAvatar,
} from '../lib/circles/circle-member-previews.ts';

test('Circle preview avatars prefer the current profile photo with safe media fallbacks', () => {
  assert.equal(resolveCircleMemberPreviewAvatar({
    avatar_url: ' avatar.jpg ',
    hero_image_url: 'hero.jpg',
    photos: ['gallery.jpg'],
  }), 'avatar.jpg');
  assert.equal(resolveCircleMemberPreviewAvatar({
    avatar_url: null,
    hero_image_url: 'hero.jpg',
    photos: ['gallery.jpg'],
  }), 'hero.jpg');
  assert.equal(resolveCircleMemberPreviewAvatar({
    avatar_url: null,
    hero_image_url: null,
    photos: ['', 'gallery.jpg'],
  }), 'gallery.jpg');
});

test('Circle previews are deduplicated and capped independently per Circle', () => {
  const previews = groupCircleMemberPreviewRows([
    { circle_id: 'circle-a', profile_id: 'profile-1', full_name: 'Ama', avatar_url: 'ama.jpg' },
    { circle_id: 'circle-a', profile_id: 'profile-1', full_name: 'Ama', avatar_url: 'ama.jpg' },
    { circle_id: 'circle-a', profile_id: 'profile-2', full_name: 'Kojo', hero_image_url: 'kojo.jpg' },
    { circle_id: 'circle-a', profile_id: 'profile-3', full_name: 'Esi', photos: ['esi.jpg'] },
    { circle_id: 'circle-a', profile_id: 'profile-4', full_name: 'Yaw', avatar_url: 'yaw.jpg' },
    { circle_id: 'circle-b', profile_id: 'profile-5', full_name: 'Akosua', avatar_url: 'akosua.jpg' },
  ], 3);

  assert.deepEqual(previews['circle-a']?.map((member) => member.profile_id), [
    'profile-1',
    'profile-2',
    'profile-3',
  ]);
  assert.deepEqual(previews['circle-b']?.map((member) => member.profile_id), ['profile-5']);
});

test('Circle member-count labels remain exact and grammatically correct', () => {
  assert.equal(formatCircleMemberCount(null), '0 members');
  assert.equal(formatCircleMemberCount(1), '1 member');
  assert.equal(formatCircleMemberCount(12), '12 members');
});
