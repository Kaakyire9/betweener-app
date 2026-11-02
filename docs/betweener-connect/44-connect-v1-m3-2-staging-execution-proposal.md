# Connect staging voice pilot: proposal for owner review

Date: 2026-10-31. Companion: [Report 44](44-connect-v1-m3-2-staging-readiness-review.md). **This document does not authorise execution and is not an executable approval.** No account IDs, credentials, approval ledger or provider fixture are allocated.

Use the existing Galaxy A17 5G and iPhone 15 Pro staging development apps first. No new build is proposed unless a specific missing/incompatible native API or signing requirement is demonstrated. Current calling switches stay off.

## Intended test, after prerequisites and explicit approval

Exactly two owner-selected, isolated staging accounts: **A on Galaxy**, **B on iPhone**. Actual Auth IDs/profile/installation bindings are still missing and must be verified privately. Neither a device name nor test-account status grants calling eligibility. Both must have a current verified mutual relationship, explicit voice preferences and clear account/block state.

Proposed initial budget: **at most two sequential new voice calls**, both accounts controlled and consenting, both apps foregrounded:

1. A rings B; B accepts in the app; establish positive bidirectional voice; test mute and available earpiece/speaker routing; A/B use ordinary End Call. Confirm separate local, DB, provider ACK and cleanup status.
2. Only after the first call's cleanup is resolved, create a fresh call for A/B; establish voice; invoke existing End Call & Block. Verify the authoritative block/terminal transition/outbox, denial of future eligibility without creating another call, owned provider cleanup and local safety evidence on both devices.

Ordinary Expo notification delivery/tap may be observed within those calls. No OS Answer/CallKit/Telecom/killed-app ringing, Live coexistence test, camera, video, pre-match escalation, extra identities or automatic replacement calls are included. Failed setup consumes its allocated call attempt; investigate before proposing another. Idempotent worker retries for the same owned call remain durable work, not authority to allocate more calls.

The owner must choose a finite pilot window, maximum conversation duration, operator stop conditions and cleanup owner before execution. No duration here is represented as a provider-enforced revocation guarantee. M2A/M2B stay BLOCKED regardless of pilot success.

## Ordered prerequisites and approval boundaries

| Step | Concrete work to review/approve later | Stop condition |
|---|---|---|
| 1. Read-only parity | Staging `xsgzxadwuxuziubglvps` migration/catalog/constraints/triggers/grants/configuration; Edge source/dependency digests and gateway auth; scheduler metadata; exactly two approved Auth/profile mappings; Stream app 1731011/type policy/routing GETs. Report 44 specifies queries and minimum permissions. No application RPC/worker health invocation. | Wrong project, unknown ownership, policy drift, missing source/definition evidence or unapproved account. |
| 2. Minimal local preparation | Remove the second `ConnectCallingPreferences` mount; add a full-screen composition regression. If deployed gateway overrides are absent, prepare `verify_jwt=false` only for custom-auth worker/webhook while retaining their handler authentication. Root Metro must use staging JS environment. | Any broader authority/UI rebuild, blanket JWT relaxation or change to Live/shared provider policy. |
| 3. Exact hosted delta | Approve and apply only the genuinely missing migrations/functions/configuration discovered in step 1. Keep admission/push/client gates off during parity checks. Establish existing worker/push scheduling and sufficient invocation capacity. | Broad migration push; unreviewed shared push impact; unowned active sessions, occupancy or pending provider jobs. |
| 4. Account binding | Privately approve exact A/B Auth IDs and profiles; configure exactly that pair in `staging_test_users`, environment staging; keep existing match/consent checks. Approve any necessary isolated account relationship/preferences preparation separately. | Empty/wrong/third account; production identity; environment local; implicit eligibility bypass. |
| 5. Installed-client verification | Inspect both installed package IDs/build versions and native archive/module metadata first, without launching the product. Android cached APK already contains inspected audio/WebRTC/Callingx/notification classes; iOS still needs embedded-module/API confirmation. Any app bootstrap, bridge execution or notification registration waits for the explicit network/device approval in step 6. Prefer root Metro delivery to existing development clients; no OTA. | Missing/incompatible bridge, registration/ABI/signing issue. Stop before requesting a specific binary/config/install approval. |
| 6. Explicit test-scoped activation | Review exact source/configuration hashes, both private account bindings, pilot window/two-call budget, bootstrap/network destinations, microphone use and cleanup plan; then authorise each enumerated activation/provider operation. | No current approval; unavailable cleanup owner; provider ring/push can route into the existing Live-only OS-answer path. |
| 7. Observe/clean up | Operator runs the two calls. Preserve positive voice controls, local shutdown observations, terminal/ACK/job evidence and no out-of-scope admission/delivery. End work remains until confirmed by its existing strict control-plane contract. | Pre-accept capture, stale restart, wrong identity, false safety status, native crash, unresolved cleanup or ownership crossover. |
| 8. Close scope | Disable new admission, notifications and client entry; finish owned cleanup; verify no active owned sessions/jobs/occupancy and final safe flags; retain evidence/configuration before/after. | Never delete cleanup obligations or declare media stopped solely because flags are off. |

