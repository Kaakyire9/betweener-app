# Betweener Live canonical master plan

## Document authority

This document normalizes the original **Codex Master Implementation Prompt —
Betweener Live: Production Architecture, Backend, Frontend, Matchmaking,
Safety, AI, Circles Integration and Premium UX** into a durable repository
specification. It also incorporates the later public-Live visual-polish prompt
and the Private Spark luxury-evolution prompt pack.

Recovered source fingerprints:

- Master implementation prompt SHA-256:
  `A3233B949636F8EF83062A3E5DCF5C058829F32EBEBD06BAB5D12E7D0C3770DF`
- Private Spark prompt pack SHA-256:
  `2F6C7D4A53F6851F624FE89E53950F0C0F7B58D6930AC631635C5F5DFA1C6F13`
- Public Live polish prompt SHA-256:
  `6672E5BCD46DF1BFB8AA2415A78119C54D0B07D94226537B9A2F15E73399AFD8`

There are **12 numbered delivery stages in total: Phase 0 through Phase 11**.
When speaking about implementation phases only, there are **11 phases after
the Phase 0 audit**.

## Product north star

Betweener Live is a first-class Betweener platform for intentional live human
matchmaking. It is not a TikTok clone, Tinder speed dating, a Circle-owned
subfeature, a generic group call, or a popularity contest.

It optimizes for:

- intent, trust, chemistry, conversation and consent;
- community and event context without tribal or badge-heavy presentation;
- meaningful outcomes and existing Betweener matches/chats;
- private rejection, transparent eligibility and emotionally safe failure;
- calm, cinematic and unmistakably Betweener presentation.

The interaction hierarchy is:

> people first → conversation second → controls third

## Non-negotiable product constitution

1. Live remains reusable across Global Live, Hosted Match Nights, Quick
   Connect, Circle Live, special/diaspora events and invite-only events.
   Circles consume Live; Live does not depend on Circles.
2. Supabase owns business authority: sessions, eligibility, roles,
   capabilities, RSVP, quorum, stage, matching, consent, private-room state,
   decisions, moderation, notifications, pooling, analytics and safety.
3. Stream Video is the initial RTC transport. It owns camera, microphone,
   media quality, media reconnection and stream subscriptions—not matchmaking.
4. Stream-specific code stays behind `LiveMediaProvider`; never distribute
   provider assumptions across screens.
5. RTC secrets never enter the client. Trusted server code validates identity,
   account/profile state, session, participant state, bans and capabilities.
   Private tokens are shorter-lived and available to exactly two participants.
6. Backend capabilities are canonical. `matchmaker` is not implicitly a
   moderator. In particular, `live.terminate_private_spark` never implies the
   ability to listen to or join that Spark.
7. Critical transitions use state machines, trusted RPCs/functions,
   transactions, constraints and strict RLS—not arbitrary client updates.
8. Raw private readiness, consent and decisions are never exposed to the other
   participant. Clients receive only allowed derived outcomes.
9. Technical disconnection is never interpreted as romantic rejection.
10. No public rejection, attraction voting, romantic leaderboard, fake
    compatibility percentage, paid attention priority, gifting battle or
    pay-to-win romance.
11. No automatic or hidden Private Spark recording, transcription, captions,
    biometric emotion inference, Host listening or AI analysis of private
    audio/video.
12. Blocked, removed, banned, suspended, inactive, deleted, incomplete or
    ineligible accounts must not obtain inappropriate Live or private access.
13. Accessibility, reduced motion, audio-first participation, clear
    permissions and visible safety exits are release requirements.
14. Preserve existing Betweener profile, preference, Circle, Love Seat,
    moderation, report, block, notification, presence, match and chat systems.
    Do not create parallel product pipelines without necessity.

## Canonical formats and context

Supported/anticipated formats are extensible and include:

- `hosted_match_night`: a human Host welcomes, interviews, manages stage,
  proposes introductions and continues hosting during private conversations.
- `quick_connect`: server-authoritative private rotations, initially around
  eight participants and three-minute rounds.
- `circle_live`: a Circle-origin session using the global engine.
- `special_event` and `invite_only`; global, event, diaspora and match-night
  contexts remain possible.

Sessions carry `context_type` and optional `context_id`. Participants retain
their original context identity even if a future pooling engine combines
sessions.

Chemistry First is a mode (`chemistry_first_enabled`) inside compatible
formats, not a separate platform.

## Complete 100-requirement ledger

