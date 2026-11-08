# Connect V1 M2C-0: revocation security contract

Date: 2026-10-30. Status: **proposed security specification, not implementation or release approval**. Scope: source/SDK inspection, isolated executable models and documentation. The [Stream enquiry](35-stream-media-enforcement-capability-enquiry.md) is drafted but **not sent**.

This translates [Report 33](33-connect-v1-revocation-architecture-decision.md) into requirements and decision criteria. **No numeric value for maximum authorization lifetime `L` or provider enforcement slack `e` is selected, assumed or approved.** Calling remains disabled. The live adapter, worker, grants, native owner, analytical classifier and historical evidence are unchanged.

## 1. Terms, scope and conditional bound

| Term | Required meaning |
|---|---|
| `T_action` | Observation of a legitimate user's local End, Block or Withdraw action. It starts local safety shutdown and an authenticated server intent; it does not prove server receipt or commit. |
| `R` | The authoritative **commit/serialization point** invalidating the applicable call, media consent, pair block or relationship generation. A client timestamp, transaction start, HTTP submission or optimistic UI update is not `R`. |
| `A_i` | Authoritative authorization point for permit `i`, serialized against revocation. A delayed signature/response cannot silently move this point forward or refresh its expiry. |
| `D_i` | Absolute expiry of permit `i`, fixed from its authorization point and subject to any earlier call/grant ceiling. It must not start anew on delivery, first join, reconnect, session restart or SFU migration. |
| `D` | Latest expiry among **all** still usable permits for the affected generation, across affected calls, identities, devices and sessions. An unbounded or bypass path prevents establishing a finite `D`. |
| `L` | Maximum lifetime permitted from authoritative authorization: `D_i <= A_i + L`. Symbolic and unapproved here. This is not the existing API JWT TTL or worker claim lease. |
| `e` | Provider-guaranteed maximum additional acceptance/forwarding enforcement delay, including explicitly bounded clock uncertainty and enforcement propagation. Symbolic and unverified here; not a percentile, SDK callback delay or arbitrary Internet delivery bound. |
| `B` | Product-approved maximum residual exposure measured from `R`. Two review proposals appear below; neither is accepted. |

For each valid permit, require `A_i <= R` and `D_i <= A_i+L`. Therefore:

```text
D = max(D_i) <= R + L
last prohibited media acceptance/forwarding <= D + e
residual authorization exposure <= max(0, D - R) + e <= L + e
product feasibility requires L + e <= B
```

This is a **conditional specification**, not a proved Stream property. It requires complete permit enumeration/coverage, reliable serialization, bounded comparable authority/provider clocks and provider enforcement independent of the failed Betweener control channel. If there is no permit, the gate must deny access; absence of a permit must not become an unrestricted fallback. If any prerequisite is unknown, no finite bound is established.

There is no unconditional finite bound from the tap itself when the revocation cannot reach the authority: exposure from `T_action` includes the unknown delay to `R`. Local shutdown must still protect that legitimate device without awaiting `R`. A successful early provider intervention may stop media sooner, but its ACK does not numerically establish that earlier cutoff.

The metric concerns new prohibited **acceptance and forwarding at the enforcement boundary**. Receiver delivery/playout, previously buffered content and an adversary replaying a recording are different matters. Do not include an unbounded network-delay or deletion-of-recordings promise in `e`. Future evidence must distinguish fresh content from old packets; this milestone creates no media experiment.

## 2. Normative security requirements

“Must” below specifies the proposed contract, not behavior already established in Stream.

