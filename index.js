const { StreamVideoRN } = require("@stream-io/video-react-native-sdk");
const {
  getStreamVideoBackgroundClient,
} = require("./features/live/media/stream-video-background-client");
const { assertConnectRingingOwner } = require("./features/connect/media/native-ringing-guard");
const { getConnectIncomingConfig, handleConnectNativeCallAction } = require("./features/connect/application/native-incoming-bootstrap");
const connectIncoming = getConnectIncomingConfig();

StreamVideoRN.setRingingCallLifecycleHooks({ onBeforeCallJoin: assertConnectRingingOwner, onNativeCallAction: handleConnectNativeCallAction });

StreamVideoRN.setPushConfig({
  ...(connectIncoming.enabled ? { deviceRegistration: 'manual' } : {}),
  android: {
    ...connectIncoming.android,
    ...(connectIncoming.enabled ? { skipIncomingPushInForeground: true } : {}),
    defaultDeviceEndpointType: "speaker",
    enableOngoingCalls: true,
  },
  ios: {
    ...connectIncoming.ios,
    ...(connectIncoming.enabled ? { skipIncomingPushInForeground: true } : {}),
    callsHistory: false,
    defaultDeviceEndpointType: "speaker",
    enableOngoingCalls: true,
    supportsVideo: true,
  },
  createStreamVideoClient: async () => getStreamVideoBackgroundClient(),
});
require("expo-router/entry");
