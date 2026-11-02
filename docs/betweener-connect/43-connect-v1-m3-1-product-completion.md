# Connect M3.1: Intent consent, incoming push and staging preparation

Date: 2026-10-31. Repository: `C:\Projects\betweener-app`.

**The remaining consent and standard push integration is implemented locally. The voice journey is ready for staging review. Calling remains disabled.** Device compatibility, real push delivery, hardware shutdown and provider media enforcement have not been verified. This report authorizes no deployment or execution.

The [updated readiness manifest](connect-v1-m3-staging-readiness.json) describes the next approval boundary. [Report 42](42-connect-v1-native-product-integration.md), its verification receipts and its [original manifest snapshot](connect-v1-m3-staging-readiness-report-42.json) remain historical evidence. No Media Truth experiment, analytical-classifier development or standalone device application was undertaken.

## Implementation and reuse

The dependency path is: existing Auth epoch → existing authenticated Connect repository → existing grant/call RPCs → existing native owner/controller. Notifications use the existing private push outbox → signed event-ID webhook → existing Edge delivery/reservation path → account-bound deferred navigation → canonical call reload. No new media client, token issuer, consent table, block table or worker was added.

| File | Local change |
|---|---|
| `app/(tabs)/intent.tsx` | Mount calling preferences and per-request consent cards; preserve the existing text request actions. |
| `features/connect/components/IntentCallingConsent.tsx` | Separate voice/video offers, explicit recipient decisions, active grant display, withdrawal and approved directional voice entry. |
| `features/connect/components/ConnectCallingPreferences.tsx` | Explicit incoming voice preference with server readback; preserve the separate video preference. |
| `features/connect/domain/intent-consent.ts` | Validate current Intent, participant and grant bindings; derive permission presentation without granting authority. |
| `features/connect/data/connect-repository.ts` | Add canonical Intent-consent discovery and installation-capability RPC methods. Reuse existing grant mutations. |
| `features/connect/data/authenticated-connect-services.ts` | Expose consent/preferences through the existing pinned-bearer, pre/post-await Auth epoch guard. |
| `features/connect/data/load-connect-product.ts` | Bind the account ID to the existing composition; register push capability and remove its listener on disposal. |
| `lib/notifications/push-registration-events.ts` | Small registration-completion signal; no additional registration client or storage. |
| `lib/notifications/push.ts` | Notify the gated composition after existing successful token registration. |
| `supabase/functions/_shared/connect-push-contract.ts` | Closed, credential-free v1 envelope and staging-only delivery options. Shared pure code has no Deno/native/network side effects. |
| `features/connect/domain/call-navigation.ts` | Reuse the shared seven-type inventory. The legacy local call-ID hint is not runtime push ingress. |
| `features/connect/domain/notification-binding.ts` | Account, immutable call generation and version navigation checks. |
| `lib/notifications/notification-routing.ts` | Require the bound Connect envelope; preserve ordinary routes and reject unknown Connect fallbacks. |
| `app/_layout.tsx` | Reuse deferred navigation for Connect taps; verify the current account after Auth hydration and before navigation. |
| `app/connect/voice.tsx` | Canonically validate notification generation/version, handle offline/late targets and prevent a delayed lookup from owning another call's cleanup. |
| `supabase/functions/push-notifications/index.ts` | Default-off Connect delivery switch, staging identity check, closed payload validation and bounded push TTL. Existing HMAC, provenance, reservations and Live paths remain. |
| `supabase/migrations/20261031191352_connect_m3_1_intent_and_notifications.sql` | Local migration: read/capability RPCs, default-deny staging account restriction, canonical call-event producer and guarded existing claim/reservation functions. |
| `scripts/test-connect-product-consent-local.cjs` | Actual disposable SQL/loopback REST consent, push and concurrency tests; dispatch is stubbed inside the clone. |
| `__tests__/connect-product-completion.regression.test.cjs` | Pure/injected product, security, notification and predicate-preservation regressions. |
| `__tests__/connect-intent-push.interaction.test.tsx` | Consent, preference, notification, account-change and delayed-navigation interactions. |
| `__tests__/connect-notification-contract.regression.test.cjs` | Evolve the previous router tests to require the bound envelope and reject extra private fields. |

No package, lockfile, native dependency, app configuration, Live, Circle, Studio, lease registry, provider adapter, credential issuer or security classifier was changed. The source freeze and preservation receipt are under `tmp/connect-product-m3-1/`.

## Complete Intent calling flow

