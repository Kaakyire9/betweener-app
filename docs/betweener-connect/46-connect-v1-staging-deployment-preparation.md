# Connect V1 M3.3: staging deployment preparation

Date: 2026-11-01. Scope: local source correction, disposable PostgreSQL/REST validation and a non-executing deployment proposal. **The duplicate Intent panel is fixed. The six unchanged migrations pass a rehearsal against the 16 measured staging function contracts. Deployment preparation is CONDITIONAL; no hosted operation or activation is authorised.**

Starting evidence is [Report 45](45-connect-v1-staging-read-only-parity-results.md). Its single-use inspection was not reused. The [rollout proposal](46-connect-v1-staging-rollout-proposal.md) and [source/hash package](connect-v1-m3-3-staging-deployment-package.json) are review artifacts, not executable approvals. No Supabase/Stream hosted query, migration, deployment, provider call, account lookup, build, installation, OTA or physical-device operation ran.

## 1. Exact local changes

| File | Change |
|---|---|
| `app/(tabs)/intent.tsx` | Delete the second adjacent `ConnectCallingPreferences` mount. Preserve the first panel inside the existing animated header, before `SegmentedToggle`. |
| `__tests__/connect-staging-preparation.regression.test.cjs` | Parse the complete actual Intent TSX tree; require exactly one panel in its original header placement. Also check per-function gateway separation and the six-file/Edge source package. |
| `__tests__/connect-intent-push.interaction.test.tsx` | Two additional light/dark checks: one labelled voice control, accessible refresh button, theme text colour, voice update preserving an already-true independent video preference, no consent decision dispatched. Existing offer/recipient-approval tests remain. |
| `supabase/config.toml` | Explicit `verify_jwt=true` for credentials/revoke-consent; false only for Connect worker/webhook custom-auth handlers. Existing push and all Live configurations remain unchanged. |
| `scripts/lib/connect-test-database.cjs` | Optional baseline/observation hooks inside the existing empty disposable clone. Default test behaviour remains; no second provider worker, authority or database service was introduced. |
| `scripts/rehearse-connect-staging-local.cjs` | Reconstruct measured pre-Connect contracts inside that clone, apply the exact six files, test defaults/security boundaries/loopback REST and migration failure atomicity, capture impact and baseline differences. |
| `scripts/prepare-connect-staging-deployment.cjs` | Offline-only package generator: hash migrations/source closure, check Report 45 hashes, and write deployment arguments as data. It does not spawn a deployment CLI or load credentials. |
| Documentation | This report, its concise rollout proposal and the new M3.3 JSON package. Prior reports/manifests/receipts remain immutable. |

The panel correction changes no eligibility, grant, native ownership, navigation or call lifecycle logic. Offers still require recipient decisions, voice never grants video, and changing preferences never certifies recipient acceptance. Default-off rendering still performs no Connect RPCs. Theme/accessibility results are component tests, not physical-device verification.

## 2. Six-file dependency and impact review

All six files retain their **Report 45 SHA-256 hashes**; none was edited or replaced. Exact hashes are in the proposal/package.

| Order | Migration | Dependency and impact |
|---|---|---|
| 1 | `20261028064220_relationship_acceptance_authority.sql` | Existing relationship/Intent/swipe/signal/block/account-merge contracts. Adds independent proof/revocation authority and guarded shared entrypoints. Existing accepted labels do not become proof automatically. |
| 2 | `20261028074908_connect_v1_foundation.sql` | Requires relationship authority. Adds private Connect config, grants, sessions, occupancy, rates, jobs, webhook receipts and RPCs; uses existing `public.blocks`. |
| 3 | `20261028143424_connect_m2a_revocation_cleanup.sql` | Requires foundation; durable consent/end claims and end-prioritised worker behaviour. |
| 4 | `20261029081013_connect_forensic_repair_1.sql` | Requires prior admission/job/occupancy contracts; repairs admission/reconciliation fences. |
| 5 | `20261031035826_connect_end_block_local_foundation.sql` | Requires the repaired call/outbox and relationship pair-lock/watermark authority. Atomic existing account block, terminal transition and durable end work; default-off gate. |
| 6 | `20261031191352_connect_m3_1_intent_and_notifications.sql` | Requires prior Connect state and the already-applied shared push contracts. Adds empty staging allowlist, Intent discovery, installation capability and canonical notification wrappers/triggers. |

**Shared staging impact needs explicit approval:** migration 1 changes relationship entrypoints, block guards and the guarded account-merge wrapper across staging, including existing Intent/swipe/signal/Live Spark relationship sources. Connect flags do not isolate those shared authority changes. It preserves legacy labels without inventing consent proof. Migration 6 wraps existing shared push claim/reservation signatures and keeps their legacy implementations private. Disabling Connect notifications must preserve non-Connect delivery. No Live source, setting or unrelated migration was changed here.

