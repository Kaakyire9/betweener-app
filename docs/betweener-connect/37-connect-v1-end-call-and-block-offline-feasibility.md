# Connect V1 End Call & Block: Phase A offline feasibility

Date: 2026-10-31. **CONDITIONAL_PASS for engineering feasibility, not permission to enable calling.** Reuse `public.blocks`, relationship authority, terminal Connect sessions and the existing termination outbox. Do not create another block table or equate an account block with confirmed SFU shutdown.

The repository already defines transactional block-to-call cleanup. The missing pieces are a call-bound, retry-safe command; honest local shutdown evidence; and qualified provider outcomes. **The complete proposed action is not implemented. Database atomicity under actual concurrency, native capture shutdown and provider block/end behavior are NOT VERIFIED in this phase.** No database engine or hosted service was accessed. Original Report 18 remains negative; B3 remains INCONCLUSIVE.

## 1. Existing implementation to reuse

References are repository paths and current line numbers. Source inspection establishes what is defined locally, not what is deployed.

| Existing component | Verified source behavior / limit |
|---|---|
| Account block storage | `supabase/migrations/20260713034644_remote_production_baseline.sql:29812`, `:31510`, `:35441`: `public.blocks` stores **Auth user IDs**, unique `(blocker_id,blocked_id)`. INSERT RLS binds the blocker to `auth.uid()`. Profile IDs are a different namespace. |
| Existing application operations | `lib/chat/chat-list-actions-service.ts:42` and `lib/chat/chat-thread-remote-service.ts:40` directly insert that row; their unblock paths delete it. They do not create a separate Connect authority. `lib/chat/hooks/use-chat-thread-screen-ui.ts:181` treats code23505 as already blocked; this is not a call-bound cleanup acknowledgement. |
| Relationship invalidation | `20261028064220_relationship_acceptance_authority.sql:60`, `:86`, `:534`: BEFORE INSERT/UPDATE guard resolves user IDs to profiles, obtains the shared pair advisory lock, advances the revocation watermark and revokes decisions/proofs. Block identity columns are immutable on UPDATE. |
| Active-call terminalization | `20261028074908_connect_v1_foundation.sql:492`: AFTER INSERT on `public.blocks` visits every nonterminal session for those **account IDs in either direction**, locks rows and transitions them to `ENDED`, reason `blocked`. It includes matched/pre-match and voice/video sessions. It does not depend on the foreground UI calling `rpc_connect_act` afterward. |
| Durable cleanup | Same migration `:139`, `:144`: a terminal transition increments version, stamps `ended_at` and enqueues `end` work. `(call_id,operation)` is the outbox key; pending/working work is not reset by ordinary enqueue. Occupancy is retained pending cleanup. No network operation occurs inside these triggers. |
| Future admission denial | Relationship pair availability `20261028064220_relationship_acceptance_authority.sql:66` rejects a block in either direction. Connect authorization `20261028074908_connect_v1_foundation.sql:115` adds mutual proof or directional media consent. Create `:268`, act `:299` and admission `20261029081013_connect_forensic_repair_1.sql:4` serialize on the pair. Denied admission returns normally after invalidation, preserving terminal/outbox writes. |
| Credential fences | `supabase/functions/_shared/connect-credential-issuance.ts:17`: affirmative bound admission before issuance and again afterward. Failure of the second fence suppresses delivery; it cannot undo membership promotion already performed. `connect-stream-adapter.ts:113` promotes the pair and issues an ordinary 120-second identity JWT. Its expiry is **not** an established active-media cutoff. |
| Termination worker | `connect-provider-worker.ts:13`, `:27`; `20261028143424_connect_m2a_revocation_cleanup.sql:4`; foundation `:394`: leased, end-prioritized durable work, bounded backoff, stale completion fences and compensation for a late creator. End jobs survive deletion without storing a peer target. The service entrypoint requires literal `true` from the completion RPC. Scheduling/hosted availability were not attested. |
| Webhook reconciliation | `connect-webhook.ts:1`, `:9`, `supabase/functions/connect-webhook/index.ts:12`: raw-body HMAC, Connect CID/age checks, body-digest deduplication and a reconciliation wake-up. Call events cannot grant authority or prove media stopped. The forward reconciler `20261029081013_connect_forensic_repair_1.sql:34` preserves terminality and distinguishes session end from permanent call end. |
| Local transport/controller | `features/connect/media/stream-voice-transport.ts:29`, `:88`, `:96`: injected bindings, disable capture before join, `create:false`, generation checks and retired CIDs. `features/connect/voice/voice-controller.ts:128` initiates leave before its server end action. These are useful foundations, not verified native shutdown. |

