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

require("expo-router/entry");
