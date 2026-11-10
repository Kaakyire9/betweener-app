import { ConnectNativeBuildError } from '../media/native-runtime-contract.ts';

export type AudioSetupStage = 'credentials' | 'native_join' | 'microphone' | 'audio_output';
export interface AudioSetupFailure { stage: AudioSetupStage; code: string; missingNativeApis: readonly string[] }

class AudioPreparationError extends Error {
  readonly stage: 'microphone' | 'audio_output';
  readonly original: unknown;
  constructor(stage: 'microphone' | 'audio_output', original: unknown) {
    super('connect_audio_preparation_failed'); this.stage = stage; this.original = original;
  }
}

/** Both operations require an admitted, encrypted join first. Fail promptly;
 * the native owner fences and stops an operation that completes after End. */
export async function prepareJoinedAudio(input: {
  microphone(): Promise<void>; output(): Promise<void>;
  started(stage: 'microphone' | 'audio_output'): void;
  completed(stage: 'microphone' | 'audio_output'): void;
}) {
  const run = async (stage: 'microphone' | 'audio_output', action: () => Promise<void>) => {
    input.started(stage);
    try { await action(); }
    catch (error) { throw new AudioPreparationError(stage, error); }
    input.completed(stage);
  };
  await Promise.all([run('microphone', input.microphone), run('audio_output', input.output)]);
}

/** Closed diagnostic codes only: no raw SDK errors, credentials, SDP or provider bodies. */
export function audioSetupFailure(stage: AudioSetupStage, error: unknown): AudioSetupFailure {
  if (error instanceof AudioPreparationError) return audioSetupFailure(error.stage, error.original);
  if (error instanceof Error && error.message === 'connect_peer_key_changed') return { stage, code: 'call_identity_changed', missingNativeApis: [] };
  if (error instanceof Error && ['connect_e2ee_unavailable','connect_e2ee_native_unsupported','connect_e2ee_not_confirmed','connect_key_authentication_failed','connect_key_binding_invalid','connect_encryption_downgrade'].includes(error.message)) return { stage, code: 'call_encryption_unavailable', missingNativeApis: [] };
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
  if (failure.code === 'call_identity_changed') return 'Your connection’s calling devices changed. Review calling identity before trying again.';
  if (failure.code === 'call_encryption_unavailable') return 'A secure connection could not be established. Check device support and try again.';
  if (failure.code === 'native_build_incompatible') return 'This development build is missing required calling support. Open Call details to see what is missing.';
  if (failure.stage === 'microphone') return 'The microphone could not start. Check microphone access and try again.';
  if (failure.stage === 'audio_output') return 'The audio output could not be selected. Please try again.';
  return 'Audio could not connect. Please try again.';
}
