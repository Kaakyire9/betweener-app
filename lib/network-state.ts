export type NetworkReachabilityState = {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
};

export const isNetworkConnectionAvailable = (
  state?: NetworkReachabilityState | null,
) => state?.isConnected === true && state.isInternetReachable !== false;
