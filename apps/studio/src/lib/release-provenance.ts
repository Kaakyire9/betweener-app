import {
  ADAPTIVE_STAGE_LAYOUT_RESOLVER_VERSION,
  ADAPTIVE_STAGE_MANIFEST_VERSION,
} from '@betweener/live-program-domain';

export const studioReleaseProvenance = Object.freeze({
  renderer_source: 'studio',
  source_revision: import.meta.env.VITE_SOURCE_REVISION || 'unknown',
  build_identifier: import.meta.env.VITE_BUILD_IDENTIFIER || 'unknown',
  runtime_version: 'web',
  manifest_version: ADAPTIVE_STAGE_MANIFEST_VERSION,
  resolver_version: ADAPTIVE_STAGE_LAYOUT_RESOLVER_VERSION,
});
