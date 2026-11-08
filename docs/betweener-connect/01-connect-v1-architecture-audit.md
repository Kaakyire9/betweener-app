# Connect V1: M0 architecture audit

> Current status: M0 security remediation and local M1 implementation are delivered.
> This remains the historical audit. See [M1 evidence](11-connect-v1-m1-implementation.md)
> and [outstanding Stream validation](12-connect-v1-stream-configuration-checklist.md).

> Historical audit snapshot from 2026-10-27. The subsequent local relationship
> repair and current validation are in [00-relationship-security-remediation.md](00-relationship-security-remediation.md).

Date: 2026-10-27. Repository: `C:\Projects\betweener-app`, HEAD `f5a4be7` plus
substantial pre-existing uncommitted Live, Studio, Circle and package changes.

**M0 audit: PASS. M1 entry gate: BLOCKED.** The local database accepts a match
created or promoted to `ACCEPTED` by one participant without recipient action.
Using that record alone to authorize private calls would violate the brief's
mutual-consent requirement. No feature code, migration, dependency, native
configuration, production resource, or existing application file was changed.

## Evidence scope

- Inspected the working tree, installed package manifests, SDK implementation,
  repository migrations, application configuration and local Docker database.
- Ran a transaction-only exploit diagnostic with synthetic identities and actual
  `authenticated` RLS. All fixtures and temporary extension creation rolled back.
- Local migration ledger ends at `20260930120000`; repository migrations extend
  into October. Local findings are **not** a full replay of the current repository
  or proof of the current staging/production schema. The repository still contains
  the same permissive match policies and client write path; no later replacement
  was found in the migrations inspected.
- No hosted Supabase queries, provider API calls, dashboard changes, secret
  rotations, EAS builds, OTA updates, or deployments were performed.
- Configuration names/presence were inspected without printing secret values.

## Installed dependencies

Versions below come from `node_modules`, rather than assuming package ranges
resolve to their lower bounds.

| Dependency | Installed | Assessment |
| --- | --- | --- |
| Expo | 57.0.30 | Existing development-build workflow; Expo Go cannot validate native calling |
| React / React Native | 19.2.3 / 0.86.3 | No upgrade proposed |
| Stream React Native Video | 1.46.3 | Existing SDK and native integration |
| Stream video-client | 1.62.0 | Transitive singleton implementation inspected |
| Stream WebRTC | 145.4.1 | Matches Video SDK `^145.4.1` peer range |
| Stream CallingX | 0.11.5 | Already installed; WebRTC `^145.3.1` peer range includes installed version |
| Firebase app / messaging | 26.4.0 / 26.4.0 | Already installed; no extra messaging library needed |
| Supabase JS | 2.118.0 | Mobile dependency; not the Edge runtime version |
| Stream Node SDK | 0.7.63 | Pinned in `supabase/functions/live-rtc-token/deno.json`; not a mobile dependency |
| Supabase JS in Live RTC Edge Function | 2.110.7 | Existing Deno import pin |

`package.json` also includes Reanimated 4.5.1, SVG 15.15.4, Sentry `~7.11.0`,
safe-area-context `~5.7.0`, Expo Image and Expo Linear Gradient. These are suitable
existing candidates for future UI work. No new animation, calling, audio-routing,
or notification dependency is justified by this audit. Peer-range compatibility
is not a successful native compile or physical-device test.

## Repository audit A–P

