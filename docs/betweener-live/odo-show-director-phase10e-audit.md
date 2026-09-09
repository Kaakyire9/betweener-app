# Phase 10D to 10E architecture audit

Audit date: 2026-09-08. Baseline: the deployed Phase 10D health gate reported
`release_blockers = 0` and `healthy = true`.

## Required audit findings

1. **10D systems ready for Show Director.** The Live session engine, Quick
   Connect control and pair lifecycle, AutoMatcher, participant capability
   checks, Odo lease, one-shot wake pattern, ordered Director Events, and Host
   takeover fence are suitable foundations.
2. **10D defects or blockers.** No material security, lifecycle, or RTC blocker
   was found. Show direction must remain independent of the 10D lifecycle. The
   material platform limitation is audio: the mobile RTC publisher path has no
   safe shared program-audio mixer.
3. **Current Director Event architecture.** Events are server-sequenced,
   versioned, source- and visibility-scoped. Realtime publishes content-free
   invalidations; clients refetch through capability-filtered RPCs.
4. **Current scene architecture.** `live_odo_session_state.current_scene` is the
   compatibility anchor and mobile owns rendering. 10E adds an independent,
   durable show state while keeping that anchor synchronized.
5. **Current Host/Live Studio architecture.** `LiveStudioModal` is the existing
   mobile control surface. Access is capability checked and restricted by the
   existing internal Host allowlist.
6. **Current Odo planning architecture.** Provider output is schema-bound and
   policy-gated in earlier phases; the 10D lifecycle does not depend on it. 10E
   keeps routine show transitions deterministic and makes any future AI plan
   advisory only.
7. **Show State machine.** `opening`, `host_focus`, `host_plus_pool`,
   `pool_focus`, `pair_forming`, `pair_active`, `post_pair`, `audience_pulse`,
   `conversation_topic`, `odo_stage`, `music_intermission`, `low_liquidity`,
   `draining`, `closing`, `paused_by_host`, `paused_by_policy`, and
   `recovering` are closed states, separate from Quick Connect state.
8. **Deterministic Show Orchestrator.** A service-only reconciler reads current
   Live, Quick Connect, show, audience, and music facts; acquires the shared Odo
   fence; selects one legal presentation action; persists it; and schedules a
   recoverable next wake. It cannot select people or mutate RTC/lifecycle.
9. **Scene catalogue.** `host_focus`, `host_plus_pool`, `pool_focus`,
   `pair_forming`, `quick_connect_active`, `audience_pulse`,
   `conversation_topic`, `odo_stage`, `music_intermission`,
   `branded_intermission`, and `session_closing`. Screen share is reserved and
   disabled.
10. **Priority and conflict system.** Policy/safety is 100, Host override 95,
    closing 90, pair forming 80, active pair 75, draining 60, intermission 30,
    low-liquidity Odo Stage 20, and room baseline 10. Higher-priority fresh
    truth may pre-empt; lower/equal priority observes dwell time.
11. **Repetition and cooldown.** Scene dwell, Host suppression, intermission
    every bounded number of completed rounds, deterministic track selection,
    and a maximum 12-entry scene history avoid thrashing and unbounded data.
12. **Odo Show planning.** The initial production-safe plan is the deterministic
    short horizon encoded by the orchestrator. A future Luna-generated plan may
    suggest only closed-vocabulary actions and must expire on state, policy,
    configuration, Host-control, or lease changes before each step is rechecked.
13. **Odo Stage.** A code-native program overlay presents calm status, topic,
    intermission, and closing moments. It uses restrained motion, honours Reduce
    Motion, and introduces no photorealistic person or inferred emotion.
14. **Current Stream/Expo audio.** Stream owns RTC capture/playback. Expo Audio
    can play local client media but is not a broadcast mixer and cannot safely
    mix a Host program feed into RTC on every mobile platform.
15. **Near-term music delivery.** Use synchronized audience-only playback from
    a private Supabase bucket. The server chooses an approved track and returns
    a short-lived signed grant. Publisher devices and private experiences fail
    closed, so the same track is not accidentally doubled into the room.
16. **Long-term Studio audio.** A Studio program mixer should combine approved
    music and program sources once, apply ducking, and publish a single mixed
    program feed to Stream. Mobile then consumes that RTC program audio.
17. **Catalogue/database.** Private tracks, playlists, ordered playlist items,
    synchronized session state, and an append-only action ledger use storage
    paths rather than caller-supplied URLs.
18. **Licence and region policy.** Tracks default disabled/pending. Playback
    requires enabled plus approved, unexpired licensing and an allowed region.
    Initial rollout requires the wildcard approved region; unknown or expired
    rights fail closed.
19. **Music Engine.** `LiveMusicEngine` owns load/play/pause/seek/volume/stop and
    disposal. Odo and UI send typed intent and never touch low-level audio APIs.
20. **Ducking.** Deterministic conversation priority drives the persisted
    effective volume. Active Quick Connect ducks music. Host-speech mixing is
    deferred until a reliable publisher/program-mix signal exists; the current
    publisher device is therefore denied local program playback.
21. **Host music override.** A narrow Host RPC accepts a closed action, approved
    track/playlist IDs, bounded volume/mood, expected authority, and an
    idempotency key. The resulting state and audit event use `mobile_host`.
