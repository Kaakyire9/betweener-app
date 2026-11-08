import {
  resolveAdaptiveStageShadowV2,
  sourceGraphVersionFromSources,
  type AdaptiveStageShadowResult,
} from '@betweener/live-program-domain';

import type { CompositorSnapshot } from './contracts.ts';

export const compositorAdaptiveStageV2Flags = {
  shadow: import.meta.env.VITE_ADAPTIVE_STAGE_V2_SHADOW_ENABLED === 'true',
  diagnostics: import.meta.env.VITE_ADAPTIVE_STAGE_V2_DIAGNOSTICS_ENABLED === 'true',
  studioRender: false,
  nativeRender: false,
  compositorRender: import.meta.env.VITE_ADAPTIVE_STAGE_V2_COMPOSITOR_RENDER_ENABLED === 'true',
} as const;

export const resolveCompositorAdaptiveStageShadow = (
  snapshot: CompositorSnapshot,
): AdaptiveStageShadowResult => {
  const large = Boolean(
    snapshot.program.sourceAssignments.guest_4
    || snapshot.program.sourceAssignments.guest_5,
  );
  return resolveAdaptiveStageShadowV2({
    programState: snapshot.program,
    sourceGraph: snapshot.sources,
    sourceGraphVersion: sourceGraphVersionFromSources(snapshot.sources),
    viewport: { width: 1920, height: 1080 },
    maximumPublishers: large ? 6 : 4,
    largePanelEnabled: large,
  });
};
