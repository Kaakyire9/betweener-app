module.exports = {
  dependencies: {
    // Keep ML Kit face detection off iOS builds for now.
    // It pulls Google ML pods during `pod install`, which has been the flaky point on EAS.
    'react-native-vision-camera-face-detector': {
      platforms: {
        ios: null,
      },
    },
  },
};
