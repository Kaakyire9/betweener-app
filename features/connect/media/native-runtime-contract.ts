const requiredMethods = {
  WebRTCModule: ['createCallFactory', 'disposeCallFactory', 'getUserMedia', 'mediaStreamTrackRelease'],
  StreamInCallManager: ['start', 'stop', 'getAudioDeviceStatus', 'chooseAudioDeviceEndpoint', 'setAudioRole', 'setDefaultAudioDeviceEndpointType', 'setEnableStereoAudioOutput'],
} as const;

export class ConnectNativeBuildError extends Error {
  readonly missing: readonly string[];
  constructor(missing: readonly string[]) {
    super('connect_native_build_incompatible');
    this.missing = [...missing];
  }
}

/** Inspect bridge method presence only; never invoke a sensor, factory or connection. */
export function assertConnectNativeRuntime(modules: Record<string, unknown>, platform?: string) {
  const missing: string[] = [];
  const contract: Record<string, readonly string[]> = { ...requiredMethods, ...(platform === 'ios' ? {
    StreamInCallManager: [...requiredMethods.StreamInCallManager, 'configureConnectMicrophoneMute'],
  } : {}) };
  for (const [name, methods] of Object.entries(contract)) {
    for (const method of methods) {
      try {
        if (typeof (modules[name] as Record<string, unknown> | undefined)?.[method] === 'function') continue;
      } catch { /* A throwing bridge getter also fails the required API contract. */ }
      missing.push(`${name}.${method}`);
    }
  }
  if (missing.length) throw new ConnectNativeBuildError(missing);
}
