import type { VoiceRoute } from '../voice/voice-types.ts';
import type { NativeAudioDevice, NativeAudioHandle, NativeAudioState } from './native-owner-types.ts';

export const CONNECT_AUDIO_ROUTE_TIMEOUT_MS = 3_000;
const POLL_INTERVAL_MS = 100;

export const nativeAudioRouteType = (type: string): VoiceRoute | null => type === 'Earpiece' ? 'earpiece' : type === 'Speaker' ? 'speaker'
  : type === 'Bluetooth Device' ? 'bluetooth' : type === 'Wired Headset' ? 'wired' : null;

function selected(state: NativeAudioState, device: NativeAudioDevice) {
  if (!state.devices.some(item => item.id === device.id && item.type === device.type)) return false;
  if (state.selectedDeviceId) return state.selectedDeviceId === device.id;
  // The SDK permits an unknown selected ID. Built-in outputs are unambiguous
  // only when that endpoint type identifies exactly one available device.
  return ['Earpiece', 'Speaker'].includes(device.type) && state.currentEndpointType === device.type
    && state.devices.filter(item => item.type === device.type).length === 1;
}

/** Observed selection for presentation; never infer an accessory from its type alone. */
export function observedNativeAudioRoute(state: NativeAudioState): VoiceRoute | null {
  const matches = state.devices.filter(device => typeof device.id === 'string' && device.id.length > 0 && selected(state, device));
  return matches.length === 1 ? nativeAudioRouteType(matches[0].type) : null;
}

/** One native switch request, confirmed by route events or bounded fresh reads.
 * The owner forwards its existing device subscription; no extra native listener. */
export function createNativeAudioRouteSelector(input: {
  audio: Pick<NativeAudioHandle, 'devices' | 'select'>; isCurrent(): boolean;
  onRead?(state: NativeAudioState): void;
}) {
  let pending: { observe(state: NativeAudioState): void; cancel(): void } | null = null;
  return {
    observe(state: NativeAudioState) { pending?.observe(state); },
    cancel() { pending?.cancel(); },
    select(route: VoiceRoute): Promise<NativeAudioState> {
      pending?.cancel();
      return new Promise((resolve, reject) => {
        let finished = false, reading = false, eventVersion = 0;
        let lastEvent: NativeAudioState | null = null;
        let device: NativeAudioDevice | null = null, selectionRequested = false, selectionAcknowledged = false;
        let latestState: NativeAudioState | null = null;
        let timeout: ReturnType<typeof setTimeout>, poll: ReturnType<typeof setInterval>;
        const finish = (state: NativeAudioState | null, code?: string) => {
          if (finished) return;
          finished = true; clearTimeout(timeout); clearInterval(poll);
          if (pending === operation) pending = null;
          if (state) resolve(state); else reject(new Error(code));
        };
        const current = () => {
          if (finished) return false;
          if (!input.isCurrent()) { finish(null, 'connect_native_owner_retired'); return false; }
          return true;
        };
        const inspect = (state: NativeAudioState) => {
          if (!current()) return;
          latestState = state;
          if (!Array.isArray(state.devices)) { finish(null, 'connect_native_route_unavailable'); return; }
          // Telecom registration initially exposes no endpoints. Wait within
          // the existing deadline; endpoint type alone never proves routing.
          if (state.devices.length === 0) return;
          if (!device) {
            const candidate = state.devices.find(item => nativeAudioRouteType(item.type) === route
              && typeof item.id === 'string' && item.id.length > 0);
            if (!candidate) { finish(null, 'connect_native_route_unavailable'); return; }
            device = { ...candidate };
          }
          if (!state.devices.some(item => item.id === device!.id && item.type === device!.type)) {
            finish(null, 'connect_native_route_unavailable'); return;
          }
          if (selected(state, device) && (!selectionRequested || selectionAcknowledged)) { finish(state); return; }
          if (!selectionRequested) {
            selectionRequested = true;
            try {
              void Promise.resolve(input.audio.select(device.id)).then(() => {
                if (!current()) return;
                selectionAcknowledged = true;
                if (latestState) inspect(latestState);
              }, () => { if (current()) finish(null, 'connect_native_route_unavailable'); });
            }
            catch { if (current()) finish(null, 'connect_native_route_unavailable'); }
          }
        };
        const read = async () => {
          if (!current() || reading) return;
          reading = true; const version = eventVersion;
          try {
            const readback = await input.audio.devices();
            if (!current()) return;
            // A newer native event must not be overwritten by an older read.
            const state = version === eventVersion ? readback : lastEvent!;
            try { input.onRead?.(state); } catch { /* Diagnostic readers never decide routing. */ }
            if (!current()) return;
            inspect(state);
          } catch { if (current()) finish(null, 'connect_native_route_unavailable'); }
          finally { reading = false; }
        };
        const operation = {
          observe(state: NativeAudioState) { eventVersion++; lastEvent = state; inspect(state); },
          cancel() { finish(null, 'connect_native_owner_retired'); },
        };
        pending = operation;
        timeout = setTimeout(() => {
          if (current()) finish(null, 'connect_native_route_unconfirmed');
        }, CONNECT_AUDIO_ROUTE_TIMEOUT_MS);
        poll = setInterval(() => { void read(); }, POLL_INTERVAL_MS);
        void read();
      });
    },
  };
}
