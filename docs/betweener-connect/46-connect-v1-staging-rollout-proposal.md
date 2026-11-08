# Proposed Connect infrastructure installation: staging only

Date: 2026-11-01. References: [Report 46](46-connect-v1-staging-deployment-preparation.md), [exact package](connect-v1-m3-3-staging-deployment-package.json). **Proposal only. Execution, account binding, calling and device tests are not authorised.**

Target: **betweener-staging / `xsgzxadwuxuziubglvps` / eu-north-1**. Production `jbyblhithbqwojhwlenv` is denied. No link change, broad migration push, Live history repair, provider policy change or native rebuild is included.

## Exact six-file SQL delta

Paths are under `supabase/migrations/`; order is mandatory. All hashes are SHA-256.

| Order | File | Hash |
|---|---|---|
| 1 | `20261028064220_relationship_acceptance_authority.sql` | `d170a168e1e3c3d91b1d36b62bbc33bb298072586463876456cd7f2f458aff23` |
| 2 | `20261028074908_connect_v1_foundation.sql` | `ad04646a36ff2061e48a775a43051d435744adb71315c8d67139212f52d237d7` |
| 3 | `20261028143424_connect_m2a_revocation_cleanup.sql` | `25c6f3e9de7b2f75e65f854a3cbadf222d5e66cd33f41979b861af957b05528e` |
| 4 | `20261029081013_connect_forensic_repair_1.sql` | `8fbeb7282a80d9515e2ce457413979a3279bbff69267e57c07564939bcd9a8b3` |
| 5 | `20261031035826_connect_end_block_local_foundation.sql` | `77a518d539d6960ca22a8110e3eb41836ab275931ee5e19d608a97b0fd5b6b2d` |
| 6 | `20261031191352_connect_m3_1_intent_and_notifications.sql` | `cde57817e48dbaec274413d50cc64af3df03ed5ff11d8042f68826b73ae737e0` |

The eight shared push prerequisites are already applied according to Report 45 and are **not deployment inputs**. The rehearsal reconstructed some baseline definitions locally; that does not authorise replaying them on staging.

## Application method and history bookkeeping

Proposed narrow method: after fresh approved identity/parity verification, apply each **unchanged complete file individually in the staging SQL editor**, preserving its own transaction. Verify the committed catalog/security changes before continuing. This avoids a broad CLI walk through unrelated pending migrations. Migration 1's shared relationship/Intent/block/account-merge effects require explicit acceptance; Connect flags do not scope them to two accounts.

SQL-editor execution does not by itself establish migration-history bookkeeping. The later write approval must **also** cover registration of only each just-applied and verified version using the repository staging wrapper. Prepared argument arrays are in the package. Example, **not run**:

```powershell
.\scripts\supabase-staging.cmd migration repair 20261028064220 --project-ref xsgzxadwuxuziubglvps --status applied
```

Use that one-version pattern for each of the six exact versions, only after its definitions are verified. This records a newly applied file; it must never mark an unapplied file or touch the unrelated `2026102710...` Live entries. These are explicit history **writes**, not read-only checks. If history/catalog/prefix is ambiguous, stop instead of repairing or reapplying automatically. The pinned CLI's help confirms these arguments; [migration-history semantics](https://supabase.com/docs/reference/cli/supabase-migration-repair).

Each file commits independently. Do not wrap the six files in an assumed all-or-nothing outer transaction, generate an approval ledger, or substitute migration names/versions silently. The permission needed later is the exact six SQL applications plus these six narrowly scoped history registrations, subject to fresh absence checks.

## Edge package

All transitive **local** source/configuration hashes and remote specifiers are in the JSON package. Entrypoint hashes:

| Function | SHA-256 | JWT gateway |
|---|---|---|
| `connect-credentials` | `78853fa464bf65d221a88aaa7044149ec3641c76c1038ae6d65f42b4b4a8e2fc` | true |
| `connect-provider-worker` | `d9f66367c43884d4d1d3c5ef18fba8240406bf3d899ad54e4de92c75d2d61950` | false; dedicated worker secret |
| `connect-webhook` | `de8ae199206068721a2b10dcc58bb5ac6163c32881396be92f32d4255e6d1369` | false; raw-body Stream HMAC |
| `connect-revoke-consent` | `e4d628882da93292e91a1b5375817f3f9448cbf1ef20c2311fffeb00569bc051` | true |
| `push-notifications` | `b5e2f0f15a86450535c32934006ef5c0c19c7fc7a3b4ec800a1cc8e5d7589d16` | false; existing event HMAC |

