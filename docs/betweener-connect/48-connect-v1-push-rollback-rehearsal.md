# Connect V1: shared-push forward and rollback rehearsal

Date: 2026-11-01. **The local source/SQL rollback exercise passes.** The Connect-aware handler and the retained v26 handler both work with the six reviewed migrations installed and Connect disabled. No handler or migration compatibility repair was required. A separately pinned recovery proposal is available for review; it does not replace the frozen M3.3 package or authorise deployment.

This closes the local rehearsal part of [Report 47](47-connect-v1-staging-deployment-go-no-go.md). Hosted identity, configuration and deployment recovery remain unverified. The [new recovery addendum](connect-v1-push-recovery-candidate-48.json) explicitly distinguishes recovered v26 **source** from its unavailable original runtime bundle.

## 1. Frozen evidence and exact changes

- Repeated all **66 hash comparisons / 41 distinct paths**, including the six migrations, five Edge source/configuration closures and Report 46's freeze. Zero differences. Base package SHA-256 remains `4769fc763db17990a3d37018e69a4150458b0ef89e87aa5ba14fb2cd13582ed3`.
- Verified the Report 47 recovery archive and all **five v26 source hashes** against the retained deployment records. Recovered entrypoint SHA-256 remains `2b21087151fe5736861a8964b615323e5ad0c2b95f90181c1178ea48bc8169f7`.
- Reports 45–47, the six historical migration files, deployed-source records, the frozen package and consumed experiment records were not rewritten. No new migration is proposed.
- New implementation is test tooling only: `scripts/test-connect-push-rollback-local.cjs`, `scripts/test-connect-push-edge-artifacts.cjs`, `scripts/lib/connect-push-rehearsal/{prepare,baseline,edge,artifacts}.cjs`, `scripts/lib/connect-push-rehearsal/runtime.mts`, and `__tests__/connect-push-rollback.regression.test.cjs`. The two new documents are this report and the recovery addendum. No existing product source was changed.

Receipts and recovery artifacts are under `tmp/connect-push-rollback-48/`. `frozen-verification.json`, `rehearsal-results.json`, `edge-artifact-results.json`, `archive-verification.json` and `final-verification.json` are the principal records. These files are local evidence, not execution approvals.

Final byte preservation: **2,493/2,493 pre-existing workspace files**, **555/555 protected historical records**, and **52 Report 46/47 evidence records** match. Only the ten new repository files listed above were added; unrelated dirty work was preserved.

## 2. Environment provenance and isolation limits

| Layer | Actual environment / boundary |
|---|---|
| PostgreSQL | Existing local image `public.ecr.aws/supabase/postgres:17.6.1.003`, PostgreSQL 17.6. Empty schema-only disposable databases named for each test process. No application rows, users or Vault contents copied. |
| Baseline | Same reconstruction approach as Report 46. All **16 measured staging function fingerprints** match before the six-file delta. The known local reservation-definition difference is restored from its retained applied-prerequisite definition only inside the clone. |
| Campaign coverage | The local baseline lacked the recipient table and two campaign routines. Reconstructed those exact table/ACL/function fragments from `20261016165616_live_broadcast_authority_and_step_up.sql` only in the clone. Report 45 did not retain their staging fingerprints; this is repository-contract testing, not attested staging campaign parity. No broad Live migration was applied. |
| REST | Owned ephemeral PostgREST `v13.0.5`, loopback-published only. A local gateway converts a synthetic secret-key request into the disposable REST server's independently minted service-role JWT. This tests actual SQL/RPC calls, not hosted secret-key gateway acceptance. |
| Handler/SQL execution | Windows Deno **2.5.4**, unchanged forward/v26 handlers, actual bundled Supabase client and helpers. Explicit loopback-only network permissions, `--deny-import`, `--no-remote`, `--no-npm`, `--no-prompt`, and explicit denial of the Expo host. No project `.env` is loaded. |
| External delivery | Expo `fetch` is intercepted before network access and returns synthetic tickets. Faults inject 503 or terminate the process. The normal SQL dispatcher is disabled except in the signing case, where **clone-local `net.http_post` is replaced first** with a recording sink. Its original measured dispatcher then signs an envelope using newly created, synthetic local Vault material. No real push or HTTP dispatch occurs. |
| Cached Edge artifacts | `public.ecr.aws/supabase/edge-runtime:v1.77.4`, image `sha256:ad45164b7548bf5820ed7be714789c17ac2865edce79a09cfb4c3756c3d365a8`; reports Edge runtime 0.1.0 / Deno **2.1.4**. Both artifacts bundle, boot, reject bad HMAC and reject GET inside containers with **`--network none`**. HTTP probes execute inside those containers; no host port is published. |