The numbering below intentionally matches the original Master Prompt so future
work can prove that no requirement family disappeared.

### 1–10: platform architecture

1. **Product constitution:** first-class Live platform, not Circle-owned;
   intentional connection rather than attention/gifting.
2. **Audit first:** inspect Circle schema/roles, gatherings, Love Seat, Pulse,
   profiles/preferences, safety, matching/chat, notifications/presence,
   Realtime, Supabase, RLS, RevenueCat, Sentry, networking, tests, navigation,
   sheets, tokens, animation and accessibility. Do not add Live logic to the
   historically large `app/circles/[id].tsx` route beyond integration.
3. **Authority split:** Supabase is product authority; RTC is media authority.
4. **RTC provider:** use current supported Stream Video React Native packages;
   Expo Go is insufficient and fresh native builds are required.
5. **Provider abstraction:** typed create/join/leave, audio/video,
   publish/revoke, backstage/audience, terminate and quality operations.
6. **Server RTC authentication:** authenticated, capability-scoped,
   short-lived credentials; private admission only for the accepted pair.
7. **Capabilities:** explicit create/start/end, stage, matchmaking,
   moderation, private termination, Host Console and safety permissions.
8. **Generic session model:** reusable `context_type`/`context_id`; no
   `circle_live_sessions` silo.
9. **Formats:** Hosted Match Night, Quick Connect, Circle Live, Special Event
   and Invite Only are initial—not exhaustive—formats.
10. **Chemistry First:** premium frost/diffusion, accurate nonvisual context,
    continuous audio and mutually consented reveal; timer may offer but never
    force reveal or identify who is not ready.

### 11–20: data, stage and Host experience

11. **Core model:** sessions, participants, seat requests, match rounds,
    private rooms/consents, decisions, moderation/reports, events/webhooks and
    future pool rules/offers/contexts/preferences; extend existing data safely.
12. **Sessions:** creator/Host, context, format, copy, schedule, lifecycle,
    capacities, quorum, Chemistry First, captions/recording and timestamps.
    Validate `draft → scheduled → waiting_for_quorum → confirmed → backstage →
    live → ending → ended`, with cancellation where legal.
13. **Participants:** business participation independent from RTC presence;
    origin, role, RSVP, participant state, intro preference, stage timestamps,
    connection state and terminal states.
14. **Origin identity:** retain source community/event through pooling and show
    contextually in Host preview, lobby, stage or recap without badge clutter.
15. **Seat requests:** pending/approved/declined/cancelled/expired; Host sees
    detailed queue, public sees only restrained aggregate availability.
16. **Backstage:** camera/mic preview, connection, identity/verification,
    origin, expectations, safety, join/leave and Host-ready notification.
17. **Dynamic director:** never a static Zoom grid. Support Host focus,
    introduction and match focus with restrained, reduced-motion transitions.
18. **Visual system:** deep teal-black, rich teal, Betweener teal, oat-milk,
    soft purple and rare warm gold; no neon/casino/gaming HUD.
19. **Main screen:** role-specific header/status, optional Chemistry context,
    dynamic stage, Conversation Spark, audience/chat/context, Audience Pulse
    and role-appropriate controls.
20. **Host Console:** current stage health, candidate queue and explainable
    suggestions. Never invent or expose unjustified numeric compatibility.

### 21–34: intelligence, audience and Private Spark

21. **Host Copilot:** provider-independent `LiveIntelligenceProvider`; minimum
    consented data; Host can use/skip suggestions; AI assists but is not Host.
22. **Conversation Spark:** contextual, thoughtful prompts from real shared
    values/interests/intent/prompts/roots/culture/lifestyle/goals; omit missing
    data and never invent commonality.
23. **AI privacy:** no silent private media upload/transcription and no emotion
    or chemistry inference from face, voice, laughter or body language.
24. **Audience Pulse:** conversation/room questions only; spectators never
    determine attraction, dates, contact exchange or who “won.”
25. **Quiet reactions:** restrained heart/clap/sparkle; no giant effects,
    leaderboards, top gifters or spender ranking.
26. **Public comments:** report/remove/temporary mute, rate limiting, spam and
    blocked-user enforcement; meaningful moderation is audited.
27. **Match round:** proposed → invitation → private consent → public intro →
    private offer/Spark → private decision → completion, with graceful decline.
28. **Double consent:** create private access only after both independently
    accept; no accessible RTC room beforehand.
