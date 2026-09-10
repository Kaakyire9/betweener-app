import type {
  ProgramPreviewState,
  ProgramScene,
  ProgramSourceAssignments,
  ProgramSourceSlot,
  ProgramState,
  ProgramTargetCanvas,
  ProgramTransition,
  StudioTakeCommand,
} from './contracts.ts';

export type ProgramPreviewAction =
  | { type: 'reset'; program: ProgramState }
  | { type: 'select_scene'; scene: ProgramScene }
  | { type: 'assign_source'; slot: ProgramSourceSlot; sourceKey: string | null }
  | { type: 'replace_assignments'; sourceAssignments: ProgramSourceAssignments }
  | { type: 'set_canvas'; canvas: ProgramTargetCanvas }
  | { type: 'set_transition'; transition: ProgramTransition };

export const previewFromProgram = (program: ProgramState): ProgramPreviewState => ({
  scene: program.scene,
  targetCanvas: program.targetCanvas,
  sourceAssignments: { ...program.sourceAssignments },
  transition: program.transition,
  baseProgramVersion: program.programVersion,
  baseControllerGeneration: program.controller.generation,
  dirty: false,
});

export const reduceProgramPreview = (
  state: ProgramPreviewState,
  action: ProgramPreviewAction,
): ProgramPreviewState => {
  switch (action.type) {
    case 'reset': return previewFromProgram(action.program);
    case 'select_scene': return { ...state, scene: action.scene, dirty: true };
    case 'set_canvas': return { ...state, targetCanvas: action.canvas, dirty: true };
    case 'set_transition': return { ...state, transition: action.transition, dirty: true };
    case 'replace_assignments': return {
      ...state, sourceAssignments: { ...action.sourceAssignments }, dirty: true,
    };
    case 'assign_source': {
      const assignments: ProgramSourceAssignments = { ...state.sourceAssignments };
      if (action.sourceKey) assignments[action.slot] = action.sourceKey;
      else delete assignments[action.slot];
      return { ...state, sourceAssignments: assignments, dirty: true };
    }
  }
};

export const buildStudioTakeCommand = (input: {
  commandId: string;
  sessionId: string;
  controllerInstanceId: string;
  preview: ProgramPreviewState;
  cut?: boolean;
}): StudioTakeCommand => ({
  schemaVersion: 1,
  commandId: input.commandId,
  sessionId: input.sessionId,
  controllerInstanceId: input.controllerInstanceId,
  expectedControllerGeneration: input.preview.baseControllerGeneration,
  expectedProgramVersion: input.preview.baseProgramVersion,
  scene: input.preview.scene,
  targetCanvas: input.preview.targetCanvas,
  sourceAssignments: { ...input.preview.sourceAssignments },
  transition: input.cut ? 'cut' : input.preview.transition,
});