For a **new successful block insert**, the block row, relationship invalidation, terminal transitions and outbox insertion participate in the same database transaction by SQL definition. A propagated trigger error aborts the operation. This follows PostgreSQL's [trigger](https://www.postgresql.org/docs/current/trigger-definition.html) and [transaction](https://www.postgresql.org/docs/current/tutorial-transactions.html) semantics. No local Postgres execution or deployment check was performed, so this is source-backed atomic design evidence, not a new database conformance result.

The existing SQL security harness already contains a block/provider-snapshot race at `scripts/test-connect-security.cjs:147`, and `supabase/tests/relationship_acceptance_authority.sql:119` checks block/unblock proof invalidation. These sources were inspected **but not executed**, because they access a database. They are suitable starting points for a separately authorized database validation milestone.

## 2. Confirmed gaps and minimum proposed changes

1. **No End Call & Block command.** `features/connect/data/connect-repository.ts:19` exposes ordinary call actions, not an account-block transaction bound to a call. The existing account-block insert has actor RLS but no expected call/pair/generation contract or structured cleanup receipt. Do not compose separate client `end` and `insert block` requests and call that atomic.
2. **Cleanup success is not observable locally.** `StreamVoiceTransport.cleanup()` suppresses microphone, camera, leave and release errors; it also marks a binding cleaned before a release failure can be retried. Its interface returns `Promise<void>`, with no track/transport/playout evidence. The unchanged-code probe resolves `leave()` even when every mocked shutdown operation throws. This establishes a reporting gap, not a real-device leak.
3. **The controller can overstate completion.** `VoiceController.hangup()`/`finishLocal()` suppress failures and can render `ENDED` after failed local teardown and failed server actions. Conversely, an unresolved `leave()` prevents reaching `endOnServer()`. A single awaited chain is unsuitable for the combined action.
4. **End error classification remains unsafe.** `connect-stream-adapter.ts:126` accepts `Number(error.code)===16` without checking HTTP404. A synthetic code16/401 is swallowed by the unchanged adapter. This was already identified in [Report 34](34-connect-v1-m2c-security-contract.md); its correction has not been installed. `media()` at `:130` uses strict numeric code16/HTTP404 instead.
5. **Duplicate/replayed block operations need explicit semantics.** The AFTER trigger runs for an actual INSERT, not an already-existing row. Blind upsert is not a substitute: BEFORE triggers can run on conflicting inserts, and UPDATE invokes the relationship guard without invoking the INSERT-only Connect guard. Confirm the existing row under the pair lock before deciding whether an insert is needed. Do not accept any arbitrary23505 as proof of the exact desired block/call outcome.
6. **Unblock ordering is not yet a shared generation contract.** Existing direct DELETE paths have no pair-locking block-DELETE trigger in the inspected migrations. A delayed unknown-outcome block must not silently recreate a block after a newer unblock. The model demonstrates an expected-watermark/block-row fence, but that fence and consistent block/unblock serialization are **proposals**, not existing guarantees. Reconcile rather than blindly resubmit across unblock or account change.
7. **Scoped fallback requires more than an SDK method.** The current outbox allows only `create/end/sync` and carries no block target. A durable kick/block fallback needs a reviewed operation/target binding, separate acknowledgement and deleted-account handling. It cannot borrow `end` success or infer the target after the session disappears. The existing end-only cleanup should remain able to survive deletion.

