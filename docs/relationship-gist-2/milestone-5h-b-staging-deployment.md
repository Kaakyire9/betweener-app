# Relationship Gist 2.0 - Milestone 5H-B Staging Deployment

Execution date: 2026-10-11 (Europe/London)

## Outcome

The five checksum-approved Relationship Gist 2.0 migrations were applied one at a time to dedicated Betweener Staging. Each migration received a ledger, schema, authorization and aggregate data-preservation checkpoint before the next migration ran.

Only the `relationship-gist-ai-draft` Edge Function was deployed. JWT verification is enabled, its runtime AI flag is absent, its database environment policy is absent, and a safe invocation returned `GIST_AI_DISABLED` before any database job or OpenAI request could occur.

No mobile feature flag was enabled. No Gist, reader state, AI draft, reaction, Reflection or editorial content was created, edited, published, archived or deleted during this milestone.

## Target identity

| Surface | Verified value |
| --- | --- |
| Supabase project ref | `xsgzxadwuxuziubglvps` |
| Supabase project | `betweener-staging` |
| Project status | `ACTIVE_HEALTHY` |
| Region | `eu-north-1` |
| PostgreSQL | `17.6.1.166` |
| Database endpoint | `db.xsgzxadwuxuziubglvps.supabase.co` |
| EAS staging project | `7f38a835-2da7-419b-a20b-e1a12e021547` |
| Staging application ID | `com.aduboffour.betweener.staging` |
| Rejected production ref | `jbyblhithbqwojhwlenv`; never used in an execution command |
| Supabase CLI | `2.118.0` |

Every migration and function command named the staging project explicitly. The original development worktree link was not changed.

## Release candidate

| Check | Result |
| --- | --- |
| Candidate | `C:\Projects\betweener-gist2-rc-5f-20261011` |
| Baseline HEAD | `f560559b6a3ef09ecb7fd7dfadf9bd742a88184a` |
| Payload | 55 files |
| Payload verification | PASS, 55/55 SHA-256 hashes matched before and after deployment |
| Payload mismatches | 0 |
| Reproduction patch SHA-256 | `3680A0BA286F9EF39E98319AFE8A5E136C4DE1CE9308EF75240638BD2CEA03D6` |
| Original worktree HEAD | unchanged at `f560559b6a3ef09ecb7fd7dfadf9bd742a88184a` |
| Original worktree status count | unchanged at 191 entries |

The deployment workspace was assembled under the task-specific system temporary directory. It contained 231 verified staging-history files and one cumulative approved migration per phase. It did not use the dirty original worktree for execution.

After evidence capture, the isolated deployment workspace was deleted and its absence verified. The encrypted recovery archive and DPAPI key blob remained present with their recorded SHA-256 checksums unchanged.

## Predeployment gates

| Gate | Result |
| --- | --- |
| CLI authentication | PASS |
| Staging identity and health | PASS |
| Applied migration ledger | 231 matched |
| Approved pending migrations | exactly 5 |
| Unrelated pending migrations | 0 |
| Remote-only migrations | 0 |
| Fixture Gists | 4/4 expected IDs present and published |
| Reader-state rows | 1 |
| Saved rows | 0 |
| Rows with progress | 1 |
| Unknown `internal_admins.role` values | 0 |
| Mobile Gist flags | 7 checked, 0 present, 0 enabled |
| Supabase AI-enable secret | absent |
| Enabled/current AI policies | 0 |
| Existing target Edge Function | absent |
| Recovery archive | present; checksum matched |

Predeployment Gist metadata hash:

`FC2CA8A8815DD090B2252D7C9473FCCCD59921317BBD9A697EC794EEDDC5941B`

## Migration execution