The full SQL/delivery matrix runs in the loopback Deno environment; the cached Edge checks establish offline bundle resolution, boot and authentication rejection, not the full SQL matrix under the hosted runtime. Neither environment attests the current hosted engine or its gateway.

The host and existing PostgreSQL container are **not claimed to have global external-egress isolation**. Safety comes from the scoped test paths, intercepted delivery/dispatch, handler permissions and network-disabled Edge containers. Public version-pinned std files were retrieved from `deno.land` during dependency preparation, and public documentation was consulted. No hosted Supabase project, Stream application, production service or notification destination was contacted. No hosted credential values were retrieved. The existing local database helper uses local Docker database credentials process-only; they are not recorded.

Both disposable database runs and all owned REST/Edge containers were removed. The existing app database still lacks Connect tables; no rehearsal migration was applied to it.

## 3. Dependency compatibility and the new recovery proposal

The inherited `https://esm.sh/@supabase/supabase-js@2` cannot establish the old hosted resolution. It is **not silently reused** for this recovery proposal. The unchanged source import is explicitly mapped to a self-contained upstream **2.110.7** UMD distribution already in the local npm cache, with a named ESM export appended in a separate derivative. The upstream bundle is retained separately and hashed. The old std import maps to vendored, unmodified **0.168.0** sources. No fake Supabase client substitutes for SQL calls.

| Dependency / contract | Result | Limit |
|---|---|---|
| All five original v26 source files | Hash verified, unchanged | Original hosted numeric revision/bundle is not restored locally. |
| Supabase JS 2.110.7 bundled client | Both handlers execute real REST/RPC operations | A **new reviewed resolution**, not proof of the original mutable URL's contents. Other SDK features are outside the tested notification path. |
| std 0.168.0 closure | 11 upstream modules; offline execution and Edge bundling pass | Strict checking with Windows Deno 2.5.4 has **11 inherited type/API errors**, described below. |
| Candidate local Connect helper | Forward handler loads it | Removing required helpers makes actual offline startup fail. v26 does not require the Connect helper. |
| Public claim/reservation signatures | Compatible with both handlers | Private renamed delegates remain non-callable by service/user roles. |
| Per-function gateway | Recovery config explicitly retains `verify_jwt=false` and in-handler HMAC | Actual hosted gateway/environment configuration still requires attestation. |

The base dependency receipt lists **14 hashed files**: 11 std modules, the upstream SDK bundle, its ESM derivative and the base import map. Recovery workspaces add the exact handler/helpers, function-local `deno.json`, minimal single-function `supabase/config.toml` and license metadata. Attempts to silently regenerate an existing dependency freeze, substitute an unreviewed function version, change hashed contents or escape the artifact directory are rejected by regression tests.

Final read-back-verified ZIPs:

| Artifact | Members | SHA-256 |
|---|---:|---|
| `forward-pinned-recovery.zip` | 23 | `ce1a78b0a4dc798e8eb1d6ecb9fb94e2aefe8ad894ef98cfb65402ae93f3f600` |
| `v26-pinned-recovery.zip` | 22 | `3327c4df40049897e62b8a630eeb6547c00d37b297413c94cdfc4cb0aace5f4d` |

Both are in the receipt folder. Their new offline Edge bundle hashes are respectively `b0231fab13b2f3c74d5ce225f38f6061468b1374895867044cade2f7bf063584` and `06f343c9a5f022971ce418bfa0a54cfc1169abd4eef0af59b80e3407a8b43a2e`. Neither claims to equal the unavailable historical v26 bundle digest from Report 45. A later source restore creates a **new deployment revision**; it does not reset the provider's version number to 26.

