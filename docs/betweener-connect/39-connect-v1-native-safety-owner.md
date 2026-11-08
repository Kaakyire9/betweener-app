# Connect V1 native safety owner

Date: 2026-10-31. Scope: **local source implementation, installed SDK inspection, isolated tests and a device-validation checklist**. The internal VOICE composition now has a concrete React Native Stream adapter and observable shutdown operations. Both `nativeSafetyOwner` and `endCallAndBlock` remain **false**. No application screen mounts the composition and no real credentials were issued or used.

**Physical shutdown is NOT_VERIFIED.** SDK state, JS track state, native bridge requests, successful leave and client release are separate observations; none is an independent microphone, camera or speaker measurement. Remote revocation remains UNVERIFIED, M2A/M2B remain BLOCKED. No hosted Stream/Supabase operation, build, native session, deployment or configuration change occurred.

## 1. Baseline and implementation boundary

Reviewed Reports [33](33-connect-v1-revocation-architecture-decision.md), [34](34-connect-v1-m2c-security-contract.md), [35](35-stream-media-enforcement-capability-enquiry.md), [37](37-connect-v1-end-call-and-block-offline-feasibility.md) and [38](38-connect-v1-end-call-and-block-local-implementation.md), current Connect contracts and Live's native implementation. **Report 36 is absent from this checkout**, as already recorded by Report 38.

This extends the local owner boundary; it does not implement a new authority, block store, worker or media-enforcement lease. Report 38's SQL migration, block command, two credential-admission fences, provider-end classification and durable ACK/lease handling are unchanged. Its ordinary End Call remains separate from End Call & Block.

| File | Implemented change |
|---|---|
| `features/connect/media/native-owner-types.ts` | Narrow Auth, lifecycle, SDK, track, audio-device and inspection ports. Explicit nullable/unknown SDK evidence and operation outcomes. |
| `features/connect/media/native-stream-sdk.ts:5` | Concrete adapter for the installed SDK: authenticated client, exact existing call, media managers, track inspection/release, peer disposal, leave and audio-device APIs. Native import remains lazy. |
| `features/connect/media/connect-native-owner.ts` | Call/owner epoch, identity and lifecycle fences, immediate local track requests, independent shutdown operations, observable inspection and quarantined resource release. |
| `features/connect/media/native-safety-composition.ts:14` | Internal composition of the existing `VoiceController`, `StreamVoiceTransport` and native factory. Auth-fenced injected API, call-bound navigation cleanup and lazy RN lifecycle/permission environment. No hosted API implementation or app mount is supplied. |
| `features/connect/media/stream-voice-transport.ts:16` | Supplies a current-generation predicate to the owner factory; retires pending lazy loads. SDK-only inspection cannot set independent `verified` safety facts. Existing generic owner-inspection tests remain supported. |
| `features/connect/config/connect-feature-flags.ts` | Adds `nativeSafetyOwner:false`; preserves `endCallAndBlock:false`. Factory, composition and native-environment loader reject default-off use before native loading/permission requests. |
| `features/live/media/stream-video-client-leases.ts:28` | Extends the **existing shared registry** with exclusive native ownership and disconnect tombstones. Live's ordinary ref-counted sharing remains supported. |
| `__tests__/connect-native-owner.regression.test.cjs` | 49 permanent offline native-owner/SDK-boundary/registry/composition cases; native and provider effects are doubles. |

These are three changed baseline files, five new implementation/test files and this report. Existing Live provider, bootstrap, background registry and audio-session implementation were not edited. No native dependency, package lock, app permission declaration, migration or existing historical report was changed.

## 2. Installed native behavior and ownership isolation

Inspected installed native SDK **1.46.3**, video-client **1.62.0**, React Native WebRTC **145.4.1** and Callingx **0.11.5**. No SDK upgrade occurred. Fourteen inspected package/SDK/native source files are hashed in `tmp/connect-native-owner-39/preservation-current.json` and the final verification receipt.

