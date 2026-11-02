# Stream technical enquiry: absolute active-media enforcement

Date: 2026-10-30. **DRAFT — NOT SENT.** Prepared for owner/security review. This file authorizes no support contact, provider operation, configuration change, fixture or implementation. The underlying specification is [Report 34](34-connect-v1-m2c-security-contract.md).

## Copy-ready enquiry

**Subject: Video/SFU security contract — autonomous expiry, revocation bounds and end ACK semantics on a custom private-call type**

Hello Stream engineering/support,

We are evaluating private two-person voice/video calls using our custom `betweener_connect` type. Retained staging evidence is from application **1731011, Betweener Staging**. Our server SDK is pinned to **@stream-io/node-sdk 0.7.63**; inspected client versions are video-client **1.62.0** and React Native SDK **1.46.3**. Authentication and permission checks were enabled in retained configuration. We need supported guarantees and versioned API/configuration references before further capability verification; please do not change our application settings.

Betweener authorizes verified matches or recipient-approved, directional, media-specific pre-match consent. It uses invited/read-only membership before admission, restricted voice/video roles afterward, ordinary short-lived user JWTs and durable end jobs. Participants have no settings/member/permission editing, recording/egress or ended-join powers. Current participants also lack `end-call`; we are separately reviewing that one additional membership capability as a backup request path.

**Failure requirement:** revocation commits in our authority at `R`, but the backend end request cannot reach Stream. A modified participant retains valid identity/SFU credentials and ignores SDK cleanup/refresh. We need publication **and reception** to expire across every device/session without another successful revocation request. Previously delivered recordings are outside this requirement.

Let a permit authorized at `A` expire at absolute `D <= A+L`. After `R`, no new authorization is allowed. We need an enforcement ceiling `D+e`, with documented worst-case clock/forwarding slack `e`, unaffected by late delivery, first join or restart. **No numeric `L` or `e` has been selected.** Please supply supported lifetime ranges and guaranteed slack, including explicit fault assumptions/exclusions, rather than averages or percentiles.

Please answer each question **YES / NO / CONDITIONAL**, with the exact supported endpoint/schema/settings, minimum SDK/API versions, enforcement scope and documentation or engineering contract:

1. **Autonomous absolute expiry:** Is there a provider-enforced absolute authorization expiry for already active media on a custom call type? Can it stop both media acceptance and forwarding without client cooperation or periodic client requests? If only `max_duration_seconds` is available, can it provide this absolute property rather than just a duration from session start?
2. **Maximum enforcement slack:** What finite worst-case delay applies after the deadline to accepting new publication and forwarding to each subscriber? Include all devices/sessions, enforcement propagation and clock uncertainty. Distinguish media enforcement from metadata changes, event delivery, SDK leave and receiver playout.
3. **Control-plane outage:** Is an already installed deadline enforced locally by SFUs when Betweener/Supabase, the backend-to-Stream network, or Stream coordinator/control services are unavailable while media continues? Does it survive SFU migration/failover? Which failures invalidate any bound?
4. **Rejoin/restart prevention:** Can held or newly issued valid identity/call-role tokens rejoin after the authorization deadline, start a delayed first session, or reset it by leaving/reconnecting/restarting? What custom-call lifecycle and permissions prevent each path, including simultaneous devices and alternate same-app token issuers?
5. **Renewal fencing:** Is there a supported absolute deadline update, generation/version check or compare-and-set that rejects stale/delayed/reordered extensions? A permit authorized before `R` but delivered later must not obtain a new lifetime from its arrival. How can revoked authorization reliably prevent such extensions without a functioning revocation channel?
6. **API JWT versus SFU credentials:** What are the separate expiry/revalidation semantics of API identity JWTs and coordinator-issued SFU credentials after media is already connected? Does identity token expiry/revocation force non-cooperative active publication/reception to stop within a documented bound, or only affect later authentication/API/join requests?
7. **End/kick/block acknowledgements:** For `mark_ended`, `kickUser` (including `block:true`), call blocking and publish-permission revocation, does success mean accepted control work or completed enforcement on all active sessions? What observation proves completion, if any? How should lost ACK/timeouts/5xx be reconciled? Does a correctly scoped server GET404/code16 establish call-object absence, or can it mask authorization/visibility errors? Object absence must remain distinct from SFU media cessation unless guaranteed otherwise.
8. **Supported custom-type configuration:** Can our existing hardened `betweener_connect` type meet these requirements without switching to a broad built-in type or altering Live/global permissions? Please provide the exact supported fields/readbacks and a minimal configuration reference. Our pinned `CallSettingsRequest` has duration limits but no lifecycle/absolute-lease field; specify any required supported version change. If no supported primitive meets the requirement, please state that explicitly and describe the narrower guarantee that is available.

Historical context, not a claim of universal behavior: an earlier timer run recorded ended metadata with growing received RTP counters of unknown content age and no observed SFU end flag. A later B3 run observed two SFU end events, clean signaling closure, essentially flat receiving counters and later transport failures. B3's two security verdicts remain **INCONCLUSIVE**; its later explicit end could not establish a separate causal cutoff. These observations do not establish a provider-internal cause or an outage guarantee. Sanitized receipts/source versions can be supplied through an approved channel if needed; no credentials, SDP or personal audio should be requested or transmitted.

We have reviewed the [Calls API](https://getstream.io/video/docs/api/calls/), [session timer guide](https://getstream.io/video/docs/javascript/ui-cookbook/session-timers/), [authentication documentation](https://getstream.io/docs/platform/authentication/) and [permissions model](https://getstream.io/video/docs/api/call-types/permissions/). We need clarification of the adversarial/outage guarantees above, rather than confirmation that cooperative SDK clients leave on end events.

Thank you.

## Internal response gate — not part of any execution approval

Record each answer with its reference, applicable versions/configuration, maximum delay, exclusions and unresolved questions. A complete supported contract permits **only proposing a separate narrowly scoped capability-verification authorization**, after owner/security budget review. It does not verify a finite bound, authorize an experiment or enable calling.

If expiry is cooperative only, tied to the failed channel, resettable, lacks a finite maximum or cannot preserve the custom least-privilege type, keep calling disabled and seek clarification or review another media architecture. Do not create another diagnostic experiment to fill a missing guarantee by guesswork. Implementation, `L`/`e`, numeric product budget selection, settings changes and sending this enquiry all require separate authorization.

```text
CONNECT_FINITE_REVOCATION_BOUND = UNVERIFIED
CONNECT_M2A_SECURITY_GATE = BLOCKED
CONNECT_M2B_READY = BLOCKED
CONNECT_RUNTIME_INTEGRATION = NOT_AUTHORISED
PROVIDER_WRITES = NONE
PRODUCTION_MODIFICATIONS = NONE
```
