export interface BinaryInspectionInput {
  development: boolean; platform: string;
  webRtc(): unknown; rtcView(): unknown; callingx(): unknown; optionalModule(name: string): unknown;
}

/** Presence checks only. Never starts a factory, player, capture or connection. */
export function inspectBinaryContract(input: BinaryInspectionInput) {
  const errors: string[] = [];
  const read = (key: string, run: () => unknown) => {
    try { return run(); } catch { errors.push(key); return undefined; }
  };
  const rtc = read('WebRTCModule', input.webRtc) as Record<string, unknown> | undefined;
  const method = (name: string) => typeof read(`WebRTCModule.${name}`, () => rtc?.[name]) === 'function';
  const checks = {
    developmentRuntime: input.development === true,
    nativePlatform: ['ios', 'android'].includes(input.platform),
    WebRTCModule: !!rtc,
    createCallFactory: method('createCallFactory'),
    disposeCallFactory: method('disposeCallFactory'),
    getUserMedia: method('getUserMedia'),
    mediaStreamTrackRelease: method('mediaStreamTrackRelease'),
    RTCView: !!read('RTCView', input.rtcView),
    Callingx: !!read('Callingx', input.callingx),
    ExpoAudio: !!read('ExpoAudio', () => input.optionalModule('ExpoAudio')),
    FileSystem: !!read('FileSystem', () => input.optionalModule('FileSystem')),
  };
  const missing = Object.entries(checks).filter(([, present]) => !present).map(([name]) => name);
  return { scope: 'native_module_api_presence_only' as const, platform: input.platform, checks, missing, inspectionErrors: errors,
    moduleContractComplete: missing.length === 0 && errors.length === 0,
    nativeVersionsVerified: false as const, hardwareTested: false as const, streamConnectionCreated: false as const };
}