| Area | Actual implementation and reuse decision |
| --- | --- |
| A: Expo / RN | `package.json`, `app.config.js`, `eas.json`; versions above. Android target SDK 36 and iOS deployment target 16.4 are configured. |
| B: Stream / WebRTC | Existing packages above; `features/live/media/load-stream-video-sdk.ts` memoizes SDK loading. Reuse the SDK bootstrap boundary after extracting shared ownership. |
| C: Native plugins | `app.config.js` configures Stream with `ringing: false`, keep-alive on both platforms, PiP and no screenshare/non-ringing push. `plugins/with-betweener-live-webrtc.js` adds audio/voip background modes, Android service permissions and Live PiP controls. Presence of background modes does not prove incoming ringing works. |
| D: Initialization / tokens | `stream-live-media-provider.ts` leases `StreamVideoClient.getOrCreateInstance` using `apiKey:userId`. Its token refresh is tied to one Live admission and rejects identity/call drift. `live-rtc-token` authenticates with `getUser`, invokes authoritative admission/rate-limit RPCs, upserts users with `auth.users.id`, and issues ten-minute call tokens. |
| E: Database / RLS / RPCs | `20260713034644_remote_production_baseline.sql` defines profiles, matches, blocks, intent requests, request RPCs and match policies. Later feature migrations add server capabilities, private configuration and atomic rate-limit patterns. Local policy inspection and exploit reproduction reveal blocker B1 below. |
| F: Relationships | `matches.user1_id/user2_id` identify **profiles**, despite their names. `profiles.user_id` maps to Auth identities. Enum is `PENDING`, `ACCEPTED`, `REJECTED`. Existing flows recognize pending mutual-swipe matches, while chat tests for accepted matches; do not infer a Connect policy from enum spelling. |
| G: Intent workflow | `components/IntentRequestSheet.tsx` -> `lib/intents/offline-actions.ts` -> `rpc_create_intent_request`; recipient decisions use `rpc_decide_intent_request`. `hooks/useIntentRequests.ts` supplies snapshots/realtime. Request `actor_id/recipient_id` are profile IDs. Choices/metadata are sender-controlled preferences, never proof of recipient consent. No existing Connect media-consent fields were found. |
| H: Safety / privacy | `blocks.blocker_id/blocked_id` are Auth user IDs. `lib/chat/chat-thread-remote-service.ts` fetches bidirectional blocks and submits `rpc_submit_report`. Profiles have account/identity/moderation state, active/deleted fields; Auth has banned/deleted/anonymous fields. `public.settings` has display/general notification preferences, not Connect call availability. Existing block insertion has no Connect provider-termination path. |
| I: Notifications | `lib/notifications/push.ts` registers Expo push destinations through `upsert_push_token_v2`, with application/environment/installation identity. `push-notifications` and shared push-security/provenance helpers handle the existing pipeline. This is not automatically Stream FCM/VoIP registration. `index.js` owns the one Stream push configuration, but has no provider names or cold-start client creation. No application `setBackgroundMessageHandler` registration was found. |
| J: Chat | `app/chat/[id].tsx` exports `components/chat/ChatScreen.tsx`. Header/avatar/status are currently inline near its header JSX; `ChatThreadView` is a presentational safe-area root. Chat has offline text/media, receipts, voice messages, expressions and safety services. Introduce a small future header-actions component instead of expanding call logic inside ChatScreen. |
| K: Flags | Existing patterns include client flags in `features/relationship-gists/config`, a staging variant fence in `features/live/config/live-product-release.ts`, private stage flags and server-owned `economy_feature_flags`. Economy flag names are constrained to economy products: do not add Connect to that closed enum/table. Reuse the fail-closed server configuration pattern, not economy semantics. No Connect flags exist yet. |
| L: Telemetry | `lib/telemetry/sentry.ts` redacts breadcrumbs/contexts and disables default PII. Reuse sanitized capture helpers with an explicit Connect metadata allowlist. No private-call quality instrumentation or measured SLOs exist. |
| M: Identity / avatars | `lib/profile/display-name.ts` supplies display-name and remote-image safety helpers already used in ChatScreen; Expo Image, blocked-avatar treatment and existing profile UI can be reused. Never use presentation names as provider identity. |
| N: Design | `constants/theme.ts` uses teal/oat/purple with light/dark variants, not the exact aspirational hex values in the brief. Existing SVG, Reanimated, safe areas and responsive metrics are available. Proposed UI treatment is in document 06. |
| O: Validation | Existing Node regression tests, Jest/RN tests, pgTAP SQL and `verify:*` isolation scripts are available. Use repository Supabase wrappers when CLI access is needed. Local database checks can use the specifically named Docker container without remote credentials. |
| P: Existing calling | Live stage, Quick Connect and Private Spark already use Stream media, with providers and role gates. `index.js` initializes ongoing native-call options for Live. No independent Betweener Connect private-call lifecycle, routes, history, consent or authorization service was found. Private Spark is not a reusable Connect relationship grant. |