Do not replay the eight applied push prerequisites on staging, apply unrelated local pending migrations, or repair the unrelated Live version mismatch from Report 45. All future source hashes and baseline definitions must still match before any write.

## 3. Disposable baseline: what was reproduced

The rehearsal uses the existing local Docker PostgreSQL 17.6 and an empty-data schema clone, with a unique database and loopback-only PostgREST container. No real local/staging users, messages, calls or secret rows are copied. The shared local app schema is read for its schema dump and is not patched.

Report 45 provided body fingerprints for **nine push functions and seven legacy relationship entrypoints**. The first local reconstruction matched **15/16**. `public.rpc_service_reserve_push_notification_deliveries_v1` differed:

```text
Original local definition MD5: c5d3bf8147121e2deee6c4ae8ee9129e
Report 45 staging MD5:         5fa1156d1d4973dfcd74a48bfa67397c
```

The runner restored that one pre-existing function definition from the retained `20260914124000_push_notification_delivery_reservations.sql` **inside the disposable baseline only**. Its source file hash remains `73c30533b27085fa532eafc1b49d6e2701a5c393f5da1a16b48354724dbfffa1`. This produced the measured staging fingerprint. The final baseline matches **16/16**. The initial mismatch/log/receipt remain retained; no staging definition was downloaded, guessed or edited to force equivalence.

The local source schema already had the earlier push event/reservation machinery. Missing application-provenance structure and its staging identity were reconstructed from retained October 6 definitions in the clone. This was **baseline construction**, not a deployment replay or part of the six-file delta. The deployment package contains only the six core files. Synthetic nonsecret push configuration replaces real configuration, and push dispatch is disabled by a test double after its original definition is measured.

This reproduces the measured function contracts and known prerequisite structure, **not the full staging database, version, data distribution, secret configuration or concurrent workload**. Definition MD5s are comparison fingerprints. They do not replace security review or a fresh approved pre-deployment read. No authenticated hosted inspection was performed during M3.3.

## 4. Rehearsal results and rollback impact

The final run applies all six exact files, in order, and passes **11/11 focused checks** plus the **88 relationship assertions** run by the reused helper:

- A deliberately pre-existing notification delegate name makes migration 6 fail late; its own transaction rolls back new config columns and triggers. After removing only that deliberate local conflict, the unchanged file applies successfully.
- All config gates initially false, environment `unconfigured`, allowlist empty.
- Existing `public.blocks` has both relationship/Connect guards, with no duplicate block table.
- Anonymous/authenticated/service execution boundaries and inaccessible private push delegates remain distinct.
- Function-impact inventory: **74 created/changed definitions**, **zero removed**, **zero outside the reviewed six-file impact**, including dynamically generated guarded legacy wrappers.
- Loopback authenticated REST cannot create a call with all gates disabled.
- Empty allowlist denies otherwise eligible synthetic accounts; an approved synthetic pair does not admit another valid matched pair.
- Invalid/duplicate scope and enabled production configurations reject.
- Final synthetic state has gates off, empty scope, zero calls and zero provider jobs.

Test fixture flags were temporarily changed only inside disposable databases to exercise these predicates. No staging account was configured or looked up. The existing full End & Block suite separately exercised duplicate/retry, block/unblock races, stale leases, pending cleanup and call/generation binding; the consent/push suite exercised recipient-only media decisions and notification races.

Each migration contains its own transaction. A failed later file does not roll back an earlier committed file. On a future partial deployment: stop, preserve the committed security/schema prefix and keep admission/push off; compare actual definitions/history before deciding the next step. Do not reapply non-idempotent files blindly after an ambiguous response.

There is **no automatic down migration**. Removing relationship proof/revocation guards or durable end obligations would weaken security. Migration 6's renamed push delegates/ACLs must not be undone ad hoc. Default-off containment and a reviewed forward fix are preferred. Restoring the old push handler requires a verified previous source/bundle/config archive; Report 45 retained hashes, not a deployable archive.

## 5. Edge source and gateway package

The JSON package inventories five exact entrypoints, all recursively discovered relative sources/config files and external import specifiers. Local source hashes are pinned; full transitive remote bundling is not claimed.

