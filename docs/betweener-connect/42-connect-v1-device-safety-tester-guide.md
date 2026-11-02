# Connect device-safety lab: personal tester guide

Date: 2026-10-31. **You operate the phones; Codex prepares/reviews the environment and evidence.** No new binary, publication or hosted operation is needed to prepare this guide. Nothing below was launched on a phone by Codex.

## What is ready, and what is still missing?

The two previously verified Expo records are retained locally; they were **not fetched again** under this request's no-hosted-services restriction:

| Phone | Existing installed candidate, confirmed by you | Current decision |
|---|---|---|
| Galaxy A17 | Android APK `a3d480e9-38f9-4e75-beb6-55038e91bc00` | Connected USB/package/static-module preflight completed in the addendum below. Runtime registration still requires the no-sensor check. |
| iPhone 15 Pro | Physical-device IPA `43e33173-cd96-41b1-8e9e-9df6834930a8` | Same native check is needed. **Do not start until a genuinely isolated local transport is established.** Ordinary home Wi-Fi does not qualify. |

Both build records identify staging `com.aduboffour.betweener.staging`, development profile/channel, Expo57, app **1.2.0 (1)**, commit `f560559`. The committed WebRTC/Callingx/Expo Audio/FileSystem versions match the harness's principal media dependencies. Build metadata does **not** enumerate native APIs. Initially no matching APK/IPA was available locally; the addendum records a later read-only copy of the actual installed Android APK. The separate local AAB is not treated as either build.

**No rebuild is justified yet.** A development client can load this separate JS entry if its native APIs are present. The definitive next check is on the existing phone binary, before capture. Do not claim compatibility from dependency names alone.

I added **“1. Check native modules (no sensors)”**, separate from **“2. Arm local test session (no capture yet)”**. It reports each missing capability: WebRTC module, `createCallFactory`, `disposeCallFactory`, `getUserMedia`, track release, RTCView, Callingx, Expo Audio and FileSystem. It also requires a native development runtime. It never calls those media APIs or requests permission. Arming repeats the checks rather than trusting a stale result. A successful presence check permits attempting the local tests; it does not verify native versions or hardware shutdown.

## 1. Establish isolation before opening the lab

**Android USB — the simplest first test:** use USB debugging with this laptop already authorised. Put the phone in airplane mode and explicitly turn Wi-Fi/Bluetooth off; disconnect other networking/tethering/VPN routes. Keep USB data connected. Codex can inspect the device/package and route state read-only when it becomes visible. A USB cable alone does not isolate a phone with other routes enabled.

**iPhone:** this Windows host has no verified equivalent of Android's reverse port mapping. Standard `iproxy` goes in the opposite direction. The practical alternative is a **verified closed LAN**: an already available isolated AP/router with no WAN/cellular uplink, only the phone and laptop, phone cellular off, and no Internet sharing, bridging or VPN route through the laptop. Permit only phone-to-laptop Metro TCP8094 and its responses. Router/device egress controls and host firewall/interface restrictions must support that claim. A normal LAN connection or working Metro URL is not evidence of isolation.

**Codex has not established that iPhone environment.** If only normal home Wi-Fi is available, stop the iPhone procedure here. The smallest fix is the closed local transport, not a new app binary. No router/firewall setting was changed automatically. The lab's wording now permits only such independently verified isolated LAN delivery; its immutable fetch/XHR/WebSocket/EventSource/beacon deny guard and external-egress attestation remain intact. No URL whitelist or guard bypass was added.

The checkbox **“External egress isolation is established and recorded”** is an assertion of an established environment, not a switch that creates isolation. Do not tick it to get past a blocker. Native networking and OTA code can run before JS, so isolation must precede app launch.

## 2. Android: start the laptop server

These are **commands for you to run**, once the USB/isolation check is complete. Do not use `expo run`, EAS build/update, Expo Go or the ordinary product start script.

Open PowerShell on the laptop:

```powershell
Set-Location C:\Projects\betweener-app
$env:EXPO_OFFLINE = '1'
$env:EXPO_NO_TELEMETRY = '1'
$env:EXPO_NO_DOTENV = '1'
$env:EXPO_NO_TYPESCRIPT_SETUP = '1'
$env:CI = '1'
$env:SENTRY_DISABLE_AUTO_UPLOAD = 'true'
Remove-Item Env:EXPO_PACKAGER_PROXY_URL -ErrorAction SilentlyContinue
Remove-Item Env:REACT_NATIVE_PACKAGER_HOSTNAME -ErrorAction SilentlyContinue
adb -d reverse tcp:8094 tcp:8094
adb -d reverse --list
node --dns-result-order=ipv4first node_modules/expo/bin/cli start harnesses/connect-device-safety --dev-client --localhost --port 8094 --scheme betweenerstaging
```

Only one physical Android device should be selected; `adb -d` must fail rather than guess if several are attached. If ADB reports no device/unauthorised, stop and complete the read-only USB setup first. The mapping is phone localhost8094 → laptop localhost8094. No Internet tunnel or LAN firewall opening is required for this path.

The installed Android manifest and a read-only intent-resolution check now verify the staging scheme. This command selects the standalone harness project and **does not create a binary**. `EXPO_OFFLINE=1` is intentional: the installed CLI rejects combining `--offline` with `--localhost`. Prefer IPv4 explicitly: this host otherwise bound only to `::1`, making the advertised `127.0.0.1` URL unreachable. `CI=1` disables reload/watch behavior, and `EXPO_NO_TYPESCRIPT_SETUP=1` prevents unrelated automatic config generation. Do not press `a` or `i` to auto-launch something.

Once Metro is ready and its local listener/address has been checked, open a **second** PowerShell window. You can open the lab explicitly from the laptop:

```powershell
adb -d shell am start -a android.intent.action.VIEW -d 'betweenerstaging://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8094' com.aduboffour.betweener.staging
```

This is a user-triggered device launch, not a command Codex ran. It must show **“Connect offline safety lab”**. If it opens normal Betweener, shows a login, cannot handle the link or fails to load: **stop and send the error screenshot**. Do not continue through product navigation. Do not use camera-based QR scanning.

## 3. iPhone: start only after the closed-LAN requirement is satisfied

Run one phone at a time. Stop the Android Metro session with Ctrl+C before changing delivery mode, after its media cleanup is complete.

Use the same environment settings as above. On the verified closed LAN, set the laptop's actual lab-interface IP, then start:

```powershell
$env:REACT_NATIVE_PACKAGER_HOSTNAME = '<verified laptop IP on the closed lab LAN>'
node node_modules/expo/bin/cli start harnesses/connect-device-safety --dev-client --host lan --port 8094 --scheme betweenerstaging
```

Replace the placeholder. Codex must check the advertised interface and allowed route before this is used. LAN mode can listen on multiple interfaces; the host firewall must restrict the lab interface/device. **The command does not isolate the LAN.** No such server or rule was started/changed here.

On the iPhone, open the **local development-client link displayed by that Metro terminal**, using a typed/pasted link, not Expo login, a cloud update or a QR service. It has this form:

```text
betweenerstaging://expo-development-client/?url=http%3A%2F%2F<LAPTOP-LAB-IP>%3A8094
```

Use the real lab IP, not `localhost`: iPhone localhost is the phone. A local-network prompt, if required by the existing binary, is for this approved local delivery only. Do not change native declarations, signing, Developer Mode or profiles blindly to overcome a failure; report the exact message. Stop unless the standalone lab title appears. Opening the normal app icon can reopen the last product bundle, so use the explicit lab link.

## 4. On either phone: first check the binary, with no sensor access

