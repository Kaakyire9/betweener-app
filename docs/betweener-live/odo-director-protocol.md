# Betweener Live Odo director protocol

## Phase 10A boundary

Phase 10A is a production-shaped, shadow-only foundation. `odo_enabled`
defaults to `false`; `shadow_mode` is constrained to `true`; Copilot,
Autopilot, Conversation Spark, Audience Pulse and music flags are constrained
to `false`. Odo cannot change a scene, round, participant, matcher, RTC call,
Stream call, Quick Connect result, Studio UI, or session lifecycle.

The only successful Phase 10A path is:

1. A narrow service RPC authorizes the requesting Host/admin, checks budgets,
   acquires a fenced lease and returns a content-minimized snapshot.
2. That database transaction ends.
3. The Edge worker selects the model, calls the provider once, strictly parses
   the response and runs the separate Odo Content Gate.
4. Invalid, timed-out or unavailable results become a deterministic `WAIT` or
   `NO_ACTION`. Unsafe generated copy is replaced from a curated deterministic
   pack. Neither path retries or automatically escalates.
5. A new narrow service RPC locks fresh rows and rechecks the lease generation,
   TTL, action identity, snapshot/state/session versions, flags, session and
   round state, content result and token budgets.
6. The outcome, normalized usage/cost and content-free trace are persisted.
   No participant-visible director event is emitted.

No transaction or row/advisory lock survives the provider network call.

## Versioned contract

Actions use `schemaVersion: 1` and a closed vocabulary. Every action carries a
server-issued `actionId`, `sessionId`, `snapshotVersion`, `leaseGeneration` and
`expiresAt`. Unknown action types, fields, URLs, SQL/RPC/function names, Stream
identifiers, UI component/route instructions, malformed identifiers, stale
versions and oversized payloads are rejected in TypeScript and PostgreSQL.

Director snapshots expose the monotonic anchors `latestSequenceNumber`,
`currentScene` and `currentStateVersion`. Current clients ignore unknown
optional snapshot fields. Unknown future event types are converted to a
content-free `UNKNOWN` event while preserving sequence/state anchors, so the
client safely keeps its current scene and refreshes the authoritative snapshot.

Director events carry `sequenceNumber`, `source`, `visibility`, `actionId`,
`stateVersion`, `occurredAt`, `createdAt` and optional `expiresAt`. Source is a
closed `odo | host | system | moderator` vocabulary. Visibility is explicitly
capability-filtered (`participant | host | moderator | admin | internal`), and
internal events are never returned to clients.

Realtime publishes only `live_director_updates`, a content-free invalidation
row. Ordered event payloads are retrieved through a capability-filtered RPC.

## Trust and content

The Odo constitution is stable and versioned separately from the dynamic JSON
snapshot. Session/profile data is explicitly untrusted data, never
instructions. Phase 10A supplies no participant profiles. Future profile input
must pass the fixed curator allowlist (display name, age band, language,
conversation interests, cultural-affinity tags and Live intent); raw biography,
private media, transcripts and arbitrary profile fields are excluded.

Generated copy passes the `OdoContentGate` abstraction. A content failure uses
deterministic fallback and cannot cause a second LLM call.

## Model routing and cost

Clients cannot submit a model, provider, prompt, complexity or action. Server
routing is:

- Luna: routine synchronous default (`ODO_LUNA_MODEL`).
- Terra: deliberate server-classified complex escalation
  (`ODO_TERRA_MODEL`), with a separate per-session budget.
- Sol: offline-only (`ODO_SOL_MODEL`); it is never used for a synchronous
  provider request.

Timeout, invalid JSON, rate limit and provider failure use deterministic
fallback without escalation. Provider request ID, latency, input/cached-input/
output tokens, routing reason, fallback status and price-versioned estimated
cost are stored without prompts, generated copy or member content. When Odo is
enabled, `pricing_version` must not remain `unconfigured`. Limits include one
in-flight call, minimum interval, per-minute and task-specific bursts,
per-session calls/tokens, Terra calls and a global circuit breaker.

## Operations

Deploy the four migrations in order, deploy `live-odo-director`, set the three
server model environment variables and `OPENAI_API_KEY`, and configure a
versioned pricing map. Run
`supabase/verification/live_odo_phase10a_health.sql` before enabling shadow
traffic and after every change. During 10A, `visible_event_release_blockers`
must remain zero.

Host takeover is an authenticated, capability-checked, idempotent internal
state fence. It increments the lease generation and rejects in-flight work.
Autopilot resume exists only as an explicit Phase 10B gate and always returns a
disabled outcome in Phase 10A.

