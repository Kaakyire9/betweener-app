# Connect V1: revocation boundary decision

Updated: **2026-10-29**, after the explicitly approved three-call experiment. Stream app **1731011, Betweener Staging**. Real calling remains disabled. Experiment approval did not accept a release duration or revised security policy.

## Decision

The confirmed failure is **D: Stream still accepts media access after Betweener revokes authorization** when the backend end operation fails. The canonical harness throws locally **before sending the Stream end HTTP request**. It narrowly models a failed backend termination path (A); it does not demonstrate a Stream control-service outage (B), a media outage (C), or a lost termination obligation (E).

Immediate adversarial revocation cannot be guaranteed through an enforcement channel that cannot deliver the revocation. Stream has not learned the new authorization state, so its existing membership/capabilities still authorize the participant. Retry correctness cannot remove this information gap. Healthy-path termination and durable retries remain necessary, but cannot certify immediate revocation during this fault.

The approved 60-second per-call timer **marked its call ended without stopping observed received audio within the measurement window**. Both raw subscribers continued receiving audio after the deadline and after provider GET reported `ended=true`. Normal backend end behaved differently: received counters stopped while raw senders continued. Timer metadata is therefore insufficient for the proposed security fallback. No shared timer was enabled, and all experimental calls have been deleted.

```text
CONNECT_CONTROL_PLANE_FAILURE_CLASSIFIED = PASS
CONNECT_SERVER_SESSION_TIMER = FAIL
CONNECT_ENDED_CALL_REJOIN_DENIAL = PASS
CONNECT_REVOKED_MEDIA_TERMINATION = FAIL
CONNECT_POST_REVOCATION_EXPOSURE_BOUND = UNBOUNDED
CONNECT_M2A_SECURITY_GATE = BLOCKED
CONNECT_M2B_READY = BLOCKED
```

`CLASSIFIED=PASS` identifies the recorded local fault; it does not certify an actual provider outage. `SERVER_SESSION_TIMER=FAIL` concerns its tested use as an autonomous media cutoff: accepting the setting and marking ended worked, but received-media termination was not achieved within the observed window. It does not assert that media would continue forever. Ended-call denial passed for held and freshly minted valid ordinary JWTs after actual backend end acknowledgements on the normal and revoked controls; timer-only rejoin was not isolated from subsequent recovery. `UNBOUNDED` describes the current shared configuration, which still has no enforced finite media deadline. The experimental timer's upper bound is **unverified**, and the empty-session restart probe is **inconclusive**.

## Canonical reproduction and evidence

Source: [sanitized M2A provider receipt](stream-staging-connect-m2a-closure-evidence.json), `integrated` section, run beginning **2026-10-28T14:46:49.313Z**. This is retained real-provider evidence, not a new execution in this investigation. Reports [13](13-connect-v1-m2-security-validation.md), [14](14-connect-v1-m2-voice-implementation.md), [15](15-connect-v1-m2-device-test-plan.md) and [16](16-connect-v1-m2a-security-closure.md) were reviewed; report 17 is absent.

1. Establish independent pre-match VOICE consent and acceptance using the real authorization RPCs in an isolated local database. Create a server-owned Stream call with two least-privilege fixture members; mint ordinary Stream user JWTs.
2. Set the harness end-port failure switch. In `scripts/lib/connect-stream-closure-worker.ts`, `scopedCall.end()` throws before `call.end()` is invoked. The shared production worker/revocation code still handles the failure and persists the end obligation.
3. Revoke the grant through the actual consent-revocation path. Betweener commits revoked authorization and `ENDED`; fresh create/admission is denied. Two occupancy rows remain reserved while the end job is pending/retryable.
4. With a held ordinary JWT, Stream coordinator `/join` returns **201** and `read-call`, `join-call`, `send-audio`. Actual SFU join is acknowledged; audio receives a publisher SDP answer and connects; recorded outbound audio is **630 bytes / 9 packets** after revocation.
5. Restore the end port and process the durable job. Actual Stream end is acknowledged; the same held-token join returns **403 / code 17**, occupancy becomes zero, and a remote call-ended event is observed.

