## Android Release Symbols

Betweener's Android store builds now split crash symbol handling into two clean paths:

- Google Play Console: Java/Kotlin/R8 deobfuscation via `mapping.txt`
- Sentry: JS source maps, ProGuard mappings, and native symbols for app-side crash monitoring

### What is wired

- `playInternal` and `production` EAS builds run `:app:bundleRelease` with:
  - `-Pandroid.enableMinifyInReleaseBuilds=true`
  - `-Pandroid.enableShrinkResourcesInReleaseBuilds=true`
- EAS also collects the generated R8 mapping file from:
  - `android/app/build/outputs/mapping/release/mapping.txt`
- The Expo Sentry plugin enables the Android Gradle plugin so Android release builds can auto-upload:
  - ProGuard/R8 mappings
  - native debug symbols

### Required environment

Keep `SENTRY_AUTH_TOKEN` available to EAS for Android store builds.

Without it:

- Play-side `mapping.txt` still exists and can be uploaded manually
- Sentry auto-upload of Android release debug artifacts will not happen

### Google Play Console workflow

After a minified Android store build:

1. Download the EAS build artifacts archive.
2. Extract `android/app/build/outputs/mapping/release/mapping.txt`.
3. Upload that file in Google Play Console for the matching Android version code if Play does not already have deobfuscation metadata for that release.

### Sentry workflow

If `SENTRY_AUTH_TOKEN` is present during the EAS Android release build, the Sentry Gradle/plugin integration should upload the Android release debug artifacts automatically.

What this covers:

- React Native / Hermes JS source maps
- Android ProGuard/R8 mappings
- native symbols for Android crash symbolication

### Why this split matters

Google Play Console and Sentry solve different crash-reading problems:

- Play Console needs `mapping.txt` for Java/Kotlin/R8 stack traces in Play
- Sentry needs its own uploaded debug artifacts for symbolicated app-side events

One does not replace the other.
