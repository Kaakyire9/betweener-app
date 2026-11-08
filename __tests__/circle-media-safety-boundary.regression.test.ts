import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const migration = readFileSync(
  join(root, 'supabase/migrations/20261105231527_circle_media_asset_authority_v1.sql'),
  'utf8',
);
const mediaService = readFileSync(join(root, 'lib/circles/pulse/circle-pulse-service.ts'), 'utf8');
const mediaStorage = readFileSync(join(root, 'lib/circles/pulse/circle-pulse-media.ts'), 'utf8');
const mediaViewer = readFileSync(join(root, 'components/circles/CirclePulseMediaViewer.tsx'), 'utf8');
const posterSource = readFileSync(join(root, 'lib/circles/pulse/circle-pulse-video-poster.ts'), 'utf8');
const lifecycleMigration = readFileSync(
  join(root, 'supabase/migrations/20261105231539_circle_media_lifecycle_v1.sql'),
  'utf8',
);
const lifecycleWorker = readFileSync(
  join(root, 'supabase/functions/circle-media-lifecycle/index.ts'),
  'utf8',
);
const circlePulseHook = readFileSync(join(root, 'lib/circles/pulse/use-circle-pulse.ts'), 'utf8');
const consentMigration = readFileSync(
  join(root, 'supabase/migrations/20261105231608_circle_media_consent_moderation_v1.sql'),
  'utf8',
);
const moderationWorker = readFileSync(join(root, 'supabase/functions/circle-media-moderation/index.ts'), 'utf8');
const hubMigration = readFileSync(
  join(root, 'supabase/migrations/20261105231623_circle_media_hub_engagement_v1.sql'),
  'utf8',
);
const mediaHub = readFileSync(join(root, 'components/circles/CircleMediaHubSection.tsx'), 'utf8');
const consentRequests = readFileSync(join(root, 'components/circles/CircleMediaConsentRequests.tsx'), 'utf8');

test('Circle Media uses an RLS-protected server-authoritative asset table', () => {
  assert.match(migration, /create table if not exists public\.circle_media_assets/i);
  assert.match(migration, /alter table public\.circle_media_assets enable row level security/i);
  assert.match(migration, /revoke all on table public\.circle_media_assets from public, anon, authenticated/i);
  assert.match(migration, /object_path = circle_id::text \|\| '\/' \|\| id::text/i);
  assert.match(migration, /circle_pulse_items[\s\S]*media_asset_id uuid references public\.circle_media_assets/i);
});

test('large media uses resumable TUS uploads with validated limits and generated posters', () => {
  assert.match(mediaStorage, /ResumableStorageUpload\.upload/);
  assert.match(mediaStorage, /CIRCLE_PULSE_VIDEO_MAX_BYTES = 25 \* 1024 \* 1024/);
  assert.match(mediaStorage, /CIRCLE_PULSE_IMAGE_MAX_BYTES = 8 \* 1024 \* 1024/);
  assert.match(posterSource, /generateThumbnailsAsync/);
  assert.match(posterSource, /SaveFormat\.JPEG/);
  assert.match(migration, /circle_media_poster_missing/);
  assert.match(migration, /circle_media_poster_mime_invalid/);
});

test('video playback is resolved lazily only when the viewer is visible', () => {
  assert.match(mediaService, /resolveCirclePulseMediaPlaybackUrl/);
  assert.doesNotMatch(mediaService, /cacheOfflineVideo/);
  assert.match(mediaViewer, /if \(!visible \|\| !item \|\| item\.mediaType !== 'video'\)/);
  assert.match(mediaViewer, /resolveCirclePulseMediaPlaybackUrl\(item\)/);
  assert.match(mediaViewer, /const \[muted, setMuted\] = useState\(true\)/);
});

test('Circle Media lifecycle expires, archives, purges and cleans orphaned objects', () => {
  assert.match(migration, /interval '90 days'/);
  assert.match(lifecycleMigration, /circle_media_cleanup_queue/);
  assert.match(lifecycleMigration, /asset\.status in \('draft', 'ready'\)[\s\S]*interval '24 hours'/);
  assert.match(lifecycleMigration, /reason[\s\S]*'orphaned'/);
  assert.match(lifecycleMigration, /for update skip locked/);
  assert.match(lifecycleMigration, /circle-media-lifecycle/);
  assert.match(lifecycleWorker, /service\.storage[\s\S]*\.remove/);
});

