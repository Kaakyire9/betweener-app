# Milestone 5H-F — Final EAS credential verification

Date: 2026-10-12

Scope: read-only EAS and local release-candidate verification

## Staging project identity

| Property | Verified value |
| --- | --- |
| EAS project | `@kaakyire9/betweener-staging` |
| EAS project ID | `7f38a835-2da7-419b-a20b-e1a12e021547` |
| Supabase project | `xsgzxadwuxuziubglvps` |
| iOS bundle | `com.aduboffour.betweener.staging` |
| Android package | `com.aduboffour.betweener.staging` |
| App version / runtime | `1.2.0` / app-version policy |
| Update URL | `https://u.expo.dev/7f38a835-2da7-419b-a20b-e1a12e021547` |

The Supabase migration ledger contains 237 matched versions and records `20261011170000_relationship_gist_trigger_function_execute_hardening` as the latest migration.

## Build-profile readiness

### iOS — `testflightStaging`

- remote credential source;
- store distribution;
- EAS environment `preview`;
- update channel `staging`;
- bundle `com.aduboffour.betweener.staging`;
- Notification Service Extension bundle `com.aduboffour.betweener.staging.NotificationServiceExtension`;
- app group `group.com.aduboffour.betweener.staging.nse`;
- staging associated domain;
- staging Firebase plist selection;
- dedicated staging update URL and EAS project ID.

### Android — `playStaging`

- remote credential source;
- store distribution;
- EAS environment `preview`;
- update channel `staging`;
- package `com.aduboffour.betweener.staging`;
- `app-bundle` build type;
- staging Firebase JSON selection;
- dedicated staging update URL and EAS project ID;
- Asset Links requires SHA-256 `DD:AA:74:85:27:A4:AD:D3:FD:F6:5E:CC:33:43:93:9A:88:CB:ED:5B:42:85:19:48:F1:4E:09:B6:1A:AA:AE:98`.

## Signing readiness

EAS CLI `24.12.1` exposes credential details only through `eas credentials`, an interactive credential-management workflow that can mutate, generate, replace, or rotate credentials. The task explicitly prohibits entering a mutation-capable workflow, so that command was not opened.

Read-only evidence confirms that this dedicated project successfully completed credential-backed Android and iOS development builds on 2026-10-07 for the staging application identifier and runtime `1.2.0`.

Previously verified credential evidence records:

- Android staging keystore certificate SHA-256: `DD:AA:74:85:27:A4:AD:D3:FD:F6:5E:CC:33:43:93:9A:88:CB:ED:5B:42:85:19:48:F1:4E:09:B6:1A:AA:AE:98`;
- iOS distribution certificate serial: `B55008FD1EB3ADE52F0783A22EC5EFC`;
- main iOS provisioning profile: `487Z9J7AGY`;
- Notification Service Extension provisioning profile: `2V5KX4UN69`.

The current expiry and current remote-record fingerprint/profile IDs could not be freshly retrieved through a supported read-only CLI operation. They are therefore not represented as freshly verified. No credential value or private signing material was read or printed.

## Environment isolation

- EAS `preview` resolves `EXPO_PUBLIC_ENVIRONMENT=staging`.
- Supabase resolves only `xsgzxadwuxuziubglvps`.
- Both staging Firebase file variables exist as secret file variables.
- RevenueCat staging isolation verifier: PASS for iOS, Android, Spark Store and production non-interference.
- All six Android subscription products resolve to the staging package namespace.
- Live environment isolation verifier: PASS for staging and production separation.
- Production resolution remains unchanged.
- No Relationship Gist V2 feature flag is present in EAS `preview`; all seven capabilities remain default-off.
- No build, OTA publication, migration, Edge Function, or environment-variable mutation occurred.

## Candidate integrity

| Check | Result |
| --- | --- |
| Candidate | `C:\Projects\betweener-gist2-rc-5f-20261011` |
| Payload paths | 57 |
| SHA-256 matches | 57/57 |
| Reproduction patch paths | 57 |
| Reproduction patch SHA-256 | `3D51DB1CA6FA5E9B8D37299EA02CA75BEEC653BB77638D9BE4A661D93577DFAF` |
| Patch deletions | 0 |
| Betweener Live source paths | 0 |
| Security migration SHA-256 | `42CA85CA878E4506F42FEE1E12B7E5EA3CBBDD24FA5BC98452551F9AB7D894AB` |

No Live Studio deletion or unrelated development path is included.

## Remaining blocker

Before authorizing store builds, an operator must confirm—without changing anything—that the current EAS dashboard still shows:

1. the expected Android staging keystore fingerprint;
2. an unexpired iOS distribution certificate with the recorded serial;
3. active App Store provisioning profiles for both the main app and Notification Service Extension with the recorded identifiers and matching entitlements.

This manual dashboard confirmation is required because the installed EAS CLI cannot expose those details read-only.

## Proposed build commands — not authorized in this milestone

```powershell
$env:APP_VARIANT = 'staging'
eas build --platform ios --profile testflightStaging --non-interactive
eas build --platform android --profile playStaging --non-interactive
Remove-Item Env:APP_VARIANT
```

Run the platforms separately after explicit build authorization.

`IOS_STAGING_BUILD_READY = CONDITIONAL_PASS`

`ANDROID_STAGING_BUILD_READY = CONDITIONAL_PASS`

`EAS_CREDENTIAL_READINESS = CONDITIONAL_PASS`

`DEVICE_BUILD_READINESS = CONDITIONAL_PASS`

`EAS_BUILDS_AUTHORIZED = NO`

`PRODUCTION_MODIFICATIONS = NONE`

`STAGING_MODIFICATIONS = NONE`

`BUILDS = NONE`

`OTA_PUBLICATIONS = NONE`
