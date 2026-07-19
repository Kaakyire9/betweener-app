const path = require("node:path");

module.exports = {
  testEnvironment: require.resolve("jest-environment-node"),
  resolver: require.resolve("@react-native/jest-preset/jest/resolver.js"),
  haste: {
    defaultPlatform: "ios",
    platforms: ["android", "ios", "native"],
  },
  roots: ["<rootDir>/__tests__"],
  testMatch: ["**/*.interaction.test.ts?(x)"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^react-native($|/.*)": `${path.dirname(require.resolve("react-native"))}/$1`,
    "^react-native-vector-icons$": "@expo/vector-icons",
    "^react-native-vector-icons/(.*)": "@expo/vector-icons/$1",
  },
  setupFiles: [require.resolve("@react-native/jest-preset/jest/setup.js")],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testPathIgnorePatterns: ["/node_modules/"],
  transform: {
    "^.+\\.[jt]sx?$": ["babel-jest", { presets: ["babel-preset-expo"] }],
    "^.+\\.(bmp|gif|heic|jpg|jpeg|m4v|mov|mp3|mp4|otf|pdf|png|svg|ttf|webp)$":
      "<rootDir>/test/jest/asset-transformer.cjs",
  },
  transformIgnorePatterns: [
    "node_modules/(?!(react-native|react-native-mmkv|@react-native|@react-navigation|expo(nent)?|expo-router|@expo(nent)?/.*|expo-.*|@expo/.*|@unimodules/.*|unimodules|lucide-react-native|react-native-svg|@sentry/.*)/)",
  ],
};
