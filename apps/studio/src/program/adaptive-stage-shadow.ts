import {
  resolveAdaptiveStageShadowV2,
  sourceGraphVersionFromSources,
  type AdaptiveStageShadowResult,
  type StudioOperationalSnapshot,
} from '@betweener/live-program-domain';

import { studioEnvironment } from '../lib/environment.ts';

const environmentFlag = (value: string | undefined, stagingDefault: boolean) =>
  value === undefined || value === '' ? stagingDefault : value === 'true';

export const adaptiveStageV2StudioFlags = {
  shadow: environmentFlag(
    import.meta.env.VITE_ADAPTIVE_STAGE_V2_SHADOW_ENABLED,
    studioEnvironment.environment === 'staging',
  ),
  diagnostics: environmentFlag(import.meta.env.VITE_ADAPTIVE_STAGE_V2_DIAGNOSTICS_ENABLED, false),
  studioRender: environmentFlag(import.meta.env.VITE_ADAPTIVE_STAGE_V2_STUDIO_RENDER_ENABLED, false),
  nativeRender: false,
  compositorRender: false,
} as const;

const shadowCapacity = (snapshot: StudioOperationalSnapshot): 4 | 6 => {
  const largeSlots = snapshot.program.sourceAssignments.guest_4
    || snapshot.program.sourceAssignments.guest_5;
  return largeSlots ? 6 : 4;
};

export const resolveStudioAdaptiveStageShadow = (
  snapshot: StudioOperationalSnapshot,
): AdaptiveStageShadowResult => {
  const maximumPublishers = shadowCapacity(snapshot);
  return resolveAdaptiveStageShadowV2({
    programState: snapshot.program,
    sourceGraph: snapshot.sources,
    sourceGraphVersion: sourceGraphVersionFromSources(snapshot.sources),
    viewport: { width: 1920, height: 1080 },
    maximumPublishers,
    largePanelEnabled: maximumPublishers === 6,
  });
};