| Order | Migration | SHA-256 | Result | Checkpoint |
| ---: | --- | --- | --- | --- |
| 1 | `20261010120000_relationship_gist_editorial_capability_hardening.sql` | `C61E95207DD6BC2803A6C0F90C91BAA9F98560C50FD207C5632D54C106F10BFD` | PASS | Six authorization functions present; helper service-role-only; anonymous permission and publish canaries returned 401; data unchanged |
| 2 | `20261010121000_relationship_gist_reader_state_idempotency.sql` | `5B90B9F86D72F92AC42913C39F0E9B20BE5A4CCDFEF79FCD57D6397A32C4801D` | PASS | Six columns present; receipt table RLS enabled; no anon/authenticated direct grant; V2 RPC present; legacy six-argument state RPC preserved; zero receipts |
| 3 | `20261010130000_relationship_gist_editorial_v2.sql` | `9D6FDE25819D3D2E07A81C32524B4756502ACF2164EE829EE7DF95C5CDA9887A` | PASS | Four RLS tables and three immutability triggers present; backfill produced 4 editions, 4 revisions and 4 variants; zero missing bindings or invalid current/published links |
| 4 | `20261010140000_relationship_gist_ai_editorial_studio.sql` | `EB55BF58E30B8D38E446E18CBA15137F73126AAC3C50411B93B349D6038002D5` | PASS | Eight RLS tables present; worker RPCs have no authenticated grants; review/provenance triggers present; zero policies, topics, jobs, events, drafts, sources or specialist reviews |
| 5 | `20261010150000_relationship_gist_reader_engagement.sql` | `6B13E3618D34E9E14A9F5CF049B8D4C8F1FE5AECA39793CBFAE0B77A62D6ED13` | PASS | Five RLS tables and five RPCs present; no authenticated direct-table grants; all engagement tables empty; anonymous reaction/Reflection reads returned 401 |

The first phase-1 command used an invalid CLI flag combination and was rejected before connecting. The corrected command used `--linked --project-ref xsgzxadwuxuziubglvps`; no migration or ledger change occurred from the rejected attempt.

## Final migration ledger

| State | Count |
| --- | ---: |
| Local/remote matched | 236 |
| Pending | 0 |
| Remote-only | 0 |

Applied versions, in order:

1. `20261010120000`
2. `20261010121000`
3. `20261010130000`
4. `20261010140000`
5. `20261010150000`

## Schema, RLS and grants

The final schema-only staging snapshot has SHA-256:

`84863821CD76245E0940FA8E5510AE600027D9FD3B231453B8ED110AA4BE751B`

Results:

- all 18 new Gist tables exist and have RLS enabled;
- no new Gist table grants direct access to `anon` or `authenticated`;
- no Gist function grants were present for `PUBLIC`;
- legacy `rpc_get_global_relationship_gists` remains present;
- legacy `rpc_upsert_relationship_gist_user_state` remains present with six arguments;
- AI worker claim/complete/fail RPCs have no authenticated grants;
- editorial capability enforcement, self-approval checks, separate quality/safety review, owner checks and immutable revision controls match the approved migration source and passed 196/196 pgTAP assertions during the isolated restore rehearsal.

### Least-privilege finding

Two internal trigger functions inherited an `anon` EXECUTE ACL from the project's default function privileges:

- `relationship_gist_ai_clone_provenance()`;
- `relationship_gist_ai_enforce_review_gate()`.

They return `trigger`, are not PostgREST RPC endpoints, and anonymous RPC canaries returned 404 for both. No data was changed. This is not an activation blocker while all Gist 2.0 features and AI generation remain disabled, but a separately reviewed forward hardening migration should explicitly revoke `PUBLIC`, `anon` and `authenticated` execution before feature activation.

Authenticated operations/moderation/support role canaries were not performed on live Staging because only the existing super-admin role was present and this milestone prohibited creating test identities or changing real roles. Those boundaries are supported by source inspection and the isolated 196-assertion pgTAP suite; live role-specific canaries remain a staging QA prerequisite.

## Data preservation

| Protected state | Before | After |
| --- | ---: | ---: |
| Global Gists | 4 | 4 |
| Published global Gists | 4 | 4 |
| Expected fixture IDs | 4/4 | 4/4 |
| Reader-state rows | 1 | 1 |
| Saved rows | 0 | 0 |
| Rows with progress | 1 | 1 |
| Gist metadata hash | `FC2CA8A...941B` | identical |
| State mutation receipts | 0 | 0 |
| Editions / revisions / variants | absent | 4 / 4 / 4 |
| Editorial audit events | 0 | 0 |
| AI policies / jobs / drafts | 0 / 0 / 0 | 0 / 0 / 0 |
| Reactions / Reflections / reader events | 0 / 0 / 0 | 0 / 0 / 0 |

No legacy Gist ID, status, publication timestamp or update timestamp changed. No unexpected publication or editorial job execution occurred. The migrations do not update legacy Gist bodies or reader-state ownership relationships; their exact preservation had also passed the isolated backup/restore rehearsal.

