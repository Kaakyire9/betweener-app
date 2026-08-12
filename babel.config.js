module.exports = function (api) {
  api.cache(true);
  const isProduction = process.env.NODE_ENV === "production";

  return {
    // Expo 57 configures Router, Reanimated, and Worklets through this preset.
    // Adding the Worklets plugin again causes the same transforms to run twice.
    presets: ["babel-preset-expo"],
    // Development diagnostics stay available locally, but production bundles
    // must not expose identifiers, storage paths, or internal state.
    plugins: isProduction ? ["transform-remove-console"] : [],
  };
};
