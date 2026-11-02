# Connect V1 call state machine

Status: **local M1 lifecycle implemented and tested**. Current code is in
`features/connect/domain/connect.ts` and `20261028074908_connect_v1_foundation.sql`.
See [document 11](11-connect-v1-m1-implementation.md) for evidence and actual API
behavior. The following retains the original design: M1 returns a busy error
without a second session, and does not permit caller cancellation after acceptance.

## Proposed canonical states

`IDLE` is local UI state, not a persisted call session. Persist a call only after
authorized creation. Terminal states are `ENDED`, `DECLINED`, `CANCELLED`, `MISSED`,
`FAILED`, `BUSY`; they never transition back into a live state. A rejected busy
creation can instead return a safe error without allocating a session.

| From | Allowed next state | Authoritative evidence |
| --- | --- | --- |
| REQUESTED | RINGING, CANCELLED, FAILED, MISSED | Provider invitation acknowledged, caller cancel, setup failure or setup deadline |
| RINGING | ACCEPTED, DECLINED, CANCELLED, MISSED, FAILED, BUSY | Callee/device acceptance, callee decline, caller cancel, server deadline or setup rejection |
| ACCEPTED | CONNECTING, CANCELLED, ENDING, FAILED | Media admission/setup begins; cancellation/end/failure before connection |
| CONNECTING | ACTIVE, ENDING, FAILED | Trusted evidence of both authorized participants in the expected provider session, end request or bounded setup deadline |
| ACTIVE | RECONNECTING, ENDING, ENDED | Loss of transport, participant/safety end, verified provider end |
| RECONNECTING | ACTIVE, ENDING, ENDED, FAILED | Verified recovery, end, provider end or exhausted recovery grace |
| ENDING | ENDED, FAILED | Provider cleanup acknowledgment or bounded unrecoverable failure; admission remains fenced throughout |
| Any nonterminal | ENDED or FAILED for a validated safety cause | Server safety command handles block/revocation/account invalidation with a stable reason code |
| Any terminal | Same terminal only | Idempotent response; ignore/audit late events without changing terminal outcome |

Normal flag updates do not force an active call terminal. Safety termination
does. Unexpected events are rejected or reconciled from a fresh snapshot, never
accepted because the client's last rendered state made them appear plausible.

## Timestamps and duration

Use server time for authoritative timestamps. `accepted_at` records winning
invitation acceptance; it is not `connected_at`. Select the first server
reconciliation that confirms both authorized users actually joined the same
provider session as the connected boundary. A session-start event proving only
one participant exists is insufficient. Signed provider events may be delayed;
document the resulting conservative setup/duration measurement rather than
backdating from untrusted client clocks.

Set `ended_at` once, at authoritative termination. Duration is null until there
is connection evidence and an end time; then floor the nonnegative difference
in seconds. Ringing and media setup time are excluded. This definition includes
bounded reconnect grace after first connection; it does not measure speaking
time or uninterrupted packet delivery. Add separate quality/reconnect metrics.

## Ordering, replay and recovery

Each session has a schema version, mutation version and ordered server events.
Commands carry expected version and actor-scoped idempotency key; key reuse with
a different payload fails. Persist terminal state in the session transaction,
with occupancy release, safe audit event and provider cleanup work. Mark stale
provider work with a generation/version fence so it cannot ring or admit users.

Provider events require matching call type, call ID, application and provider
session identity. Deduplicate event IDs; reconcile delayed events against stored
terminal state and current membership. One device wins acceptance. The losing
device dismisses ringing and receives no second media admission. After restart,
load the authenticated server snapshot before rendering/answering/joining.

Server deadlines expire setup/ringing and release stale occupancy even when no
app is open. Reconciliation must survive worker crashes. SDK transport recovery
stays SDK-owned; application retries are bounded and never create a replacement
call with a fresh ID for the same command.

Tests to implement: exhaustive legal/illegal edges, duplicate commands, reversed
provider events, accept-versus-timeout, cancel-versus-provider-create, two-device
acceptance, terminal invariance, immutable end times and nullable duration.
