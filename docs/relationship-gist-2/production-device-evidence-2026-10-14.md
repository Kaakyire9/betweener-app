# Relationship Gist 2.0 physical-device evidence matrix

Date opened: 2026-10-14

Candidate baseline: `c6fa2cbb6d4ee9c7f30ca81a5457c53205707e07`
Candidate patch SHA-256: `6AE1E4A5E04231C9D6340BCFAED08134FCAE963D57D9BF852639C5B5AA0F1ED6`

## Evidence rules

For each row, record device model, OS version, app build/runtime, backend project reference, account identifiers in redacted form, UTC timestamp, result and screenshot/video filename. Do not record tokens, private Reflection text or user personal data.

Existing informal iOS screenshots demonstrate normal-size rendering and core Gist use, but they are not evidence for maximum Dynamic Type, VoiceOver, Android TalkBack, offline account isolation or cold-start universal links.

## Required matrix

| Scenario | iOS small | iOS large | Android small | Android large | Status |
| --- | --- | --- | --- | --- | --- |
| Online open from Circles | Reported informally | Pending | Pending | Pending | PENDING |
| Saved Library open and resume | Reported informally | Pending | Pending | Pending | PENDING |
| Cold-start canonical HTTPS link | Pending | Pending | Pending | Pending | PENDING |
| Warm/background canonical link | Pending | Pending | Pending | Pending | PENDING |
| Offline cached Gist after termination | Pending | Pending | Pending | Pending | PENDING |
| Offline save, unsave and reconnect replay | Pending | Pending | Pending | Pending | PENDING |
| Offline reaction change/removal and reconnect | Pending | Pending | Pending | Pending | PENDING |
| Account switch with request in flight | Pending | Pending | Pending | Pending | PENDING |
| Account switch with queued offline mutations | Pending | Pending | Pending | Pending | PENDING |
| Private Reflection create/edit/delete isolation | Reported informally | Pending | Pending | Pending | PENDING |
| Maximum accessibility text size | Pending | Pending | Pending | Pending | PENDING |
| VoiceOver/TalkBack reading order and state | Pending | Pending | Pending | Pending | PENDING |
| Reduce Motion | Pending | Pending | Pending | Pending | PENDING |
| Dark/light appearance | Reported dark only | Pending | Pending | Pending | PENDING |
| Background/resume aggregate refresh | Pending | Pending | Pending | Pending | PENDING |
| Low-connectivity recovery | Pending | Pending | Pending | Pending | PENDING |
| Each Gist feature flag disabled independently | Pending | Pending | Pending | Pending | PENDING |

## Pass criteria

- No clipped, overlapping or unreachable control at maximum text size.
- Screen reader order follows title, cover description, lens, short Gist, expanded guidance, takeaway, reactions, private Reflection and metadata.
- Every interactive control has a meaningful label, role and selected/expanded state.
- Previous-account content and mutations never flash, replay or attach to the next account.
- Offline save intent and reaction intent converge after reconnection without duplicate counts.
- Private Reflection text never appears in another account or telemetry output.
- Cold-start links open the stable Gist identity; unavailable content shows an explanation instead of a blank route.
- Feature-flag disablement removes only the new capability and preserves the legacy reader path.

## Suggested execution order

1. Record app/runtime/backend identity before testing.
2. Run normal online flows on both platforms.
3. Run accessibility and maximum-text checks.
4. Seed saved state and pending mutations, then test termination and offline restart.
5. Perform account-switch isolation checks.
6. Restore connectivity and verify deterministic replay and aggregate refresh.
7. Test cold and warm canonical links.
8. Disable each flag individually and repeat the affected entry point.

`IOS_DEVICE_EVIDENCE = PENDING`

`ANDROID_DEVICE_EVIDENCE = PENDING`

`ACCESSIBILITY_EVIDENCE = PENDING`

`OFFLINE_ACCOUNT_ISOLATION_EVIDENCE = PENDING`

`DEEP_LINK_DEVICE_EVIDENCE = PENDING`

`PRODUCTION_DEPLOYMENT_AUTHORIZED = NO`
