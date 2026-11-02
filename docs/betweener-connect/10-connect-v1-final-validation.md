# Connect V1 final validation

## Current M2 result — 2026-10-28

The approved Connect type and three roles are applied in Stream app **1731011,
Betweener Staging**. Closure verification includes 34 ordinary-user coordinator
requests and actual synthetic SFU transports. VOICE_ONLY video/screenshare
publication receives explicit provider permission denials. Separately approved
two-person VIDEO verification passes VP9/Opus publication, screen-share and
privileged-action denials, and real worker ACTIVE reconciliation. All three
VIDEO fixture calls/users are cleaned up. Integrated revocation reproduces
a held-token media bypass during provider-end failure; M2A/M2B remain blocked.
Both fixture suites are cleaned up; existing call types are unchanged. See the
[closure report](16-connect-v1-m2a-security-closure.md) and
[sanitized evidence](stream-staging-connect-m2a-closure-evidence.json).

Local voice orchestration, an existing-call transport boundary and development UI
preview are delivered. Results: 82 foundation/voice/revocation/evidence tests, seven RN interaction
tests, 15 ACL assertions, 67 integration cases (six actual races/six HTTP attacks),
88 relationship assertions and the original 91-test baseline pass. Chat/Intent,
TypeScript, Deno, lint and isolation checks pass. Live remains 504/508 with the same
four baseline failures. See [security evidence](13-connect-v1-m2-security-validation.md),
[implementation](14-connect-v1-m2-voice-implementation.md) and
[unexecuted device plan](15-connect-v1-m2-device-test-plan.md).

```text
CONNECT_M2_STREAM_SECURITY = FAIL
CONNECT_M2_VOICE_DOMAIN = PASS
CONNECT_M2_CALL_LIFECYCLE = PASS
CONNECT_M2_VOICE_UI = CONDITIONAL_PASS
CONNECT_M2_AUDIO_ROUTING = NOT_TESTED
CONNECT_M2_IN_APP_RINGING = NOT_TESTED
CONNECT_M2_DEVICE_VALIDATION = BLOCKED
CONNECT_M2_LIVE_ISOLATION = PASS
CONNECT_M3_READY = BLOCKED
```

M2A's gate has not passed. The real Auth-owned SDK factory and
app-wide incoming host are not installed. No application media flow, device audio,
native ringing, background/locked-call or production readiness claim is made.

The reissued M2 brief was revalidated locally. A stale-lease completion RPC's
false result is now checked in both worker and consent-revocation Edge handlers;
cleanup cannot be reported complete without literal true. Actual stale/owner SQL
acknowledgements are covered by the expanded 20-case revocation suite. The
retained provider consent bypass still makes Stream security FAIL. See the
[current revalidation receipt](local-m2-revalidation.json); no provider settings,
shared database, native flow, build or deployment changed in this review.

## M1 snapshot

Date: 2026-10-28. **M1 locally implemented and tested; nothing deployed.**
The complete file inventory, database/API design, tests, limitations and rollback
are in [the M1 report](11-connect-v1-m1-implementation.md).
Outstanding provider work is in [the configuration checklist](12-connect-v1-stream-configuration-checklist.md).

```text
CONNECT_M1_DOMAIN = PASS
CONNECT_M1_AUTHORISATION = PASS
CONNECT_M1_STREAM_ADAPTER = CONDITIONAL_PASS
CONNECT_M1_STATE_MACHINE = PASS
CONNECT_M1_SECURITY_TESTS = PASS
CONNECT_M1_LIVE_ISOLATION = PASS
CONNECT_M2_READY = CONDITIONAL_PASS
```

Validation: 19 new unit tests, 15 ACL assertions, 62 database integration checks
(five real connection races, six HTTP attacks), 88 earlier relationship assertions,
original 91-test baseline, 234 chat tests and two suggested Intent tests pass.
App TypeScript, strict Edge/Deno checking, targeted lint and environment checks pass.
Full Live remains 504/508 with exactly the four recorded pre-existing failures.

These are local results. Actual Stream configuration/bypass tests are blocked by
the no-external-change boundary. No native ringing, physical-device calling or
production readiness is claimed. M2 has not started; its provider and shared-client
entry conditions remain mandatory. Preserve the relationship remediation.

## Historical M0 report

# BETWEENER CONNECT V1 — ENGINEERING REPORT

> Historical M0 report from 2026-10-27. The current local relationship remediation,
> test results and M1 security gate are in [document 00](00-relationship-security-remediation.md).

Date: 2026-10-27. Delivery: **M0 audit and implementation plan completed**.
**M1 BLOCKED** by a reproduced relationship-authority vulnerability, following
the brief's instruction to stop at a critical compatibility/security boundary.
This is an engineering audit result, not a completed calling feature.

