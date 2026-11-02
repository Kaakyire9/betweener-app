# Connect V1 M3.2: staging readiness review

Date: 2026-10-31. Repository: `C:\Projects\betweener-app`. Scope: source inspection, retained deployment/build evidence, cached APK inspection and offline checks. **Use the existing staging development clients first, after compatibility verification. No rebuild is currently justified by a demonstrated missing dependency. Staging execution is not authorised.**

The smallest path is: correct one duplicated Intent panel in a separately authorised source change; establish staging schema/function/configuration parity; bind exactly two approved staging Auth accounts; establish installed-client compatibility; then review a bounded voice-only execution proposal. Hosted parity, the actual account bindings and full binary compatibility remain unverified. The [owner proposal](44-connect-v1-m3-2-staging-execution-proposal.md) contains the ordered approval boundaries.

No authenticated hosted query, provider operation, device access, migration, deployment, build, installation, OTA or flag change ran. Report 43, both existing staging manifests, historical receipts, classifiers and consumed experiment ledgers are preserved. This report continues [Report 43 product completion](43-connect-v1-m3-1-product-completion.md), not the separate similarly numbered local calling-safety report.

## 1. Baseline and current wiring

Report 43's final receipt is `tmp/connect-product-m3-1/final-verification.json`, SHA-256 `121b1cb5a4db7361ff8c21bbad6990e1f673332493a6abb899683e334120fcf5`. Its 43 source/dependency/document hashes match the current files. Its source-freeze hash remains `184b910ce0bc65ff0cc935f8e17f534ea69b19df099610d36354ca61ca761aba`. Report 42's original manifest snapshot remains `06993ea9d09d8305819704cd44a7802b2ccd98342779206e5e14f64cf39ec08c`.

| Product boundary | Current source and finding | Remaining execution evidence |
|---|---|---|
| Intent calling permissions | `app/(tabs)/intent.tsx:2337` mounts `IntentCallingConsent`; existing repository grant request/decision/withdrawal RPCs and canonical `rpc_connect_get_intent_consent` are used. Sender offer, recipient decision and voice/video permissions remain separate. | Actual staging RPC parity; permissions remain disabled until explicitly configured. Video approval UI does not enable video transport. |
| Matched voice entry | `components/chat/ChatScreen.tsx:9271` mounts `ConnectCallEntry`, suppressing blocked/deleted peers; the existing eligibility RPC remains authoritative. | Two safe staging accounts with an actual verified mutual relationship and explicit voice preferences. Allowlisting cannot supply eligibility. |
| Incoming/outgoing/active/ended UI | `app/connect/voice.tsx`, `product-coordinator.ts`, voice controller and service reuse canonical call state, version, device binding and idempotency. Accept/decline remain authenticated recipient actions. | Integrated device/provider behaviour, positive voice controls and native shutdown evidence. |
| Authentication/native composition | `app/_layout.tsx:801–802` nests `ConnectProductProvider` inside Auth. `load-connect-product.ts` binds the current native Auth owner/epoch, profile and device installation; pinned bearer calls and Connect-only refresh reuse existing services. The shared lease registry prevents Live/Connect ownership overlap and quarantines incomplete cleanup. | Actual installed SDK/bridge execution. No fallback to Live credentials or client-only consent is introduced. |
| Notifications/deep links | Existing `lib/notifications/notification-routing.ts`, pending-route/Auth hydration and `notification-binding.ts` enforce recipient, call ID, immutable creation generation and version, followed by canonical loading. Push never accepts or grants admission. | Signed dispatcher/Edge parity, registration provenance, permission and actual delivery on both phones. |
| Ordinary End / End & Block | Existing terminal transition, native retirement and independent authority submission are reused. Report 38's call-bound context/command/status RPCs reuse `public.blocks`, pair locking and durable end work. Hanging local leave does not gate block submission. Provider ACK and remote enforcement remain separate. | Report 38 hosted schema/function presence, worker auth/scheduling and device behaviour. |
| Two-account restriction | Report 43 adds `private.connect_config.staging_test_users`, default empty; existing `private.connect_authorized` requires exactly two distinct Auth IDs and both participants in the set in **staging**, in addition to every prior eligibility predicate. | Actual selected identities and authoritative deployed restriction/configuration. The local-fixture environment intentionally has different semantics and must never be used as staging configuration. |

