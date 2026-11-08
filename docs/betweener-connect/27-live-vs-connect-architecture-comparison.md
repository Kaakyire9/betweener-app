# Live versus Connect: Stream architecture comparison

Date: 2026-10-30. Repository: `C:\Projects\betweener-app`. Scope: current source, retained staging evidence, pinned SDKs, public documentation and offline tests. **The same Stream Video infrastructure supports both features. No demonstrated Live application setting explains the Media Truth creation failures. Keep the hardened `betweener_connect` type; prepare the complete 640×480 request correction next. M2A/M2B remain BLOCKED and real calling remains disabled.**

No authenticated Stream API, Supabase, database, provider fixture, deployment, build or device operation ran. Runtime source, provider configuration, approvals and consumed ledgers were not changed. Two offline test files, this report and its [comparison receipt](stream-staging-live-connect-architecture-comparison.json) are the only new repository artifacts.

Receipt SHA-256: `199ed8b810105df8bc3d8666a44b0c397490ab7fe7770f62531d914a17926237`.

## 1. Evidence and conclusions

| Question | Finding | Evidence limit |
|---|---|---|
| Same API and compatible application? | **CONFIRMED historically:** both use Stream Video `/api/v2/video/call/{type}/{id}` and server SDK 0.7.63. Staging app 1731011 retained both custom types and successful Connect voice/video fixtures. | No fresh app read or deployed-secret attestation. |
| Custom Connect type appropriate? | **CONFIRMED for the retained policy:** exact pair membership, restricted roles and disabled capture/egress support private calling. | Correct admission policy does not prove immediate revocation of admitted media. |
| Diagnostic unnecessarily different? | **CONFIRMED:** production Connect already supplies complete video dimensions and inherits other hardened defaults. Media Truth supplies more partial objects but omits those dimensions. | Earlier fixture bodies are reconstructed, not historical wire captures. |
| Built-in type a safe shortcut? | **No.** Retained `audio_call` and `default` grants allow ordinary users substantially more access than Connect. | No new exploit or current built-in configuration probe. |
| Separate app required? | **No demonstrated requirement.** It would improve issuer/global-role/client isolation. | It would not itself correct a malformed request or enforce a revoke that never reaches the provider. |
| Minimum B3 correction? | **READY for preparation:** add the complete resolution object, preserving every B2 restriction. Limits-only is a separate conditional simplification. | Neither candidate has been accepted by the provider; no B3 executable manifest exists. |

“Working Live” refers to the owner's prior app/web media experience and the inspected implementation. This audit did not establish a new real Live media session. Current tests are reported separately below; the full Live suite is not green.

Evidence anchors: `docs/betweener-connect/local-m2-revalidation.json:28` records application **1731011, Betweener Staging**, enabled authentication/permission checks and the type inventory. `stream-staging-connect-validation.json:46` retains the configured Connect type. `stream-staging-connect-video-security-evidence.json:820` retains the corrected synthetic VIDEO result. Reports [18](18-connect-v1-revocation-boundary-decision.md), [22](22-connect-v1-media-truth-stage-b-results.md), [25](25-connect-v1-media-truth-b2-results.md) and [26](26-connect-v1-video-resolution-validation-audit.md) establish the distinct setup, media and failure limits.

## 2. Working Live architecture

### App and Studio contract

