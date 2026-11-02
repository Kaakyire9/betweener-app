# Connect M2A security closure

2026-10-28. **VOICE_ONLY and VIDEO media policies are proven. Strict consent revocation FAILS
during provider-end failure. M2A and M2B readiness remain BLOCKED.** No real user
calling, deployment, shared database change or additional provider policy write
was performed. This is a security finding with local remediation, not a release.

```text
CONNECT_VOICE_MEDIA_ISOLATION = PASS
CONNECT_VIDEO_PERMISSION_ENFORCEMENT = PASS
CONNECT_SCREENSHARE_DENIAL = PASS
CONNECT_PERMISSION_ESCALATION_RESISTANCE = PASS
CONNECT_CONSENT_REVOCATION = FAIL
CONNECT_PROVIDER_BYPASS_TESTS = FAIL
CONNECT_LIVE_ISOLATION = PASS
CONNECT_M2A_SECURITY_GATE = BLOCKED
CONNECT_M2B_REAL_VOICE_TEST_READY = BLOCKED
```

Evidence is in [the sanitized closure receipt](stream-staging-connect-m2a-closure-evidence.json).
The earlier [M2 receipt](stream-staging-connect-validation.json) is retained as a
historical record. Offline review tests do not count as new provider executions.

## Root causes and actual configuration

The staging credential group again attested **1731011 / Betweener Staging**, with
auth and permission checks enabled. The unchanged `betweener_connect` type grants
only read to invited members, read/join/audio to `connect_voice`, and adds video
for `connect_video`. Built-in roles have no Connect permissions. Recording,
transcription, screen sharing, broadcasting, ingress and notifications are off;
video defaults off and capacity is two. No type, role definition, Live/global
setting or app feature flag was changed. Complete call-type hashes matched before
and after both test suites. Hosted Live credential provenance remains unattested.

The former SFU probe had several concrete problems: magic quality value `3` means
**OFF**, not HIGH; it closed peer connections/tracks before signaling; its stream/
RID metadata did not follow the installed SDK's publisher shape; and early remote
ICE candidates were discarded. It was therefore incapable of proving actual
transport. The corrected probe uses generated SDK enums/types, associated stream
and track IDs, explicit RID/layer metadata, live synthetic tracks, negotiated SDP,
buffered ICE and transport counters. No camera or microphone hardware is opened.
The exact contribution of each old defect is not claimed from a one-factor test.

Revocation had a separate architectural limitation: Postgres commits its own
authority, while ordinary Stream tokens consult Stream membership. An outbox
cannot make those systems atomic. Delaying or failing provider end leaves an
already-promoted membership usable. Short user-token expiry is not immediate
revocation, and fresh Live tokens must not be assumed call-scoped.

The worker also claimed `call_id` from a session row that might already have been
deleted. The job survives that deletion, but its returned ID became null. The
new migration claims the ID from the durable job and prioritizes due end work.

## Real provider observations

The retained VOICE coordinator matrix has **34 ordinary-user requests**. Two integrated
SFU participants established connected synthetic audio transports; the real worker
read their provider identities and reconciled the disposable DB to ACTIVE.
No server JWT was used for adversarial client requests.