## Exact deployment inventory to compare

Core migration candidates, apply **only if proved missing**, in dependency order:

```text
20261028064220_relationship_acceptance_authority.sql
20261028074908_connect_v1_foundation.sql
20261028143424_connect_m2a_revocation_cleanup.sql
20261029081013_connect_forensic_repair_1.sql
20261031035826_connect_end_block_local_foundation.sql
20261031191352_connect_m3_1_intent_and_notifications.sql
```

The eight exact shared push prerequisites are listed in Report 44. Verify existing parity; do not replay or modify Live/Circle/Studio configuration. Edge targets: `connect-credentials`, `connect-provider-worker`, `push-notifications`; also verify existing `connect-webhook` reconciliation and optional `connect-revoke-consent` fast-path parity. Deploy only mismatching/missing reviewed bundles and dependencies. Current hosted absence has **not** been established.

Required configuration names/references include `CONNECT_ENVIRONMENT`, `CONNECT_STREAM_APP_ID`, `CONNECT_STREAM_API_KEY`, `CONNECT_STREAM_API_SECRET`, **`CONNECT_WORKER_SECRET`**, `SUPABASE_URL`, existing public/admin key-helper alternatives, `CONNECT_NOTIFICATIONS_ENABLED`, `PUSH_DELIVERY_MODE`, staging push application/EAS identity, current HMAC keys and existing private push/Vault references. Report 44 contains the full names-only list. Do not rotate working credentials, print values or add a second worker/dispatcher.

For the approved matched pilot only, the future reviewed values would be:

- Source: `ui=true`, `nativeRuntime=true`, `nativeSafetyOwner=true`, `endCallAndBlock=true`, with every staging/development/native-ID/backend guard retained. `videoTransport=false` and computed video availability false.
- DB: environment staging; exactly the two approved Auth IDs; `enabled`, `voice_enabled`, `provider_ready`, `end_block_enabled` true only during the approved scope. `video_enabled=false`, `pre_match_enabled=false`.
- Notifications: `notifications_enabled` and `CONNECT_NOTIFICATIONS_ENABLED` true only for the approved delivery scope, using existing verified staging installation opt-in/HMAC/provenance. Preserve existing shared push configuration. If ordinary staging push is not already operable, report the exact missing dependency before any change.
- JS delivery: `APP_VARIANT=staging`, `EXPO_PUBLIC_ENVIRONMENT=staging`, correct staging Supabase public configuration. No production bundle, OTA, install or build. A normal LAN is network transport, not external isolation.

## Provider operations requiring later explicit authority

App/type/routing **reads** require their own approval first. For the two-call pilot, approve the existing server flow's user upserts for A/B and `betweener-connect-system` without global-role assignment; at most two DB-UUID-bound `betweener_connect` voice creations (`ring:true`, `notify:false`); exact-pair invited/voice member updates; authority-fenced 120-second user-token issuance/refresh; native signaling/SFU voice join after recipient acceptance; and existing owned end/reconciliation/readback operations and lease-fenced retries.

No call-type/global-role/application change, new fixture namespace, provider user/call deletion, kick/block operation, recording/egress feature, video publication or consumed experiment approval is included. Account-level blocking uses existing Betweener authority. Provider end ACK does not establish independent remote media cessation or a finite outage revocation bound.

## Rollback and emergency stop

First stop operators and new admission/notifications. Trigger local shutdown on both devices independently of network/authority submission; use existing terminal/End & Block authority as appropriate and preserve owned durable provider end work. Keep reconciliation/worker access available for that work; inspect ownership before any global sweep/claim. A disabled flag does not disconnect existing media.

Preserve native failure/cleanup evidence before reload/restart; a hung/failed owner stays quarantined. Do not release ownership just because a timeout elapsed. If shutdown is unconfirmed, stop the pilot and use an operator-controlled OS app termination/sensor-permission action as emergency containment, recording exactly what was observed; this is not proof of a universal remote cutoff.

After owned cleanup, restore the reviewed prior admission/push/source configuration or leave the safer disabled state. Retain the two-account restriction. Do not resurrect terminal call IDs, reset ledgers, erase jobs, roll back shared migrations or silently unblock accounts/recreate relationship authority. Any account/block restoration requires an explicit owner-approved operation. Final evidence must report unresolved work, local/device limits and provider uncertainty truthfully.

**Next approval to request: staging-only read-only parity plus package/archive inspection, with no app launch, sensors, registration, call creation or activation.** Resolve the concrete delta before requesting the later execution approval.

```text
CONNECT_STAGING_EXECUTION = NOT_AUTHORISED
CONNECT_DEVICE_VALIDATION = DEFERRED
CONNECT_REMOTE_REVOCATION_BOUND = UNVERIFIED
CONNECT_M2A_SECURITY_GATE = BLOCKED
CONNECT_M2B_READY = BLOCKED
STAGING_MODIFICATIONS = NONE
PRODUCTION_MODIFICATIONS = NONE
```
