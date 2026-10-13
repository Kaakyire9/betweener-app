# Relationship Gist 2.0 - Milestone 5H-R2 Backup and Restore Validation

Execution date: 2026-10-11 (Europe/London)

## Decision

The approved Gist-specific staging recovery point was created, restored twice in isolated disposable databases, migrated with the five checksum-approved migrations, validated, and used in a destructive recovery drill.

The recovery gate is closed for the next separately authorized staging migration decision. This report does not authorize that deployment.

## Staging identity and preflight

| Check | Result |
| --- | --- |
| Supabase project | `xsgzxadwuxuziubglvps` |
| Project name | `betweener-staging` |
| Status | `ACTIVE_HEALTHY` |
| Region | `eu-north-1` |
| Database endpoint | `db.xsgzxadwuxuziubglvps.supabase.co` |
| Database version | PostgreSQL `17.6.1.166` |
| CLI authentication | PASS |
| Applied migration ledger | 231 matched local/remote versions |
| Pending migrations | Exactly the five approved Gist 2.0 versions |
| Unrelated pending migrations | None |
| Remote-only migrations | None when reconciled against the original repository read-only |
| Active CLI link | Not changed |
| Production access | None |

The isolated 55-file candidate omits three unrelated staging-only migration source files. When the candidate directory alone was used, those already-applied versions appeared as remote-only. Read-only reconciliation against the original repository confirmed the authoritative result: 231 matched, five approved local-only Gist migrations, and zero remote-only versions.

## Approved migration checksums

| Migration | SHA-256 | Result |
| --- | --- | --- |
| `20261010120000_relationship_gist_editorial_capability_hardening.sql` | `C61E95207DD6BC2803A6C0F90C91BAA9F98560C50FD207C5632D54C106F10BFD` | PASS |
| `20261010121000_relationship_gist_reader_state_idempotency.sql` | `5B90B9F86D72F92AC42913C39F0E9B20BE5A4CCDFEF79FCD57D6397A32C4801D` | PASS |
| `20261010130000_relationship_gist_editorial_v2.sql` | `9D6FDE25819D3D2E07A81C32524B4756502ACF2164EE829EE7DF95C5CDA9887A` | PASS |
| `20261010140000_relationship_gist_ai_editorial_studio.sql` | `EB55BF58E30B8D38E446E18CBA15137F73126AAC3C50411B93B349D6038002D5` | PASS |
| `20261010150000_relationship_gist_reader_engagement.sql` | `6B13E3618D34E9E14A9F5CF049B8D4C8F1FE5AECA39793CBFAE0B77A62D6ED13` | PASS |

## Backup method and scope

Supabase CLI `2.118.0` created read-only logical dumps using its project-scoped temporary login mechanism. No database password, access token, SQL row or backup content was printed.

Backup window:

- started: `2026-10-11T13:21:39.7648082Z`;
- completed: `2026-10-11T13:22:20.9795475Z`;
- data-export duration: `41.177` seconds.

Captured:

- database role configuration supported by `supabase db dump --role-only`;
- complete `public` schema structure, including functions, RLS, policies, grants, indexes, constraints and triggers;
- `supabase_migrations` schema and 231 applied migration records;
- one consistent `pg_dump` snapshot containing data only from `public.relationship_gists` and `public.relationship_gist_user_states`;
- four Gist rows and one reader-state row.

Excluded:

- all other 264 public-table data sets;
- all `auth` data, passwords, tokens and authentication records;
- Vault secrets;
- Storage objects;
- Edge Functions and environment secrets;
- Realtime, EAS, notification and third-party service configuration.

