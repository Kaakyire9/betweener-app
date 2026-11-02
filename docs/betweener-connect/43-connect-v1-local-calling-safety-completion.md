# Connect local calling safety and device launcher

Date: 2026-10-31. Scope: the owner's instruction to complete remaining **local** Connect code while keeping calling disabled. This completes the local changes below, not the whole calling release or its security gates. No build, installation, hosted request, provider fixture or hardware test ran.

## Run the Android lab with one launcher

The latest direct checks found **both Metro stopped and no ADB phone**. Earlier point-in-time readiness did not keep a server alive or preserve a USB mapping through disconnects. This explains the observed refusal before the lab could load; it does not demonstrate a missing native module. The exact installed Android packaging evidence remains in Report42, unchanged.

In your **own PowerShell window**, run:

```powershell
Set-Location C:\Projects\betweener-app
node scripts/start-connect-device-safety.cjs
```

Alternatively double-click `scripts/start-connect-device-safety.cmd`. Keep that window open. Connect the Galaxy by USB and authorise debugging. Leave airplane mode on, Wi-Fi/Bluetooth off, and disconnect other external network routes. The launcher waits for USB and restores only the localhost8094 mapping after reconnection. It never opens a phone app automatically.

- Press **R** to inspect readiness.
- Press **O** to explicitly request the lab link. This repeats phone/radio/route and exact lab-manifest checks, restores/verifies the mapping and tests the phone's localhost TCP connection first. Missing, changed, unauthorized or unsafe evidence prevents the launch.
- Press **Q** to stop only this launcher's Metro process tree. This does not stop phone media; finish/preserve local cleanup evidence first.

After opening, confirm **Connect offline safety lab**, retain the independent isolation attestation, and run **Check native modules (no sensors)**. Send that screenshot before capture. No new microphone/camera approval is needed for this check. Do not reload, force-stop or restart over a failed/pending capture cleanup to manufacture success.

The launcher uses the already inspected standalone Metro configuration, Node's IPv4-first localhost resolution and fixed port8094. It disables Expo networking, telemetry, dotenv and automatic TypeScript setup, and runs in CI mode without reloads. Existing port/mapping conflicts are reported rather than killing or replacing another owner. It exposes no LAN/tunnel option, never edits phone settings or grants permissions, and leaves the harness's immutable JS deny guard unchanged. Route/radio observations are preflight snapshots, not independent packet-capture or firewall certification; the operator's external isolation requirement remains.

`--check` is read-only and starts no server, mapping or app. The launcher must run interactively in the tester's terminal; running it without a TTY stops before starting Metro. This avoids depending on an assistant tool session for the server's lifetime. Interactive real-device execution of the new launcher has not been performed by Codex. Its real `--check` result at preparation was `USB_PHONE_NOT_CONNECTED` / `METRO_NOT_RUNNING`, not a readiness PASS.

This launcher is **Android USB only**. The iPhone still needs a separately verified closed local transport; normal Wi-Fi is not externally isolated. No iOS rebuild has been established as necessary, and no unsupported Windows USB-reverse route is claimed.

## Local source changes

| File | Change |
|---|---|
| `scripts/start-connect-device-safety.cjs`, `.cmd` | Tester-owned terminal session, bounded local diagnostics, reconnection monitoring and explicit launch key. |
| `scripts/lib/connect-device-safety-launcher.cjs` | Independently testable USB selection, radio/route evidence, mapping conflict/readback, exact loopback lab-manifest checks and cancellation fences. |
| `features/connect/voice/voice-controller.ts` | Generation-fenced permission/mute/route results; immutable call/pair/generation checks on canonical reads; no stale invitation or route-result publication; explicit ordinary-End authority state and same-call read-only reconciliation. |
| `features/connect/voice/voice-types.ts` | Separate optional `endStatus` for Betweener termination, independent of local and provider media state. Reset explicitly clears it. |
| `features/connect/voice/voice-safety-status.ts` | Presentation projection of local shutdown, block, authoritative terminal state, provider acknowledgment and remote uncertainty. No ACK implies media verification. |
| `features/connect/components/VoiceSafetyPanel.tsx` | Default-off, call-generation-bound End Call & Block confirmation; independent status display; status checking does not reblock after an unblock. |
| `features/connect/components/VoiceCallScreen.tsx` | Renders the separate safety panel while preserving ordinary End/Decline controls. |
| `features/connect/components/ConnectVoiceSession.tsx` | Internal, default-off binding to an existing controller; no native factory, Auth bootstrap, outgoing creation or acceptance on render. Actual unmount retires the controller, while React development effect replay retains the same view owner. Done does not wait for hung disposal. |

New tests: `connect-device-launcher.regression.test.cjs`, `connect-voice-completion.regression.test.cjs`, and `connect-voice-safety.interaction.test.tsx` under `__tests__/`.

