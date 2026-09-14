const { StreamVideoRN } = require("@stream-io/video-react-native-sdk");
const {
  getStreamVideoBackgroundClient,
} = require("./features/live/media/stream-video-background-client");

StreamVideoRN.setPushConfig({
  android: {
    defaultDeviceEndpointType: "speaker",
    enableOngoingCalls: true,
  },
  ios: {
    callsHistory: false,
    defaultDeviceEndpointType: "speaker",
    enableOngoingCalls: true,
    supportsVideo: true,
  },
  createStreamVideoClient: async () => getStreamVideoBackgroundClient(),
});

if (process.env.NODE_ENV === "production") {
  require("expo-router/entry");
} else {
  require("expo/src/Expo.fx");

  const { AppRegistry } = require("react-native");
  const { withErrorOverlay } = require("@expo/metro-runtime/error-overlay");
  const { App } = require("expo-router/build/qualified-entry");

  AppRegistry.registerComponent("main", () => withErrorOverlay(App));
}
