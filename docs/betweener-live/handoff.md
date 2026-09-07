# Betweener Live canonical handoff

## Snapshot

- Repository: `https://github.com/Kaakyire9/betweener-app.git`
- Working branch: `feature/betweener-live`
- Baseline at handoff creation: `8fc64c7`
- Current uncommitted worktree base: `78f33b3`
- Expo/React Native baseline: Expo SDK `57.0.18`, React Native `0.86.3`
- Current delivery focus: **Phase 9 paused at the user's request while the
  dating-first Circles information architecture is reorganized and validated**
- Phase 7 has completed three-account development validation. High-concurrency
  and larger-device-cohort validation remains a TestFlight/Play closed-testing
  release gate, not a reason to reopen the Phase 7 architecture implicitly.
- Phase 8 and its reservation-consistency correction were reported working by
  the user on 2026-08-30. The broader physical-device pooling matrix remains a
  prerelease gate.

The full specification is [`master-plan.md`](./master-plan.md). Read it before
this status document when opening a new development thread.

## Status vocabulary

- **Implemented:** code/migration exists in the branch.
- **Automated:** relevant repository regression tests pass.
- **Device partial:** at least one real-device path has been exercised, but the
  complete phase matrix is not recorded as passed.
- **Complete:** all mandatory automated, deployment, iPhone, Android and
  failure-path exit criteria are recorded. No phase below is called complete
  unless that evidence exists.

## Phase ledger

| Phase | Repository status | Device/deployment status | Remaining gate |
|---|---|---|---|
| 0 Audit | Historical audit drove the architecture | Original audit report was not preserved as a standalone file | This handoff and master plan now preserve the durable architecture |
| 1 Foundation | Implemented and automated | Stream/native setup was exercised during later Live testing | Verify current Supabase migration/function ledger before release |
| 2 Public Live | Implemented and automated | Device partial on iOS and Android; public Live, stage and background paths have been exercised | Full role/permission/network matrix and production rollout checklist |
| 3 Hosted Matching | Implemented and automated | Device partial through Match Desk, introductions and private offers | Repeat multi-client decline/reconnect/moderation matrix |
| 4 Private Spark | Implemented and automated | Device partial on real two-person calls | Complete prompt-pack device/accessibility/network matrix |
| 5 Audience Pulse | Implemented and automated | Device partial; placement and sheet conflicts were corrected | Multi-client realtime vote/open/close and small-screen/keyboard confirmation |
| 6 Chemistry First | Implemented, hardened and automated | Device partial; real Quick Connect conversation and reveal have fired after projection fixes | Verify no visual leak on load/reconnect/background; long/missing profile context; dual-ready realtime on both platforms |
| 7 Quick Connect | Implemented through Host controls/public pool, safety and intent-aware pairing; automated | Three development accounts exercised the public pool, Host controls, pairing, private round, Chemistry First, background behavior and safety paths successfully | Validate higher concurrency, larger cohorts and broader device/network diversity in TestFlight and Play closed testing |
| 8 Quorum + Live Session Pooling | Implemented and automated: pairability-capable quorum, cross-session compatibility/rules, transparent offers, opt-out, origin preservation, admin preview, audit and event UI | User reported both Phase 8 migrations applied and the corrected reservation/quorum UI working as expected on 2026-08-30; the full cross-session physical-device matrix is not recorded | Regenerate remote database types, then retain accepted/declined/expired/opt-out, block, verification and origin-preservation coverage as a TestFlight/Play gate |
| 9 Circle Integration | Implemented and automated: dedicated Circle Live tab, Circle-authorized scheduling, linked Pulse Gathering, empty/almost-ready/confirmed/live/recap cards, Live RSVP deep links, content-free realtime and consent-aware Love Seat provenance | `20260830113000_live_phase9_circle_integration.sql` is not yet reported applied; no Phase 9 device matrix is recorded | Apply migration, regenerate types, then validate owner/admin/host scheduling, member RSVP/quorum, Live transition, recap and consent-gated Love Seat origin on iPhone and Android |
| 10 Intelligence | Deterministic Conversation Spark/Connection Signals foundations only | No AI production validation | Host Copilot/provider abstraction and consented explainable generation, after deterministic phases |
| 11 Premium Refinement | Pulled-forward work exists: glass UI, occupancy layouts, PiP/background continuity, native controls and event studio | Device partial | Finish accessibility/performance/discovery and separately govern captions, recording, HLS/highlights/analytics |