| Function | Gateway JWT | Existing handler authentication | First matched voice pilot |
|---|---|---|---|
| `connect-credentials` | true | Bearer + `auth.getUser`, current call/device/authority checks and dual credential fences. | Required. |
| `connect-provider-worker` | false | Dedicated `x-connect-worker-secret`, constant-time HMAC-based comparison, existing lease/strict ACK fences. | Required; scheduling/invocation remains separately approved. |
| `connect-webhook` | false | Bounded raw-body Stream HMAC before any RPC, exact Connect event/call parsing and replay digest. | Prepared; reconciliation routing or an explicitly reviewed sync alternative must be established before testing. |
| `connect-revoke-consent` | true | Bearer + `auth.getUser`, authoritative durable revoke, optional bounded fast end attempt. | **Optional**. Current Intent UI uses grant-revoke RPC plus durable worker; no new endpoint is needed to invent consent authority. |
| `push-notifications` | false, unchanged | Existing event-ID HMAC/replay, provenance, reservations and new default-off Connect contract. | Required for standard incoming push testing. |

Connect pins Stream server SDK **0.7.63** and Supabase SDK **2.110.7**. Push retains its existing `https://esm.sh/@supabase/supabase-js@2` major alias and pinned standard-library URL. That inherited alias is **not** a reproducible full bundle. No shared push dependency was silently upgraded/pinned. Before replacing the deployed handler, the owner must review resolved dependency/bundle provenance and archive the rollback revision. This is a package condition, not grounds for a native app rebuild.

