module.exports = {
  preset: "jest-expo",
  testEnvironment: "node",
  roots: ["<rootDir>/__tests__"],
  testMatch: ["**/*.interaction.test.ts?(x)"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testPathIgnorePatterns: ["/node_modules/"],
  transformIgnorePatterns: [
    "node_modules/(?!(react-native|react-native-mmkv|@react-native|@react-navigation|expo(nent)?|expo-router|@expo(nent)?/.*|expo-.*|@expo/.*|@unimodules/.*|unimodules|lucide-react-native|react-native-svg|@sentry/.*)/)",
  ],
};
