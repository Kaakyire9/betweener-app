# Connect V1 physical-device safety validation preparation

Date: 2026-10-31. Repository: `C:\Projects\betweener-app`.

**The offline harness is prepared. No physical device was accessed.** This report covers local engineering, installed-source inspection and offline tests. No Stream client connection, provider credentials, hosted operation, native build, signing, installation, publication or OTA operation occurred. Calling remains disabled.

Reviewed Reports [38](38-connect-v1-end-call-and-block-local-implementation.md) and [39](39-connect-v1-native-safety-owner.md), their implementation, the installed native packages, Auth-epoch ports and Live's shared registry. Historical security outcomes remain unchanged.

## Harness implementation and verification boundary

All implementation is under [`harnesses/connect-device-safety`](../../harnesses/connect-device-safety/). It is a **standalone development entry**, outside Expo Router's `app` tree. No product navigation, bootstrap, feature flag, package dependency or existing source file was changed.

| File | Purpose |
|---|---|
| `index.ts` | Installs the JS network guard before requiring Expo/UI. Rejects release runtime execution. Does not load the product `index.js`, Router, Auth provider, push configuration or Live background client. |
| `network-guard.ts` | Locks out `fetch`, XMLHttpRequest, WebSocket, EventSource and sendBeacon. Retains API/time only, without URLs, payloads or credentials. |
| `local-session.ts` | Drives the actual `ConnectNativeMediaOwner` class and shared exclusive lease registry through a local `NativeCallHandle`. Tracks pending capture/player work, late streams, cleanup faults, explicit retry and separate evidence. |
| `native-hardware.ts` | Lazily checks the existing binary, requests sensor permission through WebRTC, creates real local tracks, and releases streams and a scoped WebRTC factory/ADM. Plays a generated cache-file WAV through Expo Audio. |
| `test-tone.ts` | Generates one second of mono 16-bit PCM, 16 kHz, 440 Hz. Low-amplitude playback loops until stopped; no downloaded asset. |
| `DeviceSafetyScreen.tsx` | Explicit arm, microphone disable/stop/release, optional camera and stream preview, local tone, cancel/stop, injected failure/hold, cleanup retry, local account-epoch scenarios and independent observation entry. |
| `package.json`, `app.config.js`, `metro.config.js`, `offline-devtools.ts` | Separate local JS entry/configuration. Updates disabled in the harness manifest; no Sentry Metro integration. Only Expo's development reload message-socket import is redirected to an empty local module, avoiding its automatic WebSocket under the deny-all guard. These are not native permission/build configuration changes. |
| `acceptance-template.json` | Separate iOS/Android records, both initially `NOT_TESTED`, with binary/revision/isolation/evidence/reviewer fields. |

New regressions: [`__tests__/connect-device-harness.regression.test.cjs`](../../__tests__/connect-device-harness.regression.test.cjs).

**This is an isolated hardware seam, not full production native-owner verification.** The production authenticated factory, `adaptNativeStreamSdk`, SDK DeviceManagers, SFU peers, real SDK leave/disconnect, credential refresh, Telecom/CallKit registration and product Auth integration are not exercised on hardware. The real owner class handles retirement and cleanup, but its `sdk` fields are supplied by a **local lifecycle model**. Receipts explicitly label `sdkStateOrigin=local_adapter_model_not_stream_sdk`, `streamSdkInspection=NOT_TESTED` and `fullProductionNativeOwnerVerified=false`. The inherited owner `sdk_reported` label must be interpreted within that envelope.

There is no microphone PCM receiver in the public capture seam. Camera frames render in a local RTCView; the locally generated tone is received by the local Expo player/output. Neither proves microphone sample activity. No peer connection, ICE candidate gathering, STUN/TURN, SDP or loopback signaling is created: a native peer could send network traffic outside the JS guard. Adding a microphone sample receiver or native instrumentation is separate work if the existing binary cannot provide sufficient evidence.

## Installed SDK paths: offline versus connected

Inspected installed versions: Stream RN SDK **1.46.3**, video-client **1.62.0**, Stream WebRTC **145.4.1**, Callingx **0.11.5**, Expo Audio **57.0.5**, Expo FileSystem **57.0.7**, Expo **57.0.30**, RN **0.86.3**. No installation or upgrade occurred.

