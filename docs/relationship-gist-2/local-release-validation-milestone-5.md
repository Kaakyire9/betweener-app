# Relationship Gist 2.0 — Milestone 5A–5C Local Release Validation

Validation date: 2026-10-11 (Europe/London)

Scope: local source, disposable local Supabase, local Supabase Edge Runtime
Remote environments touched: none

## Verdict

`LOCAL_RELEASE_VALIDATION = CONDITIONAL_PASS`

The source, database, security and mocked-runtime gates passed. A real OpenAI request was not authorized and the physical-device matrix was prepared but not executed. These remain explicit pre-staging gates; neither was bypassed.

`STAGING_DEPLOYMENT_AUTHORIZED = NO`

## Verified source baseline

| Evidence | Value |
| --- | --- |
| Git branch | `feature/betweener-live` |
| HEAD | `f560559b6a3ef09ecb7fd7dfadf9bd742a88184a` |
| Worktree | Dirty before validation; contains pre-existing Circles, Live, authentication, staging and Relationship Gist work |
| `app/(tabs)/explore.tsx` validation blob | `dc64762df2f4f7174d02ae331b79b02793346d1c` |
| Source edits made by this validation | This report only |
| Commits/pushes | None |

The audit did not restore, stage, commit, overwrite or reformat any pre-existing work. Validation used a separate disposable project under `tmp/gist2-release-validation` with unique project identity and ports; it was not linked to a remote Supabase project.

Migration source SHA-256 values:

| Migration | SHA-256 |
| --- | --- |
| `20261010120000_relationship_gist_editorial_capability_hardening.sql` | `0092210F46A61B74DC49EA142E8D8B6D761EB1506690032CF2C303B0BBB4F5F7` |
| `20261010121000_relationship_gist_reader_state_idempotency.sql` | `61E976B1B03C14E1FD90700120D6A44BE4196499996E6CB81877AAB4C078660A` |
| `20261010130000_relationship_gist_editorial_v2.sql` | `972E90BE9D161B2BE717BE35CDE261E96FE166F1A26C6CF63FAF62ADACDF4A0C` |
| `20261010140000_relationship_gist_ai_editorial_studio.sql` | `5F13C20D090982700CC44963A0A85715AC5CD05F75FBB72D02351520E3D1D41F` |
| `20261010150000_relationship_gist_reader_engagement.sql` | `1216CD8D3340ACEA6EF13C99E364E528E92E0AB83027C389DDD085DE35E27E64` |

## Migration dependency and compatibility matrix

| Order | Migration | Dependencies verified | Compatibility result |
| --- | --- | --- | --- |
| 1 | Editorial capability hardening | Baseline `relationship_gists`, `profiles`, `internal_admins` and existing editorial RPCs | PASS — action-specific capability functions replace broad authorization without widening support/moderation authority |
| 2 | Reader-state idempotency | Existing `relationship_gist_user_states`, profiles and legacy state RPC | PASS — additive columns and receipt table; legacy six-argument RPC remains present |
| 3 | Editorial V2 | Steps 1–2 plus legacy Gist rows | PASS — additive edition/revision/variant/audit tables; stable `legacy_gist_id`; old reader RPC remains zero-argument |
| 4 | AI Editorial Studio | Step 3, `pgcrypto`, `pg_trgm` | PASS — `pg_trgm 1.6` installed; AI policy/topic/job/provenance/source/specialist tables are additive |
| 5 | Reader Engagement | Step 3 and immutable published revisions | PASS — additive reactions, private Reflections, receipts, rate limits and privacy-safe events |

Observed extensions in the disposable PostgreSQL 17.6 database: `pg_trgm 1.6`, `pgcrypto 1.3`, `uuid-ossp 1.1`.

No migration drops a table or column, truncates data, or performs migration-time deletion. `DROP TRIGGER IF EXISTS` is used only immediately before deterministic trigger recreation. The `DELETE` statements in Milestone 4 are runtime owner-authorized reaction/Reflection removal semantics.

Installed-client compatibility verified:

- `rpc_get_global_relationship_gists()` retains its zero-argument signature.
- `rpc_upsert_relationship_gist_user_state(uuid, boolean, double precision, timestamptz, boolean, text)` remains present.
- Editions retain the legacy Gist UUID through `legacy_gist_id`.
- Reader repositories retain the legacy query fallback and legacy state-column fallback.
- Existing account-scoped AsyncStorage data and outbox formats remain accepted.
- Reader V2, editorial V2, AI studio and engagement capabilities remain default-off behind static Expo feature flags.
- Circles and canonical Gist entry points remain covered by regression tests.

## Disposable persistent database validation

Identity proven before fixtures:

| Property | Disposable value |
| --- | --- |
| Supabase project ID | `gist2-release-validation-20261011` |
| API | `127.0.0.1:55321` |
| PostgreSQL | `127.0.0.1:55322/postgres` |
| Database container | `supabase_db_gist2-release-validation-20261011` |
| Database image | `public.ecr.aws/supabase/postgres:17.6.1.171` |
| Remote link metadata | Absent |
| Seed data | Disabled |

