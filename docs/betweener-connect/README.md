# Betweener Connect

Current engineering entry point, updated 2026-11-05. Numbered reports are historical
records; they are not current instructions or execution approvals. See the
[historical index](archive/README.md) instead of reading every report in sequence.

The [local video UI and matched-only launch change](connect-video-call-ui.local.md)
adds the shared wallpaper, private caller preview and an icon camera choice on
Answer. Its server migration is prepared but not deployed, and native video device
validation is still required. The earlier audio UI and repair receipts are retained.

## Current product scope

- Authenticated foreground voice/video in the staging development app, entered from chat.
- Server-owned relationship, media consent, admission, blocking and terminal state.
- One Auth-bound Connect owner sharing the existing exclusive Live/Connect lease registry.
- Independent local stop requests, durable provider cleanup and strict acknowledgement classification.
- Local audio packet observations, interval-loss/quality estimates and timing diagnostics. The owner has confirmed clear two-way foreground speech; new lifecycle changes still need device retesting.
- Active-call background audio is explicitly opt-in and depends on Callingx. Lock suspends video without automatically restoring it. Native incoming and E2EE are mounted behind two new server gates. Their staging infrastructure is installed with both gates OFF; device validation is pending.
- Foreground Return to chat retains the existing call owner and stops camera capture. The ongoing banner provides return and End actions.
- Lower-data video configures the next camera start while capture is off. Recent history identifies voice/video and refreshes on focus.
- End Call & Block and bounded connection recovery are enabled for supervised testing only in the verified staging development identity. Global and production defaults remain off.
- M2A/M2B remain **BLOCKED**. Remote hostile-peer media revocation remains **UNVERIFIED**.

The current local runtime policy permits the UI/native owner only in the verified
native staging development identity. Global defaults and production remain disabled.
This document does not attest to current hosted gates, account scope or budget.

## One active implementation path

| Boundary | Source |
| --- | --- |
| Chat entry and call route | `components/chat/ChatScreen.tsx`, `app/connect/voice.tsx` |
| Auth-bound composition | `features/connect/components/ConnectProductProvider.tsx`, `data/load-connect-product.ts` |
| Authenticated service and RPC adapter | `features/connect/data/authenticated-connect-services.ts`, `data/connect-repository.ts` |
| Calling preference UI state | `features/connect/hooks/use-calling-preferences.ts` |
| Voice lifecycle and native ownership | `features/connect/voice/voice-controller.ts`, `media/connect-native-owner.ts` |
| Credential fencing and provider cleanup | `supabase/functions/_shared/connect-credential-issuance.ts`, `connect-provider-worker.ts`, `connect-stream-adapter.ts` |
| Native incoming and encrypted calling | `application/native-call-coordinator.ts`, `security/`, [staging proposal](connect-secure-calling.proposal.json) |

The obsolete `connect-service.ts` / `voice-service.ts` wrappers and mock
`/connect/voice-preview` app route have been removed. The pure preview fixture remains
for offline tests. No second token issuer, media client or authority has been added.

## Testing

Use the existing iPhone/Android staging development clients with the repository's
normal root Metro workflow. `npm.cmd start` is the root Expo command, not a staging
identity guarantee: retain the configured staging environment and confirm the app's
staging identity before testing. No new launcher or standalone test app is required.

Keep the initial voice retest in the foreground. Check two-way sound, mute/unmute,
earpiece/speaker routing, ordinary End, and Call details on both phones. Do not treat
SDK state or packet counters as independent hardware or remote-cutoff proof.

Focused local checks:

```powershell
npm.cmd run typecheck
node node_modules/eslint/bin/eslint.js features/connect app/connect/voice.tsx index.js
node node_modules/jest/bin/jest.js __tests__/connect-calling-preferences.interaction.test.tsx __tests__/connect-staging-voice.interaction.test.tsx __tests__/connect-intent-push.interaction.test.tsx --runInBand --watch=false
$connectTests = @(rg --files __tests__ -g 'connect-*.regression.test.cjs' -g 'connect-*.regression.test.ts')
node --experimental-strip-types --test --test-concurrency=4 @connectTests
```

Historical push replay now verifies superseded provider sources against exact
retained Git blobs, while strict current-source package checks still reject drift.
The frozen packages were not regenerated. Old Media Truth/provenance suites are
historical checks, not tonight's device-test prerequisite. The separate shared
notification-routing suite has three inherited Live-routing failures; its source
and tests are unchanged by this Connect work.

## Tonight's supervised retest

Use current staging root Metro on both existing clients. No new build, OTA,
deployment, gate activation or budget change is authorised by this checklist.

1. Foreground voice both directions: audible speech, mute/unmute, speaker/phone,
   End on either phone, capture indicators off, Done, then a fresh call without reload.
2. Foreground video: explicit camera on/off, switch, fit/fill; while camera is off,
   select lower-data video and explicitly restart it. This is a resolution target,
   not a measured bandwidth guarantee.
3. Return to chat, use the ongoing banner to restore/End. Ordinary Back still ends.
4. On a connected voice call, opt into Continue audio in background. Lock only one
   phone briefly, confirm audio and OS mute/End, then swap phones. An unavailable
   control means keep this call foreground. Without opt-in, backgrounding ends it.
5. For video with opt-in, lock must stop camera; unlock must leave it off. Explicit
   camera action is required afterward. Stop testing if capture or End misbehaves.

