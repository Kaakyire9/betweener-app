# Relationship Gist 2.0 — Dedicated Staging Preflight

Audit date: 2026-10-11 (Europe/London)
Authorization: read-only staging inspection
Repository: `C:\Projects\betweener-app`

## Executive result

`STAGING_PREFLIGHT = CONDITIONAL_PASS`

Dedicated staging identity, the 231-entry remote migration baseline, live baseline schema, privacy-safe data aggregates and EAS provenance are verified. The five Milestone migrations are the only unapplied local migrations and remain in the required order. No remote write, deployment or real provider request occurred.

Conditions before deployment authorization:

1. Stabilize and review a release candidate; the current 136-entry dirty worktree is not reproducible deployment input.
2. Restore a staging-equivalent snapshot and prove the five exact migrations, security tests and aggregate preservation before touching staging.
3. Regenerate and review `supabase/types/database.ts` after the target schema contains Gist 2.0.
4. Keep every mobile Gist flag and the server AI flag/policy disabled through database and function verification.
5. Complete physical-device QA and the separately authorized, capped real-provider canary before feature activation.

## Repository baseline

| Evidence | Verified value |
| --- | --- |
| Branch | `feature/betweener-live` |
| HEAD | `f560559b6a3ef09ecb7fd7dfadf9bd742a88184a` |
| Worktree before report creation | Dirty, 136 porcelain entries |
| Local migration files | 236 |
| Supabase link file | `xsgzxadwuxuziubglvps` |
| Milestone 5 report | `docs/relationship-gist-2/local-release-validation-milestone-5.md` |
| Milestone 5 report SHA-256 | `6B10AF088B36F30989F2E36ADEA0B1169F5AF0E0342C62993269FB9F9A0454A0C` |

The Gist 2.0 work remains mixed with pre-existing uncommitted Circles, Live, authentication, admin and staging work. The audit changed none of those files. The Gist implementation includes modified tracked files plus untracked mobile modules, tests, Edge Function files, five M1–M4 migrations and documentation. The authoritative file list is the read-only `git status --porcelain=v1 -uall` captured during this audit.

The five M1–M4 migrations are the final five files in lexical order. Their zero-based inventory positions are 231–235. No duplicate migration version was found.

| Order | Migration | SHA-256 |
| --- | --- | --- |
| 1 | `20261010120000_relationship_gist_editorial_capability_hardening.sql` | `0092210F46A61B74DC49EA142E8D8B6D761EB1506690032CF2C303B0BBB4F5F7` |
| 2 | `20261010121000_relationship_gist_reader_state_idempotency.sql` | `61E976B1B03C14E1FD90700120D6A44BE4196499996E6CB81877AAB4C078660A` |
| 3 | `20261010130000_relationship_gist_editorial_v2.sql` | `972E90BE9D161B2BE717BE35CDE261E96FE166F1A26C6CF63FAF62ADACDF4A0C` |
| 4 | `20261010140000_relationship_gist_ai_editorial_studio.sql` | `5F13C20D090982700CC44963A0A85715AC5CD05F75FBB72D02351520E3D1D41F` |
| 5 | `20261010150000_relationship_gist_reader_engagement.sql` | `1216CD8D3340ACEA6EF13C99E364E528E92E0AB83027C389DDD085DE35E27E64` |

The immediately preceding migration is `20261008090000_relationship_gist_staging_fixtures.sql`. It is also untracked locally and contains four deterministic staging-only published Gists guarded by `private.push_application_config` and an existing internal-admin profile.

## Dedicated staging identity

| Surface | Result | Evidence |
| --- | --- | --- |
| EAS project | PASS | EAS API: `@kaakyire9/betweener-staging`, ID `7f38a835-2da7-419b-a20b-e1a12e021547` |
| Supabase project | PASS | Link, Management API queries and the server-owned application row resolve `xsgzxadwuxuziubglvps` / staging / dedicated EAS project ID |
| `APP_VARIANT` | PASS | Every non-production profile inspected uses `staging`; production uses `production` |
| EAS environment | PASS | Staging profiles use `preview`; production uses `production` |
| iOS bundle | PASS | `com.aduboffour.betweener.staging` |
| Android package | PASS | `com.aduboffour.betweener.staging` |
| Updates URL | PASS | `https://u.expo.dev/7f38a835-2da7-419b-a20b-e1a12e021547` |
| Store staging channel | PASS | `testflightStaging` and `playStaging` resolve `staging` |
| Preview Supabase URL | PASS | EAS preview variable resolves `https://xsgzxadwuxuziubglvps.supabase.co` |
| Production leakage in EAS archive | PASS | `.easignore` excludes `.env*`; local production `.env` is untracked and excluded |