| Source | Relevant behavior and implemented response |
|---|---|
| `features/live/media/stream-live-media-provider.ts:124` | Live leases by API key/user, supplies its own token/refresh closure, configures speaker audio and registers a background client. Connect reuses only the common lazy loader and lease registry. It does not register as Live's background client. |
| `features/live/media/load-stream-video-sdk.ts:10` | One memoized native import installs WebRTC globals. Connect uses that boundary rather than evaluating a competing native SDK copy. |
| `node_modules/@stream-io/video-client/src/StreamVideoClient.ts:127` | `getOrCreateInstance` can return an existing API-key/user instance without adopting a new token provider. Connect requires exclusive ownership and checks a unique callback identity on the returned client's options. A foreign cached client is rejected without disconnecting it. |
| Same file, `disconnectUser` | Disconnect affects a user client and its cache key. Creating an independent client under the same key and later disconnecting it is not a safe way to bypass the singleton. |
| `node_modules/@stream-io/video-client/src/devices/DeviceManager.ts:492` | Local mute/stop may await an SFU stop-publication operation first. The owner directly requests track stop/release before those SDK promises can stall. |
| `node_modules/@stream-io/react-native-webrtc/src/MediaStreamTrack.ts:105`, `:129`, `:337` | `enabled` sends a bridge request; `stop()` updates JS state to ended; `release()` separately requests native track/source disposal. These are not native completion acknowledgements. |
| `node_modules/@stream-io/react-native-webrtc/ios/RCTWebRTC/WebRTCModule+RTCMediaStream.m:547`; Android `GetUserMediaImpl.java`, `TrackPrivate.dispose()` | Native release paths disable/dispose local media resources. Their existence is implementation evidence, not evidence that a particular physical device completed shutdown. |
| `node_modules/@stream-io/video-client/src/rtc/BasePeerConnection.ts:149`; `rtc/Publisher.ts:86` | Public peer `dispose()` closes the owned PC; publisher disposal also attempts track cleanup and can suppress a track-cleanup error. The owner separately inspects/tracks its local resources. These peer members are marked **SDK-internal** and require pinning/compilation review on upgrade. No private PC cast or invented closed-state getter is used. |
| `node_modules/@stream-io/video-client/src/Call.ts`, `leave()` | Leave can await join/stats/signaling before completion. The adapter calls `leave({reject:false})`; local privacy requests do not wait for it. |
| `node_modules/@stream-io/video-react-native-sdk/src/modules/call-manager/CallManager.ts:339`, `:349` | Public start/stop store/clear configuration. Actual native audio lifecycle is in `src/utils/internal/registerSDKGlobals.ts`. Clearing configuration is not hardware shutdown. |

The registry reserves Connect's exclusive slot **before** client creation. Any existing Live lease, even under another user/key, rejects acquisition. While Connect owns or quarantines native audio, all new Live/Connect acquisitions are rejected. Existing Live leases are never stopped to make room for Connect. A failed or hung disconnect retains the entry; an explicit scoped retry can complete release. No timeout silently clears ownership.

This deliberately disallows simultaneous native Live/Connect use. Native audio routing is process-wide, so separate API-key/user cache entries alone would not isolate audio. Normal Live room handoffs retain their existing shared lease count. Both directions of reentrant acquisition are guarded, and an old released handle cannot disconnect a successor.