| Step | App implementation | Studio/web implementation |
|---|---|---|
| Application selection | `supabase/functions/live-rtc-token/index.ts:105` reads `STREAM_VIDEO_API_KEY`/`STREAM_VIDEO_API_SECRET`; the returned key initializes the client. | Same variables at `supabase/functions/live-studio-media-token/index.ts:133`. |
| Call identity | `rpc_create_live_session`, `supabase/migrations/20260812103000_betweener_live_phase1_foundation.sql:450`, generates a UUID at line 468 and provider ID `live_` plus its hyphenless UUID at line 505. Default type is `betweener_live` at line 43. | Studio receives the authoritative session's existing type/ID rather than selecting a different app or creating a UI-local call ID. |
| Authorization | `live-rtc-token` authenticates the bearer, applies the Live gate/rate checks and calls `rpc_get_live_rtc_admission_v2`. | `live-studio-media-token` validates source/controller admission; `apps/studio/src/api/studio-api.ts:488` supplies session, controller instance and source kind. |
| Provider creation | `live-rtc-token/index.ts:166` constructs `StreamClient`; lines 171–203 upsert the system creator as global `admin` and the participant as `user`, then call `getOrCreate`. | `live-studio-media-token/index.ts:134` constructs the same server SDK; line 142 creates/gets the same call with the admitted source identity. |
| Request | Both use `ring:false`, `notify:false`, creator `betweener-live-system`, an admitted `call_member`, `data.settings_override.limits.max_participants`, and custom session/recording metadata. | Studio also sets `betweener_studio_source:true`. Capacity is admission-derived; the offline representative value 4 is not a newly approved capacity. |
| Permissions/token | App lines 210–226 adjust audio/video permissions and generate a 600-second call token with `call_cids`. | Studio lines 165–177 adjust audio/video/screen permissions and issue a 300-second call token. |
| Client/media | `features/live/media/load-stream-video-sdk.ts:10` loads the native SDK. `stream-live-media-provider.ts:126` leases a client by API key/user, initializes a token provider, registers the background client and starts native audio configuration. At line 322 it joins with `create:false`, with capture disabled before join, then enables only admitted publication. | `apps/studio/src/media/studio-media-context.tsx:80` initializes the web `StreamVideoClient` with refresh; line 96 joins the admitted type/ID with `create:false`. `StreamVideo`/`StreamCall` mount at line 127. |
| Local teardown | `stream-live-media-provider.ts:364` and `:534` disable media, leave and release bindings. `stream-video-client-leases.ts:20` disconnects the shared client only after its final lease. | `studio-media-context.tsx:54` disables camera/mic/screen, leaves and disconnects its client. |

The exact app/Studio creation body is extracted from each actual `getOrCreate` expression in the new test, not manually copied from documentation. Both only override the participant limit and otherwise inherit their call type. `custom.recording_allowed:false` is application metadata; it is not a substitute for provider recording settings or permissions.

Live publication end is a separate authority. `features/live/application/live-repository.ts:175` calls `rpc_end_live_session_v2`; `20261016165616_live_broadcast_authority_and_step_up.sql:372` applies version/command/host checks and delegates to `rpc_end_live_session_v1`. The latter, `20260909110000_live_lifecycle_completion_and_recap.sql:7`, transitions database state without an external Stream ACK. Local departure or DB-ended UI does not demonstrate hostile-peer media cessation. The private Spark control separately attempts provider `.end()` after its DB operation (`supabase/functions/live-private-spark-control/index.ts:54`, `:83`). Studio disconnect similarly revokes permissions/kicks sources after its authoritative operation (`live-studio-disconnect/index.ts:79`). These are useful patterns, not an independent cross-system transaction.

### Distinct media/source paths

| Path | Actual implementation | Relevance to Connect |
|---|---|---|
| Native/web WebRTC | `features/live/components/StreamLiveStage.tsx:533`; `apps/studio/src/program/ProgramRenderer.tsx:65` select/render SDK participant tracks. | Same Stream signaling/media family; UI composition is not authorization. |
| Screen sharing | Studio controls publish a separate SDK screen track; the renderer chooses `screenShareTrack` or `videoTrack`. | A Live capability that must remain prohibited for Connect. |
| DJ input | `apps/studio/src/media/StudioDjSource.tsx:141` uses a Web Audio destination for a selected input and publishes through Stream. | Real capture/publishing plumbing; not evidence of a post-ended synthetic nonce. |
| Adaptive Program compositor | `live-broadcast-orchestrator/index.ts:188` creates/gets a Live call with no settings override. `apps/program-compositor-worker/renderer/CompositorApp.tsx:82` joins as a web subscriber. `src/compositor-runtime.mjs:82` assembles FFmpeg X11/Pulse capture and RTMP output; `src/worker.mjs:329` starts it and line 360 stops processes. | A downstream rendering/encoding/ingress pipeline, not a second private-calling API or proof of SFU revocation. |
| Prerecorded music/presentation | `features/live/odo/show/expo-live-music-engine.ts:11` creates an Expo audio player; `LiveMusicProgramStage.tsx` renders music status/presentation. | Playback and animation do not establish live RTP freshness or remote receipt. |

