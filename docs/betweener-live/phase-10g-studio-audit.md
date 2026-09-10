# Phase 10G — Phase 10F to Betweener Studio architecture audit

Status: implementation gate passed with mandatory domain work first
Date: 2026-09-10

This audit describes the repository as it exists after Phase 10F. It is the
required gate before Phase 10G code. The conclusion is deliberately narrow:

- the mobile `ProgramStage` boundary is clean; Room Pulse and the footer are
  independent and must remain untouched by programme scene changes;
- Phase 10F preserved explicit controller and programme-origin fields, so a
  destructive refactor is not required;
- the existing single `program_output_source` is not rich enough for Studio
  composites, Preview/Program or source health. Phase 10G must establish the
  shared Program domain before adding browser publishing;
- the current distributed audio architecture makes a naive browser mixer
  unsafe. Phase 10G will not republish participant audio or claim to provide a
  central programme mix.

## Current system

1. **Repository/workspace.** One Expo Router React Native application owns
   `app/`, `features/`, and `lib/`; Supabase migrations/functions live under
   `supabase/`; Node regression tests live under `__tests__/`. It is not yet an
   npm workspace or monorepo.
2. **Recommended web stack.** Add a separate React + TypeScript desktop SPA in
   `apps/studio`, built with Vite. Studio is an authenticated realtime client,
   not a content site, so a small SPA avoids coupling browser media to the Expo
   bundle and does not require a privileged SSR server.
3. **Shared packages.** An npm workspace is appropriate for pure contracts,
   validators, scene geometry and reducers. Native UI, Expo services and each
   Stream SDK remain platform adapters.
4. **Supabase authentication.** Mobile uses the public project URL/key plus a
   user JWT. Database RPCs perform authoritative capability checks. Edge
   Functions revalidate the JWT and use service credentials only server-side.
   Studio must use the same public-key/JWT model and must never receive the
   service role.
5. **Studio-safe capabilities.** `live.view_host_console` and admin checks gate
   existing safe snapshots. The capability catalogue has no fine-grained
   Studio view/control/media grants yet. Phase 10G needs explicit Studio
   access/capabilities in addition to ordinary Live role grants.
6. **Controller sources.** `odo | mobile_host | studio_host | system` is already
   enforced in show state. Programme origin is separately `mobile | studio |
   system`.
7. **Lease/fencing.** Odo owns `lease_owner`, `lease_expires_at`, monotonic
   `lease_generation`, and `state_version`. Show state has a bounded human
   `control_lease_expires_at`, but lacks a dedicated controller generation,
   tab identity and renewal protocol.
8. **Take Control.** Existing takeover RPCs pause/release Odo without restarting
   Live, Stream, Quick Connect or Music. `rpc_acquire_live_program_control_v1`
   can set `studio_host`, but only fences on show version and creates a fixed
   lease; it is not a complete Studio lease API.
9. **Resume Odo.** The three existing resume paths restore Odo/autopilot/show
   state without recreating providers. Phase 10G must consolidate the Studio
   handoff into one fenced operation that forces a fresh snapshot/reconcile.
10. **Director events.** `live_director_events` is an ordered, typed,
    idempotent protocol with per-session sequence, schema/state versions,
    visibility and expiry. `live_director_updates` is the content-free realtime
    wake table.
11. **Director snapshot.** The Phase 10F system snapshot contains lifecycle,
    controller, show, Quick Connect aggregates, music, Pulse, sequence and
    aggregate safety health. It is limited to Always-On sessions and
    admin/service callers, so Studio needs a session-general safe snapshot.
12. **Show State.** Phase 10E provides deterministic opening, host/pool,
    pair-forming/active, post-pair, Pulse/topic/Odo, intermission,
    low-liquidity, draining/closing, pause and recovery states.
13. **Program scenes.** The current closed set handles mobile conversation and
    Odo presentation scenes. It does not yet contain the presentation scene
    family required for screen share and DJ layouts.
14. **Program Source.** `program_output_source` is a single derived enum on
    `live_odo_show_sessions`. It provides compatibility but cannot model a
    composite scene, source readiness, device loss or Preview assignments.
15. **Mobile ProgramStage.** `app/live/[sessionId].tsx` renders media through
    `StreamLiveStage` and presentation state through `OdoProgramStage` inside
    `renderMediaStage`.