The new view is not mounted from an app route or navigation entry. Both real flags remain **false**. Existing `public.blocks`, relationship/consent authority, migrations, credential issuance, outbox, provider worker, provider-end ACK classifier and native owner are reused unchanged. No alternate block store, worker, token issuer or Auth authority was introduced. The production trusted Auth-epoch host remains unmounted; this view does not make that integration verified or authorized.

Ordinary local End now distinguishes a same-call terminal response, an `ENDING` response and unconfirmed/mismatched/failed responses. A response that still says ACTIVE is not accepted as termination. Pending/unconfirmed state can be reconciled by canonical reads without another termination write. This is **Betweener authority evidence**, not the provider ACK or packet-enforcement axis. Existing durable jobs remain responsible for provider work. Media shutdown starts independently of those requests, as before.

The controller changes fence **presentation and authorized local control callbacks**. They cannot cancel a native operation that already ran, verify hardware routing, enforce a hostile peer's consent lease or make remote media terminate during a provider outage. Native owner retirement and its quarantine remain separate safeguards.

## Validation and preservation

Final evidence is under `tmp/connect-local-completion-43/`:

- **512/512** Node offline/security/Live tests, zero failures, skips, cancellations or TODOs. This includes the existing290 selection,48 End/Block,49 native owner,23 harness,16 binary-contract,44 relevant Live tests, plus24 launcher and18 controller/status cases. Exact file selection: `test-selection.json`; output: `security-live-complete.log`.
- **17/17** React Native UI tests: seven unchanged presentation cases and ten new safety/session interactions, `interaction-final.log`.
- Full repository TypeScript and targeted ESLint pass with zero errors/warnings, `typescript-final.log` and `lint-final-complete.log`.
- `--check` and `--help` exercised the actual launcher without starting a server or device app. A separate laptop-only terminal smoke check exercised server startup/readiness/exit; no O key, phone app or sensor was invoked. Actual phone interaction and physical capture remain unverified.

The exact Node command is `node --no-warnings=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test --test-reporter=tap` with the unique paths in `test-selection.json`. Jest used `node --no-deprecation node_modules/jest/bin/jest.js --runInBand --config jest.config.js __tests__/connect-voice.interaction.test.tsx __tests__/connect-voice-safety.interaction.test.tsx`. TypeScript used `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit`. The receipt records the targeted lint selection and all current source hashes.

Development checks exposed one new reset counterexample, two lint diagnostics and a launcher shutdown-reporting defect: a sandbox-denied process-tree kill initially printed a stopped message. The verified test process was cleaned up, and shutdown now requires an accepted kill request plus the owned child's observed exit; rejection/timeout stays explicitly unconfirmed. These were repaired before the final runs. None is counted as an accepted failure. Tests inject native/provider/ADB behavior; no provider media guarantee or physical shutdown PASS follows. Historical full Live baseline summaries were not rerun or rewritten; this task ran only the44 relevant Live isolation/ownership cases.

All **541 protected records** remain byte-identical, including Reports18–42, previous receipts and consumed approvals/ledgers. Of2431 starting repository entries, only the three existing source files listed above changed; ten new files comprise the launcher, safety view/projection, regressions and this document. All unrelated dirty work remains unchanged. Current hashes/test receipts do not refresh historical execution authorization.

## Remaining work and decision

The next user-operated step is the Android no-sensor check through the persistent launcher, then the separately measured local sound/microphone/optional camera cases. Independent microphone sample activity, actual native disposal, OS interruptions and physical Live handoff are still gaps. iPhone transport remains a blocker to that platform's test.

Complete trusted product Auth hosting, navigation/start-entry rollout, native lifecycle acceptance and two-phone hosted calling validation remain separate from these local view/controller changes. Neither a successful lab load nor two available phones resolves Report33–35's missing remote enforcement guarantee. Do not connect this internal view to real accounts or issue credentials to close that gap. Any later native binary build/install or staging call scope must be concrete and separately authorized; consumed B1/B2/B3 approvals remain unavailable.

```text
CONNECT_LOCAL_SAFETY_UI = IMPLEMENTED_DEFAULT_OFF
CONNECT_DEVICE_LAUNCHER = OFFLINE_VALIDATED
CONNECT_FULL_CALLING_RELEASE = INCOMPLETE
CONNECT_NATIVE_DEVICE_SHUTDOWN = NOT_VERIFIED
CONNECT_REMOTE_REVOCATION_BOUND = UNVERIFIED
CONNECT_RUNTIME_ACTIVATION = NOT_AUTHORISED
CONNECT_M2A_SECURITY_GATE = BLOCKED
CONNECT_M2B_READY = BLOCKED
CONNECT_FLAGS = DISABLED
PROVIDER_WRITES = NONE
STAGING_MODIFICATIONS = NONE
PRODUCTION_MODIFICATIONS = NONE
```