## Environment isolation

| Surface | Verified repository/local mapping |
| --- | --- |
| Staging native identity | `com.aduboffour.betweener.staging`, `betweenerstaging`, `staging.getbetweener.com` |
| Staging Supabase ref | `xsgzxadwuxuziubglvps` |
| Production native identity | `com.aduboffour.betweener`, `betweenerapp`, `getbetweener.com` |
| Production Supabase ref | `jbyblhithbqwojhwlenv`; identified from files, never queried |
| Local configuration | `.env.local` explicitly selects staging variant/environment/backend. Base `.env` contains the production backend URL; loading it alone is unsuitable for Connect development. |
| Development build profiles | Existing app config maps development/preview environments to the staging native identity. A third independently verified development Supabase/Stream mapping was not established. |
| Stream app mapping | Edge Functions read server-side `STREAM_VIDEO_API_KEY/SECRET`; mobile receives the public API key through admission. `.env.stream-audit.local` contains separate historically labeled and staging credential groups. Their labels/presence do not prove which provider app current hosted functions use. App identity, call-type permissions, push provider names and retention remain NOT_TESTED. |

The Live, EAS project and Android variant isolation scripts pass. This verifies
repository configuration, not deployed Stream applications or installed binaries.

## Critical findings and entry gates

### B1 — Existing matches are not authoritative mutual-consent evidence: FAIL

The baseline `Matches insert by participants` and `Matches update by participants`
policies check whether the actor owns either profile. They do not require the
other participant's decision or constrain unilateral `ACCEPTED` writes.
`ChatScreen.ensureMatch` also directly inserts/promotes `ACCEPTED` rows.

The [local diagnostic](../../supabase/verification/connect_v1_m0_relationship_authority_audit.sql)
reproduced all of the following with RLS and relationship triggers enabled:

1. No Intent Request or mutual swipes exist for the synthetic caller/recipient.
2. One authenticated participant inserts an accepted match successfully.
3. `can_users_chat` returns true for that forged relationship.
4. The participant also promotes an unrelated pending pair to accepted.
5. An unrelated third user is denied by RLS, confirming the attack did not run
   with the fixture creator's privileged database role.

Nine diagnostic assertions passed. Here, PASS means **the vulnerability was
reproduced**, not that private calling is secure. After rollback, all four test
Auth users and both match rows were absent; no synthetic push events were created.

Existing `intent_requests` also permits participant-owned INSERT with arbitrary
metadata and has no recipient approval columns. Storing an approved calling
grant in sender-supplied metadata would inherit the same trust failure. Reading,
accepting, auto-closing or marking a request `matched` is not Connect consent.

**Gate:** secure existing relationship writes and establish trusted mutual
decision provenance before implementing the matched-call authorization mode.
Do not solve this by duplicating matches or trusting cached chat eligibility.
Historical accepted rows cannot be automatically certified as mutual decisions.

### B2 — Provider isolation is unverified: BLOCKED before M2

Live's call-token creation is a useful server-side pattern, not proof that a
Connect call type is private. Stream explicitly documents that call tokens add
membership access and do not narrow permissions already granted to ordinary
users. No Connect-specific provider grants or direct API bypass results exist.
Require a separate private call type in the correct non-production Stream app,
explicit ordinary-user denial and member-only minimal capabilities. Never
change Live's call type to accommodate Connect.

