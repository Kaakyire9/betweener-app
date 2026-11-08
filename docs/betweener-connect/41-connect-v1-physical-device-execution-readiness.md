# Connect V1 physical-device execution readiness

Date: 2026-10-31. Starting evidence: [Report 40](40-connect-v1-device-safety-validation-preparation.md). Scope: **read-only preflight, PC-only offline probes and a controlled execution plan**. Target devices identified by the owner: **iPhone 15 Pro** and **Galaxy A17** (reported as “Galaxy A17 5”; exact variant/model number remains unverified).

**Neither device is cleared for execution.** Following the initial inspection, the owner supplied exact build links and confirmed installation on the matching phones. Expo metadata now identifies both staging development-build candidates; on-device native API compatibility is still unverified. Android readiness is CONDITIONAL; iPhone readiness remains BLOCKED on transport. Microphone activity measurement remains incomplete. No sensor access, device app launch, Metro server, build, installation, signing change or OTA publication was performed by this preflight.

## 1. Actual preflight results

| Item | Galaxy A17 / Android | iPhone 15 Pro / iOS |
|---|---|---|
| Physical device identity | Owner-supplied family only; exact model, Android/One UI version, serial and ABI not read. | Owner-supplied model only; iOS version, device identifier and Developer Mode not read. |
| Connected-device discovery | `adb devices -l` returned **zero devices**. | Read-only Windows PnP enumeration inspected 161 present entries and found **no matching Apple/iPhone/Android/Samsung/Galaxy device**. This does not identify an installed iPhone build. |
| Host tooling | `C:\Android\platform-tools\adb.exe`, version **36.0.0-13206524**. Android SDK/build tools exist. No device reverse mapping could be inspected because no ADB device was available. | Apple Mobile Device Support **14.1.0.35** and Bonjour **3.0.0.10** installed; their services running. `idevice_id`, `ideviceinfo`, `idevicesyslog`, `iproxy`, `ios-deploy` and `xcrun` were not identified as usable tooling; `pymobiledevice3` is not installed in the inspected Python environment. Apple services alone are not an execution/debug transport. |
| Existing development binary | **Identified candidate; owner confirms installed.** Expo verified Android APK `a3d480e9-38f9-4e75-beb6-55038e91bc00`. No on-device package/module inspection or APK download. | **Identified candidate; owner confirms installed.** Expo verified physical-device IPA `43e33173-cd96-41b1-8e9e-9df6834930a8`. No on-device package/module inspection or IPA download. |
| USB/loopback Metro | **Supported mechanism, untested on this phone:** ADB reverse from phone TCP8094 to host TCP8094. | **Not established.** No verified phone-to-PC reverse tunnel or isolated USB IP route. PC localhost is not iPhone localhost. |
| Current readiness | **CONDITIONAL** on native module/API checks, first-entry control, USB delivery, isolation and the separately approved execution scope. | **BLOCKED** on an approved transport; native module/API checks, first-entry control and isolation also remain. |

Checked repository `android/app/build`, `build`, `builds`, `dist`, `artifacts` and the owner's Downloads tree for APK/AAB/IPA artifacts. The only identified artifact was:

```text
C:\Users\HP\Downloads\application-c60642c6-e1dc-4409-8f77-3e1ac587cbee.aab
217794817 bytes
SHA-256 9a879cbab3c90b9a3836789890c510ad5d18bb3e97e9de73c7e71a9d9504411f
```

