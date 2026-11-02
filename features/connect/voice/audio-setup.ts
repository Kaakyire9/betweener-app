import { ConnectNativeBuildError } from '../media/native-runtime-contract.ts';

export type AudioSetupStage = 'credentials' | 'native_join' | 'microphone' | 'audio_output';
export interface AudioSetupFailure { stage: AudioSetupStage; code: string; missingNativeApis: readonly string[] }

/** Closed diagnostic codes only: no raw SDK errors, credentials, SDP or provider bodies. */
export function audioSetupFailure(stage: AudioSetupStage, error: unknown): AudioSetupFailure {
  if (stage === 'audio_output' && error instanceof Error) {
    if (error.message === 'connect_native_route_unconfirmed') return { stage, code: 'audio_output_unconfirmed', missingNativeApis: [] };
    if (error.message === 'connect_native_route_unavailable') return { stage, code: 'audio_output_unavailable', missingNativeApis: [] };
    if (error.message === 'connect_native_route_no_owner') return { stage, code: 'audio_output_no_owner', missingNativeApis: [] };
    if (error.message === 'connect_native_owner_retired') return { stage, code: 'audio_output_cancelled', missingNativeApis: [] };
    if (error.message === 'connect_native_route_superseded') return { stage, code: 'audio_output_superseded', missingNativeApis: [] };
  }
  return error instanceof ConnectNativeBuildError
    ? { stage, code: 'native_build_incompatible', missingNativeApis: [...error.missing] }
    : { stage, code: `audio_${stage}_failed`, missingNativeApis: [] };
}

export function audioSetupMessage(failure: AudioSetupFailure) {
  if (failure.code === 'native_build_incompatible') return 'This development build is missing required calling support. Open Call details to see what is missing.';
  if (failure.stage === 'microphone') return 'The microphone could not start. Check microphone access and try again.';
  if (failure.stage === 'audio_output') return 'The audio output could not be selected. Please try again.';
  return 'Audio could not connect. Please try again.';
}