| Path | Boundary |
|---|---|
| `video-client/src/StreamVideoClient.ts` constructor / `getOrCreateInstance` with user | Automatically calls `connectUser` using token/provider before call join. The Report 39 factory invokes this path. **Not offline; forbidden here, including dummy tokens.** |
| `connect-native-owner.ts` factory and `native-safety-composition.ts` | Require validated admission and Auth epoch. The default SDK loader would reach authenticated client creation. Neither is activated by the harness. |
| Real call join, refresh, signaling, publication, leave/disconnect | Connected operations; cannot establish an offline production lifecycle. `DeviceManager.muteStream` can await `call.stopPublish` while JOINED before local track cleanup. |
| Bare `mediaDevices.getUserMedia`, track `enabled`, `stop`, `release`, stream `release(false)` | Local permission/capture/bridge paths. `stop()` changes JS state and requests disable; `release()` separately requests native disposal. No independent OS completion follows from JS return values. |
| WebRTC `CallFactory.create/dispose` | Local native factory/ADM lifecycle, without a constructed peer. Scoped acquisition occurs only after the exclusive lease. Disposal must return literal `true`; false/rejection/hang retains quarantine. Native disposal is process-wide: use only the isolated cold-start harness process. |
| Public SDK `callManager.start/stop` | Store/clear configuration. Actual native audio lifecycle is installed through `registerSDKGlobals.ts` and join/leave hooks. Clearing configuration is not native audio shutdown. Diagnostic `logAudioState/getAudioStateLog` can instantiate a factory/ADM; not used as stop evidence. |
| Callingx module/event subscription | Local bridge/event plumbing. Harness observes available iOS interruption events without setup, registering a call, push, background task or ongoing-call service. Event delivery without the production lifecycle is **not established**. |
| Expo player with generated `file://` source | Local playback. No URI input or network asset is accepted. Pause/remove/cache deletion and factory disposal are observable requests, not measured speaker silence. |

The product `index.js` eagerly configures the Stream SDK and Live background-client callback. The standalone entry intentionally excludes it. Importing the bare WebRTC package installs local native event listeners; it does not instantiate an authenticated Stream client. The offline Node tests confirm the Stream RN SDK is not evaluated.

## Network isolation controls

1. The release-runtime guard and immutable JS transport guards run before harness/native adapters. No credential input, provider factory, Supabase import, app Auth bootstrap, remote media source or real client-disconnect operation is supplied by the seam. Empty admission credential fields cannot pass the production factory.
2. Arming requires an operator-recorded assertion that **external native/OS egress is already blocked**. The UI cannot establish this fact. Use an existing development binary, a cold process, and USB/loopback-only Metro with no external route. Disable Fast Refresh and automatic reload during resource tests.
3. The JS guard cannot block pre-existing sockets, native networking, dev-launcher telemetry, native SDK initializers or native OTA checks. The existing generated Android manifest still enables updates/Internet access. The harness's `updates.enabled=false` does not rewrite that binary. External firewall/radio isolation and observed egress evidence are mandatory; airplane mode alone is insufficient if Wi-Fi is re-enabled.
4. Record isolation before capture. Stop and investigate any unexpected transport attempt, loaded product bootstrap or external connection. Missing isolation evidence prevents device acceptance. No runtime network-isolation assertion has been verified on a device in Report 40.

Prepared future launch command, **not executed**, after device authorization and the isolation/binary checks:

```powershell
$env:EXPO_OFFLINE = '1'
$env:EXPO_NO_TELEMETRY = '1'
node node_modules/expo/bin/cli start harnesses/connect-device-safety --dev-client --offline --localhost --port 8094
```

Use the existing development launcher and an approved local transport. Do not launch the product entry, use a release/TestFlight app as the harness, run prebuild, install dependencies, create a binary or publish an update. The Expo config and Metro project root were resolved locally; actual development-launcher/bundle delivery was not exercised.

## Native modules, permissions and build boundary

| Requirement | Current local evidence / device requirement |
|---|---|
| `WebRTCModule`, RTCView; scoped factory methods | Installed WebRTC 145.4.1; generated Android autolinking includes it. Preflight also requires `createCallFactory`, `disposeCallFactory`, `getUserMedia`, `mediaStreamTrackRelease`. Module name alone cannot prove API/version compatibility. |
| `Callingx` | Installed 0.11.5; Android autolinking entry exists. Used only for available iOS interruption subscription. No Callingx setup or native call registration. |
| `ExpoAudio`, `FileSystem` | Installed 57.0.5 / 57.0.7; Expo module probes precede media activation. Native FileSystem registration is named **`FileSystem`**, not `ExpoFileSystem`. |
| Production Stream native bridges | Installed RN SDK and Android autolinking reference `StreamVideoReactNative` / `StreamInCallManager` paths. Not needed to drive this local adapter; their production lifecycle remains untested. |
| iOS microphone/camera | Existing `app.json` has `NSMicrophoneUsageDescription` and `NSCameraUsageDescription`. Runtime microphone consent is required; optional camera capture separately requests camera consent. No plist wording/entitlement was changed. No generated iOS project or installed binary was inspected. |
| Android microphone/camera/audio | Existing generated manifest declares `RECORD_AUDIO`, `CAMERA`, `MODIFY_AUDIO_SETTINGS`. Runtime microphone and optional camera consent are required. No storage permission is needed for the private cache WAV. |
| Android Bluetooth | Existing manifest declares Bluetooth/legacy permissions and `BLUETOOTH_CONNECT`. Applicable runtime permission and device/OS support must be confirmed before an approved Bluetooth test. The harness does not request it or choose SDK device IDs. |
| Background services | Existing Live foreground/keepalive configuration is unchanged. Harness retires on background/blur and starts no foreground/ongoing-call service. No new background permission is required by this preparation. |