`scripts/verify-eas-project-isolation.cjs` passed, including fail-closed unknown variants and six negative cross-environment cases. Android and iOS variant verifiers passed. `scripts/verify-revenuecat-staging.cjs` also passed: iOS isolation, Spark Store configuration, Android isolation and Android source all PASS; production resolution is UNCHANGED. An initial mistyped filename was not found and had no side effects.

## EAS build and OTA provenance

Actual EAS metadata from the dedicated project:

| Artifact | Result |
| --- | --- |
| Latest successful iOS build | Development profile, build `43e33173-cd96-41b1-8e9e-9df6834930a8`, completed 2026-10-07 09:43:35Z |
| Latest successful Android build | Development profile, build `a3d480e9-38f9-4e75-beb6-55038e91bc00`, completed 2026-10-07 10:54:00Z |
| Commit | `f560559b6a3ef09ecb7fd7dfadf9bd742a88184a` |
| App/runtime version | `1.2.0` / `1.2.0` |
| Identifier | `com.aduboffour.betweener.staging` on both platforms |
| Channel | `development` for both completed development builds |
| Dedicated project | Yes, ID `7f38a835-2da7-419b-a20b-e1a12e021547` |
| `testflightStaging` builds in dedicated project | None |
| `playStaging` builds in dedicated project | None |
| `staging` channel | Exists and is not paused |
| `staging` branch updates | None |

Therefore, the known successful development builds are isolated correctly but are not evidence for store-profile readiness. Any previously installed store/internal-testing artifact built under the historical shared project may still point to the old updates project. Its provenance must be checked on-device or by its original EAS build record before OTA use. No historical channel was changed or retired.

## Migration history and compatibility

The first read-only ledger attempt failed with `401 Invalid access token`. After the user restored CLI access, the same command succeeded without relinking. The live ledger contains exactly 231 applied migrations through `20261008090000`; local inventory contains 236. The five M1–M4 files are the only local-only entries. No migration was unexpectedly applied and no unrelated local-only migration exists.

The audit did not run `supabase link`, `migration repair`, `db push` or any mutating SQL. Read-only catalog/data queries ran through `supabase db query --linked` against the verified project.

| Migration | Local dependencies and compatibility | Remote staging status |
| --- | --- | --- |
| Capability hardening | Existing `relationship_gists`, `profiles`, `internal_admins`; preserves legacy editorial RPC signatures and narrows actions by role | PENDING; prerequisites verified |
| Reader-state idempotency | Existing `relationship_gist_user_states`; additive columns/constraints/receipt table; preserves legacy six-argument state RPC | PENDING; prerequisites verified |
| Editorial V2 | Prior two migrations and legacy Gists; additive editions/revisions/variants/audit; preserves `legacy_gist_id` and zero-argument reader RPC | PENDING; new tables confirmed absent |
| AI Editorial Studio | Editorial V2, `pgcrypto`, `pg_trgm`; additive policies/topics/jobs/provenance/source/review tables | PENDING; extensions verified |
| Reader Engagement | Editorial V2 immutable revisions; additive reactions/private Reflections/receipts/rate limits/privacy-safe events | PENDING; new tables confirmed absent |

Local static inspection found no table/column drop or truncate in these five files. Trigger drops are paired deterministic recreations. Runtime deletes are limited to owner-authorized reaction removal and private Reflection deletion. Local disposable validation previously proved `pg_trgm 1.6`, `pgcrypto 1.3`, `uuid-ossp 1.1`, 196/196 pgTAP assertions and a persistent lifecycle, but none of that proves the staging definitions.

### Environment-dependent predecessors

| Migration | Dependency | Blank replay failure | Gist impact | Current staging status |
| --- | --- | --- | --- | --- |
| `20261006150000_push_environment_provenance_hardening.sql` | Existing `private.push_config.webhook_url` must identify staging or production | Raises `push_application_environment_unrecognized` when identity data is absent | Indirectly gates the staging fixture and Circle fixture migrations via `private.push_application_config`; not part of M1–M4 | APPLIED; exact staging application row verified |
| `20261007223000_circle_staging_readiness_hardening.sql` | Existing staging application config, internal admin/profile, and sufficient fixture profiles | Raises `circle_staging_fixture_admin_profile_missing` when staging identity exists without an admin profile | No Gist schema dependency; shares the staging fixture prerequisites | APPLIED; internal admin/profile prerequisite exists |

