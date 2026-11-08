import {
  programSceneAvailability,
  type ProgramScene,
  type ProgramTargetCanvas,
} from '@betweener/live-program-domain';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  liveRepository,
  type LiveMobileProgrammeAccess,
} from '../application/live-repository.ts';
import type { LiveProgramSnapshotV2 } from '../odo/show/odo-show-contracts.ts';

export type LiveMobileProgrammeController = {
  access: LiveMobileProgrammeAccess | null;
  busyAction: 'take' | 'capacity' | null;
  error: string | null;
  refresh: () => Promise<void>;
  take: (scene: ProgramScene, canvas: ProgramTargetCanvas) => Promise<boolean>;
  setCapacity: (capacity: 4 | 6) => Promise<boolean>;
};

const programmeErrorMessage = (error: unknown): string => {
  const code = error instanceof Error ? error.message : String(error);
  if (code.includes('step_up_required')) return 'Verify with your authenticator to continue.';
  if (code.includes('studio_controller_active')) return 'Another producer currently controls Program.';
  if (code.includes('stale_program_state')) return 'Program changed. Refresh and try again.';
  if (code.includes('large_panel_unavailable')) return 'Six-person panels are not enabled for this environment.';
  if (code.includes('capacity_below_occupied')) return 'Move guests off stage before reducing capacity.';
  if (code.includes('source_not_ready') || code.includes('required_source_missing')) {
    return 'Connect the required media sources before taking this scene.';
  }
  if (code.includes('forbidden')) return 'Your current Live role cannot perform this action.';
  return 'That programme change could not be completed.';
};

export const useLiveMobileProgrammeControl = (options: {
  enabled: boolean;
  sessionId: string;
  programme: LiveProgramSnapshotV2 | null;
  onProgrammeChanged: () => Promise<void>;
  onRoomChanged: () => Promise<void>;
}): LiveMobileProgrammeController => {
  const [access, setAccess] = useState<LiveMobileProgrammeAccess | null>(null);
  const [busyAction, setBusyAction] = useState<'take' | 'capacity' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refreshRef = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    if (!options.enabled || !options.sessionId) return;
    if (refreshRef.current) return refreshRef.current;
    const operation = liveRepository.getLiveMobileProgrammeAccess(options.sessionId)
      .then((next) => { setAccess(next); setError(null); })
      .catch((nextError) => { setAccess(null); setError(programmeErrorMessage(nextError)); })
      .finally(() => { refreshRef.current = null; });
    refreshRef.current = operation;
    return operation;
  }, [options.enabled, options.sessionId]);

  useEffect(() => {
    setAccess(null);
    setError(null);
    if (options.enabled) void refresh();
  }, [options.enabled, options.sessionId, refresh]);

  const take = useCallback(async (
    scene: ProgramScene,
    canvas: ProgramTargetCanvas,
  ): Promise<boolean> => {
    if (!options.programme || !access?.canControl || busyAction) return false;
    const availability = programSceneAvailability(
      scene,
      canvas,
      options.programme.sources,
      options.programme.program.sourceAssignments,
    );
    if (!availability.available) {
      setError(availability.reason ?? 'Connect the required media sources first.');
      return false;
    }
    setBusyAction('take');
    setError(null);
    try {
      await liveRepository.takeMobileLiveProgram({
        sessionId: options.sessionId,
        expectedProgramVersion: options.programme.program.programVersion,
        scene,
        targetCanvas: canvas,
        sourceAssignments: availability.assignments,
        transition: 'auto',
      });
      await options.onProgrammeChanged();
      return true;
    } catch (nextError) {
      setError(programmeErrorMessage(nextError));
      await options.onProgrammeChanged().catch(() => undefined);
      return false;
    } finally {
      setBusyAction(null);
    }
  }, [access?.canControl, busyAction, options]);

  const setCapacity = useCallback(async (capacity: 4 | 6): Promise<boolean> => {
    if (!access?.canConfigureLargePanel || busyAction) return false;
    setBusyAction('capacity');
    setError(null);
    try {
      await liveRepository.setLivePanelCapacity(options.sessionId, capacity);
      await Promise.all([refresh(), options.onRoomChanged()]);
      return true;
    } catch (nextError) {
      setError(programmeErrorMessage(nextError));
      return false;
    } finally {
      setBusyAction(null);
    }
  }, [access?.canConfigureLargePanel, busyAction, options, refresh]);

  return { access, busyAction, error, refresh, take, setCapacity };
};