| Assertion | Actual observation | Conclusion |
| --- | --- | --- |
| Voice user publishes video | SFU HTTP 200 with embedded `ERROR_CODE_PERMISSION_DENIED`, explicitly not authorized for `TRACK_TYPE_VIDEO`; no answer | PASS; HTTP 200 alone is not success |
| Voice user screen-shares | Same embedded permission denial for `TRACK_TYPE_SCREEN_SHARE`; no answer | PASS |
| Authorized voice control | SFU join ACK, audio publishing answer, RTC connected; initial outbound counters 561/544 bytes and eight packets each | Actual synthetic transport, not only UI/signaling state |
| Request video/screenshare permission directly | Both request-event endpoints return **201**; subsequent capabilities remain exactly read/join/audio, video disabled | A request event is not a grant. Do not claim the request endpoint itself denies it |
| Grant self video, change roles/settings, add third member | **403 / code 17** | Provider denies escalation |
| Record, transcribe, broadcast or end as participant | **403 / code 17** | Provider denies privileged controls |
| Unrelated create/read/join/ring; valid Live-token bypass | **403 / code 17**; valid Live fixture control succeeds | Existing scope/identity tests still pass |
| Healthy integrated revocation | Database revoke, real worker claim, Stream end, durable ACK; approximately **1030 ms** for this fixture | Successful fast path; one sample is not an SLA |
| Both held identities after end ACK | Join **403 / code 17**; both SFU clients receive remote call-ended event | No re-admission after end; no terminal resurrection |
| Provider-end failure injected at the actual worker port | DB remains ENDED/revoked, fresh backend call/admission denied, occupancy retained, retry pending | Database authority and retry work |
| Held token during that failure | Direct join **201**, real SFU audio answer, RTC connected, 630 outbound bytes/nine packets after DB revocation | **Strict consent invariant FAILS** |
| Provider recovery | Actual retry ends the call, held join **403 / code 17**, occupancy released, remote call-ended observed | Recovery works; it does not erase the earlier bypass |

The injected outage suppressed the end operation only; it was not an actual Stream
incident. All subsequent admission/media observations contacted the real provider.
The raw malicious peer connection still reported connected at the immediate
post-end sample. Remote end events and rejoin denial are proven; packet-level SFU
discard/forced transport teardown after end was not separately attested. The
normal app SDK/controller must still stop capture. No stronger teardown guarantee
is inferred from the event or the local byte counter.

## Media-policy decision and approval boundary

VOICE_ONLY and VIDEO are separate server contracts. Before admission/reconciliation,
the adapter verifies the pair, call ID/type, immutable custom media and actual call
settings. VOICE_ONLY requires video off. VIDEO requires video on plus the existing
video role; both prohibit screen sharing, access-request escalation and all
recording/egress modes. Local SQL proves independent recipient video consent can
authorize VIDEO without voice, and a voice grant cannot authorize VIDEO.

The existing shared type is sufficient for the observed voice restrictions. No
evidence justifies changing Live or adding another type to force a pass. An
isolated VIDEO positive control was separately approved and attempted with the
exact one-call, three-user scope in
[stream-staging-connect-video-security-proposal.json](stream-staging-connect-video-security-proposal.json).
The frozen proposal remains the approval input. Its result is recorded in
[the VIDEO receipt](stream-staging-connect-video-security-evidence.json).

The actual authenticated SQL rejected VIDEO creation with a voice-only grant.
Independent recipient VIDEO consent authorized one server-generated call. Both
members remained `connect_invited` before recipient acceptance, and pre-acceptance
credential issuance was denied. After authenticated acceptance, the first ordinary
user joined with exactly read/join/audio/video capabilities. The media subprocess
returned `sfu_probe_unavailable`; the old error handler discarded partial results.
No VIDEO RTP, screen-share result for VIDEO, or VIDEO privileged-action matrix was
captured. That first attempt could not certify VIDEO, irrespective of consent,
join success or cleanup; its result remains BLOCKED in the historical receipt.
The exact failing stage is not established from that attempt.

That call and all three users were hard-deleted. Exact call lookup returned
404/code 16, users remaining zero, and all call-type hashes were identical:
`12e74f5fca79a1dea2b48a8c950bbc3a2189a3ffdf9e04ccb43d28c4e4533a7e`.
The disposable database/REST container were removed; a subsequent read-only audit
confirmed no test databases remained and the shared schema was unmodified.

Local Chrome diagnostics now negotiate synthetic VP9, VP8 and Opus between local
peers with nonzero sent **and received** RTP. These are local harness checks, not
Stream permission evidence. The probe negotiates the SFU-offered codec, samples
VIDEO counters before closing its PC, and preserves partial SFU results plus
allowlisted failure stages without logging raw errors, SDP or credentials.
This does not establish a fix for the provider attempt's unknown failure.

