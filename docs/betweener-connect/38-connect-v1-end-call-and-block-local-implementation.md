# Connect V1 End Call & Block: local foundation

Date: 2026-10-31. Scope: **local implementation, disposable PostgreSQL/loopback REST tests, offline regressions and compilation only**. The command and controller action are implemented and default off. No hosted migration, provider call, real native session, build or deployment occurred. Real calling and M2A/M2B remain blocked.

Reviewed Reports [33](33-connect-v1-revocation-architecture-decision.md), [34](34-connect-v1-m2c-security-contract.md), [35](35-stream-media-enforcement-capability-enquiry.md) and [37](37-connect-v1-end-call-and-block-offline-feasibility.md), and the current authority/worker/transport implementation. Report36 is not present in this checkout. This implements Report37's minimum operation set: **local shutdown, the existing account block transaction, and the existing durable provider end job**. It introduces no second block store, worker, participant permission grant or unconditional Stream block/kick chain.

## 1. Exact file changes

| File | Change |
|---|---|
| `supabase/migrations/20261031035826_connect_end_block_local_foundation.sql` **new** | CLI-generated local migration: default-off flag, per-actor request receipts on existing sessions, authenticated preparation/command/status RPCs and private binding helpers. Applied only to disposable clones. |
| `features/connect/config/connect-feature-flags.ts` **new** | Frozen `endCallAndBlock:false`; no environment switch or production/native bootstrap. |
| `features/connect/domain/end-block.ts` **new** | Typed context, receipt and independent view states; strict scope/outcome parsing. |
| `features/connect/media/local-shutdown.ts` **new** | Explicit capture/publication/playback/subscription evidence and SDK/release operation states. |
| `features/connect/media/stream-voice-transport.ts` | Structured shutdown result, independent stop attempts, optional owner inspection, late-join cleanup and once-only successful lease release. |
| `features/connect/voice/voice-types.ts` | Adds shutdown/status fields and optional bound command/status ports; legacy void transport results remain explicitly unverified. |
| `features/connect/voice/voice-controller.ts` | Default-off combined action, independent shutdown/authority dispatch, one prepared context/key per intent, read-only reconciliation, stale-owner fencing and separate ordinary hangup. |
| `features/connect/data/connect-repository.ts` | Narrow RPC transport methods and validated responses. |
| `features/connect/data/voice-service.ts` | Inert method forwarding; invoked only by an enabled controller action. No native owner is installed. |
| `supabase/functions/_shared/connect-provider-end.ts` **new** | Qualified acknowledgement and finite unconfirmed-error categories. |
| `supabase/functions/_shared/connect-stream-adapter.ts` | App-bound end validation, strict SDK response checks and fresh scoped absence readback. Creation arguments, SDK version and role/settings policy remain unchanged. |
| `supabase/functions/_shared/connect-provider-worker.ts` | Requires the typed acknowledgement before successful end completion, including late-create compensation. Existing worker/lease/DB-ACK design retained. |
| `scripts/test-connect-end-block-local.cjs` **new** | Actual isolated PostgreSQL and loopback authenticated REST tests; uses the existing clone/cleanup helper. |
| `__tests__/connect-end-block.regression.test.cjs` **new** | 48 current-code controller, transport, repository, ACK and worker regressions with injected ports. |
| `__tests__/connect-foundation.regression.test.ts` | SDK-success fixture supplies metadata; replaces the unsafe code-only16 success expectation with strict404/readback behavior. |
| `__tests__/connect-consent-revocation.regression.test.ts` | Successful mock provider returns the explicit acceptance receipt, preserving the commit-before-cleanup assertions. |
| `__tests__/connect-voice.interaction.test.tsx` | Supplies explicit unverified shutdown/null combined-action state in its existing view fixture. No new visible button. |
| `__tests__/connect-video-resolution.regression.test.cjs` | Records three intentionally evolved current sources separately from historical B2 provenance; additionally pins the original B2 receipt hash. Original request/manifest checks remain. |
| This report **new** | Implementation, validation and limits. |

Eleven existing files changed and eight files were added, including this report. No Live, Circle, Studio, package, app-config, original migration or historical report/evidence file changed.

## 2. SQL command and authority contract

The existing authority remains `public.blocks`. Existing relationship invalidation, pair locking, terminal transitions and `private.connect_provider_jobs` are reused. The new JSONB `private.connect_sessions.end_block_requests` stores at most one action receipt per participating actor; it is **not** a block decision table. Every receipt rechecks the actual block row.

`private.connect_config.end_block_enabled` defaults to false. A constraint prohibits enabling it for the production environment. Fresh preparation/writes require this flag and local/staging environment; previously committed receipts remain readable/replayable while disabled. Existing calling/provider/voice/video flags were never enabled in the app database. The disposable tests enabled only this new flag, not those calling flags.