### Dating-first Circles reorganization (outside the Live phase ledger)

- The Circles home now separates `My Circles` from `Find Circles`.
- A joined Circle presents only `Circle`, `Discover` and `Live`. `Circle` is
  the default destination, while legacy deep links map into the new structure.
- Pulse, Prompts, Gatherings, Moments and People are editorial preview sections
  on the Circle home rather than a second permanent tab bar.
- Connections is no longer visible Circle navigation. Circle-origin Intents
  graduate into the global Intent, Match and Chat experiences while retaining
  origin metadata.
- Ordinary active members have a read-only People directory. Dating opt-in,
  private passes, eligibility decisions and management controls are not exposed.
- Existing stewardship and safety controls are retained behind Circle options.
- `20260830160000_circle_dating_discovery.sql` adds explicit per-Circle dating
  consent, server-authoritative Circle-scoped candidates, private pass cooldown,
  Circle-filtered connection projection and durable match origin. It does not
  create parallel Circle match or chat pipelines.
- Full architecture and validation notes live in
  [`../circles-dating-experience.md`](../circles-dating-experience.md).
- Repository validation on 2026-08-30: TypeScript passed; targeted ESLint and
  `git diff --check` passed; Live/Circle logic passed 262/262, including ten
  Circle dating/UX regressions. Circle detail and Pulse interaction coverage
  passed 26/26 after being updated for the intentional navigation change. The
  user reported the Circle dating migration applied; device-size validation of
  the simplified surface is not yet recorded.

## Latest product decisions that must survive a thread change

### Public Live and Studio

- The header close action returns to **Your Live Studio**, not blindly to
  Circles. Closing the room and stepping off stage are separate actions.
- A stage participant uses **Leave stage**, not “Leave Live”; the header close
  action leaves the room. The close action belongs at the top-right so the Host
  identity/avatar remains unobstructed.
- Host operations are consolidated into **Live Studio**. It owns Stage Desk,
  Audience Pulse management, invitations and future Host-only tools. Persistent
  admin cards must not cover the public video or Room Pulse.
- Stage requests and new Audience Pulse events need a brief realtime notice for
  the Host. Closing the notice does not consume the durable item; it remains in
  Studio.
- Room Pulse remains the public conversation layer. It briefly announces joins
  only after authoritative participant confirmation. Comments show tappable
  avatars that open a restrained member summary/actions sheet.
- Stage requests are closed by default. Host explicitly opens zero to three
  guest seats; available stage tiles render those seats. Guests cannot request
  when the Host has not opened capacity.
- Event creation is lifecycle-aware: poster/short promo media, date/time,
  countdown, reservation, Live now, upcoming and past outcomes. Scheduled
  events cannot be started early merely by stale client state.

### Background continuity and PiP

- Public Live and private conversations use native background/PiP support, not
  Android overlay permission. Native controls differ by platform; do not fake
  unsupported iOS system-PiP chrome inside React Native.
- PiP selects one deterministic active camera: speaking Host where appropriate,
  otherwise active remote, then safe local fallback. It must not capture the
  entire Live UI, alerts or Room Pulse.
- Screen-awake leases are scoped and released on background/exit; long valid
  Live leases are confirmed, while stale leaks remain observable.
- Native-media continuity changes require fresh EAS development/production
  builds; Expo Go cannot validate Stream WebRTC.

### Private Spark and Chemistry First

- Private Spark is a separate two-person media room. No audience, public
  comments, reactions, Host media, recording or hidden analysis.
- Keep the equal 50/50 private composition. Status labels must remain inside
  their participant surfaces, never hanging over the header or empty canvas.
- Chemistry First starts concealed before any video can flash. Context shows
  only real name/age/city/intent/values; missing fields are omitted.
- “Offer a reveal” is private and realtime. Mutual readiness is required; the
  other person's not-ready state is never disclosed. Reveal never occurs only
  because time elapsed.
- The presentation layer must preserve the RTC video instance while frost is
  removed, including loading/reconnect/background transitions.
- Private exit choices stay private. Only a backend-derived compatible mutual
  result opens the existing match/chat pipeline.

### Quick Connect — approved current direction

- Guests enter the public Live normally. Quick Connect is a facilitated layer
  within that Live, not an immediate hidden rotation entered on arrival.