test('membership revocation removes saved Pulse snapshots and Circle media images', () => {
  assert.match(circlePulseHook, /if \(enabled \|\| !circleId \|\| !viewerProfileId\) return/);
  assert.match(circlePulseHook, /clearCirclePulseSnapshot\(circleId, viewerProfileId\)/);
  assert.match(circlePulseHook, /clearOfflineImagesMatchingSourceKey\(`circle-pulse:\$\{circleId\}:`\)/);
});

test('draft, finalise and publish are separate authenticated server operations', () => {
  assert.match(migration, /private\.create_circle_media_asset_draft/);
  assert.match(migration, /private\.finalize_circle_media_asset/);
  assert.match(migration, /private\.publish_circle_media_asset/);
  assert.match(migration, /object\.owner_id[\s\S]*auth\.uid\(\)::text/);
  assert.match(migration, /circle_media_file_size_invalid/);
  assert.match(migration, /circle_media_mime_mismatch/);
  assert.match(migration, /direct_media_requires_asset/);
});

test('Circle Pulse RPCs are not executable anonymously', () => {
  assert.match(migration, /procedure\.proname like 'rpc_%circle_pulse%'/);
  assert.match(migration, /revoke execute on function %s from public/);
  assert.match(migration, /revoke execute on function %s from anon/);
  assert.match(migration, /grant execute on function %s to authenticated/);
});

test('client publishes only after the server has verified the upload', () => {
  const draft = mediaService.indexOf("rpc_create_circle_media_asset_draft");
  const upload = mediaService.indexOf('uploadCirclePulseMedia(mediaPath');
  const finalize = mediaService.indexOf("rpc_finalize_circle_media_asset");
  const publish = mediaService.indexOf("rpc_publish_circle_media_asset");
  assert.ok(draft >= 0 && upload > draft && finalize > upload && publish > finalize);
  assert.match(mediaService, /Direct Circle Media must be published through the verified asset workflow/);
  assert.ok(mediaStorage.includes('if (/^https?:\\/\\//i.test(filePath)) return null;'));
});

test('moderation and subject consent keep new media quarantined until every gate passes', () => {
  assert.match(consentMigration, /quarantine_finalized_circle_media_asset/);
  assert.match(consentMigration, /circle_media_subject_approvals/);
  assert.match(consentMigration, /rights_attested_at/);
  assert.match(consentMigration, /provenance_type/);
  assert.match(consentMigration, /moderation_status = 'approved'/);
  assert.match(moderationWorker, /moderateWithOpenAI/);
  assert.match(moderationWorker, /asset\.uploader_user_id !== userData\.user\.id/);
  assert.match(consentRequests, /It stays private unless you agree/);
});

test('viewer uses explicit tap-to-play controls, progress, captions and accessible labels', () => {
  assert.match(mediaViewer, /instance\.pause\(\)/);
  assert.match(mediaViewer, /Pause Circle video/);
  assert.match(mediaViewer, /videoProgressTrack/);
  assert.match(mediaViewer, /Show captions/);
  assert.match(mediaViewer, /accessibilityRole="progressbar"/);
});

test('Circle Media hub supports filters, saved items, submissions and lightweight reactions', () => {
  assert.match(mediaHub, /'all', 'video', 'image', 'saved'/);
  assert.match(mediaHub, /toggleSavedCircleMedia/);
  assert.match(mediaHub, /toggleCircleMediaReaction/);
  assert.match(mediaHub, /Submit media privately for host review/);
  assert.match(hubMigration, /circle_media_submissions/);
  assert.match(hubMigration, /circle_media_saved_items/);
  assert.match(hubMigration, /circle_media_reactions/);
});

test('engagement analytics persist aggregate counters without viewer identifiers', () => {
  assert.match(hubMigration, /create table public\.circle_media_daily_analytics/);
  assert.match(hubMigration, /opens bigint/);
  assert.match(hubMigration, /discussion_opens bigint/);
  const analyticsTable = hubMigration.slice(
    hubMigration.indexOf('create table public.circle_media_daily_analytics'),
    hubMigration.indexOf('alter table public.circle_media_saved_items'),
  );
  assert.doesNotMatch(analyticsTable, /profile_id|user_id|viewer_id/);
});