Supabase documents function-local dependency configuration and import mapping in its [dependency guide](https://supabase.com/docs/guides/functions/dependencies). The cached runtime successfully consumes these artifacts without fetching dependencies. Hosted CLI/server bundling and restoration have not run.

## 4. Forward and rollback results

The main rehearsal applies **exactly the frozen six files, in order**, then leaves them installed for all v26 tests. It does not replay push prerequisites as deployment changes or downgrade SQL. Synthetic notification fixtures are used with all seven Connect gates false and the account scope empty.

Each handler passes 22 assertion groups. Six additional groups exercise the rollback handoff, crashes, concurrent reservations and final disabled state: **50/50 total**.

| Contract exercised on both handlers | Actual result |
|---|---|
| SQL-generated raw-body HMAC envelope | The retained dispatcher signs with synthetic local Vault material; the actual handler verifies and delivers to the mock sink. Missing signing configuration keeps work pending and produces no dispatch. |
| Ordinary canonical unicast | Delivers to its intended synthetic recipient while Connect is disabled. Canonical data is preserved; client-injected message contents are rejected. |
| Existing Live campaign | Actual campaign/token RPCs select only canonical recipients; token paging, reservation and completion execute. Forward and restored v26 both succeed. |
| Signed malformed/oversized requests, wrong HMAC/key, expired signature | Rejected without claiming the event or sending. |
| Duplicate/delayed events and simultaneous handler requests | One claim/delivery; duplicates rejected. Concurrent SQL reservation also returns one token once. |
| Preferences, quiet hours, either-direction account block, expired event | Canonical SQL suppresses or expires; no delivery. |
| Cross-environment/project, quarantined or unverified destination; missing installation | Ineligible destinations excluded. The actual provenance-shape constraint rejects a verified token with a missing installation. |
| Pending/malformed Connect event types | SQL wrappers suppress them with gates disabled, before either handler can fall through to legacy delivery. Setting the Edge Connect flag alone cannot bypass the database gate. |
| Reservation privacy / deduplication | A token owned by another user cannot reserve a unicast event; repeated token IDs do not duplicate reservations. |
| Mock delivery failure | Handler returns failure, event becomes failed, reservation remains. Retrying does not duplicate delivery. |
| Public/private SQL interfaces | Old handler arguments remain compatible. Renamed bypass delegates remain inaccessible to anon, authenticated and service roles. |

**Actual rollback sequence tested:** exercise the forward handler, including a simulated delivery failure; stop its process; start the unchanged v26 source with the same explicit dependency resolution and migrated database. A legacy notification queued before replacement is delivered. A queued Connect notification is suppressed. Neither record nor the SQL wrappers/reservation ledger is deleted. Normal unicast and campaign checks are independently repeated on restored v26.

**Crash boundary:** terminate v26 before reservation, after reservation and after mock delivery. Restart it against the same database. The event remains processing; reservations survive where made; a duplicate request cannot cause replay. The real maintenance function later marks an artificially aged claim `failed / processing_claim_abandoned`. This proves preservation and at-most-once handling, **not guaranteed eventual delivery**. A crash before sending, a failed Expo request after reservation, or an ambiguous post-send result can lose a notification. No new retry or deletion policy was invented to make rollback look successful.

Existing worker tests separately exercise retryable reconciliation and failure acknowledgement. The real disposable End Call & Block SQL suite verifies stale leases, interruption/retry preservation and ACK fencing. Push claims and Connect provider-job leases are different mechanisms; their recovery guarantees are not interchangeable.

**Important rollback precondition:** all authoritative Connect notification/admission gates must be off before restoring v26, with scope empty and no in-flight Connect deliveries or unresolved owned cleanup. v26 does not understand the new Edge Connect switch by itself. This rehearsal does not certify v26 under enabled Connect SQL or erase an already-reserved/in-flight notification. Flag disablement cannot recall a dispatched push or terminate established media.

## 5. Failures, repairs and test totals

No confirmed product handler/SQL incompatibility was found under the tested default-off contract. No product source, historical SQL, push-v26 original or frozen package was repaired.

Initial failures remain recorded as failures in their receipts: incomplete synthetic Live creator binding, a permission-state assertion, a missing-installation fixture violating the genuine database constraint, and insufficient clone-local privileges to install the pg_net test sink. These were corrected in test setup/assertions. The signing test installs the sink using the existing local administrator **only in the PID-bound clone** before restoring the original dispatcher. The final matrix passes without skipped/TODO cases.

The first Edge probe attempted host port publishing on an internal network. The final check uses `network=none` with in-container HTTP probes. This strengthens isolation and successfully exercises the actual built artifact. An obsolete runtime import-map flag was rejected during exploration; final bundling uses function-local `deno.json`.

| Actual final run | Result |
|---|---:|
| `node scripts/test-connect-push-rollback-local.cjs` | **50/50**, 0 failures |
| `node scripts/test-connect-push-edge-artifacts.cjs` | **6/6**, 0 failures; both final artifacts reverified |
| Node tests: new rollback, push security/compatibility/expiry/provenance, Connect notification contract | **49/49**, including **10 new permanent regressions** |
| Node tests: Connect foundation, provider observation, End Call & Block | **83/83** |
| Node tests: staging preparation and delegated-host notifications | **11/11** |
| `node scripts/test-connect-end-block-local.cjs` | **22/22** actual disposable SQL/REST checks |
| Relationship suite invoked by each disposable runner | **88/88 unique assertions**, passed in each run; not counted twice as unique coverage |
| Root `tsc --noEmit` | PASS |
| ESLint: eight new source/test files | PASS, 0 errors/warnings; isolated config uses the repository TS parser for `.mts` |
| Live and EAS isolation scripts | PASS; local configuration checks only |
| Strict Deno 2.5.4 `check` of the local runtime seam and vendored legacy std | **FAIL: 11 errors**, all in std HTTP server's removed `Deno.HttpConn`, `RequestEvent`, `serveHttp` or legacy TLS typing |

The three Node selections total **143/143**, with zero skipped/TODO tests. Functional/SQL/artifact results are green; the separate strict legacy-dependency type check is **not green** and is not counted as an accepted test. Runtime execution passes in Windows Deno 2.5.4 and the cached Edge Deno 2.1.4. Do not suppress those errors or claim modern-Deno static compatibility. A future requirement to upgrade this std dependency or change the hosted runtime needs a separately reviewed candidate and another compatibility check.

Exact Node selections:

```powershell
node --no-warnings=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test __tests__/connect-push-rollback.regression.test.cjs __tests__/push-notification-security.regression.test.ts __tests__/push-notification-compatibility.regression.test.ts __tests__/push-notification-expiry-lifecycle.regression.test.ts __tests__/push-environment-provenance.regression.test.ts __tests__/connect-notification-contract.regression.test.cjs
node --no-warnings=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test __tests__/connect-foundation.regression.test.ts __tests__/connect-provider-observation.regression.test.ts __tests__/connect-end-block.regression.test.cjs
node --no-warnings=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test __tests__/connect-staging-preparation.regression.test.cjs __tests__/live-delegated-host-notifications.regression.test.ts
```

Dependency preparation is separately explicit: `node scripts/lib/connect-push-rehearsal/prepare.cjs --resolve-public-dependencies` is a **one-time** public-library resolution step and refuses to overwrite an existing freeze. Ordinary preparation/testing verifies the existing closure without downloads. `artifacts.cjs` stages only new recovery workspaces. Never use a corrupted closure as permission to regenerate it silently.

## 6. Verified local recovery procedure and later deployment command

Local restoration is verified for the stated scope. The later hosted procedure remains a proposal:

1. Re-attest exact staging identity and current push revision. Stop on drift from the reviewed source/dependency/configuration baseline. Retain a fresh recovery target before any shared push replacement.
2. Verify all 66 base comparisons, all recovered source hashes, recovery manifests and ZIP member hashes. Review the **new pinned addendum** separately; do not regenerate or substitute the Report 46 freeze.
3. Keep all Connect database gates false, allowlist empty and Edge delivery disabled. Establish no in-flight Connect sends or cleanup obligations. Preserve ordinary shared push delivery and its existing HMAC/provenance configuration.
4. Extract the reviewed v26 recovery ZIP into a clean, owned workspace containing its `supabase/` and `vendor/` trees. Do not check out old files over the dirty application tree or use a stale mutable remote alias.
5. Restore the **single named function** with the explicit staging ref and artifact workdir. The retained pinned CLI help documents these arguments; the command below was **not executed**:

```powershell
# FUTURE WRITE: separate owner approval and verified recovery-root path required.
& 'C:\Projects\betweener-app\scripts\supabase-staging.cmd' functions deploy push-notifications --project-ref xsgzxadwuxuziubglvps --workdir '<verified-v26-recovery-root>' --use-api --no-verify-jwt
```

The forward equivalent uses the separately reviewed forward recovery root. Never omit the function name, use `--prune`, relink a project or broad-push migrations. The staging wrapper checks the repository link; it does **not replace** fresh identity verification or validation of the explicit ref/workdir. No eszip-upload/version-reset capability is assumed.

6. Read back deployed source/dependency/configuration provenance and `verify_jwt=false`, preserving handler HMAC, key references, destination provenance and unrelated notification settings. Leave the six SQL migrations/wrappers, deduplication reservations, terminal state and provider jobs installed. Do not clear or replay failed/processing rows to manufacture success. An ambiguous deployment or mismatched returned source is a stop/recovery condition, not permission to repeat writes blindly.

The local ZIPs and eszips are new recovery artifacts. Actual CLI/server bundling, deployment atomicity, hosted rollback, production-scale backlog and real push delivery are **NOT VERIFIED** by this rehearsal.

## 7. Minimum outstanding staging conditions and decision

**Updated recommendation: CONDITIONAL for inert Scope A installation using the separately reviewed pinned push addendum.** Report 47's local handler/SQL recovery blocker is resolved for this explicit new recipe. The original package's mutable dependency resolution has not been silently amended; deployment of that unamended package remains a NO-GO. No account binding, call activation or provider test follows from the local result.

Before any later installation approval:

- Fresh, separately approved secret-free metadata must verify **betweener-staging / `xsgzxadwuxuziubglvps` / eu-north-1**, current migration prefix/contracts and current shared push recovery revision. Production is excluded. Stop if the retained v26 baseline is no longer current without a new review.
- Review and freeze this new dependency/configuration addendum with its known strict-type-check limitation and intended supported Edge environment. Attest installed source/dependency provenance after any later deployment; local eszip bytes are not assumed equal to a hosted builder's output.
- Attest **names/presence only**, via a Dashboard view or guaranteed secret-free projection: existing Supabase admin-key references; `CONNECT_ENVIRONMENT`, `CONNECT_STREAM_APP_ID`, `CONNECT_STREAM_API_KEY`, `CONNECT_STREAM_API_SECRET`, `CONNECT_WORKER_SECRET`; `CONNECT_NOTIFICATIONS_ENABLED`; shared push delivery/environment/application/EAS fields and current/previous HMAC key-ID/secret-reference/expiry fields. Do not call a value-bearing secret-list endpoint or retrieve decrypted hosted Vault content. Presence alone does not establish correctness. Preserve shared delivery rather than disabling all push.
- Explicitly retain gateway JWT checks on user-facing credentials/revoke-consent. Worker uses `verify_jwt=false` plus `x-connect-worker-secret` before backend work. Webhook uses `verify_jwt=false` plus bounded signed raw-body verification through `x-signature`. No invocation is a read-only health check.
- Inert Scope A can leave worker invocation/scheduling and provider webhook routing inactive, with no calls/jobs/occupancy. **Before Scope B**, approve an operational scheduler/invocation owner, capacity, retries and monitoring: worker claims one job per invocation, has 60-second leases and the existing capped retry interval; no scheduling cadence or media-revocation bound is inferred. Verify exact app-1731011 webhook routing/signature configuration without changing Live routes or sending callbacks under metadata authority.
- Before provider use, obtain a secret-free policy attestation for **Stream staging app 1731011 / `betweener_connect`**, authentication/permission checks, expected member/global grants, ended-call admission and restricted media/lifecycle settings. Do not fetch secret-bearing application responses then redact them. Policy remains UNVERIFIED; no provider operation ran here.

The six migration applications/history registrations remain exactly the separate proposal in [Report 46](46-connect-v1-staging-rollout-proposal.md). No seventh repair migration is needed from this rehearsal. Test-account selection, native-build compatibility and bounded two-person voice testing remain **separate Scope B** decisions after infrastructure checks. Preserve the historical B3 INCONCLUSIVE verdict, Report 18's negative result and all blocked release gates.

```text
CONNECT_PUSH_FORWARD_REHEARSAL = PASS
CONNECT_PUSH_V26_ROLLBACK_REHEARSAL = PASS
CONNECT_PUSH_SQL_COMPATIBILITY = PASS
CONNECT_STAGING_OPERATIONAL_PREREQUISITES = INCOMPLETE
CONNECT_STAGING_DEPLOYMENT = NOT_AUTHORISED
CONNECT_M2A_SECURITY_GATE = BLOCKED
CONNECT_M2B_READY = BLOCKED
PRODUCTION_MODIFICATIONS = NONE
```

Staging modifications, provider writes, actual pushes, builds, OTA and calling activation: **NONE**. Local passes describe the tested source recovery contract; they do not establish universal delivery, media cutoff or hosted rollback guarantees.
