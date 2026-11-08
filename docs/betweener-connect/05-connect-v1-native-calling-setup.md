# Connect V1 native calling setup

Status: **BLOCKED / not configured or device tested**. No plugin, entry point,
native project, credential or provisioning changes were made during M0.

## Actual baseline

- `index.js` already owns `StreamVideoRN.setPushConfig`; add no second owner.
  It configures ongoing-call options but no iOS/Android push provider names.
- `createStreamVideoClient` returns an already registered Live client. It cannot
  restore a client from terminated state when no Live screen was mounted.
- `app.config.js` sets Stream `ringing: false`, Android/iOS keep-alive true,
  screenshare false and non-ringing push false. Firebase and CallingX packages
  already exist. SDK source says subsequent `setPushConfig` calls are ignored.
- The custom Live native plugin adds `audio`/`voip` modes, service permissions and
  PiP controls. These must remain compatible with Live; do not copy those controls
  into the Connect domain or remove background support from Live.
- Existing Expo push registration is environment/provenance checked. Stream
  device-token registration is a distinct integration. No application-level FCM
  background-handler registration was found in the inspected source.

## Required work after M1/M2 gates

Verify non-production provider names/identities before configuring ringing. Use
the installed SDK's supported Expo-native setup with existing dependencies.
Do not infer native readiness from a foreground React overlay.

iOS needs a verified VoIP push provider/provisioning path, CallKit integration,
correct permission copy and Auth-aware native answer restoration. A native answer
must map the push CID to a current server-authorized Connect session; it cannot
join merely because the OS supplied a call ID. Restore the correct account/app,
revalidate account/consent/expiry, and dismiss stale or signed-out invitations.
Keep general notifications on the existing pipeline; VoIP delivery is for calls.

Android needs a single reviewed FCM message-dispatch owner, Stream/CallingX
Telecom support and required service/channel configuration. Route non-Stream
messages through the existing general notification behavior. Check current target
SDK 36 restrictions, runtime notification/mic/camera/Bluetooth permissions and
foreground-service behavior. Full-screen presentation is not guaranteed; provide
an actionable notification fallback. A force-stopped app may not receive pushes.

Do not enable SDK auto-join paths without proving that the server accept/admission
decision runs before unauthorized media access. Inspect installed native/JS
lifecycle hooks and test direct native answer callbacks as well as foreground UI.

Create one environment/user-aware RTC owner shared with Live. It must restore
authentication without depending on a mounted call component, refresh the correct
admission, and invalidate native tokens/listeners on logout/account switch. Avoid
disconnecting a client retained by Live. Resolve existing Live/Connect media
occupancy before presenting an answer action.

Choose one incoming presentation owner for each platform/app state. Do not render
competing native and in-app ringing surfaces. Verify foreground suppression
options against the actual OS, installed SDK and build toolchain before using
them; older supported iOS versions require another consistent UI policy.

## Validation and build implications

Physical iPhone and Android development builds are required. Plugin changes need
new native binaries; OTA cannot supply them. No EAS/prebuild/build/distribution
command has been run or authorized here. Verify generated manifests/entitlements
without assuming current installed apps contain future configuration.

Test foreground, background, locked, normally terminated, reboot, notification
denied, mic denied, camera denied, offline, active Connect, active Live, signed-out,
account switch and acceptance on another device. Include stale pushes, expired
invitations, native decline and audio interruption/Bluetooth recovery. Every case
is currently **NOT_TESTED** for Connect.

Reference: [official Stream Expo incoming-call setup](https://getstream.io/video/docs/react-native/advanced/incoming-calls/ringing-setup/expo/).
