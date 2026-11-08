# Video calling UI and matched-only launch

Local implementation, 2026-11-05. No hosted installation, build, OTA, provider request or physical-device call was performed.

## Product behavior

- Reuses the chat wallpaper and the audio calling visual system: teal/lilac portrait halo, cream waiting-screen name, glass controls and a fixed primary-action dock.
- Calling and incoming screens use the other participant's published profile photos. Live video replaces the portrait during a connected call; the photo carousel never covers live video.
- The active screen uses a compact heading, a large remote video surface and the existing draggable self-preview. Mute, camera, camera flip, route, options and End use the existing call-owned actions.
- Pressing **Start video call** requests camera permission and opens a private, video-only local preview after the matched invitation is admitted. It does not join a provider call or request participant credentials for that preview. Publication waits for acceptance and the connected transport.
- Incoming calls show Decline, an icon camera-mode switch and one **Answer** button. The initial selection is camera on. The switch changes only the selected answer mode; it does not request permissions or capture media while ringing. Accessibility labels explain the selected mode.
- In-app Answer passes the selected mode. Camera-off Answer continues by audio without asking for camera permission. Camera denial also allows audio to continue. Turning the camera off, minimizing or entering the background does not silently reopen it.
- Native system incoming UI is unchanged. A generic system Answer has no explicit camera mode and keeps the camera off. The user can enable it in the foreground app. This is a deliberate boundary of this version.
- Completion shows the actual status/duration and retains existing safety details. Done waits for owned cleanup. No automatic redial, group calling, decorative speech waveform, reminder or unsupported message action was added.

## Architecture and ownership

`private-camera-preview.ts` owns local capture generations and retains failed cleanup resources for retry. `native-private-camera-preview.ts` opens the installed WebRTC dependency only for an explicit action, requests `audio:false`, and holds the process-wide exclusive native lease. Live or another Connect owner cannot borrow that lease during preview or unconfirmed cleanup.

On acceptance, preview release must finish before participant credentials or a connected owner are allocated. Native tracks are disabled and stopped; stream membership is detached before track release. Late allocations are retired after account/background/call cancellation. End authority work remains independent of a hung preview stop. These are code-level contracts and mocked checks, not proof of physical camera shutdown.

The controller owns camera intent; UI components receive presentation capabilities and actions rather than raw streams. The incoming controls and local-preview owner are separate modules. The camera-on entry flag is enabled only within the existing guarded native staging development runtime. Production calling remains disabled.

## Matched-only launch

Client entry points, the authenticated service boundary and native incoming coordination now reject new pre-match calls. Historical Intent permissions remain readable and withdrawable; new offers, approvals and pre-match Start actions are deferred. Existing preference/relationship requirements for matched calls remain in force.

The separate migration `20261105002952_connect_matched_only_launch.sql` is **prepared, not deployed**. It switches off pre-match calling, adds a constraint against accidental re-enablement, and rejects admission refreshes for legacy pre-match transports while committing the existing durable cleanup transition. It preserves user preferences, grants, budgets, function privileges and ordinary matched-call admission behavior.

The client change does not establish server-wide enforcement until that migration is installed. Before a hosted apply, inspect the linked staging reference, migration history, current `rpc_connect_admission(uuid,uuid)` definition and ACLs against the reviewed baseline. Apply only the reviewed migration after resolving any drift; this dirty workspace contains unrelated pending changes and must not receive a broad push. The agent's stored CLI credential could not be decrypted in this context; no credential was rotated or removed.

Rollback of the visual client can retain the narrowing server policy. Re-enabling pre-match calling requires an explicit later product/backend change, not automatic reversal of this constraint. Preserve the current cleanup worker and all durable end obligations.

## Verification and remaining evidence

- 17 camera-entry/controller regressions passed, including permission denial, transient permission UI, incoming mode selection, preview-to-call handoff, background/logout late allocations, and cleanup gating.
- Four native-adapter contract tests passed with mocked WebRTC capture and the real local lease registry. They check no audio request, exclusion with Live, release ordering and retained ownership after an ambiguous stop.
- Six migration checks passed in a disposable local database, with 88 earlier relationship assertions also passing. The disposable database and REST process were removed; the shared application database was not modified. No hosted/provider/media request was involved.
- 1,079 offline regressions across 72 suites and 128 UI interaction checks across 12 suites passed. Changed TypeScript modules/imports have no errors and lint has no warnings. The exact delta passes the frozen source-integrity chain.
- Eleven visual states/sizes passed layout checks with reachable primary controls, no horizontal overflow and no render errors. The fixtures use illustrative local images and real components; they do not validate the native video renderer. Results and screenshots are recorded in `tmp/connect-secure-calling/video-call-ui/`.
- An initial broad historical push-replay run reported `unreviewed_historical_source_drift` for `__tests__/connect-intent-push.interaction.test.tsx`. A read-only comparison confirmed its baseline already differed from that historical freeze before this turn; its expectations also changed in this turn for the matched-only launch. The frozen package and historical-source checker were retained. This historical replay is outside the 72-suite result and is not claimed to pass; the new source receipt records this turn separately. The unrelated historical video-resolution replay was also outside that run.

Still required on the two foreground staging phones: Start/Answer with camera on, camera-off Answer without a permission prompt, denied-camera fallback, preview release before live capture, independent mute/camera controls, native system Answer staying camera-off, minimize/background/reconnect choices, End during setup, and a sustained encrypted video call. Verify camera indicators, actual remote video, audio, routes, matching safety codes and shutdown separately on iOS and Android. Previous native activation and E2EE receive/shutdown evidence remain unresolved; this UI change is not release approval.

The exact source delta is [connect-video-call-ui.local.json](connect-video-call-ui.local.json). It extends the audio UI receipt without rewriting the frozen proposal or old snapshots.
