# Connect V1 security model

> This records the M0 design. B1's local repair is in document 00. Implemented
> Connect authorization, local security evidence and remaining provider limits
> are now recorded in [document 11](11-connect-v1-m1-implementation.md).

Status: **proposed; implementation BLOCKED by M0 finding B1**. This document
defines required boundaries, not guarantees supplied by the current application.

## Identity and policy

The authenticated actor is `auth.uid()`. Stream user IDs use that Auth identity.
Resolve profiles on the server: match participant IDs and Intent actor/recipient
IDs refer to `profiles.id`, while blocks refer to Auth user IDs. Ignore client
`isMatched`, `canCall`, actor IDs, role claims and cached grant decisions.

Both accounts must be active and non-deleted, not suspended/banned, and eligible
under current account/identity/moderation restrictions. Check authoritative Auth
records as well as profiles. A valid unexpired JWT alone cannot prove a deleted
account is still eligible. For strict immediate session revocation, validate the
Auth session as part of sensitive admission. Never authorize from user-editable
JWT metadata or the profile display name.

`MATCHED_CONNECTION` requires trusted mutual relationship formation. The current
`matches.status = ACCEPTED` value is insufficient because ordinary participants
can write it. Do not expose this mode until B1 is fixed and regression tested.

`PRE_MATCH_CONSENT` requires separately recorded recipient approval on the exact
Intent Request: voice, video, or both, never beyond the sender's requested media.
Approval permits only requester -> recipient initiation. Reading/accepting an
Intent Request or auto-closing it on match creation does not grant calls.
Consent is revocable and expires under a server-configured policy. Relationship
changes invalidate the pre-match grant; an eventual mutual match can authorize
future calls through its own mode after all other checks. Never revive an old
pre-match grant after unmatching.

Extend the existing Intent Request model with protected typed fields. Direct
inserts must initialize approval fields empty even if an attacker supplies them.
Only an authenticated recipient command can approve; revocation must remain
available when feature flags are disabled. Client-writable metadata is not a
grant. No duplicate match or general relationship store is proposed.

## Command boundary

| Operation | Required authority and invariants |
| --- | --- |
| Eligibility / receive check | Authenticate; current account/block/privacy/relationship/media/rollout policy; return safe availability, not another user's private restriction reason |
| Create | Recheck policy under ordered user/pair locks; consume configurable user/pair rates; bind idempotency key to actor plus canonical payload; reserve both users atomically; generate unpredictable fresh ID and expiry |
| Accept | Actual callee only; current eligibility and invitation deadline; version fence; one winning device/installation; replay by another device cannot acquire media authority |
| Decline / cancel | Callee / caller respectively; compatible current state; idempotent terminal result; no provider resurrection |
| End | Participant or trusted safety process; terminal state and end time immutable; enqueue provider termination and membership revocation |
| Revoke | Grant recipient, or authorized safety process; invalidate new admission and reconcile affected sessions; no client-written grant state |
| History / snapshot | Participant-scoped, bounded/paginated safe metadata; no arbitrary caller/callee filter that exposes other users' records |
| Provider reconciliation | Verified server callback, expected app/type/call/session, replay fence and legal versioned transition; ordinary clients cannot mark ACTIVE |

Safe errors should distinguish retryable setup failure/busy/expiry from denied
admission without disclosing bans, blocks or another user's relationship history.
Persist safe reason codes for restricted server-side diagnostics.

## Database and concurrency

Use private implementation tables with explicit privileges and RLS defense where
appropriate. Public RPCs need narrow EXECUTE grants, authenticated actor checks
and fixed search paths; private definer helpers must not be callable by ordinary
users. Granting `authenticated` access alone is not row authorization.

Reserve one occupancy row keyed by each Auth user. Acquire locks in a stable
order, including block, revocation and relationship mutations. Per-column caller
and callee uniqueness cannot enforce one active call across both roles. Test
simultaneous A->B/B->A, A->B/A->C and two-device acceptance on separate connections.
Use versioned transitions and immutable terminal results. Retries with the same
idempotency key must compare payloads and never create another call ID.

Provider network requests cannot share a Postgres transaction. Persist outbox
work, recheck policy before ringing/token issuance, fence stale workers, and
compensate if a provider call is created after cancellation/blocking. Reconcile
orphaned provider resources after crash/restart. A database terminal state alone
does not prove provider media stopped.

## Provider permissions

Create a dedicated private call type in an explicitly verified non-production
Stream app. Server-created calls have exactly the two authorized user members
and a trusted server creator. Specify role grants explicitly, including ordinary
users, members and any creator behavior, rather than inheriting permissive defaults.

- Ordinary users cannot create, read or join arbitrary Connect calls.
- Members have only required read/join/media capabilities; no arbitrary invite,
  member/role edits, permission changes, setting changes or joining ended calls.
- Recording, transcription, screenshare and broadcast capabilities/settings are
  disabled; voice admission cannot silently authorize a video upgrade.
- End/ring/admission work stays behind the Connect backend where required to
  preserve consent and lifecycle authority.

Call tokens confer membership; they do not revoke an ordinary user's existing
grants. Test direct SDK and HTTP requests with tokens from **all same-app token
issuers**, including Live/Private Spark. Backend button checks are insufficient.
Do not broaden global grants or Live permissions. Never ship Stream secrets or
service-role keys to mobile. Actual encryption and retention settings have not
been verified; no end-to-end-encryption claim is supported by this audit.

## Safety and flags

A block must atomically invalidate affected grants, terminalize the session,
fence every new admission/reconnect, and schedule provider end/removal with retry.
Test provider outages and in-flight provisioning. Immediate remote media stop
cannot be promised until the provider path and failure semantics are tested.
Apply corresponding account deletion/suspension and relationship-removal policy;
V1 proposal is to terminate affected calls on loss of their authorizing relationship.

Normal rollout flag changes stop new calls/upgrades, while existing authorized
calls can drain. Explicit emergency shutdown invalidates admission and ends calls.
Keep terminal cleanup and revocation available in disabled mode. Separate master,
voice, video, pre-match and native-ringing kill switches must default off on the
server and client; production stays explicitly fenced during development.

## Threat and proof inventory

| Threat | Required mitigation / current evidence |
| --- | --- |
| Unilateral match / consent forgery | **FAIL:** local match exploit reproduced. Harden authoritative writes first. |
| Enumeration / caller spoofing / unrelated history | Auth-derived actor, private members, participant reads, fresh IDs; Connect tests NOT_TESTED |
| Spam / repeated declines or misses | Existing atomic rate-limit pattern with server-reviewed configurable budgets and cooldowns; NOT_IMPLEMENTED |
| Stale grant / block races | Ordered transactional checks plus outbox/provider fences; NOT_IMPLEMENTED |
| Stolen/replayed credentials / multi-device answer | Session/account validation, short-lived admission and device-bound acceptance; NOT_IMPLEMENTED |
| Webhook forgery/replay | Exact raw-body provider signature validation, event identity, dedupe and state/version reconciliation; NOT_IMPLEMENTED |
| Terminal resurrection | Immutable terminal state, no join-ended capability, expired admission denial; NOT_TESTED |
| SDK/API bypass / cross-domain token access | Real non-production direct-provider deny tests; BLOCKED on verified configuration |
| Media/privacy leaks | No private media content collection; explicit provider settings and telemetry allowlist; provider settings NOT_TESTED |

Official references: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Stream call-token behavior](https://getstream.io/docs/platform/authentication/),
[Stream member-only access](https://getstream.io/video/docs/api/calls/).