- The Host remains the facilitator and safety operator. Host pool enrolment and
  Host rotation participation are removed from both UI and server authority.
- Public layout gives the Host stage and Quick Connect pool equal visual weight:
  stacked equal regions in portrait, side-by-side equal regions in the Host's
  alternate orientation. Do not let the pool cover the Host video.
- The public pool is a compact, premium “constellation” of up to eight visible
  people, with avatar, name, age and location where genuinely available.
  Pagination/More exposes additional sets. Use restrained orbit/ambient motion,
  dark teal depth, soft teal/purple focus and reduced-motion fallback.
- The Host never joins the matching pool. Hosting, opening/configuring the
  rotation and operating safety controls must never make the Host matchable.
  Guests still enrol explicitly; joining the public room alone does not enrol
  them.
- Once enrolled, the large join banner disappears and the member appears in
  the pool for others. A persistent **Leave pool** action remains accessible at
  the bottom of the pool experience.
- Automatic pairing must not happen merely because people entered Live. Host
  controls rotation state. Pairing remains server-authoritative and occurs only
  when the configured Host-controlled state allows it.
- A member tap may express private interest. It must not unilaterally create a
  private room, reveal interest, bypass eligibility/blocks/consent, or change
  public stage roles.
- Host opens/configures/pauses/drains/ends rotations through private controls.
  Draining admits no new pairings while existing rounds finish.
- Public Room Pulse remains available while people wait. The private Quick
  Connect round itself has no audience/public comments or Host listening.
- Odd participants wait with neutral copy. Eligibility failure stays private.
  Disconnect/reconnect never becomes a pass.
- Every completed, incomplete or cancelled private round creates one private
  mandatory safety check per participant. A participant cannot rotate again
  until their own check is complete. The other person never sees the answer.
- In-call **End & report** terminates the private round, creates the same safety
  checkpoint for both people and can atomically block future contact/pairing.
- Safety concerns create idempotent `live_reports`, an append-only session
  audit event and a capability-scoped moderation queue. No public star score,
  reputation badge or accusation is exposed.
- Quick Connect can reuse Chemistry First, but the reveal rules remain exactly
  as strict as Phase 6.
- The future desktop **Betweener Host Studio** for screen sharing, music nights
  and movie nights is intentionally deferred until the mobile Master Plan is
  further complete. It requires media-rights, screen-share, moderation and
  platform-policy design; do not fold it into Phase 7 accidentally.

## Phase 7 development exit matrix

The user reported successful development testing across three accounts on
2026-08-29. The matrix remains the closed-testing checklist for concurrency,
device diversity and failure paths that cannot be represented by three
accounts.

### Public lobby and pool

- Host, guest and audience join public Live without unintended private pairing.
- Join-pool copy is fully visible on small Android and iPhone screens.
- Join banner disappears after enrolment; participant appears in realtime on
  every other client without refresh.
- Host cannot join the pool and remains the facilitator/safety operator for the
  entire rotation.
- Leave pool is visible at the bottom and works idempotently.
- Pool renders 1–8 members correctly; 9+ paginates deterministically.
- Portrait stacked and alternate side-by-side layouts are truly equal-sized,
  safe-area correct and do not cover Room Pulse/control dock.
- Ambient movement is premium, battery-conscious and reduced-motion safe.
- Missing age/location/avatar is omitted or gracefully represented, never
  invented.

### Host controls and pairing

- New sessions start closed/facilitator-led.
- Configure duration/capacity, open, pause, resume, drain and end are
  server-authoritative and realtime.
- Opening rotation wakes eligible waiting members without polling/refresh.
- Closed/paused/draining states do not form forbidden new pairs.
- Pairing respects reciprocal gender/age preferences, blocks, active profile,
  verification/safety, prior pairing, active private room and availability.
- Odd member remains safely waiting; no private eligibility reason leaks.
- Private interest is content-free to observers and does not create unilateral
  admission.
- Host controls never expose raw private decisions or interest.

### Private round

- Exactly the paired users receive exact call-scoped, short-lived credentials;
  Host/audience/unpaired members are rejected.
- Timer derives from server time; background/resume cannot extend it by client
  clock manipulation.
- Chemistry First concealment is present before first video frame when enabled.
- Reveal offer/readiness arrives in realtime, remains private and needs mutual
  consent.