29. **Private Spark:** separate two-person RTC call, short token, timer,
    mic/camera/leave/block/report/network/reconnect; Host sees operational state
    and may terminate but never gets media access.
30. **Public continuity:** multiple private Sparks may run while the Host keeps
    the public event alive; public receives at most discreet non-media status.
31. **Private decision:** continue/friendship/not-this-time remain private;
    only continue+continue creates a romantic connection.
32. **Mutual reveal:** restrained “It’s mutual” and “A connection started on
    Live”; reuse existing match/chat and avoid spectacle.
33. **Chat origin story:** existing chat records the originating Live title/date
    and Betweener Live context.
34. **Optional Live Moment:** never retroactively save private media; a future
    moment requires separate, specific dual consent.

### 35–44: Quick Connect, quorum and pooling

35. **Quick Connect:** separate format with server pairing/timing, no repeats,
    eligibility/block/preference/context/availability/private-room checks.
36. **Disconnect is not rejection:** use unavailable/left/disconnected/
    incomplete states and preserve submitted decisions.
37. **Reconnection:** RTC events plus NetInfo, grace period, neutral copy and a
    safe return when recovery fails.
38. **Quorum engine:** minimum attendance plus pairability/viability where
    practical; raw headcount alone may be misleading.
39. **Quorum UI:** warm “Almost Ready” and “Tonight is confirmed” language,
    never technical “critical mass” terminology.
40. **Live Session Pooling:** future general engine for Circle↔Circle,
    Circle↔Match Night, geography/diaspora/age/community combinations using
    intent, reciprocal age/geography preferences, verification, time, format,
    tags, blocks and admin/user rules.
41. **Transparency:** explain combined events and why contexts align; never
    silently move people into another community.
42. **User preference:** server-enforced `allow_pooled_live_sessions` opt-out
    without forcing Circle departure.
43. **Admin settings:** compatible-pooling controls, requirements/blocklists,
    previews and human-readable eligible/excluded reasons; no fake percentage.
44. **Pooling safety:** prohibit incompatible formats, verification/age/rule
    conflicts, opt-outs, unsafe block relationships and unusable preference
    pools; audit decisions without exposing private data.

### 45–50: Circle and candidate integration

45. **Circle integration:** natural Prompt/Gathering/Live/Seats/Media entry;
    empty, almost-ready, confirmed, live and recap states.
46. **Live Gathering:** gathering references `live_session_id`; never duplicate
    Live lifecycle in Circle tables.
47. **Circle card:** scheduling/suggestion where appropriate, quorum/countdown,
    Live deep link and tasteful recap without rejection counts.
48. **Love Seat:** Live origins are additive and consent-aware; no like counts,
    popularity or replacement of manual curation.
49. **Match queue:** Host-only candidate preview/invite/pair/skip-for-now;
    public audience never gets a beauty catalogue and skip is not rejection.
50. **Connection Signals:** explain real alignment in words/bullets; avoid fake
    numerical compatibility.

### 51–60: safety and media integrity

51. **Participant safety:** visible Mute, Camera, Report and Leave/End; gestures
    may supplement but never hide emergency exits.
52. **Host/moderator safety:** capability-scoped public mute, stage/room removal,
    suspension, private termination and report review.
53. **Moderation audit:** append-only session/actor/target/action/reason/time/
    context records under strict access control.
54. **Reporting:** reference session, public event, private-room relationship,
    comment, participant and time; do not record private media for convenience.
55. **Blocking:** existing blocks prevent pairing, private Spark and suggestions;
    shared-public-event visibility follows least-surprising privacy.
56. **Recording:** beta public recording off by default; private auto-recording
    never. Future recording needs policy, consent, retention, privacy/legal work.
57. **Captions:** public later where supported; private off by default and never
    hidden transcripts.
58. **Network/media:** initially Host plus about three public publishers,
    adaptive quality (featured up to 720p, supporting around 360p), two-person
    private calls, audio fallback and human-readable quality guidance.
59. **HLS/scale:** hard-cap beta; preserve abstraction for later large-audience
    delivery without prematurely implementing it.
60. **Realtime authority:** Supabase authorizes stage/private lifecycle; Stream
    executes publish, revoke and terminate media effects.

### 61–70: operations, discovery and outcomes

61. **Webhooks:** server-side verified/idempotent provider receipts with unique
    event IDs; never trust client completion for critical state.
