# Connect staging infrastructure: final deployment gate

Date: 2026-11-01. Decision: **NO-GO for Scope A, the complete frozen infrastructure package.** The source freeze passes, but shared-push rollback/recovery and resolved dependency provenance are not sufficiently verified. Owner approval alone would not close those technical gaps. Scope B remains separately unauthorised.

This report adds only gate evidence and missing actions to [Report 46](46-connect-v1-staging-deployment-preparation.md) and its [rollout proposal](46-connect-v1-staging-rollout-proposal.md). No hosted Supabase/Stream request, migration, deployment, worker/webhook invocation, account operation, secret change, build, device action or OTA ran. No runtime source or frozen package was changed.

## 1. Frozen package: verified unchanged

The [M3.3 package](connect-v1-m3-3-staging-deployment-package.json) matches Report 46's recorded SHA-256 exactly:

```text
4769fc763db17990a3d37018e69a4150458b0ef89e87aa5ba14fb2cd13582ed3
```

Report 46's final receipt also matches its recorded hash:

```text
8b66fd0abbed94d8a2048c742cb322c5dab4e0b47a0e54eed0a68685df41c766
```

Fresh verification performed **66 hash comparisons across 41 distinct paths**, with **zero mismatches**. These cover the exact six migration files, five Edge functions' local source/configuration closure, gateway configuration, rehearsal receipt and Report 46 source freeze. The package was **not regenerated**. All five checked-in calling/native/video switches remain false. The local linked ref remains `xsgzxadwuxuziubglvps`; that local link is not a fresh hosted identity attestation.

Evidence: `tmp/connect-deployment-final-gate-47/frozen-verification.json` and `source-configuration-verification.json`. Report 46's measured-contract rehearsal remains applicable to those unchanged files; no functional tests or migration rehearsals were repeated here.

## 2. New push recovery evidence—and the remaining critical gap

**New finding:** Git commit `f5a4be7edd8fb532e185068e5524c51ab250163d` contains all **five** source files retrieved from staging push version 26 in Report 45. Every source SHA-256 matches the retained deployment evidence, including the old entrypoint:

```text
2b21087151fe5736861a8964b615323e5ad0c2b95f90181c1178ea48bc8169f7
```

A source-only recovery archive was created without checkout, source overwrite or hosted access:

```text
tmp/connect-deployment-final-gate-47/push-v26-source-recovery.zip
SHA-256 aad4689a8ea060da10f8daafd412e6a21b29023aa799afae75ecb9546ef90360
```

All five archive members were read back and matched against the retained version-26 source hashes. The accompanying JSON identifies the commit and members. This improves Report 46's rollback preparation **without modifying its frozen package or its historical archive-availability field**.

**This is not a verified deployment rollback.** The recovered source archive does not supply:

- The original deployable runtime bundle/resolved dependency closure corresponding to retained bundle digest `28d351d383d76ab687daf56c90f2293b78db3905694bf330c92979d3d64505d9`.
- An independently attested original import-map/runtime configuration or a tested platform-supported restoration method.
- A restore rehearsal using the old handler with migration 6's renamed private delegates, public wrappers and ACLs, proving unrelated notifications continue to work.
- Fresh confirmation that version 26 is still the deployed revision. It is the **last verified** revision, not a new hosted observation.

The candidate and recovered old handler use the inherited remote Supabase `@2` alias. Identical source files do not freeze what that URL resolves to at a later deployment. The current package explicitly has no complete transitive lock. A source redeployment must not be represented as restoration of the exact old bundle or numeric deployment revision. The captured CLI deployment interface does not establish a version-26 restore operation.

**Exact missing action before Scope A:** establish a supported recovery artifact/method with resolved dependency and runtime/configuration provenance for the candidate and rollback target, then perform an approved **offline** restore exercise against the post-migration contracts. Exercise ordinary unicast and Live-campaign delivery, HMAC/replay rejection, quiet-hours/block/expiry suppression, duplicate/partial delivery reservations, recipient/provenance isolation and continued suppression of Connect delivery while disabled. Use synthetic data and a mocked external delivery sink; do not send real notifications. Verify private delegate ACLs and preserved durable jobs/terminal state. Report 46's forward-path tests do not establish this old-handler restore exercise.

If that evidence requires a source/dependency change, prepare a separately reviewed new candidate/package; **do not edit or regenerate the current frozen package**. Do not obtain a raw secret-bearing response and redact it afterwards. The recovered source reduces the work needed but does not justify `CONNECT_PUSH_ROLLBACK=VERIFIED`.

