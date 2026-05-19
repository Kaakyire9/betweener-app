import { DeviceEventEmitter } from 'react-native';

export const NETWORK_RESTORED_EVENT = 'betweener:network_restored';

export type NetworkRestoredEvent = {
  reason: string;
  at: number;
};

export const emitNetworkRestored = (event: NetworkRestoredEvent) => {
  DeviceEventEmitter.emit(NETWORK_RESTORED_EVENT, event);
};

export const subscribeToNetworkRestored = (
  listener: (event: NetworkRestoredEvent) => void,
) => {
  const subscription = DeviceEventEmitter.addListener(NETWORK_RESTORED_EVENT, listener);
  return () => subscription.remove();
};