1. Confirm the environment's isolation evidence, then tick its attestation.
2. Press **“1. Check native modules (no sensors)”**.
3. Take a screenshot of the entire result, scrolling if needed. Continue only if **`moduleContractComplete: true`**, every `checks` value is true and `missing` / `inspectionErrors` are empty.
4. If anything is false/missing/unreadable, **do not arm**. Send this screenshot. That names the exact blocker; a missing native module/API may require a separately approved development build. A development-runtime failure can mean the wrong app/runtime was opened.
5. If it passes, press **“2. Arm local test session (no capture yet)”**. This still requests no sensor permission. If it fails, stop and send the result.

This separates “the binary exposes the required entry points” from “hardware behaved correctly.” No automatic compatibility or physical-device PASS is produced.

## 5. The first three short tests

Use the built-in output initially. Disable Fast Refresh/automatic reload during resource tests. Each case uses a fresh lab process **after successful cleanup**; see the reset note below. Keep the laptop's Metro process running.

| Test | Buttons / permissions | What to collect |
|---|---|---|
| **A — Local sound** | Arm; press **“Play generated local tone (low volume)”**. Confirm you can hear it. Press **“STOP all local media / cancel pending capture”**. No microphone/camera permission is needed. | Screenshot while playing and after STOP; note whether sound actually started and stopped, and the output used. Capture `localPlayer`, owner retirement and release result. |
| **B — Microphone control** | Fresh lab; check/arm; press **“Create microphone track (requests permission)”**. Approve microphone only for this test. Press **“Disable / stop / release microphone track”**, then **STOP all local media**. | Screenshots before/after; microphone prompt result; OS indicator observations and owner track/release fields. **Current harness has no PCM receiver: this checks control/cleanup behavior, not proven microphone sampling or physical capture cessation.** No positive sampling measurement means no microphone hardware PASS. |
| **C — Optional camera** | Only if you choose and consent to this separate test: fresh lab; check/arm; press **“Optional camera capture (requests permission)”** and approve camera. Confirm changing preview frames, then press **STOP all local media**. | Preview/control result and post-STOP receipt; note whether preview/indicator stopped. These are useful observations, not complete OS/capture-engine disposal proof. Avoid including faces/private surroundings. |

Approve no notifications, contacts, location, account sign-in or provider access. Unexpected prompts indicate the wrong startup path or another issue; stop. Use screenshots/written notes initially. Do not activate a screen recorder's microphone while evaluating the microphone owner.

**Reset between completed cases:** collect the result first. Only once leave/release are completed and observed media has stopped, fully close the lab process and reopen the same explicit lab link. On Android you may perform the reset yourself with `adb -d shell am force-stop com.aduboffour.betweener.staging`, then rerun the explicit link command. On iPhone, close the lab in the app switcher, then reopen its lab link. Do not use reload/restart to turn pending or failed cleanup into a passing result.

## 6. Failure, background and account tests

After the simple sound test works, run these individually in fresh lab processes:

- **Held cleanup:** play the local tone; press **“Hold cleanup completion”**, then **STOP**. Sound should stop, while cleanup remains pending and the owner is retired. Screenshot; press **“Explicitly clear injected fault and retry cleanup”**; capture the final result.
- **Failed cleanup:** repeat using **“Inject recoverable cleanup failure”**. Preserve the failed result before explicit retry. This is an injected JS failure, not evidence that a real native bridge hang was reproduced.
- **Background:** start a positive sound control, leave the app, then return. Record whether sound stopped; the owner must stay retired and must not resume automatically.
- **Account epoch:** start the sound control; press **“Simulate logout (local Auth epoch only)”** or **“Simulate account switch (local Auth epoch only)”**. Capture the retired/no-resume state. These are synthetic local identities, not real account operations.
- **Cancellation:** cancel a microphone/camera permission request or stop pending work; capture late results if any. No retired owner may reactivate capture.

If media actually continues after STOP, close/force-stop the lab for privacy and report that as **recovery after failure**, not successful cleanup. Preserve available evidence. Explicit retry cannot make a genuinely hung OS operation return. Do not clear app data, reset an ownership registry or open a real Live/Connect call to work around quarantine.