No killed-app incoming, encrypted-media or physical End Call & Block device PASS
is implied. Reconnection still retires the old owner. The controlled recovery
path is enabled for supervised staging testing: it waits for SDK
release, reloads canonical authority and obtains fresh credentials for a new
owner, preserves mute, leaves camera off, and permits at most two attempts per
call, with an eight-second release deadline and twenty-second attempt deadline.
These are local attempt limits, not provider media cutoff guarantees.
It cannot recover an ended call or borrow Live ownership. The owner approved
staging `end_block_enabled=true`, client `endCallAndBlock=true`, and client
`connectionRecovery=true`. Reload both existing staging clients from current root
Metro. Test End Call & Block last because it persists an account block; do not
automatically unblock afterward. Provider End/readback and bounded worker batching
are deployed in worker and consent-revocation revision 2. Scheduled empty-queue
no-ops verify scheduling/authentication, not actual provider termination. Keep
pending cleanup, existing worker scheduling, Live and shared push intact.

The [provider update proposal](connect-provider-update.proposal.json) pins exactly
the worker and consent-revocation closures. The approved
[recovery addendum](connect-provider-update.recovery-addendum.json) retains the
22 verified prior deployed files. The [deployment receipt](connect-provider-update.execution.json)
records both revision 2 deployments and the earlier halted activation; the
[activation receipt](connect-staging-test-activation.execution.json) records the
subsequent explicit approval and gate changes. Frozen packages and historical
evidence remain unchanged.

## Native incoming and encrypted calling

The [current local proposal](connect-secure-calling.proposal.json) pins one new
migration and exactly three function deployments. The [installation handoff](connect-next-staging-approval.md)
contains remaining approval and native/provider prerequisites. Historical provider
packages and execution receipts remain unchanged.

The [secure-calling execution receipt](connect-secure-calling.execution.json)
records the approved staging installation: worker 3, credentials 3, native-device
1, 32 source comparisons, 14 SQL definition/ACL checks and five genuine scheduled
no-ops. Both new gates remain false. After explicit owner approval, the single
connector-generated history row `20261103172110` was corrected to original
identifier `20261103150558`. Readback verified unchanged SQL, schema and unrelated
migration history. No migration replay occurred. Existing staging
settings, budget, shared push 28, webhook 2 and unrelated services are preserved.

Native OS Answer/Decline now enters the existing Auth-bound controller through a
single headless/React product lease. Each action revalidates the persisted call,
recipient, generation and consent. An explicit Answer permit allows background
microphone setup only with prior permission; the camera stays off. Push cannot
grant admission. Callingx supplies incoming events; no second Firebase background
handler replaces shared notification handling. Non-Connect SDK actions delegate
to the existing path. Device enrollment uses the authenticated endpoint and
durable worker only; SDK automatic token enrollment/logging is disabled in this
explicit mode. Provider delivery and device behavior still need verification.

E2EE uses account/installation SecureStore keys, authenticated public-key discovery,
per-call random media keys and device-addressed NaCl envelopes. The database
relays ciphertext, not clear media or private keys. Both credential fences require
the owned device envelope. Required encryption is installed before join, confirmed
before microphone activation and cannot fall back to plaintext. Changed peer keys
fail closed until explicit safety-code review. First use is unverified until people
compare codes through a trusted channel. This is not a Signal-style ratchet or an
audited forward-secrecy claim.

New SQL gates default false and reject production activation. Existing staging
settings were not changed. Native push aliases, APNS/FCM configuration and actual
installed entitlements must be checked before activation. Prefer existing binaries;
an actual native/entitlement mismatch needs a separately approved development build.
No build or OTA was performed.

Transferred/retired native destinations retain private possible-owner tombstones
for five-minute reconciliation, including after admission is disabled. Do not erase
those records or restore a worker unable to process them. Provider writes are not
atomic with SQL; uncertain removal remains a cleanup obligation. Retention and an
eventual verified purge require explicit operational review.

After approved installation/configuration, test encrypted foreground voice/video,
then locked incoming Answer/Decline/cancel/expiry on each phone, camera remaining
off while locked, logout/account switching, offline failure, End and End & Block.
Confirm SDK encryption support and matching safety codes. No locked-screen ringing,
encrypted-media, physical shutdown or remote-cutoff PASS is recorded by local tests.

Latest local validation: 978 Connect regressions, 131 UI/Auth tests (14 suites),
27 selected Live regressions, 18 disposable secure-calling database scenarios and
88 earlier relationship assertions passed. Root TypeScript, scoped ESLint (zero
errors/warnings), three Edge entry-point checks and Deno lint passed. The SDK patch
installed onto 20 clean baseline files and matched the current installed sources.
Receipts are in `tmp/connect-secure-calling/validation.json`; these are offline
results and do not attest to hosted installation or physical media.

## Deployment and evidence

Retain the [M3.4 handoff](connect-m3-4-staging-handoff.json),
[operations handoff](connect-staging-operations-handoff.md),
[frozen operations package](connect-staging-operations-package.json), and
[push recovery candidate](connect-v1-push-recovery-candidate-48.json).
They describe reviewed scopes; they do not authorise another execution.

All applied migration identifiers, original reports, receipts, consumed approvals
and ledgers stay unchanged. The 26.7 MB B3 receipt is historical evidence, not app
code. Review redaction and evidence storage before staging raw artifacts for Git.
Do not rename or delete hash-bound evidence during routine product cleanup.

## Commit boundaries

Review separate changesets for backend/security, mobile integration, and historical
evidence/tooling. Shared Auth, push and Live lease changes need selective hunk review.
Do not include unrelated Live, Circle or Studio work in a Connect commit. No commit,
hosted action, build, OTA or calling activation is part of this cleanup.