## Phase 10B boundary

Phase 10B adds private, expiring Copilot suggestions to the existing Live
Studio. Generation remains side-effect free. Only the authenticated Host use
RPC may turn a fresh suggestion into an existing Spark/Pulse projection or a
participant-visible Director event, and every such event is attributed to the
Host rather than Odo. The use transaction rechecks capability, flags, circuit
breaker, TTL, session/state/round versions and Content Gate status.

See [Odo Copilot Phase 10B rollout](./odo-copilot-phase10b-runbook.md) for the
deploy, staged enablement, device validation and emergency-pause procedure.

## Phase 10C boundary

Phase 10C permits only the guarded presentation vocabulary: narration of an
already-authorized pair, predefined scene requests, bounded Conversation
Sparks and Audience Pulse, visual intermissions, time cues, transition copy,
`WAIT`, and `NO_ACTION`. Pairing, consent, participant/stage control,
moderation, RTC, music, and session lifecycle remain outside Odo authority.

See [Odo Guarded Autopilot Phase 10C](./odo-guarded-autopilot-phase10c-runbook.md).

## Phase 10D boundary

Phase 10D adds a separate, internal-only Full Quick Connect capability. The
Host must explicitly enable it for a live `quick_connect` session. Odo may
open the existing Quick Connect control, wake its deterministic sync engine,
observe pair/round state, pace pair-private presentation, enter low-liquidity
mode, drain current pairs, and close only the Quick Connect segment.

The existing `live_quick_connect_sync` engine remains the sole AutoMatcher and
round-lifecycle authority. Neither the client nor Odo worker can provide an
action, person, pair, model, prompt, RTC call, or private decision. Pair-scoped
Odo Sparks are stored on the authoritative pairing and are returned only to
the two pair participants; Realtime contains only content-free invalidations.

`full_quick_connect_autopilot_enabled` is independent of the future
`full_autopilot_enabled` full-show capability. Phase 10D keeps full-show
Autopilot and music disabled and never starts or ends the parent Live session.
Take Control fences future work while preserving the active pair and RTC
truth. Safety clearance returns to manual mode and always requires a separate
Host resume.

See [Odo Full Quick Connect Autopilot Phase 10D](./odo-full-quick-connect-phase10d-runbook.md).

## Phase 10E boundary

Phase 10E adds a Show Director that is explicitly separate from the Phase 10D
Quick Connect lifecycle. Its service-only deterministic reconciler observes
authoritative Live, pool, pair, round, audience, and music state and may select
only a predefined public presentation scene. It cannot choose participants,
advance a pair, change consent or outcomes, issue RTC credentials, moderate, or
start/end the parent Live.

Show state is versioned and durable. One shared Odo fence prevents conflicting
workers, while the independent program-controller model identifies `odo`,
`mobile_host`, or `studio_host` control and `mobile` or `studio` program output.
Host scene changes have priority and a suppression window; Take Control fences
future automatic work, and Resume always reconciles fresh state.

Music remains a separate engine. Clients cannot send a URL, storage path, model,
prompt, scene action, or track choice to either Edge worker. Tracks come only
from a private, approved, unexpired catalogue. The server returns short-lived
playback grants to eligible main-room audience devices and denies publisher
devices and private experiences. This mobile delivery is a safe interim path,
not a shared RTC program mixer. The Studio protocol is defined, while Studio UI,
screen sharing, Odo voice, and arbitrary/commercial music remain disabled.

The reserved Studio command vocabulary is versioned in the shared 10E domain:
`TAKE_CONTROL`, `RESUME_ODO`, `SET_SCENE`, `SET_QUICK_CONNECT_LAYOUT`,
`PLAY_MUSIC`, `PAUSE_MUSIC`, `NEXT_TRACK`, `SET_MUSIC_MOOD`,
`SET_MUSIC_VOLUME`, `ENABLE_AUTO_DUCK`, `DISABLE_AUTO_DUCK`,
`OPEN_AUDIENCE_PULSE`, `START_INTERMISSION`, and
`FINISH_CURRENT_CONNECTIONS`. Each envelope has a command UUID, session UUID,
schema version, expected state version, and command-specific closed payload.
There is no arbitrary command or JSON instruction branch. A future Studio
transport must map these commands onto the same capability-gated Host RPCs; the
contract itself grants no authority.

See [Odo Show Director Phase 10E](./odo-show-director-phase10e-runbook.md) and
the [Phase 10D to 10E architecture audit](./odo-show-director-phase10e-audit.md).
