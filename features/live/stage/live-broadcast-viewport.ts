import type { ProgramTargetCanvas } from '@betweener/live-program-domain';

export const LIVE_ROOM_PULSE_MODES = ['peek', 'standard', 'expanded'] as const;

export type LiveRoomPulseMode = (typeof LIVE_ROOM_PULSE_MODES)[number];

const clamp = (value: number, minimum: number, maximum: number): number => (
  Math.min(Math.max(value, minimum), maximum)
);

export const LIVE_SCREEN_SHARE_FALLBACK_ASPECT_RATIO = 16 / 9;

const LIVE_PROGRAM_CANVAS_ASPECT_RATIOS: Readonly<Record<ProgramTargetCanvas, number>> = {
  portrait_9_16: 9 / 16,
  landscape_16_9: 16 / 9,
  square_1_1: 1,
};

export type LiveScreenMediaContainment = Readonly<{
  widthFraction: number;
  heightFraction: number;
}>;

export const resolveLiveScreenShareAspectRatio = (
  width: number | null | undefined,
  height: number | null | undefined,
): number | null => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || !width || !height
    || width <= 0 || height <= 0) return null;
  return clamp(width / height, 0.25, 4);
};

export const resolveLiveScreenOnlyStageSize = (
  availableSlotWidth: number,
  availableSlotHeight: number,
  targetCanvas: ProgramTargetCanvas | null | undefined,
  sourceAspectRatio: number | null,
): { width: number; height: number } => {
  const safeWidth = Number.isFinite(availableSlotWidth) && availableSlotWidth > 0
    ? availableSlotWidth
    : 390;
  const safeHeight = Number.isFinite(availableSlotHeight) && availableSlotHeight > 0
    ? availableSlotHeight
    : 404;
  const availableWidth = Math.max(160, safeWidth - 20);
  const availableHeight = Math.max(120, safeHeight);
  const aspectRatio = targetCanvas
    ? LIVE_PROGRAM_CANVAS_ASPECT_RATIOS[targetCanvas]
    : Number.isFinite(sourceAspectRatio) && sourceAspectRatio
      ? clamp(sourceAspectRatio, 0.25, 4)
      : LIVE_SCREEN_SHARE_FALLBACK_ASPECT_RATIO;
  const width = Math.min(availableWidth, availableHeight * aspectRatio);
  return { width, height: width / aspectRatio };
};

export const resolveLiveScreenMediaContainment = (
  targetCanvas: ProgramTargetCanvas,
  sourceAspectRatio: number | null,
): LiveScreenMediaContainment => {
  const canvasAspectRatio = LIVE_PROGRAM_CANVAS_ASPECT_RATIOS[targetCanvas];
  const sourceRatio = Number.isFinite(sourceAspectRatio) && sourceAspectRatio
    ? clamp(sourceAspectRatio, 0.25, 4)
    : LIVE_SCREEN_SHARE_FALLBACK_ASPECT_RATIO;
  if (sourceRatio >= canvasAspectRatio) {
    return { widthFraction: 1, heightFraction: canvasAspectRatio / sourceRatio };
  }
  return { widthFraction: sourceRatio / canvasAspectRatio, heightFraction: 1 };
};

/**
 * These bounded snap points preserve useful video on compact phones while
 * allowing a deliberate conversation-first state on larger devices. Dense
 * stages receive a lower expanded ceiling so three-to-six-person grids remain
 * legible when the caller lays Room Pulse out beneath the Stage.
 */
export const resolveLiveRoomPulseHeight = (
  viewportHeight: number,
  mode: LiveRoomPulseMode,
  stageParticipantCount = 1,
  expandedCommentCount?: number,
): number => {
  const safeHeight = Number.isFinite(viewportHeight) && viewportHeight > 0
    ? viewportHeight
    : 800;
  if (mode === 'peek') return clamp(safeHeight * 0.09, 66, 78);
  if (mode === 'expanded') {
    const preservesDenseStage = stageParticipantCount >= 3;
    const maximumHeight = preservesDenseStage
      ? clamp(safeHeight * 0.36, 250, 320)
      : stageParticipantCount === 2
        ? clamp(safeHeight * 0.38, 280, 340)
        : clamp(safeHeight * 0.44, 280, 400);
    if (expandedCommentCount == null || !Number.isFinite(expandedCommentCount)) {
      return maximumHeight;
    }
    const minimumHeight = preservesDenseStage ? 250 : 280;
    const visibleCommentCount = clamp(Math.floor(expandedCommentCount), 0, 6);
    const contentHeight = 192 + (visibleCommentCount * 32);
    return clamp(contentHeight, minimumHeight, maximumHeight);
  }
  return clamp(safeHeight * 0.235, 194, 224);
};

export const initialLiveRoomPulseMode = (
  viewportWidth: number,
  viewportHeight: number,
  hasActivity = false,
): LiveRoomPulseMode => (
  !hasActivity || viewportHeight < 720 || viewportWidth > viewportHeight ? 'peek' : 'standard'
);
