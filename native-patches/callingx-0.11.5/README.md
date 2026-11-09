# Callingx 0.11.5: Android endpoint delivery

The Android logs from 2026-11-09 show two voice calls reaching native activation and
receiving packets, then failing route confirmation after the endpoint list becomes
empty. The matching iOS attempts confirm their routes. Neither reports an encryption
failure. Packet reception alone does not prove audible output.

The patch fixes two endpoint-delivery races in `TelecomCallRepository.kt`:

- Collect `availableEndpoints` once. AndroidX Telecom 1.0.1 exposes it using
  `Channel.receiveAsFlow()` on both modern and legacy Android implementations.
  The previous `first { it.isNotEmpty() }` collector competed with the state collector.
  A readiness check could steal a list, or remain subscribed and steal a later change.
  The one collector now publishes the list before releasing the pre-call subscription.
- Publish the initial per-call snapshot when registration is observed. `StateFlow`
  can coalesce registration with endpoint updates; relying only on later changes
  could otherwise leave `AudioEndpointStore` empty even with valid repository state.

The existing exact-call routing adapter, acknowledgement and selected-output checks,
three-second deadline, Telecom ownership, E2EE and feature gates remain unchanged.
No cached previous-call endpoints or fabricated accessory routes are used.

Primary sources: [AndroidX 1.0.1 source archive](https://dl.google.com/dl/android/maven2/androidx/core/core-telecom/1.0.1/core-telecom-1.0.1-sources.jar),
[receiveAsFlow fan-out contract](https://kotlinlang.org/api/kotlinx.coroutines/kotlinx-coroutines-core/kotlinx.coroutines.flow/receive-as-flow.html).

## Local validation

Requires Java, a local Kotlin compiler and `kotlinx-coroutines-core-jvm.jar`.
The runner downloads nothing and creates no calls. It finds Android Studio's bundled
compiler on Windows; elsewhere set `CALLINGX_KOTLINC` and
`CALLINGX_COROUTINES_JAR`, or pass `--kotlinc` and `--coroutines`.

```powershell
python native-patches/callingx-0.11.5/test-endpoint-flow.py --compare-upstream
node --test __tests__/connect-telecom-endpoint-patch.regression.test.cjs
```

The Kotlin runner compiles the installed repository's actual collector and observer
blocks into a disposable JVM fixture. It checks lossless initial and subsequent lists,
publication before setup release, exact-call isolation, cancellation, initial cache
seeding and removal. Synthetic Bluetooth/wired endpoints test stream delivery only.
The reverse-patched control must reproduce exactly six expected failures; the patched
source must pass all eleven cases. The Node suite checks clean-install application,
repeat application and failure on incompatible source using the real `patch-package`.

This is host-level coroutine and patch validation, not an Android app compilation or
physical-device, accessory, audible-output or provider-cleanup result.

## Device verification still required

This Kotlin change requires a fresh Android staging development build, using the
reviewed `developmentNativeCrypto` profile. Metro reloads cannot replace it. The iOS
binary does not need rebuilding for this Android-only patch.

On the two staging phones, verify incoming and outgoing voice calls, earpiece/speaker
switches and confirmation, End from either phone, then an immediate second call.
Next test actual Bluetooth and wired devices: connect/disconnect during a call,
switch back to the phone, independent mute and audio stopping on both phones.
Capture separate Android/iOS logs. No general-release or video activation is implied.