CLI 2.121.0 `functions deploy --help` was inspected locally with telemetry disabled. The prepared arguments explicitly name one function and the approved project, using `--use-api`; only worker/webhook/push include `--no-verify-jwt`. No deploy, prune, bulk deploy or endpoint invocation ran. User endpoints keep gateway authentication; if actual staging JWT algorithm/key compatibility requires a different setting, stop for a specific review rather than blanket-disabling it. [Function configuration](https://supabase.com/docs/guides/functions/function-configuration).

## 6. Narrow prerequisite resolution

| Gap | Safe next attestation; not performed here |
|---|---|
| Secret/configuration presence | Owner-approved staging Dashboard inspection with a screenshot/export cropped to **names/presence only**, project identity visible, no reveal/copy of values. Check the names in Report 45 plus `CONNECT_WORKER_SECRET` and the existing signing/Vault references. A response containing secret values is not an acceptable source for later redaction. Presence does not prove correct value or app binding. |
| Stream app/type | App 1731011, name Betweener Staging: redacted Dashboard evidence or a documented secret-free metadata projection showing auth/permission checks, exact custom grants, ordinary/global restrictions, ended-call permissions, capture/egress settings, limits/lifecycle and routing. Do not call secret-bearing `getApp` as a workaround, inspect users/calls or change policy. |
| Worker | Install the inert handler only after separate deployment approval. No schedule or POST in the infrastructure-only phase. Before a pilot, approve the exact scheduler/invocation mechanism, secure secret reference, cadence/capacity, retry/monitoring owner and owned-job checks; one invocation processes one job after its sweep. No global/unowned queue draining. |
| Webhook | Verify an approved routing design to the deployed HMAC handler without changing existing Live routing. Deployment, configured route and tested delivery are separate facts. Do not create a global Stream route automatically; supervised sync is not a universal termination guarantee. |
| Push | Verify staging native/EAS tuple, existing HMAC/reference names, destination registration/capability and APNs/FCM/Expo prerequisites under separate approval. No test push now. Preserve shared non-Connect delivery and the existing `verify_jwt=false` HMAC path. |
| Accounts | Exactly two later owner-approved, isolated staging Auth users with authoritative profiles/installations; no private email search, lookup, enrollment or binding now. Allowlisting does not supply match proof, preferences or media consent. |
| Binaries | Prefer existing Android/iPhone clients. Cached Android modules/method names are present; iOS archive/installed APIs, signing and patch-version compatibility remain unverified. A separately approved package/module inspection precedes app bootstrap/sensors. New binary work only on a demonstrated native/signing blocker. |

These gaps were not worked around with fresh authenticated reads, raw secret responses, test-user queries or device actions. Production reference `jbyblhithbqwojhwlenv` remains a deny target. The standalone harness and all Media Truth/classifier work remain deferred/unchanged.

## 7. Fresh validation

All counts below are this milestone's runs, not Report 43/44 totals. Logs and exact selections are in `tmp/connect-staging-preparation-46/`.

| Check | Result |
|---|---|
| Existing relevant Connect/relationship/credential/native owner/push/deep-link/selected Live regressions plus four new preparation cases | **386/386 PASS**, 22 Node files, zero skips/TODOs; `offline-1.log`. Four package/composition cases also rerun after the final manifest update, **4/4**, not counted twice. |
| Voice/safety/product/Intent-push UI | **45/45 PASS**, four Jest suites; includes two added theme/accessibility/video-value preservation cases. |
| Final six-file rehearsal | **11/11 PASS**, measured baseline **16/16**, **88/88 relationship assertions**; `migration-rehearsal-final.log`, `migration-rehearsal.json`. Initial 15/16 reconstruction is retained separately. |
| Existing consent/push PostgreSQL/REST | **26/26 PASS**, plus **88/88 relationship assertions**; `consent-database.log`. |
| Existing End & Block PostgreSQL/REST | **22/22 PASS**, plus **88/88 relationship assertions**; `end-block-database.log`. |
| TypeScript | Root `tsc -p tsconfig.json --noEmit` PASS, exit 0; no build. |
| ESLint | **24 unique files**, zero warnings, PASS; changed scripts rechecked after final preparation changes. |
| Deno 2.5.4 | PASS for strict isolated copies of all four Connect entrypoints and the shared push contract, with inherited `@ts-nocheck` removed from the Connect copies. `--no-remote --deny-import --no-lock --node-modules-dir=none`. No runtime/handler execution. The full legacy HTTP-importing push entrypoint was not newly claimed as strictly checked. |
| Live/EAS isolation | Both PASS; selected Live ownership/bootstrap/config/recovery regressions pass. The full historical Live suite is not relabelled green. |
| Disposable cleanup | All owned test databases/REST containers removed; final read shows zero remaining matching test databases and the shared local app still lacks Connect/relationship repair tables, as before. No shared schema application. |

The 88 relationship assertions are the **same suite run in each database runner**, not 264 unique tests. Accepted focused SQL/REST scenarios total **59** (11 + 26 + 22); rehearsal repeats are not counted as additional coverage. Zero accepted assertion failures remain. Initial Deno invocation used an unsupported `--cached-only` flag and exited before checking; the supported no-remote/deny-import run passed, with both logs retained.

Exact commands: Node uses `node --no-warnings=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test --test-reporter=tap --test-concurrency=2` with `test-selection.json`. Jest uses `node --no-deprecation node_modules/jest/bin/jest.js --runInBand --config jest.config.js` and the four Connect interaction files. Database runners are `node scripts/rehearse-connect-staging-local.cjs`, `node --no-warnings=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/test-connect-product-consent-local.cjs`, and `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/test-connect-end-block-local.cjs`. Local Docker access required the sandbox's approved execution permission; no hosted credentials or hardware permission was requested.

## 8. Recommended next action and preserved boundaries

Review the [infrastructure-only rollout proposal](46-connect-v1-staging-rollout-proposal.md), its exact six hashes, gateway settings and explicit history-registration/configuration writes. Resolve the push rollback/dependency and safe metadata prerequisites before authorising their associated writes. Fresh staging parity must precede execution; Report 45 is historical evidence, not continuing access authority.

Installation must finish with every calling/push gate disabled and scope empty. Staging environment initialisation is a separately approved default-off configuration write, not account activation. Metadata verification can establish installed definitions/configuration; authenticated rejection/fault/pilot behaviour requires a further explicit scope. Do not invoke mutation-capable RPCs under a read-only parity label.

No default-off flag disconnects existing media. Keep durable cleanup, terminality, Auth epoch/native ownership isolation and the unverified remote-enforcement boundary intact. Native hardware shutdown and the existing iOS/Android builds are not certified by these tests. Report 18's negative result, B3's INCONCLUSIVE verdict and all prior gates remain unchanged.

The final receipt records all **2487** baseline entries: four intentional file changes and all other entries unchanged, with all **555** protected historical records and Report 45 receipts preserved. The six migration hashes, prior manifests, Live/Circle/Studio source and consumed B1/B2/B3 approvals/ledgers are unchanged. Only the listed preparation/test/documentation files were added.

```text
CONNECT_INTENT_DUPLICATE_PANEL = FIXED
CONNECT_STAGING_MIGRATION_REHEARSAL = PASS
CONNECT_STAGING_DEPLOYMENT_PACKAGE = CONDITIONAL
CONNECT_STAGING_EXECUTION = NOT_AUTHORISED
CONNECT_TWO_ACCOUNT_ACTIVATION = NOT_AUTHORISED
CONNECT_REMOTE_REVOCATION_BOUND = UNVERIFIED
CONNECT_M2A_SECURITY_GATE = BLOCKED
CONNECT_M2B_READY = BLOCKED
STAGING_MODIFICATIONS = NONE
PRODUCTION_MODIFICATIONS = NONE
```

PASS applies to the bounded measured-contract rehearsal. CONDITIONAL identifies the unresolved deployment/rollback/provenance checks; neither authorises infrastructure changes, calling or release.
