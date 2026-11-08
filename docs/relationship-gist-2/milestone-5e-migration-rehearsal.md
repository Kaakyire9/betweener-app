# Relationship Gist 2.0 — Milestone 5E Migration Rehearsal

Validation date: 2026-10-11 (Europe/London)

Scope: local-only staging-equivalent migration rehearsal, synthetic fixtures, release validation and failure injection. No remote database, Edge Function, EAS, OTA or provider mutation was performed.

## Result

`MIGRATION_REHEARSAL = PASS`

`SNAPSHOT_TYPE = SYNTHETIC_EQUIVALENT`

The rehearsal used a representative synthetic baseline built from the verified staging migration ledger. It was not a sanitized export of staging and must not be described as exact staging data.

## Verified source baseline

| Property | Value |
| --- | --- |
| Git branch | `feature/betweener-live` |
| HEAD | `f560559b6a3ef09ecb7fd7dfadf9bd742a88184a` |
| Worktree | Dirty before rehearsal; pre-existing Circles, Live, authentication, staging and Relationship Gist work preserved |
| Existing local Supabase project | `betweener-app`; explicitly excluded because it was not disposable |
| Remote link changes | None |
| Product-source edits by Milestone 5E | None |

Two unique disposable Supabase projects were used:

| Purpose | Project/container | API / PostgreSQL | Image |
| --- | --- | --- | --- |
| Primary persistent rehearsal | `gist2-m5e-20261011` / `supabase_db_gist2-m5e-20261011` | `127.0.0.1:55121` / `127.0.0.1:55122` | `public.ecr.aws/supabase/postgres:17.6.1.171` |
| Interrupted rollout/failure injection | `gist2-m5e-failure-20261011` / `supabase_db_gist2-m5e-failure-20261011` | `127.0.0.1:55221` / `127.0.0.1:55222` | `public.ecr.aws/supabase/postgres:17.6.1.171` |

Both identities, labels and host ports were verified before use. Seed loading was disabled. All identities used `example.invalid` addresses and synthetic UUID ranges. Both stacks, clone databases, temporary generated types and test harnesses were removed after validation.

## Synthetic staging-equivalent baseline

The baseline reproduced the verified staging state without copying personal data:

- 231 applied migrations through `20261008090000_relationship_gist_staging_fixtures.sql`;
- four published global Gists with stable IDs `91000000-0000-4000-8000-000000000001` through `...0004` for General, Culture, Safety and Communication;
- one synthetic reader-state row for the General Gist: `saved=false`, `progress=0.42`, fixed read/open timestamps and explicit `general` perspective;
- four synthetic profiles and one `super_admin`, sufficient for the existing staging fixture migrations;
- staging-only push application provenance required by unrelated baseline migrations;
- legacy RPC signatures, including `rpc_get_global_relationship_gists()` and the six-argument `rpc_upsert_relationship_gist_user_state(...)`;
- `pg_trgm 1.6`, `pgcrypto 1.3` and `uuid-ossp 1.1`.

Pre-migration evidence:

| Check | Result |
| --- | --- |
| Migration count | 231 |
| Legacy Gist count | 4 |
| Reader-state count | 1 |
| Synthetic profile count | 4 |
| Legacy Gist payload MD5 | `c65e7f4938116f40b53ef93a85dcb66c` |
| Reader-state payload MD5 | `8a0b6bd78726622e39060c748daebcb9` |

## Migration execution

The exact repository files were applied individually in dependency order.

| Order | Migration | SHA-256 | Time | Result |
| --- | --- | --- | ---: | --- |
| 1 | `20261010120000_relationship_gist_editorial_capability_hardening.sql` | `0092210F46A61B74DC49EA142E8D8B6D761EB1506690032CF2C303B0BBB4F5F7` | 3,086.56 ms | PASS |
| 2 | `20261010121000_relationship_gist_reader_state_idempotency.sql` | `61E976B1B03C14E1FD90700120D6A44BE4196499996E6CB81877AAB4C078660A` | 3,786.05 ms | PASS |
| 3 | `20261010130000_relationship_gist_editorial_v2.sql` | `972E90BE9D161B2BE717BE35CDE261E96FE166F1A26C6CF63FAF62ADACDF4A0C` | 3,617.08 ms | PASS |
| 4 | `20261010140000_relationship_gist_ai_editorial_studio.sql` | `5F13C20D090982700CC44963A0A85715AC5CD05F75FBB72D02351520E3D1D41F` | 3,641.20 ms | PASS |
| 5 | `20261010150000_relationship_gist_reader_engagement.sql` | `1216CD8D3340ACEA6EF13C99E364E528E92E0AB83027C389DDD085DE35E27E64` | 3,455.50 ms | PASS |

Post-migration ledger count: 236. The ledger contained the five exact versions in order. Direct clone execution emitted only expected idempotency notices for absent triggers and the already-installed `pg_trgm` extension. No unexpected warning or migration error occurred. The Supabase CLI emitted only its available-version notice (`2.118.0` installed, `2.120.0` available); no dependency was changed.

## Preservation and backfill

| Check | Before | After | Result |
| --- | ---: | ---: | --- |
| Legacy Gists | 4 | 4 | PASS |
| Reader-state rows | 1 | 1 | PASS |
| Editions | 0 | 4 | PASS |
| Revisions | 0 | 4 | PASS |
| Legacy Gists without editions | 4 | 0 | PASS |
| Legacy IDs/titles/status/timestamps | Captured | Byte/value-equivalent fields retained | PASS |
| Reader `saved`, progress, timestamps and perspective | Captured | Unchanged | PASS |
| Legacy RPC signatures | Captured | Present with identical argument lists | PASS |