16. **Room Pulse/footer boundary.** Confirmed clean. `LiveConversationPanel`
    and `LiveControlDock` are outside `renderMediaStage`; programme scene
    updates do not own, hide or resize them.
17. **Participant layouts.** `StreamLiveStage` uses deterministic geometry for
    one full tile, two equal halves, three as one 56% lead plus two stacked
    tiles, and four as a 2x2 grid. Participants are deduplicated by identity.
18. **Quick Connect.** Server tables/RPCs own pool membership, pairing,
    rounds, decisions, reconnection and safety. The client is a renderer and
    command surface; it must not acquire matching logic.
19. **AutoMatcher projection.** Safe snapshots expose only waiting count,
    eligible pair count, active count, available capacity, reconnecting count
    and completed rounds. The compatibility graph and private ballots remain
    server-only.
20. **Odo Show Director.** A service-only deterministic reconciler observes
    authoritative state, applies dwell/suppression/lease rules, writes typed
    actions/events and never selects people or mutates RTC membership.
21. **Music Engine.** The server owns a private licensed catalogue, playlists,
    per-session state, typed actions/events, signed playback grants, policy
    checks and kill switches.
22. **Music delivery.** Approved media is delivered through short-lived grants
    and distributed eligible-client playback. Raw storage paths are not public.
23. **Ducking.** Server-authored conversation state chooses deterministic
    requested/effective volume or stop. Publisher devices are excluded from
    ordinary programme playback to reduce feedback.
24. **Stream React Native.** Mobile uses
    `@stream-io/video-react-native-sdk`; token admission is requested lazily,
    a user-scoped client lease is reused, and provider membership/permissions
    are server-authored.
