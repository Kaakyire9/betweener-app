# Staging native crypto libraries

This directory controls adoption of the reviewed strict-framing WebRTC patch.
`strict-webrtc.json` is the build contract. A pending or incomplete manifest
rejects opt-in builds; fixture tests cannot promote it to verified.

The source and patch remain pinned in
[`native-patches/stream-webrtc-145.17.0`](../native-patches/stream-webrtc-145.17.0).
The original review manifest and Linux/macOS receipts describe their respective
historical validation steps. They do not describe an installed phone.

## Integration

Only the `developmentNativeCrypto` EAS profile opts in. It inherits the existing
staging development configuration and sets `BETWEENER_STRICT_WEBRTC=1`.
The build hook and config plugin reject production identities and environments.
The ordinary development and store profiles continue to use upstream libraries.
The opt-in profile has its own update channel and app-version/native-version
runtime fence, preventing ordinary development updates from crossing that binary
boundary. This source configuration does not publish an update or create a channel.
No calling, video, consent, cleanup or provider gates are changed.

The `eas-build-pre-install` hook prepares the platform-specific dependency:

* Android: download the SHA-256/size-pinned AAR into an ignored local Maven
  repository. Gradle verifies its bytes again, restricts the custom Maven group
  to that repository and replaces only the reviewed upstream 145.17.0 coordinate.
* iOS: generate an external `StreamWebRTC` podspec with the versioned download
  URL and CocoaPods SHA-256 verification. The scoped patch-package patch selects
  the same pod version in the existing React Native WebRTC wrapper.

An unavailable or altered artifact fails the build. No fallback to a different
native library is performed. The React Native wrapper stays at 145.4.1; its
JavaScript and native bridge APIs are unchanged. Downloaded binaries are excluded
from Git and EAS source archives and are prepared afresh by the build hook.

The custom patch affects every framed `DefaultEncryptionManager` receiver in
the rebuilt app, including Live. It rejects mixed clear/encrypted payloads on
that path. Active encryption faults remain fatal. This library does not identify
the origin of the hang-up packet or guarantee that its fault event disappears.

## Validation and installation

Native library builds are manual in `Connect native crypto validation`.
They first require exactly six reviewed failures on the original implementation
and 79/79 passing patched host tests. Library receipts retain source/patch hashes,
architecture inventories and artifact SHA-256 values. The offline compatibility
tool compares the candidate against integrity-pinned upstream Android Java APIs
and iOS public headers; this is separate from host crypto and device testing.

Local integration guards:

```sh
node --test __tests__/connect-native-build-guards.regression.test.cjs __tests__/connect-native-artifacts.regression.test.cjs
python native-patches/stream-webrtc-145.17.0/test_compatibility.py
```

After artifact verification/publication, the same manual workflow's
`Verify published iOS library and CocoaPods resolution only` option checks real
CocoaPods resolution with the actual integrity-pinned, patched 145.4.1 wrapper.
Leave both library-build options unchecked for that run. The fixture supplies a
resolver-only React pod, downloads the real framework through the generated
checksum-pinned podspec and verifies its native payload bytes. It does not compile
React, a wrapper or an application, and does not replace development-build tests.

Fresh staging app builds are a separate step requiring approval. Metro reloads
cannot install a different compiled WebRTC library. Before physical tests, inspect
the app's staging identity and packaged native payload against the verified
library inventory. Profile metadata alone is not installed-binary evidence.

Then verify foreground voice in both directions, independent mute, a call beyond
three minutes, End from each phone, immediate audio stop on both, a subsequent
call and matching safety codes. Retain separate iOS and Android logs. Host tests,
public API checks and successful builds do not prove physical shutdown, provider
revocation, real media encryption or release readiness.
