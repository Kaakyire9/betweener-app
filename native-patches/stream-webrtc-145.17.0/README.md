# Strict framed receive patch — native validation

The current native adoption contract is
[`native-artifacts/strict-webrtc.json`](../../native-artifacts/strict-webrtc.json).
See the [staging integration guide](../../native-artifacts/README.md) for build
profiles, verified artifact receipts and installation boundaries. The original
review manifest and host receipts in this directory retain their historical
scope. Compiling a library does not change an installed phone or enable calling.

Pinned upstream: [GetStream/webrtc 145.17.0](https://github.com/GetStream/webrtc/tree/eeff9252f32a40d1671974c31c096ce9fa776130).
The app's `@stream-io/react-native-webrtc` 145.4.1 consumes Android AAR
`io.getstream:stream-video-webrtc-android:145.17.0` and iOS pod `StreamWebRTC` 145.17.0.
Those prebuilt libraries contain the C++ implementation. `patch-package` on
JavaScript cannot change that implementation.

The pinned `DefaultEncryptionManager::DecryptFramed` forwards nonempty frames
without a valid trailer to the decoder and emits a throttled unencrypted-frame
event. This candidate instead clears output and returns false for every such
frame, including subsequent frames while notifications are throttled. It keeps
the native fault event and the app's fatal handling of active encryption faults.
It does not identify or repair the source of the observed unframed packet, and
does not promise to eliminate its fault notification during hang-up.

Scope: all framed `DefaultEncryptionManager` receivers in a rebuilt binary,
not only Connect. It intentionally removes compatibility with mixed encrypted
and clear media on that path. Empty payload handling, legacy crypto, disabled
transformers and authenticated framed decryption are unchanged. Review this
policy for every consumer before adopting a custom binary.

The patch applies cleanly to the two pinned source files. Linux x86_64 and macOS
ARM64 host validation passed **79/79 native C++ tests**, after the original
manager failed exactly the six reviewed strict-receive checks. Host validation
does not establish physical-device media behavior. The patch updates permissive
expectations and adds repeated-drop coverage across all four track types, an
output-buffer clearing check, and AES-256 round-trip coverage after a rejection.

Before any native adoption:

1. Use a complete checkout at the exact commit in `manifest.json`; verify the
   original source hashes and run `git apply --check strict-framing.patch`.
2. Review the strict framing policy, compile the patch and run the complete
   native crypto/transformer tests, including existing authenticated round trips,
   replay, malformed frame, empty payload and disposal tests.
3. Produce reviewed Android and iOS WebRTC artifacts with distinct immutable
   versions. Wire those artifacts into the React Native dependency in a separate
   scoped change. Do not overwrite an upstream artifact or enable calling/video.
4. After build approval, rebuild staging development apps and verify the installed
   artifacts. Test foreground voice in both directions, independent mute, End
   from each phone, immediate audio stop, and matching safety codes with both logs.

The JavaScript receiver-first shutdown repair can be reloaded independently.
It requests receiver closure before sender/capture mutations without awaiting
either peer. SDK closure and JS track state do not prove native decoder shutdown
or provider revocation. Encryption-manager disposal still requires SDK leave.


## Native validation tooling

`run-native-tests.py` downloads the exact reviewed source and depot_tools
commits, verifies original file hashes, and first compiles the new assertions
against the original manager. Exactly six reviewed tests must fail. It then
applies the manager patch and requires the complete standalone native crypto
test binary to pass. This is host C++ validation, not a physical phone test.

The original test-file hash has been corrected to include the actual upstream
file's final blank line. The patch itself is unchanged. The manifest records
exact LF source hashes before and after application.

The dedicated Linux Docker tool image and volume contain no app credentials.
The local run uses at most four CPUs and 4 GiB RAM. C: does not contain the large checkout.

The sole anonymous hook in the reviewed DEPS downloads unrelated RTC media
fixtures. Its exact action is verified before it is suppressed through gclient's
custom_hooks setting; the native crypto tests do not read those media files.
All compiler/toolchain hooks and the complete crypto test target remain enabled.

`.github/workflows/connect-native-crypto.yml` is manual only. It uses macOS 26,
read-only repository permissions and no persisted Git credentials. It defaults
to native tests only. Optional Android AAR and unsigned iOS framework builds
require the corresponding native red/green run and emit checksum receipts.
The separate dependency-integration option resolves an already verified iOS
artifact with the actual patched wrapper; both library-build options must be off
for that check. No package publication, EAS app build, signing, OTA or provider
call is performed by this workflow.

The CI script checks actual free space before checkout; the macOS workflow
requires 12 GiB and reserves 2 GiB during command execution. Runner storage
must still be verified on the first CI run. Artifacts are candidates until
reviewed and integrated into a separately verified staging development build.

The workflow is registered on the default branch. Select the reviewed branch
when dispatching a run. Retain the exact workflow commit, source revision,
patch digest, test receipts and binary checksums for every adopted artifact.