| RPC | Inputs and behavior |
|---|---|
| `rpc_connect_end_block_context` | `p_call`, expected peer **profile** UUID, exact `created_at` generation. Derives `auth.uid()`, verifies call membership/current profile-to-account bindings, acquires the established pair lock, re-reads/locks the session and returns canonical actor/peer account IDs, immutable call/media/authorization binding and the current own-block-row/revocation watermark. |
| `rpc_connect_end_call_and_block` | Same binding, UUID request key and the unchanged prepared JSON context. Rejects wrong actor, target account, peer, generation, extra/different immutable context or changed initial block/revocation baseline. Uses an existing block row or performs a plain INSERT; no blind upsert or generic duplicate-key success. Ensures terminality/end work and stores the action's exact block-row identity in the same transaction. |
| `rpc_connect_end_block_status` | Authenticated, call-bound read. Returns only this actor's recorded action, checking the original block row and durable work. No block is inserted and no baseline is renewed. |

All public functions explicitly revoke PUBLIC/anon/service-role execution and grant only authenticated execution. Private helpers are not callable by authenticated clients. The definer functions derive the actor from authentication and check both participant mappings; they do not trust a client actor field. They do not require an active match, continuing grant, selected answering device or enabled real-calling flags to withdraw access.

The call UUID and exact server creation timestamp identify its generation; expected profile/account/media/authorization/grant values bind the prepared context. A mutable call version is not used to defeat a concurrent safety withdrawal. Generation strings retain server precision; the client does not round-trip them through a new JavaScript Date.

For a fresh block, existing BEFORE/AFTER block triggers revoke relationship authority and terminate affected calls. For an already-present block or an already-terminal requested call, the command explicitly ensures terminality and end work. An ordinary pending/working enqueue preserves its worker lease. First use can requeue an old completed end obligation; an idempotent replay only observes state and does not requeue or reset work.

The response separates `block=saved|no_longer_saved`, `call=terminal`, `provider=pending|acknowledged|unconfirmed`, and `media=unverified`. A pending create keeps cleanup pending even after an earlier end acknowledgement. `acknowledged` is qualified control completion, **not media cessation**. A replacement block row makes the old action `no_longer_saved`; this means that original row/action is obsolete, not proof that no newer account block exists.

### Retry, unblock and concurrency

- The same key/context observes the original action. A different key cannot silently substitute for an already committed action on that actor/call.
- If the original block is deleted, replay returns `no_longer_saved` and never inserts it again. A replacement row cannot be credited to the old action.
- If block/unblock occurs between preparation and the first command, the own-block identity or pair revocation watermark differs and the command rejects. Existing block rows are locked so a direct DELETE is ordered against the command's observation.
- After preparation failure, the controller **does not fetch a fresh baseline under the old intent**. After command failure, it reuses the same context/key or reads status; it never silently renews authority after an unblock.
- Ordinary end/block operations use the existing pair-lock order and terminal states stay absorbing. Unblock does not resurrect an old call ID or revoked relationship proof.

Real PostgreSQL tests exercised these cases, including simultaneous connections and an injected failure after trigger work. Block, terminal state and outbox writes rolled back together. This does not establish an atomic transaction with Stream.

## 3. Local shutdown and controller behavior

`VoiceTransport.leave()` may return a structured `LocalShutdownResult`. Microphone, camera, publication, playback and subscriptions each carry `pending|verified|unverified|failed`; SDK leave and resource release carry `pending|completed|failed|not_owned`. The full-local predicate requires every media axis verified and both ownership operations completed.

`StreamVoiceTransport` starts microphone/camera stop and SDK leave independently. A stalled stop cannot suppress the other attempts. Owner release follows leave completion/failure. Failures remain in the result. Successful SDK promises without an owner inspection leave capture/forwarding/playback facts **unverified**. Missing/invalid/throwing inspection cannot produce verified evidence. The current application supplies no real native owner/inspection implementation.

Concurrent cleanup shares pending work. Late SDK join completion runs stop operations again; a successfully released lease is not released twice. Starting another call generation cannot borrow the old shutdown result. These properties are exercised through mock bindings, not a physical microphone/camera test.

The default-off `VoiceController.endCallAndBlock()` retires its generation and prevents stale credential/refresh/join callbacks, invokes shutdown immediately and dispatches authority work without awaiting leave. A throwing/hanging local operation cannot prevent the block command. Duplicate taps share the in-flight action. Read-only `refreshEndBlockStatus()`/existing polling can observe later worker acknowledgement or a changed block row without another write.

