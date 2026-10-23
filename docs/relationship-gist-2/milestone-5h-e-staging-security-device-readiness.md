# Milestone 5H-E — Staging security patch and device readiness

Date: 2026-10-12

Scope: dedicated Staging security patch and isolated release candidate

Baseline: `f560559b6a3ef09ecb7fd7dfadf9bd742a88184a`

## Staging security patch

Dedicated Staging project `xsgzxadwuxuziubglvps` (`betweener-staging`) was positively identified as `ACTIVE_HEALTHY`. The predeployment ledger contained 236 matched versions and exactly one local-only migration. The dry run selected only `20261011170000_relationship_gist_trigger_function_execute_hardening.sql`.

Approved SHA-256: `42CA85CA878E4506F42FEE1E12B7E5EA3CBBDD24FA5BC98452551F9AB7D894AB`.

The migration was applied with seed, roles, and Vault updates excluded. The postdeployment ledger contains 237 matched versions, zero mismatches, and `20261011170000` as the latest local and remote version.

The schema-only postcheck confirms:

- no direct grant to `PUBLIC`, `anon`, `authenticated`, or `service_role` remains for `relationship_gist_ai_clone_provenance()` or `relationship_gist_ai_enforce_review_gate()`;
- both exact trigger functions remain present;
- both expected triggers remain bound to `relationship_gist_revisions`;
- no seed, role, Vault, Edge Function, feature-flag, or unrelated migration change occurred.

Recovery evidence was reverified immediately before deployment. Archive SHA-256: `AB66CF487613BC4787845BD479F4B1462015348DF711CDD6B7C1781C466E5B1B`. Encrypted recovery-key blob SHA-256: `74220568DBF13E4968890122B50CA2F3D07E53ED187297D6BB21EC7CE1A59659`.

The migration contains exact trigger-binding and privilege postconditions. Prior disposable validation remains 18/18 hardening assertions and 214/214 total Gist pgTAP assertions.

## Generated types and admin-context RPC

Types were regenerated read-only from verified Staging schemas `public` and `graphql_public` into the isolated candidate.

`rpc_get_my_admin_context()` is an existing Staging RPC, not a stale declaration. The schema dump proves the function exists, is revoked from `PUBLIC`, and is granted only to `authenticated` and `service_role`. The client call remains runtime-tolerant through its legacy `is_internal_admin` fallback.

Generated types SHA-256: `EA075F675E116B1B3AF9EFBF24E334C59025707191A8615B58D75031FBCFA016`.

## EAS readiness

| Check | Result |
| --- | --- |
| EAS project | `@kaakyire9/betweener-staging` |
| Project ID | `7f38a835-2da7-419b-a20b-e1a12e021547` |
| `testflightStaging` | store / preview / channel `staging` / remote credentials |
| iOS bundle | `com.aduboffour.betweener.staging` |
| NSE bundle | `com.aduboffour.betweener.staging.NotificationServiceExtension` |
| `playStaging` | store / preview / channel `staging` / app bundle / remote credentials |
| Android package | `com.aduboffour.betweener.staging` |
| Updates URL | `https://u.expo.dev/7f38a835-2da7-419b-a20b-e1a12e021547` |
| Runtime version | app-version policy, current `1.2.0` |
| Recent credential-backed builds | Android and iOS development builds both `FINISHED` on 2026-10-07 |

Current store credential records were not opened through the interactive credential-management UI, so credential readiness remains conditional on a final read-only operator confirmation that no record changed since the previously verified Android SHA-256 and iOS certificate/profile evidence.

No build or OTA update was started.

## Regression classification

The five `content_safety_moderation.sql` failures (assertions 19, 20, 22, 23, and 27) were recorded in the repository-wide disposable run before this remote migration. The migration only revokes direct execution on two Relationship Gist trigger functions, and all focused database suites passed after it locally.

- pre-existing: yes;
- environment/order dependent: likely, limited to the recursive repository-wide suite;
- Gist candidate related: no evidence;
- security relevant: yes, as unrelated moderation regression debt;
- modified here: no.

## Validation

| Gate | Result |
| --- | --- |
| TypeScript | PASS, 0 diagnostics |
| Scoped ESLint | PASS, 0 warnings/errors |
| Focused Node regressions | PASS, 46/46 |
| Jest offline/state suites | PASS, 17/17 across 4 suites |
| Local Gist pgTAP including hardening | PASS, 214/214 (prior disposable evidence, unchanged checksum) |
| Remote migration ledger | PASS, 237/237 matched |
| Remote grant and trigger schema verification | PASS |
| iOS and Android resolved staging profiles | PASS |
| Reproduction-patch whitespace check | PASS |
| Payload SHA-256 manifest | PASS, 57/57 |

## Remaining device prerequisite

Perform one final read-only EAS credential-record confirmation for the Android keystore and both iOS targets. Do not rotate or replace credentials. Builds remain unauthorized in this milestone.

`STAGING_SECURITY_PATCH = PASS`

`GENERATED_TYPES = PASS`

`EAS_CREDENTIAL_READINESS = CONDITIONAL_PASS`

`DEVICE_BUILD_READINESS = CONDITIONAL_PASS`

`EAS_BUILDS_AUTHORIZED = NO`

`PRODUCTION_MODIFICATIONS = NONE`

`STAGING_MODIFICATIONS = SECURITY_PATCH_ONLY`

`COMMITS = NONE`