## 3. Connect creation, authorization and ownership

`features/connect/data/connect-repository.ts:19` sends the authenticated create RPC. The foundation migration, `20261028074908_connect_v1_foundation.sql:268`, checks pair authority, independent relationship proof or directional/media-specific consent, feature flags, expiry, occupancy and idempotency. The server-generated session UUID is also the provider call ID. A create job is committed in the same transaction.

`supabase/functions/_shared/connect-provider-worker.ts:27` claims provision work, rechecks eligibility and compensates stale creation with end work. `connect-stream-adapter.ts:97` requires an eligible REQUESTED snapshot, verifies application/type policy and upserts identities **without assigning global user roles**. Lines 103–109 create `betweener_connect:<session UUID>` with creator `betweener-connect-system`, exactly the pair as `connect_invited`, custom DB/media binding, cap 2 and a complete video object. Voice supplies `enabled:false`; VIDEO supplies `true`; both keep the camera default off. The adapter subsequently verifies exact members, binding and effective settings before success; ended provider calls are rejected.

Recipient acceptance, device selection and current authorization remain server-owned. The forward admission definition is `20261029081013_connect_forensic_repair_1.sql:4`. `connect-credential-issuance.ts:17` requires an explicit, fully validated `admitted:true` result at both fences. `connect-stream-adapter.ts:113` checks the provider call, promotes pair membership to `connect_voice` or `connect_video`, and issues an ordinary 120-second user JWT. Post-side-effect denial suppresses the response; durable provider cleanup remains necessary.

`features/connect/media/stream-voice-transport.ts:29` provides injectable join/leave/capture cleanup. It does not install a real authenticated native owner. `app/connect/voice-preview.tsx:9` still uses a fake preview. Live's concrete ownership, token-refresh and teardown patterns can inform that future composition; its implementation is not already wired into Connect.

Production errors remain safe product errors. The diagnostic has a separate bounded projection at `scripts/lib/connect-media-truth/provider-diagnostics.cjs` and `process.cjs`. Production `end()`'s pre-existing code-16 classification (`connect-stream-adapter.ts:126`) is outside this repair/audit; no new assurance about that classification is made.

## 4. Field-by-field creation comparison

All cases use server `video.call(type,id).getOrCreate(...)`, with settings under **`data.settings_override`**. A is actual current source reconstruction. B combines current production/wrapper reconstruction with retained earlier setup success. C (“B1”) is original Stage B; C/D use immutable manifests and current verified builder reconstruction. **Original C/D HTTP bodies and immutable run-start source for B are unavailable.** E is an offline candidate. None is newly submitted to Stream.

Sources: A `live-rtc-token/index.ts:185` and `live-studio-media-token/index.ts:142`; production `connect-stream-adapter.ts:103`; B `scripts/lib/connect-stream-closure-worker.ts:36`; C/D `scripts/lib/connect-media-truth/request.cjs:42` plus their original proposals; E report 26's candidate. The receipt retains every reconstructed leaf, actual offline serialized string and compiler result.

