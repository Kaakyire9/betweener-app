import {
  assignmentsForProgramScene,
  isProgramSourceUsable,
  sourceFitsProgramSlot,
  type ProgramPreviewState,
  type ProgramSource,
} from '@betweener/live-program-domain';

export const sourceFitsSlot = sourceFitsProgramSlot;
export { isProgramSourceUsable };

export const assignmentsContainTerminalSource = (
  assignments: ProgramPreviewState['sourceAssignments'],
  sources: readonly ProgramSource[],
): boolean => Object.values(assignments).some((key) => {
  const source = sources.find((candidate) => candidate.key === key);
  return source !== undefined
    && (['ended', 'failed'].includes(source.readiness) || source.health === 'lost');
});

export const assignmentsForScene = (
  scene: Parameters<typeof assignmentsForProgramScene>[0],
  sources: readonly ProgramSource[],
  current: ProgramPreviewState['sourceAssignments'],
): ProgramPreviewState['sourceAssignments'] => assignmentsForProgramScene(scene, sources, current);
