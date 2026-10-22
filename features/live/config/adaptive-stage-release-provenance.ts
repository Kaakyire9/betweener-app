import {
  ADAPTIVE_STAGE_LAYOUT_RESOLVER_VERSION,
  ADAPTIVE_STAGE_MANIFEST_VERSION,
} from '@betweener/live-program-domain';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

const release = (Constants.expoConfig?.extra?.release ?? {}) as Record<string, unknown>;
const text = (value: unknown, fallback = 'unknown') => (
  typeof value === 'string' && value.trim() ? value.trim() : fallback
);

export const adaptiveStageNativeReleaseProvenance = Object.freeze({
  renderer_source: 'native',
  source_revision: text(release.sourceRevision),
  build_identifier: Updates.updateId ?? text(release.buildIdentifier),
  runtime_version: Updates.runtimeVersion ?? text(Constants.expoConfig?.runtimeVersion),
  update_channel: Updates.channel ?? 'development',
  manifest_version: ADAPTIVE_STAGE_MANIFEST_VERSION,
  resolver_version: ADAPTIVE_STAGE_LAYOUT_RESOLVER_VERSION,
});