The minimum future patch set is therefore a narrow command over existing authority, structured local teardown results, separate UI safety states, and strict typed end outcomes. No table, migration, controller, adapter, role or worker was changed here.

## 3. Proposed authority and local shutdown sequence

The label “End Call & Block” specifies the intended result, not an HTTP ordering rule.

1. Capture the immutable call UUID, expected pair/account/profile/media/authorization binding and the current authenticated **local owner generation**. Retire that local call generation, disable reconnect/refresh/capture restart and initiate microphone/camera/publication and reception/playout shutdown immediately. Do not wait for a network response. Local owner generation is a client lifecycle fence, not trusted server authorization.
2. Independently dispatch one authenticated account-block command, **without awaiting SDK leave or its verification**. Derive the actor from trusted authentication, not a client `p_actor`. Derive/check the peer's Auth user ID from the owned call and canonical profile bindings. Reject another pair, call or stale immutable binding before writes. Do not require an active match, still-valid consent, an enabled calling flag or a selected answering device merely to withdraw access.
3. In one future database command, acquire the existing pair lock using the established lock order, re-read the bound call, and handle the existing block row explicitly. Insert only when absent and the expected revocation baseline is still valid. Reuse the existing relationship and Connect triggers. On a legitimate already-blocked retry, verify/ensure terminal state and the appropriate durable end work without resetting a live worker lease. A mutable UI state version must not by itself prevent safety blocking after a concurrent end; validate immutable call generation and re-evaluate state under lock.
4. Commit block, terminal state and durable work together. **R is the commit point**, not the tap, internal SQL timestamp or request submission. Successful reply/reconciliation observes the commit; a lost response leaves the client uncertain even if it committed. Future receipt fields should separately report exact pair/call binding, saved block, terminal state and cleanup pending/acknowledged. Read back the authoritative result on ambiguity. No new request receipt table or second block store is proposed.
5. Let the existing authorized server worker deliver end work for the bound `betweener_connect:<UUID>`. Preserve the obligation through provider failure, stale lease, lost ACK and late creation. End acceptance is a control result; retain separate media-enforcement uncertainty. Cleanup should use verified application provenance: the current adapter scopes type/UUID, but its end method does **not** itself run the app/type preflight used by provision/credentials.
6. Reconcile devices and callbacks from authoritative state. The initiating client stops itself; other legitimate devices must stop when they receive denial/invalidation. Failure of that control channel remains a risk, not a reason to assert that every device stopped. A modified client can ignore cleanup. Never reuse a terminal call ID after unblock; fresh relationship/media authority and a new call are required.

Generation fencing needs a separate implementation review: the model uses a symbolic existing revocation watermark and block-row identity. It does not assert that every current unblock writer is serialized, or that timestamp comparison alone is sufficient under concurrent transactions. If an intent began while already blocked, it is confirmation of that exact row, not permission to insert a new row after it is deleted. Durable retries must remain bound to the original account and action; account switch must not retarget them.

### User-visible states

Maintain independent local, authority and provider axes as specified in Report 34:

| Observation | Safe UI meaning |
|---|---|
| Local resources verified stopped; database reply unavailable | “Your microphone and camera are off. Blocking has not been confirmed.” Mention only verified resources; retain a pending block intent. |
| Local shutdown failed/unverified | “Local media shutdown could not be confirmed.” Offer native privacy recovery; do not hide the failure behind a closed screen or provider ACK. |
| Account block committed; provider unresolved | “Blocked in Betweener. Connection shutdown is pending.” Do not claim confirmed remote cessation. |
| Provider end accepted; account block still uncertain | “End acknowledged. Blocking has not been confirmed.” An end response cannot prove a persisted account block. |
| Both control operations acknowledged | Report saved block and end acknowledgement separately; media enforcement remains unverified. |

