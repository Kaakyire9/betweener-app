# Connect V1 test matrix

> Current M1 results: 19 unit tests, 15 database ACL assertions, 62 integration
> cases including five real connection races/six HTTP attacks, and the earlier
> 88 relationship assertions pass. See [full evidence](11-connect-v1-m1-implementation.md).
> The remaining content is the original M0 matrix, including the retained 91-test command.

> M0 snapshot. Current relationship security results are in
> [00-relationship-security-remediation.md](00-relationship-security-remediation.md).
> Correction: the previously listed `intent-request-decision.regression.test.ts`
> did not exist and supplied no coverage. The 91 actual tests and verified command below exclude it.

Date: 2026-10-27. No ordinary test contacted Stream or a hosted Supabase project.
Existing regressions and an isolated local vulnerability diagnostic were run.
Connect functionality itself has not been implemented or tested.

## Completed checks

| Check | Result | Scope |
| --- | --- | --- |
| Selected existing Node regressions | PASS: 91 tests, 0 failures | Stream provider/leases, Live release gate, push provenance/security and chat lifecycle/thread behavior; no Intent authorization test |
| Live environment isolation | PASS | Local repository staging/production configuration |
| EAS project isolation | PASS | Identity, update project, callback and negative environment cases; no EAS operation |
| Android variant configuration | PASS | Local package/scheme/association configuration; no Android build |
| M0 SQL diagnostic | PASS: 9 diagnostic assertions | Reproduces unilateral match INSERT/promotion and legacy-helper trust; **security requirement FAIL** |
| Rollback cleanup | PASS | All four synthetic Auth users and both synthetic matches absent; zero synthetic push events in diagnostic |

Exact regression invocation:

```powershell
node --no-warnings=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test __tests__/stream-live-media-provider.regression.test.ts __tests__/live-product-release-gate.regression.test.ts __tests__/push-environment-provenance.regression.test.ts __tests__/push-notification-security.regression.test.ts __tests__/chat-thread-behavior.regression.test.ts __tests__/chat-message-state.regression.test.ts
npm.cmd run verify:live-isolation
npm.cmd run verify:eas-project-isolation
npm.cmd run verify:android-variant
```

Local diagnostic invocation (never retarget to a hosted database):

```powershell
Get-Content -LiteralPath 'supabase/verification/connect_v1_m0_relationship_authority_audit.sql' -Raw |
  docker exec -i supabase_db_betweener-app psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -P pager=off
```

Inspect pgTAP output as well as the process exit code: plain psql does not fail
its exit code merely because a TAP assertion prints `not ok`. This run printed
`ok 1` through `ok 9`, no `not ok`, an empty `finish()` result and `ROLLBACK`.
The diagnostic intentionally asserts that the known vulnerability exists. Once
the boundary is hardened, replace it with deny-based regression tests; do not
weaken a fix to preserve a diagnostic PASS.

The first diagnostic attempt stopped before fixtures because pgTAP was absent.
The final script creates it inside the same rollback-only transaction; the rerun
completed. This was test-harness setup, not a failed Connect implementation.

## Required Connect automated tests — all NOT_TESTED

| Layer | Required cases |
| --- | --- |
| Domain | Exhaustive legal/illegal/terminal transitions, nullable duration, connected-time calculation, expiry boundary, retry limits and payload-bound idempotency |
| Authorization | Both account states; Auth/profile mapping; trusted match; directional voice/video consent; approvals cannot exceed request; expiry/revocation; bidirectional blocks and privacy availability |
| Transaction integration | Create/accept/decline/cancel/end; per-user occupancy; true concurrent crossed calls; two-device winner; accept versus timeout; block versus provisioning/token issuance; replay and server cleanup |
| Provider reconciliation | Verified signature over raw body, app/type/session identity, event dedupe, out-of-order callbacks, no client ACTIVE evidence, orphan compensation and end/removal retries |
| History / RLS | Actor spoofing, unauthorized read/write, bounded participant pagination, exactly-once events and no private-content fields |
| UI | Outgoing/incoming/active voice and video; mute/routes/camera/switch; upgrade/downgrade; reconnecting; failed/ended/declined/missed; mic/camera denied; safe-area preview; reduced motion and screen reader |
| Resource ownership | Single same-app/user client; original-token-provider handoff; Live lease retained; auth switch/logout; call-only cleanup; stopped tracks/audio/animations/listeners; no duplicate push registration |

## Mandatory security proofs

| Requirement | Current status / release gate |
| --- | --- |
| 1. Unmatched user cannot call without consent | BLOCKED: Connect not implemented; local accepted-match authority is forgeable |
| 2. Blocked user cannot call/reconnect | NOT_TESTED; requires database and provider race tests |
| 3. Revoked consent cannot be used | NOT_TESTED |
| 4. Stale call IDs cannot be reused | NOT_TESTED; provider ended-call permission must also deny |
| 5. Unrelated user cannot join | NOT_TESTED; direct SDK/HTTP test required |
| 6. Participant cannot add members | NOT_TESTED; direct provider test required |
| 7. Caller cannot spoof another user | NOT_TESTED for Connect; Auth actor must be derived on server |
| 8. Direct Stream requests cannot bypass policy | BLOCKED on private call type and verified non-production app; test all same-app token issuers |
| 9. Client flag manipulation cannot bypass policy | NOT_TESTED; server flags/commands do not yet exist |
| 10. Terminal call cannot resurrect | NOT_TESTED; include delayed webhooks and native callbacks |

The outsider-denial control in M0 concerns existing **match RLS**, not private-call
membership. It is not evidence for requirements 5 or 8.

## Physical-device matrix — every case NOT_TESTED

Run on a physical iPhone and physical Android phone using approved development
binaries first. Repeat across two signed-in users and multiple devices per user.

| Dimension | Cases |
| --- | --- |
| Lifecycle | Foreground, background, locked, normally terminated, reboot, Android force-stop restriction documented |
| Permissions | Notifications denied, mic denied, camera denied; route/Bluetooth permissions where needed |
| Media / audio | Voice only, video, upgrade/downgrade, switch camera, wired/Bluetooth/earpiece/speaker, native audio interruption and recovery |
| Network | Strong/weak Wi-Fi, cellular, Wi-Fi/cellular handoff, 4G/5G, latency, loss, offline/airplane mode and bounded recovery |
| Conflicts | Crossed calls, duplicate taps, another Connect call, active Live, multi-device answer, logout/account switch while ringing |
| Safety | Block, revoke, unmatch, suspend/delete during setup and active media; provider outage while ending |
| UX / resources | Rotation, preview bounds, screen reader, large text, reduced motion, low-end Android frame time/battery and stopped media after every terminal path |

No simulator, mock, static configuration or compile result can substitute for a
physical-device PASS. Full repository tests, full Live suite, typecheck, native
builds, provider bypass tests and staging/device canaries were not run for M0.
