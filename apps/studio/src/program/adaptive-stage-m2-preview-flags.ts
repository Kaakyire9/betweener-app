const environmentFlag = (value: string | undefined) => value === 'true';

export const adaptiveStageM2PreviewFlags = Object.freeze({
  master: environmentFlag(import.meta.env.VITE_ADAPTIVE_STAGE_M2_ENABLED),
  studioPreview: environmentFlag(import.meta.env.VITE_ADAPTIVE_STAGE_M2_STUDIO_PREVIEW_ENABLED),
  program: false,
  native: false,
  compositor: false,
});

export const isAdaptiveStageM2StudioPreviewEnabled =
  adaptiveStageM2PreviewFlags.master && adaptiveStageM2PreviewFlags.studioPreview;
