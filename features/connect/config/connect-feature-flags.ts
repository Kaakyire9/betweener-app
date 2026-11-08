// No environment toggle or public native composition. Enabling requires separate review.
export const connectFeatureFlags = Object.freeze({ endCallAndBlock: false, nativeSafetyOwner: false, videoCalling: false, backgroundAudio: false, connectionRecovery: false });
export interface ConnectFeatureFlags { endCallAndBlock: boolean; nativeSafetyOwner?: boolean; videoCalling?: boolean; videoCameraOnEntry?: boolean; backgroundAudio?: boolean; connectionRecovery?: boolean; encryptedCalls?: boolean; nativeIncoming?: boolean }
