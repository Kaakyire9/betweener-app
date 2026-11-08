# Native incoming and E2EE: staging activation and device validation

## Current activation: executed 2026-11-03

The owner explicitly approved the staging-only configuration and four
owner-operated device tests. The two server provider aliases are installed and
verified. `e2ee_enabled=true`, `native_incoming_enabled=true` and the local native
incoming opt-in are set. The Connect call type enables only generic `call_ring`
notifications; the other four notification events are disabled. Roles, media
settings and encryption mode `available` are unchanged.

All existing configuration, account scope and the 63 remaining budget slots were
preserved. Ordinary Connect notifications remain disabled. There are no active
calls, pending provider jobs, registered secure keys or native destinations at
the final pre-test readback. The five-second worker returned three fresh HTTP
200 no-ops after activation. This is not provider-termination evidence.

During the alias update, Supabase advanced every Edge function revision counter
by one. All **50** bundle hashes, JWT settings and all other listed metadata are
identical: shared push now reports **29**, webhook **3**, worker/credentials **4**
and native-device **2**. No code deployment or production access occurred. This
metadata difference was isolated and verified before the test handoff.

The resolved local Expo config targets staging, with native incoming configured.
The **46** encryption/native-incoming/frozen-package tests passed. The frozen
proposal and source artifacts are unchanged. See the
[activation receipt](../../tmp/connect-secure-calling/activation/execution-result.json).

Next: owner restarts root Metro and reopens both existing phones, then verify
secure-key and native-destination registration before the first call. The four
approved sequential tests are foreground encrypted voice, locked Android
incoming voice, locked iPhone incoming voice, and foreground encrypted video.
End each call and verify cleanup before continuing. Target 60 seconds, operator
stop at 90 seconds; these are supervision limits, not a remote-media cutoff
guarantee. Device delivery and encrypted-media results remain pending.

## Installation evidence retained

The earlier owner-authorized installation deployed worker revision 3, credentials revision
3 and native-device revision 1. All 32 files and 14 SQL definitions match the
frozen sources; both new gates remain OFF. See the [execution receipt](connect-secure-calling.execution.json).

The migration is now registered under its original identifier `20261103150558`.
After explicit owner authorization, exactly one history row was corrected from
connector-generated `20261103172110`. Readback confirms unchanged SQL, schema,
other migration history and configuration. No migration replay occurred. The
earlier automatic-review rejection and the successful correction remain in the receipt.

Five genuine scheduled HTTP 200 no-ops and all three unauthenticated HTTP 401
checks passed. Shared push 28, webhook 2, existing configuration/budget and 47
other Edge functions are unchanged. No calls, participant tokens, push delivery,
secret/provider configuration changes, builds or OTA occurred. Native/provider
configuration, activation and physical verification remain pending.

Target: **betweener-staging / xsgzxadwuxuziubglvps / eu-north-1**;
Stream **1731011**, existing **betweener_connect**. Production is excluded.

The [source proposal](connect-secure-calling.proposal.json), revision 4, SHA-256
`37d133fb060af0eaed44f4526d5d60fe4c08f3065fd3d2ede6d2f63d573f6c72`,
pins the migration, three Edge closures, mobile source and SDK patch. The initial
unapproved drafts are retained by hash. Amendments close automatic SDK token
enrollment/logging, remove a deprecated no-op background shim and strengthen the
call-generation fence at the encryption boundary. Delayed native events preserve
foreground-answered calls; outgoing system End uses the existing hangup authority.

## Reviewed installation scope (executed and verified)

1. Reverify exact staging identity/history, worker/credentials revision 2 and
   pinned rollback files. Stop on drift or ambiguous writes; read back first.
2. Apply only `20261103150558_connect_secure_calling.sql`. Verify private RLS/ACL,
   RPC grants and both new gates **false**. Preserve existing approved calling
   gates, budget, consent and account scope.
3. Deploy only `connect-provider-worker` (existing custom HMAC,
   `verify_jwt=false`), `connect-credentials` and new `connect-native-device`
   (both gateway JWT plus application Auth). Exact arguments/closures are pinned.
4. Compare deployed files and privileges. Confirm new gates remain false,
   scheduler unchanged, webhook revision 2, shared push revision 28 and Live
   unchanged. No device enrollment, participant tokens or pushes are included.

## Readiness evidence used for activation

Current readiness update, **2026-11-03** (no hosted activation):

- Owner-operated iOS and Android 1.2.0 (1) runtime checks both returned
  `EncryptionManager.isSupported()=true`. Android notifications and Telecom were
  available. This does not establish encrypted media or locked-screen delivery.