The separate healthy-revoke fixture completed in approximately **1,030 ms**, denied both held participants with 403/17, and delivered call-ended events to both. This is one observed latency, not an outage latency bound or service guarantee.

The later non-cooperative raw peer snapshot records `connected`, **6,906 bytes / 87 packets**, and `callEndedObserved=true`. These are cumulative **sender** counters. The receipt does not establish how many bytes were sent after the end acknowledgement, or whether the SFU forwarded any such bytes. A browser that continues sending after a remote event is not evidence of post-end receiver delivery. The approved follow-up measured both receivers without closing the peers on end.

## Approved experiment: actual results, 2026-10-29

Source: [boundary receipt](stream-staging-connect-revocation-boundary-evidence.json), `experiment.results` and `experiment.review`. Exactly three calls, three owned identities and two 60-second per-call overrides were used. The provider suite's recorded result is **INCOMPLETE**, not PASS, because the third call's SFU reconnect failed. The completed controls and the media failure remain valid observations.

| Call | Completed observations | Result and limits |
| --- | --- | --- |
| `5e305dc4-eba6-4719-b24d-261cc08a4d1c`: normal backend end | Both subscribers received real synthetic audio. Actual end worker ACK at `06:38:26.064Z`; five post-ACK samples through `06:38:30.136Z` had unchanged received byte counters `76,197 / 76,828`. Both raw publishers kept increasing their sent counters and both observed a remote SFU call-ended event | Normal provider termination stopped forwarding in this 4.072-second observation window. This is not a service-wide latency guarantee |
| `33c9db30-6a12-454f-8f7e-1770024e161c`: timer while backend end throws | DB revoke completed, fresh backend credentials denied, end job remained pending, both actual provider participants still visible and held join returned 201. Timer later set `ended_at`; both subscriber counters continued growing after GET reported ended | **FAIL for media cutoff within the measured window.** Control timestamp/empty roster did not prove SFU termination; forced backend recovery followed |
| `c01ad954-4271-4212-807b-0a38f59b16e8`: delayed first join, empty-session restart | Initial received audio proven; actual revoke committed while end failed. After both peers closed, provider users became empty but session end was not observed before the deadline guard. Both held-token coordinator rejoins returned 201; both subsequent SFU joins failed | Restart/deadline-reset **INCONCLUSIVE**. No post-original-deadline received-media sample or third-call post-recovery rejoin matrix was completed |

For the active timer call, all timestamps below are UTC:

| Event/sample | Time | Actual observation |
| --- | --- | --- |
| Provider session start | `06:38:45.198` | Deadline = start + 60 seconds |
| Revocation observed complete in Betweener | `06:38:52.956` | DB `ENDED`, fresh backend credentials denied, provider cleanup pending |
| Configured provider deadline | `06:39:45.198` | Media was still being sampled; no local peer stop |
| Provider-reported ended timestamp | `06:39:46.823` | 1.625 seconds after its deadline; not a received-media stop timestamp |
| First sampled GET with `ended=true` | `06:39:49.371` | Provider users empty/session absent; subscriber counters `784,410 / 783,907` bytes |
| Next sample, still `ended=true` | `06:39:51.428` | Subscriber counters `810,366 / 810,115`: **+25,956 / +26,208 received bytes**. Neither SFU peer had observed call-ended |

The final two sample labels are **4.173 and 6.230 seconds after the configured deadline**, and **56.415 and 58.472 seconds after observed DB revocation**. The growing counters prove continued received-media delivery during that interval, after the provider reported ended. They do not locate the final packet exactly or establish an upper bound. The measurement was then censored by explicit backend recovery/cleanup; no eventual timer-only cutoff was captured.

The normal and revoked/recovered controls each completed both held-token and newly minted ordinary-token checks: GET 200 proved token validity; all four joins per call returned **403/code 17**. The newly minted JWTs were controlled adversarial fixture credentials, not credentials issued by the revoked Betweener application path. Active and post-end ordinary attempts to extend to 120 seconds or disable with 0 all returned 403/17. Same-ID `getOrCreate` returned **201 with `ended=true`**, and a subsequent server GET still showed ended; this was retrieval of the existing ended call, not proof of call creation or reopening. The real late-ACTIVE reconcile assertions completed without reviving `ENDED` on both controls. Timer-only join denial before backend recovery was not separately tested.

