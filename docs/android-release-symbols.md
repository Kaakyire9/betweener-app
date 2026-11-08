## Android Release Optimization and Symbols

### Resolved build policy

| EAS profile | Android package | Remote environment | Android task | R8/minify | Resource shrinking | Mapping required |
| --- | --- | --- | --- | --- | --- | --- |
| `development` | `com.aduboffour.betweener.staging` | `preview` | debug development client | off | off | no |
| `staging` | `com.aduboffour.betweener.staging` | `preview` | release APK | off | off | no |
| `playStaging` | `com.aduboffour.betweener.staging` | `preview` | `bundleRelease` | off | off | no |
| `production` | `com.aduboffour.betweener` | `production` | `bundleRelease` | on | on | yes |

The generated React Native Gradle project defaults both
`android.enableMinifyInReleaseBuilds` and
`android.enableShrinkResourcesInReleaseBuilds` to `false`. The production EAS
profile deliberately overrides both properties to `true`. Hermes remains
enabled for every profile.

Google Play's “no deobfuscation file” message is expected for an unminified
`playStaging` bundle. No `mapping.txt` exists for that build, and R8 must not be
enabled only to hide the warning.

### Production mapping lifecycle

Every production Android build:

1. Runs `:app:bundleRelease` with R8 and resource shrinking enabled.
2. Generates `android/app/build/outputs/mapping/release/mapping.txt`.
3. Runs `eas-build-on-success`, which verifies:
   - build profile is `production`;
   - application ID is `com.aduboffour.betweener`;
   - `mapping.txt` exists and declares `# compiler: R8`;
   - Sentry's upload token is available to the build.
4. Writes `build-artifacts/android-release-symbols/release-mapping-manifest.json`.
   The manifest binds the mapping SHA-256 and R8 map ID to the exact package,
   version name, version code, EAS build ID, and Git commit.
5. Uploads both files as private EAS build artifacts.

Never reuse a mapping or manifest from another version code. These generated
artifacts are ignored by Git.

### Google Play

For an AAB produced by a current Android Gradle plugin, the standard bundle
task packages the R8 deobfuscation metadata and Google Play associates it with
that bundle automatically. The separate EAS artifact is a recovery/audit copy.

If a manual replacement is ever required, use the mapping and manifest from
the same EAS build:

1. Open Google Play Console.
2. Select the production app.
3. Open **Test and release > App bundle explorer**.
4. Select the matching version code.
5. Open **Downloads**, then find **Assets**.
6. Use the upload control for the ReTrace mapping file.

### Sentry

The installed `@sentry/react-native` integration provides three distinct
Android symbol paths:

- Metro/Sentry integration generates and uploads Hermes JavaScript source maps.
- Sentry Android Gradle Plugin uploads R8/ProGuard mappings.
- The same plugin uploads native debug symbols.

`SENTRY_AUTH_TOKEN` is stored in both EAS `preview` and `production`
environments and is never committed. Development and ordinary staging profiles
may explicitly disable automatic uploads. Production keeps them enabled.

Do not override Sentry's runtime `release` or `dist`. The native integration and
Gradle uploader must share the default
`applicationId@versionName+versionCode` identity. Staging and production remain
separate through both their package IDs and Sentry `environment` values.

### Keep-rule audit

The project does not add blanket keep rules. React Native, Expo modules,
RevenueCat, Firebase, Google Play Billing, Stream, Sentry, WebRTC, camera/Nitro,
and notification dependencies provide consumer rules and/or `@Keep` metadata.
The generated app rules retain only Reanimated and React Native TurboModule
classes. No Twilio Android dependency is installed; current calling is provided
by Stream/WebRTC.

Run the repository policy gate with:

```powershell
npm.cmd run verify:android-release
npm.cmd run test:android-release
```