The portable repository baseline through `20260930120000` and the five Gist migrations were applied persistently in order. A complete clean-room replay of every later repository migration was intentionally not used because two unrelated environment-data migrations are not portable:

- `20261006150000_push_environment_provenance_hardening.sql` requires an existing staging/production webhook identity.
- `20261007223000_circle_staging_readiness_hardening.sql` requires an existing staging admin/profile fixture.

This is not a Gist migration failure, but remote deployment must verify the target migration ledger and prerequisites rather than assume a blank-database replay.

Persistent lifecycle result: PASS.

The following were executed across 18 committed transactions with distinct author, quality, safety, specialist, publisher and two reader identities:

- topic creation and independent approval;
- generation job request, claim and mocked structured completion;
- draft-only AI authority;
- human submission, claim attestation and source review;
- quality, safeguarding, medical and safety approval;
- server-timestamped scheduling and cancellation;
- independent publication;
- legacy reader visibility and stable Gist identity;
- offline save, duplicate retry, stale multi-device conflict, unsave and rebased save;
- Saved Library retrieval and reader-position restoration;
- reaction creation and change;
- private Reflection creation and edit;
- account-switch isolation and cross-account mutation rejection;
- rollback by a new immutable draft revision.

PostgreSQL was then restarted. A new connection verified that the job provenance, token/cost data, published revision, specialist approvals, rollback revision, Saved Library state, reading position, reaction and private Reflection survived. Reaction removal and Reflection deletion were then exercised and verified.

## Database and security test results

| Suite | Result |
| --- | --- |
| Editorial capability pgTAP | 23/23 PASS |
| Reader-state V2 pgTAP | 33/33 PASS |
| Editorial V2 pgTAP | 43/43 PASS |
| AI Editorial Studio pgTAP | 48/48 PASS |
| Reader Engagement pgTAP | 49/49 PASS |
| Total database assertions | 196/196 PASS |

Security controls verified:

- anonymous editorial and engagement mutations are denied;
- support and ordinary members receive no editorial authority;
- author, quality, safety/specialist and publication duties are separated;
- authors cannot self-approve or publish their own work;
- unreviewed and specialist-pending sensitive drafts cannot publish;
- service authority can claim/complete/fail a job but cannot publish;
- environment-bound AI jobs reject cross-environment claims;
- owner IDs are matched against `auth.uid()` at mutation time;
- state and engagement mutations are idempotent and account scoped;
- private Reflection rows are not directly client-readable and never enter analytics or receipt payloads;
- reaction aggregates expose counts without reactor identities;
- audience targeting stays disabled while enforcement is unavailable;
- AI job event history, revisions, variants and editorial audit events are immutable.

## Supabase Edge Runtime validation

Actual runtime: `supabase-edge-runtime 1.76.2` (Deno-compatible `2.1.4`).
Function startup: PASS.

HTTP/function gates:

| Probe | Expected/result |
| --- | --- |
| AI feature disabled | `503 GIST_AI_DISABLED` — PASS |
| Invalid application environment | `503 GIST_AI_ENVIRONMENT_INVALID` — PASS |
| Missing bearer token | `401 UNAUTHORIZED_NO_AUTH_HEADER` — PASS |
| Anonymous token | `401 AUTH_REQUIRED` — PASS |
| Authenticated non-editor | `403 GIST_AI_REQUEST_DENIED` — PASS |
| Authorized editor with malformed request | `400 INVALID_REQUEST` — PASS |
| Authorized editor with unknown topic | `403 GIST_AI_REQUEST_DENIED` — PASS |

A disposable Edge Function harness imported the unchanged provider, schema, moderation and telemetry modules and ran inside the same Supabase Edge Runtime. It used only in-memory mocked responses.

| Mocked-runtime check | Result |
| --- | --- |
| Strict structured output acceptance | PASS |
| Unsupported perspective/schema rejection | PASS |
| Token usage metadata | PASS |
| Retry after a retryable provider failure | PASS |
| Maximum retry enforcement | PASS |
| Moderation allow decision | PASS |
| Cost calculation | PASS |
| Redacted telemetry allowlist | PASS |

The application function has no injectable provider seam, so an authorized end-to-end function call through generation, moderation and database completion could not be mocked without changing application source. The unchanged modules and database boundary were validated separately under the real local runtime. This limitation is recorded rather than represented as full provider-path proof.

## Real OpenAI verification

Status: `PENDING`.

No explicit budget or approved disposable credential was supplied, so no real OpenAI request was made. Before staging authorization, run one non-sensitive fictional draft with a declared maximum budget and verify schema, moderation, source-suggestion labeling, provenance, actual usage/cost, human-review requirement and absence of publication authority.

## Source validation results

| Gate | Result |
| --- | --- |
| TypeScript: `npm.cmd run typecheck` | PASS, 0 diagnostics |
| Scoped ESLint with `--max-warnings=0` | PASS, 0 warnings/errors |
| Node Gist/Circles regressions | 41/41 PASS |
| Jest outbox/state/Saved Library suites | 17/17 PASS; 4/4 suites |
| pgTAP | 196/196 PASS |
| Persistent integration lifecycle | PASS before and after database restart |
| `git diff --check` | PASS |

