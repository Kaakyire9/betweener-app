# Milestone 5H-D — Relationship Gist device-build readiness

Date: 2026-10-11

Scope: read-only build preparation from the isolated release candidate

Baseline: `f560559b6a3ef09ecb7fd7dfadf9bd742a88184a`

## Result

The original 55-file Relationship Gist release candidate remained reproducible. Milestone 5H-C adds only the reviewed security migration and its pgTAP test, producing a 57-file application payload. No build was started.

Device-build readiness is conditional because generated Supabase types contain one stale RPC declaration that is not produced by the approved migration graph, and store-profile credential metadata was not exposed by a safe non-interactive read command. Both development platforms have successful credential-backed builds in the dedicated staging EAS project.

## Candidate integrity

| Property | Evidence |
| --- | --- |
| Candidate | `C:\Projects\betweener-gist2-rc-5f-20261011` |
| Baseline | `f560559b6a3ef09ecb7fd7dfadf9bd742a88184a` |
| Payload | 57 paths; 57/57 SHA-256 entries matched |
| Reproduction patch | 57 paths; strict cached apply check against baseline PASS |
| Patch SHA-256 | `EDA898C95A3B992FD282784E68E84169B01DDA1951245A788319D99E091A225D` |
| Deleted files in patch | 0 |
| Original worktree | HEAD unchanged; dirty-status count unchanged at 191 |

The payload contains no Betweener Live source path and the patch contains no deletion. The shared `app/(tabs)/explore.tsx` hunk remains the previously reviewed Gist-only extraction. No Live Studio deletion or missing Live import is introduced by this candidate.

## Dedicated staging identity

With `APP_VARIANT=staging`, `eas project:info` resolved:

- project: `@kaakyire9/betweener-staging`;
- project ID: `7f38a835-2da7-419b-a20b-e1a12e021547`.

### iOS — `testflightStaging`

| Check | Result |
| --- | --- |
| App variant | `staging` |
| App name/slug | `Betweener S` / `betweener-staging` |
| Bundle identifier | `com.aduboffour.betweener.staging` |
| Notification Service Extension | `com.aduboffour.betweener.staging.NotificationServiceExtension` |
| App group | `group.com.aduboffour.betweener.staging.nse` |
| Associated domain | `applinks:staging.getbetweener.com` |
| EAS environment | `preview` |
| Update channel | `staging` |
| Updates URL | `https://u.expo.dev/7f38a835-2da7-419b-a20b-e1a12e021547` |
| Distribution | `store` |
| APNS entitlement | `production` |

### Android — `playStaging`

| Check | Result |
| --- | --- |
| App variant | `staging` |
| Package | `com.aduboffour.betweener.staging` |
| EAS environment | `preview` |
| Update channel | `staging` |
| Updates URL | `https://u.expo.dev/7f38a835-2da7-419b-a20b-e1a12e021547` |
| Distribution | `store` |
| Build type | `app-bundle` |
| Asset Links certificate | `DD:AA:74:85:27:A4:AD:D3:FD:F6:5E:CC:33:43:93:9A:88:CB:ED:5B:42:85:19:48:F1:4E:09:B6:1A:AA:AE:98` |

The runtime-version policy remains `appVersion`; the current app version remains `1.2.0`.

## Backend and commerce provenance

The dedicated staging EAS `preview` environment was inspected without displaying secret values.

| Check | Result |
| --- | --- |
| `EXPO_PUBLIC_ENVIRONMENT` | `staging` |
| Supabase URL | staging project `xsgzxadwuxuziubglvps` |
| Supabase publishable/anonymous key | present; value not printed |
| RevenueCat Apple SDK identity | Betweener Staging |
| RevenueCat Google SDK identity | Betweener Staging |
| RevenueCat subscription products | all staging IDs matched |
| Public Stream API key | absent; server token path preserved |
| `GOOGLE_SERVICES_JSON` file variable | present |
| `GOOGLE_SERVICE_INFO_PLIST` file variable | present |
| Production resolution | unchanged by existing verifier |

`eas env:exec` does not materialize EAS file variables as local files, so their contents were not copied or printed. The app-config identity guard will reject a Firebase file whose Android package or iOS bundle does not match the staging identifier.

## Feature flags

All seven Gist variables were absent from the dedicated staging EAS `preview` environment and therefore remain default-off:

