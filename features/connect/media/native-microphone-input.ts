interface NativeMicrophoneInput {
  platform: string;
  configure?(enabled: boolean): Promise<void>;
}

/** The native implementation addresses the current call's ADM, never the
 * legacy default factory. Its acknowledgement precedes Connect capture. */
export async function configureConnectMicrophoneInput(enabled: boolean, input?: NativeMicrophoneInput): Promise<void> {
  if (!input) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Platform, NativeModules } = require('react-native') as typeof import('react-native');
    const module = NativeModules.StreamInCallManager;
    input = { platform: Platform.OS, configure: typeof module?.configureConnectMicrophoneMute === 'function'
      ? value => module.configureConnectMicrophoneMute(value) : undefined };
  }
  if (input.platform !== 'ios') return;
  if (!input.configure) throw Error('connect_native_build_incompatible');
  await input.configure(enabled);
}
