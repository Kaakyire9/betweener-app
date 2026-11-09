# Connect V1 development build readiness — 9 November 2026

**Ready for a controlled `developmentNativeCrypto` development build.**
This is build readiness, not general calling, video-publication or store-release approval.

## Consolidated work

- iOS encrypted mute uses an acknowledged input-mixer contract, with old binaries rejected before media creation. Mute keeps encrypted sender tracks attached.
- SDK retirement fences reconnect before teardown yields. Pending cleanup cannot clear the fence; a completed cleanup permits a fresh join. Track stops and uncertain-release quarantine remain independent of network completion.
- Timeout and cleanup diagnostics use bounded categories. A failed release now appears as a failure in the call summary.
- Existing Android Telecom delivery, observed Bluetooth routing, canonical credential preparation, iOS scene lifecycle and notification-extension fixes are included in the pushed branch.
- The strict development runtime now includes the `controls-1` native bridge revision. Its build images use the SDK 57 aliases. Ordinary development and store profiles retain their existing gates.
- Compatible workspace updates: Vite 8.3.7, React plugin 6.3.0 and Rolldown 1.2.18. Expo 57, React Native and the reviewed Stream/native stack stay pinned. Major upgrades and native-wrapper migrations are separate work, not build prerequisites.

## Verification

| Check | Result |
| --- | --- |
| Root TypeScript | Passed |
| Full repository ESLint | Passed, zero errors/warnings; final changed JS files also checked |
| Expo Doctor / Expo dependency alignment | 21/21; aligned |
| Offline Node regressions | 2,670 passed across 264 suites; zero failures/skips |
| React Native interaction tests | 496 passed across 86 suites |
| Studio/program worker TypeScript and checks | Passed |
| Programme worker/infrastructure tests | 8 + 6 + 2 passed; infrastructure lint/format also passed |
| Guarded mocked browser tests | 34 passed; no hosted requests or real media |
| iOS and Android JavaScript bundles | Passed locally and in isolated Linux CI |
| iOS native library compilation | Patched Stream and Callingx pods compiled against real React/WebRTC dependencies in macOS CI; simulator arm64, unsigned, no app target |
| Android endpoint coroutine control | Original race reproduced; patched implementation 11/11 |
| Native compatibility-tool tests | 6/6 |
| Environment, release-policy and asset checks | All five repository verification commands passed |
| Dependency audit | No moderate/high/critical findings; seven low advisory entries remain for the deepmerge dependency chain. Existing patch and poisoning regressions pass. |

Native compilation and bundle evidence: [GitHub run](https://github.com/Kaakyire9/betweener-app/actions/runs/42691784631), [retained receipt](../../native-artifacts/call-control-validation.json).
The receipt identifies the compiled revision and exact source hashes. Later changes to tests/docs do not change those native sources.

Windows test concurrency is bounded to two suites because suites spawn their own compilers/processes. The initial parallel audit exposed process-startup timeouts; the final complete run passed without extending application deadlines or skipping tests.

## Audit boundaries and remaining verification

Reviewed native ownership, key/transform retirement, join/reconnect races, capture/mute/output routing, lifecycle/Auth isolation, consent/block boundaries, Journal/chat identity and ordering, cleanup/provider distinctions, build configuration and patch replay. No schema, hosted function, worker schedule, webhook/push security or calling gate was changed. Active encryption failures remain fatal; there is no plaintext fallback.

Fresh disposable SQL/RLS tests could not execute: the existing local PostgreSQL Docker container was unhealthy and even container execution timed out. The stalled audit processes were stopped; shared services were not restarted. Backend source regressions passed, but this is not a fresh SQL/RLS execution result. No hosted staging or production database was accessed or modified.

The new native change requires **iOS**. There is no additional Android-native source change in this repair batch. Reuse the installed Android development app only if it already contains the earlier Telecom fix; otherwise rebuild Android too. Metro can deliver subsequent JavaScript-only repairs without replacing native libraries.

After installation, verify foreground calls in both directions, independent mute, Bluetooth route indication and reconnect/disconnect, a call beyond three minutes, End from each phone, audio stopping on both, a subsequent call and matching safety codes. Keep separate iOS/Android logs. Background continuation requires its existing explicit eligibility/lease; that policy was not broadened.

No EAS application build, OTA publication, provider call, gate activation or deployment was performed. Native pod compilation does not prove signed-app launch, physical media shutdown or provider revocation. Further native defects can still require a binary; no audit can guarantee otherwise.