The third call's first coordinator join was delayed: call created `06:39:59.641Z`, coordinator join initiated `06:40:17.218Z`, provider media session started `06:40:22.348Z`, deadline `06:41:22.348Z`. Thus its final deadline was **82.707 seconds after creation**, not creation + 60. Provisional coordinator deadlines also moved when actual media sessions started (6.306 seconds in call two; 6.110 seconds in call three). This confirms the need to distinguish creation, coordinator admission and actual session start.

The third call's recorded `timerResetObserved=false` is not evidence that reset is impossible: `afterRestartMedia.session` was null and neither SFU join succeeded. The historical probe emitted `sfu_join_error_undefined`, then attempted to subscribe through an already closed child, producing `sfu_process_closed`. The installed protocol nests the numeric code at `event.error.error.code`; it was not recorded in this run. The exact reconnect cause remains unknown. Local corrections now read that numeric field and leave reset as null/inconclusive when no new media session is established. No additional provider execution was performed after those corrections.

## Failure classes

| Class | Database authorization | Stream call and participants | Publication and rejoin | Durable job; expected versus actual |
| --- | --- | --- | --- | --- |
| A: backend cannot reach control API; media healthy | Revoked grant, call `ENDED`; new Betweener admission denied | Canonical fault is a local end-port throw, not a real failed HTTP transport. An earlier real snapshot proved an active session with both participants; an exact server GET/participant snapshot during the fault was not captured | Real held-token join 201 and SFU audio publication accepted. Existing Stream membership remains effective; sender RTP observed | Retry obligation retained and occupancy held. Expected immediate media denial fails. Recovery ends the provider call and completes cleanup |
| B: Stream control service unavailable; some media operational | Expected revoked/`ENDED` after local commit | No actual control-service outage reproduced. Server call/participant state during such an outage is unknown | Existing media may survive in this failure model; actual behavior and timer fault independence untested | Expected retain/retry end until acknowledgement. Do not reuse the local throw as evidence of provider-wide availability or timer survival |
| C: Stream media service unavailable | Authorization is independent; revocation must still commit | Control call state/participants may lag or remain active; not observed here | Expected unavailable media, not proof that authorization is revoked. Access after recovery requires separate verification | End obligation must persist until acknowledged; no real media outage reproduced |
| D: effective media permission survives Betweener revocation | Directly observed revoked/`ENDED`, fresh admission denied | Stream has not received end; the successful coordinator/SFU joins prove it still accepts the participant. Exact participant-list GET during the canonical fault is absent | Directly confirmed coordinator join and synthetic audio publication. Fresh ordinary JWT after revocation and received RTP were not captured in that canonical run | Job remains pending. Expected revocation at provider fails until control recovery. This is the security gate failure |
| E: false success or lost obligation | DB can be revoked while provider remains live | Potentially live if end did not occur; distinct from D's recorded cause | Must never infer media denial from DB state or worker return alone | Canonical job was not lost. A separate literal-`true` completion-ACK guard was repaired and verified previously: stale lease false cannot report success; owner true can. That correction does not solve A/D |

Fault labels must remain separate: **mocked end-port failure**, **actual local transport/network fault**, **actual Stream API response**, **actual SFU signaling/RTP**, and **provider-enforced termination**. Only the first, third and fourth were exercised in the canonical bypass. A/B network/service outages were not injected. The approved follow-up adds actual provider GET/participant snapshots during the injected failure and actual **received** RTP after revocation and timer metadata end; these strengthen D without changing the fault classification.

## Current guarantees and limits