- One/both cameras off, mic toggles and camera recovery render correctly.
- Wi-Fi↔cellular, temporary packet loss, backgrounding and token refresh obey
  reconnect grace without generating a romantic choice.
- Leave round, timeout and failed reconnect return safely to public Live/pool.
- Continue/friendship/not-this-time remain private; only allowed derived mutual
  outcome reaches clients/chat.
- Completed rotation prevents immediate repeat pairing and can cleanly start a
  new server-authorized round.

### Multi-client and safety

- Test at least Host + Participant A + Participant B + odd Participant C.
- Test blocked/ineligible combinations without exposing why.
- Test Host disconnect/reconnect and session end while private clients recover.
- Test report/block/leave paths and confirm no Host media access.
- Verify no duplicate participants, rooms, events, decisions or update storms.
- Inspect Supabase/Stream/Sentry logs for tokens, decisions or sensitive data;
  none may be logged.

## Repository architecture

### Routes

- `app/live/index.tsx`: Host/guest Live gateway and Studio catalogue.
- `app/live/schedule.tsx`: event creation/scheduling.
- `app/live/event/[sessionId].tsx`: event details, countdown/reservations/media.
- `app/live/backstage/[sessionId].tsx`: device preview/readiness and admission.
- `app/live/[sessionId].tsx`: public Live stage, Room Pulse and role controls.
- `app/live/private-spark/[privateSparkId].tsx`: Private Spark experience.
- `app/live/quick-connect/[sessionId].tsx`: private Quick Connect round.

### Feature boundaries

- `features/live/domain`: capabilities and explicit session, participant,
  match, Chemistry and Quick Connect domain rules.
- `features/live/application`: models/parsers, repository, lobby/event media,
  arrivals/member actions and refresh policy.
- `features/live/media`: provider abstraction, Stream adapter/leases, public,
  private and Quick Connect admission, recovery and PiP actions.
- `features/live/hooks`: session/media, matching, private, Chemistry, Quick
  Connect pool/Host control and chrome/milestones.
- `features/live/components`: public/private stages, compact header, glass
  surfaces, Studio/Stage Desk, Room/Audience Pulse, member summaries, Quick
  Connect pool/Host panel/dock and Chemistry/private overlays.
- `features/live/navigation`: deterministic Studio/room navigation.

Keep Stream details in `features/live/media`. Keep security-sensitive product
transitions in Supabase. Avoid growing route files with reusable domain logic.

### Edge Functions

- `live-rtc-token`: public/backstage RTC admission.
- `live-private-spark-token`: exact private-pair admission.
- `live-private-spark-control`: trusted private media termination/control.
- `live-quick-connect-token`: exact Quick Connect pairing admission.
- `live-control`: provider-side control jobs after Supabase authorization.

Functions must remain JWT-verified, no-store, rate-limited where applicable and
pinned to reviewed dependencies. Never expose Stream secrets or log tokens.

### Database anchors

Core tables cover sessions, participants/roles/capability assignments, seat
requests, session events, provider webhook/control jobs, comments/reactions,
reports/moderation, match rounds/responses/updates, private Sparks/consents/exit
responses, Audience Pulse templates/polls/options/votes/updates, Chemistry
conversations/readiness/events/updates, Quick Connect controls/participants/
rounds/pairings/decisions/interests/events/updates and maintenance failures.

All client-sensitive mutations are RPC-owned. RLS and grants must protect raw
consent, readiness, decisions, Host-only operational data and unrelated private
rooms.

## Migration order and deployment caution

Apply repository migrations strictly by filename. Live anchors and hardening in
the current branch are:

```text
20260812103000_betweener_live_phase1_foundation.sql
20260812113000_live_rtc_token_rate_limit.sql
20260812190000_betweener_live_phase2_public_beta.sql
20260813100000_fix_live_rsvp_backstage.sql
20260813154500_live_host_stage_invariant.sql
20260813173000_live_capacity_presence_and_room_pulse.sql
20260813203000_live_phase3_hosted_matching.sql
20260815060000_live_match_availability_invalidation.sql
20260815234500_live_hosted_match_pairability.sql
20260816090000_live_pairability_discovery_alignment.sql
20260816120000_live_private_spark_handoff.sql
20260816150000_fix_live_private_spark_participant_transition.sql
20260816173000_fix_live_private_spark_profile_binding.sql
20260816180000_decouple_private_spark_from_public_presence.sql
20260816184500_fix_private_spark_admission_column_ambiguity.sql
20260816200000_private_spark_experience_projection.sql
20260816210000_private_spark_exit_decisions.sql
20260820153000_live_io_and_realtime_hardening.sql
20260821100000_live_private_spark_chat_origin.sql
20260821130000_live_phase5_audience_pulse.sql
20260821203000_live_stage_request_intake.sql
20260824110000_live_session_structure_realtime.sql
20260824123000_live_stage_request_capacity.sql
20260824170000_live_participant_self_stage_departure.sql
20260824183000_live_participant_arrival_realtime.sql
20260824210000_live_arrival_notice_state_confirmation.sql
20260825090000_harden_live_participant_self_stage_departure.sql
20260825120000_live_phase6_chemistry_first.sql
20260825130000_live_phase7_quick_connect.sql
20260826100000_live_event_studio.sql
20260826150000_harden_chemistry_first_concealment.sql
20260827090000_fix_live_chemistry_projection_visibility.sql
20260827110000_harden_live_quick_connect_admission.sql
20260827123000_harden_live_quick_connect_queue_progress.sql
20260828073000_harden_live_chemistry_read_idempotency.sql
20260828100000_fix_live_chemistry_update_trigger_record_shape.sql
20260828160000_live_quick_connect_host_control_room.sql
20260828190000_live_quick_connect_public_pool.sql
20260829100000_live_quick_connect_host_pool_enrollment.sql
20260829150000_live_quick_connect_shared_stage_layout.sql
20260829170000_live_quick_connect_private_safety.sql
20260829210000_live_quick_connect_reliability.sql
20260829211500_live_quick_connect_waiting_fairness.sql
20260829213000_live_quick_connect_intent_matching.sql
20260829220000_live_phase8_quorum_session_pooling.sql
20260830100000_fix_live_quorum_reservation_consistency.sql
20260830113000_live_phase9_circle_integration.sql
20260830160000_circle_dating_discovery.sql
```

Repository presence does not prove a remote project applied every migration or
deployed every function. Before new backend work, compare the linked project's
migration ledger and function deployments. Never re-run destructive test-reset
SQL against production data without exact user IDs/session scope, a transaction
and a reviewed rollback/impact statement.

## Automated validation baseline

At the current uncommitted Phase 8 worktree based on `8fc64c7`:

- TypeScript: passed on 2026-08-29.
- Targeted Phase 8 ESLint: passed on 2026-08-29.
- Live logic: 244/244 passed on 2026-08-29, including 7 Phase 8 regressions.
- `npx expo-doctor`: 21/21 checks passed on 2026-08-29.
- `git diff --check`: passed on 2026-08-29.
- Supabase migration/function ledger verification: blocked by CLI HTTP 401
  (`LegacyDbConfigLoginRoleStatusError`). No Phase 8 migration was pushed and
  generated remote database types were not refreshed.

On 2026-08-30 the user reported the Phase 8 migration applied successfully.
The event screen then exposed a stale-catalog/quorum display discrepancy. The
repository now uses the quorum projection as the single event-detail attendance
source and distinguishes confirmed lifecycle from current viability through
`20260830100000_fix_live_quorum_reservation_consistency.sql`. TypeScript and
targeted ESLint passed; Live logic passed 245/245, including 8 Phase 8 tests.

On 2026-08-30 Phase 9 Circle Integration was implemented in the repository.
The Circle Live tab consumes a server-owned snapshot; scheduling atomically
creates a `circle_live` session, a Gathering that references it through
`gatherings.live_session_id`, and a Pulse entry. Circle tables do not duplicate
Live lifecycle/quorum state. Love Seat provenance is optional and can only be
attached through the Live-specific nomination RPC when the featured member had
explicitly enabled introductions. TypeScript, targeted ESLint and
`git diff --check` passed; Live logic passed 251/251, including 6 Phase 9 tests.
The Phase 9 migration has not been reported applied. Project-local Supabase
schema lint ran, but the local database does not include this pending migration;
it reported only existing unrelated legacy-function errors, so deployment-time
migration compilation is still required.