**Confirmed local defect:** `app/(tabs)/intent.tsx:3228` and `:3229` both mount `<ConnectCallingPreferences />`. Both lines are part of the preserved Report 43 baseline. This duplicates controls/reads and permits conflicting local displays. The component tests did not cover the full Intent screen composition. A new ordinary readiness assertion fails on two mounts versus one. The smallest correction is deletion of one mount plus a composition regression, in a subsequent authorised source change. Nothing was corrected silently during this read-only milestone.

## 2. Defaults, identity and configuration prerequisites

Current source switches remain:

```text
connectProductPolicy: ui=false, nativeRuntime=false, videoTransport=false
connectFeatureFlags: nativeSafetyOwner=false, endCallAndBlock=false
```

`connectRuntimeAvailability` additionally requires development execution, iOS/Android, staging variant, `EXPO_PUBLIC_ENVIRONMENT=staging`, native ID `com.aduboffour.betweener.staging` and the exact HTTPS root of staging Supabase project `xsgzxadwuxuziubglvps`. Wrong project, production, web, wrong bundle/environment or malformed URL fails closed. Video is always false.

The retained **development** EAS profile uses `APP_VARIANT=staging` but **`EXPO_PUBLIC_ENVIRONMENT=development`**. A later approved root-product Metro session must deliberately supply the staging JS environment and staging public configuration. Do not relax the guard to accept `development`. This JS environment difference alone does not require a new binary. Opening the full product may run its normal Auth/push/bootstrap network operations; it requires the later execution approval, even before a call.

The integrated pilot will use approved hosted services. USB Metro or a normal LAN does **not** externally isolate the full product. Device-to-laptop transport must be selected and verified later: Android USB requires a live ADB reverse mapping to the chosen root Metro port; iPhone cannot use the PC's `localhost` directly. An approved reachable LAN development transport is an alternative, with normal external access explicitly acknowledged. Do not reuse the deferred standalone harness, its port/session or its isolation assertions. No Metro or device session was started here.

## 3. Migration and RPC parity

**Current staging presence/absence is INCOMPLETE for every candidate below.** There is no current Connect deployment ledger/catalog attestation in the available evidence. Reports 38/43 demonstrate local authoring and disposable-database execution, not hosted deployment. Oct 28 provider fixtures and `local-m2-revalidation.json` do not attest Supabase migration deployment. Evidence of an unrelated staging rollout cannot establish Connect parity.

Six core migration candidates, dependency ordered:

| Exact file under `supabase/migrations/` | Required contract |
|---|---|
| `20261028064220_relationship_acceptance_authority.sql` | Verified mutual-relationship authority, prerequisite for Connect. |
| `20261028074908_connect_v1_foundation.sql` | Private config/grants/sessions/occupancy/jobs; eligibility/preferences/grant/create/act/history/admission/worker/sweep contracts and block/delete guards. |
| `20261028143424_connect_m2a_revocation_cleanup.sql` | Durable revocation/end claims and cleanup-prioritised job claiming. |
| `20261029081013_connect_forensic_repair_1.sql` | Repaired admission/reconciliation fences and occupancy behaviour. |
| **`20261031035826_connect_end_block_local_foundation.sql`** | Report 38 call-bound End & Block, context/status, atomic block/terminal/outbox transaction and default-off gate. **Hosted presence is unknown, not proven absent.** |
| `20261031191352_connect_m3_1_intent_and_notifications.sql` | Canonical Intent consent, two-account restriction, signed notification production/validation, installation capability and default-off delivery. |

Eight shared push prerequisites must also be checked, **not automatically reapplied**:

```text
20260913200000_live_notification_campaigns.sql
20260914123000_push_notification_event_security.sql
20260914124000_push_notification_delivery_reservations.sql
20260914125000_push_notification_dispatch_reliability.sql
20260914126000_push_notification_atomic_rate_limits.sql
20260914127000_push_notification_expiry_lifecycle.sql
20261006150000_push_environment_provenance_hardening.sql
20261006170000_update_staging_push_eas_project_identity.sql
```

All 14 local paths, SHA-256 hashes and extracted Connect function declarations are retained in `tmp/connect-m3-2-readiness-44/source-review.json`. No local migration is missing. The exact hosted apply list cannot be chosen until history **and definitions** are compared. Use the repository's staging wrapper for any later reviewed CLI workflow; never broad-push unrelated pending migrations or repair history merely to make the list green. Shared push migrations can affect other features; any genuinely missing prerequisite needs its own impact review.