| Field | A: Live app / Studio | B: earlier Connect VOICE fixture | C: Media Truth B1 | D: B2 | E: complete-resolution candidate |
|---|---|---|---|---|---|
| Type | `betweener_live` | `betweener_connect` | Same as B | Same as B | Same as B |
| ID | Authoritative `live_<UUID without hyphens>` | Authoritative DB UUID | One owned fixture UUID | New owned fixture UUID | Synthetic comparison only; future execution needs new namespace/IDs |
| `ring` / `notify` | false / false | false / false | false / false | false / false | false / false |
| Creator | Live system identity | Third owned fixture identity substituted by wrapper | First of the two fixture members | Same arrangement as C | Same as D |
| Initial members/roles | One admitted user/source per request, `call_member`; accumulated roster belongs to Live | Pair as `connect_invited`, promoted only after application admission | Exactly pair, `connect_voice` from creation | Same as C | Same as D |
| Custom data | Session ID, recording metadata; Studio source flag | DB call ID, media, isolated-fixture flag | Owned marker `connect_media_truth_21`, voice | New marker `connect_media_truth_b2_24`, voice | Unchanged D values in offline comparison; no future marker allocated |
| Participant limit | Admission-derived | 2 | 2 | 2 | 2 |
| Duration override | Absent | 60 seconds in approved timer fixture | 60 | 60 | 60 |
| Audio object | Inherited | Inherited | Mic/speaker default false, earpiece, access requests false | Same as C | Same as D |
| Video flags | Inherited Live video settings | Disabled, camera default false | Disabled, camera default false | Same as C | Same as D |
| Video resolution | Inherited | Complete 640×480, bitrate 600000 | Omitted | Omitted | **Complete 640×480, bitrate 600000** |
| Screen/recording/transcription/individual/raw/frame/broadcast/ingress/thumbnails | Inherited Live settings, including ingress used by Live | Inherited hardened Connect settings | Explicit disabled objects | Same, plus frame interval below | Same as D |
| Frame interval in request | Absent | Absent; retained default 3 | Absent **inside supplied frame object** | 2, mode remains disabled | Same as D |
| Public SDK strict contract | Valid | Valid | **TS2741: required frame interval absent** | Valid | Valid |
| Historical/provider result | Owner reports real media; source path inspected, no new call here | Retained calls/positive receiving controls | HTTP 400/code 4, no media | HTTP 400/code 4, no media | **Unexecuted** |

The diagnostic's creator and immediate voice roles deliberately avoid a third identity and Supabase admission in a consenting provider-only test. They are not a replacement for production invited-only provisioning. No evidence demonstrates a creator/member conflict. More overrides are not inherently stronger: they can introduce incomplete nested request objects. Neither successful typing nor inheritance alone establishes server acceptance.

## 5. Application, call types and privacy

Both features select the **same API family**, not a Live-only endpoint. `live-rtc-token/deno.json:3`, `live-studio-media-token/deno.json:3`, `live-broadcast-orchestrator/deno.json:3` and `connect-edge.ts:3` pin server SDK **0.7.63**. Installed root/lock resolution is native SDK **1.46.3**, React web SDK **1.44.0**, video client **1.62.0**, WebRTC **145.4.1** and Callingx **0.11.5**. The new fake transport exercised server 0.7.63 with cached Deno **2.5.4**; no client media runtime was exercised.