The separately approved [diagnostic retry](stream-staging-connect-video-security-retry-proposal.json)
created exactly one additional call with the same three owned identities. The
first participant received a VIDEO publishing answer and established connected
VP9 transport: **146,385 outbound bytes, 228 packets, 175 encoded frames**. The
SFU explicitly denied SCREEN_SHARE with `ERROR_CODE_PERMISSION_DENIED` and no
answer. An audio publishing answer arrived, but the probe failed while applying
it (`audio_remote_answer`). No connected audio result, second participant result
or VIDEO privileged-action matrix was captured in that attempt; its result remains
BLOCKED. Zero remote RTCP reports were recorded, so no remote rendering/physical
device claim is made from outbound counters.

The probe had replaced its publisher PC between successful VIDEO and audio in
the same SFU session. The installed SDK keeps one publisher PC and cumulative
track metadata. Local Chrome tests reproduce the former replacement's media-line
failure and verify the correction: one PC, cumulative active tracks, denied-offer
rollback, and an inactive removed screen sender without recycling its media slot.
They confirm simultaneously received video/audio, and audio after rejected video
and screen attempts. Provider revalidation is recorded separately below.

The manual diagnostic pause exceeded 60 seconds before renewed admission was
requested. That request was rejected by actual SQL. Source inspection shows
ACCEPTED/CONNECTING have a 60-second deadline and expire on worker snapshot and
admission; this explains the rejection, although the generic bridge error did not
record its SQL reason. No deadline was extended, nor was a terminal session
resurrected. The call and all three users were hard-deleted, exact lookup returned
404/code 16, and the complete type digest again matched the hash above. A fresh
audit found zero disposable DBs/REST containers and an unmodified shared schema.

The runner now obtains both accepted identities together, captures privileged
denials before media, opens both transports concurrently and uses the actual
worker's provider snapshot to reconcile ACTIVE before permitting any diagnostic
pause. It never writes fake ACTIVE state or extends authority deadlines.
The user separately approved
[the corrected verification proposal](stream-staging-connect-video-security-verification-proposal.json).
It was executed once and cleaned up. All proposal JSON files remain the original
approval inputs; [the VIDEO receipt](stream-staging-connect-video-security-evidence.json)
records execution status and preserves both earlier failed/incomplete runs.

The corrected real Stream verification **passed all four integrated checks**:
voice-only grants cannot create VIDEO; members and credentials remain gated by
authenticated recipient acceptance; eight privileged actions return 403/code 17;
and both consenting users publish connected VP9/Opus media while the SFU explicitly
denies screen sharing. The ordinary-user matrix has eight denied writes and one
capabilities readback, plus two successful coordinator joins. Capabilities stayed
exactly `read-call`, `join-call`, `send-audio`, `send-video`. Membership remained
exactly the pair with `connect_video`; all three app roles stayed `user`.

| Actual VIDEO participant | Video outbound bytes / packets / frames | Audio outbound bytes / packets |
| --- | --- | --- |
| Fixture 7 | 131,340 / 225 / 175 | 886 / 13 |
| Fixture 8 | 130,654 / 224 / 175 | 867 / 13 |

Both SFU joins and both VIDEO/audio publishing answers succeeded, and both RTC
transports reported connected. SCREEN_SHARE returned explicit embedded
`ERROR_CODE_PERMISSION_DENIED` without a publishing answer for each user. The
actual adapter read the real provider session, and the actual worker/service-role
RPC reconciled the disposable database to **ACTIVE**. No test-authored participant
list or lifecycle update was substituted. No diagnostic pause or extra media
attempt was needed in this run.

The exact call returned 404/code 16 after hard deletion; all three users were
absent. Before/after type hashes matched the hash above, and a fresh audit found
zero disposable DBs/REST containers with the shared schema unchanged. All three
separately approved VIDEO calls are now gone. VIDEO permission enforcement is
therefore **PASS**. Remote rendering, physical devices and packet receipt were
not attested by the outbound counters; no RTCP reports were recorded. M2A/M2B
remain **BLOCKED** by the independent consent-revocation failure.

