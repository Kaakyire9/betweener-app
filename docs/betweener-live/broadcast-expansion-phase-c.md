# Betweener Live Phase C — Broadcast expansion

## Outcome

Phase C turns the authoritative Betweener Program into one server-produced
public broadcast. Hosts, guests, producers and moderators stay on low-latency
RTC. Passive audiences move to HLS only after the Program output is healthy.
Reactions, comments, Pulse ballots, operator messages, Private Spark media and
private decisions remain separate Supabase data and never enter recordings or
clips.

## Architecture

```text
Host / guests / Studio sources
            │ RTC
            ▼
       Stream call
            │ receive-only compositor admission
            ▼
Persistent Program compositor ── RTMP Program output ──► Stream call
            │                                      │
            │                                      ├─ RTC: interactive roles
            │                                      └─ HLS/CDN: passive audience
            ├─ public recording (consent gated)
            ├─ public captions / translation
            └─ replay, clips and vertical highlights

Supabase: lifecycle, Program version, leases, consent, artifact policy and routing
Stream: RTC, ingress, HLS and provider media events
```

The compositor is a long-running container, not an Edge Function. The Edge
Function is only a short-lived authenticated control adapter that claims work,
mints scoped provider credentials and records heartbeats.

## Delivery order

### C1 — Control-plane foundation (implemented locally)

- Disabled-by-default flags with dependency constraints.
- One fenced compositor lease per public Live.
- Scoped worker admission through `live-broadcast-orchestrator`.
- Authoritative Program version, scene, canvas and source assignments in each
  worker claim.
- RTC/HLS delivery projection with RTC fallback.
- Explicit recording and clip consent records.
- Private artifact storage rows and strict safe-metadata allowlisting.
- Regression and pgTAP coverage.

Applying C1 does not start or expose a broadcast. Every Phase C feature remains
off until its worker and canary gate pass.

### C2 — Compositor runtime (implemented locally; canary pending)

- Persistent, horizontally replaceable compositor container.
- Joins the Stream call as the scoped `studio-program-*` user.
- Subscribes only to public Program sources.
- Renders the authoritative scene/canvas and mixes public audio.
- Publishes exactly one audio/video Program output through the scoped RTMP
  ingress.
- Heartbeats Program version and output health; lease generation fences
  stale workers.
- Uses a branded safe scene instead of publishing blank output when an assigned
  source is unavailable.
- Exchanges short-lived browser credentials only through a nonce-protected
  loopback endpoint and removes the isolated browser profile on release.

Exit gate: two publishers and a Studio screen produce one synchronized Program
track; worker takeover does not create duplicate output. This requires the
controlled staging media canary and is not satisfied by local tests alone.

### C3 — Hybrid delivery

- Start HLS only after the Program output reports `live`.
- Keep hosts, stage guests and safety operators on RTC.
- Route passive audience members to HLS; keep engagement on Supabase Realtime.
- Fall back to RTC while HLS is starting or degraded.
- Rejoin RTC before an audience member is promoted to stage.

Exit gate: physical iPhone and Android audience handoff tests pass without
losing reactions, comments, captions or stage promotion.

### C4 — Recording and replay

- Record only the public Program output and only when the session and rollout
  flags are enabled.
- Require current consent from every public publisher before start and after a
  new publisher joins.
- Stop or pause recording when consent is revoked.
- Process provider webhooks idempotently into private artifact rows.
- Publish replay through a guarded projection; never expose raw object keys.

Private Spark and Quick Connect media are excluded by architecture, not by UI.

### C5 — Captions and translation

- Caption only public Program audio.
- Show an explicit caption indicator and source language.
- Translation is opt-in and limited to configured target languages.
- Retain transcripts only under the public-media retention policy; no private
  conversations or operator communications are transcribed.

### C6 — Clips and vertical highlights

- Clip only from a consented public recording.
- Recheck clip consent before publication.
- Generate `9:16` highlights from the authoritative Program timeline with safe
  captions and brand treatment.
- Human review precedes public publication.
- Artifact metadata accepts Program facts only; engagement identities, votes,
  messages and private outcomes are rejected.

## Operational gates

1. Deploy C1 to staging with all flags false and run pgTAP plus security
   advisors.
2. Deploy one disposable compositor worker and validate lease fencing.
3. Enable compositor for one disposable Live; keep HLS off.
4. Enable HLS for that Live and validate RTC/HLS routing on devices.
5. Enable recording only after public-media consent UX and retention are
   approved.
6. Enable captions, then translation, then clips, then highlights as separate
   canaries.
7. Production requires separate migration, function, worker, provider and flag
   authorization.