**Existing development-build completeness is UNVERIFIED on both platforms.** Android generated manifest/autolinking is source evidence, not evidence of an installed APK. No app build output was found in `android/app/build`; no iOS project is present locally. Installed packages and EAS development profile do not prove what a device contains.

No new native module or permission is proposed for the prepared seam. A compatible existing development binary may run the JS entry. If preflight detects missing modules/APIs, permissions/declarations need changing, device diagnostics need native instrumentation, or a build/signing/install/publication step is needed: **stop and request separate owner approval for that concrete change**. No build or signing command was run here.

## Ownership, quarantine and recovery

The harness uses Report 39's **actual shared registry**, not a parallel audio lock. An existing Live lease rejects harness acquisition before capture. While the harness owns or quarantines the exclusive slot, Live and other exclusive owners are rejected. Its lease client contains only local resource cleanup and never calls a Stream client's disconnect. Released handles cannot disconnect a successor. Source tests cover these directions; actual simultaneous hardware sessions were not run.

The real owner disables/stops/releases observed local tracks immediately on retirement, while its independent cleanup branches proceed. The seam publishes streams returned after cancellation to that retired owner before resolving capture work. Release waits for pending capture/player delivery and native factory cleanup. Pending work never becomes success through elapsed time.

The UI can hold cleanup completion or inject a persistent failure **after local stop attempts**. These are labeled injected faults; they do not claim to reproduce a hung native bridge. On failure the registry retains its tombstone. The explicit retry control clears only the injected fault, reattempts owned track cleanup and retries the same retired owner's release. Real native hangs stay pending; it cannot resolve an OS/bridge hang. No force-clear/reset/reacquire mechanism exists.

Do not reload JS, clear the registry or restart another feature to bypass quarantine. For a real hung cleanup, preserve evidence and follow a separately approved device/process recovery plan. If the process must be terminated, independently establish capture/output cessation and record that termination was recovery, not successful owner cleanup.

Local logout/account-switch controls exercise the same captured user/epoch contract with synthetic local identities; they do not sign out a real account. Old epochs, background/blur, navigation and observed interruption events permanently retire the owner. Foreground/interruption-ended does not resume it. Existing Report 39 tests separately cover production factory refresh fences, same-user new epochs and stale navigation. The trusted product Auth host remains unmounted and is not verified by local identity simulation.

The seam makes no SDK route selection or global speaker-mute override. Bluetooth/speaker/earpiece selection and restoration are **NOT_TESTED**. Record baseline endpoint and actual audible endpoint before capture, stop, then independently observe restoration using an approved local successor/output control. OS route changes can themselves trigger retirement. iOS Callingx event delivery and Android audio-focus loss that does not cause AppState/blur remain gaps. Do not register real Live/provider sessions to close them under this report.

## Local validation executed

Evidence: `tmp/connect-device-harness-40/` (local, ignored).

| Check | Result / limit |
|---|---|
| New harness regressions | **23/23 PASS**, injected hardware ports only. Network denial, Expo reload-socket exclusion, local sensor/player operations, late microphone/camera/player, hung/failed cleanup and factory release, explicit retry, Auth/lifecycle, both ownership directions, evidence separation and default-off flags. |
| Combined harness + Report 39 + End/Block + relevant Live suites | **164/164 PASS**, zero failed/skipped/cancelled/TODO. `safety-live-verified.log`. Includes 49 native-owner, 48 End/Block and 44 Live cases; no physical/native/provider execution. |
| Targeted ESLint | **PASS**, zero warnings. `lint-verified.log`. |
| Expo config / Metro root | **PASS**, standalone `index.ts`, SDK 57 inferred, iOS/Android platforms, updates disabled, correct separate project root. No server started. |
| Babel screen transform | **PASS**, development transform of the standalone TSX screen. No bundle delivery or native binary compilation. |
| Repository TypeScript | **PASS**, full `tsc -p tsconfig.json --noEmit`, exit 0, zero errors. `typescript-verified.log`. |
| Preservation | All **2,414** pre-existing repository files/absences match their initial hashes. Only the new harness, its regression file and Report 40 were added. Existing default-off flags, dirty files, deleted migration, security reports/receipts and consumed approvals were not rewritten. `preservation.json`. |

