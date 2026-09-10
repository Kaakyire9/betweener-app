# Betweener Live Phase 10F audit

Date: 2026-09-09
Scope: Phase 10E to Phase 10F, before implementation

## Executive finding

The Phase 10D deterministic Quick Connect engine and Phase 10E Show Director are reusable. The blocking schema issue is that `live_sessions.created_by_user_id` and `created_by_profile_id` are mandatory and several Odo service paths treat a human Host as the owner, authorizer, and programme controller. Phase 10F must separate those concepts before it creates an Always-On session. It must never provision a fake Odo account.

The rollout will remain internal, circuit-breaker protected, and shadow-only until the opportunity engine has been observed in production. Availability is explicit, private, and time-bounded. Presence is only freshness evidence.

## Audit decisions

1. **Reusable Phase 10E systems:** the Live lifecycle, participants, Quick Connect pool, deterministic AutoMatcher, private sparks, safety checks, Odo lease generation, Full Quick Connect, Show Director, Director Events, music catalogue/playback, Realtime update tables, maintenance clock, and Stream admission remain authoritative.
2. **Phase 10E blockers:** Odo reconcilers require a human request user; the session creator is non-null; host-only snapshots are not suitable for an Odo-only room; and the current Stream call is created lazily on first media admission.
3. **Presence:** `user_presence` is app-presence telemetry with `online`, `last_active`, and `updated_at`. It is neither consent nor pool membership.
4. **Availability domain:** introduce one private availability record per user with explicit status, start, expiry, source, market context, invitation cooldown, and monotonic version.
5. **Expiry:** only server time is authoritative. Allowed windows are configured and bounded; the default is 30 minutes. Expiry and invalidation are idempotent maintenance operations.
6. **Mobile UX:** add a Live-lobby card offering 15, 30, or 60 minutes, an active countdown, Extend, and Stop. It does not automatically join a Live pool.
7. **Opportunity engine:** use deterministic SQL over a bounded candidate window. It records shadow opportunities before any invitation capability is enabled.
8. **Pairability graph:** build edges only inside the bounded market set. The global pre-session predicate mirrors the authoritative AutoMatcher constraints; accepted users are revalidated again inside the created session using `live_quick_connect_pair_is_eligible` before pairing.
9. **Market partition:** initial keys are `internal` or normalized country/region buckets. Exact location and raw coordinates are never exposed.
10. **Scalability:** candidate scan, edge scan, cohorts per tick, and opportunities per market are capped. Partial indexes cover available expiry, market freshness, active opportunity leases, invitation deadlines, and user reservations.
11. **Opportunity states:** `detected -> forming -> inviting -> awaiting_quorum -> quorum_reached -> creating_session -> starting -> live`, plus `expired`, `failed`, `cancelled`, and `completed`.
12. **Lease/deduplication:** one leased worker advances an opportunity. An active-market unique index and a deterministic formation bucket prevent duplicate cohorts.
13. **Atomic reservation:** a separate reservation table has a unique `user_id`; release is tied to terminal opportunity states and expiry.
14. **Invitations:** invitations are opportunity-member state, not public Live participants. Safe client snapshots expose only the current user's invitation and aggregate counts.
15. **Cooldown and quiet hours:** invitation preferences, global push preference, quiet hours, per-day caps, per-opportunity cooldown, and Not Tonight are checked before reservation and again before sending.
16. **Forming screen:** the client displays aggregate progress, expiry, and the user's choice. It never exposes invitees, declines, the compatibility graph, or who is missing.
17. **Pairability quorum:** quorum requires enough accepted members to contain at least one valid pair and meet configured minimum cohort size; raw accepted count alone cannot start a room.
18. **Formation timeout:** unresolved invitations expire privately, accepted users are released with cooldown, and no RTC resource is created.
19. **System session creation:** a service-only RPC creates one `quick_connect` session per opportunity with system ownership, accepted audience participants, deterministic provider call ID, and Odo controller state.
20. **Human-Host assumptions:** creator foreign keys, Host role sync, host-console capability checks, recap ownership, Odo internal allowlists, and maintenance requester IDs currently assume a human.
21. **Correct ownership model:** add `ownership_type` and `system_session_kind`; human sessions retain non-null creator fields while the constrained Always-On kind requires both creator fields to be null.
22. **No fake Odo user:** system sessions contain no fabricated auth/profile/participant row. A real accepted member may be an audit witness for a service reconcile but receives no Host role or Host capability.
23. **Initial controller:** the session starts with `control_source = 'odo'`, no control user, and a server lease generation. This is control, not ownership.
24. **Director lease:** existing Odo fencing is retained. System authorization is accepted only when `auth.role() = service_role`, the session is the constrained system kind, and the witness belongs to the opportunity.
25. **Odo Stage:** initialize the Show Director at `pair_forming`/`pair_forming` with calm energy while invitees enter and explicitly join the pool.
26. **Music:** initialize stopped. Playback remains best-effort, licence-checked, and subordinate to the existing music policy.
27. **Stream:** create the provider call from a service Edge Function after database quorum and before marking the opportunity live. Use the existing `betweener-live-system` Stream server identity, never an app user as call creator.
28. **Low liquidity:** after start, reuse 10D metrics. Announce a deterministic waiting state, then drain when the configured threshold is exceeded.
29. **Empty room:** when no active/connected participants remain for the configured interval, begin draining.
30. **Maximum runtime:** move to draining at the configured deadline regardless of new pool interest.
31. **System ending:** only constrained system sessions may autonomously transition `live -> ending -> ended`, after active pairs reach zero.
32. **Cleanup/recovery:** stop music, clear control/Odo leases, close Quick Connect, release reservations, consume or cool down availability, and mark the opportunity terminal. Every operation is replay-safe.
33. **RLS/security:** base availability, opportunity, graph, event, and reservation tables deny authenticated direct writes. Clients use narrow self RPCs and a user-scoped Realtime invalidation table.
34. **Notifications/deep links:** add an independent Always-On invitation preference. Pushes omit member names and pairability detail and route to `/live/opportunity/[opportunityId]`.
35. **Observability:** record bounded reason codes, state transitions, cohort counts, pair-edge counts, timings, worker attempts, failures, session IDs, end reasons, and notification suppression reasons—never raw graph edges or private decisions in public projections.
36. **Feature flags:** availability, shadow detection, invitations, system creation, Odo start, music, automatic ending, internal-only rollout, and market allowlist are independently controlled.
37. **Shadow rollout:** enable availability internally; record opportunities with no reservations/invites; compare eligible cohorts and false-positive reasons; then enable invitations, creation, Odo, and ending in separate steps.
38. **Cost:** opportunity detection uses no model. Cost is bounded SQL plus pushes. Odo narration remains under existing Phase 10A budgets, and music/RTC resources do not start before quorum.
39. **Automated tests:** cover parsing, state transitions, duration bounds, RLS boundaries, expiry, reservation races, dedupe, graph quorum, quiet hours, fatigue, withdrawal, session uniqueness, system authority, cleanup, and deep links.
40. **Physical-device plan:** use at least four real accounts across foreground/background states; verify availability privacy, push deep links, accept/decline/withdraw, formation timeout, RTC entry, explicit pool join, pairing, safety review, drain/end, and recap on iOS and Android.
41. **Load/race/chaos:** concurrently run detector workers, duplicate accept calls, expiry during acceptance, block during quorum, Stream failure/retry, worker crash after resource creation, OpenAI outage, music outage, and controller lease expiry.
42. **10G compatibility:** preserve `program_source`, `control_source`, lease fencing, Director Events, safe program snapshots, mobile/Studio takeover semantics, RTC admission, and service-only controller APIs. No Studio UI is added in 10F.
43. **Database migrations:** system ownership; availability/configuration; opportunities/members/reservations/events/updates; deterministic engine; system session orchestration; recovery/maintenance; health verification.
44. **RPC/Edge changes:** self availability/snapshot/respond RPCs; service detect/reconcile/prepare/finalize/fail/cleanup RPCs; one bounded Always-On Edge worker for Stream resource creation and orchestration.
45. **Mobile files:** Live application contracts/parser/repository, a dedicated availability hook, availability card, opportunity hook/screen, notification routing, exports, and regression tests.
46. **Implementation slices:** (1) ownership model, (2) availability, (3) shadow engine, (4) invitations/quorum, (5) system session/Stream, (6) 10D/10E start, (7) lifecycle cleanup, (8) mobile UX, (9) observability/security/health, (10) runbook and 10G handoff.

## Rollout gate

Production defaults must not invite users or create sessions. A release is eligible for device testing only when the Phase 10F health query reports zero blockers, the Edge worker is deployed, and the internal market/allowlist is configured. Physical-device acceptance remains a separate completion gate.