On 2026-08-31 the Circles Home information architecture was refined without
changing Live or Circle product authority. `My Circles` now presents Your
Circles, the single `What matters now` Gathering surface (Live or in-person),
private cross-Circle Picks, global Relationship Gist, then invitations. Circle
Picks precede editorial guidance and use a reduced-motion-safe shared-context
reveal with portrait-led cards. Prompts and Warm Introductions remain inside an
individual Circle. `Find Circles` remains the only Circle-discovery surface;
the former duplicate bottom discovery CTA was not restored.

The same 2026-08-31 refinement pass then made profile exits origin-aware for
Vibes, Circle detail and Circles Home. The duplicate floating Intent shortcut
was replaced with the Vibes-style Pass action; Like, Request, Pass and a sent or
queued Gift return to the originating surface, while Save intentionally keeps
the profile open. Circle Picks now size responsively to show three portraits on
a phone, retain horizontal capacity for additional server-ranked Picks and use
a translucent lower scrim for readable identity/context. The Circles Home Live
gateway now supports event poster media, layered cinematic gradients, restrained
ambient depth and a clearer destination CTA without adding looping motion.

The final 2026-08-31 Circle Home polish removed the duplicate upper-right Live
chevron and retained one destination CTA. Circle Picks now show two portraits
at once, expose a `+N` horizontal continuation cue and center a single result.
`20260831233000_circle_home_pick_rotation.sql` makes unseen eligible Picks rank
first and then rotates the least-recently shown candidate after the pool is
exhausted. Only the two visible cards record impressions. Apply this migration
after `20260831113000_circle_home_picks.sql`; the UI change itself requires no
schema regeneration because the RPC signature is unchanged.

The later recommendation hardening sequence
`20260901133000_recommendation_rotation_foundation.sql` through
`20260901133300_circle_recommendation_rotation.sql` supersedes the
render-to-render Circle Picks behavior with a server-persisted 72-hour field.
The ordered migrations also add daily Circle discovery and Intent Suggested
fields, a server-owned daily Relationship Compass ranker, and a seven-day
Closure to Clarity field. See `docs/recommendation-surface-rotation.md` before
changing those intervals.

Earlier baseline `8fc64c7` checks after the Expo/Metro security work:

- `npx expo-doctor`: 21/21 checks passed.
- TypeScript: passed.
- Jest: 144/144 passed.
- Chat logic: 166/166 passed.
- Vibes logic: 38/38 passed.
- Liveness logic: 6/6 passed.
- Live logic: 223/223 passed.
- Android clean Expo export: 5,938 modules bundled.
- iOS Expo export: 5,846 modules bundled.
- npm audit: zero high/critical; 14 moderate Expo/Xcode/UUID tooling-chain
  findings remain. Do not use `npm audit fix --force`.

These checks prove repository compatibility, not WebRTC real-device behavior or
remote deployment.

## 2026-09-06 Live Creation Studio lifecycle pass

The mobile Creation Studio is implemented locally as a guided Moment, Story,
Room and Review flow. New drafts recover from device storage and publish with a
stable request key so a network retry cannot create a second Live. Existing
hosted events can be edited or rescheduled with optimistic version checks;
confirmed guests move to `needs_reconfirmation` when the time changes.

The event management surface now supports editing, rescheduling, creating a
copy, cancellation with a retained reason and archival after a terminal state.
Cancellation is the safe pre-Live replacement for deletion; the authoritative
safety and moderation record is never hard-deleted. The event page also exposes
host preparation, sharing and backstage readiness.

The backend rollout is intentionally split into an expand-only lifecycle
migration, concurrent indexes and online constraint validation:

- `20260906170000_live_creation_studio_lifecycle.sql`;
- `20260906171000_live_creation_studio_indexes_concurrently.sql`;
- `20260906172000_live_creation_studio_validate_constraints.sql`.

Production 1.1.1 retains `rpc_list_live_studio_sessions(integer,timestamptz)`
with its original return shape. The new client alone opts into
`rpc_list_live_studio_sessions_v2(integer,timestamptz)`. All three migrations
were replayed from a clean local database. On 2026-09-06 the user reported that
all three were then applied successfully to production project
`jbyblhithbqwojhwlenv`, followed by remote type generation. The reported final
1.1.1 production gate returned `healthy = true` and zero for every release
blocker, including the legacy Live catalogue blocker. The dedicated
`live_creation_studio_health.sql` production result is still required and has
not yet been reported.