Initial validation caught a regression's incorrect assumption about the existing product entry (`index.js`), two local TypeScript contract mismatches and lint issues; these were corrected. The native FileSystem registration name was checked against installed source and corrected before device use. Final startup inspection found Expo's automatic dev reload WebSocket; the harness-only resolver excludes that hook and was checked locally for iOS and Android. No failed run is counted as a passing result. Database tests and provider/security runners were not rerun: no DB/backend code changed.

Main offline test command:

```powershell
node --no-warnings=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test --test-reporter=tap __tests__/connect-device-harness.regression.test.cjs __tests__/connect-native-owner.regression.test.cjs __tests__/connect-end-block.regression.test.cjs __tests__/stream-live-media-provider.regression.test.ts __tests__/live-sdk-bootstrap.regression.test.ts __tests__/live-native-config.regression.test.ts __tests__/live-media-recovery.regression.test.ts __tests__/live-media-provider.regression.test.ts
node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
node node_modules/eslint/bin/eslint.js harnesses/connect-device-safety __tests__/connect-device-harness.regression.test.cjs --max-warnings 0
```

## Separate physical-device acceptance

| Platform | Shutdown result | Missing evidence |
|---|---|---|
| iOS | **NOT_TESTED** | Identified existing binary/device, isolation evidence, native capture/sample activity, camera if in scope, audible tone, independently observed sensor/output stop, factory/ADM lifecycle, interruptions and route restoration. |
| Android | **NOT_TESTED** | Same baseline; additionally audio-focus interruptions without AppState/blur and applicable Bluetooth permission/routing behavior. |

For **each sensor/output in scope**, require positive activity before shutdown and an independently observed stop afterward. Record monotonic harness events separately from timestamped OS/native instrumentation or external receiver evidence. An audible tone establishes the tone output only. A camera preview establishes rendered frames only. Microphone activity needs actual sample/native-source evidence; an enabled JS track and privacy indicator are insufficient.

The UI accepts independent observation records with source, axis, phase, local evidence reference and observed timestamp. These are operator-entered observations, not authenticated OS telemetry. Neither they nor completed SDK promises automatically change `deviceOutcome`: the receipt stays `NOT_TESTED` until a reviewer issues a separate physical acceptance record using the template.

Outcome meanings:

- **VERIFIED_DEVICE**: identified physical device, declared scope, positive controls and independently observed cessation for all mandatory axes/scenarios in that scope, with reproducible evidence and reviewer rationale. Verifies the declared offline seam scope only.
- **PARTIAL**: credible independent evidence covers only part of the declared scope; enumerate the unverified axes.
- **INCONCLUSIVE**: activity, attribution, timing or stop evidence cannot support a decision.
- **FAIL**: attributed media continues after shutdown, stale work reactivates media, unsafe ownership handoff occurs, or isolation is violated.
- **NOT_TESTED**: no physical run for that platform/scenario. This is Report 40's result for both platforms.

Do not award hardware acceptance from mock promises, JS `readyState`, successful native bridge requests, a disappearing privacy indicator alone, or silence without an established positive output control. No shutdown time bound is selected. An unavailable independent measurement remains a gap, not a fabricated native acknowledgment.

## Proposed next approval scope and stopping point

Request a separate, device-only execution scope identifying one iOS and one Android device and their **existing development binaries**, local transport/egress controls, exact source hashes, hardware access and evidence collection. Include microphone consent, optional camera consent, local tone/output observation, native lifecycle instrumentation already available, cancellation, fault quarantine/retry, Auth/lifecycle and supported audio-route checks. No real accounts, provider clients, Live sessions, hosted credentials or backend writes.

This report stops before that first device/diagnostic operation. If a suitable binary or instrumentation is unavailable, prepare a distinct build/permission/signing proposal for owner review; do not silently broaden this execution scope. A future real Stream-native lifecycle or remote-enforcement experiment requires its own reviewed plan and fresh authorization. Consumed Media Truth approvals remain consumed.

```text
CONNECT_DEVICE_HARNESS = READY
CONNECT_PHYSICAL_IOS_SHUTDOWN = NOT_TESTED
CONNECT_PHYSICAL_ANDROID_SHUTDOWN = NOT_TESTED
CONNECT_REMOTE_REVOCATION_BOUND = UNVERIFIED
CONNECT_M2A_SECURITY_GATE = BLOCKED
CONNECT_M2B_READY = BLOCKED
STAGING_MODIFICATIONS = NONE
PRODUCTION_MODIFICATIONS = NONE
```

`READY` means local harness preparation and offline contracts only. It does not approve physical-device execution, establish full production native-owner shutdown, or enable real user calling.