- Owner configured enabled providers `connect-staging-voip` and
  `connect-staging-fcm` in application 1731011. APNs saved identity fields are
  owner-confirmed; local Firebase service-account metadata matches project
  `betweener-staging` and the staging Android configuration. No private key
  contents are included in evidence.
- Downloaded existing iOS artifact `43e33173-cd96-41b1-8e9e-9df6834930a8`,
  SHA-256 `51d5452a9b1bc01402d5b92b7b46b43abc48af83741ebb0c55c364ef6d95d051`,
  has the correct staging identity, `audio`, `voip`, `remote-notification`, and
  production APNs in both executable entitlements and its unexpired profile.
  All 13,067 signed code-page hashes and relevant special-slot hashes matched.
  Apple certificate trust/revocation and the installed-device artifact hash were
  not independently verified. No rebuild requirement was demonstrated.
- Local `.env.local` provider aliases are prepared with
  `EXPO_PUBLIC_CONNECT_NATIVE_INCOMING=false`; previous content was preserved.
  The 23 native-incoming/package regressions passed; frozen sources are unchanged.
- Fresh read-only Stream call-type metadata confirms encryption `available` but
  `notification_settings.enabled=false`. All five event toggles are currently
  true underneath that disabled master. Before locked-screen testing, separately
  approve a **Connect-type-only** notification patch: master enabled, `call_ring`
  enabled with generic content, and `call_notification`, `call_missed`,
  `session_started`, `call_live_started` disabled. Preserve grants, media settings,
  all other call types, Live and shared push. Notification settings cannot be
  overridden per call. This provider write has **not** been executed.
- Remaining activation scope: bind the two server alias names below; enable
  `e2ee_enabled` first for foreground testing, then `native_incoming_enabled` and
  the local client opt-in after ring-only policy readback. Preserve current
  budgets, account scope, relationship/consent rules and ordinary notification
  gates. Device registration and owner-operated real call/push testing require
  explicit approval; no synthetic users or agent-created calls are proposed.

- Attest staging APNS **VoIP** and FCM aliases, exact app bundle/Firebase project,
  signing environment and native push template. Reuse compatible providers;
  do not overwrite a Live device/provider configuration. Any missing provider or
  credential configuration needs exact separate approval.
- Client names: `EXPO_PUBLIC_CONNECT_NATIVE_INCOMING`,
  `EXPO_PUBLIC_CONNECT_APNS_PROVIDER`, `EXPO_PUBLIC_CONNECT_FCM_PROVIDER`.
  Server names: `CONNECT_NATIVE_APNS_PROVIDER`, `CONNECT_NATIVE_FCM_PROVIDER`.
  Existing secret values stay unchanged.
- Read-only check of custom call-type encryption (`available` or `auto-on`). If
  missing, approve only the required Connect encryption setting; preserve roles,
  other capabilities and global/Live settings.
- Verify actual iOS PushKit/CallKit, VoIP background mode, APS entitlement and
  after-first-unlock SecureStore access. Verify Android Callingx/Telecom, Firebase
  messaging, incoming/foreground services and OS notification/full-screen
  permissions. Local packages do not prove installed entitlements.
- Confirm `EncryptionManager.isSupported()` on both installed clients. Prefer
  existing binaries; build/sign/install only after a demonstrated incompatibility
  and explicit approval. No OTA is proposed.
- Separately approve `native_incoming_enabled=true`, `e2ee_enabled=true`, matching
  client opt-in and provider aliases. Both owner accounts must reopen the app to
  register device public keys/destinations first. Normal relationship/media
  consent, blocking, budget and admission remain authoritative.

## Rollback and validation

The package retains **22 actual revision-2 deployed source files** for rollback.
Keep SQL forward-only and preserve terminal state, outboxes, leases and native
removal tombstones. Disable the new features and end owned calls through existing
authority; flags do not stop existing media. **Keep the new worker** while native
cleanup/tombstones exist. Restore old credentials only after encryption-required
calls are terminal. Restore old worker only after verified removal and a safe
tombstone handoff. No automatic ambiguous retry.

After approved activation: foreground encrypted voice/video and safety codes;
locked Answer/Decline both directions; cancelled/missed/expired invitations;
camera off while locked; logout/account switch; offline failure; End and End &
Block. Force-stop/first-unlock platform limits still apply. No locked incoming,
encrypted-media, physical shutdown or remote-cutoff device PASS is recorded yet.
This is not an audited Signal-style ratchet or forward-secrecy claim.

M2A/M2B **BLOCKED**; remote revocation **UNVERIFIED**.

References: [Stream incoming setup](https://getstream.io/video/docs/react-native/advanced/incoming-calls/ringing-setup/expo/),
[Stream E2EE](https://getstream.io/video/docs/react-native/guides/end-to-end-encryption/).