62. **Preferences:** Live invitation, starting-soon, result/update and compatible
    pooled-session settings integrated with existing notification preferences
    and quiet hours.
63. **Notifications:** schedule, RSVP, quorum confirmation, start, backstage,
    seat/private invite, mutual result, pool offer and recap; never notify a
    one-sided rejection; deep link correctly.
64. **Discovery:** future Live now/Tonight/For you/Your Circles/Upcoming without
    changing bottom navigation before an information-architecture audit.
65. **Hosted continuity:** Host interviews, prompts, Pulse, queues and prepares
    future matches while private Sparks run.
66. **No public rejection:** never show passes, zero likes, received-hearts or
    romantic rankings.
67. **No pay-to-win:** no purchased stage priority, ranking, attention or
    gift-based candidate priority; legitimate premium event/hosting/filter
    features may be evaluated separately.
68. **Host quality:** aggregate completion, satisfaction, reports, incidents,
    Spark acceptance and continuation; no simplistic public Host leaderboard.
69. **Analytics:** privacy-conscious events for session, RSVP, backstage/stage,
    match invitations, private Sparks, Chemistry reveal, decisions/mutual,
    Pulse/Spark, pool offers, reports/moderation and RTC reconnect outcomes.
70. **Success metrics:** mutual rate, Spark completion, post-Live continuation,
    first response/second conversation, safety rate, satisfaction, reconnect,
    confirmation and pooled rescue—not watch time, gifts or popularity.

### 71–80: resilient experience and code structure

71. **Accessibility:** VoiceOver/TalkBack, dynamic type where practical,
    labels, contrast, touch targets, captions where available, audio-first,
    reduced motion and non-color-only status.
72. **Audio first:** camera-off is a valid privacy/accessibility/bandwidth state,
    not technical failure.
73. **Microinteractions:** restrained haptics and animations for stage, Spark,
    mutual reveal and lifecycle; never slot-machine effects.
74. **Private transition:** accepted pair moves together visually, brief
    intertwined-heart motif, public tiles leave gracefully, separate call opens
    and public layout continues.
75. **Chemistry reveal:** slowly remove frost with continuous audio, subtle
    haptic and no jump cut/game-show drama.
76. **States:** intentional loading, waiting, Host disconnect, cancel/end, RTC
    unavailable, denied permissions, offline/token/removed and private
    disconnect screens—never blanks.
77. **Permissions:** explain camera/mic need, link Settings after denial and
    retain audience-only access where possible.
78. **Backgrounding:** handle iOS/Android background, calls, termination and
    interruption; offer rejoin and never infer rejection.
79. **State machines:** explicit session, participant, match, private Spark and
    chemistry machines; invalid transitions fail and are tested.
80. **Feature structure:** separate application services, components, domain,
    hooks, media adapter and types; avoid giant files.

### 81–91: backend security and verification

81. **RLS:** expose safe session/participant state only; protect private
    choices, unrelated rooms, moderation and Host suggestions at data/API level.
82. **Decision security:** trusted backend combines two private inputs and emits
    only an allowed mutual outcome.
83. **Constraints:** prevent duplicate active participation, concurrent Sparks,
    duplicate decisions/webhooks/seat requests and repeat pairings; use partial
    unique indexes where appropriate.
84. **Trusted APIs:** session/create/RSVP/seat/stage/lifecycle, match consent,
    private consent/token/termination/decision, pool offers and moderation/
    report transitions; follow repository naming conventions.
85. **Deep links:** Live, backstage, chat and Circle Live destinations through
    existing linking architecture.
86. **Offline:** cache scheduled metadata/recaps only; never simulate offline
    Live interaction.
87. **Observability:** RTC/token/Stream/state/webhook/private/reconnect/deep-link/
    RLS failures without logging media, transcripts, secrets, tokens or choices.
88. **Automated testing:** state/capability/eligibility/quorum/pooling/decision/
    chemistry unit tests; RLS/constraint/token/privacy database tests;
    webhook/match/chat/notification/Circle integration; multi-client Host/A/B/
    audience/moderator; failure scenarios.
89. **Real devices:** physical iPhone and Android over Wi-Fi/mobile/poor and
    switching networks, audio accessories and denied permissions.
90. **Performance:** profile memory, JS, rerenders, native video churn, list
    virtualization, network, battery and background; isolate ephemeral media
    from domain state and avoid whole-screen Realtime rerenders.