| ID | Requirement / independently testable failure condition |
|---|---|
| **SC-1 Local action** | End stops this call locally. Block additionally persists the pair restriction; Withdraw invalidates the selected media/grant/current call as appropriate. Camera/microphone publication and local reception/playout must stop independently of server/provider response. UI closure alone is insufficient. |
| **SC-2 Authoritative denial** | Once `R` commits, subsequent admission/renewal authorization must deny the revoked generation. Matched calls require verified mutual proof, relevant preference and per-call acceptance. Pre-match additionally requires recipient-approved, directional, media-specific consent. Voice never grants video automatically. |
| **SC-3 Generation and race fencing** | Consent generation, call/CID, user/pair and intended media must be bound to permits and termination intents. An earlier authorization delivered after `R` retains its original expiry. A post-`R` cached decision, stale worker or signed renewal must not create a new valid lifetime. New consent uses a new generation/call, never reopens a terminal ID. |
| **SC-4 Absolute expiry** | The gate must enforce `D` on already established media, independent of client cooperation or refresh. Relative duration beginning at first join or message arrival is insufficient without a proven absolute ceiling. |
| **SC-5 Every path** | Expiry/revocation must cover all simultaneous devices, raw sessions, tracks, publication and reception. A per-user participant cap or a database-selected device is not proof of per-session enforcement. Stopping one device does not revoke another. |
| **SC-6 Credentials and rejoin** | Held credentials, valid alternate-issuer credentials and old SFU credentials cannot bypass permit expiry or terminality. First join, reconnect, new device, restarted session and migration must not reset expiry or regain access. Identity authentication is not renewed consent. |
| **SC-7 Outage behavior** | Authority unavailable: no fresh authorization or renewal from cached consent. Backend-to-provider failure: preserve authoritative denial and durable cleanup. Provider gate must already enforce expiry without receiving that failed end request. Explicitly identify whether Stream control/coordinator outages are covered while SFUs remain active. |
| **SC-8 Evidence and ACKs** | Keep local teardown, committed revocation, accepted provider control, observed absence and media-enforcement evidence separate. Timeouts and ambiguous responses retain an unresolved obligation. An SDK event, HTTP ACK or flat finite sample does not certify universal enforcement. |
| **SC-9 No escalation or automatic readiness** | A participant end capability must not add join-ended, create/update/member/permission, video, recording, screen or egress powers. No model, provider answer or diagnostic result changes security gates automatically. |

For Withdraw of video during an active VIDEO call, the minimum proposed policy is to end that call rather than attempt an unfenced live downgrade. A subsequent VOICE call requires its own applicable authority and acceptance. A recipient's future-incoming-call preference and current-call withdrawal remain distinct; the current preference RPC is not a universal active-call revoke.

### Two product budgets for future owner review

These numbers describe **candidate product budgets `B` only**. They do not configure a timer, assign `L`/`e`, approve residual exposure or change an experimental threshold.

| Proposal | Candidate maximum from `R` | Usability and operational consequences |
|---|---|---|
| **P — tighter budget** | `B_P = 5 seconds` | Less tolerated residual access, but feasible only if the supported provider lifetime plus guaranteed slack fits. Likely requires more frequent authority renewal, less outage grace and more call interruptions/false safety shutdowns on mobile networks. Reject if provider minimums/slack cannot meet it. |
| **Q — wider budget** | `B_Q = 30 seconds` | More room for renewal latency and transient outages, potentially lower renewal load and fewer interrupted conversations. Explicitly tolerates materially longer post-commit exposure; it is not “immediate” revocation and requires separate owner/security acceptance. Still needs autonomous enforcement. |

Neither proposal may be selected from a successful test alone. Provider-supported lifetime ranges, clock assumptions and a finite worst-case `e` must first be documented. Then review `L+e <= B`, renewal margin, capacity/rate limits, false shutdown rate and safety wording. A renewal interval must leave documented margin before `D`; no interval or numeric margin is chosen here. More permissive network retry cannot extend an already issued absolute deadline. If neither budget is feasible/acceptable, remain disabled or review another media architecture.

## 3. Current source and pinned end/ACK semantics

Sources inspected:

- `supabase/functions/_shared/connect-stream-adapter.ts:126`: `end()` awaits the SDK port and swallows errors when `Number(error.code) === 16`.
- The same adapter `:130` requires **numeric** code 16 and `metadata.responseCode === 404` in its media-observation missing-call path.
- `connect-provider-worker.ts:13` treats a resolved end as successful control work, then requires database completion. `connect-consent-revocation.ts:9` commits revoke before attempting cleanup and reports pending work separately.
- `connect-credential-issuance.ts:17` retains both affirmative admission fences; `20261029081013_connect_forensic_repair_1.sql:4` preserves committed invalidation on a denied admission. These are unchanged.

Pinned server SDK **0.7.63** source under `%LOCALAPPDATA%/deno/npm/registry.npmjs.org/@stream-io/node-sdk/0.7.63/`:

| Source | Observed contract |
|---|---|
| `src/gen/video/CallApi.ts:168`, `VideoApi.ts:521` | End sends POST `/api/v2/video/call/{type}/{id}/mark_ended`. |
| `src/ApiClient.ts:71`, `src/types.ts:13` | HTTP status is retained as `metadata.responseCode`; errors also carry provider `code`. |
| `src/gen/models/index.ts:9637` | `EndCallResponse` contains `duration:string`; SDK response adds HTTP metadata. There is no packet-termination timestamp or enforcement proof. |
| `src/ApiClient.ts:107` onward | Generic transport/JSON failures can lose the original response status when wrapped. A timeout is not reliably identified just by the resulting message or missing code. |