### B3 — Singleton reuse requires an ownership refactor: BLOCKED before M2

The installed `video-client` returns the existing instance without replacing
its original token provider. The Live lease registry only calls its factory for
the first lease. That factory's refresh closure is pinned to one Live call.
Simply taking a Connect lease can therefore retain a Live-only refresh path.
The background-client module returns the most recently registered live instance
without selecting an app/user from a push envelope.

Move shared client ownership behind an Auth/app-aware RTC service with explicit
admission/token refresh ownership and logout cleanup, preserving Live leases.
Do not add a competing same-user/same-app client or broaden tokens to work around
the problem. Test handoff, refresh, last-release, account switch and cold start.

### B4 — Native incoming calls are not configured: BLOCKED before M5/readiness

`ringing: false` and missing push provider names mean this repository does not
currently configure Connect incoming ringing. The background callback returns
undefined when no Live client is registered. CallKit/Telecom options and voip
background modes alone do not restore authentication or authorize an answer.
APNs VoIP/FCM provider credentials, provisioning and physical-device outcomes
remain unverified. A separately authorized native development build is required.

## Proposed database work — not implemented

- Reuse `profiles`, `matches`, `blocks` and `intent_requests`; preserve profile/Auth
  ID distinctions and existing intent request types/statuses.
- First harden existing match mutation routes and accepted-decision provenance.
- Extend existing Intent Request records with typed voice/video preferences and
  protected recipient approval/revocation/expiry fields. Every direct INSERT and
  UPDATE must reject forged approval fields. No duplicate relationship table.
- Add Connect-only sessions, participant occupancy, safe lifecycle events,
  idempotency receipts, provider-work outbox and private server configuration.
  Keep private implementation tables out of exposed API schemas where practical.
- Use one unique per-user occupancy row, not separate caller/callee unique
  indexes, to prevent a user being caller in one call and callee in another.
- Enforce transitions/version fences, ordered user/pair locks, bounded expiry and
  configurable rates in transactions. Provider calls run outside transactions
  through idempotent work with rechecks and compensation.
- Add participant-scoped read RPCs/history; no client session/grant/event writes.
  Ensure definer function privileges/search paths are explicit and tested.

## Live risks and implementation sequence

Relationship hardening can affect existing chat and Live Private Spark matching;
audit every writer before changing its contract. Shared RTC refactoring can affect
token refresh, PiP, microphone ownership and route cleanup. Entry-point/native
changes can affect every notification type. None of those paths was modified here.

Complete relationship hardening and its compatibility tests, then M1, then
provider permission setup/bypass tests and shared-client ownership, then M2–M9
in the [implementation plan](02-connect-v1-implementation-plan.md).

## External decisions and unverifiable findings

Confirm the intended non-production Stream app and its private call type before
using any credentials. Review configurable pre-match expiry and abuse thresholds,
matched-call availability defaults and historical-match treatment. Verify native
provider/provisioning identities and actual recording/transcription/retention
settings. Provider bypass attempts, network/media behavior, OS interruptions,
accessibility, battery use and physical-device cases remain NOT_TESTED.

## Official references checked

- [Stream client authentication](https://getstream.io/video/docs/react-native/guides/client-auth/): singleton and token-provider guidance.
- [Stream authentication and call tokens](https://getstream.io/docs/platform/authentication/): call tokens grant membership rather than restricting existing role permissions.
- [Stream server calls](https://getstream.io/video/docs/api/calls/): membership and call-type access controls.
- [Stream Expo ringing setup](https://getstream.io/video/docs/react-native/advanced/incoming-calls/ringing-setup/expo/): native incoming-call prerequisites and OS restrictions. Installed SDK source was also inspected.
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security): grants plus row predicates must secure data access.

The requested Supabase changelog Markdown endpoint could not be fetched by the
documentation tool. Current HTML RLS guidance was accessible; no Supabase feature
implementation or upgrade was made based on unverified release notes.