The first TypeScript invocation included the disposable Deno harness because it lived below the repository root and reported one URL-import resolution error. The harness was removed, then the unchanged product source was rerun and passed with zero diagnostics. This was a validation-harness issue, not an application-source error.

## Physical-device test matrix

Status: prepared, not executed. No EAS build was triggered.

Run every row on one supported iPhone/TestFlight-or-development build and one supported Android physical device/development build, using disposable accounts A and B.

| Area | Test | iOS | Android | Required evidence |
| --- | --- | --- | --- | --- |
| Online reader | Open canonical Gist, change perspective, save, resume | Pending | Pending | Correct immutable revision, stable Gist ID, real progress |
| Offline save | Save while offline, terminate, relaunch, reconnect | Pending | Pending | Intent remains queued and applies once |
| Offline unsave | Unsave while offline after an earlier save | Pending | Pending | Latest intent wins; no reappearing save |
| Offline reaction | Add/change/remove while offline | Pending | Pending | One active reaction; aggregate updates after sync |
| Private Reflection | Create/edit/delete; inspect from account B | Pending | Pending | Text survives locally/syncs for A; never visible to B |
| Termination | Kill app with pending outbox work | Pending | Pending | Pending operations recover without duplicate writes |
| Background/resume | Background during read and sync | Pending | Pending | Duration excludes background time; refresh is safe |
| Account switch | Queue on A, sign out, use B, return to A | Pending | Pending | No A state or mutations replay under B |
| Reconnection | Alternate Wi-Fi/cellular/offline during mutations | Pending | Pending | Idempotent retry and deterministic conflict resolution |
| Position restoration | Resume by anchor; remove anchor to test fallback | Pending | Pending | Anchor preferred, progress fallback works |
| Large text | Maximum accessibility font size | Pending | Pending | No clipped controls/body; scrolling and completion remain usable |
| Screen reader | VoiceOver/TalkBack through reader and engagement | Pending | Pending | Labels, order, state and actions are announced correctly |
| Reduced motion | Enable OS reduced motion | Pending | Pending | No required information depends on animation |
| Flag disablement | Disable Reader V2/engagement flags with queued work | Pending | Pending | Legacy reader works; V2 queue is isolated and retained, not replayed by legacy sync |

## Remaining blockers and risks

1. Real OpenAI provider verification is pending explicit credentials and budget.
2. The physical-device matrix is pending on both iOS and Android.
3. The checked-in generated file `supabase/types/database.ts` does not yet expose the new Gist 2.0 tables/RPCs. Current repositories compile through compatibility adapters, but staging preparation should regenerate and review types after the migrations exist on the target.
4. Full blank-database replay is blocked by the unrelated environment-data migrations listed above. Staging rollout must inspect the actual migration ledger and prerequisites.
5. An authorized full Edge Function happy path with mocked provider output was not possible without a provider-injection seam; module/runtime and persistent database boundaries passed independently.

## Staging deployment prerequisites

1. Preserve and review the dirty worktree; isolate the intended Gist 2.0 files from unrelated Circles, Live, authentication and staging work.
2. Review the five migration hashes above and confirm the staging ledger will apply them in order after all required baseline migrations.
3. Take an approved staging backup and run a staging-equivalent migration dry run against a disposable snapshot.
4. Regenerate and review `supabase/types/database.ts` from the migrated staging-equivalent schema.
5. Keep all new mobile flags and `RELATIONSHIP_GIST_AI_STUDIO_ENABLED` off during initial migration/function deployment.
6. Configure environment-bound staging-only AI policy, secrets, budgets and model. Confirm no production queue or credential is shared.
7. Complete the controlled real-provider test with an explicit maximum budget.
8. Execute and retain evidence for the full iOS/Android physical-device matrix.
9. Re-run TypeScript, scoped ESLint, Node/Jest, pgTAP, security probes and `git diff --check` from the exact release candidate.
10. Obtain explicit staging deployment approval in a new task.

## Rollback strategy

- Client: keep default-off flags as the immediate kill switch. Disabling Reader V2/engagement/AI preserves the legacy reader path and prevents new V2 mutations from being executed by legacy sync.
- AI: set the server AI flag/policy to disabled; queued jobs remain inspectable and cannot autonomously publish.
- Editorial content: rollback is forward-only by creating a new immutable revision. Never rewrite a published revision.
- Database: migrations are additive; do not drop new tables/functions during incident response. Stop feature traffic, restore from the approved backup only for data-integrity failure, otherwise fix forward.
- Edge Function: roll back to the prior function version while leaving AI generation disabled.
- Offline state: retain account-scoped outboxes through rollback so user intent is not silently lost; do not allow legacy sync to drain V2 operations.

`LOCAL_RELEASE_VALIDATION = CONDITIONAL_PASS`

`STAGING_DEPLOYMENT_AUTHORIZED = NO`

`PRODUCTION_MODIFICATIONS = NONE`

`STAGING_MODIFICATIONS = NONE`

`DEPLOYMENTS = NONE`

`COMMITS = NONE`