| # | Area | Status | Actual result |
| --- | --- | --- | --- |
| 1 | Repository audit summary | PASS | Installed SDK/native configuration, Auth/profile mappings, relationship/Intent/chat flows, RLS, notifications, flags, design and telemetry inspected. Local exploit reproduced. See document 01. |
| 2 | Architecture implemented | BLOCKED | No Connect runtime implementation. Proposed independent domain and trusted backend are documented; M1 entry gate fails. |
| 3 | Dependencies added/changed | PASS | None. Existing Stream 1.46.3, WebRTC 145.4.1, CallingX 0.11.5, Firebase 26.4.0, Expo 57.0.30 and RN 0.86.3 retained. |
| 4 | Database schema changes | PASS | No persistent schema/data/migration changes. Diagnostic creates synthetic fixtures and pgTAP within one rolled-back local transaction. |
| 5 | Stream configuration requirements | BLOCKED | Verified non-production app mapping, dedicated private call type, explicit role grants, disabled unneeded features and direct-provider deny tests are still required. No provider settings changed. |
| 6 | Backend authorization model | FAIL | Existing local accepted-match state is writable unilaterally and trusted by the legacy helper. Connect authorization not implemented. |
| 7 | Native iOS changes | NOT_TESTED | None. Existing ringing remains disabled; VoIP/CallKit credential/restoration/answer behavior requires implementation and physical-device checks. |
| 8 | Native Android changes | NOT_TESTED | None. Existing Firebase/CallingX packages retained; FCM dispatch, Telecom, permissions and fallback notification behavior require implementation/device checks. |
| 9 | UI components implemented | BLOCKED | None. Voice/video/Aura/history/chat/Intent UI is proposed in document 06, not implemented. |
| 10 | Testing completed | PASS | 91 selected existing Node regression tests; 9 M0 diagnostic assertions; Live, EAS and Android variant isolation scripts. Rollback cleanup verified. |
| 11 | Tests not completed | NOT_TESTED | Connect unit/integration/UI/security suites, true concurrent races, full repository/Live suites, typecheck/native compile, real provider bypass attempts, accessibility/performance/network and physical-device tests. |
| 12 | Security findings | FAIL | Unilateral accepted-match insertion and pending-match promotion reproduced locally with RLS enabled. Provider permissions and callback/termination guarantees unverified. |
| 13 | Existing Live regression results | CONDITIONAL_PASS | Selected provider/lease, release-gate and push regressions passed. No existing Live file changed. This does not certify real-device or full-suite behavior. |
| 14 | Feature flag status | BLOCKED | No Connect flags created or enabled. Proposed server/client switches default off; there is no exposed Connect functionality. Existing flags unchanged. |
| 15 | Deployment status | PASS | No hosted Supabase queries, provider calls, migrations/functions deployed, secrets changed, cloud resources modified, builds, OTA publication or distribution. Production untouched. |
| 16 | Remaining blockers | BLOCKED | B1 trusted relationships; B2 verified provider isolation; B3 shared client/refresh ownership; B4 native provisioning/restoration and device validation. |
| 17 | Recommended next milestone | BLOCKED | M0.1 relationship authority hardening and compatibility regression tests, then M1. See document 02 for reviewable scope and entry/rollback gates. |

## Readiness declarations

| Declaration | Status | Reason |
| --- | --- | --- |
| CONNECT_V1_DOMAIN_READY | BLOCKED | M1 not implemented; relationship prerequisite fails |
| CONNECT_V1_VOICE_READY | BLOCKED | No authorized Connect media path |
| CONNECT_V1_VIDEO_READY | BLOCKED | No Connect video or upgrade implementation |
| CONNECT_V1_NATIVE_RINGING_READY | BLOCKED | Ringing disabled; no verified native path |
| CONNECT_V1_SECURITY_READY | FAIL | Existing relationship authority bypass reproduced; provider proof absent |
| CONNECT_V1_DEVICE_TEST_READY | BLOCKED | No callable Connect implementation/native development binary |
| CONNECT_V1_STAGING_READY | BLOCKED | Development/security/device gates incomplete; no rollout authorized |
| CONNECT_V1_PRODUCTION_READY | BLOCKED | All preceding release gates incomplete; production untouched |

## Validation details

The exact invocations and required future matrix are in
[07-connect-v1-test-matrix.md](07-connect-v1-test-matrix.md). Existing selected
tests reported `tests 91`, `pass 91`, `fail 0`. The final SQL diagnostic printed
`ok 1` through `ok 9` and `ROLLBACK`. The first attempt failed before fixtures
because pgTAP was absent; the final script creates it transactionally and reruns
successfully. Subsequent local queries found zero synthetic accounts and matches.
Zero synthetic push events were produced during the diagnostic.

Passing the diagnostic confirms a security blocker exists. No fix is claimed.
The local database ledger is older than October repository work, and no hosted
schema was queried; the report does not attribute this result to production.

## Proposed observability for later milestones

Reuse sanitized Sentry helpers with an explicit metadata allowlist: random
correlation/session identifiers, platform/app/SDK version, lifecycle outcome,
safe failure code, setup/connection/reconnect timings and coarse network category
when actually available. Never include tokens, keys, names, phone numbers, private
messages, voice/video content or raw provider payloads. Hash identifiers where
cross-system correlation permits, and restrict diagnostic access/retention.

Dashboard specification: initiated/ringing/accepted/confirmed-active/terminal
funnels; setup failures and p50/p95 time to connection; missed/declined outcomes;
connected duration; reconnect frequency/recovery; stale occupancy and unacknowledged
provider cleanup work, split by platform/build/environment. Record RTT/loss/jitter
only from supported actual SDK statistics. Trace backend/provider/client events
with one correlation ID and a provider-event dedupe identity.

Initial **unmeasured targets for review**, not achievements: at least 99% setup
success among eligible accepted online calls, p95 accepted-to-confirmed-active
under 5 seconds on stable networks, and p95 provider cleanup acknowledgment under
10 seconds when the provider is reachable. Exclude intentional declines/cancels
from setup failure denominators and report network/provider outage cohorts
separately. Reliability targets do not relax zero unauthorized admissions or the
terminal-state invariants.

## Delivered change set and rollback

This directory contains the architecture audit, plan, security/state/native/UI
designs, test matrix, rollout/rollback proposal, limitations and this report. The
unnumbered audit filename links to the canonical numbered audit to satisfy both
paths requested in the brief. The additional SQL file is an M0 diagnostic only.
No application, dependency, Live, native, hosting or migration file was edited.
Rollback consists of removing only these new Connect documents/diagnostic; no
database or provider rollback is needed.