The candidate recovery sequence to validate is: disable **Connect** admission, event creation and delivery only, leaving unrelated shared push enabled; establish no unresolved owned Connect events/work; restore the verified old handler through a clean recovery workspace with attested dependencies/configuration and the same HMAC gateway; retain the installed SQL security/delegate/ledger structures; then verify restored source/configuration and non-Connect behaviour. Do not check out old source over the dirty worktree, disable all notifications, clear reservations/jobs or drop migration 6 as a shortcut. These steps are **not yet a tested restore procedure**.

## 3. Worker/webhook: local intent verified, operational configuration incomplete

Fresh local TOML/source checks confirm the following required behaviour:

| Endpoint | Required gateway behaviour | Required handler boundary |
|---|---|---|
| `connect-credentials`, `connect-revoke-consent` | `verify_jwt=true` | Existing bearer authentication, `auth.getUser` and authoritative RPC fences. |
| `connect-provider-worker` | `verify_jwt=false` | `x-connect-worker-secret` verified before backend construction, sweep or job claim. |
| `connect-webhook` | `verify_jwt=false` | Bounded raw-body HMAC verification using `x-signature` and `CONNECT_STREAM_API_SECRET` before reconciliation enqueue. |
| Shared `push-notifications` | Existing `verify_jwt=false` preserved | Existing event HMAC/replay/provenance/reservation enforcement; Connect delivery remains default off. |

Those are reviewed **source settings**, not assertions about newly deployed endpoints. Report 45 recorded the four Connect functions as absent. No new deployment/routing/secret-presence attestation exists.

**Scheduling requirement:** the worker sweeps then claims **one** job per authenticated POST. Current SQL prioritises due end jobs, uses 60-second leases and retries failed work through `available_at`. Its exponential expression reaches 256 seconds under the current capped exponent; these are retry mechanics, not a media-revocation bound. Durable rows alone do not execute termination.

Before any calls or owned cleanup obligations are admitted, approve and verify the invocation owner/mechanism, cadence, concurrency/drain capacity, secure header reference, restart/retry handling and pending/failed-job monitoring. The schedule must accommodate actual due work and application deadlines; a generic one-minute cron is not demonstrated sufficient. No numeric cadence or shutdown guarantee is approved by this report.

For **inert Scope A**, worker deployment may leave scheduling and invocation disabled, provided all admission gates/scope remain off and metadata checks establish no calls/jobs/occupancy. An active termination schedule is a **Scope B precondition**, not a reason to run a worker during installation. A worker POST is mutation-capable and can contact Stream; it is never a read-only health check.

**Routing requirement:** the intended Connect webhook is the staging `/functions/v1/connect-webhook` endpoint with the exact signed raw-body contract. The parser accepts fresh `call.*` events for a bound `betweener_connect:<UUID>` and wakes independent reconciliation; an event does not certify media cessation. Confirm app 1731011's supported signing/routing configuration without changing existing Live routes or exposing credentials. Deployment, route configuration and operational delivery are separate facts. Scope A may install the handler inert; no route activation or test callback is implicit. Before Scope B, verify routing or explicitly review a supervised sync alternative with its failure limits.

`CONNECT_WORKER_WEBHOOK_CONFIG` remains **INCOMPLETE** because secret/reference, routing and operational scheduling prerequisites are not attested. Its local authentication design is explicit; blanket gateway-authentication removal is not a remedy.

## 4. Exact safe verification steps for a later approved inspection

These are a scoped inspection specification, **not continuing access authority**. Stop any check whose target or secret-free result cannot be established.

1. **Identity first:** separately approve `get_project(id=xsgzxadwuxuziubglvps)` and require name `betweener-staging`, region `eu-north-1` and that exact ref. Pin it on every subsequent operation. Never list/query/connect the denied production project `jbyblhithbqwojhwlenv`, relink the repository or bootstrap the app to infer identity.
2. **Source/deployment state:** recheck the frozen hashes, exact migration history and catalog definitions before writes. Check Edge revision/source provenance and `verify_jwt` through deployment metadata, not invocation. If the current push revision differs from retained version 26, stop and obtain a newly reviewed rollback target. Compare all dependencies, not just function names.
3. **Names only:** approve a staging Dashboard view/export cropped to configuration **names/presence**, with target identity visible and values unrevealed. Verify the Report 45 required-name inventory, specifically `CONNECT_ENVIRONMENT`, `CONNECT_STREAM_APP_ID`, `CONNECT_STREAM_API_KEY`, `CONNECT_STREAM_API_SECRET`, `CONNECT_WORKER_SECRET`, existing Supabase key-helper references and push identity/HMAC/reference names. Do not use reveal/copy controls, decrypted Vault reads or the secret-list response containing `value`. Name presence does not prove correct values or provider-app binding; attest nonsecret identity mappings separately.
4. **Stream policy:** approve a secret-free Dashboard view/export or documented secret-free projection bound to **Betweener Staging / 1731011 / `betweener_connect`**. Check authentication/permission checks, exact voice/video/invited and ordinary/global grants, ended-call permissions, capture/egress restrictions, limits/lifecycle and notification/webhook routing metadata. Do not open credential-value views or use the secret-bearing `getApp` response. If no safe method is available, retain UNVERIFIED and prohibit provider operation/Scope B.
5. **Default-off database state, after installation only:** first discover the expected config columns through catalogs. Only then run the read-only SELECT below. Require one singleton row, every gate false and empty scope. `unconfigured` is the exact migration default; `staging` requires the separately approved default-off initialisation from Report 46. Any other environment is a stop.
6. **Operational prerequisites:** inspect scheduler metadata with boolean target checks and secret-reference presence; never retrieve raw cron commands/headers. Check endpoint deployment metadata and operator-attested routing, not HEAD/POST/test webhook requests. Missing scheduler/route remains explicit and inactive. No worker or application RPC may be invoked under a metadata-only approval.

