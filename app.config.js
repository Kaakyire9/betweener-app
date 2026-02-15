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
  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      'expo-secure-store',
      '@react-native-community/datetimepicker',
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