The view independently exposes `localShutdown` and `endBlock.block/call/provider/media/error`. A saved block does not change failed/pending local evidence; a provider ACK does not manufacture media verification. An uncertain database reply does not become a saved block. Logout/dispose discard late callbacks and never retarget the old intent to another account.

Ordinary `hangup()` remains a separate action and does not insert a block. Its local shutdown also no longer gates server end dispatch. UI phase `ENDED` is a lifecycle/rendering state, not a verified media statement; the structured safety axes are authoritative for that distinction. No End Call & Block control was exposed in production, and `voice-preview` remains a fake preview with no authenticated native composition.

## 4. Provider end and durable acknowledgements

The adapter now verifies expected application identity/auth settings before end, without requiring unchanged call-type feature policy to perform cleanup. It targets the validated Connect UUID/type using the existing server SDK port.

| Observation | Implemented result |
|---|---|
| Numeric2xx plus expected nonempty SDK duration body | Typed `accepted`, bound to type/ID, with `mediaEnforcement=unverified`. |
| Numeric404/code16 on end, followed by fresh same-app/type/ID server GET404/code16 | Typed `absent`; object absence only. |
| HTTP401/403, including contradictory code16 | Unconfirmed `permission`; durable failure path remains pending. |
| HTTP408/code23 | Unconfirmed `timeout`; unknown commit effect. |
| Code-only16, string status/code, missing/malformed body, 429/5xx, contradictory readback or generic wrapped timeout prose | Unconfirmed `ambiguous`. No coercion or inference from provider prose. |
| Successful end but media effect unmeasured | Always unverified; no packet-cutoff assurance is created. |

The pinned SDK can lose transport error detail. An unidentifiable timeout remains ambiguous rather than being guessed from message text. App mismatch prevents issuing end. A404 end followed by a successful GET is also ambiguous, not verified absence.

The **existing worker** requires the typed bound acknowledgement before requesting successful completion. Its literal-true database ACK, current lease, stale-create compensation, end retry/backoff and occupancy fences remain. A missing acknowledgement cannot discharge end work. End still survives deletion of Auth/session rows because the durable job owns the validated call identity.

No Stream block/kick/user-block operation or participant permission grant was added. The account-level block is Betweener's persisted authority; durable call end is the minimum provider operation from Report37. A scoped exclusion fallback would require separately reviewed semantics, target persistence and acknowledgement handling. No supported autonomous hostile-peer revocation bound has been established by this source repair.

## 5. Executed validation

Artifacts are under `tmp/connect-end-block-38/`; the final source/evidence inventory and preservation results are in `final-verification.json`.

| Check | Final result / exact scope |
|---|---|
| Current Connect/media/relationship plus new end/block regressions | **338/338 PASS**, zero failures/skips/TODO: the17-file historical selection plus the new48-case file, executed against current source. `connect-combined-final.log`. |
| New PostgreSQL/REST checks | **22/22 PASS**, actual PostgreSQL17 disposable schema clones and loopback authenticated PostgREST. `database-final.log`. No mocked database replacement. |
| Existing relationship database assertions | **88/88 PASS** in each clone before the new migration; helper prerequisite, separate from the22 new checks. |
| React Native presentation regression | **7/7 PASS** at the original Jest timeout. `interaction-repeat.log`. No real native session. |
| Expo TypeScript | `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit`: **PASS**, exit0. |
| Strict cached Deno check | Provider-end, adapter and worker: **3/3 PASS**, Deno2.5.4, `--no-remote --no-lock --deny-import`, pinned server SDK0.7.63. Compilation only. |
| Targeted ESLint | **PASS**, zero warnings; explicit `--no-ignore` includes the otherwise ignored Edge shared sources. Repository lint configuration unchanged. |
| Live isolation | `node scripts/verify-live-environment-isolation.cjs`: **PASS**; staging/production isolated, no secrets printed. Live/Circle/Studio source baselines unchanged. No full Live suite rerun. |

Main commands:

```powershell
$endBlockFiles38 = @((Get-Content -LiteralPath tmp/connect-analytical-hardening-32/media-truth-offline-status.json -Raw | ConvertFrom-Json).files) + @('__tests__/connect-end-block.regression.test.cjs')
node --no-warnings=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test --test-reporter=tap @endBlockFiles38
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/test-connect-end-block-local.cjs
node --no-deprecation node_modules/jest/bin/jest.js --runInBand --config jest.config.js __tests__/connect-voice.interaction.test.tsx
```

The SQL tests cover default-off/direct-write denial, production enablement constraint, grants/private-helper denial, exact actor/account/target/generation binding, duplicate keys, existing blocks, intervening unblock/replacement, concurrent requests/end/delete, transactional rollback, real credential-admission denial, stale leases, outstanding creation and authenticated REST isolation. Local provider operations remain mocks; the SQL service completion test supplies a synthetic control ACK and does not contact Stream.