Prepared per-function arguments, **not executed**:

```powershell
.\scripts\supabase-staging.cmd functions deploy connect-credentials --project-ref xsgzxadwuxuziubglvps --use-api
.\scripts\supabase-staging.cmd functions deploy connect-provider-worker --project-ref xsgzxadwuxuziubglvps --use-api --no-verify-jwt
.\scripts\supabase-staging.cmd functions deploy connect-webhook --project-ref xsgzxadwuxuziubglvps --use-api --no-verify-jwt
.\scripts\supabase-staging.cmd functions deploy connect-revoke-consent --project-ref xsgzxadwuxuziubglvps --use-api
.\scripts\supabase-staging.cmd functions deploy push-notifications --project-ref xsgzxadwuxuziubglvps --use-api --no-verify-jwt
```

Never omit the function name or use `--prune`. Handler authentication remains mandatory. The optional consent fast path is not required for the initial matched voice pilot; it can be omitted from a smaller approved install, with that remaining parity gap recorded. Credentials/worker and updated push are needed for voice plus standard notifications; webhook reconciliation or an expressly reviewed sync path must be ready before testing.

Before replacing push version 26: archive and verify its source/config/bundle for rollback, compare current deployment drift, and review the inherited `@supabase/supabase-js@2` remote alias/bundle resolution. Report 45's old bundle hash is `28d351d383d76ab687daf56c90f2293b78db3905694bf330c92979d3d64505d9`; it is not an available rollback binary/archive. No shared dependency upgrade or Live configuration change is implicit in these commands.

## Default-off state and verification

After SQL, defaults must be `environment=unconfigured`, all seven database gates false and `staging_test_users={}`. A separately approved initialisation may set **only** environment to staging after verifying the entire default-off state; that configuration write must appear explicitly in the execution approval. Do not populate accounts. Final installed state:

```text
DB environment = staging, after separately approved initialisation
enabled = false
voice_enabled = false
video_enabled = false
pre_match_enabled = false
provider_ready = false
end_block_enabled = false
notifications_enabled = false
staging_test_users = {}
CONNECT_NOTIFICATIONS_ENABLED = absent/false
Source ui/nativeRuntime/videoTransport/nativeSafetyOwner/endCallAndBlock = false
Worker schedule/invocation = not activated
Stream routing/policy = unchanged
```

Metadata-only post-deployment verification must confirm exact target/ref/region, six history entries and source-defined RPC arguments/security definitions, RLS/ACL/constraints, both block guards, lease/ACK/outbox contracts, dual admission fences, private push delegates, deployed source/bundle provenance and per-function gateway values. Verify no calls/jobs/occupancy/Connect notifications have appeared; do not invoke workers or mutation-capable RPCs as health checks.

Local rehearsal proves default-deny and non-allowlisted rejection for synthetic fixtures. **Actual authenticated staging rejection is a separate behavioural check**, requiring approved existing identities and explicit request authority; catalog/presence checks cannot be reported as that test. No credentials, admission, account lookup or provider call is part of this installation proposal.

## Remaining approvals and stop conditions

Before associated operations: obtain safe names-only secret/configuration attestation; secret-free Stream app 1731011/type/routing evidence; worker cadence/ownership and webhook design; standard push provenance/delivery prerequisites; exactly two approved staging accounts; and installed Android/iOS compatibility. No new build is proposed without a demonstrated missing/incompatible native module, entitlement/permission or signing requirement.

Stop on wrong project, source/baseline drift, unexpected applied/partial migration, missing shared prerequisite, unsupported gateway/JWT setting, unavailable push rollback evidence, unreviewed dependency resolution, nonempty scope/enabled gate, unowned work, unexpected notification/admission or any required operation outside approval. Do not expand this package to resolve Live history drift or provider policy.

On failure: keep new admission/delivery off, retain the committed security/schema prefix, durable end obligations and evidence. Do not restore weaker relationship authority, drop cleanup tables, clear quarantine, delete jobs or reset ledgers. A reviewed forward fix is preferred. An approved push rollback is permitted only after ensuring Connect remains disabled and outstanding work cannot be lost. Disabling flags does not terminate established SFU media.

The next approval can cover **infrastructure installation only**. Account binding, restricted feature activation, native microphone access and a later synthetic two-person call pilot require their own concrete approvals. M2A/M2B stay BLOCKED; remote revocation remains UNVERIFIED.
