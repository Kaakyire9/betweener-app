if (process.env.NODE_ENV === "production") {
  require("expo-router/entry");
} else {
  require("expo/src/Expo.fx");

  const { AppRegistry } = require("react-native");
  const { withErrorOverlay } = require("@expo/metro-runtime/error-overlay");
  const { App } = require("expo-router/build/qualified-entry");

  AppRegistry.registerComponent("main", () => withErrorOverlay(App));
}
