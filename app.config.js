const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

function withGooglePlayPackageVerificationAsset(config) {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const token = process.env.GOOGLE_PLAY_PACKAGE_VERIFICATION_TOKEN;
      if (!token) return modConfig;

      const assetsDir = path.join(modConfig.modRequest.platformProjectRoot, 'app', 'src', 'main', 'assets');
      fs.mkdirSync(assetsDir, { recursive: true });
      fs.writeFileSync(path.join(assetsDir, 'adi-registration.properties'), token.trim(), 'utf8');
      return modConfig;
    },
  ]);
}

module.exports = ({ config }) => {
  const androidMapsApiKey =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY ||
    process.env.GOOGLE_MAPS_ANDROID_API_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY;
  const iosMapsApiKey =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY ||
    process.env.GOOGLE_MAPS_IOS_API_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY;

  // EAS "development" builds typically use a development provisioning profile (APNS sandbox).
  // TestFlight / Ad Hoc / App Store builds use production APNS.
  const apnsMode =
    process.env.EXPO_PUBLIC_ENVIRONMENT === 'development' ? 'development' : 'production';
  return {
    ...config,
    plugins: [
      // Keep this plugin first so the NSE target is present before other iOS plugins run.
      [
        'expo-notification-service-extension-plugin',
        {
          mode: apnsMode,
          iosNSEFilePath: './assets/NotificationService.m',
        },
      ],
      [
        'expo-build-properties',
        {
          android: {
            minSdkVersion: 26,
            compileSdkVersion: 36,
            targetSdkVersion: 36,
          },
          ios: {
            deploymentTarget: '16.4',
          },
        },
      ],
      [
        'react-native-maps',
        {
          iosGoogleMapsApiKey: iosMapsApiKey,
          androidGoogleMapsApiKey: androidMapsApiKey,
        },
      ],
      withGooglePlayPackageVerificationAsset,
      ...(config.plugins ?? []),
      'expo-asset',
      'expo-image',
      '@react-native-community/datetimepicker',
      'expo-web-browser',
      'expo-sqlite',
      'expo-secure-store',
      [
        'expo-audio',
        {
          recordAudioAndroid: true,
          enableBackgroundRecording: false,
          enableBackgroundPlayback: false,
        },
      ],
      'expo-apple-authentication',
      // Note: Sentry is configured via the Expo config plugin in app.json:
      // ["@sentry/react-native/expo", { organization, project }]
      // Avoid adding '@sentry/react-native' here to prevent duplicate/competing config plugins.
    ],
  };
};
