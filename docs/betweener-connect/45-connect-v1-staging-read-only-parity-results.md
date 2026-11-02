# Connect V1 M3.2: staging read-only parity results

Date: 2026-11-01. Repository: `C:\Projects\betweener-app`. Authority: one owner-approved, read-only staging inspection. **Staging identity is verified. All six core Connect migrations and four Connect Edge functions are missing; the deployed push function does not contain M3.1 Connect support. Calling cannot be activated from this state.**

The safe inspection is complete with specific limitations: fresh Stream policy, Edge secret-name inventory and complete installed-client compatibility remain unverified. No source correction, hosted write, provider request, account lookup, activation, device access, build or OTA ran. The owner proposal in section 10 separates the next steps; it is not an approval or executable rollout.

## 1. Target and mandatory preflight

Reviewed [Report 42 product integration](42-connect-v1-native-product-integration.md), [Report 43 product completion](43-connect-v1-m3-1-product-completion.md), [Report 44](44-connect-v1-m3-2-staging-readiness-review.md), its [execution proposal](44-connect-v1-m3-2-staging-execution-proposal.md), the current `connect-v1-m3-staging-readiness.json`, source and retained receipts. No duplicate-panel closeout was found.

| Identity | Result |
|---|---|
| Git branch | `feature/betweener-live` |
| HEAD | `f5a4be7edd8fb532e185068e5524c51ab250163d` |
| Worktree | Existing dirty/untracked work retained; complete porcelain status and **2486** baseline entries in `tmp/connect-m3-2-inspection-45/workspace-before.json`. |
| Local linked Supabase ref | `xsgzxadwuxuziubglvps`; read from the existing link, without relinking. |
| Fresh Supabase connector metadata | **`betweener-staging`, `xsgzxadwuxuziubglvps`, `eu-north-1`, `ACTIVE_HEALTHY`**. Each later connector request explicitly used this ref. |
| Native/EAS target | `com.aduboffour.betweener.staging`; project `7f38a835-2da7-419b-a20b-e1a12e021547`. |
| Production deny target | `jbyblhithbqwojhwlenv`. **No connection, query, configuration inspection or other network request to it.** |

Local public configuration needs deliberate handling: base `.env` names the denied production backend; `.env.local` names the approved staging backend with `APP_VARIANT=staging` and `EXPO_PUBLIC_ENVIRONMENT=staging`. These are local identity observations, not production access. Neither file was applied to an app/bootstrap/CLI process. The audit used explicitly pinned connector parameters, never an inferred/default backend.

Authentication used the existing Supabase connector connection. No publishable/admin key retrieval, local PAT decryption, database password, keyring fallback, login or credential creation was used. The unused repository CLI wrapper would validate the linked staging ref and use an existing DPAPI credential when no ambient PAT is set; only its source and credential-file presence were inspected. No Supabase/Stream credential variable names were present in the audit process environment. The local Stream staging credential file exists but was **not opened or used**. No EAS authentication flow was started.

## 2. Exact read-only operations

Seven authenticated Supabase connector operations were performed, all against the approved staging ref:

| Operation | Parameters/scope |
|---|---|
| `supabase_get_project` | `id=xsgzxadwuxuziubglvps`; positive name/ref/region check before database inspection. |
| `supabase_list_migrations` | `project_id=xsgzxadwuxuziubglvps`; migration identifiers/names only. |
| `supabase_list_edge_functions` | Same project; retain the five Connect-related targets only. No unrelated function source was requested. |
| `supabase_execute_sql` — catalog | `BEGIN READ ONLY; SELECT ...; ROLLBACK;` over `pg_class`, `pg_namespace`, `pg_proc`, `information_schema.columns`, `pg_trigger`, `pg_constraint` and `to_regclass`. Names/signatures/configuration/body digests, not application RPC execution. |
| `supabase_execute_sql` — shared prerequisites | Read-only transaction; push function signatures/digests, boolean configuration/reference checks, nonsecret staging application tuple and filtered cron metadata. Exact SQL is retained in `shared-readiness.json`. |
| `supabase_get_edge_function` | `function_slug=push-notifications`; compute source hashes and feature-presence facts in memory. Persist no deployment source content. |
| `supabase_execute_sql` — relationship contracts | Read-only transaction; the 24 exact function names from the local relationship-authority migration, signatures/body digests and authority-reference booleans. |