## Edge Function deployment

| Property | Verified value |
| --- | --- |
| Function | `relationship-gist-ai-draft` |
| Deployment target | `xsgzxadwuxuziubglvps` |
| Status | `ACTIVE` |
| Version | `1` |
| JWT verification | `true` |
| Function files copied from candidate | 3/3 hashes matched |
| `index.ts` SHA-256 | `016CFE336C2ED3D0EC50DAD9139D79D7A1ADFF176CDB00FCCCE3E0FD3AE883B4` |
| Function `config.toml` SHA-256 | `CA10C967DCA0911757CE8258D98AEE927A7E00C4DE4C8521B33644D8B2840FA2` |
| Autonomous publish/transition call | none |
| No-authorization canary | 401 |
| Valid anon-JWT disabled-gate canary | 503, `GIST_AI_DISABLED` |
| AI-enable secret after deployment | absent |
| Enabled/current database policy | 0 |
| Jobs/drafts/events after canary | 0/0/0 |

The disabled-gate check occurs before user lookup, job creation, service-role client construction or OpenAI provider construction. Therefore the 503 canary did not create a draft or make a provider request. No Supabase secret was added or changed.

## Feature flags

The following EAS `preview` variables remain absent and therefore false under the source's strict `=== 'true'` checks:

- `EXPO_PUBLIC_RELATIONSHIP_GIST_READER_V2_ENABLED`;
- `EXPO_PUBLIC_RELATIONSHIP_GIST_EDITORIAL_V2_ENABLED`;
- `EXPO_PUBLIC_RELATIONSHIP_GIST_AI_STUDIO_ENABLED`;
- `EXPO_PUBLIC_RELATIONSHIP_GIST_ENGAGEMENT_ENABLED`;
- `EXPO_PUBLIC_RELATIONSHIP_GIST_REACTIONS_ENABLED`;
- `EXPO_PUBLIC_RELATIONSHIP_GIST_REFLECTIONS_ENABLED`;
- `EXPO_PUBLIC_RELATIONSHIP_GIST_ANALYTICS_ENABLED`.

Server-side `RELATIONSHIP_GIST_AI_STUDIO_ENABLED` is absent, and the runtime disabled-gate canary confirms generation remains off. Legacy reader functionality remains available through its unchanged RPC contracts.

## Recovery custody

Encrypted recovery archive:

`C:\Users\HP\AppData\Local\Betweener\recovery\gist2-5h-r2-20261011T1320Z\gist2-predeployment-recovery.7z`

- archive SHA-256: `AB66CF487613BC4787845BD479F4B1462015348DF711CDD6B7C1781C466E5B1B`;
- DPAPI key-blob SHA-256: `74220568DBF13E4968890122B50CA2F3D07E53ED187297D6BB21EC7CE1A59659`;
- plaintext SQL files retained: 0;
- physical backups: 7 completed;
- latest completed physical backup: `2026-10-10T23:17:26.556Z`;
- prior isolated restore and recovery drill: PASS;
- recovery archive was not deleted or modified.

## Remaining risks and next prerequisites

Before physical-device testing or feature activation:

1. Apply a separately reviewed least-privilege migration revoking direct execute from `PUBLIC`, `anon` and `authenticated` on the two internal AI trigger functions.
2. Create disposable staging test identities for operations, moderation and support, then run authenticated negative/positive role canaries without changing real member or administrator accounts.
3. Re-run the legacy reader on authenticated iOS and Android devices with every Gist 2.0 flag still off.
4. Separately authorize any feature-flag activation. Activate Reader V2 before engagement features and keep AI generation off until provider/runtime validation is approved.
5. Do not test AI generation until an explicit budget, approved staging provider credential and disposable editorial topic are authorized.

No device build is authorized by this milestone.

`STAGING_MIGRATIONS = PASS`

`STAGING_AI_EDGE_FUNCTION = PASS`

`STAGING_DATA_PRESERVATION = PASS`

`STAGING_SECURITY = CONDITIONAL_PASS`

`AI_GENERATION_ENABLED = NO`

`STAGING_DEVICE_BUILD_AUTHORIZED = NO`

`PRODUCTION_MODIFICATIONS = NONE`

`EAS_BUILDS = NONE`

`OTA_PUBLICATIONS = NONE`

`COMMITS = NONE`
