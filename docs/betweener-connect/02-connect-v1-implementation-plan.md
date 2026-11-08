# Connect V1 implementation plan

> Historical M0 plan. The relationship remediation is preserved in document 00.
> Local M1, including server API and the Stream adapter, is now implemented and
> tested in [document 11](11-connect-v1-m1-implementation.md). The latest M1 brief
> expanded the original scope below. M2 is not started; provider/native gates remain.

Date: 2026-10-27. **Only M0 is completed.** The critical relationship-authority
finding blocks M1 under the brief's execution gate. The following is a proposed
sequence, not a list of implemented features or approved infrastructure changes.

## M0 — Audit: PASS; compatibility gate BLOCKED

Scope: repository, installed SDK, local schema/RLS and transaction-only attack
reproduction. Files: this documentation directory and
`supabase/verification/connect_v1_m0_relationship_authority_audit.sql`.
Decision: reuse SDK/native packages and existing relationship models; defer
feature code until relationship authority is trustworthy. Results: 91 existing
targeted tests pass; nine diagnostic assertions reproduce B1; three isolation
scripts pass. Risks/limitations: dirty baseline, older local migration ledger,
no provider/device verification. Rollback: remove only this M0 change set; there
is no applied migration or runtime behavior to reverse.

## Prerequisite M0.1 — Relationship authority hardening: BLOCKED / not started

1. Inventory all `matches` writers, including ChatScreen.ensureMatch, mutual-swipe
   triggers, Intent recipient acceptance, Private Spark exit decisions and admin
   paths. Preserve server-owned legitimate mutual relationship formation.
2. Restrict direct participant INSERT/promotion of accepted matches. Move required
   chat actions through authenticated, block/account-checked backend commands.
3. Capture trusted recipient/mutual decision evidence without creating another
   relationship store. Decide how legacy accepted rows lacking such evidence
   become eligible; do not fabricate a backfill or force-match users.
4. Reconcile `PENDING` mutual-swipe semantics with `ACCEPTED` chat semantics. A
   client action that starts chatting must not manufacture mutual call consent.
5. Test direct SQL/REST attempts as ordinary users, plus existing legitimate chat,
   swipe, Intent and Live matching flows. Rerun the M0 diagnostic and replace its
   vulnerability expectations with a durable deny-based regression suite.

Likely files: additive migration, relationship RPCs, ChatScreen relationship
adapter and shared relationship services/tests. Exact paths depend on the writer
inventory. No fix has been applied. Gate: unilateral acceptance denied while
legitimate existing workflows remain valid. Rollback must restore compatibility
without enabling Connect on an untrusted relationship model; Connect stays off.

## M1 — Domain, consent and authoritative lifecycle: BLOCKED / not started

Proposed modular structure:

```text
features/connect/
  domain/       contracts, state transitions, safe errors, duration
  application/  commands, reconciliation and repository interfaces
  data/         authenticated Supabase adapters
  config/       fail-closed client capability projection
supabase/
  migrations/   protected Intent consent extensions and Connect storage/RPCs
  tests/        authorization, RLS, concurrency and transition tests
```

Keep authoritative policy in Postgres/private functions, with a thin authenticated
Edge boundary when provider operations are later introduced. Client domain
helpers can render eligibility, but cannot grant it.

Planned operations: eligibility, create, accept, decline, cancel, end, revoke,
session/history reads, provider-event reconciliation and expiry maintenance.
Derive actor from Auth, map profiles on the server, validate both accounts, blocks,
media, flags, current relationship and consent, occupancy, deadlines and rate
limits. Terminal cleanup/revocation remains callable when rollout flags are off.

Extend Intent Request preferences/approvals safely; accepting the existing
request is separate from approving calls. Approval cannot exceed requested media,
is requester-to-recipient only and expires using private server configuration.
Persist safe audit events and use immutable terminal outcomes with version checks.
Use server-generated UUIDs and server time. See documents 03 and 04.

Tests: pure transition/duration rules; rollback-only database tests for identities,
matched authority, consent direction/media/expiry/revocation, spoofed actors,
blocks, histories, colliding calls, replay and illegal/delayed transitions. Include
true multi-connection races; sequential mocks do not prove lock correctness.
Gate: these tests pass against a reviewed local schema baseline, with all flags
off. Risks: relationship and account-state races. Rollback: disable entry commands
and leave terminal/history cleanup intact; do not delete private history blindly.

## Remaining milestone gates

Every future milestone requires a recorded diff, architectural decisions, exact
test commands/results, unresolved risks and rollback rehearsal in document 10.

| Milestone | Scope / likely boundaries | Validation and result required | Risks, current limitation and rollback |
| --- | --- | --- | --- |
| M2 | Private Stream call type, authenticated backend creation/token boundary, shared Auth-owned RTC client service | Explicit provider grants; direct ordinary-user SDK/API bypass denied; no Live token-refresh regression; authorized audio-only two-device call | BLOCKED: provider configuration and B3. No Live role changes. Disable new creation; drain provider work and preserve shared Live leases. |
| M3 | Modular chat actions, full-screen voice route, participant-only history | Foreground incoming/outgoing/active/terminal UI, contextual mic permission, signed-out cleanup, server history visibility | BLOCKED on M1/M2. Keep chat message schema unchanged; remove gated actions/route access on rollback. |
| M4 | Video canvas, camera controls, bounded draggable preview, user-initiated upgrades | Two-device video, rotation, denied camera/audio fallback; server media-specific authorization; no remote camera activation | BLOCKED. Kill video entry/upgrades; allow safe audio continuation and explicit terminal cleanup. |
| M5 | One native bootstrap, environment-scoped provider names, auth restoration and native answer authorization | Physical iPhone/Android foreground/background/locked/cold-start/reboot/denied-permission matrix | BLOCKED: credentials/provisioning/build authorization and devices. Native changes require a binary; OTA cannot install plugins. Kill ringing server-side and reconcile outstanding invitations. |
| M6 | Theme-token UI, accessible controls and Connection Aura | Reduced motion/background suspension, screen-reader/focus/touch targets, lower-end Android profiling | NOT_TESTED; do not invent audio levels. Disable decorative animation independently. |
| M7 | Recovery, provider cleanup outbox, block/account termination, safe telemetry | Out-of-order signed webhooks, replay, crash recovery, blocking races, logout, provider failures and Live conflict tests | BLOCKED. No immediate-media-termination guarantee before provider tests. Emergency shutdown must fence authorization and drain provider sessions. |
| M8 | Deterministic automated suites and physical-device preparation | Unit/integration/UI/security suites; real multi-device/multi-connection cases; documented resource/quality checks | NOT_TESTED for Connect. No provider traffic in ordinary unit tests. Stop at failed gates; keep flags off. |
| M9 | Staging proposal, canary and rollback checklist | All development gates passed, separate deployment/build authorization, staging-only identities and monitoring | BLOCKED. No staging deployment authorized. Roll back capability flags first; retain audit/history and terminal paths. |

## Concrete external evidence needed before dependent work

- Confirmed development/staging Stream application identity and dedicated private
  call-type grant/settings export; no credential values in review artifacts.
- Verified APNs VoIP/FCM provider names and matching non-production native IDs.
- Separately authorized native builds, backend deployments and staging rollout
  only at their respective gates, after the local implementation is reviewable.
- Product decisions for expiring pre-match grants, configurable rate limits,
  availability preferences and historical relationship eligibility.

These are entry gates, not requests to deploy or change secrets now.