No legacy row was deleted. Every baseline Gist received exactly one stable edition and one immutable revision. The synthetic reader state retained `saved=false`, `progress=0.42`, its timestamps and `general` perspective.

## Persistent lifecycle validation

A complete synthetic editorial lifecycle ran across 14 committed database transactions with separate author, quality reviewer, safety reviewer, publisher and reader identities:

1. create a sensitive draft and Culture perspective variant;
2. submit for review;
3. independent quality approval;
4. independent safety approval;
5. schedule with a server timestamp;
6. cancel the schedule;
7. independent publication;
8. save/read-state update through the legacy-compatible RPC;
9. create, submit, approve and publish revision two;
10. create rollback revision three as a new immutable draft.

The edition retained one stable legacy Gist ID, three revisions and 14 audit events. The saved state retained `saved=true`, `progress=0.45` and Culture perspective. After restarting PostgreSQL and reconnecting, all 236 migrations, revisions, publication pointers, audit events and reader state remained present.

## Automated validation

| Gate | Result |
| --- | --- |
| Editorial capability pgTAP | 23/23 PASS |
| Reader-state V2 pgTAP | 33/33 PASS |
| Editorial V2 pgTAP | 43/43 PASS |
| AI Editorial Studio pgTAP | 48/48 PASS |
| Reader Engagement pgTAP | 49/49 PASS |
| Database total | 196/196 PASS |
| TypeScript | PASS, 0 product-tree diagnostics |
| Scoped ESLint, `--max-warnings=0` | PASS |
| Node Gist/Circles regressions | 47/47 PASS |
| Jest outbox/state/Saved Library | 17/17 PASS; 4/4 suites |
| AI retry exhaustion with mocked `503` responses | PASS; exactly 2/2 attempts, no provider request |
| `git diff --check` before documentation | PASS |

The first two TypeScript attempts included temporary copied Supabase/function dependencies beneath the repository root and reported only missing imports from that disposable copy. The temporary copies were removed; the unchanged product tree then passed. This was a validation-harness artifact, not an application failure.

## Failure-injection matrix

Five transaction-consistent synthetic clones were created inside the second disposable stack.

| Scenario | Evidence | Result |
| --- | --- | --- |
| Stop after migration 1 | Authenticated legacy reader returned all 4 Gists; no V2 state/editorial/AI/engagement tables | PASS |
| Stop after migration 2 | Authenticated legacy reader returned all 4 Gists; receipt table present; later layers absent | PASS |
| Stop after migration 3 | Authenticated legacy reader returned all 4 Gists; editions present; AI/engagement absent | PASS |
| Stop after migration 4 | Authenticated legacy reader returned all 4 Gists; AI jobs present; engagement absent | PASS |
| Failure during migration 5 | Deliberate incompatible pre-existing reaction table forced failure after `BEGIN`; all other migration-5 tables rolled back | PASS |
| Migration-5 recovery | Removed only the injected collision and reapplied the unchanged migration; all five engagement tables created and all 4 legacy Gists remained readable | PASS |
| Concurrent publication | Two simultaneous publish attempts on one approved revision: one committed, one failed closed with `gist_revision_not_approved`; exactly one publish audit event | PASS |
| Incomplete backfill | One synthetic legacy sentinel without an edition produced detector count `1` | PASS — gate detects and must block rollout |
| Reader disconnect/reconnect and duplicate receipts | pgTAP plus Jest cover persistent outbox recovery, duplicate delivery, stale conflict and account isolation | PASS |
| Withdrawn content | Editorial pgTAP verifies unpublish and Saved Library unavailable explanation | PASS |
| Feature rollback | Default-off flags and authenticated legacy RPCs remained functional at every partial state | PASS |
| AI provider exhaustion | Mock provider returned `503`; retries stopped at configured maximum and no draft/publication occurred | PASS |

## Generated-type comparison

Types were generated from the migrated disposable schema into a temporary file only.

| Artifact | SHA-256 | Bytes |
| --- | --- | ---: |
| Disposable generated types | `05C5A06181C496EAF01A3D44A516833DABD590082DA8F31F052F93CA7003D745` | 749,381 |
| Current `supabase/types/database.ts` | `8F7D841324FFD34B6A47F3D8A3AEDA899003F3D3EE442EF466D01B44B09BC3E8` | 768,583 |

The generated artifact contains `relationship_gist_editions`, `relationship_gist_revisions`, `relationship_gist_ai_generation_jobs`, `relationship_gist_reactions`, `relationship_gist_reflections` and `rpc_transition_relationship_gist_revision`; the checked-in generated file contains none of them. The temporary file was deleted and the tracked file was not overwritten. Regeneration from the eventual migrated target schema is a release-candidate requirement.

## Limitations

- This was a synthetic-equivalent baseline, not a sanitized staging snapshot. It validates schema/data shapes and verified staging counts, not undisclosed staging row distributions or volume.
- No real OpenAI request was authorized or made.
- No physical-device test was run.
- No staging or production system was modified.

`LEGACY_COMPATIBILITY = PASS`

`DATA_PRESERVATION = PASS`

`PRODUCTION_MODIFICATIONS = NONE`

`STAGING_MODIFICATIONS = NONE`

`DEPLOYMENTS = NONE`

`COMMITS = NONE`
