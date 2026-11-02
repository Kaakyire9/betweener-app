# Connect V1 known limitations

> Current M1 limitations and conditional M2 entry are in
> [document 11](11-connect-v1-m1-implementation.md). Real provider permissions,
> direct Stream bypass, native shared-client ownership, ringing and devices remain
> unverified. The following is the historical M0 snapshot.

> M0 snapshot: the subsequent local repair of relationship authority is recorded
> in [00-relationship-security-remediation.md](00-relationship-security-remediation.md).
> Connect runtime, provider and device limitations remain separate release gates.

Date: 2026-10-27. **M0 only. Connect V1 is not release ready.**

| Limitation | Consequence / next gate |
| --- | --- |
| Existing local match authority bypass | One participant can forge accepted relationship state. M1 blocked until the existing relationship boundary is hardened. Current hosted behavior was not queried. |
| Legacy accepted relationship provenance | The existing status alone cannot prove a historical mutual decision. Do not fabricate a consent backfill. |
| No Connect implementation | No domain reducer, authorization RPCs, consent fields, sessions, history, UI, media adapter, provider worker or Connect flags exist. Documents describe required future work. |
| Older local database | Ledger ends at September 30 while repository contains October migrations. The exploit demonstrates that local schema plus matching repository policies; it does not verify a full current migration replay. |
| Uncommitted shared work | Live/Studio/Circle/package changes predated this work. They were preserved. Selected passing tests do not certify all current work or a released binary. |
| Stream app/call type not attested | Local credential group labels do not establish deployed application mapping or least-privilege grants. No Stream API was called. |
| Singleton token-provider ownership | Existing first-owner Live refresh cannot be adopted blindly by Connect. Shared ownership/refresher handoff needs implementation and tests. |
| Native ringing disabled | Current plugin has `ringing: false`; provider names and cold-start auth/client creation are absent. An in-app overlay would not meet V1 acceptance. |
| Native build/credentials not verified | No Xcode/Android build, APNs/FCM/provisioning check, device install or distribution was performed. Builds remain separately authorized. |
| OS delivery restrictions | Full-screen UI is not guaranteed; Android force-stop and other platform restrictions must be documented after actual tests. No universal delivery guarantee. |
| No provider security proof | Direct join/create/invite/role/record/transcribe/ended-call bypass attempts remain release blockers, including tokens from other same-app issuers. |
| No media/device/recovery proof | Voice/video quality, route/interruption recovery, background receive, lock/cold-start, network handoff and resource release are NOT_TESTED. |
| No verified privacy capability claim | Recording/transcription/retention/encryption configuration was not read from the provider. No end-to-end encryption or total lock-screen anonymity claim. |
| Product policies pending | Pre-match expiry, rate budgets, call availability defaults, pending-match semantics and historical-row eligibility require reviewed server configuration/design. |
| No measured performance/SLOs | No connection reliability, latency, frame-rate, battery or cleanup target has been achieved or measured for Connect. |

The diagnostic's nine passing assertions confirm an existing security failure;
they are not nine successful Connect security protections. No physical-device
validation can be inferred from the 91 passing existing regression tests.