## Local revocation implementation

The new authenticated `rpc_connect_revoke_consent` wraps the preserved M1 authority
transaction. It invokes the existing actor/pair/grant checks, commits revoked
state and terminal calls with the outbox, and returns at most 20 affected IDs plus
the full pending count. Only the service role can claim specific cleanup jobs.
Claims use SKIP LOCKED, durable leases and existing completion fencing.

The new `connect-revoke-consent` Edge endpoint validates Auth/body, commits that
RPC, then attempts end work immediately through the same durable worker cleanup
primitive. It returns **200 / cleanup complete** only after the applicable end
ACKs; otherwise **202 / cleanup pending**, preserving revoked authority and retry.
The app service uses this endpoint. The old direct revocation RPC remains for
compatibility and still fences backend access, but is not an immediate remote
cleanup guarantee. No endpoint was deployed or invoked as a hosted Edge function.

This improves the healthy path and prevents a false successful cleanup response.
Subsequent M2 revalidation also found that both Edge completion callbacks ignored
a false `rpc_connect_complete_job` result. They now require literal true through
the shared `assertConnectJobAcknowledged` guard. Actual SQL tests prove a stale
lease returns false and is rejected, while the owning lease returns true and is
accepted. Unit tests cover false/malformed acknowledgements and worker failure.
The fixture bridge uses the same guard. No SQL contract or provider definition
changed; the hosted HTTP handlers were not invoked or deployed. See
[the current local receipt](local-m2-revalidation.json).

It does **not** close the partition between DB revocation and provider authority.
Blocking, expiry, deleted accounts and old clients still require durable provider
cleanup. Source/catalog reviews found no new public helper/table grants, editable
JWT metadata authority or client media certification. This is targeted local
review, not a hosted Advisor run.

## Permanent tests and results

| Verification | Result |
| --- | --- |
| Original 61 M2 tests | 61/61 PASS |
| New revocation/policy tests and closure evidence guards | 21/21 PASS; total **82/82**, including subsequent acknowledgement hardening |
| RN voice interactions | **7/7 PASS** |
| M1 ACL/security | **15 ACL + 67 integration PASS**, six connection races/six HTTP attacks |
| New local revocation suite | **20/20 PASS**, four separate-connection races and actual stale/owner completion acknowledgements |
| Integrated real Stream + disposable DB | **10 checks executed**; healthy path passes, strict outage safety fails as reproduced |
| Relationship security | **88 assertions**, six races/four HTTP attacks PASS; nine original exploits reproduced only before repair |
| Original selected baseline | **91/91 PASS** |
| Chat / Intent regressions | **234/234**, **2/2 PASS** |
| Live regression | **504/508**, same four pre-existing failures, no new failure |
| App TypeScript / strict Deno Edge / targeted lint | PASS |
| Approved VIDEO attempts | Final verification **4/4 PASS**, two real VP9/Opus publishers, screen/privilege denial and actual ACTIVE reconciliation; all three attempts cleaned up |
| Local-only synthetic browser transport | VP9/VP8/Opus, simultaneous audio/video, rejected-offer recovery PASS; former replacement failure reproduced; not a provider security result |
| Live/EAS/Android isolation and diff checks | PASS; no build or publication |

New local cases cover revocation before creation and in REQUESTED, RINGING,
ACCEPTED, ACTIVE and RECONNECTING; two devices, stale events, duplicate revocation,
independent video consent, deleted sessions and cleanup lease races. The integrated
suite exercises a provider create paused before DB ACK, real accept/revoke racing,
actual ACTIVE reconciliation, immediate end, outage retry, held credentials, and
blocking while remote cleanup is pending. Fake local ACTIVE/RECONNECTING fixtures
are labeled local; they are not substituted for the separate SFU evidence.
Independent local scenarios reset only synthetic actors' throttle usage; no rate
policy was changed. The real-provider runner reports the known safety failure
with exit code 2 after cleanup, rather than treating a reproduced attack as readiness.