25. **Stream Web SDK.** Use `@stream-io/video-react-sdk` as a separate adapter.
    Create one client, use a short-lived token provider, explicitly join/leave,
    await device operations, and render custom programme UI rather than SDK
    prebuilt layouts. Stream documents these patterns in its current
    [React quickstart](https://getstream.io/video/docs/react/basics/quickstart/).
26. **Token flow changes.** `live-rtc-token` currently grants `send-audio` and
    `send-video` from `live.publish`. Add a Studio-specific token function and
    RPC admission that validates Studio access, session access, source role and
    screen-share capability; grant `screenshare` only when authorized. Do not
    broaden mobile admission.
27. **HLS/livestream.** No central HLS compositor/egress programme exists in
    this repository. The near-term programme remains deterministic
    client-composed state over the existing Stream call.
28. **Shareable types.** Controller sources, scene IDs, target canvas, layout
    specs, source types, source signals, programme state, safe operational
    projections, reason codes and command envelopes are platform-neutral.

## Proposed Program and media architecture

29. **Program Source contract.** A source has a stable UUID and logical key,
    session, closed source type, owner, media kinds, role, readiness, health,
    muted flags, bounded safe metadata, generation and version. It never stores
    a local device ID for another client.
30. **Readiness/health.** Readiness is `unavailable | permission_required |
    preparing | ready | live | ended | failed`; health is `unknown | healthy |
    degraded | lost`. Signals include timestamps and closed reason codes.
31. **Preview state.** Preview is local to the controlling browser tab. It has
    a base Program version/controller generation, scene, ordered source slots,
    target canvas and transition. It is not written to realtime state.
32. **Authoritative Program state.** One database row per session stores scene,
    source slots, target canvas, transition, previous safe state, Program
    version, controller source/generation and update metadata. Only RPCs write
    it.
33. **TAKE/CUT/AUTO.** `TAKE` validates the current lease, controller
    generation, expected Program version and source readiness, then applies
    Preview once. `CUT` is TAKE with no transition. AUTO requests an approved
    transition. Stale/idempotent commands return the authoritative state.
34. **Web renderer.** A pure layout resolver maps scene + target canvas + source
    slots to deterministic CSS grid geometry. It never decides participants or
    controller ownership.
35. **Screen share.** Desktop Studio publishes a Stream screen-share track,
    registers it as a source, previews it locally and only places it on Program
    after TAKE. User stop/device loss marks the source ended and triggers an
    authoritative safe fallback.
36. **Screen-audio matrix.** Chromium/Windows may expose system or tab audio;
    Chromium/macOS/Linux commonly exposes tab audio only; Safari/Firefox and
    enterprise policies vary. Availability must be derived from returned audio
    tracks, not user agent promises. Stream documents the platform caveats in
    [screen sharing](https://getstream.io/video/docs/react/guides/screensharing/).
37. **Host camera.** A browser-visible camera publishes once to the existing
    call and is registered as `host_camera`; it can be assigned to Preview and
    Program without republishing.
38. **Host microphone.** A selected browser mic publishes once as the Host audio
    role, with explicit mute and level UX. It is not the DJ source.
39. **Device selection.** Use Stream device state/list/select APIs, persist only
    the local preference, show a lobby preview, and handle denied permissions,
    `devicechange`, hot-swap and loss. The current API is documented in
    [Camera & Microphone](https://getstream.io/video/docs/react/guides/camera-and-microphone/).
40. **External camera/capture card.** Treat any browser-enumerated video input
    like a camera; make no vendor-specific promise and fall back to the built-in
    camera or safe branded visual when it disappears.
41. **USB mic/audio interface.** Treat any browser-enumerated audio input as a
    microphone. Surface channel/capability limits honestly and test the actual
    device/browser combination.
42. **DJ input.** Register a distinct logical `dj_audio` source from a separate
    browser-visible audio input. It may use a Stream virtual microphone/source
    adapter where supported, but must never silently replace or duplicate Host
    mic audio.
43. **Web Audio feasibility.** Web Audio can meter, gain, mute and create a
    local mixed/virtual source. It cannot provide a reliable global participant
    mix across clients and must remain a local source tool in 10G.
44. **Echo risks.** Publishing remote participant audio, playing programme
    music through an open Host mic, selecting the same interface for Host and
    DJ, or monitoring output through speakers can loop/double audio.
45. **Near-term Program audio.** Keep participant audio distributed through
    Stream. Publish each local source once, preserve the licensed distributed
    music engine, add local metering/gain for Host/DJ, recommend headphones and
    enforce exclusive logical device roles by default.
46. **Future mixer.** A server/egress `ProgramAudioMixer` can later consume RTC
    sources plus licensed music, produce one fenced programme bus, meter,
    duck/fade, fail silent and emit typed state. It is not part of 10G.
47. **No double broadcast.** Studio subscribes to remote participants for
    monitoring only; it never captures/reinjects their audio. A local physical
    input has one publication owner and one source ID.
48. **Music/DJ ducking.** Conversation and safety outrank Odo voice, screen
    audio, DJ and music. Server policy owns music ducking; Studio local gain
    reflects, but does not bypass, policy. DJ manual override is bounded and
    visible.
49. **Odo voice.** The production configuration currently enforces Odo voice
    disabled. 10G exposes readiness/status only; it does not synthesize or
    publish Odo speech.

## Studio product and operations

50. **Quick Connect panel.** Show safe pool count, eligible pairs, active pairs,
    completed rounds, capacity/reconnect health and approved controls. Never
    reveal compatibility edges or private decisions.
51. **Odo panel.** Show controller, directing/paused/degraded status, current
    state/scene, next safe plan/reason, lease health, Take Control and Resume
    Odo. No prompts or chain-of-thought.
52. **Audience Pulse.** Display safe aggregate/open state and invoke existing
    capability-checked open/close operations. Pulse content remains governed by
    its current projection.
53. **Conversation Spark.** Expose approved public Spark controls through Odo's
    typed command path. Private Spark media/content is never available.
54. **Safety/moderation.** Show aggregate health and existing capability-gated
    actions. Safety always outranks Program control; Studio is not granted
    unrestricted profile or evidence access.
55. **Session discovery.** Add an admin/authorized-Host RPC returning only
    accessible current/upcoming/backstage sessions, controller and health
    summaries. Do not scan unrestricted tables from the browser.
56. **Always-On takeover.** Open the existing system session read-only, acquire
    a Studio lease with expected generations, publish optional Host sources,
    TAKE scenes, then resume Odo from a fresh snapshot without RTC or matcher
    restart.
57. **Disconnect recovery.** Renew the lease while controlling. On timeout,
    keep Program stable for a bounded grace period, invalidate stale commands,
    then recover to Odo/system or a safe scene according to policy.
58. **Controller conflict.** The server is authoritative. One tab owns the
    lease token; other tabs and mobile are observers until a policy-approved
    takeover increments controller generation.
59. **Browser baseline.** Closed beta targets current desktop Chrome/Edge and
    Safari/Firefox versions supported by Stream. Screen sharing is desktop-only
    and all media features use runtime capability checks. Stream's current
    [supported baseline](https://getstream.io/video/docs/react/) is Chrome 136+,
    Edge 136+, Firefox 137+ and Safari 18.4+.
60. **Deployment.** Deploy `apps/studio` as a separate static SPA, preferably at
    `studio.getbetweener.com`, with strict CSP and the same Supabase project.
    Supabase remains the control plane; Stream remains the media plane.
61. **Security risks.** Primary risks are service-key leakage, overbroad
    snapshot/RPC grants, forged command payloads, stale controller tabs,
    elevated Stream permissions and unsafe source metadata. Mitigate with JWT
    revalidation, allowlists/capabilities, closed enums, RLS, RPC-only writes,
    lease fencing, idempotency and audit events.
62. **Privacy risks.** Studio must not receive raw match graphs, ballots,
    private decisions, private prompts, Private Spark media/content or detailed
    safety cases. Source labels and diagnostics must be scoped to authorized
    producers.
63. **Screen rights.** Before capture, warn that notifications, personal data
    and copyrighted content may be shown. Capture is explicit; stopping capture
    immediately removes the source and records a non-content audit event.
64. **Music rights.** Only the existing approved catalogue and region/license
    policies may be controlled. A DJ physical input is the producer's declared
    source and does not grant arbitrary server music URLs or bypass policy.
65. **Performance risks.** Preview plus Program can decode the same remote
    sources twice, while screen share, meters and pool animation add CPU/GPU
    load. Reuse media elements/tracks, throttle thumbnails/meters, cap preview
    resolution and subscribe only to required tracks.
66. **Accessibility.** All controls need keyboard operation, labelled states,
    visible focus, contrast, reduced motion and announced controller/health
    changes. TAKE and End Live require distinct, confirmation-safe semantics.
67. **Feature flags.** Add Studio view, control, browser publish, screen share,
    screen audio and DJ flags, all false by default. Require an expiring Studio
    allowlist during closed beta.
68. **Automated tests.** Add pure contract/layout/parser tests, SQL boundary and
    idempotency tests, Edge Function admission tests, Studio component/state
    tests and existing mobile Live regression tests.
69. **External-device tests.** Physically test built-in/external cameras,
    capture card, built-in/USB/Bluetooth mic, audio interface, screen/tab/window
    capture, supported screen audio, device unplug/replug, headphones, feedback,
    network loss and multiple tabs. Hardware claims remain pending until run.
70. **Database/API changes.** Add Studio config/access, authoritative Program
    state, source registry, ordered command events and content-free update
    tables; session discovery/snapshot; acquire/renew/release/takeover/resume;
    source upsert/end; TAKE/CUT; maintenance fallback; least-privilege grants.
    Add a Studio media admission RPC and Edge Function rather than weakening
    mobile token admission.
71. **Shared package changes.** Create `packages/live-program-domain` with
    closed constants, types, runtime parsers, layout resolver, Preview reducer,
    command builder and fallback selection. It must have no React, Expo,
    Supabase or Stream dependency.
72. **Studio files.** Create `apps/studio` with auth/session discovery, API and
    realtime adapters, controller lease, local Preview store, programme/source
    monitors, browser media/Stream adapter, screen-share and audio capability
    services, Quick Connect/Odo/Music/Pulse/Safety panels, workspace styling,
    tests and deployment documentation.
73. **Mobile files.** Re-export shared Program contracts, parse the new safe
    snapshot, render presentation layouts inside `OdoProgramStage`/the media
    boundary, and preserve `LiveConversationPanel`/`LiveControlDock`. No mobile
    auth, matcher or RTC rewrite is required.
74. **Implementation slices.** Deliver: 10G.1 workspace/read-only Studio;
    10G.2 shared Program domain; 10G.3 Preview/Program and lease API; 10G.4
    browser Host media; 10G.5 screen share; 10G.6 music/audio; 10G.7 DJ input;
    10G.8 Odo/Quick Connect/Pulse console; 10G.9 workflow/fallback/mobile sync;
    10G.10 Always-On takeover; 10G.11 resilience; 10G.12 closed-beta hardening.

## Gate decision

Proceed incrementally. First implement the shared Program domain and its
authoritative server contract, then the read-only Studio shell, then publishing
and production controls. Do not implement a central mixer or republish remote
participants. Physical browser/device validation remains a release gate rather
than a claim made by automated tests.