1. Each recipient explicitly enables eligible voice invitations in **Your calling preferences**. This is necessary but does not establish a match or approve any pre-match caller.
2. After sending an ordinary Intent Request, the sender opens its Sent card and offers voice availability, video availability, or both. Each selection starts off. The server records requested media, with approved voice/video still false.
3. The recipient sees the offer on the Incoming card. They select media and press **Approve selected media**, or **Decline calling permission**. Accepting the existing text request performs neither action and never grants calling permission.
4. An approved sender refreshes the card and can open the voice lobby. Only the original requester can initiate this directional pre-match call. Lobby eligibility, call creation, acceptance and both credential fences still use server authority.
5. Either participant can withdraw the grant. The existing revoke RPC terminalizes associated calls and enqueues durable end work transactionally. The UI rereads the result; an unconfirmed response removes cached permission presentation and reports that the change could not be confirmed. Consent mutations are not placed in the generic offline text-Intent queue.

Expired/cancelled/passed/matched Intent states, expired/revoked grants, unavailable pairs and invalid bindings do not expose a pre-match start action. A matched relationship continues to use its independent matched authority. Local expiry rendering is advisory; every mutation and admission rechecks the server.

Voice approval never sets video approval. The video offer/decision boundary is implemented and tested separately, but the existing server video gate still controls whether such an offer can be submitted. **Video is unavailable under the checked-in voice-only scope; video transport, camera publication and voice-to-video escalation remain off.** No authority rule was relaxed to make video offers succeed while disabled.

The existing grant contract is immutable per Intent: declining/withdrawing a grant or approving only voice does not permit silently expanding it later. A new media offer needs a fresh eligible Intent and explicit recipient decision. Declining calling permission does not itself decline the separate text request.

The existing teal, purple and warm-neutral voice screens, audio controls, reconnect/unavailable messages, ordinary End and call-bound End Call & Block are reused. The new Intent cards support light/dark appearance. UI tests validate interactions, not device rendering or physical media behavior.

## Migration and authority contract

The new migration was authored with the installed CLI's local `migration new` operation. It was applied only to disposable test databases.

`rpc_connect_get_intent_consent(uuid)` resolves the acting account through `private.connect_actor`, admits only the Intent's actual two profiles and reads its existing grant. Its availability/offer/start fields are derived on the server. Existing `request_grant`, `decide_grant`, `revoke_grant`, preferences and call RPCs retain their responsibilities.

`private.connect_config.notifications_enabled` defaults false and cannot be true in production. `staging_test_users` defaults to an empty array; staging admission requires exactly two distinct configured Auth user IDs and both participants must belong to that set. There are **no configured test identities in this change**. This extra restriction is part of `private.connect_authorized`, so it also applies to service-side provisioning and credential checks; it does not depend on a client-supplied actor claim. All prior match proof, account safety, preference, directional grant, media, expiry and relationship-revocation predicates are retained. A regression compares those predicates against the original foundation definition. Local disposable fixtures keep their existing environment behavior.

`rpc_connect_register_notification_capability(uuid,boolean)` updates only the authenticated account's verified staging installation. `push_tokens.connect_push_contract` defaults zero. Registration/ownership changes reset it; the gated current composition opts its installation back in. Matching app version `1.2.0` alone is insufficient. This capability allows notification delivery, never call admission.

The existing default-off client product/runtime/native-owner/End Call & Block/video switches remain unchanged. The server restriction adds a staging test boundary; it is not a second consent or account-block authority.

## Incoming notification production and navigation

The producer is a trigger on actual Connect state transitions. `RINGING` produces a recipient invitation only after the existing worker has established that state. Cancellation, decline, missed/expired invitation and canonical revoked/blocked endings produce generic status hints for the appropriate participant(s). Ordinary end retains its existing call/status flow rather than adding an unnecessary alert.

The wire data contains exactly `type`, `call_id`, `call_generation`, `call_version` and `recipient_user_id`. The generation is the immutable DB call creation timestamp, not a claimed SFU enforcement time. No Stream token/key, peer name/avatar, message content, claimed consent or acceptance instruction is included. Display text is generic.

Unsent invitations are superseded on later state transitions. Both the existing claim and reservation boundaries independently recheck canonical call state, generation/version, recipient and staging scope. Invitation checks also require current eligibility and an unexpired deadline. Reservation retains existing recipient/token ownership and at-most-once behavior, and adds the opted-in staging installation filter. The original claim/reservation implementations remain private delegates with direct service/client execution revoked; the guarded public signatures remain unchanged.

The Edge function additionally requires `CONNECT_NOTIFICATIONS_ENABLED=true` and the existing staging push identity. Missing configuration fails closed for Connect delivery. Incoming TTL is 45 seconds, matching the existing invitation window; status TTL is 600 seconds. These are notification transport budgets, **not media revocation bounds**. The webhook still authenticates the raw event-ID body using the existing HMAC/replay checks.