Important signature checks include:

```text
rpc_is_relationship_mutually_verified(uuid)
rpc_connect_check_eligibility(uuid,text,text,uuid)
rpc_connect_get_preferences() / rpc_connect_set_preferences(boolean,boolean)
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

Names alone are insufficient: compare argument names/order/defaults, function body digest, grants/security-definer/search-path settings, tables, constraints, RLS and triggers, including inaccessible legacy push delegates. **Do not invoke these RPCs as read-only probes.** Several apparent reads expire calls, count rates or enqueue work.

## 4. Edge, secrets and scheduling

| Existing Edge function | Pilot role and authentication | Parity action needed later |
|---|---|---|
| `connect-credentials` | User bearer authenticated with `auth.getUser`; two admission fences; policy/member checks and short-lived user tokens. | Verify deployed source bundle/dependencies and JWT/key compatibility. Required for voice. |
| `connect-provider-worker` | Dedicated `x-connect-worker-secret`; sweep, claim one job, lease-fenced ACK/retry/reconciliation. | Required for create/end. Verify gateway custom-auth setting, secret reference, scheduler and throughput. **Never invoke for health checking.** |
| `push-notifications` | Existing signed event/replay/reservation/provenance checks plus Connect wire contract and default-off switch. | Required for the ordinary notification part of the pilot. Verify current deployment and existing dispatch dependencies without changing Live push behaviour. |
| `connect-webhook` | Raw-body Stream `x-signature` checked before RPC/reconciliation. | Verify deployed source, gateway and existing routing. No new global Stream webhook configuration is authorised. |
| `connect-revoke-consent` | User-authenticated optional fast end path after durable revocation. | Check existing parity. Current Intent UI uses the grant-revoke RPC and durable worker; this Edge fast path is not an extra requirement for the first matched call. |

**Concrete configuration gap in the repository:** `supabase/config.toml` has `verify_jwt=false` for `push-notifications` but no Connect function overrides. The worker and webhook supply their own authentication, not a platform bearer JWT. Under the documented default gateway JWT check, legitimate custom-auth requests would be rejected before their handlers. Later inspect the deployed `verify_jwt` values. If absent there too, the minimal reviewed deployment configuration is `verify_jwt=false` specifically for `connect-provider-worker` and `connect-webhook`, retaining their existing secret/HMAC checks. Keep user-authenticated endpoints protected; this is not a blanket unauthenticated-function proposal. No config file was changed here. [Supabase function configuration](https://supabase.com/docs/guides/functions/function-configuration), [authentication](https://supabase.com/docs/guides/functions/auth).

Names only; inspect presence/reference binding without printing values:

```text
CONNECT_ENVIRONMENT, CONNECT_STREAM_API_KEY, CONNECT_STREAM_API_SECRET,
CONNECT_STREAM_APP_ID, CONNECT_WORKER_SECRET, SUPABASE_URL,
SUPABASE_PUBLISHABLE_KEYS, BETWEENER_SUPABASE_PUBLISHABLE_KEY,
BETWEENER_SUPABASE_PUBLISHABLE_KEY_NAME,
SUPABASE_SECRET_KEYS, BETWEENER_SUPABASE_SECRET_KEY,
BETWEENER_SUPABASE_SECRET_KEY_NAME,
CONNECT_NOTIFICATIONS_ENABLED, PUSH_DELIVERY_MODE,
PUSH_APP_ENVIRONMENT, PUSH_APPLICATION_ID, PUSH_EXPO_PROJECT_ID,
PUSH_HMAC_CURRENT_KEY_ID, PUSH_HMAC_CURRENT_SECRET
```

The public/admin key helpers support configured resolution alternatives; do not require every alternative simultaneously or rotate working keys. Previous HMAC key ID/secret/valid-until names are needed only if the existing rotation window uses them. Inspect `private.push_config`, `private.push_application_config` and `active_signing_secret_name` Vault reference; do not read decrypted secrets. `CONNECT_WORKER_SECRET` and the public-key helper alternatives supplement Report 43's configuration inventory without editing its manifest.

No Connect migration installs an Edge worker schedule. The existing worker processes **one** job per authenticated invocation after a sweep. A later readiness review must establish who invokes it, cadence/capacity, retry monitoring and whether work can be drained within app invitation/setup deadlines. Ringing's 45-second deadline and setup's 60-second deadline are application deadlines, not media enforcement guarantees. Also verify existing signed push dispatch/reservation/expiry maintenance rather than introducing another dispatcher.

The worker/sweep can affect all Connect records, including end work while admission is off. Before any later invocation, establish no unowned active sessions/pending jobs/occupancy. If they exist, stop for ownership review; the two-account allowlist does not authorise draining unrelated work.

## 5. Exact later read-only parity scope

Required separate permission: **staging project `xsgzxadwuxuziubglvps` only**, approved database/catalog SELECT access in a read-only transaction; restricted Auth/profile reads for the two approved users; Management/dashboard read access for Edge deployment metadata/configuration/secret names; and separate read-only Stream application/type access. Production must not be connected. Verify the connection/project identity outside SQL; `current_database()` alone does not identify the project.

The following is a query specification, not an execution script or approval. Run catalog discovery first; do not issue column/table queries when discovery says they are absent. Use private bound parameters `$1/$2` for the approved Auth IDs; never paste them into this report.

```sql
BEGIN READ ONLY;
SELECT version FROM supabase_migrations.schema_migrations
WHERE version IN ('20261028064220','20261028074908','20261028143424',
 '20261029081013','20261031035826','20261031191352',
 '20260913200000','20260914123000','20260914124000',
 '20260914125000','20260914126000','20260914127000',
 '20261006150000','20261006170000') ORDER BY version;