22. **Odo music request.** The reconciler may play, duck, or stop only through
    approved catalogue state during eligible intermissions. It records every
    automatic action. No model, URL, path, or media payload is accepted.
23. **Program Source.** `mobile | studio` describes output origin while
    `odo | mobile_host | studio_host` independently describes control. This
    supports observation, handover, and future Odo-only sessions.
24. **Studio shared protocol.** The participant-safe program snapshot carries
    schema version, state version, scene, energy, source, next wake, and safe
    music state. Ordered events and content-free invalidations are shared with
    mobile; unknown future events remain ignorable.
25. **Studio ownership and lease.** One server-fenced controller owns program
    mutations at a time. Acquisition requires a Host/admin capability and an
    expected state version. Odo resumes only after explicit release/resume and
    fresh reconciliation.
26. **Minimal Studio shell.** It should wait. Adding another application and
    authentication surface now increases tooling and security scope without a
    safe program mixer. 10E delivers the shared contract and RPC foundation.
27. **Database migrations.** Add conservative feature flags, show state/action/
    update tables, approved catalogue/playlist/music state/event tables,
    storage boundary, snapshots, control RPCs, deterministic reconciliation,
    cleanup, and production health checks.
28. **Server changes.** Add a caller-minimal Show Director wake and a music
    playback-grant function. Both derive identity server-side and accept only a
    session ID; service RPCs retain mutation authority.
29. **Mobile changes.** Add show contracts/state machine/policy/engine/hooks,
    the Host Show Director panel, Odo program overlay, participant program
    subscription, and Live repository boundaries.
30. **Security, privacy, and licensing risks.** Primary risks are arbitrary
    media injection, licence expiry/region mistakes, signed-link leakage,
    private-pair audio, controller races, identity leakage in public events,
    and music disrupting conversation. Closed vocabularies, private storage,
    service-selected paths, short grants, RLS, fencing, and fail-closed policy
    address them.
31. **Automated testing.** Cover state priority/cooldowns, strict parsing,
    private/publisher music denial, storage/path/licence boundaries, RPC grants,
    Host takeover/resume/suppression, event privacy, maintenance recovery,
    source-level authority checks, typecheck, and the read-only health gate.
32. **Physical audio/video testing.** Use current iPhone and Android builds with
    Host plus at least two guests. Exercise speaker/headphones/Bluetooth,
    Stream audio, private rounds, background/foreground, network switching,
    scene overrides, music failure, Take Control, and Resume.
33. **Performance risks.** Repeated snapshots, animation, signed-grant churn,
    media preload, and reconnect loops are bounded with one-shot invalidations,
    short state payloads, restrained native animation, idempotency, and no
    always-running AI or mobile polling loop.
34. **Implementation slices.** (1) show contracts/state/orchestrator; (2) rhythm
    and bounded history; (3) Odo Stage; (4) catalogue/policy; (5) music engine
    and grants; (6) safe ducking boundary; (7) Odo atmosphere requests; (8)
    Host controls; (9) Studio protocol/ownership; (10) tests, health, runbook,
    and physical-device gate.

## Always-On Quick Connect compatibility audit

1. **Can 10D support it later?** Yes at the post-session-creation boundary.
   AutoMatcher, Quick Connect lifecycle, Odo Show Director, and controller
   fencing can operate after a valid Live exists. Opportunity formation is a
   separate missing upstream system.
2. **Current human-Host assumptions.** Live creation records a human creator;
   enabling 10D/10E requires a Host/admin capability and internal allowlist;
   mobile Live Studio performs activation; some RTC/program capabilities are
   assigned from Host participation.
3. **Odo-only ownership changes.** A future service-authorized creation path
   needs system ownership metadata, a service principal/capability model,
   deterministic budget owner, Odo initial activation, and later Host transfer.
   It must not forge `auth.uid()` or create a second Live system.
4. **Does the lease allow ODO initially?** Yes. Show state defaults to
   `control_source = odo` with no human control user, and uses the existing
   session Odo lease/fencing generation.
5. **Can Odo Stage/music initialize without a Host?** The data and rendering
   models can. Current activation intentionally cannot; a future system-owned
   enable RPC is required. Music still needs approved assets and budget/policy.
6. **Can quorum consume external availability?** The existing quorum/pair graph
   can consume explicitly enrolled session participants. An upstream adapter
   must convert accepted opportunity invitations into session membership; raw
   presence must never be consumed directly.
7. **Avoiding presence/availability conflation.** Persist separate time-bounded
   states: online presence, `available_for_quick_connect`, invitation status,
   and joined-pool consent. Only accepted, unexpired consent advances.
8. **Opportunity Engine.** Build a deterministic scheduled service over the
   explicit availability pool, compatibility graph, safety/blocks, recent-pair
   history, quiet hours, capacity, rate limits, and minimum viable pair graph.
   It must not use an LLM or expose rejected identities.
9. **Formation state machine.** `opportunity_detected -> invitations_sent ->
   forming -> quorum_reached -> session_created -> starting -> live`, with
   terminal `expired | cancelled | ended` states and deterministic timeout,
   low-liquidity, empty-room, draining, RTC, music, and lease cleanup.
10. **Recommended future phase.** Implement this as a separately reviewed
    Always-On opportunity/session-formation phase after 10E production evidence,
    including anti-spam, notification preference, system-owner security, cost
    limits, and automatic cleanup. It is intentionally not enabled in 10E.
