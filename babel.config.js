module.exports = function (api) {
  api.cache(true);
  return {
    // Use the Expo preset (recommended for SDK 50+). The expo-router plugin
    // is deprecated in favor of this preset. Keep the Worklets plugin last.
    presets: ["babel-preset-expo"],
    plugins: [
      // Reanimated 4 moved its Babel plugin to react-native-worklets.
      "react-native-worklets/plugin",
    ],
  };
};