91. **Regression:** preserve Circle membership, roles, Love Seat, Gatherings,
    Pulse/comments, moderation, invites, presence and offline snapshots.

### 92–100: delivery and definition of done

92. **Development sequence:** use Phase 0–11 below; never ship one giant change.
93. **Beta scope:** selected verified users/Circles, limited audience, at most
    four public publishers, no recording/gifting/rankings and strong moderation.
94. **Security review:** no client secret/private-token bypass, decisions under
    RLS, no moderator private entry, blocks enforced, webhooks verified, deep
    links authorized, tokens expire, terminated rooms stay closed, bad accounts
    rejected and no client role escalation.
95. **UX review:** no public rejection/popularity/fake scores/hidden recording/
    forced reveal/spectator romantic voting/human catalogue/pay-to-win/
    disconnect-as-pass/Host private media.
96. **End-to-end experience:** discovery → RSVP → quorum → backstage/audience →
    Host Live → audience conversation → stage → Connection Signals/Spark →
    proposal/double consent → optional Chemistry First/public intro → private
    dual consent/Spark while public continues → private decisions → mutual
    connection → existing chat and relationship journey.
97. **Differentiation:** optimize for intentional relationships rather than
    broadcasting attention or swipe volume.
98. **Code quality:** strict TypeScript, no `any`, no giant components/Circle
    route dumping, reusable domain/hooks/services, no duplicated state/magic
    strings, indexed queries, transactional critical work, documentation and no
    security-sensitive TODOs; format/lint/type/test each phase.
99. **Working method:** audit, reuse/conflict/architecture/migration/dependency/
    native/test/security review; implement the smallest coherent phase, test,
    disclose failures and fix regressions before advancing.
100. **Definition of done:** secure RTC, capabilities, stage lifecycle, dual
    consent, private isolation/decision secrecy, reconnection, moderation,
    blocks, notifications/chat/Circle interoperability, quorum/pooling,
    responsive real-device UX, analytics, accessibility, performance and
    regression safety—not merely working video.

## Canonical delivery phases and exit criteria

### Phase 0 — Repository audit

Deliver reusable systems, required modifications, conflicts/risks, Live folder
and route architecture, migration/server/Stream/capability/UI/test plans,
dependency and native-build implications. No large feature implementation.

### Phase 1 — Foundation hardening

Implement canonical capabilities and domain types/state machines, database and
RLS, Live notification preference, media abstraction and server RTC tokens.
Exit only when authorization, invalid transitions and token denial paths pass.

### Phase 2 — Public Live beta

Implement schedule, backstage, Host/audience, capped stage, requests/promotion,
comments/reactions, moderation, device checks and recovery UI. Exit with
physical two-platform Host/audience/stage and reconnect testing.

### Phase 3 — Hosted matching

Implement Host candidate queue, eligibility/suggestions, pair proposal, private
double consent, public introduction, Conversation Spark, Connection Signals and
Host workflow without leaking rejection.

### Phase 4 — Private Spark

Implement separate two-person call, short credential, timer/controls/safety,
Host termination without listening, private decisions and existing match/chat
integration. Public Live must continue independently.

### Phase 5 — Audience Pulse

Implement curated room/question polls and restrained reactions. Votes are
private/idempotent and never determine romantic outcomes.

### Phase 6 — Chemistry First

Implement continuous-audio frosted presentation, accurate nonvisual context,
private offer/readiness, mutual reveal and smooth non-forced transition without
remounting media or briefly leaking video.

### Phase 7 — Quick Connect

Implement server-authoritative Host-facilitated rotations, eligibility-aware
pairing, odd-person waiting, exact private media admission, reconnection grace,
private outcomes and disconnect-not-pass semantics. Public Live remains the
facilitated lobby; joining its Quick Connect pool is explicit for guests. The
Host remains a facilitator and safety operator and is never eligible for a
private rotation. Every terminal private round requires a private safety check
before the participant returns to Live or joins another pool; reports and
blocks are pairing-scoped and server-authoritative. This public pool is not
Phase 8 cross-session pooling.

### Phase 8 — Quorum and Live Session Pooling

Implement quorum lifecycle, pairability-aware confirmation where practical,
general compatibility/pooling engine, transparent pool offers/explanations,
admin rules, user opt-out, origin preservation and safety auditing.

### Phase 9 — Circle integration

Implement Circle Pulse Live entry/tab, Gathering reference/subtype, complete
card states, Circle-origin sessions, recap and consent-aware Love Seat metadata.
Circle consumes Live; Live stays independent.

