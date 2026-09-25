import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('profile gallery multi-select isolates moderation and preserves approved photos', () => {
  const modal = read('components/ProfileEditModal.tsx');

  assert.match(modal, /allowsMultipleSelection: !isAvatar/);
  assert.match(modal, /await stageGalleryBatch\(result\.assets\)/);
  assert.match(modal, /for \(let index = 0; index < selectedAssets\.length; index \+= 1\)/);
  assert.match(modal, /localUris: \[stableUri\]/);
  assert.match(modal, /currentPhotos = normalizeGalleryPhotoList\(approved\.photos/);
  assert.match(modal, /rejected\.push\(/);
});

test('gallery rejections identify the selected photo and use a rejection-specific alert', () => {
  const modal = read('components/ProfileEditModal.tsx');
  const guard = read('lib/profile/profile-media-guard-v1-2.ts');

  assert.match(modal, /Photo \$\{index \+ 1\} \(\$\{fileName\}\)/);
  assert.match(modal, /'Photo rejected'/);
  assert.match(modal, /profileMediaGuardMessageV1_2\(error, label\)/);
  assert.match(guard, /profileMediaGuardMessageV1_2 = \(error: unknown, mediaLabel\?: string\)/);
  assert.match(guard, /\$\{subject\} contains nudity or sexual content/);
});

test('profile gallery measures its card instead of calculating from the window', () => {
  const gallery = read('components/PhotoGallery.tsx');

  assert.match(gallery, /onLayout=\{\(\{ nativeEvent \}\) =>/);
  assert.match(gallery, /availableGridWidth = gridWidth \|\| responsive\.contentWidth/);
  assert.match(gallery, /columnCount = availableGridWidth >= 320 \? 3 : 2/);
  assert.doesNotMatch(gallery, /responsive\.usableWidth - gridPadding/);
});

test('My Profile and Edit share the live media snapshot without a stale post-save reload', () => {
  const profile = read('app/(tabs)/profile.tsx');
  const modal = read('components/ProfileEditModal.tsx');

  assert.match(profile, /mediaSnapshot=\{profileEditMediaSnapshot\}/);
  assert.match(profile, /const profileEditMediaSnapshot = useMemo/);
  assert.match(profile, /photos: userPhotos/);
  assert.doesNotMatch(
    profile,
    /await refreshProfile\(\);\s*\/\/ This will update the profile state\s*await loadUserPhotos\(\)/,
  );
  assert.match(modal, /mediaSnapshot \? mediaSnapshot\.photos : \(profile as any\)\.photos/);
  assert.match(modal, /if \(mediaSnapshot\) return/);
});

test('My Profile deletion updates local, durable, and shared profile state together', () => {
  const profile = read('app/(tabs)/profile.tsx');

  assert.match(profile, /setUserPhotos\(updatedPhotos\)/);
  assert.match(profile, /writeMeSnapshot\(\{ photos: updatedPhotos, heroImageUrl: nextHeroImageUrl \}\)/);
  assert.match(profile, /await updateProfile\(\{\s*photos: updatedPhotos,\s*hero_image_url: nextHeroImageUrl/);
  assert.match(profile, /setUserPhotos\(previousPhotos\)/);
});