The official [Stream RN troubleshooting guide](https://getstream.io/video/docs/react-native/advanced/troubleshooting/) recommends singleton client ownership. The [camera/microphone guide](https://getstream.io/video/docs/react-native/guides/camera-and-microphone/) documents device state and audio-device APIs; it does not certify hardware completion. The [calling lifecycle guide](https://getstream.io/video/docs/react-native/guides/calling-state-and-lifecycle/) describes SDK lifecycle states. Installed source determines the specific behavior used here.

## 3. Authentication, generation and lifecycle fences

The factory requires a trusted authenticated **user ID plus Auth epoch**, exact `betweener_connect:<UUIDv4>` identity, VOICE admission, a nonempty key/token and a finite future initial expiry. It copies admission/Auth identity fields so mutation of the original objects cannot retarget ownership. It checks again after permission and SDK-loading awaits. A transport generation cancelled during either wait cannot create a late client.

Only the Connect refresh callback is passed to the SDK. The first token comes from the validated initial admission; subsequent tokens use the existing transport's newly validated admission. Refresh is fenced before and after its await, including account/epoch, key, user, call, foreground state and retirement. A fresh credential can outlive the initial token's expiry; this does not extend authority using the old token. It makes **no claim** that JWT expiry terminates active media.

The internal composition accepts the existing controller's `VoiceApi` and trusted Auth owner as dependencies. It wraps API calls with the captured account epoch before/after awaits. A queued old-account operation cannot be redirected to a replacement account. A future host must feed this port from current trusted Auth state, including sign-out/sign-in epochs; a profile ID, persisted fallback or caller-supplied identity is insufficient. **The production Auth context is not mounted to this composition.** No alternate credential issuer or direct Supabase import was added.

Retirement is permanent for an owner. It starts local shutdown synchronously, denies joins/unmute/refresh/route selection and waits for late join/unmute mutations before releasing exclusive ownership. Late observed tracks are stopped again. The transport retains its retired-CID fence. Navigation cleanup is registered with the exact CID and works before credentials/SDK load finish; an old screen callback cannot stop a different successor call.

RN background/inactive transitions retire the owner rather than preserving a background call. Android window `blur` also retires it; foreground/focus does not resume it. iOS audio-interruption `began` retires it; `ended` does not resume. Android audio-focus interruptions that do **not** produce AppState/blur are not independently surfaced by this installed public adapter and remain a device-validation gap. No broad interruption guarantee is claimed.

Routes use stable SDK device IDs and require selected-ID readback. A bridge request without matching readback returns unconfirmed. Device lists are ignored after retirement. The owner never applies a process-global speaker mute/volume override that could poison the next Live session. VOICE has no camera-enable or screen-publication operation; observed unexpected camera/remote-video tracks are still stopped during cleanup.

## 4. Shutdown and inspection contract

On retirement, before any provider/network result:

1. Disable and stop every observed owned microphone/camera track; request native local-track `release()` separately. Disable/stop observed remote tracks. Each local release is tracked once after a successful request.
2. Independently start SDK force-disable microphone/camera, publisher/subscriber disposal, remote-track playout stop and SDK leave. A hung branch cannot suppress the other requests.
3. Keep the owner retired through late joins/unmute. Release waits for those mutations and pending cleanup branches. No deadline turns a pending operation into success.
4. Require usable SDK inspection, ended observed tracks, successful requested local-track release and, after native use, completed leave with SDK LEFT and absent peer references. Failures retain quarantine. Listener removal, configuration clearing and scoped client disconnect also must complete before ownership release completes.

`getSnapshot()` exposes separate microphone/camera state, audio/video publication state, publisher/subscriber presence, observed/unended track counts, retirement reason and per-operation outcomes. SDK inspection failure yields `inspection=failed` and unknown peer/publication facts; it cannot certify stopped resources. Counts retain previously observed tracks, including a disabled track whose `readyState` is still live.

| Axis | What is observed | What remains unverified |
|---|---|---|
| Microphone/camera | JS track ended state, SDK device status; native release request outcome | OS capture engine release, privacy indicators and physical sensor behavior |
| Audio/video publication | SDK publisher flags, peer disposal operation and later peer-reference absence | Native/remote packet cutoff, already buffered media or adversarial recipient behavior |
| Subscriptions/playout | Remote track stop requests, subscriber disposal, SDK leave/reference state | Physical speaker silence, audio-device buffers and OS audio-session deactivation |
| SDK leave | Pending/completed/failed independently | Provider-wide call end or consent revocation |
| Resource release | Local-track release requests, listener removal, config clearing and leased client disconnect | Independent native source/ADM disposal acknowledgement |

Every native inspection is tagged **`evidenceSource=sdk_reported`**, with **`physicalDeviceShutdown=not_verified`**. Operation `completed` means the exposed API/request completed, not that hardware was measured. A bridge API returning void can only establish a request was issued without a synchronous exception. `StreamVoiceTransport` therefore leaves its independent media facts unverified, and `isLocalShutdownVerified` stays false for this adapter even after all SDK operations complete.

An explicit peer-dispose failure remains visible even if later SDK leave succeeds and removes its peer references. Failure/absence of track release, unended tracks, unreadable release inspection, failed leave after native use, failed listener removal or hung work prevents ownership handoff. A best-effort disconnect in the failed-release branch targets only the owned client and retains the registry tombstone; it is not a successful release certificate.

Report 38's controller is unchanged: End Call & Block retires its generation, starts transport shutdown and dispatches the authoritative command **without awaiting cleanup**. The new composition test uses a hung native leave and observes a saved mock block with local leave/release still pending. A saved block/provider ACK cannot overwrite local uncertainty. Actual atomicity remains covered separately by real disposable database tests.

## 5. Executed verification

Logs and current hashes are under `tmp/connect-native-owner-39/`; `final-verification.json` retains selections, results and preservation. Native APIs and hosted credentials were **not** exercised. The new tests intercept `fetch` and observe zero network attempts; SDK adapter tests inject a fake module rather than importing native binaries.

| Check | Result and scope |
|---|---|
| Report 38 current security selection plus native-owner tests | **387/387 PASS**, no failures/skips/TODO: 290 existing cases + 48 End/Block + 49 native-owner. `connect-verified.log`. |
| Final focused native tests | **49/49 PASS**, including the final default-off native-environment guard. `native-final.log`. |
| Existing disposable PostgreSQL17/loopback REST checks | **22/22 PASS**, plus **88/88** relationship assertions. `database-final.log`. Both disposable resources removed; shared app DB unchanged. |
| Relevant Live ownership/bootstrap/native-config/media recovery/provider tests | **44/44 PASS**, five files. `live-ownership-final.log`. No real Live session; full Live suite not rerun. |
| Existing RN presentation test | **7/7 PASS**, unchanged Jest timeout. `interaction-1.log`. No native hardware session. |
| Expo TypeScript | `tsc -p tsconfig.json --noEmit`: **PASS**, zero errors. `typescript-complete.log`. |
| Targeted ESLint | **PASS**, zero warnings, eight changed/new source/test files. `lint-complete.log`. |
| Live environment isolation | **PASS**, staging/production isolated; no secrets printed. `live-isolation.log`. |

The new cases exercise default-off/no-native-import behavior, wrong identity/type/media/CID/expiry, permission denial, cancellation during lazy load, refresh/account mutation races, hanging stop/leave/subscriber cleanup, failed peer/track/listener release, unreadable SDK inspection, late joins/unmute, interruption/foreground behavior, route changes, simultaneous ownership, disconnect quarantine/retry, native SDK method mapping, foreign cached clients and nonblocking block submission. These demonstrate the implementation against doubles; they do not substitute for the checklist below.

Main commands:

```powershell
$nativeFiles39 = @((Get-Content -LiteralPath tmp/connect-analytical-hardening-32/media-truth-offline-status.json -Raw | ConvertFrom-Json).files) + @('__tests__/connect-end-block.regression.test.cjs','__tests__/connect-native-owner.regression.test.cjs')
node --no-warnings=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test --test-reporter=tap @nativeFiles39
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/test-connect-end-block-local.cjs
node --no-warnings=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test --test-reporter=tap __tests__/stream-live-media-provider.regression.test.ts __tests__/live-sdk-bootstrap.regression.test.ts __tests__/live-native-config.regression.test.ts __tests__/live-media-recovery.regression.test.ts __tests__/live-media-provider.regression.test.ts
node --no-deprecation node_modules/jest/bin/jest.js --runInBand --config jest.config.js __tests__/connect-voice.interaction.test.tsx
node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
node scripts/verify-live-environment-isolation.cjs
```

The first DB attempt returned DATABASE_NOT_VERIFIED because sandbox access to Docker config/named pipe was denied **before resource creation**. The identical inspected helper passed after local Docker execution permission; no approval review rejection occurred. Its only mutations were uniquely named disposable local clones. No database code/migration was edited. Earlier successful TypeScript/lint/combined logs are retained; final results above include subsequent release/inspection hardening. No failing result is counted as a PASS.

## 6. Preservation

Of **2,408 baseline repository files/absences**, **2,405 match**. Only the flag file, Connect transport and shared lease registry changed intentionally. All **534 protected current records match**. Unrelated dirty work, Reports 18–38, offline analytical classifiers, raw receipts, proposals, approvals, cleanup slots and consumed B1/B2/B3 ledgers are preserved.

Report 18's raw receipt remains SHA-256 `8c1d82141a5c5140c94ac2b65e2b09dca42ebbe1f0f8c87b852d6dacdffa501d`. B3's raw receipt remains `0dcb9e021be24ae8cebf105938c11155a859013f619892f1663209149d077b55`; canonical B3 wrapper remains `ef7dd20af2b379003132d4ab4d3a2743cbd914a6525db6ef3f13a64425ce11f9`. The negative/INCONCLUSIVE historical security outcomes are unchanged. Historical preparation was not refreshed or represented as current execution authority.

## 7. Physical-device checklist and approval boundary

**No checklist item below has been executed.** An emulator, mocked track or successful TypeScript check cannot mark it passed.

Minimum separately reviewed scope: a **device-only development harness**, explicitly bound to this owner revision, on one physical iOS device and one physical Android device. Use synthetic local media and injected authority/credentials; deny external networking and do not call SDK client-connect/join with dummy tokens. The offline device harness must exercise capture/release and local peer plumbing without invoking the production default loader's automatic Stream connection. No such harness/build or device operation is authorized or performed here.

Prerequisites requiring separate approval: use of an appropriate existing development build or creation/installation of a new one; microphone access and camera access only for the capture-shutdown test; hardware/OS diagnostic access; test devices and earphones/Bluetooth; a concrete trusted Auth-epoch host adapter. Current app declarations/plugins already support Live/WebRTC (`app.json:35`, `:36`; `app.config.js:455`, `:463`, `:465`), but their presence does not prove the installed device binary or approve Connect permission wording/configuration changes. Do not reuse Live background registration or turn on product calling flags.

| Device check | Required recorded evidence / rejection condition |
|---|---|
| Positive capture/playout control, then local End | Prove the chosen sensor/source and local receiver were active first. Record owner epoch, SDK/track operations and monotonic event times separately from OS/native observations. Require capture engine/source release and independently observed playout cessation; a disappearing screen or JS ended flag is insufficient. |
| Hang SDK disable/leave and disconnect the control path | Native track release requests and local peer cleanup still start immediately; authority submission is independent and correctly pending. No automatic ownership handoff while evidence is incomplete. Reject any continued physical capture attributed to the retired owner. |
| Partial bridge failure and failed native release | Failed/unknown evidence remains visible; no false full-shutdown result or silent unquarantine. Check real native sources, not just promise outcomes. |
| Background/foreground, lock, iOS interruption, Android focus loss | No retired join/refresh/unmute on resume. Explicitly test interruptions that leave Android AppState active; absent coverage is a blocker to claiming interruption safety. Measure routing/capture recovery behavior of Callingx/OS, not merely SDK events. |
| Earpiece/speaker/wired/Bluetooth changes and disconnects | Verify selected IDs and actual audio endpoint. No stale route callback or process-global mute affects a successor. Do not call diagnostic methods that instantiate an audio device merely to claim it stopped. |
| Denied/revoked mic/camera permission | No unauthorized activation; clear incomplete/denied evidence. Camera remains unavailable to the VOICE owner. Capture-only camera testing needs its own explicit permission. |
| Logout, same-user re-login/new epoch, account switch, delayed navigation | Old resource/refresh callbacks cannot activate media or issue another account's command. A navigation cancellation before SDK load also retires the intended CID. |
| Live/Connect simultaneous ownership and successor handoff | A competing owner is rejected. Existing Live capture/audio and refresh are unchanged. Validate post-release native audio restoration; do not infer it from the registry mock. A local harness may simulate Live leases; actual Live provider sessions require separate authorization. |

Independent evidence may include approved iOS AVAudioSession/capture instrumentation, Android AudioRecord/camera-source lifecycle instrumentation and a locally controlled receiver/output observation. OS indicators are useful corroboration but not a substitute for every sensor/playout check. Preserve errors and observation uncertainty; no shutdown duration bound is selected by this report.

A **real Stream signaling/media session** is a different scope requiring a concrete reviewed fixture/ownership/cleanup plan and separate owner approval. Dummy credentials, old experiment approvals and the offline flags do not authorize that connection. Capability clarification from Report 35 still precedes any new remote-enforcement experiment.

## 8. Recommendation and remaining risk

Review this owner and the narrow shared-registry change, then separately authorize the network-denied device harness. Keep the composition unmounted and flags false. No hosted role, call-type or shared setting change is required by this local implementation.

Remaining gaps are physical sensor/ADM/playout verification, Android interruptions without lifecycle/focus events, native behavior during bridge stalls/process suspension, trusted product Auth-epoch mounting, actual audio handoff with Callingx, and reliance on pinned SDK-internal peer disposal. Exclusive ownership covers users of the shared registry; future native clients bypassing it need an explicit ownership design. A cached-client callback check prevents borrowing that client, not every possible app-wide audio interaction.

These local controls protect a cooperative device's media resources. They do not prevent a modified peer from ignoring cleanup, retaining credentials or continuing an already-established SFU session when provider revocation fails. No local shutdown observation creates an autonomous media lease, proves remote packet cutoff or advances a security gate.

```text
CONNECT_NATIVE_OWNER_IMPLEMENTATION = PASS_LOCAL
CONNECT_NATIVE_SDK_INSPECTION = IMPLEMENTED
CONNECT_NATIVE_DEVICE_SHUTDOWN = NOT_VERIFIED
CONNECT_REMOTE_REVOCATION_BOUND = UNVERIFIED
CONNECT_M2A_SECURITY_GATE = BLOCKED
CONNECT_M2B_READY = BLOCKED
CONNECT_RUNTIME_ACTIVATION = NOT_AUTHORISED
PROVIDER_WRITES = NONE
STAGING_MODIFICATIONS = NONE
PRODUCTION_MODIFICATIONS = NONE
```

PASS_LOCAL refers to source and executed offline contracts. No physical-device PASS, remote-enforcement guarantee, release approval or real-calling activation is asserted.