The future native owner must verify applicable capture tracks, publisher closure, subscription/playout shutdown and owner-scoped resource release. Merely muting, dismissing OS call UI or resolving an SDK promise is insufficient. No native owner is installed: `app/connect/voice-preview.tsx:9` still uses the fake preview. Voice has no automatic video consent or camera enablement; VIDEO requires independent consent and corresponding shutdown verification.

## 4. Stream operations and smallest defensible operation set

Pinned sources inspected: server SDK **0.7.63** in `%LOCALAPPDATA%/deno/npm/registry.npmjs.org/@stream-io/node-sdk/0.7.63/`; installed video-client **1.62.0**. No SDK was upgraded or instantiated against Stream.

| Primitive | Installed API and documented purpose | Decision |
|---|---|---|
| `call.end()` / client `endCall()` | `src/gen/video/CallApi.ts:168`, `VideoApi.ts:521`; client `src/Call.ts:3272`: POST `.../call/{type}/{id}/mark_ended`. Documentation describes ending for everyone, requiring `end-call`. | **Primary durable provider operation.** No client role change is necessary for server-owned cleanup. |
| `call.blockUser({user_id})` | `CallApi.ts:108`, `VideoApi.ts:306`: POST the call's `/block`. It is scoped exclusion, not Betweener account blocking. | No unconditional extra request after successful end. |
| `call.kickUser({user_id})` | `CallApi.ts:162`, `VideoApi.ts:491`; kick alone disconnects but permits rejoin. | Insufficient by itself for the block requirement. |
| `call.kickUser({user_id,block:true})` | `src/gen/models/index.ts:13565` includes optional `block:boolean`; client `Call.ts:2899` forwards the request. | Potential **single scoped fallback** if exclusion is separately needed while end remains unresolved. Do not also send a separate call block automatically. Support/ACK scope and durable targeting must be reviewed first. |
| `client.blockUsers(...)` | `src/gen/common/CommonApi.ts:1741`, models `:2807`: platform user blocking. Its documented effect covers incoming ringing/notifications. | Do not use as proof of active-media termination or as a second account authority. It also crosses feature boundaries in a shared Stream app. |