The logical artifact is a Gist-specific recovery kit, not a complete Supabase project backup. Full-project recovery continues to rely on the seven verified Supabase physical backups. Supabase documents that physical database backups do not restore Storage objects and that a restored project requires manual service reconfiguration: [Database Backups](https://supabase.com/docs/guides/platform/backups), [Restore to a new project](https://supabase.com/docs/guides/platform/clone-project).

### Raw component checksums

| Component | Bytes | SHA-256 |
| --- | ---: | --- |
| `roles.sql` | 370 | `168A95A9C745AF5ED4679751F90419AC9DC434240A213B03E32A06D5664C2308` |
| `schema-public.sql` | 3,558,895 | `D735A11D77C0BAF323F6CE754878CDB7C787D87703C1E52470E5991C5B595362` |
| `history-schema.sql` | 887 | `18B99FBBB3EC9FBB964BB255A56171329ACD99B6977ECE2ADDD89FDF5AA5105B` |
| `history-data.sql` | 4,745,615 | `9F8E08252D5A90E9B17A0647DD8A52EE4F7B30E3B42BBBE7E3219B804A0A0466` |
| `data-gist.sql` | 6,225 | `B2C933B4438CC725001C7040B2252160E2322B78EB1410B45F9315075E238390` |

## Encryption, custody and retention

Retained artifact:

`C:\Users\HP\AppData\Local\Betweener\recovery\gist2-5h-r2-20261011T1320Z\gist2-predeployment-recovery.7z`

Archive properties:

- AES-256 encryption;
- encrypted archive headers;
- verified using `7z test` after creation;
- size: 643,248 bytes;
- SHA-256: `AB66CF487613BC4787845BD479F4B1462015348DF711CDD6B7C1781C466E5B1B`.

The random archive password is not stored in plaintext. It is protected using Windows DPAPI for the current Windows user:

`C:\Users\HP\AppData\Local\Betweener\recovery\gist2-5h-r2-20261011T1320Z\gist2-predeployment-recovery-key.dpapi`

Key-blob SHA-256: `74220568DBF13E4968890122B50CA2F3D07E53ED187297D6BB21EC7CE1A59659`.

The recovery directory has inherited ACLs disabled and grants access only to the current operator account and `SYSTEM`. It is outside all Git repositories and cloud-synced workspace paths. Plaintext dump, evidence and intermediate archive files were removed after encrypted-archive verification.

Retention: retain both encrypted files through the authorized staging migration window and for no more than seven days after successful recovery-gate closure. The DPAPI key is bound to the current Windows account; recovery must be performed by that account on this Windows profile unless the key is separately rewrapped through an approved secure process.

An initial attempt to use direct PowerShell DPAPI APIs failed because this host runs a legacy PowerShell/.NET surface. The failed attempt removed its plaintext workspace without producing an archive. The exact files remained inside the isolated restore container, were recovered, and matched all five original hashes before the successful AES-256 packaging. No staging re-export was required.

## Isolation evidence

Both restore environments used separate containers and volumes:

- primary rehearsal: `gist2-r2-db-20261011`;
- destructive drill: `gist2-r2-drill-db-20261011`;
- internal-only network: `gist2-r2-net-20261011`;
- no published host ports;
- no application, Edge Function, scheduler, notification or worker container;
- no restored Vault data or service credentials;
- no remote network route through the Docker network.

The existing non-disposable `supabase_db_betweener-app` stack was not used or modified and remained healthy throughout. After validation, both disposable containers, both volumes and their internal network were deleted. Zero `gist2-r2-*` Docker resources remain.

## Restore result

Initial baseline restore:

- schema/role/history/data restore: PASS;
- baseline restore duration after container readiness: `35.884` seconds;
- restored ledger: 231;
- restored Gists: 4;
- restored reader states: 1;
- reader-state-to-Gist orphans: 0;
- RLS enabled on both legacy Gist tables;
- legacy reader RPC signatures present.

Required disposable-environment substitutions:

1. Added a local `NOLOGIN` `supabase_realtime_admin` compatibility role because the bare PostgreSQL image did not create the role expected by the source role dump.
2. Enabled source-compatible `postgis`, `pg_trgm` and `unaccent` extensions in `public`.
3. Restored Gist data with `session_replication_role=replica` because profile, Circle and Auth table data was intentionally excluded.
4. Created one local-only minimal `auth.users` placeholder for an already-exported Gist author UUID. It contained no email, password, token or user metadata and existed only to exercise migration 3's authored-user FK backfill.
5. Enabled the existing `app.profile_guard_write=on` GUC only inside pgTAP fixture sessions because the restored staging schema correctly blocks direct profile fixture creation otherwise.

These substitutions affect local environment fidelity but not Gist IDs, content, reader-state values, RPC definitions, grants or migration behavior.

## Migration rehearsal

The five migrations were applied in approved order only. Migrations 1 and 2 passed immediately. The first migration 3 attempt failed on the omitted Auth dependency and rolled back fully. After creating the privacy-preserving local Auth placeholder, migrations 3, 4 and 5 passed.

| Version | Final result | Duration |
| --- | --- | ---: |
| `20261010120000` | PASS | 3.239 s |
| `20261010121000` | PASS | 1.210 s |
| `20261010130000` | PASS after local Auth placeholder | 0.740 s |
| `20261010140000` | PASS | 0.631 s |
| `20261010150000` | PASS | 0.588 s |

The disposable ledger was advanced with rehearsal-only provenance after each successful file. Final ledger count: 236, containing exactly the five approved versions.

## Data preservation and compatibility

Pre- and post-migration hashes were identical:

| Protected set | Before | After |
| --- | --- | --- |
| Legacy Gist IDs | `5068ba461d107a53c568384efdf69c83` | same |
| Reader-state relationship/value projection | `4a0a852d71f3296129091c7d7089e4a4` | same |
| Legacy Gist content/status projection | `6c17487fca9395a821bf4892dde96c7d` | same |

Post-migration database evidence:

- 4 legacy Gists, 1 reader state;
- 4 editions, 4 revisions and 4 primary variants;
- zero state-to-Gist, edition-to-legacy-Gist, revision-to-edition or variant-to-revision orphans;
- zero missing legacy backfill bindings or current revisions;
- all 18 new Gist tables have RLS enabled;
- direct authenticated reads of reaction and Reflection tables remain denied;
- legacy global reader and legacy state-upsert RPC signatures remain present;
- zero enabled AI environment policies;
- only the pre-existing `relationship_gists_short_body_length` compatibility constraint remains `NOT VALID`, matching its additive legacy migration design.

## Test results

| Suite | Result |
| --- | --- |
| pgTAP editorial capabilities | PASS, 23/23 |
| pgTAP reader state V2 | PASS, 33/33 |
| pgTAP editorial V2 | PASS, 43/43 |
| pgTAP AI Editorial Studio | PASS, 48/48 |
| pgTAP reader engagement | PASS, 49/49 |
| pgTAP total | PASS, 196/196 |
| Focused Node Gist/Circles compatibility | PASS, 46/46 |
| Jest outbox/state/Saved Library | PASS, 17/17 across 4 suites |

The database tests used synthetic identities and rolled back their fixtures. No AI provider request occurred.

## Recovery drill

1. Restored the predeployment backup into a second isolated container.
2. Executed a deliberately failing transaction that created a drill marker and raised an error before commit.
3. Detected the nonzero migration exit and stopped; no subsequent migration ran.
4. Verified the marker table did not exist, proving rollback.
5. Verified the ledger remained 231 and both Gist identity and reader-state hashes remained unchanged.
6. Deleted only the disposable failed-drill container and volume.
7. Recreated the isolated database from the same encrypted-backup source files.
8. Reverified ledger, Gist/state counts and hashes, legacy reader RPC and reader-state RLS.

Measured full recovery time from failed-clone deletion through verified restore: `57.376` seconds on this workstation. This is an observed local rehearsal RTO, not a promise for Supabase-hosted physical restoration.

## Recovery point and data-loss window

The logical Gist snapshot represents staging data at the `2026-10-11T13:21:39Z` to `13:22:20Z` backup window. Its Gist-specific RPO is the time between that snapshot and a future incident. If Gist/editorial/state writes continue before deployment, those later changes are not in this artifact.

Immediately before a separately authorized live migration:

1. reverify project identity and health;
2. reverify 231 applied and exactly five pending migrations;
3. verify both encrypted recovery files and their hashes;
4. record any Gist/state writes after the snapshot and either accept that RPO or take another authorized recovery point;
5. keep all Gist 2.0 feature flags disabled;
6. stop on the first migration error and do not force ledger entries.

## Recovery limitations

- This artifact is Gist-specific, not a full staging-data export.
- Auth, profiles and Circles data were intentionally excluded; the restore rehearsal used local placeholders/trigger suppression for those external FK dependencies.
- Storage objects, Edge Functions, Auth configuration, Realtime configuration and third-party secrets are outside the logical artifact.
- The archive key is DPAPI-bound to the current Windows user profile.
- The 57.376-second RTO applies only to the tested local data volume and hardware.
- The existing daily physical backup remains the whole-database fallback; PITR remains disabled.

## Recommended next gate

Recovery readiness no longer blocks a separately authorized staging-only migration deployment. The next gate should be a fresh, read-only identity/ledger/artifact preflight followed by explicit authorization for exactly the five Gist migrations. Edge Function deployment, feature-flag enablement and device testing remain separate later gates.

`STAGING_BACKUP = PASS`

`ISOLATED_RESTORE = PASS`

`RECOVERY_DRILL = PASS`

`DATA_PRESERVATION = PASS`

`RECOVERY_READINESS = PASS`

`STAGING_MIGRATION_GO_NO_GO = GO`

`STAGING_DEPLOYMENT_AUTHORIZED = NO`

`PRODUCTION_MODIFICATIONS = NONE`

`STAGING_MODIFICATIONS = NONE`

`DEPLOYMENTS = NONE`

`COMMITS = NONE`
