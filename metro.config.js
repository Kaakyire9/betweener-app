// Sentry Metro integration for Expo (adds source map support and improves stack traces).
// Safe to keep even when Sentry isn't configured; it will be a no-op unless @sentry/react-native is installed.
const { getSentryExpoConfig } = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);

// Work around Metro package-exports resolution issues some ESM packages hit on Expo/Metro.
// This keeps Metro on the classic mainFields resolver path (react-native/browser/main).
// If you later upgrade Expo/Sentry and want to try package exports again, flip this back to true.
config.resolver = config.resolver || {};
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
