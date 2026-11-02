import type {
  ProgramSource,
  ProgramTargetCanvas,
  ScreenContentMode,
  ScreenFitMode,
} from './contracts.ts';

export const SCREEN_PRESENTATION_FIT_V1 = Object.freeze({
  safeAutoCropFraction: 0.1,
  fallbackSourceAspectRatio: 16 / 9,
});

export const PROGRAM_TARGET_ASPECT_RATIOS: Readonly<Record<ProgramTargetCanvas, number>> = {
  portrait_9_16: 9 / 16,
  landscape_16_9: 16 / 9,
  square_1_1: 1,
};

export type ScreenPresentationPolicyV1 = {
  screenFitMode: ScreenFitMode;
  contentMode: ScreenContentMode;
  sourceAspect: number;
  targetAspect: number;
  fit: 'contain' | 'cover';
  focalPoint: { x: number; y: number } | null;
  matte: 'brand_static' | 'none';
  occupiedMediaAreaRatio: number;
  requiredCropFraction: number;
  fallbackReason: string | null;
};

export type ScreenPresentationRendererKind = 'studio' | 'native' | 'compositor';

const finitePositive = (value: number | null | undefined) => (
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
);

export const sourceAspectRatioForScreenV1 = (
  source: Pick<ProgramSource, 'sourceAspectRatio' | 'sourceWidth' | 'sourceHeight'> | undefined,
) => finitePositive(source?.sourceAspectRatio)
  ?? (finitePositive(source?.sourceWidth) && finitePositive(source?.sourceHeight)
    ? (source?.sourceWidth as number) / (source?.sourceHeight as number)
    : SCREEN_PRESENTATION_FIT_V1.fallbackSourceAspectRatio);

export const occupiedMediaAreaRatioV1 = (sourceAspect: number, targetAspect: number) => (
  Math.min(sourceAspect / targetAspect, targetAspect / sourceAspect)
);

export const requiredCropFractionV1 = (sourceAspect: number, targetAspect: number) => (
  1 - occupiedMediaAreaRatioV1(sourceAspect, targetAspect)
);

export const resolveScreenPresentationPolicyV1 = (input: {
  screenFitMode: ScreenFitMode;
  contentMode: ScreenContentMode;
  sourceAspect?: number | null;
  targetCanvas: ProgramTargetCanvas;
}): ScreenPresentationPolicyV1 => {
  const sourceAspect = finitePositive(input.sourceAspect)
    ?? SCREEN_PRESENTATION_FIT_V1.fallbackSourceAspectRatio;
  const targetAspect = PROGRAM_TARGET_ASPECT_RATIOS[input.targetCanvas];
  const requiredCropFraction = requiredCropFractionV1(sourceAspect, targetAspect);
  const autoFill = input.contentMode === 'media'
    && requiredCropFraction <= SCREEN_PRESENTATION_FIT_V1.safeAutoCropFraction;
  const fill = input.screenFitMode === 'fill'
    || (input.screenFitMode === 'auto' && autoFill);
  const fallbackReason = input.screenFitMode === 'auto' && !fill
    ? input.contentMode !== 'media'
      ? `safe_${input.contentMode}_fit`
      : 'crop_threshold_exceeded'
    : null;
  return {
    screenFitMode: input.screenFitMode,
    contentMode: input.contentMode,
    sourceAspect,
    targetAspect,
    fit: fill ? 'cover' : 'contain',
    focalPoint: fill ? { x: 0.5, y: 0.5 } : null,
    matte: fill ? 'none' : 'brand_static',
    occupiedMediaAreaRatio: fill ? 1 : occupiedMediaAreaRatioV1(sourceAspect, targetAspect),
    requiredCropFraction,
    fallbackReason,
  };
};

export const resolveProgramScreenPresentationV1 = (
  screenFitMode: ScreenFitMode,
  targetCanvas: ProgramTargetCanvas,
  source: ProgramSource | undefined,
) => resolveScreenPresentationPolicyV1({
  screenFitMode,
  contentMode: source?.contentMode ?? 'unknown',
  sourceAspect: sourceAspectRatioForScreenV1(source),
  targetCanvas,
});

export const screenPresentationTelemetryV1 = (
  policy: ScreenPresentationPolicyV1,
  rendererKind: ScreenPresentationRendererKind,
  source?: Pick<ProgramSource, 'sourceWidth' | 'sourceHeight'>,
) => ({
  screen_source_width: source?.sourceWidth ?? null,
  screen_source_height: source?.sourceHeight ?? null,
  source_aspect: Number(policy.sourceAspect.toFixed(6)),
  target_aspect: Number(policy.targetAspect.toFixed(6)),
  occupied_media_area_ratio: Number(policy.occupiedMediaAreaRatio.toFixed(6)),
  required_crop_fraction: Number(policy.requiredCropFraction.toFixed(6)),
  resolved_fit: policy.fit,
  content_mode: policy.contentMode,
  screen_fit_mode: policy.screenFitMode,
  renderer_kind: rendererKind,
  fallback_reason: policy.fallbackReason,
});