### Phase 10 — Intelligence

Only after deterministic behavior is stable: profile-input-only Conversation
Spark generation, Host Copilot and explainable candidate signals behind vendor
abstractions. No private surveillance.

### Phase 11 — Premium refinement

Finish cross-device polish and consider public captions, PiP/background
continuity, larger-audience delivery, Host analytics, governed public
recording, event highlights and richer discovery. “Consider” is not permission
to enable privacy-sensitive features without separate product approval.

## Public Live visual-polish specification

- Preserve occupancy-driven composition: solo immersive focus; balanced
  two-person intimacy; signature three-person layout with one primary tile and
  two supporting tiles. Do not flatten all states into equal grids.
- Four-plus remains hierarchy-first; avoid tiny-bubble circus.
- Active speaker uses subtle edge/contrast/depth, not constant aggressive
  resizing. Architecture should allow future Director Focus.
- Camera-off surfaces use avatar, ambient concentric field, name, small status
  and audio activity—not black emptiness.
- Header, Stage Desk, Room Pulse and control dock are distinct quiet layers.
  Stage Desk defaults compact and expands into management; Match Desk is deeper
  matchmaking. The later product decision groups Stage Desk, Audience Pulse,
  invites and future Host actions inside **Live Studio**.
- Room Pulse is compact by default (two or three recent messages, count,
  restrained reactions, input/send), expandable, more opaque and able to
  compress for important moments. Audience Pulse belongs in Studio/sheet and
  must not cover comments.
- Participant labels and media status are small, consistent and readable.
- Use flattering portrait framing without aggressive digital zoom; optional
  backstage centering/lighting guidance may come later.
- Motion is calm, haptic where meaningful, reduced-motion safe and never
  flashy. Preserve native video instances during layout changes.
- Avoid cheap gradients, excessive glass, heavy gold, neon, confetti, giant
  reactions, gaming UI and “more controls is better.”
- Validate iPhone/Android safe areas, notches/Dynamic Island, small screens,
  camera-off, keyboard/sheets and one/two/three-person occupancy.

## Private Spark luxury specification

- Preserve an equal full-height 50/50 composition: both participants matter.
  Use a hairline deep-teal seam with optional faint ambient bloom and a brief,
  small intertwined-heart entry motif.
- Header shows PRIVATE SPARK, “Only you two,” identities and a quiet timer.
  Do not add Host, Circle, viewer, compatibility or profile-detail clutter.
- Idle mode lets faces become the interface: after roughly 3–4 seconds,
  header/privacy/dock recede gracefully; one unobstructed video tap restores
  controls. Never auto-hide during permissions, network, disconnect, safety,
  end confirmation, Conversation Spark or Chemistry reveal states.
- Bottom dock keeps accessible Mic, Camera and muted-burgundy End Spark.
  Safety options (Report, Block, connection/privacy help and leave) are one
  interaction away. Technically accurate privacy copy must not claim E2EE
  unless verified.
- Timer is calm; optional one-minute and near-end cues use soft haptic/copy,
  never an alarming game countdown.
- Conversation Spark is optional and profile-derived, has Another/Close,
  thoughtful safe fallback prompts and never uses private media/transcripts.
- Participant presentation separates RTC video from normal, Chemistry-frosted,
  camera-off and reconnecting treatments. Reveal reduces frost continuously
  without video remount/black flash.
- Entry begins only after dual consent and private authorization; use a short
  branded loading state, 500–1000ms choreography where feasible and safe return
  to public Live on failure without duplicate/stranded rooms.
- Exit softens into private continue/friendship/not-this-time choice; backend
  derives mutual outcome; non-mutual copy is warm and neutral; return to active
  Live or recap. Reuse match/chat.
- Resilience covers camera framing, one/both cameras off, degraded network,
  reconnect grace, neutral failed-recovery copy, background/network changes and
  minimal native video/timer/reanimation churn.
- Private Spark never contains Room Pulse, audience chat/reactions/count,
  Host media, gifts, popularity, recording or hidden AI analysis.

## Required validation discipline

Automated green checks do not replace physical-device QA. Each phase report
must separately record:

- implemented in repository;
- migration/function deployed;
- automated validation passed;
- physical iPhone validated;
- physical Android validated;
- adverse-network/background/permission scenarios validated;
- production rollout verified.

Do not call a phase complete while one of its mandatory exit checks remains
unknown.