Initial failures were retained and repaired: six focused regressions exposed legacy void/code16 fixtures and a delayed-join cleanup cache problem; the latter was an implementation defect and stop operations now run again after a late join. TypeScript caught the presentation fixture's missing new fields. Initial lint warned that three Edge files were ignored; the final explicit selection checks them. An initial332-case run failed one historical/current source-hash assumption; the test now records only three specifically changed sources as evolution and additionally pins the original B2 receipt, while preserving request/manifest checks. The first UI run timed out one case under parallel load; an identical standalone rerun passed all7 at the unchanged timeout. **No remaining failure is accepted as a PASS.**

Historical offline34/37 source-counterexample probes and all analytical classifier files/logs are preserved; they encode the pre-repair behavior and are not counted as current functional acceptance. The old290/290 and84/84 receipts were not rewritten. Historical security thresholds, Report18's negative result and B3's INCONCLUSIVE result remain intact.

## 6. Isolation and preservation

The existing local-only helper creates a uniquely named `betweener_connect_security_test_<pid>` database from a schema-only local baseline and a temporary REST container using a fresh synthetic JWT secret. The migration and fixture writes target that clone. No credential environment file, hosted Supabase API or Stream client is used. The helper removed both disposable resources after testing. A final read-only local query confirms zero disposable databases, no new RPC in the app database and no Connect schema installed there; no test REST container remained.

Of **2,400 baseline repository files/absences**, **2,389 are unchanged** and the11 related files listed above changed intentionally. All unrelated dirty work, including the pre-existing deleted migration, is preserved. Of534 previously protected records,530 match and four current source/test hash entries changed intentionally: consent/foundation/video-resolution regressions and the adapter. **All historical reports, manifests, receipts, approvals, locks, cleanup evidence and ledgers match.**

Prepared B3 source provenance is now stale because authorized source changed. It was not regenerated or represented as new execution permission. Consumed B1/B2/B3 records were not reused or reset. Report18's raw receipt remains `8c1d82141a5c5140c94ac2b65e2b09dca42ebbe1f0f8c87b852d6dacdffa501d`; B3's raw receipt remains `0dcb9e021be24ae8cebf105938c11155a859013f619892f1663209149d077b55` and canonical wrapper remains `ef7dd20af2b379003132d4ab4d3a2743cbd914a6525db6ef3f13a64425ce11f9`.

The installed CLI generated the migration file; no original migration was edited and no CLI upgrade was performed. Docker access used the verified local named-pipe daemon. Local tool permission handling did not authorize a hosted command or reveal credentials. No source change outside Connect and its tests was needed.

## 7. Remaining gaps and next scope

Local command/contract PASS does **not** mean native or provider enforcement PASS. There is no installed Auth-owned native factory/inspection implementation, physical capture/playback evidence, Stream call-scoped block measurement, current hosted configuration attestation or finite adversarial media-revocation bound. A malicious peer may ignore cleanup and retain existing credentials/membership when provider termination is unavailable. Ordinary JWT expiry is not asserted to disconnect it.

Recommended next review is the local code/migration contract and a separately authorized **device-only owner/shutdown harness**, without authenticated provider calls: verify actual tracks, publishers, subscriptions/playout and lease release; test interruption, hangs, account switch and stale callbacks. Keep native calling composition and all real calling flags off.

Any hosted step requires separate owner review. Deploying the new migration/RPCs, updating the Edge worker/adapter or enabling the new flag is **not authorized here**. No Stream role, call-type, Live/global setting change is required by this foundation. Provider capability clarification from Report35 remains necessary before designing a further media-enforcement experiment or claiming a release bound. No staging manifest, resources or execution approval were created.

```text
CONNECT_END_BLOCK_COMMAND = PASS
CONNECT_DATABASE_CONCURRENCY = PASS
CONNECT_LOCAL_SHUTDOWN_CONTRACT = PASS
CONNECT_PROVIDER_ACK_CLASSIFICATION = PASS
CONNECT_NATIVE_DEVICE_SHUTDOWN = NOT_VERIFIED
CONNECT_REMOTE_REVOCATION_BOUND = UNVERIFIED
CONNECT_M2A_SECURITY_GATE = BLOCKED
CONNECT_M2B_READY = BLOCKED
STAGING_MODIFICATIONS = NONE
PRODUCTION_MODIFICATIONS = NONE
```

PASS is scoped to the implemented local contracts and executed local tests. No authenticated Stream operation, provider fixture, hosted migration/configuration change, Live/Studio/Circle modification, real native call, build, OTA or deployment occurred.