- `EXPO_PUBLIC_RELATIONSHIP_GIST_READER_V2_ENABLED`;
- `EXPO_PUBLIC_RELATIONSHIP_GIST_EDITORIAL_V2_ENABLED`;
- `EXPO_PUBLIC_RELATIONSHIP_GIST_AI_STUDIO_ENABLED`;
- `EXPO_PUBLIC_RELATIONSHIP_GIST_ENGAGEMENT_ENABLED`;
- `EXPO_PUBLIC_RELATIONSHIP_GIST_REACTIONS_ENABLED`;
- `EXPO_PUBLIC_RELATIONSHIP_GIST_REFLECTIONS_ENABLED`;
- `EXPO_PUBLIC_RELATIONSHIP_GIST_ANALYTICS_ENABLED`.

The server-side AI policy remains disabled from the prior staging deployment verification. No AI request was made here.

## Generated Supabase types

Types were regenerated in memory from the isolated database after every approved Gist migration plus the local hardening migration.

The candidate and generated output differ semantically in exactly one place: the candidate declares `rpc_get_my_admin_context()`, while no migration in the approved candidate creates that RPC. No Gist table, enum, row, argument, or return type differs.

The runtime admin client already treats this RPC as rollout-optional and falls back to `is_internal_admin`, but generated types are not exact. Before build authorization, regenerate `supabase/types/database.ts` from the exact approved migration graph, which removes the stale declaration, or separately approve and include the missing admin-context migration. The safer Gist-only action is regeneration; this candidate must not acquire a hidden dependency on that migration.

## Credential evidence

The dedicated staging EAS project has two recent successful development builds:

| Platform | Profile | Status | Created |
| --- | --- | --- | --- |
| Android | `development` | FINISHED | 2026-10-07 10:13:16 UTC |
| iOS | `development` | FINISHED | 2026-10-07 09:32:56 UTC |

This proves the dedicated project's development credentials and Firebase inputs were usable at those build timestamps. The local Android verifier also resolves the required staging certificate fingerprint. Current store-profile keystore, distribution-certificate, provisioning-profile, and Notification Service Extension credential records were not re-read because the installed EAS CLI exposes credential management interactively and this task did not authorize mutations. Their previously reported configuration must receive a final read-only operator confirmation before either store build.

## Validation results

| Validation | Result |
| --- | --- |
| TypeScript | PASS, 0 diagnostics |
| Scoped ESLint over the 55 original TS/TSX payload files | PASS, 0 warnings/errors |
| Node Gist plus legacy Circles authority/context regressions | PASS, 48/48 |
| Jest outbox/state/Saved Library | PASS, 17/17 across 4 suites |
| Gist pgTAP including security hardening | PASS, 214/214 |
| Focused database directory including membership regression | PASS, 275/275 |
| EAS project isolation | PASS, including six negative isolation cases |
| Android variant | PASS |
| Android release-profile verifier | PASS |
| iOS variant and extension | PASS |
| RevenueCat staging isolation | PASS |
| Live environment isolation | PASS |
| 57-file payload hashes | PASS, 57/57 |
| Strict reproduction-patch apply check / whitespace check | PASS |

The repository-wide recursive pgTAP run had five failures in the unrelated content-safety moderation suite; see the security-hardening report. All focused Gist and new security assertions passed.

## Required gates before a build

1. Regenerate and review `supabase/types/database.ts` against the exact approved migration graph.
2. Refresh the 57-file manifest and reproduction patch if regenerated types change.
3. Obtain separate authorization to apply `20261011170000_relationship_gist_trigger_function_execute_hardening.sql` to staging.
4. Run the documented read-only authenticated role canaries after that migration.
5. Confirm store-profile Android and both iOS target credentials in EAS without rotating or replacing them.
6. Re-run the identity, TypeScript, scoped lint, Node, Jest, pgTAP, and hash gates.
7. Obtain explicit EAS build authorization.

## Proposed commands — do not run without authorization

From the final approved source candidate:

```powershell
$env:APP_VARIANT = 'staging'
eas build --platform ios --profile testflightStaging --non-interactive
eas build --platform android --profile playStaging --non-interactive
Remove-Item Env:APP_VARIANT
```

Run the platforms separately so each artifact and credential resolution can be reviewed independently. Do not use the production profile.

`DEVICE_BUILD_READINESS = CONDITIONAL_PASS`

`EAS_BUILDS_AUTHORIZED = NO`

`PRODUCTION_MODIFICATIONS = NONE`

`STAGING_MODIFICATIONS = NONE`

`COMMITS = NONE`
