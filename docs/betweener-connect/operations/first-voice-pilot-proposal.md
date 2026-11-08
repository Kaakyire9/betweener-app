# First supervised foreground voice pilot — approval proposal

**NOT ACTIVATED. Current decision: NO-GO pending real relationship/consent prerequisites and the reviewed budget correction.**

Target only `betweener-staging / xsgzxadwuxuziubglvps / eu-north-1`; Stream app `1731011`, type `betweener_connect`. Existing iPhone/Android development clients passed owner-operated **UI preflight only**, version `1.2.0 (1)`, JS marker `pilot-preflight-d8b27747`. No audio, ringing, native media publication, physical shutdown or real provider-cleanup PASS follows from that result.

## Actual prerequisites

- The selected accounts exist, each has one profile, and pair safety/block checks pass.
- The accepted-match label has **no acceptance-proof row**. Both voice-preference rows are absent, so voice defaults OFF. No consent or proof was inserted by this review.
- The deployed legacy Intent creator rejects new requests between already-matched users. Do not tell the owner to resend an Intent through that blocked route. Existing authenticated signal send/accept commands can establish fresh independent sender/recipient decisions, but the matched-profile UI currently hides its request controls. A normal, explicit on-device reconfirmation entry must be available before attempting that recovery; no administrative proof insertion or eligibility override is permitted.
- Each account must then opt into voice through its own authenticated preferences UI. Re-read mutual proof, recipient voice permission in each direction, and pair safety before activation. Current disabled scope is an additional admission denial, not evidence that underlying match/consent passed.
- Approve/apply only `staging-pilot-budget.proposed.sql` while everything remains disabled. The current budget trigger charges only open mode, while the existing temporary two-account scope uses closed mode. The proposed one-condition correction makes the same locked atomic counter apply in both staging modes. It changes no matching, consent, user, role or open-testing policy.

Budget patch SHA-256: `049241bcee406414278a079ee539f4339eb9bcee292386b967fa7575228c0a50`. This is a separate proposed delta, not an edit to any frozen migration or operations package.

Minimum local prerequisite: prepare/review an authenticated matched-pair reconfirmation entry using the existing sender/recipient decision commands, and let each owner set their own voice preference without enabling admission. Do not add a new consent authority or make an administrator certify either participant's decision. This proposal is therefore **not yet an executable call-activation approval**.

## Exact conditional activation

1. Independently fence the project to the target above. Confirm the budget-patch hash, expected existing function MD5 `5499655a658f0aa62768b3d3fd40b5bc`, restrictive ACL, no calls/jobs and all gates OFF. Apply only that patch and read back its exact definition/ACL. An ambiguous write requires readback, never blind retry. No broad migration push or unrelated deployment.
2. Bind the two owner-supplied Auth UUIDs from the local account-binding receipt to `private.connect_config.staging_test_users`. Keep `staging_open_testing=false` for this pilot. This is temporary configuration using the existing scope mechanism; the architecture still supports open testing later. Do not create accounts, reset matches or alter blocks.
3. With server admission still OFF and provider budget zero, make the reviewed staging-only product UI available through root Metro for owner-controlled consent setup. No call may start. Do not enable transport or create credentials to establish consent. If the reconfirmation UI is unavailable, stop for its local repair/review rather than using an admin account to impersonate either user.
4. Only after both owner actions and successful readbacks: set `environment=staging`, `enabled=true`, `voice_enabled=true`, `provider_ready=true`, `end_block_enabled=true`, the exact two-account array and `staging_calls_remaining=4`. Keep `staging_open_testing=false`, `video_enabled=false`, `pre_match_enabled=false`, `notifications_enabled=false`. Enable only the staging JS voice UI/runtime/native-owner/EndBlock switches after separate approval; video transport remains false. No build or OTA.
5. Start a recorded **20-minute admission window**, supervised continuously. Human/operator timers are operational limits, not an autonomous media lease. No unattended window, automatic widening or budget refill. First calls use iPhone → Android and the existing mutual/recipient consent checks.

## Four calls and observation

Run sequentially: **answer/two-way voice/End; decline; missed invitation; answer/two-way voice/End Call & Block**. A declined or missed canonical call also consumes a slot. Settle cleanup before the next call. Both phones stay foreground; Connect push/background/CallKit testing is excluded. Voice only; video, screen share, recording, captions, ingress and livestream remain disabled. Do not modify Stream policy, Live or shared push.

At each creation, the operator reads only sessions whose caller/recipient are the selected pair and whose creation time is inside this window. Capture the exact call ID, `created_at` generation, both account/profile bindings, media, provider session (including explicitly observed NULL), state/version, deadlines, owned job leases and occupancy. Never select account names, emails, tokens, message bodies or unrelated calls. The current authorised PostgreSQL role has SELECT/UPDATE on Connect configuration and EXECUTE on the existing terminal transition; no privilege grant is needed.

Record before/after database metadata, scheduled request IDs/results, owned webhook receipt metadata if delivered, and provider end ACK/readback for each exact call. The installed five-second worker remains the reconciliation path if a webhook is absent; do not claim delivery from revision 2 being installed. Shared push revision 28 stays unchanged. Owner confirms audible two-way speech and observed local cessation separately; do not record conversation content.

Conversation target **60 seconds**. At **90 seconds after connected time**, execute the reviewed owned-call watchdog command from `scripts/lib/connect-pilot-operator.cjs`; its SQL checks the server clock, pair, creation generation and exact provider session before requesting the existing terminal transition. It is an operator procedure, not an installed autonomous timer or a verified provider cutoff. Unknown/mismatched bindings require a fresh bounded readback, never guessed ownership.

## Emergency stop and closeout

1. Both owners press End; verify local stop separately. If the app is unresponsive, the owner stops it and preserves available evidence.
2. Execute `emergencyStopSql` from the operator module: all admission/media/notification gates OFF, open testing false, budget zero. Read back the effect. This transaction never deletes end jobs, receipts or occupancy and never changes cron, Live or push.
3. Execute `ownedEndSql(binding)` for each exact recorded owned call. It supports a known NULL provider session before media starts. If a session appeared since the last read, re-read and bind the same call; do not substitute another call.
4. **Keep the existing authenticated worker scheduled.** Observe durable retry/lease state; an ambiguous ACK or provider outage must retain outstanding work. Do not clear jobs, reset leases or claim media cessation from flags or JWT expiry. Stop further calling on worker auth failure, repeated failures, overdue reconciliation or ambiguous ownership.
5. At the 20-minute boundary or fourth canonical call, stop admission and zero the budget even if fewer calls completed. Restore the original empty temporary account scope after owned cleanup is settled. Restore staging JS switches OFF. Preserve End Call & Block's intentional account block and terminal history; do not automatically unblock or delete evidence. Leave the worker available for cleanup.

## Approval boundary

Scope B requires explicit approval of the reviewed budget patch, temporary exact two-account configuration, normal owner-performed reconfirmation/voice-consent setup, staging-only voice switches, four canonical calls and their necessary scoped provider provisioning/credentials/readbacks/end cleanup, supervised limits and emergency stop. **No call activation until the missing proof and consent are genuinely resolved and reverified.** The absent matched-pair reconfirmation entry needs local preparation before that consent step can be presented as executable.

No new secrets, provider policy, shared-push deployment, Live changes, new users, builds, OTA or production operations are included. The 20/60/90 limits do **not** guarantee remote provider media termination. M2A/M2B remain BLOCKED; remote revocation remains UNVERIFIED.