Local commands included `git branch --show-current`, `git rev-parse HEAD`, `git status --porcelain=v1 --untracked-files=all`, `git ls-files --cached --others --exclude-standard -z`, `git show f560559b6a3ef09ecb7fd7dfadf9bd742a88184a:package-lock.json`, scoped source reads, JSON parsing and SHA-256 checks. No app/worker/audit runner, migration CLI, dry-run mutation command or device command was executed.

The operation inventory and redacted data are under `tmp/connect-m3-2-inspection-45/`. Queries did not select Auth users, profiles, call records, push tokens, decrypted Vault values or raw cron commands. Unrelated catalog rows are omitted from retained summaries. Catalog body digests are provenance fingerprints, not proof that every security predicate is correct.

## 3. Migration parity: six core files missing

Staging reports **272** applied migration identifiers; the local directory contains **281**. All eight shared push prerequisites listed by Report 43 are recorded as applied. **None of the six core Connect/relationship-authority identifiers is applied.** Catalog absence independently corroborates the history result.

| Missing exact file under `supabase/migrations/` | Absent contract |
|---|---|
| `20261028064220_relationship_acceptance_authority.sql` | New decision/proof/revocation authority, pair locking and relationship/block guards. |
| `20261028074908_connect_v1_foundation.sql` | Connect config, preferences, grants, sessions, occupancy, rates, durable provider jobs, webhook receipts and RPC/state machine. |
| `20261028143424_connect_m2a_revocation_cleanup.sql` | Repaired end-prioritised claiming, durable revocation and end-claim contracts. |
| `20261029081013_connect_forensic_repair_1.sql` | Current admission/reconciliation and occupancy repair. |
| **`20261031035826_connect_end_block_local_foundation.sql`** | Report 38's call-bound context/End & Block/status RPCs, atomic existing-block/terminal/outbox operation and default-off gate. |
| `20261031191352_connect_m3_1_intent_and_notifications.sql` | Two-account staging restriction, canonical Intent consent, Connect notification production/validation and installation capability. |

The eight applied prerequisite identifiers are:

```text
20260913200000
20260914123000
20260914124000
20260914125000
20260914126000
20260914127000
20261006150000
20261006170000
```

Their presence is not a claim that every historical body equals the current repository. Current relevant push functions/tables and configuration were additionally inspected as described below. Do not reapply these eight files merely because Connect is missing.

**History drift outside this rollout:** staging-only identifier `20261027103846_live_product_release_gate` has no local file with that version; local `20261027102730_live_product_release_gate.sql` has no same-version staging entry. The other non-Connect local-only identifiers are `20261023164001`, `20261023170552` and `20261023192724`. These differences do not authorise replay, repair or modification of Live. No corresponding Live function or call-instance investigation was performed. This is a concrete reason to use a narrowly reviewed migration list rather than a broad push.

`migration-comparison.json` records the exact expected/applied differences, all local-only identifiers, the staging-only identifier and local source hashes. The initial remote history entry named `remote_production_baseline` is a migration label **in staging**, not evidence of a production query.

## 4. Database contracts, triggers and configuration

**All 43 distinct Connect-named routines expected by these local migrations are absent** in the queried public/private catalog. The complete local declaration inventory, including migration provenance and named arguments, is `local-function-contracts.json`. This includes:

```text
rpc_connect_check_eligibility(uuid,text,text,uuid)
rpc_connect_get_preferences() / rpc_connect_set_preferences(boolean,boolean)
rpc_connect_get_grant(uuid)
rpc_connect_request_grant(uuid,boolean,boolean)
rpc_connect_decide_grant(uuid,boolean,boolean)
rpc_connect_revoke_grant(uuid) / rpc_connect_revoke_consent(uuid)
rpc_connect_get_intent_consent(uuid)
rpc_connect_create_call(uuid,text,text,uuid,uuid,uuid)
rpc_connect_act(uuid,text,integer,uuid)
rpc_connect_get_call(uuid) / rpc_connect_get_history(timestamptz,integer)
rpc_connect_admission(uuid,uuid)
rpc_connect_end_block_context(uuid,uuid,timestamptz)
rpc_connect_end_call_and_block(uuid,uuid,timestamptz,uuid,jsonb)
rpc_connect_end_block_status(uuid,uuid,timestamptz)
rpc_connect_register_notification_capability(uuid,boolean)
rpc_connect_claim_job() / rpc_connect_claim_end(uuid)
rpc_connect_worker_snapshot(uuid)
rpc_connect_complete_job(uuid,text,uuid,boolean)
rpc_connect_reconcile_media(uuid,text,uuid[],boolean)
rpc_connect_enqueue_sync(uuid,text) / rpc_connect_sweep()
```

