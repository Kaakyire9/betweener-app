// Sentry Metro integration for Expo (adds source map support and improves stack traces).
// Safe to keep even when Sentry isn't configured; it will be a no-op unless @sentry/react-native is installed.
const { getSentryExpoConfig, withSentryConfig } = require("@sentry/react-native/metro");

module.exports = (async () => {
  let config;

  try {
    // Preferred path for Expo-managed projects.
    config = getSentryExpoConfig(__dirname);
  } catch (_error) {
    // Fallback for environments where `expo/metro-config` can't be required (version skew, offline, etc).
    // This keeps Metro usable while still enabling the Sentry Metro plugins.
    const { getDefaultConfig } = require("metro-config");
    config = await getDefaultConfig(__dirname);
    config = withSentryConfig(config);
  }

  return config;
})();