Static ZIP/DEX inspection found WebRTC factory/release, Expo Audio/FileSystem and dev-launcher strings, plus four native ABI directories. **String presence does not establish registration, native versions, debug eligibility, or that either phone has this artifact installed.** The AAB is not an installable APK; converting/signing/installing it is outside this scope. [Expo APK guidance](https://docs.expo.dev/build-reference/apk/).

`eas.json:6` declares a development-client profile. That is a build recipe, not an available binary. No EAS build-list/download, Apple signing service, Stream or Supabase endpoint was queried. Searches do not exclude an existing build elsewhere or already installed on an unavailable phone; **a rebuild is not yet demonstrated to be necessary**.

### Owner-supplied build screenshot: follow-up evidence

After the initial preflight, the owner supplied an Expo **Betweener Staging** build-list screenshot. It shows **two successful candidate builds**: Android internal distribution and iOS internal distribution **1.2.0 (1)**, both under profile/channel `development`, runtime label `1.2.0`, Git ref **`f560559`**, displayed age 24 days. A separate failed iOS row is not a candidate. This updates build availability evidence; the local artifact search above remains its original observation. Screenshot SHA-256: `5856a802b0f978b49b8bcfca9d3b08b958fe47991aa70b8ac2eaff754b1000fa`.

The local repository resolves `f560559` to the 2026-10-07 toolchain-refresh commit. Its committed lockfile comparison is:

| Dependency | At `f560559` | Current harness lockfile |
|---|---|---|
| Expo / dev-client | 57.0.27 / 57.0.19 | 57.0.30 / 57.0.20 |
| React Native | 0.86.3 | 0.86.3 |
| Stream RN SDK | 1.46.0 | 1.46.3 |
| Stream WebRTC | 145.4.1 | 145.4.1 |
| Callingx | 0.11.5 | 0.11.5 |
| Expo Audio / FileSystem | 57.0.5 / 57.0.7 | 57.0.5 / 57.0.7 |

This makes the builds useful candidates: the principal local-media dependency versions agree. The Expo/dev-client differences require compatibility verification; the Stream RN SDK difference alone does not require a rebuild for a seam that never invokes it. The screenshot's runtime label is **not a native SDK/API attestation**. A Git ref/committed lockfile also cannot attest the exact uploaded build contents, uncommitted changes, applied patches or successful native module registration.

At the screenshot stage, exact build IDs and installation confirmation were still missing; the next follow-up supplies them. Native module/first-entry/isolation checks remain. No screenshot build was downloaded, installed, launched or treated as compatible. **No new build is requested merely because these candidates are older.** The initial preflight receipt is retained unchanged; screenshot evidence is recorded separately in `tmp/connect-device-preflight-41/build-screenshot-followup.json`.

### Exact build links and owner-confirmed installation

The owner subsequently supplied both links and confirmed that each build is installed on its matching phone. A read-only lookup with the existing **EAS CLI 24.11.0** verified:

| Target | Authoritative build record | Artifact / result | Completed UTC |
|---|---|---|---|
| Galaxy A17 | [a3d480e9-38f9-4e75-beb6-55038e91bc00](https://expo.dev/accounts/kaakyire9/projects/betweener-staging/builds/a3d480e9-38f9-4e75-beb6-55038e91bc00) | ANDROID, FINISHED, APK available | 2026-10-07 10:54:00.094 |
| iPhone 15 Pro | [43e33173-cd96-41b1-8e9e-9df6834930a8](https://expo.dev/accounts/kaakyire9/projects/betweener-staging/builds/43e33173-cd96-41b1-8e9e-9df6834930a8) | IOS, FINISHED, IPA available, not an iOS simulator build | 2026-10-07 09:43:35.629 |

Both records report profile/channel `development`, distribution `INTERNAL`, app version/build **1.2.0 / 1**, Expo SDK **57.0.0**, runtime label **1.2.0**, application identifier **`com.aduboffour.betweener.staging`**, project **`betweener-staging` / `7f38a835-2da7-419b-a20b-e1a12e021547`**, and commit **`f560559b6a3ef09ecb7fd7dfadf9bd742a88184a`**. The CLI fragment does not separately attest a `developmentClient` boolean; the profile and committed recipe support candidate selection, while actual debug/native capabilities remain subject to the binary guard.

Installation is **owner-confirmed**, not an independently read package/version measurement. Build identity/availability is now stronger than screenshot evidence; this does not establish native API behavior or grant device-execution permission. Android changes from BLOCKED to **CONDITIONAL preflight readiness only**. iOS remains BLOCKED because its phone-to-PC transport and isolation policy are unresolved. Neither status changes M2A/M2B or the microphone measurement gap.

The web fetcher could not access the detail pages and local browser use was disabled. The initial CLI lookup also failed under sandbox restrictions; the inspected read-only retry succeeded. Only Expo build/project metadata was read using existing authentication. No artifact, signed download URL, credential or provisioning device list was persisted; no artifact was downloaded and no install, build, signing or device-launch command ran. Sanitized results are retained at `tmp/connect-device-preflight-41/expo-build-metadata-reviewed.json`; the earlier failed-read receipt is preserved separately.

The first PnP enumeration was sandbox-denied; the explicit read-only retry succeeded. ADB discovery started its local host daemon at TCP5037; it was stopped afterward to restore the initial host state. No phone setting, pairing, permission or application was changed.

## 2. Launch blockers and corrected local transport

### Concrete correction to Report 40's proposed command

Installed Expo **57.0.30**, CLI **57.0.31**, dev-client **57.0.20**, React Native **0.86.3**. The pinned CLI's `node_modules/expo/node_modules/@expo/cli/build/src/start/resolveOptions.js:119` rejects **`--offline --localhost` together** with `BAD_ARGS`. `--offline` alone selects LAN. The Report 40 command therefore cannot be used unchanged. Report 40 itself is preserved.

The following is an **unexecuted future Android command**, after binary/launch/isolation checks and explicit device-execution approval. Run in a dedicated shell from `C:\Projects\betweener-app`:

```powershell
$env:EXPO_OFFLINE = '1'
$env:EXPO_NO_TELEMETRY = '1'
$env:EXPO_NO_DOTENV = '1'
Remove-Item Env:EXPO_PACKAGER_PROXY_URL -ErrorAction SilentlyContinue
Remove-Item Env:REACT_NATIVE_PACKAGER_HOSTNAME -ErrorAction SilentlyContinue
$deviceScheme41 = '<scheme verified in the installed development binary>'
node node_modules/expo/bin/cli start harnesses/connect-device-safety --dev-client --localhost --port 8094 --scheme $deviceScheme41
```

The placeholder must be replaced; do not run it literally. Environment offline mode skips CLI remote requests without conflicting with localhost selection (`api/settings.js`, `utils/env.js`). `EXPO_NO_DOTENV` avoids loading credential environment files. These settings **do not block native device egress**. The CLI passes localhost to the Metro listener (`MetroBundlerDevServer.js:913`); actual socket binding and `http://127.0.0.1:8094/status` must still be verified during the approved launch. Abort if it binds/exposes an unintended interface or advertises a remote asset URL.

The harness config has **no native URL scheme**. `app.config.js:443` disables generated schemes for staging, while current generated Android source still includes a production identity and `exp+betweener`. Do not infer the installed scheme from the harness slug or those generated files. Expected identity candidates are staging `com.aduboffour.betweener.staging` / `betweenerstaging` and production `com.aduboffour.betweener` / `betweenerapp` (`app.config.js:34`, `:49`). Prefer an identified development build; a production/release/TestFlight app is not substituted.

For this pinned SDK57 CLI, the development-client URL shape is:

```text
<verified-scheme>://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8094
```

`UrlCreator.js:114` and the offline probe verify that shape. It is not an ordinary product Router/auth link. Do not use Expo Go, cloud tunnels, remote QR services, published updates, `expo run:*`, prebuild or a build/install command to make launch succeed.

### Galaxy A17: USB-only plan

After the owner makes the phone available, continue **read-only Phase A**: identify model/OS, USB authorization, installed package/version/code path and debug/dev-launcher metadata without launching it. Inspect its APK/manifest/modules if accessible; record its hash and artifact provenance. Do not install, grant permissions with ADB, clear app data or change signing. Any missing access/debugging setup is recorded for owner action.

For the later approved launch, explicitly target the recorded device:

```powershell
adb -s <verified-device-id> reverse tcp:8094 tcp:8094
adb -s <verified-device-id> reverse --list
```

This maps the phone's localhost port to Metro on the PC. **Do not use `adb forward` or emulator address `10.0.2.2` for this phone.** Android documents reverse port forwarding for physical devices. [Android local-server transport](https://developer.android.com/develop/ui/views/layout/webapps/access-local-server).

Keep cellular, Wi-Fi and any other external route disabled; verify the approved USB path and process/network isolation before launching. The only development transport is phone loopback TCP8094 over USB to host loopback TCP8094, plus host-local ADB TCP5037. No LAN firewall opening, DNS service discovery or Internet exception is needed. Check the **installed debug binary's** cleartext policy; source `android/app/src/debug/AndroidManifest.xml:6` allows it, but that is not a binary attestation.

Open only the verified dev-launcher deep link targeting the identified package; do not tap the ordinary app icon first. Device launch remains unauthorized here. Remove only the test's TCP8094 reverse mapping after a completed approved run; do not remove unrelated mappings.

### iPhone 15 Pro: no verified USB reverse path; proposed local-only exception

Ordinary `iproxy` forwards a **host-listening port to a device-listening port**. That is the wrong direction for an iPhone fetching Metro from Windows and does not provide `adb reverse`. Apple Mobile Device Support does not establish the reverse path. [libusbmuxd's documented direction](https://github.com/libimobiledevice/libusbmuxd#usage).

An iPhone USB cable or Personal Hotspot must not be assumed to create an isolated route to PC loopback. No such route was demonstrated, and hotspot/cellular sharing could introduce Internet access. Do not install tunnel software, add entitlements or change native networking to improvise a solution under this authorization.

**Proposed owner-reviewed alternative:** an isolated local LAN between this iPhone and the PC, permitting **only iPhone → PC-private-IP TCP8094**, with no WAN/default Internet route and no cellular path. Allow established response traffic only. Use a literal IP and manual URL, avoiding Bonjour/mDNS, Expo login and camera-based QR scanning. Windows firewall must restrict inbound Metro to that device/interface; router/AP/device controls must restrict the **phone**, not just the PC. Record isolation evidence. Do not disable the firewall globally.

For that separately approved exception, replace `--localhost` above with `--host lan`, and the manifest host in the dev-client URL with the **verified PC private IP**. Neither phone localhost nor `0.0.0.0` is the remote server address. The existing binary must already permit the local HTTP transport and, when applicable, local-network access. Record its ATS/local-network configuration and any OS prompt. iOS Developer Mode and valid existing provisioning must also be confirmed; none was inspected or changed. [Expo device Developer Mode](https://docs.expo.dev/guides/ios-developer-mode/).

Report 40's screen explicitly says USB/loopback only. **The LAN exception is a proposed change to that execution policy, not already approved by this preflight.** Without an approved exception or a separately verified USB route, keep iOS blocked. If a suitable binary, native declaration or provisioning change is required, stop for the separate request in section 6.

## 3. Binary and first-entry gate — before sensor permission

For each actual installed binary, record model/OS, application identifier/version/build, architecture, development entitlement/eligibility, native-runtime provenance and exact launch scheme. Verify required native registration/API compatibility with Report 40's seam:

- WebRTC **145.4.1**, `WebRTCModule`, RTCView, `createCallFactory`, `disposeCallFactory`, `getUserMedia`, `mediaStreamTrackRelease` and usable stream/track release.
- Callingx **0.11.5**, Expo Audio **57.0.5**, native module **`FileSystem`** from Expo FileSystem **57.0.7**, compatible Expo57/RN0.86.3. The present harness requires Callingx on both platforms even though its interruption listener is iOS-only.
- Existing microphone declaration and optional camera declaration; Android audio settings and relevant local-development network policy. Installed JS packages/autolinking alone are insufficient.

Static binary/manifest evidence can precede execution. The actual module guard at `native-hardware.ts:9` requires launching/arming and is therefore **not performed in this phase**. A runtime missing-module result must stop before capture; do not weaken the guard. New native dependencies normally require a new development binary. [Using existing development builds](https://docs.expo.dev/develop/development-builds/use-development-builds/).

The standalone `index.ts:1` installs the JS deny guard before Expo/UI; `metro.config.js:5` excludes Expo's reload WebSocket. It does not import product `index.js`, Router/Auth bootstrap or the authenticated Stream factory. Product `index.js:1` configures Stream/Live background behavior and must not execute. This is **source-backed separation**, not an observed phone launch.

Dev-launcher can reopen the most recent project by default (`DevLauncherController.kt:350`; iOS `EXDevLauncherController.m:95`). Cold-starting the app icon can therefore load old product JS. Verify direct development-client URI handling and the existing launch preferences/configuration before accepting the run. If the first entry cannot be controlled, stop; do not clear data or silently change launch mode. Expo documents launcher configuration as native build configuration. [Expo57 dev-client configuration](https://docs.expo.dev/versions/v57.0.0/sdk/dev-client/).

The source Android manifest enables updates and launch-time checks. Harness `updates.enabled=false` does not rewrite an installed binary. Native OTA/telemetry/providers may run before JS. Establish external isolation **before the process starts**, confirm only the lab loads, disable automatic reload/Fast Refresh for resource tests and stop on product bootstrap, authenticated client construction, unexpected native activity or network attempts. Network denial does not make accidentally running product JS an acceptable test.

## 4. Microphone measurement: missing, with specific existing hooks

**CONNECT_MIC_CAPTURE_MEASUREMENT = INCOMPLETE.** The current UI acknowledges no microphone PCM receiver (`DeviceSafetyScreen.tsx:70`). `native-hardware.ts:46` creates a scoped factory and calls bare `getUserMedia`; no peer, sender, ICE or loopback receiver is created. Android `GetUserMediaImpl.java:130` and iOS `WebRTCModule+RTCMediaStream.m:72` construct an audio source/track. These paths alone do **not demonstrate** that the microphone/ADM started delivering samples. A track that never captured cannot validate capture cessation.

There are useful **installed-source hooks**, not yet harness instrumentation or verified binary capabilities:

| Platform | Potential measurement and its limit |
|---|---|
| Galaxy A17 | `PeerConnectionFactoryProvider.java:124` processes captured mic buffers and drives `SpeechActivityDetector`; `WebRTCModule.java:314` emits native speech events. The harness does not subscribe. A controlled sound producing an attributed native speech-start is evidence beyond JS track status; absence of speech afterward can also mean silence and cannot prove capture stopped. Need continuing source activity plus independent recorder/source lifecycle or actual sample counters with liveness. Device/OS diagnostics such as attributed AudioRecord/audio-server state are candidates, not verified readable tooling on this phone. |
| iPhone 15 Pro | `AudioDeviceModuleEvents.ts` exposes passive native engine/delegate events; `AudioDeviceModuleObserver.m:43` onward distinguishes engine creation, will-start, did-stop and will-release. The harness does not collect them. A will-start or will-release event is not completion. No complete correlated native engine/recording trace or PCM evidence exists for this phone. |

`AudioDeviceModule.ts` also exposes iOS-only start/stop/status methods, but they are **not neutral inspection**: the native implementation uses `self.peerConnectionFactory.audioDeviceModule`; `WebRTCModule.m:143` obtains/creates a default factory. Polling those getters after disposal can recreate a factory and invalidate the measurement. Do not call them as a shortcut or add an unreviewed recording path. An unrelated Expo recorder would measure a different owner/source.

Smallest proposed instrumentation review: first assess passive existing native events/OS diagnostics and their attribution, liveness and completeness in the identified binary. If insufficient, separately approve a harness-only measurement enhancement with native source identity, monotonic capture/sample counters and disposal completion. Missing native hooks may require a separately approved binary. No instrumentation, recording driver, peer loopback or build was added here.

## 5. Controlled physical evidence plan — NOT EXECUTED

Use separate copies of Report 40's `acceptance-template.json`. Keep each outcome `NOT_TESTED` until its approved run. For each scenario, establish and retain a positive control **for the exact resource being tested**, then observe cleanup independently. Do not aggregate one successful output test into a microphone PASS.

| Scenario | Galaxy A17 execution/evidence | iPhone 15 Pro execution/evidence |
|---|---|---|
| Microphone | After explicit consent, create mic track. Require attributed changing mic samples or native recording activity with live measurement before stop. Continue the known acoustic stimulus through stop; record source/recorder shutdown and absence of new attributed samples with the observer still live. Without instrumentation, mark incomplete. | Same positive/negative obligation; native engine events must identify recording activity, not just engine existence/playout. Do not use factory-creating getters after disposal. Current harness cannot award microphone verification. |
| Optional camera | **Separate explicit camera approval**. Display changing local frames, then STOP; independently corroborate capture-session/camera-client release. JS-ended flag/privacy indicator alone is insufficient. | Same; correlate RTCView's positive frame movement with native capture/session state and subsequent release. No QR scan is required for launch. |
| Generated local audio | Establish audible low-volume local WAV, endpoint and repeatable external observation; STOP and observe actual cessation while measurement stays live. Keep microphone test separate to avoid tone contamination. | Same; distinguish Expo player output from WebRTC ADM playout and confirm actual endpoint. `playing=false` or `player.remove()` is bridge/JS evidence only. |
| Factory/resources | Record local native factory creation/ownership before disposal, then literal-true disposal result plus native lifecycle/OS evidence. Check no successor or diagnostic silently recreates it. | Same; a `willReleaseEngine` event alone is not proof the engine was released. |
| Background/foreground | With a positive active control, background, blur and return. Owner stays retired; no restart. Independently measure capture/output rather than only UI state. | Background/foreground and lock/return; same no-resume obligation. |
| Interruption/cancellation | Use a separately approved local OS interruption/focus change, not a hosted/incoming provider call. Test focus loss while AppState remains active; missing event coverage is inconclusive. Test cancelling permission/capture work and late delivery. | Use an approved local interruption source. Callingx event delivery without call registration is unverified; no event is not a PASS. Test cancellation/late capture separately. |
| Injected cleanup failure/hold and retry | Inject using existing UI, then STOP. Verify actual media stops before completion is released; pending/failed ownership stays quarantined. Explicit retry reuses that retired owner. These are JS-injected faults, not reproduced native bridge hangs. | Same. Real native hangs remain pending; clearing the injected hold does not fix an OS hang. |
| Account epoch | Use the harness's synthetic logout/account-switch controls during active or pending capture. Old callbacks cannot restart. No real account sign-out, Supabase login or credential refresh. | Same, preserving the distinction from product Auth integration. |
| Live/Connect exclusion/recovery | Existing offline tests prove both registry directions. The device screen has **no control to acquire a competing Live lease**; its one-session-per-process design also lacks a successor/rearm control. A physical simultaneous-owner/safe-successor test needs a separately reviewed harness-only extension using a local synthetic lease, never a real Live session. Current physical result: NOT_TESTED. | Same. Native routing restoration and safe successor audio need a positive local successor control; a fresh process is not proof of same-process ownership handoff. |

One session is allowed per JS runtime. Use a fresh isolated process for each **completed** scenario; do not reload, reset a registry, clear app data or restart to bypass quarantine. A real hang requires evidence retention and an explicit recovery decision. If forced process termination is approved as recovery, record independent cessation and label it recovery, not successful owner cleanup. No such termination is performed or authorized by this preflight.

Keep four evidence levels distinct: **local-model/SDK status**, **native bridge request/result**, **OS/native lifecycle observation**, and **independent physical sample/frame/output measurement**. Harness `sdkStateOrigin=local_adapter_model_not_stream_sdk` remains mandatory. Store owner-relative monotonic events separately from native/OS/external clock domains, with observation brackets/uncertainty. The displayed receipt and operator-entered observations do not authenticate OS evidence. No shutdown duration bound or automatic acceptance threshold is approved.

## 6. Exact owner-review boundaries

1. **Continue existing read-only preflight when devices are available:** identify the Galaxy model/OS and iPhone iOS version, compare on-device package/version metadata with the now identified owner-confirmed builds, and identify viable local diagnostics. The supplied build IDs need not be requested again. This is necessary before claiming native compatibility; it does not require or authorize a new build.
2. **Separate physical execution approval:** identify those exact binaries/source hashes and approve cold lab launch, Android USB mapping, microphone access, low-volume tone/output observation, local lifecycle/fault/epoch tests and the recovery/measurement plan. Camera remains excluded unless separately explicit. Require no hosted connections, product bootstrap, real accounts or flag enablement.
3. **iPhone transport exception:** approve the isolated phone-to-PC TCP8094 LAN policy and any local-network prompt/settings required, or provide a verified USB reverse/IP solution for review. No Internet tunnel or Personal Hotspot workaround is included. Without this decision iOS stays blocked.
4. **Instrumentation/UI enhancement approval:** passive mic measurement/attribution and local competing-lease/successor controls are not currently complete. Review the smallest JS-only extension first where supported by the existing binary. No implementation is authorized by Report 41.
5. **Conditional new-binary request, only after a demonstrated mismatch:** record which required native method/version, permission declaration, local transport policy, launch isolation or instrumentation is missing. Propose the exact development target, native delta, signing/provisioning impact, device installation and source hash for separate approval. Do not run prebuild, `expo run`, EAS build, install, re-sign or publish. No Live configuration change is proposed. If a safe first entry cannot be obtained from an existing product dev client, a dedicated lab binary requires the same separate review.

## 7. Offline checks and preservation

Evidence is under `tmp/connect-device-preflight-41/`. Fresh checks: **23/23** existing harness regressions and **7/7** isolated CLI/source probes, no failures/skips/TODO in the final selections. The probes reproduce the original `BAD_ARGS`, show offline-switch LAN selection, validate environment-offline/localhost options, verify SDK57 URL construction/listener wiring and the absent harness scheme. No server or hardware was started. The initial probe run was 5/7 because its test used an invalid underscore-containing placeholder scheme and an incorrect relative require path; only the ignored probe was corrected, with the first log retained.

Main commands executed:

```powershell
adb version
adb devices -l
node --no-warnings=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test --test-reporter=tap __tests__/connect-device-harness.regression.test.cjs
node --no-warnings=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test --test-reporter=tap tmp/connect-device-preflight-41/offline-plan-probes.cjs
```

Report 40's retained final verification receipt hashes to `6977dff2831d3dfd9f71910dab404bff710f63d1333a94510613c3c531068733`; its recorded new-file/source hashes were checked without rewriting that receipt. No runtime code changed, so full TypeScript/Live/database/security suites were not rerun or represented as fresh device evidence. Historical 164-test preparation and earlier media verdicts remain historical.

All **2,427** baseline repository files/absences and **534** protected current records remain unchanged. This report is the only new repository artifact; ignored local preflight scripts/logs retain inventories, hashes and probe results. Report 40, the harness, Live configuration, default-off flags, historical receipts and consumed B1/B2/B3 approvals/ledgers are preserved. The independent shutdown classifier remains offline. Public documentation and the subsequently supplied Expo metadata were read; no Stream, Supabase or product-backend operation occurred.

```text
CONNECT_ANDROID_HARNESS_READY = CONDITIONAL
CONNECT_IOS_HARNESS_READY = BLOCKED
CONNECT_MIC_CAPTURE_MEASUREMENT = INCOMPLETE
CONNECT_DEVICE_EXECUTION = NOT_AUTHORISED
CONNECT_NATIVE_DEVICE_SHUTDOWN = NOT_VERIFIED
CONNECT_REMOTE_REVOCATION_BOUND = UNVERIFIED
CONNECT_M2A_SECURITY_GATE = BLOCKED
CONNECT_M2B_READY = BLOCKED
PRODUCTION_MODIFICATIONS = NONE
```

Next action: inspect on-device identity/native compatibility and review the narrowly scoped transport/measurement requirements above, using the two identified builds. No new build is currently justified. No physical run should be approved on the strength of installation confirmation, build metadata or passing offline tests alone.
