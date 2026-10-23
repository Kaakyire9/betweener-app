export const LIVE_ROOM_PULSE_MODES = ['peek', 'standard', 'expanded'] as const;

export type LiveRoomPulseMode = (typeof LIVE_ROOM_PULSE_MODES)[number];

const clamp = (value: number, minimum: number, maximum: number): number => (
  Math.min(Math.max(value, minimum), maximum)
);

/**
 * Room Pulse is the only variable-height surface beneath the measured Stage.
 * These bounded snap points preserve useful video on compact phones while
 * allowing a deliberate conversation-first state on larger devices.
 */
export const resolveLiveRoomPulseHeight = (
  viewportHeight: number,
  mode: LiveRoomPulseMode,
): number => {
  const safeHeight = Number.isFinite(viewportHeight) && viewportHeight > 0
    ? viewportHeight
    : 800;
  if (mode === 'peek') return clamp(safeHeight * 0.09, 66, 78);
  if (mode === 'expanded') return clamp(safeHeight * 0.44, 280, 400);
  return clamp(safeHeight * 0.235, 194, 224);
};

export const initialLiveRoomPulseMode = (
  viewportWidth: number,
  viewportHeight: number,
  hasActivity = false,
): LiveRoomPulseMode => (
  !hasActivity || viewportHeight < 720 || viewportWidth > viewportHeight ? 'peek' : 'standard'
);
