import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Stream native SDK bootstrap is memoized and retryable', () => {
  const loader = read('features/live/media/load-stream-video-sdk.ts');
  const provider = read('features/live/media/stream-live-media-provider.ts');
  const stage = read('features/live/components/StreamLiveStage.tsx');
  const participantTile = read('features/live/components/LiveStageParticipantTile.tsx');
  const providerRegistry = read('features/live/media/stream-live-media-provider-registry.ts');
  const mediaHook = read('features/live/hooks/use-live-media-session.ts');

  assert.match(loader, /let streamVideoSdkPromise[^=]*= null/);
  assert.match(loader, /if \(streamVideoSdkPromise\) return streamVideoSdkPromise/);
  assert.match(loader, /streamVideoSdkPromise = null/);
  assert.match(provider, /await loadStreamVideoSdk\(\)/);
  assert.match(provider, /StreamVideoClient\.getOrCreateInstance\(/);
  assert.doesNotMatch(provider, /new StreamVideoClient\(/);
  assert.doesNotMatch(provider, /import\('@stream-io\/video-react-native-sdk'\)/);
  assert.doesNotMatch(stage, /import \{ StreamCall, StreamVideo/);
  assert.doesNotMatch(participantTile, /\n\s*ParticipantView,/);
  assert.match(stage, /ParticipantViewComponent=\{sdk\.ParticipantView\}/);
  assert.match(providerRegistry, /leaseCount/);
  assert.match(providerRegistry, /PROVIDER_DISPOSE_GRACE_MS/);
  assert.match(mediaHook, /acquireStreamLiveMediaProvider\(sessionId\)/);
  assert.doesNotMatch(mediaHook, /void provider\?\.dispose\(\)/);
});

test('Live route defers the Stream stage until media admission is ready', () => {
  const route = read('app/live/[sessionId].tsx');
  const componentBarrel = read('features/live/components/index.ts');

  assert.match(route, /const StreamLiveStage = lazy/);
  assert.match(route, /<Suspense/);
  assert.match(route, /<LiveMediaStageBoundary/);
  assert.doesNotMatch(componentBarrel, /StreamLiveStage/);
});