No `private.connect_*` relations, associated constraints or Connect triggers were found. Thus `private.connect_provider_jobs` and its lease/status/attempt structure, durable occupancy and `end_block_requests` cannot be verified as deployed: **they are missing**. There is no `private.connect_config` row/schema to read. Hosted values of `enabled`, `provider_ready`, `end_block_enabled`, `notifications_enabled` or `staging_test_users` must not be invented as false/empty; their required configuration is not deployed.

`public.blocks` exists with RLS enabled. No user-defined trigger was found on it. In particular, the expected `relationship_block_guard` and Connect block guard are absent. This inspection did not insert a block or claim that the legacy table currently terminalises Connect sessions.

The four new private relationship-security tables and private pair/proof helpers are absent. Of the 24 expected relationship migration function names, seven legacy public routines exist with their catalog signatures: `handle_mutual_swipe`, `rpc_admin_execute_account_merge_case(uuid)`, `rpc_cancel_intent_request(uuid)`, `rpc_cancel_signal(uuid)`, `rpc_create_intent_request(uuid,text,text,timestamptz,text,jsonb)`, `rpc_decide_intent_request(uuid,text)` and `rpc_send_signal(uuid,text,text,text,uuid)`. Their inspected bodies do not reference the queried new pair-lock/proof helpers. The other 17 names, including `rpc_is_relationship_mutually_verified(uuid)` and `rpc_get_accepted_relationship(uuid)`, are absent. Matching a legacy signature does not establish the new authority implementation. No function was invoked to test behaviour.

## 5. Edge presence and verified deployment differences

| Function | Fresh staging result | Source/deployment parity |
|---|---|---|
| `connect-credentials` | **Missing** | User authentication and two credential fences are local source only. |
| `connect-provider-worker` | **Missing** | No deployed worker auth, lease/ACK or provider-job processing attestation. |
| `connect-webhook` | **Missing** | No deployed Connect signature handler; endpoint was not invoked. |
| `connect-revoke-consent` | **Missing** | Optional fast-path source exists locally, not deployed. |
| `push-notifications` | **ACTIVE, version 26, `verify_jwt=false`** | Retrieved deployment differs from M3.1 local source. |

Push provenance is stronger than a name-presence check:

```text
Deployed bundle ezbr_sha256:
28d351d383d76ab687daf56c90f2293b78db3905694bf330c92979d3d64505d9

Retrieved deployed push-notifications/index.ts SHA-256:
2b21087151fe5736861a8964b615323e5ad0c2b95f90181c1178ea48bc8169f7

Current local index.ts SHA-256:
b5e2f0f15a86450535c32934006ef5c0c19c7fc7a3b4ec800a1cc8e5d7589d16
```

The deployed index lacks `CONNECT_NOTIFICATIONS_ENABLED` and the `connect-push-contract` integration; the retrieved bundle contains no Connect contract file. This demonstrates a semantic difference, not just a possible line-ending hash difference. Its four retrieved shared helper sources—admin-key resolution, webhook security, notification compatibility and environment provenance—match their local SHA-256 hashes. Detailed paths/hashes are in `push-deployment-comparison.json`. The server bundle digest and individual source digests measure different artifacts and are not compared to each other.

Client deep-link/payload/Auth handling remains local M3.1 code. No OTA, JS delivery or app launch was used to put it in either phone. Presence of an older shared push endpoint cannot establish incoming Connect delivery readiness.

## 6. Worker, webhook, secret presence and notifications

| Axis | Observed state | Limit |
|---|---|---|
| Provider worker deployment | Missing. | Cannot be operationally verified. |
| Database scheduler | No filtered cron command references `connect-provider-worker` or other `connect-` target. | External scheduler configuration was not exposed by the permitted metadata; no worker invocation was attempted. Declaration remains UNVERIFIED. |
| Shared push maintenance | Two matching active cron entries: `* * * * *` and `17 3 * * *`. | Scheduling metadata only; no execution/result claim. Raw commands/headers were never retrieved. |
| Connect webhook | Missing deployment. | No endpoint probe, signature test or provider routing read. |
| Shared push signing | Webhook target configured to the approved staging push endpoint; current signing key identifier and secret reference present; the referenced Vault **name** exists. Previous-key configuration absent. | Boolean/reference checks only. No decrypted value, signed request or delivery test. |
| Push application provenance | Staging environment, native ID `com.aduboffour.betweener.staging`, EAS project `7f38a835-2da7-419b-a20b-e1a12e021547`. | Actual APNs/FCM credentials, registrations and device delivery unverified. |
| Existing push database contracts | Event/reservation/provenance structures and nine relevant dispatcher/claim/reservation/destination/registration function signatures/digests present. Claim/reservation bodies have no Connect logic. `push_tokens.connect_push_contract` absent. | The M3.1 guards, opted-in installation capability and canonical Connect producer are not deployed. No token rows read. |
| Edge environment secret names | **UNVERIFIED.** | No guaranteed names-only inventory was established through available tools. |

