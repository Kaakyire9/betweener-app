module.exports = function (api) {
  api.cache(true);
  return {
    // Use the Expo preset (recommended for SDK 50+). The expo-router plugin
    // is deprecated in favor of this preset. Keep reanimated plugin last.
    presets: ['babel-preset-expo'],
    plugins: [
      // Keep Reanimated plugin last as required by react-native-reanimated docs.
      'react-native-reanimated/plugin',
    ],
  };
};