The official error table distinguishes 404/code16 from 401 authentication, 403 authorization and 408/code23 timeout. The pinned source, rather than newer generalized documentation about SDK envelope fields, controls the implementation review. [Stream error codes](https://getstream.io/docs/platform/api-error-codes/).

### Minimal proposed correction, not applied

Necessary first change at the existing catch is:

```ts
catch (error) {
  const e = record(error);
  if (e.code !== 16 || record(e.metadata).responseCode !== 404) throw error;
  // This is a scoped absence report, not a media-cutoff assertion.
}
```

That exact guard removes numeric coercion and aligns error qualification with `media()`. **The guard alone is not the complete six-outcome contract.** A future adapter/worker boundary must also preserve a bounded typed result rather than allowing every resolved `Promise<void>` to mean the same thing. No such adapter/worker/type change is installed here.

Proposed result fields: immutable expected application/CID/generation, request/attempt identity, parent observation bracket, outcome/reason enum, numeric HTTP status/code when known, provenance class and `mediaEnforcement=UNVERIFIED`. No raw headers, tokens, provider prose, SDP or full URLs belong in this receipt. A direct-client observation must not become trusted server evidence through an unauthenticated client report.

| Outcome | Minimum qualifying observation | Required disposition |
|---|---|---|
| **END_ACCEPTED** | Successful pinned SDK end response, matching operation/request/scope, numeric 2xx metadata and expected decoded body | Provider control acceptance acknowledged; **media termination unverified**. Not a server enforcement timestamp. |
| **CALL_ABSENCE_VERIFIED** | Strict POST404/code16 followed by a fresh, correctly scoped, server-authenticated GET404/code16 for the expected call, with known application identity/resource visibility | Provider object absence observed. Never equate object absence with every SFU flow stopped. Ordinary-client/opaque/wrong-app 404 cannot qualify. |
| **AUTH_REJECTED** | Known HTTP401 or 403 on the scoped operation/read | No success completion. Preserve obligation; investigate credentials/permissions without logging them. Contradictory code16 cannot override HTTP auth rejection. |
| **TIMEOUT_UNKNOWN_EFFECT** | Trusted local request-deadline observation, or documented HTTP408/code23 | Request may already have committed; no automatic failure or success inference. Preserve intent and reconcile idempotently when possible. |
| **AMBIGUOUS** | Network failure, 429/5xx, malformed/unexpected body, missing/string/coerced status/code, unknown scope, missing absence confirmation or mismatched/stale receipt | No acknowledged completion. Retry/reconcile under existing durable ownership; do not recreate the call or clear occupancy to escape uncertainty. |
| **End acknowledged, enforcement unavailable** | Any accepted-end result without independent sufficient enforcement evidence/contract | A separate evidence state, not a new successful transport outcome. Default remains `mediaEnforcement=UNVERIFIED`. |

The extra GET is a **proposed control-evidence refinement**, not an operation performed here or permission to run a probe. Its interpretation remains subject to Stream confirming absence/visibility semantics. A matching strict absent GET already acquired by trusted reconciliation can serve the same purpose; it must be fresh, bound and after the attempt. A non-404 end failure must not be silently laundered into accepted-end by an unrelated GET.

Successful control resolution must still pass the current database job-lease and literal-true ACK fences, and account for outstanding create work. Occupancy release remains a separate safety-policy decision; neither this proposal nor an accepted control request establishes absence of overlapping media. No security gate is advanced and no “media confirmed stopped” state is synthesized.

### Regression contract and actual offline results

The permanent [isolated test file](offline-34/m2c0-security-contract.test.cjs) has **no runtime exports**. It loads only the pure current adapter/worker with mock ports for the baseline counterexample; proposed models are private test helpers. It imports no analytical classifier, credential-reading provider or SDK client. A fetch tripwire observed zero network attempts.

| Case group | Assertions / result |
|---|---|
| Existing behavior | Unchanged adapter resolves code-only 16, string `"16"`, synthetic code16/401 and code16/503. A mocked current worker can consequently acknowledge successful control work. These are **source-backed synthetic counterexamples**, not observed malformed Stream responses. |
| Proposed positive control results | Matching 200/201 remains acceptance only; strict POST and subsequent scoped server GET404/code16 produce object-absence evidence only. |
| Auth / timeout / ambiguous | 401/403 take precedence over contradictory codes; trusted local and 408/code23 timeouts stay unknown-effect. Prose-only timeout, string fields, missing metadata, 204 without the pinned JSON body, contradictory 2xx error body, rate limits and 5xx cannot certify success. |
| Binding / readback | Wrong app/call/generation/route/request, unknown application provenance, ordinary-client report, old/inverted bracket, existing-call read, unauthorized or timed-out read cannot certify absence. |
| Symbolic lease prerequisites | Withhold any required all-device/direction/issuer/clock/outage/fencing condition and the bound is unproven. Symbolic cancellation establishes only `D-R+e <= L+e`; late relative-on-arrival renewal retains an arbitrary delivery-delay term. No numeric `L` or `e` is assigned. |
| Local safety and grants | UI closure, partial teardown, stale events and malformed receipts do not create remote/local success; reordered valid observations remain independent. Grant diff is exactly two `end-call` additions; current product validator still rejects it. |
| Paper gate | Unsupported/missing answers cannot authorize execution. Complete cited answers allow only proposing a separately reviewed verification scope; bound and runtime gates remain unchanged. |

## 4. Future native safety state machine

Use an **orthogonal state vector**, not a single “ENDED means safe” flag. Bind every event to the authenticated owner, application/CID and termination generation/intent. State transitions below are a specification and executable model, **not an installed native controller**.

| Axis | States and transition requirements |
|---|---|
| **Local privacy** | `STOPPING` -> `STOPPED_VERIFIED` only after applicable microphone/camera tracks are stopped, publication transports closed and local subscription/playout stopped. Missing resource confirmation -> `STOP_UNVERIFIED`; explicit failure -> `STOP_FAILED`. A resource never acquired can be recorded as verified not active, not silently assumed stopped. Recovery requires fresh verification, not screen closure. |
| **Server authority** | `REVOCATION_PENDING` -> `REVOCATION_COMMITTED` only from authenticated matching committed authority, with generation/version evidence. A lost reply may conceal a commit; remain pending until reconciliation. Provider ACK does not supply `R`. Committed denial cannot be undone by a delayed pending response. |
| **Provider control** | `TERMINATION_PENDING` -> `END_ACKNOWLEDGED` or `CALL_ABSENCE_VERIFIED` only through the qualified observations above. Rejection/timeout/ambiguity remain unresolved control work. A direct SDK ACK is a local observation; backend completion requires trusted reconciliation. |
| **Media evidence** | `ENFORCEMENT_EVIDENCE_UNAVAILABLE` by default. Local teardown, server commit, provider ACK, object absence, socket close and finite quiescence do not automatically replace it. No future “verified” transition is authorized by this milestone. |
| **Local admission/reconnect** | Retire this local call generation as soon as the end intent starts. Refresh/rejoin/resume cannot automatically reopen it or restart capture; another call requires new authority and consent. |

State progression is independent: server commit and provider ACK can arrive before local teardown finishes; local shutdown can succeed while both remote axes remain pending. A shutdown failure remains visible even if a later provider ACK succeeds. Deduplicate exact observations, reject wrong-call/generation events, and do not reset a committed fact using stale responses. Already received content cannot be recalled.

| Actual state combination | Permitted UI meaning |
|---|---|
| Local stop verified; authority/provider pending | “Your microphone and camera are off. Confirmation is pending.” Only mention resources actually verified. |
| Local stop unverified/failed, regardless of remote ACK | “Local media shutdown could not be confirmed.” Provide a native privacy recovery path; do not claim the device is off or safe. |
| Authority committed; provider pending | “Consent withdrawn in Betweener. Connection shutdown is pending.” For Block, only say blocked after committed block. |
| Provider acknowledged; authority still pending | “Stream acknowledged the end request. Betweener confirmation is pending.” Never claim the block has persisted. |
| All control acknowledgements present; media evidence unavailable | “End acknowledged.” Do not say “secure termination verified” or “all media stopped.” |

OS call UI dismissal is local UX, not provider enforcement. Future iOS/Android work must test capture release, background/interruption/account-switch behavior, discarded playout and stale callback suppression. No native shutdown deadline or numeric grace period is chosen here.

## 5. Direct participant end: exact proposed policy delta

Current grants are enforced by `connect-stream-adapter.ts:35` and retained in `stream-staging-connect-validation.json:46`. Existing admitted roles can join/publish, but cannot end. The narrow proposed change is:

```text
connect_invited = [read-call]                         unchanged
connect_voice   = [read-call, join-call, send-audio, end-call]
connect_video   = [read-call, join-call, send-audio, send-video, end-call]
all other roles/grants/settings                       unchanged
```

Only add **`end-call` to the two already admitted membership roles on `betweener_connect`**. Do not add it to global `user`, `admin`, generic `call_member` or invited roles; do not issue admin or auto-membership call tokens. Keep denied create/update/settings/member/permission/ended-join/capture/egress powers denied. The current validator rejects this proposed delta, and it has not been changed.

The installed client `node_modules/@stream-io/video-client/src/Call.ts:3272` implements `endCall()` as POST `mark_ended`; provider permissions require `end-call`. Call roles and application roles jointly affect effective capabilities. [Stream end operation](https://getstream.io/video/docs/api/calls/), [role/capability model](https://getstream.io/video/docs/api/call-types/permissions/).

| Boundary | Required interpretation |
|---|---|
| Own approved call | Role assignment must follow server admission and exact pair/binding verification. Honest client targets its bound call. No participant may assign their own role. |
| Wrong call / historical membership | No corresponding role/member authority means the added Connect grant supplies no end access. **It is not cryptographically limited to one UI instance or device**: an identity still holding that role on another call can exercise that role there too. Historical membership/retroactive type-policy effects must be reviewed before any future change. |
| Revocation race | A stale member may remain able to end a call after Betweener denial has committed but not reached Stream. Ending is fail-safe; this does not authorize join/reopen/publication renewal. Do not claim current DB consent is synchronously rechecked by the direct API. |
| Expired credentials | The direct request may fail even while an existing SFU session remains. Do not extend or bypass authentication solely to make this path appear reliable. Local shutdown, durable server cleanup and the unresolved provider expiry requirement remain independent. |
| Blocked users | Provider-side block can prevent the participant request. Do not unblock/regrant to send it; use the trusted server cleanup path. Unknown block status is not an availability guarantee. Betweener pair block and Stream call/user blocking are distinct. |
| Live | No Live type, global role or issuer change. A valid same-app Live-issued token for the same subject may exercise surviving Connect membership; it is not necessarily restricted by its Live call claims. Verify effective scope before a future policy change; do not use the old outsider-token test as proof for a former Connect member. |

This is a second **request-delivery path**, independent of Betweener backend availability only when the client can still authenticate and reach Stream. It is not independent of Stream control ingress and cannot replace the absolute expiry contract. For voice, this delta adds no video power. A participant can terminate their approved conversation, not change the other participant's capabilities or create a replacement call. Call tokens can add access rather than narrow other memberships. [Stream authentication](https://getstream.io/docs/platform/authentication/).

## 6. M2C-1 paper decision gate

The enquiry in Report 35 asks eight capability questions. Answers must identify supported endpoint/schema/configuration, applicable custom type and SDK versions, exact enforcement scope, maximum rather than percentile delay and explicit fault exclusions.

| Provider answer | M2C-1 decision |
|---|---|
| Documented autonomous absolute expiry covers existing SFU credentials, all devices/directions/rejoin/restarts, delayed renewals and the required control outage; finite worst-case slack and clock assumptions supplied; supported API/configuration references resolve | **A narrowly scoped capability-verification proposal may be prepared for separate review.** First compare supported ranges with the candidate budgets and obtain owner/security budget selection. This answer alone authorizes no operations, fixtures, setting changes or integration. |
| Positive but incomplete, marketing wording, SDK-only cleanup, metadata-only ending, unspecified maximum slack, uncertain reset/fencing or unresolved versions | **Clarification required; remain disabled.** Do not design another diagnostic experiment to guess the missing contract. |
| Only relative/session-start timers with reset escape, only cooperative-client enforcement, expiry requires the failed control path, or unsupported all-session scope | **Current requirement not met.** Remain disabled; review another enforcement architecture if clarification cannot close the gap. |
| Works only after changing to a broad built-in type, changing Live/global roles, undocumented fields or an unreviewed SDK/API change | **Not an acceptable current configuration.** Separate architecture/security review required; no shortcut under this gate. |
| Supported bounds cannot meet either acceptable owner-reviewed budget | **Remain disabled or review another media architecture.** Do not quietly widen the budget or choose a smaller assumed `e`. |

Even a complete written contract is not release verification. A later capability-verification scope would require new concrete authorization and ownership controls; none is designed or approved here. Reports 18–33 and B3 remain historical evidence. No existing execution allowance can be reused.

## 7. Focused validation and exact selection reconciliation

Fresh command:

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --test-reporter=tap docs/betweener-connect/offline-34/m2c0-security-contract.test.cjs
```

**69/69 PASS**, zero failed/cancelled/skipped/TODO, exit 0. Log: `tmp/connect-m2c0-contract-34/focused-final.log`. Syntax check and targeted ESLint of this new test file pass, zero warnings. Its private helpers are test models, not a new provider validator, termination implementation, security classifier or native integration. They do not establish provider behavior; even the positive symbolic bound returns **CONDITIONAL_ONLY**, never VERIFIED. The generated case receipt records no numeric lifetime/slack selection and zero network attempts. The initial run passed 68 cases; final review added the explicit resource-visibility prerequisite and its negative case before the final run.

```powershell
node --check docs/betweener-connect/offline-34/m2c0-security-contract.test.cjs
node node_modules/eslint/bin/eslint.js docs/betweener-connect/offline-34/m2c0-security-contract.test.cjs --max-warnings=0
```

Both exit 0; logs are `syntax-final.log` and `lint-final.log` in the same local artifact directory. Preservation, document-link checks and retained-baseline hashes are recorded in `tmp/connect-m2c0-contract-34/final-verification.json`.

The existing results below were **hash-verified and read, not rerun or relabeled as fresh M2C-0 acceptance**:

| Retained selection | Exact reproducible selection / result |
|---|---|
| Hardened analytical tests | `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --test-reporter=tap docs/betweener-connect/offline-32/ported-review.test.cjs docs/betweener-connect/offline-32/hardening.test.cjs` — **84/84**, zero TODO; preserved `hardened-final.log` and Report 32 receipt. No import or extension in the new suite. |
| Original Media Truth/Connect/relationship suite | `node --no-warnings=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test <the 17 files in tmp/connect-analytical-hardening-32/media-truth-offline-status.json>` — **290/290**, zero TODO; preserved log/receipt. This is not the 84-test analytical selection. |
| Live package selection | `npm.cmd run test:live-logic` — **56 files, 504/508 passing, four failures**. Report 33 executed the identical explicit Node flag/file list. |
| Expanded Live selection | `node --no-warnings=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test <sorted __tests__/live-*.regression.test.ts files>` — **60 files, 509/514 passing, five failures**. |

To reproduce the exact retained 290-case selection without ambiguous shell globbing:

```powershell
$connectOfflineFiles = @((Get-Content -LiteralPath tmp/connect-analytical-hardening-32/media-truth-offline-status.json -Raw | ConvertFrom-Json).files)
node --no-warnings=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test @connectOfflineFiles
```

For the expanded Live selection:

```powershell
$liveAuditFiles = @(Get-ChildItem -LiteralPath __tests__ -Filter 'live-*.regression.test.ts' | Sort-Object Name | ForEach-Object { $_.FullName })
node --no-warnings=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test @liveAuditFiles
```

Live's shared four failures remain `Live catalogue waits for real auth and reloads after auth recovery`; `screen-only Program output follows the selected canvas and offers a focused view`; `audience Program output exposes no Studio access or private matching data`; `standard Room Pulse keeps a curated, readable note preview`. Expanded additionally runs/fails **`credential refresh first proves the active compositor lease`**, `__tests__/live-phase-c2-compositor.regression.test.ts:29`, omitted from the package script. The two selections are not nested; the net six-test difference is not solely that file. Report 33's exact file/argument arrays, logs and reconciliation remain under `tmp/connect-revocation-architecture-33/`. Neither Live selection is green, and no Live fix/test execution was performed in this milestone.

## 8. Preservation and next action

Only this document, Report 35 and the isolated contract test were added to the repository. All **2,395 baseline files/absences and 526 protected source/artifact/log records** remain unchanged, including Reports 18–33, the current adapter/worker/role checks, offline classifiers, all 73 prepared B3 sources, 434 artifacts and consumed approvals/ledgers. Original B3 verdict remains **INCONCLUSIVE**. Report 32's receipt remains SHA-256 `164fa0914dcfeb1b4616ec96bfd889bc71d9ea6c4a9bffc30c5f6a6931fb6afb`; Report 33 remains `9470d9e6bfce47adac9211f98d71aa037c1335f6dddb8c9d9898456d3c82d1ad`.

No authenticated Stream operations, Supabase/database operations, provider users/calls, role/configuration changes, native integration, production modification, migration, build, deployment or OTA occurred. No support communication was sent. Public documentation browsing is separate from provider application access. The strict catch correction, typed results and state machine are **proposals only**.

Next: owner/security review of the specification and unsent enquiry, followed by explicit authorization if the enquiry should be sent. Obtain the missing supported provider contract before defining any new diagnostic execution. Budget selection, `L`/`e`, implementation and provider capability verification remain unapproved.

```text
CONNECT_FINITE_REVOCATION_BOUND = UNVERIFIED
CONNECT_M2A_SECURITY_GATE = BLOCKED
CONNECT_M2B_READY = BLOCKED
CONNECT_RUNTIME_INTEGRATION = NOT_AUTHORISED
PROVIDER_WRITES = NONE
PRODUCTION_MODIFICATIONS = NONE
```