`20261008090000_relationship_gist_staging_fixtures.sql` is APPLIED. All four deterministic fixture rows are present.

## Staging schema and data

Result: `PASS` for the pre-migration baseline.

Privacy-safe exact staging aggregates:

- Gists: 4 total; 4 published; 0 draft, archived or scheduled.
- Perspectives: general 1, culture 1, safety 1, communication 1, Christian 0, Muslim 0.
- Fixture presence: 4/4 deterministic staging rows.
- Reader state: 1 row; saved state: 0 rows.
- Admin model: 1 `super_admin`; allowed role constraint is `operations | moderation | support | super_admin`.

Live schema evidence:

- `relationship_gists`, `relationship_gist_user_states` and `internal_admins` exist with RLS enabled.
- Editorial V2, AI job and reader-engagement tables are absent, as expected before the five pending migrations.
- Extensions: `pg_trgm 1.6`, `pgcrypto 1.3`, `uuid-ossp 1.1`.
- Legacy reader RPC remains zero-argument. Legacy state RPC retains the exact six-argument signature.
- Current publication logic requires authentication, global (`circle_id is null`), published and schedule-eligible rows, then selects the newest row per perspective.
- Reader-state SELECT is owner-scoped through `profiles.user_id = auth.uid()`.
- Base Gist SELECT is authenticated/global/published/schedule-aware; no direct client mutation policy exists. Broad table grants are constrained by RLS.
- Existing editorial and reader RPC execute privileges are authenticated/service only, not anon.
- Baseline indexes, constraints and `relationship_gists_set_updated_at` trigger are present. Function-definition hashes were captured in the audit evidence.

No private member identifiers, Gist bodies or reader-state contents were returned.

## Feature flags

Exact mobile flags:

- `EXPO_PUBLIC_RELATIONSHIP_GIST_READER_V2_ENABLED`
- `EXPO_PUBLIC_RELATIONSHIP_GIST_EDITORIAL_V2_ENABLED`
- `EXPO_PUBLIC_RELATIONSHIP_GIST_AI_STUDIO_ENABLED`
- `EXPO_PUBLIC_RELATIONSHIP_GIST_ENGAGEMENT_ENABLED`
- `EXPO_PUBLIC_RELATIONSHIP_GIST_REACTIONS_ENABLED`
- `EXPO_PUBLIC_RELATIONSHIP_GIST_REFLECTIONS_ENABLED`
- `EXPO_PUBLIC_RELATIONSHIP_GIST_ANALYTICS_ENABLED`

They are static build/OTA-time Expo environment values and evaluate true only for the literal string `true`. The EAS `preview` environment contains no Gist flag rows, so all resolve off in a new preview bundle/update. Reactions, Reflections and analytics additionally require the engagement master flag. They are not remotely configurable after bundle publication.

Server AI uses a separate `RELATIONSHIP_GIST_AI_STUDIO_ENABLED` secret/environment flag plus an enabled current row in `relationship_gist_ai_environment_policies`. The function is not deployed, the policy table is not yet present, and neither `APP_ENVIRONMENT` nor `RELATIONSHIP_GIST_AI_STUDIO_ENABLED` exists in the staging secret inventory. It therefore cannot run. `OPENAI_API_KEY` and injected publishable/secret key maps already exist for other staging functions; their values were not read.

Reader V2 and engagement outboxes use account-scoped keys (`relationship-gist-outbox:v1:<user>` and `relationship-gist-engagement-outbox:v1:<user>`), validate ownership and return `owner_mismatch` rather than replay across accounts. Disabled hooks do not drain their outboxes. Queued intent is retained, and the legacy path does not consume the V2 keys. Enabling any mobile feature before its database migration exists would produce denied/missing-RPC failures; rollout ordering must keep flags off through database verification.

## AI Edge Function readiness

Local source: `supabase/functions/relationship-gist-ai-draft/`.

