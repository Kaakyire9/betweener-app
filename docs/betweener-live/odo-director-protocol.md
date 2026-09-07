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
