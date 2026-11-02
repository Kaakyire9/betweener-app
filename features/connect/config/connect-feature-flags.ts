// No environment toggle or public native composition. Enabling requires separate review.
export const connectFeatureFlags = Object.freeze({ endCallAndBlock: false, nativeSafetyOwner: false });
export interface ConnectFeatureFlags { endCallAndBlock: boolean; nativeSafetyOwner?: boolean }
