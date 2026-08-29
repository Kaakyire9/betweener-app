// Sentry Metro integration for Expo (adds source map support and improves stack traces).
// Safe to keep even when Sentry isn't configured; it will be a no-op unless @sentry/react-native is installed.
const { getSentryExpoConfig, withSentryConfig } = require("@sentry/react-native/metro");
const { boundCacheStores } = require("./config/metro/bounded-cache-store");

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

  // Stream Video adds a large native module graph. Expo enables Metro worker
  // threads by default, and long-running Windows dev servers can retain enough
  // worker file handles to eventually fail with EMFILE while loading that
  // graph. Keep transformation in the Metro process on Windows so there is one
  // owner for file handles and cache entries. Production/EAS bundles run on
  // Linux and are unaffected by this local-development guard.
  if (process.platform === "win32") {
    config.maxWorkers = 1;
    config.transformer = {
      ...config.transformer,
      unstable_workerThreads: false,
    };
    config.cacheStores = boundCacheStores(config.cacheStores ?? [], {
      maxConcurrency: 8,
    });
  }

  return config;
})();