Real interruption delivery, Bluetooth/route restoration, independent factory/ADM disposal and simultaneous native Live ownership are **not established by these quick tests**. The current screen has no competing-Live/successor control. Existing offline tests cover registry exclusion; do not start Live or claim a physical concurrency PASS.

## 7. Send back this small result set

For each phone/case, provide:

1. Phone model + OS version and test letter/name.
2. Module-check screenshot showing all checks or the exact missing entries.
3. Active and stopped/error receipt screenshots. Include owner `retired`, operation states, `localPlayer` where applicable and `deniedNetworkAttempts` (must be empty).
4. One sentence: what you actually heard/saw before and after STOP; whether retry was needed.

Do not include passcodes, tokens or real account details. The harness uses no real credentials. Codex will distinguish your observations, bridge/SDK results and missing independent hardware evidence. A pending/failed result remains visible; no screenshot automatically advances a security gate.

## Preparation record

Only harness JS inspection/UI preparation, its focused regression and this guide changed. The sensor/player/owner paths, network deny implementation, product flags, native configuration, SDK versions, app entry and Live code were not changed. The LAN explanation retains the requirement for externally verified egress isolation; it does not whitelist LAN fetch/WebSocket traffic inside the lab.

Prepared a pure module-presence inspector plus its no-capture native binding. Tests exercise complete/missing/throwing capabilities, fresh rechecks, UI gating and unchanged guards/default flags. Current results and source/preservation hashes are retained at `tmp/connect-device-tester-42/final-verification.json`. Historical Reports 18–41 and receipts are preserved; Report 40's source inventory now describes its historical revision, not this small inspection extension.

Fresh local verification: **180/180 PASS** (16 new binary-contract cases, 23 existing harness, 49 native owner, 48 End/Block and 44 relevant Live cases); **7/7 PASS** for the pinned CLI/transport probes; full Expo TypeScript and targeted ESLint both pass with zero errors/warnings. These are offline tests with injected native ports, not phone tests. No database/security gate result or hardware acceptance was changed.

At initial guide preparation, actual devices were not tested. ADB discovery returned no device; its temporary host daemon was stopped afterward. No Metro server, artifact download, hosted service, build/install/publication or hardware test was started at that stage. Build metadata from the previous authorised lookup was reused locally. The later USB preparation is recorded separately below.

```text
CONNECT_NATIVE_BINARY_API_COMPATIBILITY = NOT_VERIFIED
CONNECT_ANDROID_USER_TEST_PATH = CONDITIONAL_USB_PREFLIGHT
CONNECT_IOS_USER_TEST_PATH = BLOCKED_PENDING_VERIFIED_ISOLATION
CONNECT_MIC_CAPTURE_MEASUREMENT = INCOMPLETE
CONNECT_NATIVE_DEVICE_SHUTDOWN = NOT_VERIFIED
CONNECT_REMOTE_REVOCATION_BOUND = UNVERIFIED
CONNECT_M2A_SECURITY_GATE = BLOCKED
CONNECT_M2B_READY = BLOCKED
CONNECT_FLAGS = DISABLED
PRODUCTION_MODIFICATIONS = NONE
```

Smallest next step: connect the Galaxy A17 by USB for read-only package/transport inspection. No new build is needed unless an actual missing/incompatible native capability is demonstrated. iPhone testing waits for a verifiable closed local transport; ordinary home Wi-Fi is not an acceptable substitute.

## Connected Android addendum — 2026-10-31

The owner connected and authorised the Galaxy, then manually enabled airplane mode and disabled Wi-Fi/Bluetooth. Read-only inspection identifies **Samsung SM-A176B, Android 16 / API36, arm64-v8a**. Installed staging package `com.aduboffour.betweener.staging` is **1.2.0 (versionCode1), DEBUGGABLE**. The explicit lab URI resolves to its `MainActivity`; resolving the intent did not launch it. No staging app process was observed during preflight. Microphone/camera permissions were already granted to the existing binary; they were neither requested nor changed here, and the presence check does not use them.

