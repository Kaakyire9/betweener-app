// Sentry Metro integration for Expo (adds source map support and improves stack traces).
// Safe to keep even when Sentry isn't configured; it will be a no-op unless @sentry/react-native is installed.
const { getSentryExpoConfig, withSentryConfig } = require("@sentry/react-native/metro");
const { boundCacheStores } = require("./config/metro/bounded-cache-store");
const {
  createWindowsMetroBlockList,
  mergeMetroBlockList,
} = require("./config/metro/windows-block-list");

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

  // Stream Video adds a large native module graph. Keep worker threads off on
  // Windows, cap the process pool, bound cache I/O, and exclude local tooling
  // trees that the fallback watcher would otherwise watch directory-by-directory.
  // Production/EAS bundles run on Linux and are unaffected by this guard.
  if (process.platform === "win32") {
    config.maxWorkers = 4;
    config.transformer = {
      ...config.transformer,
      unstable_workerThreads: false,
    };
    config.resolver = {
      ...config.resolver,
      blockList: mergeMetroBlockList(
        config.resolver?.blockList,
        createWindowsMetroBlockList(__dirname),
      ),
    };
    config.cacheStores = boundCacheStores(config.cacheStores ?? [], {
      maxConcurrency: 8,
    });
  }

  return config;
})();
