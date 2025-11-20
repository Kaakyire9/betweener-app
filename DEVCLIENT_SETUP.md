Why build a dev-client?

A development client (EAS dev-client) includes native modules that Expo Go doesn't (for example, native parts of react-native-reanimated, gesture-handler, expo-blur, expo-linear-gradient). To fully verify and finish the Reanimated migration you need a dev-client so worklet APIs are available at runtime.

Preflight checks (run in PowerShell)

1) Check package.json contains required native deps
   Get-Content package.json | Select-String "react-native-reanimated" -SimpleMatch
   Get-Content package.json | Select-String "react-native-gesture-handler" -SimpleMatch
   Get-Content package.json | Select-String "expo-linear-gradient" -SimpleMatch
   Get-Content package.json | Select-String "expo-blur" -SimpleMatch

2) Ensure your Babel config includes the Reanimated plugin last
   Open `babel.config.js` and verify the last plugin is 'react-native-reanimated/plugin'. Example:

   module.exports = function(api) {
     api.cache(true);
     return {
       presets: ['babel-preset-expo'],
       plugins: [
         // other plugins
         'react-native-reanimated/plugin' // <-- must be last
       ]
     };
   };

3) (Optional) Install EAS CLI if you haven't already
   npm install -g eas-cli

Create a minimal `eas.json` (already provided below as an example in the repo). The key part is `developmentClient: true` on your development profile.

Build & install (Android, PowerShell)

1) Login to Expo/EAS (opens browser)
   eas login

2) Start the EAS build (development profile)
   eas build --profile development --platform android

3) Download & install the APK on a device or emulator
   - From the EAS build page you can download the artifact.
   - Or with adb (if you downloaded to C:\temp\app.apk):
     adb install -r C:\temp\app.apk

4) Start Metro in dev-client mode
   expo start --dev-client -c

5) Open the installed dev-client on device/emulator and connect to Metro
   - Scan the Metro QR code or manually enter the URL shown in Metro.

Quick runtime checks inside the app

- Open the Explore screen and watch the Metro logs for missing-worklet errors.
- If `useAnimatedGestureHandler is not a function` is gone and gestures run smoothly, you're ready to fully enable native worklets in `ExploreStack.reanimated`.

Notes & troubleshooting

- iOS dev-client requires macOS and Xcode to build locally or an Apple developer account for EAS builds.
- If the build fails due to a native linking error, ensure your native package versions are compatible with your Expo SDK and run `expo prebuild` locally to catch issues.
- If you prefer I can kick off the EAS build, but that requires your Expo account credentials and CI/builder access (I can only provide instructions and files here).

Next steps after dev-client succeeds

- Re-enable the worklet branch and remove JS fallbacks in `ExploreStack.reanimated`.
- Convert stacked-card styles to shared/derived values and test performance.
- Add docs and a smoke test for `performSwipe` and gesture behavior.
