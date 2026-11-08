import { AppState, NativeModules, Platform, TurboModuleRegistry, UIManager } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import type { NativeAudioHandle, NativeLifecycle } from '../../features/connect/media/native-owner-types.ts';
import type { LocalHardware, LocalPlayback } from './local-session.ts';
import { createTestTone } from './test-tone.ts';
import { inspectBinaryContract } from './binary-contract.ts';

export const inspectLocalBinary = () => inspectBinaryContract({
  development: __DEV__, platform: Platform.OS,
  webRtc: () => NativeModules.WebRTCModule,
  rtcView: () => UIManager.getViewManagerConfig('RTCVideoView'),
  callingx: () => NativeModules.Callingx || TurboModuleRegistry.get('Callingx'),
  optionalModule: name => requireOptionalNativeModule(name),
});

/** Only call after separate physical-device authorisation and external egress isolation. */
export async function loadLocalHardware() {
  if (!__DEV__ || !['ios', 'android'].includes(Platform.OS)) throw new Error('device_harness_native_development_only');
  const inspection = inspectLocalBinary();
  const modules = inspection.checks;
  if (!inspection.moduleContractComplete) throw new Error('device_harness_existing_binary_incomplete_stop_for_owner_approval');
  const rtc = await import('@stream-io/react-native-webrtc');
  const { CallingxModule } = await import('@stream-io/react-native-callingx');
  const audio = await import('expo-audio');
  const { File, Paths } = await import('expo-file-system');
  const lifecycle: NativeLifecycle = {
    platform: Platform.OS as 'ios' | 'android', appState: () => AppState.currentState,
    subscribeAppState(listener) {
      const change = AppState.addEventListener('change', listener);
      const blur = Platform.OS === 'android' ? AppState.addEventListener('blur', () => listener('inactive')) : null;
      return () => { change.remove(); blur?.remove(); };
    },
  };
  const localAudio: NativeAudioHandle = {
    configure() { /* No SDK audio config, Callingx setup, Telecom or CallKit registration. */ },
    clearConfiguration() {},
    async devices() { return { devices: [] }; },
    select() { throw new Error('device_harness_sdk_route_control_not_tested'); },
    observeDevices() { return () => undefined; },
    observeInterruption(listener) {
      if (Platform.OS !== 'ios') return () => undefined;
      const subscription = CallingxModule.addEventListener('didAudioInterruption', e => listener(e.phase));
      return () => subscription.remove();
    },
  };
  let factory: Promise<InstanceType<typeof rtc.CallFactory>> | null = null;
  let factoryDisposed = false;
  const hardware: LocalHardware = {
    async capture(kind) {
      // Create/dispose a scoped native factory+ADM, without constructing an ICE peer.
      // This runs only after the shared registry granted exclusive ownership.
      factory ??= rtc.CallFactory.create();
      await factory;
      // getUserMedia requests ONLY the selected sensor. The owner retains native tracks.
      const stream = await rtc.mediaDevices.getUserMedia({ audio: kind === 'microphone', video: kind === 'camera' });
      if (!stream.getTracks().length) { stream.release(); throw new Error('device_harness_no_capture_tracks'); }
      return stream;
    },
    async release() {
      if (!factory || factoryDisposed) return;
      const owned = await factory;
      if (await owned.dispose() !== true) throw new Error('device_harness_factory_disposal_unconfirmed');
      factoryDisposed = true;
    },
    async startTone(): Promise<LocalPlayback> {
      const file = new File(Paths.cache, `connect-device-tone-${Date.now()}.wav`);
      file.create(); file.write(createTestTone());
      if (!file.uri.startsWith('file://')) { file.delete(); throw new Error('device_harness_local_file_required'); }
      let player: ReturnType<typeof audio.createAudioPlayer>;
      try { player = audio.createAudioPlayer({ uri: file.uri }, { keepAudioSessionActive: false }); }
      catch { file.delete(); throw new Error('device_harness_local_player_creation_failed'); }
      let paused = false, removed = false, deleted = false;
      const stop = async () => {
        // Attempt each operation even if an earlier one fails; preserve failed work for retry.
        let failed = false;
        try { if (!paused && !removed) { player.pause(); paused = true; } } catch { failed = true; }
        try { if (!removed) { player.remove(); removed = true; } } catch { failed = true; }
        try { if (!deleted) { file.delete(); deleted = true; } } catch { failed = true; }
        if (failed) throw new Error('device_harness_local_playback_release_unconfirmed');
      };
      // Publish a cleanup handle even when play() throws: the session will own its retry.
      let playRequested = false;
      try { player.loop = true; player.volume = 0.08; player.play(); playRequested = true; } catch { /* Recorded below; never a hardware PASS. */ }
      return { stop, snapshot: () => ({ source: 'expo_audio_js_state', playRequested, paused, removed, deleted,
        playing: removed ? null : player.playing, physicalOutputCessation: 'unverified' }) };
    },
  };
  return { modules, hardware, audio: localAudio, lifecycle, RTCView: rtc.RTCView,
    permission: async () => await rtc.permissions.request({ name: 'microphone' }) ? 'granted' as const : 'denied' as const };
}
