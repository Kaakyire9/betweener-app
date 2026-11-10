# Connect V1 development build readiness — 10 November 2026

**Ready for a controlled `developmentNativeCrypto` development build.**
This is build readiness, not general calling, video-publication or store-release approval.

## Latest device follow-up

The owner confirmed both phones use `developmentNativeCrypto` and manually ended the latest call on iPhone. Speech, mute, output indication and audio stopping were reported healthy. Android nevertheless recorded a remote AUDIO `e2ee.unencrypted_frame` rejection near hang-up. **Its origin remains unresolved; the fault is not repaired or waived by this startup change.** Neither clock is synchronized with the other phone. Safety-code comparison and exact installed artifact attestation were not established by these logs.

| Local setup observation | iOS | Android |
| --- | --- | --- |
| Credentials, including client preparation | 811 ms | 1,555 ms |
| Broad native preparation/join | 1,715 ms | 3,840 ms |
| Microphone acknowledgement | 1,319 ms | 1,309 ms |
| Output confirmation | 190 ms | 1,049 ms |
| Total setup | 4,035 ms | 7,753 ms |

The dominant delay follows credential preparation. The credential issuer retains authenticated ownership and both secure-admission checks, including revalidation after issuance; no backend change or hosted deployment is justified by this trace alone. Backend stage logs were not queried. The broad native span includes provider preparation, media join and system activation, so it must not be described as pure network/ICE time.

Startup now overlaps microphone enablement and fresh output confirmation **after** encrypted admission/join. Both must acknowledge before ready. Startup-only endpoint discovery retains the existing three-second limit and exact endpoint identity checks; fresh selected Bluetooth/wired output is preserved. End, account change and output failure continue to retire capture that finishes late. The overlap could remove approximately the shorter of the two old audio spans (190 ms / 1,049 ms in this trace); actual device improvement is unverified.

New development-console diagnostics split owner preparation, encryption preparation, provider read, key preparation, media join, input-mixer acknowledgement and system activation. These are local nested spans, not additive backend measurements. Independent microphone/output completion markers prevent misleading zero-millisecond timings. Encryption faults retain bounded state captured **before** synchronous retirement removes peers, without retaining audio, identifiers, keys or raw provider errors. A native participant is labelled remote only when it matches the authenticated call roster; unfamiliar identities remain unknown and still fail closed.

The pinned native receive patch rejects unframed media and clears its output. Reviewed transformer/manager disposal paths drop frames after disposal; SDK peer closure is requested before capture release. This inspection did not establish a new teardown defect or a safe native repair. Active encryption faults remain fatal, with no grace period or plaintext fallback. No native library, dependency, calling gate, worker, webhook or backend source changed. This follow-up can be delivered by Metro to the installed development builds; it does not require another EAS build.

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
| Fresh disposable SQL/RLS integration | 10/10 suites passed sequentially: authority, revocation, secure calling, End Call & Block, staging voice, Journal, video preferences/activation, matched launch and forensic lifecycle |
| Local database test-runner regressions | 8/8 passed; focused ESLint zero errors/warnings |
| Full repository ESLint | Passed, zero errors/warnings; final changed JS files also checked |
| Expo Doctor / Expo dependency alignment | 21/21; aligned |
| Offline Node regressions | 2,699 passed across 267 suites; zero failures/skips. Final diagnostic refinement also passed all 136 focused checks, including its additional participant-attribution test. |
| React Native interaction tests | 496 passed across 86 suites |
| Current Connect interaction checks | 152 passed across 18 suites in a sequential run |
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

The local Docker blocker is cleared: all ten previously blocked SQL/RLS suites now pass using disposable schema clones and loopback-only REST fixtures. Every suite also passed the 88 earlier relationship-authority assertions. All ten test databases/REST containers were removed successfully, and the shared database schema SHA-256 remained identical before and after the run. Two abandoned clones from the interrupted audit were inspected and removed separately; the shared PostgreSQL volume was preserved. No hosted staging or production database was accessed or modified.

No service restart was performed (PostgreSQL restart count remained zero). Retained Docker logs show container-execution/health-check deadline failures across multiple services; the original trigger remains unconfirmed. The test harness now rejects an unhealthy baseline, bounds Docker/SQL/HTTP operations, applies connection-scoped SQL deadlines, uses unique disposable resource names, redacts command-error credentials and attempts each cleanup independently, including uncertain creation acknowledgements. Run the local database suites sequentially to avoid overlapping clone workloads. These changes affect local test tooling only and add no native build requirement or application timeout change.

The new native change requires **iOS**. There is no additional Android-native source change in this repair batch. Reuse the installed Android development app only if it already contains the earlier Telecom fix; otherwise rebuild Android too. Metro can deliver subsequent JavaScript-only repairs without replacing native libraries.

After installation, verify foreground calls in both directions, independent mute, Bluetooth route indication and reconnect/disconnect, a call beyond three minutes, End from each phone, audio stopping on both, a subsequent call and matching safety codes. Keep separate iOS/Android logs. Background continuation requires its existing explicit eligibility/lease; that policy was not broadened.

No EAS application build, OTA publication, provider call, gate activation or deployment was performed. Native pod compilation does not prove signed-app launch, physical media shutdown or provider revocation. Further native defects can still require a binary; no audit can guarantee otherwise.