The four Live failures retain the same `ERR_ASSERTION`/`match` signatures:
`live-auth-recovery.regression.test.ts:121`, `live-fullscreen-stage.regression.test.ts:229`,
`live-phase10g-studio-database.regression.test.ts:271`, `live-room-safety.regression.test.ts:96`.

## Exact file inventory

New files:

- `supabase/migrations/20261028143424_connect_m2a_revocation_cleanup.sql`
- `supabase/functions/_shared/connect-consent-revocation.ts`
- `supabase/functions/connect-revoke-consent/index.ts` and `deno.json`
- `scripts/lib/connect-stream-sfu-protocol.cjs`, `connect-stream-sfu-session.cjs`,
  `connect-stream-closure-worker.ts`, `connect-stream-closure-verdict.ts`
- `scripts/test-connect-consent-stream.cjs`, `scripts/test-connect-revocation.cjs`
- `scripts/test-connect-video-stream.cjs`, `scripts/test-connect-synthetic-offer.cjs`,
  `scripts/lib/connect-stream-fixture.cjs`
- `__tests__/connect-consent-revocation.regression.test.ts`,
  `__tests__/connect-security-closure.regression.test.ts`
- This report, the closure receipt, VIDEO proposals and separate VIDEO receipt.

Modified files:

- `supabase/functions/_shared/connect-stream-adapter.ts`, `connect-provider-worker.ts`
- `features/connect/data/connect-service.ts`
- `scripts/lib/connect-stream-sfu-probe.cjs`, `connect-test-database.cjs`
- `scripts/test-connect-stream-staging.ts`, `scripts/prepare-connect-edge-check.cjs`
- `__tests__/connect-foundation.regression.test.ts`
- Documents 10, 12, 13, 14 and 15 with current result pointers.

The integrated fixture port substitutes a third owned test identity for the fixed
system creator, avoiding mutation of that existing system identity. It does not
rewrite participant Auth/Stream UUIDs, grants, permissions, tokens or provider
responses. SQL runs under actual authenticated/service roles; the Edge HTTP
gateway itself was not integration-tested or deployed.

## Cleanup, rollback and required external actions

All three integrated provider users and four exact call IDs are gone, with zero
users and **404/code 16** for every call. The separate ordinary-user matrix also
removed its four users/call targets. Headless browsers/sockets closed. Disposable
databases and REST containers were dropped; the shared baseline has no M0/M1/M2A
installation. Existing provider type/configuration digests match.
All three separately approved one-call VIDEO attempts also removed their exact calls
and three owned identities; their receipts preserve the partial and failed results.

Nothing was deployed, so rollback is local: remove the new endpoint/helper and
client-service override together if necessary; retain or forward-correct the safe
job-ID fix and all M0/M1 authority. Do not restore client write privileges or lose
pending end jobs. The added SQL is unapplied to shared environments. Provider
rollback is unnecessary because no policy change was made. Any later authorized
VIDEO fixture is ended/hard-deleted with its owned users; it needs no Live rollback.

Strict outage revocation needs an enforceable provider-side admission/session
mechanism, or a separately reviewed maximum revocation latency with independently
enforced leases. An async retry, pending UI response or short JWT alone is not that
mechanism. Stream documents server session timers, but their suitability, renewal
races and outage behavior have not been verified here; no timer change is proposed
as a proven fix. Do not silently weaken the immediate-revocation requirement.
Any provider change needs a concrete additional proposal and approval, followed by
the same adversarial proof. Keep the security gate and M2B disabled meanwhile.

References: [Stream permissions](https://getstream.io/video/docs/api/call-types/permissions/),
[call ending and session timers](https://getstream.io/video/docs/api/calls/),
[Supabase database webhook execution](https://supabase.com/docs/guides/database/webhooks).