Foreground calls use existing canonical discovery and the in-app notice. Background/cold-start notification taps reuse the existing response listener, pending-route storage and Auth hydrator. The current account is checked after hydration. The call route then loads authoritative state and validates generation/version before exposing the call. A stale terminal invitation shows its current outcome; a push never accepts or activates a microphone. Unknown/malformed/private-field payloads fail closed. Direct history/deep links also use canonical reads and cannot grant admission.

Duplicate taps may revisit a canonical screen, but cannot duplicate acceptance, create a replacement call or take ownership of a different active call. Offline reads deny admission and direct the user to retry through current call history after recovery. Account switching discards mismatched deferred destinations and retires the existing Auth-bound media owner.

**Delivery races remain:** an already reserved or externally queued notification can arrive after cancellation, acceptance, blocking, account switch or expiry. No SQL/Expo transaction can recall such a packet. Its generic content and authoritative tap validation limit its meaning; it is not evidence that the invitation is still actionable. Already-issued media credentials and established transports remain subject to the existing unresolved revocation problem.

Regular Expo notification/tap preparation is implemented. Actual APNs/FCM/Expo delivery, background scheduling and cold-start behavior are **NOT VERIFIED**. Native VoIP push, CallKit, Android Telecom, inline OS Accept actions and reliable killed-app ringing are not implemented or enabled. No entitlement, category service, push credential or native configuration was changed. Those capabilities require separately reviewed platform/configuration work, potentially a new binary. [Expo notification listener semantics](https://docs.expo.dev/push-notifications/receiving-notifications/).

## Fresh validation

Logs and exact selections are in `tmp/connect-product-m3-1/`; none of these counts are borrowed from Report 42.

| Check | Result and limit |
|---|---|
| Connect/security/relationship/native-owner/notifications and selected Live Node regressions | **674/674 PASS**, 38 unique files, zero skips/TODOs; `offline-accepted-2.log`. Includes the existing Media Truth offline contract suites; no provider/media experiment ran. |
| Voice, safety, product and Intent/push UI | **43/43 PASS**, four Jest files; `ui-final.log`. Services/native state are doubles. |
| Auth recovery, transport, callback and durable storage | **20/20 PASS**, four Jest files, normal process exit; `auth-1.log` retains Jest's delayed-exit warning. No force-exit was used. |
| New disposable SQL/loopback REST | **26/26 PASS**, `database-scoped-null-safe.log`; actual consent decisions, withdrawal/acceptance concurrency, staging restriction, outbox claim/reservation, expiry, capability reset and atomic active End/Block with notifications enabled. Null/type-confused identity/version fields are rejected explicitly. External push dispatch is stubbed. |
| Existing disposable End Call & Block | **22/22 PASS**, `end-block-database.log`; real SQL/loopback REST, provider doubles. |
| Relationship-security prerequisites | **88/88 PASS in each disposable suite**. This is the same prerequisite suite run twice, not 176 distinct tests. Both databases/REST containers were removed. The shared app database was not modified. |
| Root TypeScript | PASS, `tsc -p tsconfig.json --noEmit`; `typescript-final.log`. No build. |
| Targeted ESLint | PASS, 20 files, zero warnings, `--no-ignore --max-warnings=0`; `lint-accepted.log` includes otherwise ignored Edge sources. |
| Cached Deno 2.5.4 | PASS for the new pure wire contract with `check --no-remote --no-lock --deny-import`; `deno-contract.log`. The inherited Edge entrypoint retains its existing `@ts-nocheck`; this is not a claim of full strict Edge checking. |
| Live/EAS isolation | Both PASS, `live-isolation.log` and `eas-isolation.log`. Selected Live ownership tests pass; the full historical Live suite was not rerun or relabelled green. |

Node command: `node --no-warnings=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test --test-reporter=tap --test-concurrency=2` with `test-selection.json` and a child-process-only staging test environment. UI/Auth commands use `node --no-deprecation node_modules/jest/bin/jest.js --runInBand --config jest.config.js` with their exact files. SQL commands are `node --no-warnings=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/test-connect-product-consent-local.cjs` and `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/test-connect-end-block-local.cjs`.

Initial failures are retained: the empty-data DB clone lacked the retained push schema, initial SQL test output parsing selected the acting UUID/COMMIT rather than the result, and direct authenticated fixture insertion correctly failed table permissions. The suite now installs the actual retained prerequisites in the clone, uses administrative synthetic fixture insertion and tests the unchanged authenticated RPC boundaries. TypeScript also caught a test mock's missing grant argument; its signature was corrected. The final default-concurrency Node attempt passed 673/674 with one `child_startup_timeout` in the unchanged runner regression; the accepted full selection uses file concurrency two with unchanged test timeouts. No permission, assertion or historical verdict was weakened to make these pass. CLI telemetry was disabled for local migration authoring after its default home-directory write was denied.

The final verification receipt checks 21 source/test/migration hashes and 19 dependencies. Preservation is **2460/2472 existing entries unchanged**, with 12 intentional changes and 12 new repository files. All **550/550 protected records** are unchanged. Report 42 and earlier reports, original execution receipts, consumed B1/B2/B3 approvals/ledgers, offline analytical classifiers and unrelated dirty work remain unchanged. Report 18's negative result and B3's **INCONCLUSIVE** verdict remain recorded.

## One bounded path to integrated staging testing

The manifest is ready for **approval of parity and compatibility review**, not execution-ready call authorization. Hosted parity, actual test-account IDs and binary compatibility are not attested by this offline work.

1. Separately approve read-only staging parity and installed-binary review. Check the exact migration/function signatures, existing HMAC/provenance configuration, worker/webhook scheduling and the actually installed iOS/Android native modules. The retained builds are development/internal app/runtime `1.2.0`, build `1`, commit `f560559`; their retained Stream RN native metadata is `1.46.0` versus current JS `1.46.3`. Neither matching versions nor the earlier Android module-presence check establishes integrated compatibility. No new native dependency was added here.
2. Bind the two manifest identity slots to owner-approved, isolated staging Auth users and profiles: Galaxy requester A and iPhone recipient B. No account was queried, created or assigned a UUID here. Confirm account safety, separate notification preferences/tokens and native application identity. Configure only those two Auth IDs in the new staging restriction after a separately approved deployment. Empty/mismatched scope must remain denied.
3. Review an exact staged migration/Edge deployment proposal. It must include the new M3.1 migration and any genuinely missing retained Connect/push prerequisites, then the existing `push-notifications` function with its shared contract. Do not broad-push unrelated pending migrations. Keep admission, provider readiness, notification and client switches off during deployment/parity checks. No provider role change is required by this implementation.
4. After compatibility is established, separately approve serving the reviewed JS to the existing staging clients. A needed native rebuild/install, signing/entitlement change or OTA publication requires its own approval. No ordinary LAN or offline-isolation claim is made for this integrated, later network-backed test.
5. Only with a fresh, concrete execution approval bound to both identities, source/manifest hashes, time/scope limits and cleanup ownership may staging voice admission and push be enabled for the pair. Test matched voice first, then the separately approved directional Intent journey using valid fresh server authority. Video stays disabled. Test ordinary End, End/Block, pending provider cleanup, notification races, logout/background and Live ownership on both devices. Collect positive media controls and independent shutdown evidence. Do not reuse B1/B2/B3 approvals or terminal IDs.

Rollback stops new admission/notifications and client entry, submits/preserves terminal cleanup for owned calls and verifies local teardown separately. Keep durable provider workers and reconciliation available for outstanding end work. A disabled UI, metadata end or provider ACK does not prove all remote media has stopped. Do not delete cleanup obligations, weaken the staging restriction, reset ledgers or roll back unrelated migrations to recover a test.

Stop on wrong identity/call binding, an out-of-scope admission or notification, pre-accept capture, stale restart, ownership crossover, false saved/block/shutdown status, unconfirmed native cleanup, incompatible native modules or unapproved configuration. Keep calling disabled if a prerequisite cannot be established. No device, push or remote-enforcement PASS can be inferred from this milestone.

Recommended next product milestone: the separately approved staging parity/binary review, followed by an explicitly scoped two-device **voice** validation when its prerequisites are met. Production release remains blocked by the existing security gates and unverified remote revocation bound.

```text
CONNECT_INTENT_CALL_CONSENT_UI = IMPLEMENTED_LOCAL
CONNECT_INCOMING_PUSH_INTEGRATION = IMPLEMENTED_LOCAL
CONNECT_VOICE_PRODUCT_JOURNEY = READY_FOR_STAGING_REVIEW
CONNECT_STAGING_READINESS = READY_FOR_APPROVAL
CONNECT_DEVICE_VALIDATION = DEFERRED
CONNECT_REMOTE_REVOCATION_BOUND = UNVERIFIED
CONNECT_M2A_SECURITY_GATE = BLOCKED
CONNECT_M2B_READY = BLOCKED
STAGING_MODIFICATIONS = NONE
PRODUCTION_MODIFICATIONS = NONE
```