```sql
BEGIN READ ONLY;
SELECT environment,enabled,voice_enabled,video_enabled,pre_match_enabled,
       provider_ready,end_block_enabled,notifications_enabled,
       cardinality(staging_test_users) AS allowed_account_count,
       staging_test_users='{}'::uuid[] AS scope_empty
FROM private.connect_config WHERE singleton;
ROLLBACK;
```

This query specification was not executed. Follow with approved tightly scoped counts for calls/jobs/occupancy/Connect events and catalog checks for RPC signatures, RLS/ACLs, both block guards, credential fences and push delegates. No Auth/profile lookup, token issuance or mutation-capable RPC is needed to inspect the installed default-off state. Actual non-allowlisted behavioural rejection remains a separately authorised test, not a conclusion from catalog metadata.

## 5. Stop conditions and the two distinct decisions

**Scope A — NO-GO for the frozen full installation.** The unresolved shared-push recovery/dependency conditions are technical blockers. Before reconsideration, require the tested recovery evidence in section 2, fresh approved target/parity evidence, reviewed shared relationship/push impact and an exact write proposal covering only the six files, their narrow history registrations, approved Edge changes and any explicit default-off environment initialisation. Keep source switches, database gates, notification delivery and account scope off; no worker schedule, provider routing, accounts or calling activation is implicit.

Stop before any later write on wrong identity, hash drift, changed push revision, unavailable recovery artifact, unresolved dependencies, unexpected migration prefix/definitions, missing applied prerequisite, unsupported gateway/JWT configuration, enabled gate/nonempty scope or unowned work. No broad migration push, already-applied push replay, unrelated Live history repair, weakened security rollback or production access is permitted. If a partial SQL prefix commits, retain its security/durable obligations and compare state before proceeding; never blindly reapply or delete jobs. Approval of a smaller subset would require a **separate concrete proposal**, not silent omission of shared-push work from this package.

**Scope B — NOT AUTHORISED.** Only after Scope A passes its post-installation checks may a separate scope approve two authoritative staging account/profile/installation bindings, existing Android/iOS compatibility verification, operational cleanup/routing, current Stream policy and then bounded voice testing. Account selection, native build compatibility and microphone access are not prerequisites for installing inert infrastructure; they are mandatory before activation. Scope A cannot imply Scope B. No extra account, client-only consent bypass, video publication or real-user call is allowed.

Disabling flags denies new activity but does not disconnect existing media. No successful installation, recovered push source, end acknowledgement or local test advances the remote-revocation or M2A/M2B gates.

## 6. Preservation and conclusion

New work is limited to this report and local ignored verification/source-recovery artifacts under `tmp/connect-deployment-final-gate-47/`. No package generator, migration, Edge handler, Docker/database runner or deployment command was executed. Prior reports, source, manifests, receipts and consumed experiment approvals remain unchanged. `final-verification.json` records preservation and artifact hashes. The new archive is source-only evidence, not an approval or restored service.

The smallest next action is a separately approved **push recovery/dependency closure and secret-free metadata verification scope**. No deployment is recommended until the critical recovery requirement is satisfied. This is a technical NO-GO, not a request to waive the requirement.

```text
CONNECT_STAGING_INFRASTRUCTURE_DEPLOYMENT = NO_GO
CONNECT_PUSH_ROLLBACK = INCOMPLETE
CONNECT_WORKER_WEBHOOK_CONFIG = INCOMPLETE
CONNECT_STREAM_POLICY = UNVERIFIED
CONNECT_CALLING_ACTIVATION = NOT_AUTHORISED
CONNECT_REMOTE_REVOCATION_BOUND = UNVERIFIED
CONNECT_M2A_SECURITY_GATE = BLOCKED
CONNECT_M2B_READY = BLOCKED
STAGING_MODIFICATIONS = NONE
PRODUCTION_MODIFICATIONS = NONE
```