The Management secret-list API documents a response field named `value`; the checked documentation did not establish a guaranteed names-only projection. It was therefore **not called**, and no CLI secret-list workaround was run. This is an inspection limit, not evidence that credentials are absent. [Supabase secret-list response](https://supabase.com/docs/reference/api/v1-list-all-secrets).

Required source variable names remain `CONNECT_ENVIRONMENT`, `CONNECT_STREAM_APP_ID`, `CONNECT_STREAM_API_KEY`, `CONNECT_STREAM_API_SECRET`, `CONNECT_WORKER_SECRET`, `SUPABASE_URL`, the existing public/admin key-helper alternatives, `CONNECT_NOTIFICATIONS_ENABLED`, `PUSH_DELIVERY_MODE`, `PUSH_APP_ENVIRONMENT`, `PUSH_APPLICATION_ID`, `PUSH_EXPO_PROJECT_ID`, `PUSH_HMAC_CURRENT_KEY_ID` and `PUSH_HMAC_CURRENT_SECRET`. Previous HMAC names are conditional on an existing rotation window. Names in source are not deployed secret-presence attestation. No missing key was inferred and no key was rotated.

The local repository still needs reviewed custom-auth gateway settings for the worker/webhook when deployed: platform JWT checks must be compatible with their existing `x-connect-worker-secret` and raw Stream-signature handlers. A narrowly scoped `verify_jwt=false` configuration for those handlers would preserve their own authentication; do not blanket-disable user endpoint authentication. No gateway change was made.

## 7. Stream: fresh policy not attested

Approved expected target remains **Betweener Staging / 1731011 / `betweener_connect`**. **No authenticated Stream request ran.** This is not a successful fresh policy verification.

The installed server SDK 0.7.63 implements application inspection as `CommonApi.getApp()` → `GET /api/v2/app`. Its declared `GetApplicationResponse.app` is `AppResponseFields`, which includes `sns_secret`, `sqs_secret` and push-provider configuration. A documented secret-free application identity projection was not established. Under this instruction's ban on retrieving secret values, fetching that response and redacting it afterwards was not an acceptable substitute. The local staging credential file was not opened to work around that limit.

Consequently, current exact application identity/auth checks could not be positively attested through that path. A subsequent credential-selected call-type GET was also skipped rather than assuming a current app binding from a credential label. No roles/users/Live calls, lifecycle settings, notification providers or webhook routes were queried. This needs a supported secret-free metadata view/export bound to app 1731011, or suitable owner-supplied redacted dashboard evidence, in a later approved inspection.

Retained Oct 28 policy evidence still records these **historical expectations**, not fresh findings:

- Authentication and permission checks enabled; exact `betweener_connect` type and pair membership.
- `connect_invited`: read-call. `connect_voice`: read-call, join-call, send-audio. `connect_video`: those plus send-video. Ordinary/global grants restricted; no ended-call join grant in the retained policy.
- Two participants; recording, transcription/captions, screenshare, broadcast, ingress and other capture/egress disabled.
- Product provisioning uses `ring:true, notify:false`; provider notification/ring routing and the existing Live-only OS-action callback still require review before a future test.

Current role grants, global capabilities, ended-call admission, limits/duration and notification configuration all remain **UNVERIFIED**, as does any autonomous media-enforcement bound. No type/global-role/application modification is proposed merely to make this inspection pass. Report 18's negative result and B3's INCONCLUSIVE verdict are unchanged.

## 8. Two accounts and duplicate-panel status

**Two-account binding is PENDING.** The server restriction is not deployed because `private.connect_config` and its M3.1 migration are absent. It cannot currently be described as a tested server-side rejection of non-allowlisted accounts. The local implementation defaults to no staging accounts and adds the pair check to existing authority; ordinary match proof, account safety, preferences and directional/media-specific consent remain independent requirements.

No Auth user/profile lookup, private email lookup, login, account creation or enrollment was performed. The two manifest identity slots remain null. Later the owner must approve two isolated staging Auth IDs, each mapped to exactly one safe profile/installation, and separately authorise storing exactly that pair under environment **staging**. The local-fixture environment must not be used to bypass the staging restriction. Empty/wrong/extra-account configurations must fail closed. No account IDs or credentials appear here.

**Duplicate Intent panel remains a local blocker.** Current source still mounts `<ConnectCallingPreferences />` twice at `app/(tabs)/intent.tsx:3228–3229`; file SHA-256 is `54cccc458b90dabc110bbb502a3518f5424f728095e148469b7a8e6fdf7550ad`. No closeout source/test/report was found. Preserved Report 44 evidence remains 15/16 readiness probes with that ordinary failure, alongside 382/382 Node regressions, 43/43 UI on rerun, TypeScript/lint/isolation passes. Those are historical test results, not newly run tests. No source correction or regression rewrite was made during this inspection.

## 9. Existing development builds

The cached Android APK was freshly hashed and matches the retained inspected archive:

```text
2fe6471298eb0fbab899c23bd01d21a4edf0fd053f52e52a842591214f4d3fdc
```

Its retained extraction records StreamInCallManager/StreamVideoReactNativePackage, WebRTC, Callingx, ExpoAudio, development launcher and notification classes, with all 17 inspected required audio/factory/track/stream method names present. Retained manifest/package evidence includes the staging package, app 1.2.0/versionCode 1/debuggable, microphone/notification/Bluetooth permissions and staging scheme. No app process/device was contacted in this milestone. Static names do not establish autolink registration, signatures, ABI, actual native lifecycle or hardware shutdown. The APK is not hash-linked to the EAS download artifact.

The two owner-installed builds retain these metadata records, originally queried **2026-10-31T07:00:46.807Z**:

| Platform | Existing build | Retained metadata / current limit |
|---|---|---|
| Android / Galaxy A17 5G | `a3d480e9-38f9-4e75-beb6-55038e91bc00` | FINISHED development/internal, staging native ID, app/runtime 1.2.0, build 1; cached APK available. Full integrated compatibility UNVERIFIED. |
| iOS / iPhone 15 Pro | `43e33173-cd96-41b1-8e9e-9df6834930a8` | FINISHED development/internal physical-device IPA, same staging identity/runtime/build. No IPA/native registration/entitlement inspection here; compatibility UNVERIFIED. |

Both retain commit `f560559b6a3ef09ecb7fd7dfadf9bd742a88184a` and the approved staging EAS project. Public build pages were inaccessible through the available read-only web tool; no new EAS login/token/CLI flow or artifact download was attempted. Artifact availability/expiry is not proof of current iOS provisioning validity or what is currently installed.

| Dependency | Retained build-commit lock | Current installed |
|---|---|---|
| Expo | 57.0.27 | 57.0.30 |
| React Native | 0.86.3 | 0.86.3 |
| Stream RN SDK | 1.46.0 | 1.46.3 |
| Stream video client | 1.61.0 | 1.62.0 |
| Stream WebRTC | 145.4.1 | 145.4.1 |
| Callingx | 0.11.5 | 0.11.5 |
| Expo Notifications | 57.0.22 | 57.0.23 |
| Expo Audio | 57.0.5 | 57.0.5 |
| Expo dev client | 57.0.19 | 57.0.20 |

No new native dependency was added by M3/M3.1 and no demonstrated missing Android voice module justifies an automatic rebuild. Prefer existing clients after actual installed ID/module/API compatibility checks. For iOS, obtain safely redacted EAS Dashboard/archive/installed-build facts for embedded SDK/native modules, microphone usage description, notification entitlement/provisioning and signing validity; local package versions cannot prove them. A new build/install is necessary only if a specific required native API/permission/entitlement/signing incompatibility is established and separately approved.

The existing development profile uses a staging native variant but `EXPO_PUBLIC_ENVIRONMENT=development`. A later approved root Metro session needs the staging JS environment; do not weaken the runtime guard. Compatible JS/TS delivery does not itself require a rebuild or OTA. Opening the integrated app is network-capable and remains separately authorised work. Neither USB nor ordinary LAN should be described as external network isolation.

## 10. Minimum separately approvable next steps

| Scope | Concrete next proposal; nothing executed here |
|---|---|
| **A. Local source fixes** | Remove one duplicate Intent preferences mount and add a full-screen composition regression. Prepare explicit custom-auth deployment configuration for the worker/webhook. Keep every calling/video switch off. No feature rebuild or new harness. |
| **B. Staging migrations and Edge** | Review only the **six missing core files in section 3**, in dependency order, including the relationship migration's shared-function impact. Do not replay the eight applied push prerequisites or repair unrelated history. Voice needs `connect-credentials` and `connect-provider-worker`; standard Connect notifications need the updated `push-notifications` plus its new contract dependency after SQL parity. Full declared Edge parity additionally includes `connect-webhook` and `connect-revoke-consent`; the latter is an optional fast path for the initial matched pilot. Explicitly decide provider reconciliation routing and worker/push scheduling; no blind global webhook change. Verify required environment names through a safe names-only mechanism before proposing any secret write. All deployments/configuration writes need an exact later approval. |
| **C. Two accounts and activation** | Select two owner-approved non-production staging accounts without private-email searching; verify Auth/profile/installation bindings under a later approved scope. Deploy/verify the default-deny restriction before binding exactly the pair. Confirm independent match/voice preferences and no block. Only later approve client/runtime/native-owner/End & Block and server voice/provider/notification gates for that pair. Video and pre-match publication remain off for the first pilot. No widening or consent bypass. |
| **D. Development builds** | Review existing installed Android/iOS package/native metadata first, no sensors or app launch. Resolve the iOS metadata and patch-version compatibility gaps. Prefer existing binaries; request a specific build/sign/install only on a demonstrated blocker. No OTA is needed for compatible root Metro development delivery. |
| **E. Future two-person test** | Only after the above and a fresh secret-free Stream app/type/routing attestation, request a bounded two-account voice/push pilot with exact source/config hashes, call/time budgets, microphone/device permission and cleanup ownership. Report 44's proposed two sequential calls—ordinary End then End & Block—remain a proposal, not executable authority. No B1/B2/B3 reuse. |

First review A and the exact B deployment/configuration proposal, while resolving the remaining read-only Stream/secret-name/iOS metadata gaps. **Do not activate C or start E simply because the database migrations are ready.** Native OS Answer/CallKit/Telecom and killed-app ringing are outside the first pilot; the existing Live-only background callback must not receive Connect control actions.

Later rollback/emergency stop must disable new admission/delivery, stop local media independently, preserve terminality and service only owned durable end work. Keep cleanup and reconciliation available; do not delete jobs or clear ownership quarantine to recover. A disabled flag, local UI closure, metadata end or provider ACK does not disconnect or prove cessation of all already-established media. No finite remote-revocation guarantee is gained by this inspection.

## 11. Evidence preservation and final status

`tmp/connect-m3-2-inspection-45/final-verification.json` records the redacted evidence hashes and preservation result. All **2486 pre-existing workspace entries** and **555 protected historical records** remain unchanged. The only new nonignored repository file is this report. New ignored artifacts are redacted inspection receipts; no helper implementation or executable approval file was added. Prior reports/manifests, source, classifiers, experimental verdicts and consumed ledgers were not rewritten. No elevation was requested.

The inspection is **PARTIAL**, because the strict secret-handling boundary prevented fresh Stream app attestation and Edge secret-name inventory, and current installed iOS/Android runtime compatibility is not established. The confirmed missing schema/functions/push integration are concrete deployment blockers; the unverified items are not presumed failures or configuration absences.

```text
CONNECT_STAGING_IDENTITY = VERIFIED
CONNECT_STAGING_MIGRATION_PARITY = MISSING
CONNECT_STAGING_EDGE_PARITY = MISSING
CONNECT_STAGING_WORKER_SCHEDULE = UNVERIFIED
CONNECT_STAGING_WEBHOOK_READINESS = UNVERIFIED
CONNECT_STREAM_STAGING_POLICY = UNVERIFIED
CONNECT_TWO_ACCOUNT_BINDING = PENDING
CONNECT_EXISTING_ANDROID_BUILD = UNVERIFIED
CONNECT_EXISTING_IOS_BUILD = UNVERIFIED
CONNECT_STAGING_READ_ONLY_INSPECTION = PARTIAL
CONNECT_STAGING_WRITES = NONE
CONNECT_PROVIDER_WRITES = NONE
CONNECT_PRODUCTION_ACCESS = NONE
CONNECT_REMOTE_REVOCATION_BOUND = UNVERIFIED
CONNECT_M2A_SECURITY_GATE = BLOCKED
CONNECT_M2B_READY = BLOCKED
```