| Control | Local result | Staging result |
| --- | --- | --- |
| JWT verification | PASS: function `config.toml` says `verify_jwt = true` | Function not deployed |
| User authentication | PASS: bearer required and `auth.getUser` checked | Function not deployed |
| Editorial authorization | PASS: generation request RPC enforces approved topic/capability | AI migration pending |
| Environment binding | PASS: `APP_ENVIRONMENT` allowlist and job/policy environment match | Required staging env flag absent |
| Draft-only authority | PASS: service RPCs claim/complete/fail jobs; no approve/schedule/publish/archive RPC is called | Function not deployed |
| Structured output/moderation | PASS in actual local Edge Runtime with mocked provider modules | Real provider PENDING |
| Retry/idempotency/budget | PASS locally: idempotency UUID, database attempt cap, daily job/token limits | Policy table not yet installed |
| Provenance/telemetry | PASS locally: model/prompt/schema/request/token/cost metadata and allowlisted redacted telemetry | Function not deployed |

Required function environment:

- injected `SUPABASE_URL`;
- injected `SUPABASE_PUBLISHABLE_KEYS` or dedicated `BETWEENER_SUPABASE_PUBLISHABLE_KEY` (optional key-name selector);
- injected `SUPABASE_SECRET_KEYS` or dedicated `BETWEENER_SUPABASE_SECRET_KEY` (optional key-name selector);
- `APP_ENVIRONMENT=staging`;
- `RELATIONSHIP_GIST_AI_STUDIO_ENABLED` (must remain off initially);
- `OPENAI_API_KEY` only for a separately authorized real-provider canary;
- one current staging-only `relationship_gist_ai_environment_policies` row, initially disabled.

The function is independently deployable by name after the migrations, secrets and policy exist. It must not be deployed or enabled as part of a database-only change.

Future real-provider canary: use one approved fictional topic, `daily_job_budget=1`, `daily_token_budget=5000`, `max_output_tokens<=3000`, `max_attempts=1`, and an operator-approved hard spend ceiling of USD $0.10. Require a human editor to verify schema, safety, unverified-source labeling, provenance and cost. The generated revision must remain draft and must not be approved, scheduled or published by the canary.

## Milestone 5 gaps carried forward

- Persistent disposable database: passed across 18 committed transactions and a PostgreSQL restart.
- Edge Runtime: function startup/auth/policy gates and unchanged provider/schema/moderation/telemetry modules passed with mocked responses.
- Not end-to-end proof: the real provider was never invoked and the complete authorized happy path was not provider-injected through the application function.
- Generated types: `supabase/types/database.ts` contains none of the checked Gist 2.0 tables/RPCs (`relationship_gist_editions`, `relationship_gist_revisions`, `relationship_gist_reader_events`, `rpc_apply_relationship_gist_state_mutation_v2`, `rpc_get_relationship_gist_ai_studio`).
- Physical-device matrix: pending for iOS and Android, including offline termination/recovery, account switching, accessibility, feature disablement and network interruption.

## Read-only commands/actions used

No command below mutated a remote environment.

```powershell
git branch --show-current
git rev-parse HEAD
git status --porcelain=v1 -uall
git diff --check
Get-Content supabase/.temp/project-ref
Get-ChildItem supabase/migrations
Get-FileHash -Algorithm SHA256 <migration-or-report>
rg <targeted source/config patterns>
node scripts/verify-eas-project-isolation.cjs
node scripts/verify-android-variant-config.cjs
node scripts/verify-ios-variant-config.cjs
node scripts/verify-revenuecat-staging.cjs
npx.cmd supabase migration list --linked --workdir C:\Projects\betweener-app
npx.cmd supabase inspect db table-stats --linked --workdir C:\Projects\betweener-app
npx.cmd supabase db query --linked --output json <SELECT-only catalog-or-aggregate-query>
npx.cmd supabase functions list --project-ref xsgzxadwuxuziubglvps --output json
npx.cmd supabase secrets list --project-ref xsgzxadwuxuziubglvps --output json
eas.cmd project:info --json
eas.cmd env:list preview --format long
eas.cmd channel:list --json --non-interactive
eas.cmd build:list --platform ios --limit 5 --json --non-interactive
eas.cmd build:list --platform android --limit 5 --json --non-interactive
eas.cmd build:list --platform ios --build-profile testflightStaging --limit 5 --json --non-interactive
eas.cmd build:list --platform android --build-profile playStaging --limit 5 --json --non-interactive
eas.cmd update:list --branch staging --limit 10 --json --non-interactive
```

Privacy-safe public Supabase REST GET probes were also made for aggregate visibility only. Keys, row identifiers and row contents were not printed.

`STAGING_DEPLOYMENT_AUTHORIZED = NO`

`PRODUCTION_MODIFICATIONS = NONE`

`STAGING_MODIFICATIONS = NONE`

`DEPLOYMENTS = NONE`

`COMMITS = NONE`