A read-only `adb pull` copied the installed `base.apk` into ignored local evidence: **488093068 bytes**, SHA-256 `2fe6471298eb0fbab899c23bd01d21a4edf0fd053f52e52a842591214f4d3fdc`. DEX class definitions contain `WebRTCModule` and its `createCallFactory`, `disposeCallFactory`, `getUserMedia` and `mediaStreamTrackRelease` methods; WebRTC package/RTCView, Callingx module and **CallingPackage**, Expo Audio, FileSystem, DevLauncher and generated package lists are also defined. Relevant arm64 native libraries are packaged. The initial extraction guessed the upstream filename `CallingxPackage` as a class name; the corrected extraction uses the actual Kotlin declaration `CallingPackage`. This was an inspection-label correction, not a missing module or binary repair.

These are exact installed-binary packaging facts, not evidence of successful runtime registration or sensor behavior. No APK artifact hash was retained from EAS, so this copy is not cryptographically identified as the linked EAS artifact solely by matching version/install metadata. **There is no demonstrated reason to rebuild before the no-sensor runtime check.** The iPhone's binary remains uninspected.

Initial reads found active external Wi-Fi/cellular routes and blocked any launch. After the owner's changes, Android reported airplane mode enabled, **Wi-Fi disabled**, **Bluetooth OFF**, and **no non-loopback/non-dummy IPv4 or IPv6 default routes**. Stored `wifi_on`, `bluetooth_on` and `mobile_data` values can differ from active radio state; the service state and route observations are retained separately. Wi-Fi scanning remains available, which is not an active Internet route. This is a bounded preflight snapshot, not an OS firewall/packet-capture attestation. Keep the isolation controls in place; recheck if USB or radio state changes. USB debugging remains wired, not wireless.

Laptop-only setup installed `adb reverse tcp:8094 tcp:8094`, and started the standalone server with the corrected command above. The first server chose IPv6-only loopback and was stopped; the replacement was verified listening only on **127.0.0.1:8094**. No LAN listener, tunnel, firewall change or router change was used. A laptop loopback request received the lab manifest (`connect-offline-safety-lab`) and an **HTTP200 Android bundle**, **3880514 bytes**, SHA-256 `746599c4033759b0b6e3aa9c686b8aec00833732a17437b1297f9895d0f16b3a`. It was compiled/served as development JavaScript, not executed on a phone or built into a binary. Its entry is `index.ts`; a default `transform.routerRoot=app` URL parameter does not change that entry into product bootstrap. Runtime registration and loading still require the owner's manual check.

Expo's asset-schema lookup emitted an offline-abort warning; the inspected pinned CLI applies an already-aborted signal under `EXPO_OFFLINE=1`. The lab manifest and bundle nevertheless completed locally. No hosted lookup was made for this preparation. The first CLI startup generated a previously absent harness `tsconfig.json`; it was copied to ignored evidence and removed, and the corrected command disables that setup. No existing source/configuration file was changed by those startup attempts.

The original `tmp/connect-device-tester-42/final-verification.json` remains unchanged and describes the earlier no-device stage. This addendum updates documentation only; all its other source hashes and **538/538** protected historical records were rechecked unchanged. Device/static/APK/loopback observations and this addendum's hashes are retained separately under `tmp/connect-device-tester-42/android-usb-inspection-1/`. No new source tests are claimed: the earlier **180/180 + 7/7** results remain the recorded offline baseline.

**Owner's next step:** with isolation still active and the prepared server still running, execute the explicit Android lab-link command in section2 yourself. Confirm the standalone title, tick the truthful isolation attestation and press **“1. Check native modules (no sensors)”**. Send the result screenshot before attempting capture. This is still a user-operated test; Codex has not launched the app, armed a session, created a player/factory, accessed hardware, installed anything or contacted Stream/Supabase. Keep calling flags off and M2A/M2B blocked. Actual device shutdown and remote revocation remain unverified.
