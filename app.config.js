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
      ...(config.plugins ?? []),
      'expo-secure-store',
      'expo-audio',
      'expo-apple-authentication',
      // Note: Sentry is configured via the Expo config plugin in app.json:
      // ["@sentry/react-native/expo", { organization, project }]
      // Avoid adding '@sentry/react-native' here to prevent duplicate/competing config plugins.
    ],
    ios: {
      ...config.ios,
      config: {
        ...(config.ios?.config ?? {}),
        googleMapsApiKey: iosMapsApiKey,
      },
    },
    android: {
      ...config.android,
      config: {
        ...(config.android?.config ?? {}),
        googleMaps: {
          ...(config.android?.config?.googleMaps ?? {}),
          apiKey: androidMapsApiKey,
        },
      },
    },
  };
};