The user then exercised the four-step Studio on iPhone and reported that the
overall creation experience looked correct. The pass exposed three refinements:
the Host Note could sit behind the software keyboard; the pre-Live host screen
looked like a guest invitation and its overflow icon was inert; and starting a
room could attempt an invalid one-hop lifecycle transition. The local fix now
uses keyboard-aware scrolling, distinguishes host preparation from the guest
invitation, gives the overflow a real details/share/edit/reschedule sheet, and
starts through `confirmed`, `backstage`, then `live` using fresh snapshots and
bounded version-conflict retries. These refinements still need an iPhone and
Android retest before being called device-complete.

Validation for this pass:

- full TypeScript check passed;
- full repository ESLint passed with zero warnings;
- Expo Doctor passed 21/21 checks;
- full `test:all` command passed;
- Live regression suite passed 274/274 after the Studio refinement pass;
- Creation Studio draft suite passed 5/5;
- local Supabase pgTAP passed 237/237 across 12 test files;
- local Studio health passed with zero blockers and the legacy 1.1.1 Live
  catalogue signature and shape both healthy.

The clean reset command itself returned nonzero after PostgreSQL finished
because the pre-existing local `storage-api:v1.26.5` container resumed a
restart loop on a duplicate internal Storage migration name. PostgreSQL, REST
and Kong remained healthy, and database validation completed. Repair or refresh
that local-only Storage container before device media-upload testing; do not
confuse it with a remote Storage or Studio schema failure.

These automated checks do not replace physical-device validation of date/time
pickers, media selection, deep-link sharing, push delivery, reschedule
reconfirmation and cancellation UX.

## Operational checks before continuing backend work

```powershell
git branch --show-current
git status --short
npx.cmd supabase@latest migration list
npx.cmd supabase@latest functions list
npm.cmd run typecheck
npm.cmd run test:live-logic
npx.cmd expo-doctor
```

Use `npx.cmd supabase@latest db push` only after reviewing every pending
migration. Deploy only the Edge Functions changed by the coherent phase.

## Known production/operational history

- Supabase experienced severe Disk IO budget pressure and connection timeouts.
  Live Realtime/presence was hardened and maintenance consolidated. Continue to
  avoid high-frequency table writes, per-member channels and client polling.
- Current scheduled database jobs last reported included daily phone cleanup,
  Vibes refresh every five minutes, hourly Live ephemeral cleanup and hourly
  subscription renewal. Re-check actual remote cron state rather than relying
  on this historical snapshot.
- The PostGIS `spatial_ref_sys` advisor remains extension-owned and could not be
  altered by a normal migration owner. Do not destabilize PostGIS merely to
  silence an advisor.
- Auth/API timeouts and HTTP 401s observed during IO depletion were service
  health symptoms, not proof that client snapshot recovery grants protected
  authorization. Persisted profile snapshots never authorize protected writes.

## Safe next task

1. Read `master-plan.md` and this handoff completely.
2. Verify clean branch and remote migration/function ledger.
3. Verify the reported Phase 8 deployment in the remote ledger; do not confuse
   cross-session pooling with the single-session Quick Connect participant pool.
4. Review and apply `20260830113000_live_phase9_circle_integration.sql`, then
   regenerate remote database types.
5. Validate Circle owner/admin/host scheduling, linked Gathering/Pulse entry,
   member RSVP and quorum, confirmed/live/recap transitions, deep links and
   consent-gated Love Seat provenance on physical iPhone and Android. Retain
   the remaining Phase 8 pooling matrix as a prerelease gate, then prepare a
   production-signed prerelease candidate for TestFlight and Play closed
   testing; this is not authorization for a public production launch.
6. Grow the prerelease cohort gradually and use it to validate pooling,
   simultaneous-pair load, device/network diversity and operational
   observability before Phase 10/11 release decisions are frozen.
7. Complete the authorized Phase 10 intelligence scope and Phase 11 premium
   refinement, then cut a final release candidate and repeat the release gates.
8. Keep desktop Host Studio deferred until the mobile Master Plan permits it.

## Handoff maintenance rule

After each meaningful pass, update:

- branch-tip commit;
- phase ledger status;
- migrations/functions deployed;
- exact automated checks and counts;
- iPhone/Android/device-network results;
- current known defects and next task;
- any product decision that changes the Master Plan interpretation.

Do not overwrite historical uncertainty with assumptions.
