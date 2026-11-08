import type { NativeAudioHandle, NativeAudioState } from './native-owner-types.ts';

interface AudioEndpoint { id: string; type: string }
interface AudioEndpoints { endpoints: AudioEndpoint[]; currentEndpoint: AudioEndpoint | null }
interface TelecomAudioPort {
  readonly isSetup: boolean; readonly isTelecomBacked: boolean;
  isCallTracked(cid: string): boolean;
  getRegisteredCallIds(): string[];
  getAvailableAudioEndpoints(cid: string): Promise<AudioEndpoints>;
  requestAudioEndpointChange(cid: string, endpoint: string): Promise<void>;
}
const unavailable = () => new Error('connect_native_route_unavailable');
const endpointType = (type?: string) => type === 'earpiece' ? 'Earpiece' : type === 'speaker' ? 'Speaker'
  : type === 'bluetooth' ? 'Bluetooth Device' : type === 'wired_headset' ? 'Wired Headset' : 'Unknown';

/** Telecom routing belongs to one canonical call, never the first global registration.
 * SDK events invalidate this read model; their SDK-managed payload cannot override Telecom. */
export function createNativeCallAudio(input: {
  platform: 'ios' | 'android'; cid?: string; port(): TelecomAudioPort;
  sdk: Pick<NativeAudioHandle, 'devices' | 'select' | 'observeDevices'>;
}): Pick<NativeAudioHandle, 'devices' | 'select' | 'observeDevices'> {
  let telecomOwned = false;
  const context = () => {
    if (input.platform !== 'android') return null;
    if (!input.cid || !/^betweener_connect:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.cid)) throw unavailable();
    const port = input.port();
    if (port.isSetup && port.isTelecomBacked) {
      if (port.isCallTracked(input.cid)) { telecomOwned = true; return port; }
      if (telecomOwned || port.getRegisteredCallIds().length > 0) throw unavailable();
    } else if (telecomOwned) throw unavailable();
    return null;
  };
  const devices = async (): Promise<NativeAudioState> => {
    try {
      const port = context();
      if (!port) {
        const state = await input.sdk.devices();
        if (context()) throw unavailable(); // A registration handover needs a fresh read.
        return state;
      }
      const snapshot = await port.getAvailableAudioEndpoints(input.cid!);
      if (context() !== port || !Array.isArray(snapshot.endpoints)) throw unavailable();
      return { devices: snapshot.endpoints.map(endpoint => ({ id: endpoint.id, type: endpointType(endpoint.type) })),
        selectedDeviceId: snapshot.currentEndpoint?.id, currentEndpointType: endpointType(snapshot.currentEndpoint?.type) };
    } catch { throw unavailable(); }
  };
  return {
    devices,
    select: id => {
      try {
        const port = context();
        return port ? port.requestAudioEndpointChange(input.cid!, id).catch(() => { throw unavailable(); }) : input.sdk.select(id);
      } catch { throw unavailable(); }
    },
    observeDevices: listener => {
      let active = true, revision = 0;
      const unsubscribe = input.sdk.observeDevices(state => {
        const request = ++revision;
        try {
          if (!active) return;
          if (!context()) { listener(state); return; }
          // Reuse the owner's existing SDK subscription. No extra native listener.
          void devices().then(fresh => {
            if (active && request === revision) listener(fresh);
          }).catch(() => undefined); // The bounded selector independently retries/validates reads.
        } catch { /* Native notifications cannot escape into the event dispatcher. */ }
      });
      return () => { active = false; ++revision; unsubscribe(); };
    },
  };
}