Live uses `STREAM_VIDEO_*`; Connect uses `CONNECT_STREAM_*` and an explicit expected application ID (`connect-edge.ts:19`). Different variable names do not establish different apps. Retained evidence places the types and successful Connect fixtures in **1731011**. Current deployed values and all app-global settings were not read. The official API identifies calls by type/ID and permits custom types alongside built-ins; it describes inherited call-type defaults. No separate private-calling product/application mode is required by that contract. [Stream calls](https://getstream.io/video/docs/api/calls/).

The retained Connect grants are exactly:

| Role | Grants |
|---|---|
| `connect_invited` | `read-call` |
| `connect_voice` | `read-call`, `join-call`, `send-audio` |
| `connect_video` | The voice grants plus `send-video` |
| Ordinary `user`, generic `call_member`, guest/admin/global roles in the readback | Empty |

`stream-staging-connect-validation.json:46` retains this policy; `connect-stream-adapter.ts:35` enforces exact grants, rejects unexpected role powers and checks disabled features/capacity. Privacy comes from these grants and server-controlled membership, not the custom type's name or an unguessable ID. Calling is private in this admission sense; existing-media revocation remains an independent blocked boundary.

### Built-in types and Live grants

`tmp/connect-m2/provider-audit.json` is dated **2026-10-28T11:11:21.900Z**. The full retained `provider-configuration-before.json:3290` contains `audio_call`; `:603` begins `default`. These are historical application readbacks, not claims that every default is immutable/current.

| Retained setting/grant | `betweener_connect` | `audio_call` | `default` |
|---|---|---|---|
| Ordinary-user create/read/join | Denied | Granted | Granted |
| `join-ended-call`, owner update/member/permission powers | Absent | Present in ordinary-user grants | Present in ordinary-user grants |
| Recording/transcription | Disabled; no start permissions | Available; start permissions present | Available; start permissions present |
| Voice versus video publication | Dedicated role selected after consent | Broad user audio/video grants, despite video setting off | Broad user audio/video grants |
| Video/camera/screen defaults | Voice off/off/off; explicit consented VIDEO override | Off/off/off | On/on/on |
| Mic default / ingress | Off / off | On / on | On / on |
| Lifecycle in retained raw settings | Not retained by normalized custom-type receipt | `single_use` | `reusable` |

A direct switch would discard Connect's restricted ordinary-user boundary. Single-use lifecycle can override the built-in's ended-join grant; it does not restrict its initial ordinary-user access. Cap 2 is not a consent check or an enumeration of every session/device; the future fixture must still verify exact membership. Settings that turn a feature off do not by themselves replace least-privilege grants. The retained Live type also has broader user powers and ingress; it must not be copied as Connect policy.

Stream documents that call tokens **add** call membership/roles rather than restrict existing access. Installed `src/StreamClient.ts:180` implements `generateCallToken` by forwarding its payload to `generateUserToken`. Live's token is therefore not a stronger exclusive consent lease simply because it contains `call_cids`. Copying its token/global-role scheme into Connect would require an explicit authorization design. [Stream authentication](https://getstream.io/docs/platform/authentication/).

## 6. Safe simplification and minimum correction

**Immediate recommendation: E.** Add just:

```json
"target_resolution": { "width": 640, "height": 480, "bitrate": 600000 }
```

inside the existing disabled video override. Everything else remains deeply equal to B2. This is the smallest defensible **single-object settings correction** with production-source/retained-configuration precedent. Width and height alone are the SDK-required children; optional bitrate is retained to match that precedent. It is not a claim that these are the only valid dimensions or the mathematically shortest JSON.

Installed SDK `src/gen/models/index.ts:26930` makes the resolution object optional and `:22740` requires width/height when supplied. Public settings documentation constrains integer dimensions to 240–3840 and bitrate to at most 6000000. The candidate satisfies those bounds while `enabled` and `camera_default_on` remain false. The SDK serializes supplied bodies without inserting nested defaults (`src/ApiClient.ts:54`). [Stream settings](https://getstream.io/video/docs/api/call-types/settings/).

**Conditional future simplification: F.** A VOICE diagnostic could plausibly use only:

```json
"settings_override": {
  "limits": { "max_participants": 2, "max_duration_seconds": 60 }
}
```

The existing type already contains the voice defaults and complete resolution. This avoids instantiating partial audio/video/frame objects. It also inherits frame interval 3 instead of explicitly overriding 2; with recording disabled this does not enable capture. The new offline model overlays only limits onto the retained full type, then passes the actual adapter's type/session validators. **This is a model, not a provider-verified merge result.**

Do not remove the explicit restrictions now. Any future F preparation must independently verify the current full type before mutation and the created call's effective settings **before token issuance/join**, including exact pair/roles/binding, voice/video flags, complete resolution, camera/mic/speaker defaults, default audio device, access requests, all recording/caption modes, screen/thumbnail/ingress/broadcast prohibition and exact limits. Reject missing or unsafe settings. Preserve ownership, deadlines, no-retry limits and cleanup. A policy hash alone cannot substitute for the checked payload.

Existing diagnostic `provider.mts:59` checks effective settings plus an exact manifest subset and voice membership; line 84 preflights the type. Its existing validators do not assert every proposed inherited default, notably mic default and dimensions. Do not weaken `matchesSubset` to make F fit. A separate closed contract and explicit inherited-default assertions would be needed. F is not a general VIDEO request: VIDEO must explicitly satisfy video-specific consent and settings.

Production already demonstrates the useful middle ground: inherit hardened security settings, but provide a complete media-specific video object and verify effective policy. Safe reusable Live patterns are server-owned IDs, a small typed builder, call-type inheritance with readback, `join({create:false})`, refresh through current authority and explicit teardown. Keep Connect's independent proof/grant checks, invited roles, two admission fences, durable jobs, compensation and ACK/lease rules.

## 7. Separate application, lifecycle and remaining provider uncertainty

A dedicated application would isolate secrets/token issuers, global roles, app-wide token revocation and client caches. It could reduce the impact of an alternate issuer granting a former Connect member a credential. That specific former-member path remains unmeasured; the earlier outsider Live-token negative does not close it. Separate application identity also changes push/native/client ownership work. These are isolation reasons, not demonstrated fixes for either HTTP 400 or timer/media behavior.

Live's lease registry uses the first client factory (`stream-video-client-leases.ts:20`); installed video client `src/StreamVideoClient.ts:127` keys cached clients by API key/user. A future shared native owner must ensure Connect does not retain a Live-only token-refresh closure or disconnect another feature's client. This risk cannot explain provider-only creation failures before any SDK media client started.

`single_use` offers better ended-ID and ringing semantics. Current official lifecycle documentation says an ended single-use call rejects rejoin/get-or-create regardless of permissions. It cannot propagate consent loss when no termination operation reaches Stream. Its existence does not establish timer packet cutoff. [Stream call lifecycle](https://getstream.io/video/docs/api/call-lifecycle/).

The inspected 0.7.63 `CallSettingsRequest` (`src/gen/models/index.ts:4289`) has no lifecycle request field. The normalized Connect receipt omits lifecycle, so current custom-type lifecycle is unknown. A lifecycle change would require a separate reviewed provider configuration scope/approval; it is not included in this audit, and no cast, SDK upgrade or type switch was made. The built-in's useful lifecycle does not justify accepting its broader grants.

Unresolved: the B1 server rule (original text discarded); B2's exact rule/default/merge order; candidate server acceptance; current deployed app settings/secrets; effective inheritance for a future call; provider scheduler/runtime configuration; native Connect ownership; and all finite adversarial media-cutoff guarantees. B2's projected height/width references could originate from bare aliases; they do not prove fully qualified video paths, missing values or a required/minimum rule. The new test preserves that distinction.

## 8. Fresh verification and preservation

Added `__tests__/connect-live-architecture.regression.test.cjs` and `__tests__/fixtures/connect-live-contract-sdk-offline.mts`. Logs and exclusive artifacts are under `tmp/connect-live-comparison-27/`; the selected combined-run artifacts are `contracts-G3fAgc/`.

| Check | Fresh result / practical limit |
|---|---|
| New source-AST, creator/member, policy, inheritance-model, diagnostics, public SDK and serialization regressions | **13/13 PASS** |
| Combined Connect/media/relationship offline regressions | **255/255 PASS**, `offline-final.log` |
| Public SDK contract for A app, A Studio, B, D, E, F | **Zero errors**; C intentionally reproduces TS2741 |
| Real pinned SDK with fake fetch | **Seven intercepted POSTs; zero external requests**. Deno network and credential-file reads explicitly denied. All bodies equal their actual builders; false values survive. |
| Unsafe inherited-policy controls | Actual validators reject 14 role/feature mutations. An unsafe recording setting is rejected despite `custom.recording_allowed:false`. |
| Strict cached Deno check of new fixture | **PASS**, `deno-check.log` |
| Targeted ESLint | **PASS**, zero warnings, `lint.log`; temporary `.mts` parser extension only |
| Live before/after | **509/514 PASS, same five failures**, 60 files; summaries exactly equal |
| Preservation | **277/277 existing workspace entries and 202/202 protected historical entries unchanged** |

Fake fetch returns the same synthetic 400 for every shape. It tests serialization/error projection, not a provider validator or server acceptance. No browser, native device, SQL driver, app build or fresh hosted test ran. The combined runner exercises only pure/mocked/local tests, including unique disposable unit records; it creates no owner approval or provider resource.

The five fresh Live baseline failures are: `Live catalogue waits for real auth and reloads after auth recovery`; `audience Program output exposes no Studio access or private matching data`; `credential refresh first proves the active compositor lease`; `screen-only Program output follows the selected canvas and offers a focused view`; `standard Room Pulse keeps a curated, readable note preview`. Do not substitute the older four-failure/508-test baseline.

**Separate confirmed source mismatch:** `supabase/functions/live-broadcast-orchestrator/index.ts:119` calls `rpc_service_get_live_broadcast_snapshot_v2` with argument `p_lease_generation` at line 123. Its repository definition, `20261025190010_screen_presentation_fit_v1.sql:93`, names that parameter `p_expected_lease_generation`. This is a static named-RPC contract mismatch; deployed definitions/behavior were not queried. The failing compositor regression separately expects the old `_v1` name (`__tests__/live-phase-c2-compositor.regression.test.ts:29`), so its failure alone is not proof of this mismatch or of a bypass. No Live fix was attempted. This path is absent from the provider-only B1/B2 requests.

The [receipt](stream-staging-live-connect-architecture-comparison.json) retains source/SDK hashes, the complete A–F matrix, selected offline artifacts, test summaries and evidence limits. Historical manifests/readiness/approvals/locks were not refreshed or reset. Additional tests expand the inventory; historical preparation is not current execution authorization. The original boundary receipt remains SHA-256 `8c1d82141a5c5140c94ac2b65e2b09dca42ebbe1f0f8c87b852d6dacdffa501d`; B2 execution evidence remains `ff77e3cb8c6bb741e666925405919b027fe9f99e65458a81e942b45ed941b8ab`.

## 9. Minimum next action and decision

Prepare B3 offline using **E as the sole settings delta**, a fresh namespace/closed manifest and complete current provenance. Preserve all B2 roles, disabled capabilities, time budgets, observation/classifier thresholds and cleanup limits. Retain truthful bounded diagnostics; consider origin/match qualification before freezing source. Keep independent effective-setting verification before joining. No automatic creation retry or replacement fixture.

Treat limits-only F as a later reviewed simplification contingent on explicit inherited-default verification. It is unnecessary to switch type, create another Stream application or change lifecycle to perform the minimum correction. Track the separate Live RPC contract mismatch independently.

A future provider run requires a new concrete reviewed proposal and explicit owner authorization. No approval is requested or created by this report. A successful setup would establish compatibility for that request, not the original rejection mechanism or media cutoff. Keep real calling disabled.

```text
STREAM_APP_COMPATIBILITY = CONDITIONAL_PASS
LIVE_CONNECT_ARCHITECTURE_COMPARISON = PASS
CONNECT_CREATE_REQUEST_RECOMMENDATION = READY
CONNECT_PROVIDER_WRITES = NONE
CONNECT_M2A_SECURITY_GATE = BLOCKED
CONNECT_M2B_READY = BLOCKED
```

CONDITIONAL_PASS reflects retained demonstrated compatibility without fresh authenticated configuration attestation. READY means an offline correction suitable for separate preparation, not an executable fixture, server acceptance or release approval.