- The database decides consent, eligibility and call lifecycle; fresh Betweener credential/admission/create paths fail closed after revoke. Late ACTIVE evidence cannot revive `ENDED`.
- End jobs survive transient failure and retry; provider acknowledgement and the literal-true database lease completion are required before reporting completion. Occupancy remains held during pending termination.
- Ordinary Connect roles cannot end, create arbitrary calls, edit membership/roles/settings, publish screens/video without consent, record or broadcast. Existing least-privilege policy and prior media results are preserved.
- Actual normal end and revoked/recovered end denied both held and separately minted valid ordinary JWTs. Same-ID retrieval left the call ended; active and post-end extension/disabling were denied. These checks do not certify timer-only denial before backend recovery or the third call's failed media restart.
- **No current outage media deadline exists.** The call type has no maximum duration. JWT expiry is a credential deadline, not a demonstrated active-media lease; a valid ordinary user token obtained through another app issuance path can still carry the same provider identity. A finite retry schedule is not a finite delivery deadline when control remains unavailable.

## Timer feasibility and actual configuration

Read-only inspection at **2026-10-28T17:00:36.453Z** verified app identity, authentication and permissions checks enabled, `max_participants=2`, `limits.max_duration_seconds=null`, and `session.inactivity_timeout_seconds=30`. No role has `join-ended-call`. The approved October 29 fixture revalidated the exact app/checks and approved grants before writes, and the full call-type SHA-256 before and after remained `12e74f5fca79a1dea2b48a8c950bbc3a2189a3ffdf9e04ccb43d28c4e4533a7e`. The normal call inherited no limit; both experimental calls read back 60. See [boundary receipt](stream-staging-connect-revocation-boundary-evidence.json).

The pinned server SDK **0.7.63** exposes `LimitsSettingsRequest.max_duration_seconds`; installed client SDK **1.62.0** exposes the same setting and session `started_at` / `timer_ends_at`. Runtime setting acceptance and control timer end are now proven on this app. Automatic media cutoff and an enforcement upper bound are not proven by those successes.