Documentation: [Calls/end and ended access](https://getstream.io/video/docs/api/calls/), [kick and combined kick/block](https://getstream.io/video/docs/react/guides/permissions-and-moderation/), [user/call moderation](https://getstream.io/video/docs/api/moderation/overview/).

**Recommendation: local shutdown + existing account block transaction + durable call end.** The word “Block” refers to the durable Betweener account block. A routine end-then-block-then-kick chain adds failure points without establishing a stronger measured media guarantee. Do not delay end behind a call block, and do not mark end work done because a kick/block was accepted.

After a genuinely ended call, the retained Connect roles have no `join-ended-call`; a further call block is therefore **redundant for that ordinary membership path under the documented policy**. It can be defense in depth against a separately identified rejoin path, but is not proven necessary or useful on the current ended custom call. Its server acceptance/readback after end is **NOT VERIFIED**. Call-scoped blocking is not inherently unsafe when correctly bound; wrong targets, global blocking, ambiguous completion and unnecessary unblock/regrant operations are the risks. No fallback is executed or integrated here.

The Calls API documents that `single_use` prevents ended-ID reuse regardless of permissions. The retained normalized Connect configuration omits lifecycle, and the pinned request settings expose no lifecycle field. **Do not claim `betweener_connect` is single-use**, switch to a broader built-in type or make an undocumented cast. Even single-use semantics do not supply a finite hostile-peer packet cutoff during a failed end channel.

Current exact roles are read-only invited; read/join/audio for voice; plus video publication for video (`connect-stream-adapter.ts:35`). They lack end, block and kick powers. Installed capability constants include `end-call`, `block-users`, `kick-user`; their existence alone is not authorization. The authorized server must perform any proposed moderation; no participant/global role grant is needed here. Effective permissions depend on app/call roles and settings. [Stream permissions](https://getstream.io/video/docs/api/call-types/permissions/).

Live/Circle/Studio receive no new Stream user-block or global-role changes. The existing account block is intentionally an account-wide safety authority, so its existing relationship effects remain applicable; this proposal does not rewrite those features. A same-app alternate issuer and old promoted membership remain relevant to the threat model. Identity JWT validity is separate from permission/consent and already-established SFU access. [Stream authentication](https://getstream.io/docs/platform/authentication/).

### ACK/error contract

Pinned `EndCallResponse`, `BlockUserResponse` and `KickUserResponse` contain request `duration`; SDK HTTP metadata is added. None is an SFU packet-cutoff certificate. The correction in Report 34 must precede claims of reliable completion:

- Matching successful response with qualified scope/status/body: control **accepted**, media unverified.
- Strict numeric404/code16 plus fresh scoped server absence confirmation and verified visibility: object absence observed, not SFU cessation. Do not accept code-only/string16 or a wrong application/CID.
- HTTP401/403: authentication/authorization failure; never success even with contradictory code16.
- Timeout/lost response: possible committed operation, unresolved effect. 429/5xx/malformed response: unresolved; reconcile without recreating the call.
- Scoped kick/block success: only that operation's acknowledgement; retain any outstanding end obligation.

The current adapter's weaker catch and `Promise<void>` result remain unchanged. Existing worker occupancy release follows a control ACK and settled create work; it must not be advertised as measured media absence. The future safety policy for admitting an overlapping replacement call needs explicit review against the unresolved enforcement contract.

## 5. Failure and race matrix

“Pass” in a test log means the stated model or mocked-code assertion passed. It never converts a NOT VERIFIED physical/distributed property into PASS.

| Scenario | Executed offline result / required behavior | Boundary still NOT VERIFIED |
|---|---|---|
| Normal action | Combined model stops local resources, commits account block/terminal intent, then resolves control work independently. Media axis stays UNVERIFIED. | Actual transactional endpoint, native devices and Stream effects. |
| Stream unavailable, block succeeds | Actual end worker with throwing mock retains failure; modeled authoritative block/terminal state remain committed and admission denied. | Remote raw-peer termination under outage; finite bound. |
| Database unavailable | Local model shutdown completes while authority stays pending. UI cannot claim block saved. | Real mobile capture stop and eventual intent delivery. |
| Local shutdown fails, is partial or hangs | Proposed model exposes failure/unverified state; server command can commit independently. Unchanged code probes reproduce suppressed errors and leave-before-server dependency. | Hardware/OS recovery and all-device cessation. |
| Duplicate taps/retries | Model deduplicates pair row/end job and preserves working lease. Current simple duplicate INSERT is not a structured call receipt. | Postgres conflict/rollback/lock behavior for the new RPC. |
| Simultaneous end/block | Both serialized model orders retain terminality/block; no reopening. | Actual concurrent transactions/deadlocks and shared unblock writers. |
| Wrong actor/target/call/generation | Synthetic attempts rejected before modeled writes; existing actor RLS and participant checks inspected. | Deployed grants/RLS and endpoint implementation. |
| Revocation races credentials | Actual two-fence issuer suppresses delivery after modeled block during promotion; first denial prevents issue. | Revoking already promoted membership or a token delivered before commit. |
| Stale JWT/promoted membership | Authoritative admission denies; model deliberately does not infer that Stream media stops. | Held-token direct provider join, alternate issuer and existing SFU credentials. |
| Rejoin after end | Existing transport retires its CID; terminal state is absorbing. Provider policy/docs distinguish ended access. | Non-cooperative direct rejoin on the actual custom type. |
| Block then unblock | Model preserves terminal ID/revoked proof and rejects a queued old block generation. New explicit consent/call required. | Shared unblock serialization and replay fence implementation. |
| Account switch/multiple devices | Late local ACK discarded by owner generation; model account denial covers devices, not only the button's device. | Native owner handoff and remote sessions that ignore updates. |
| Ambiguous/provider/auth responses | Fresh Report 34 contract tests preserve pending/unknown effect; new suite exposes current code16 misclassification. | Provider completion and fresh absence semantics. |
| Delayed/duplicate webhooks | Actual HMAC/CID/age helper tested; source digest dedupe inspected; terminal sync worker does not read/promote media. Old signed hints are ignored after its existing five-minute check. | Hosted delivery/reconciliation availability; no media proof follows from a hint. |
| Interrupted worker/late creator | Actual worker replay and compensation tested with mocks; model rejects stale lease and keeps occupancy while create is pending. | Provider-side replay semantics and live scheduling. |
| Malicious client refuses cleanup | Model retains the adversary's valid credential/membership possibility despite authoritative denial. | **No finite remote revocation bound established.** This scenario is not a security PASS. |

## 6. Fresh validation and preservation

New repository sources are only this report and [the isolated 48-case suite](offline-37/end-block-feasibility.test.cjs). The test has private model helpers and imports unchanged pure controller/transport/adapter/worker/credential/webhook modules using injected mocks. It imports no credential-reading edge bootstrap, SDK client or database driver. A fetch tripwire records **zero network attempts** in its exclusive scope receipt.

| Fresh selection | Exact command / result |
|---|---|
| End/block models and unchanged-code probes | `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --test-reporter=tap docs/betweener-connect/offline-37/end-block-feasibility.test.cjs` — **48/48 PASS**. |
| Existing Connect/security/relationship/provider/media offline selection | The 17-file list in `tmp/connect-analytical-hardening-32/media-truth-offline-status.json`, executed with `node --no-warnings=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test --test-reporter=tap <files>` — **290/290 PASS**. It includes foundation, consent, credential, worker/observation, voice, relationship and fake-transport request regressions. |
| Existing ACK/security contract | `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --test-reporter=tap docs/betweener-connect/offline-34/m2c0-security-contract.test.cjs` — **69/69 PASS**. |
| Syntax / targeted lint | `node --check docs/betweener-connect/offline-37/end-block-feasibility.test.cjs`; `node node_modules/eslint/bin/eslint.js docs/betweener-connect/offline-37/end-block-feasibility.test.cjs --max-warnings=0` — **PASS**, zero warnings in the final run. |
| Live environment isolation | `node scripts/verify-live-environment-isolation.cjs` — **PASS**, staging/production isolated, no secrets printed. No Live runtime/configuration/source change. |

The three fresh test selections total **407 ordinary passes**, zero failed/cancelled/skipped/TODO. The first focused version passed44 cases; four additional normal/media-scope/replay/webhook cases passed before finalization. Initial lint reported one unused-variable warning; only the new test's diagnostic assertion was corrected, and the final lint is clean. Original failed/initial logs are retained.

Exact PowerShell selection for the 290-case run:

```powershell
$endBlockTests37 = @((Get-Content -LiteralPath tmp/connect-analytical-hardening-32/media-truth-offline-status.json -Raw | ConvertFrom-Json).files)
node --no-warnings=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test --test-reporter=tap @endBlockTests37
```

Logs are `tmp/connect-end-block-37/focused-final.log`, `connect-offline.log`, `m2c0-contract.log`, `syntax-final.log`, `lint-final.log` and `live-isolation.log`. Hashes, exact selections and preservation are retained in `tmp/connect-end-block-37/final-verification.json`. No full Live suite, native test, SQL/security database driver or provider media run was executed. Report 33's four-failure package selection and five-failure expanded Live selection remain historical, distinct selections; an isolation-script PASS does not make either full suite green.

All **2,398 baseline repository files/absences and 534 protected records** remain unchanged, including pre-existing unrelated dirty/deleted work, Reports18–35, original/hardened offline classifiers, prepared sources, historical receipts and consumed B1/B2/B3 records. Historical 84/84 analytical receipts are hash-verified, not rerun or extended. The historical 290/290 log is preserved separately from the fresh 290-case log.

Original Report18 raw receipt remains `8c1d82141a5c5140c94ac2b65e2b09dca42ebbe1f0f8c87b852d6dacdffa501d`. Original B3 raw receipt remains `0dcb9e021be24ae8cebf105938c11155a859013f619892f1663209149d077b55`; its canonical wrapper remains `ef7dd20af2b379003132d4ab4d3a2743cbd914a6525db6ef3f13a64425ce11f9`. No historical verdict or record was edited. Public documentation reads are separate from authenticated application APIs.

## 7. Narrow proposed milestones and staging prerequisites

1. **Command/ACK design review, then separately authorized offline implementation.** Specify call-bound authenticated block over the existing table/triggers, duplicate/readback behavior, generation/unblock fencing and consistent lock order. Repair strict end classification and typed control outcomes without weakening lease/admission fences. Do not add provider block work until its necessity and durable target representation are agreed.
2. **Separately authorize disposable database conformance tests.** Execute real RLS/trigger transaction rollback, block-vs-create/admit/end, duplicate insert, unblock/retry, lease-loss and deletion races. Current model success is insufficient for `VERIFIED_LOCAL` database atomicity. This phase did not authorize that work.
3. **Local native owner validation as a separate scope.** Implement measurable teardown and independent authority dispatch; test track/transceiver/playout release, background/interruption, account switch, multiple devices, thrown/stalled teardown and stale refresh callbacks. Never change `STOP_UNVERIFIED` into success because the screen closed. Native calling integration remains unauthorized here.
4. **Provider clarification before an execution design.** Resolve [Report35's unsent capability enquiry](35-stream-media-enforcement-capability-enquiry.md), including end/kick/block completion semantics, custom-type ended access and the missing autonomous active-media bound. No support contact occurred. A healthy-path control success cannot answer the outage guarantee.

A separately approved staging capability check would require an immutable reviewed proposal with fresh source hashes, explicit owner authorization and a new unused namespace; exact expected staging app/type/roles; verified identity/pair/target and effective settings; no shared/Live policy mutation; bounded writes/retries, watchdog ownership and cleanup/absence attestation; and independent measurements for any actual media claim. It must distinguish account commit, local shutdown, end ACK, scoped exclusion and hostile-peer media behavior. It must not reuse a consumed B1/B2/B3 approval or infer a universal bound from a finite observation. **These are eligibility requirements, not a prepared experiment, resource allocation or execution approval.**

Minimum next step: review the narrow command/local-safety/ACK proposal and obtain the missing provider contract. Keep real calling disabled. The available building blocks can save a block and deny new Betweener admission, but they do not yet establish finite termination of an already authorized, non-cooperative media session when termination cannot reach Stream.

```text
CONNECT_END_BLOCK_OFFLINE_FEASIBILITY = CONDITIONAL_PASS
CONNECT_AUTHORITATIVE_BLOCK_ATOMICITY = INCOMPLETE
CONNECT_LOCAL_MEDIA_SHUTDOWN = INCOMPLETE
CONNECT_PROVIDER_BLOCK_END = DOCUMENTED_ONLY
CONNECT_REMOTE_REVOCATION_BOUND = UNVERIFIED
CONNECT_STAGING_TEST = NOT_AUTHORISED
CONNECT_M2A_SECURITY_GATE = BLOCKED
CONNECT_M2B_READY = BLOCKED
PROVIDER_WRITES = NONE
PRODUCTION_MODIFICATIONS = NONE
```

INCOMPLETE distinguishes source/model evidence from an implemented and database/device-verified combined action. DOCUMENTED_ONLY applies to the proposed provider operation set; historical end observations remain valid within their original limits, and no call-scoped block/end combination was newly verified. No Supabase/database operation, provider fixture, hosted role/configuration mutation, product source change, Live/Circle/Studio modification, migration, build, deployment, OTA or calling enablement occurred.