SELECT table_schema,table_name,column_name,data_type
FROM information_schema.columns
WHERE (table_schema='private' AND table_name LIKE 'connect_%')
 OR (table_schema='private' AND table_name IN ('push_config','push_application_config'))
 OR (table_schema='public' AND table_name='push_tokens')
ORDER BY table_schema,table_name,ordinal_position;

SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS signature,
 p.proargnames,p.prosecdef,p.proconfig,
 md5(pg_get_functiondef(p.oid)) AS definition_digest,
 EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('private','public') AND
 (p.proname LIKE 'connect_%' OR p.proname LIKE 'rpc_connect_%'
  OR p.proname='rpc_is_relationship_mutually_verified'
  OR p.proname LIKE '%push%') ORDER BY n.nspname,p.proname,signature;

-- Only after column discovery confirms the expected schema:
SELECT environment,enabled,voice_enabled,video_enabled,pre_match_enabled,
 provider_ready,end_block_enabled,notifications_enabled,
 cardinality(staging_test_users) AS account_count,
 (cardinality(staging_test_users)=2 AND $1::uuid<>$2::uuid
  AND $1::uuid=ANY(staging_test_users)
  AND $2::uuid=ANY(staging_test_users)) AS approved_pair_matches
FROM private.connect_config WHERE singleton;
SELECT count(*) AS active_session_count FROM private.connect_sessions
WHERE ended_at IS NULL;
SELECT operation,status,count(*) FROM private.connect_provider_jobs
WHERE status<>'done' GROUP BY operation,status;
SELECT count(*) AS occupancy_count FROM private.connect_occupancy;
SELECT to_regclass('cron.job') AS cron_catalog;
ROLLBACK;
```

Definition digests must be compared with a reviewed expected canonical definition, not with the SHA-256 of an entire migration file. Add catalog SELECTs for `pg_constraint`, `pg_trigger`, `pg_policies` and table ACL/RLS flags for the discovered Connect/push relations. No application functions are invoked.

For account readiness, later SELECT only the two bound `auth.users.id` records and their `public.profiles.user_id` mappings, checking distinct users, exactly one active/nondeleted profile each, nonanonymous/nonbanned status and staging provenance. Verify actual match proof, preferences and block state by scoped base-table/catalog inspection. Record aliases and pass/fail in public evidence; retain the sensitive mapping privately. Do not search all users or use a production identity.

For scheduling, after discovery SELECT `jobid`, `active`, `schedule`, and **boolean** target checks such as `command LIKE '%connect-provider-worker%'` and the approved staging hostname, plus recent success/failure timestamps from scheduler metadata. **Never output `cron.job.command`**: it may embed a secret/header. If cron is absent, inspect the documented external scheduler metadata. Edge Management inspection must list function version/source bundle digest, `verify_jwt` and secret **names**, not invoke handlers. Compare all shared dependencies as well as `index.ts`.

## 6. Stream staging readiness

Target remains **application 1731011, Betweener Staging; `betweener_connect`**. Retained `stream-staging-connect-validation.json` (2026-10-28T13:15:40.738Z) and `local-m2-revalidation.json` (2026-10-28T16:37:44.559Z) record enabled authentication/permission checks, cap two and hardened grants. The latter retains type digest `12e74f5fca79a1dea2b48a8c950bbc3a2189a3ffdf9e04ccb43d28c4e4533a7e`.

`connect_invited` has read-call; `connect_voice` adds join/send-audio; `connect_video` additionally has send-video. Ordinary/global roles are restricted. Capture/recording/transcription/screenshare/ingress/broadcast/thumbnail capabilities are disabled. This is historical configuration evidence, not a current authenticated attestation.

Before a later call, separately approve app/type GETs to confirm exact app/key binding, both checks enabled, exact grants, disabled capabilities and effective voice settings. Check configured push/ring/webhook routing and the two users' existing global roles without changing any role. Verify no broader issuer/push path can join the test. Compare any drift; do not overwrite shared settings to restore an old hash automatically.

The actual product adapter uses **`ring:true, notify:false`**, unlike provider-only B3. `notify:false` is not proof that ring events or provider push cannot occur. Root `index.js` has existing Stream ongoing-call setup whose background client factory is Live-only; no `pushProviderName` is configured there. Installed SDK push setup separates provider registration from native ongoing-call action listeners. **Connect native OS Answer/CallKit/Telecom routing is not ready for this pilot.** Establish that existing Stream push routing will not invoke that path; otherwise stop for a targeted integration review. No Live callback, global push config or provider setting is changed here.

The first pilot needs no new call type, role, kick/block operation, global setting or replacement media architecture. Existing server operations upsert the two Auth IDs plus `betweener-connect-system` without assigning global roles; create a DB-bound voice call with invited members; verify identity/settings; promote to `connect_voice` only at credential admission; generate 120-second ordinary user JWTs under the existing dual fences; join; and end/read back through durable work. Tokens are **not cryptographically call-scoped**; privacy depends on membership/grants and authority. JWT expiry does not establish an already-connected media cutoff.

Report 18's negative security result and B3's **INCONCLUSIVE** verdict remain unchanged. No fresh finite remote revocation bound is established by this review or proposed pilot.

## 7. Existing development-client compatibility

Retained EAS metadata was inspected, not refreshed from authenticated dashboards:

| Device/build | Retained provenance | Current conclusion |
|---|---|---|
| Galaxy A17 5G / [Android build](https://expo.dev/accounts/kaakyire9/projects/betweener-staging/builds/a3d480e9-38f9-4e75-beb6-55038e91bc00) | Finished development/internal, staging ID, app/runtime 1.2.0, build 1, commit `f560559b6a3ef09ecb7fd7dfadf9bd742a88184a`. Owner confirmed installation. | No demonstrated missing voice module; integrated compatibility **UNVERIFIED**. |
| iPhone 15 Pro / [iOS build](https://expo.dev/accounts/kaakyire9/projects/betweener-staging/builds/43e33173-cd96-41b1-8e9e-9df6834930a8) | Same profile/identity/runtime/commit; owner confirmed installation. No IPA inspected in this review. | Installed embedded native APIs/signing validity **UNVERIFIED**. |

Metadata receipt: `tmp/connect-device-preflight-41/expo-build-metadata-reviewed.json`, SHA-256 `9e5ac9e5374e67c142b4b5df7a9b79ce70386d1ad3d17c8dcd90ed5d40910ce2`. The shared staging EAS project is `7f38a835-2da7-419b-a20b-e1a12e021547`. Artifact-link expiry is not iOS provisioning validity. Commit lockfiles are source provenance, not proof the uploaded build had no local modifications.

| Package | Retained build-commit lock | Current installed JS/dependency |
|---|---|---|
| Stream RN SDK | 1.46.0 | 1.46.3 |
| Stream video client | 1.61.0 | 1.62.0 |
| Stream WebRTC | 145.4.1 | 145.4.1 |
| Callingx | 0.11.5 | 0.11.5 |
| React Native | 0.86.3 | 0.86.3 |
| Expo | 57.0.27 | 57.0.30 |
| Expo Notifications | 57.0.22 | 57.0.23 |
| Expo dev client | 57.0.19 | 57.0.20 |
| Expo Application / SecureStore / Audio | 57.0.3 / 57.0.4 / 57.0.5 | Same |
| Expo Crypto | 57.0.3 | 57.0.4 |

Fresh static inspection of the **previously cached installed Android APK**, SHA-256 `2fe6471298eb0fbab899c23bd01d21a4edf0fd053f52e52a842591214f4d3fdc`, finds StreamInCallManager/StreamVideoReactNativePackage, WebRTC, Callingx, ExpoAudio, dev launcher and Expo notification classes. All **17 inspected required method names** are present, including audio endpoint selection/status/mute, native-module creation and media factory/track/stream release. Details: `tmp/connect-m3-2-readiness-44/android-cached-apk-review.json`. Retained manifest inspection includes microphone/notification/Bluetooth permissions and the staging scheme. No phone was contacted. The cached APK has not been hash-linked to the EAS download artifact; class/method names do not prove autolinking, signatures, ABI, JS compatibility or physical safety.

No new native dependency was added by M3/M3.1. Screens, consent UI, navigation, payload validation, source gates and the duplicated-panel correction are JS/TS work that can use a **compatible** development client through root Metro. Native module/API changes, missing native permission/entitlement/plugin configuration or an unusable signing profile would require a separately approved binary remedy. No such remedy is demonstrated as necessary yet. The installed Stream patch changelog includes native iOS changes as well as JS fixes, so version differences cannot all be dismissed as JS-only. Matching manual runtime labels cannot prove native compatibility. [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/), [runtime compatibility](https://docs.expo.dev/eas-update/runtime-versions/).

Later verify installed app ID/version/build and current SDK bridges on both phones before capture; confirm standard notification permission/registration and native audio-route methods. Keep compatibility presence checks separate from physical microphone/route/shutdown testing. Existing app bootstrap is network-capable, so even an integrated module check needs its own approval. No camera/video/CallKit/Telecom entitlement change is required for the proposed foreground voice/ordinary-notification scope. Reliable killed-app calling remains outside it.

## 8. Exactly two staging accounts

Procedure is prepared; **actual scope is INCOMPLETE**. Both existing manifest identity slots remain unbound. No account was queried, enrolled, created or assigned an invented UUID.

1. Owner explicitly selects two isolated non-admin **staging** accounts: A on the Galaxy, B on the iPhone. Record authoritative Auth ID and one active profile mapping privately, plus device/installation ownership. Phone possession or a display name is not account approval.
2. Separately approved read-only checks establish no production-identity reuse, account safety, no prior unsafe membership/global-role assumptions, current match proof and voice preferences. If relationship/account preparation is necessary, enumerate those mutations for approval; do not create an eligibility bypass.
3. Deploy/verify the restriction first with admission off. After explicit mutation approval set **exactly those two Auth IDs**, environment **staging**, never `local`. Empty/malformed/mismatched scope must deny admission. Do not widen to a third user for a negative test; use existing offline negative cases and later approved scoped reads.
4. Opt in only the two verified staging installations through existing registration/capability contracts under later approval. No tokens/credentials/identity details belong in public evidence or notification bodies.
5. Keep `pre_match_enabled=false` and video disabled for the first matched voice pilot. Test-account status grants neither a match nor recipient consent. A later pre-match journey requires fresh directional voice consent; voice cannot authorise video or reverse-direction initiation.

## 9. Fresh offline checks and evidence limits

Artifacts are in `tmp/connect-m3-2-readiness-44/`. No application/database source changed. The checks inspect source or use test doubles; none attests a deployment/device/provider result.

| Check | Fresh result |
|---|---|
| Existing selected Connect product/voice/native-owner/End & Block/relationship/push/navigation/Live Node suites | **312/312 PASS**, 16 files; exact array in `test-selection.json`, exit 0 in `regression-status.json`. |
| Additional credential, consent revocation, foundation, security closure and provider-observation suites | **70/70 PASS**, five files; `security-extra.log` and status. Combined existing Node selection: **382/382**, 21 distinct files, no skips/TODOs. |
| Four existing voice/safety/product/Intent-push UI files | Initial **42 PASS / 1 timeout**; unchanged rerun **43/43 PASS**, four suites. Both logs retained. No assertion/timeout/code was changed. |
| New isolated readiness probes | **15 PASS / 1 FAIL**, 16 tests, zero skips/TODOs. Failure is the real duplicate `ConnectCallingPreferences` mount. It remains unresolved and is not counted as an accepted pass. |
| Root TypeScript | **PASS**, exit 0; `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit`; `typescript-confirmed.log` and status. No build. |
| Targeted ESLint | **PASS**, exit 0, 20 files, zero warnings; Report 43's exact selection, `--no-ignore --max-warnings=0`; `lint.log` and status. |
| Live environment and EAS project isolation | Both PASS, exit 0; six EAS build-time negative cases included. This is local configuration isolation, not physical-network or hosted attestation. |
| Database concurrency/deployment | **Not rerun in M3.2.** Preserved Report 43 evidence: 26 new SQL cases, 22 prior End & Block cases and 88 relationship prerequisites per disposable suite. No shared database accessed. |
| Android native archive | Static classes/17 method names present; execution/registration/ABI/device shutdown unverified. iOS native archive not inspected. |

Commands: Node uses `node --no-warnings=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test --test-reporter=tap --test-concurrency=2` with the exact 16-file JSON selection, then the five files listed in `security-extra-status.json`. UI uses `node --no-deprecation node_modules/jest/bin/jest.js --runInBand --config jest.config.js` with `connect-voice.interaction.test.tsx`, `connect-voice-safety.interaction.test.tsx`, `connect-product.interaction.test.tsx`, `connect-intent-push.interaction.test.tsx` under `__tests__/`. Readiness uses the same Node test flags without concurrency selection on `tmp/connect-m3-2-readiness-44/readiness-probes.cjs`. Isolation commands are `node scripts/verify-live-environment-isolation.cjs` and `node scripts/verify-eas-project-isolation.cjs`. No Media Truth experiment, standalone-harness or analytical-classifier development/testing was started.

The broader historical Live suite was not rerun or relabelled green. Selected ownership/configuration/recovery regressions pass; preservation of all prior Live source is checked separately. Report 43's historical 674/43/20 test totals are not substituted for this milestone's actual selections.

Preservation and exact evidence hashes are recorded in `tmp/connect-m3-2-readiness-44/final-verification.json`: all **2484/2484 pre-existing workspace entries** and **555/555 protected records** remain unchanged. The only new nonignored repository files are this report and its companion proposal. The existing Report 43 manifest is retained unchanged; this report is an additive review, not a replacement execution manifest.

## 10. Decision and remaining blockers

The practical next step is approval of **read-only staging parity and installed-build review**, followed by the tiny local composition/configuration correction and an exact deployment delta proposal. It is not approval to activate calling. The required conditions are concrete:

- Remove one duplicate Intent panel in a separately authorised source edit; preserve completed features.
- Establish exact deployed migrations/RPC bodies, Edge bundles, gateway authentication and scheduler parity. Missing items are currently unknown, not an assumed six-migration deployment.
- Privately bind and approve the two actual staging accounts/installations; verify the server restriction, relationship and voice preferences.
- Verify both installed clients against current JS/native APIs and correct the JS environment for the later Metro session. Prefer existing binaries; rebuild only on a demonstrated native/signing blocker.
- Verify app 1731011/type policy, standard push destinations and absence of a native OS-action/Live routing conflict before any `ring:true` call. Shared policy changes are not included.
- Obtain a fresh, exact two-call execution approval covering service/bootstrap access, provider operations, native microphone permission/use, evidence collection and owned cleanup. Existing B1/B2/B3 approvals remain consumed.

The pilot can demonstrate product behaviour for consenting controlled accounts. It cannot close M2A/M2B or establish a universal active-media revocation bound. Provider ACK, DB terminality, UI closure and local teardown remain separate from independently observed remote cessation. Keep durable cleanup active after stopping new admission; a flag change cannot disconnect an existing SFU session.

```text
CONNECT_M3_2_LOCAL_READINESS = CONDITIONAL
CONNECT_STAGING_PARITY = INCOMPLETE
CONNECT_EXISTING_IOS_BUILD = UNVERIFIED
CONNECT_EXISTING_ANDROID_BUILD = UNVERIFIED
CONNECT_TWO_ACCOUNT_TEST_SCOPE = INCOMPLETE
CONNECT_STAGING_EXECUTION = NOT_AUTHORISED
CONNECT_DEVICE_VALIDATION = DEFERRED
CONNECT_REMOTE_REVOCATION_BOUND = UNVERIFIED
CONNECT_M2A_SECURITY_GATE = BLOCKED
CONNECT_M2B_READY = BLOCKED
STAGING_MODIFICATIONS = NONE
PRODUCTION_MODIFICATIONS = NONE
```