Stream documents type-level and per-call limits, automatic participant removal and call ending at the limit, and server updates that extend or disable the duration. The same page explains ended-call permissions. [Stream calls API](https://getstream.io/video/docs/api/calls/).

The documented timer starts when a session starts as a participant joins, and `session.timer_ends_at` changes when a duration is updated. It is not documented here as a deadline fixed at Betweener authorization or call creation. [Stream session timers](https://getstream.io/video/docs/javascript/ui-cookbook/session-timers/).

Call session start/end and call end are distinct events; an inactivity-ended session must not be assumed to make the call permanently unjoinable. Current inactivity is 30 seconds. Whether a new session resets the timer on this configured call type requires a real test. [Stream events](https://getstream.io/video/docs/api/webhooks/events/), [call settings](https://getstream.io/video/docs/api/call-types/settings/).

The documented automatic removal would need to work without client cooperation to serve this security model. **Actual received RTP continued after timer metadata end in this non-cooperative fixture.** Documentation does not establish the enforcement component's fault independence or maximum media-stop slack. Ordinary-client extension/disabling denial passed before and after end; server-authorized extension is documented but was not performed. This discrepancy needs provider-level diagnosis before this timer can be accepted as a security lease.

## Exposure bounds

Let `R` be the authorization revocation time, `S` the provider session start, `L` its fixed duration, `D=S+L` its provider deadline, and `epsilon` the enforcement/forwarding slack.

For an already started session with an immutable deadline and verified enforcement, residual access could be bounded by `max(0, D-R) + epsilon`. Here, received counters continued increasing between samples at `D+4.173s` and `D+6.230s`, and no timer-only stop was observed before recovery. `epsilon` has no measured upper bound. A five-minute candidate is therefore **not** a verified five-minute revocation guarantee.

If first join occurs after revocation with delay `W`, a join-started timer adds that delay: `W + L + epsilon`. The current ordinary-token/membership model supplies no proven finite wall-clock `W`. If empty-session restart resets the deadline, repeated restarts may remove even a per-call aggregate duration bound. A short JWT does not by itself solve active-media or other-token access. These are explicit experiment questions, not observed bypasses of a configured timer.

An absolute, provider-enforced authorization deadline fixed before exposure, unextendable by ordinary clients and not resettable by first join/rejoin, would be a stronger release primitive. Its availability and outage enforcement must be verified with Stream. Otherwise the proposal can describe only a bounded *individual active session* under stated assumptions, and product must not accept it as a wall-clock revocation bound.

## Options

| Option | Revocation and exposure | Failure dependence and abuse | Experience, complexity and operating cost | Matched calling |
| --- | --- | --- | --- | --- |
| A: durable end/reconciliation only | Healthy path ends promptly; no finite outage bound | Requires successful control delivery. Held membership/ordinary tokens retain access until end; retries preserve obligation but cannot enforce it alone | Minimal added UX; existing worker and monitoring cost; stuck occupancy must remain visible | Same limitation applies to blocks, safety/account revocation and matched call termination |
| B: durable end plus fixed provider limit | Tested timer marked ended while audio delivery continued; no media bound established. First-join timing is not fixed at creation; restart is inconclusive | Requires a provider-enforced media cutoff with proven slack/fault independence. Ordinary extensions were denied, but that did not stop this failure | Potential predictable UX after enforcement is verified; provider diagnosis and further explicitly scoped validation required; more short calls add signaling work | Current timer cannot certify either intro or matched-call safety |
| C: short sessions plus separately authorized extensions | Each extension increases exposure and races with revoke; needs immutable absolute ceiling and server fencing. New authorization is not retroactive revocation | Requires fresh DB eligibility for every extension and denial of late/stale jobs; session reset/other-token paths still matter | Most complex policy, scheduler and observability; extra requests/jobs and interruption UX; do not implement before B is defensible | Longer matched conversations possible only within explicitly accepted and verified bounds |
| D: exclude pre-match from V1 | Removes pre-match consent exposure, not every revocation failure | Matched blocks/account revocation still need provider enforcement | Simplest rollout reduction, loses intro-call UX; no extra intro media cost | Matched calling cannot pass an immediate safety-revocation requirement merely by excluding pre-match |

No numerical pricing claim is made; actual provider billing and operating cost were not audited.

## Recommended release architecture and product decision

Keep all calling disabled under the current immediate-revocation requirement. Keep the current database authority, durable end jobs, fail-closed credential checks, provider reconciliation, strict grants and isolated Connect call type. Do not make more retry changes to present the unavailable end path as secure.

**B is a candidate architecture, not a currently defensible release policy.** A future VOICE-only Intro Call would require two consenting members; no recording, screen sharing, video upgrade or client-created restart; unique server-owned call IDs; an immutable provider-enforced media deadline; ended-call joins denied with any valid ordinary JWT; and fresh eligibility for every replacement call. Before product approval, obtain provider-level evidence that the media deadline actually stops SFU forwarding, establish maximum slack, and resolve delayed-first-join/restart behavior. Five minutes remains an unapproved candidate.

For provider follow-up, use the sanitized receipt and exact fixture call/session IDs and timestamps above: ask why max-duration end updated coordinator state/roster without a remote SFU call-ended event or received-RTP stop, whether later cutoff is expected and with what upper bound, and whether enforcement depends on the same control services. No provider message has been sent. More ordinary retry changes do not address this discrepancy.

If Stream cannot enforce an absolute ceiling independent of the failed Betweener path, seek a provider-supported absolute admission/termination lease or independent enforcement mechanism. Until verified, choose D as a scope reduction while keeping matched calling disabled under the same unresolved immediate safety requirement. Independently repeating the same failing control path is availability improvement, not a guaranteed independent enforcement channel.

Any product acceptance must explicitly name the permitted residual exposure, whether it is measured from revocation or session start, covered fault classes, enforcement slack, delayed-join/restart behavior, and matched-call safety semantics. It must be separate from experiment approval and cannot convert this existing FAIL to PASS.

## Approved scope and consumption

[Scoped proposal](stream-staging-connect-boundary-proposal.json): at most **three owned VOICE calls and three absent fixture identities** in app 1731011. One normal-end control inherits current settings. Exactly two calls use `settings_override.limits={max_participants:2,max_duration_seconds:60}`. No call-type, role, global or Live definitions change. Ring and notify are false; all media is synthetic.

The experiment measured actual received RTP before and after normal end/timer expiry while raw publishers ignored call-ended. It tried delayed first join, empty-session/rejoin deadline reset, held and separately minted valid ordinary JWT rejoin, same-ID retrieval/recreation, unauthorized extension/disabling, and late local reconciliation. It injected only the canonical local end-port exception. It cannot certify a real Stream service outage. See the partial-result qualifications above.

The user explicitly approved this exact experiment on **2026-10-29**. Its allowance is now **consumed**. An initial npm startup timeout occurred before setup, created no users/calls, and was retained separately; its disposable resources were removed. The harness then used the installed Deno 2.5.4 binary, avoiding a package-launch delay, and executed the approved three calls. The guarded runner refuses re-execution against its consumed result file. No replacement calls, further timers, new release duration or broader provider settings are authorized by this approval.

## Validation and remaining risks

The October 28 baseline remains **82/82 Node, 7/7 UI, 20/20 DB revocation plus four connection races**, and **Live 504/508 with the same four known failures and assertion signatures**. TypeScript, all four strict Deno Edge entrypoints, the separate strict SDK timer type check, targeted lint and Android/Live/EAS isolation passed in that investigation. Those unchanged checks are retained with their original date, not presented as new October 29 executions.

On October 29 the original **82/82** Node cases passed again, and the approved database fixture passed **88 relationship-authority assertions** with Connect installed. Five new offline evidence-review regressions cover metadata-versus-received-RTP, missing receiver evidence, false no-reset conclusions after failed reconnect, valid held/new-token controls, and normal end with non-cooperative senders. The combined run passed **87/87**; fresh targeted lint also passed. Results are recorded in the [boundary receipt](stream-staging-connect-revocation-boundary-evidence.json). Logs: `tmp/connect-boundary/approved-review.log`, `approved-lint.log`, and `approved-run.log`. The actual provider run remains **INCOMPLETE** with two completed controls and a partial third call; it is not a passing suite.

The unchanged Live failures are `live-auth-recovery:121`, `live-fullscreen-stage:229`, `live-phase10g-studio-database:271` and `live-room-safety:96`, all in `__tests__/*.regression.test.ts`. They remain four `ERR_ASSERTION` failures with the `match` operator; no Live code was changed for this investigation. Earlier broader baseline/chat/intent and HTTP security checks remain in [local-m2-revalidation.json](local-m2-revalidation.json) and were not represented as fresh runs here.

The local Chrome probe now includes the raw subscriber answer path and verifies received synthetic audio, in addition to VP9/VP8/Opus, cumulative audio/video publication, rollback of denied tracks and reproduction of the former peer-replacement failure. This is local harness validation, not Stream enforcement evidence.

Provider writes were confined to the approved fixture: **three users, three calls, exactly two per-call 60-second overrides**, normal membership/admission operations and cleanup. All ten ordinary extension/disabling attempts were denied. No role, call-type, global or Live definitions changed. Cleanup verified all three calls return **404/code 16**, zero owned users, and equal before/after full call-type digests. Read-only local verification found zero disposable databases/REST containers and no shared Connect/proof/revocation RPC or security migration-ledger changes. Deployments and real-calling enablement: zero.

Open risks: control outage/media persistence; timer end versus continuing received RTP; unknown eventual timer cutoff and fault independence; delayed joins and inconclusive repeated-session behavior; independently issued ordinary tokens; extension/revocation races; participant/state observation lag; safety revocation for matched calls. No native device validation, hosted Edge invocation, M2B or M3 is implied.

## Rollback and cleanup

No application security model, migration, shared flag or deployment changes in this investigation. Local harness/report changes can be reverted without removing the previous ACK guard or relationship/Connect authority fixes. Preserve unrelated Live/Studio/Circle work.

Cleanup completed despite the third-call diagnostic error: only the three recorded calls were ended/hard-deleted, and only the three identities whose absence was verified before creation were removed. The receipt verifies call 404/code 16, zero owned users, unchanged full call-type digest/app checks, and removal of the disposable DB/REST container. Partial observations and exact IDs are retained. No shared provider policy rollback is required; both timer overrides disappeared with their owned calls.
