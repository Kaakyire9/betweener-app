# Relationship Gist 2.0 - Milestone 5H-R Recovery Readiness

Assessment date: 2026-10-11 (Europe/London)

## Executive decision

Betweener Staging has a real database-recovery capability, but the release gate is not yet closed. Seven completed daily physical backups are visible and Supabase supports restoring an eligible physical backup into a new, isolated project. However, the newest visible recovery point predates this assessment, PITR is disabled, there is no supported CLI action to create a physical backup on demand, and no isolated restore has been rehearsed.

No backup was downloaded, no private staging data was exported, no project was created, and no restore was started. The five Relationship Gist 2.0 migrations remain undeployed.

`STAGING_MIGRATION_GO_NO_GO = NO_GO`

## Scope and verified identity

| Item | Verified result |
| --- | --- |
| Source project | `xsgzxadwuxuziubglvps` / `betweener-staging` |
| Region | `eu-north-1` |
| Database status | `ACTIVE_HEALTHY` |
| CLI | Supabase CLI `2.118.0` |
| Migration ledger | 231 matched; exactly five approved Gist migrations pending; zero remote-only |
| Candidate | 55-file Relationship Gist 2.0 payload; previously verified 55/55 |
| Remote mutations in this assessment | None |

This document is release evidence only and is not part of the 55-file deployment payload.

## Recovery capability assessment

### Current backup inventory

The authenticated, read-only backup listing returned:

- physical/WAL-G backup mode enabled;
- PITR disabled;
- seven completed physical backups;
- visible recovery points from 2026-10-04 through 2026-10-10;
- newest completed recovery point: `2026-10-10T23:17:26.556Z`.

At the 2026-10-11 14:05 Europe/London inspection time, the newest visible backup was approximately 13 hours 48 minutes old. Its recovery-point objective is therefore the interval from that timestamp to the incident or deployment failure. With daily backups and no PITR, the worst normal data-loss window can approach 24 hours.

Supabase documents that paid projects receive daily backups and that physical backups are not directly downloadable. Supabase also states that project restoration causes downtime and its duration depends primarily on database size. See [Database Backups](https://supabase.com/docs/guides/platform/backups).

### Supported mechanisms

| Mechanism | Availability | Scope | Restrictions and suitability |
| --- | --- | --- | --- |
| Existing daily physical backup | Verified | Whole PostgreSQL database at the selected recovery point | Seven completed points exist. Not directly downloadable. In-place restore would make Staging unavailable and is prohibited in this milestone. |
| Restore physical backup to a new project | Supported, execution unverified | Database-only clone into an independent Supabase project | Paid-plan feature; physical backups must be enabled; target is created in the same region and incurs cost. Requires a separate remote-project creation/restore authorization. |
| PITR | Unavailable for this project | Whole database to a selected time | `pitr_enabled=false`. Enabling it changes billing/configuration and is explicitly outside scope. |
| On-demand physical backup | Not exposed by installed CLI or current documented Management API flow | N/A | CLI `backups` provides `list` and PITR `restore`; it does not provide `create`. A fresh physical point must come from the next automatic backup unless Supabase Support confirms another supported route. |
| Logical schema/role/data export | Supported, not executed | Configurable database schemas and data | Requires authorized database credentials and creates a copy of private staging data. Supabase CLI supports role-only, schema, data-only, schema selection, and table exclusions. |
| Schema-only export | Supported, not executed | Functions, triggers, RLS, grants, constraints, indexes and schema objects in selected schemas | Useful for structural recovery and review; does not protect current content or reader state. |
| Selected-table export | Supported through `pg_dump`; CLI only exposes schema inclusion and data exclusions | Gist data plus a complete dependency closure | Easy to produce an inconsistent or unrestorable subset. Must include referenced identities and preserve foreign-key order. Not a full-project recovery mechanism. |
| Migration replay plus synthetic fixtures | Already locally validated, but not a backup restore | Schema and test-only data | Proves migration behavior, not recovery of staging content, Auth identities or real reader state. It must not be called a restore rehearsal. |

Official references: [Restore to a new project](https://supabase.com/docs/guides/platform/clone-project), [Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), and [Migrating within Supabase](https://supabase.com/docs/guides/platform/migrating-within-supabase).

### What a physical clone transfers

Supabase's current restore-to-new-project flow transfers the database schema, tables, views, procedures, data, indexes, database roles and permissions, Auth user records and password hashes, and the encryption root key. The encryption key transfer matters because Vault secrets and encrypted columns remain readable in the clone.

It does **not** fully reproduce the Supabase project. Storage objects and bucket settings, Edge Functions, Auth configuration and API keys, Realtime configuration, database extension settings, and read replicas require separate configuration. Database backups contain Storage metadata, not the underlying Storage objects, so deleted files are not recovered by a database restore.

The clone flow is a binary restore. Supabase warns that `pg_net`, `pg_cron`, wrappers and similar external-operation extensions begin operating when the clone completes and cannot be excluded or paused during that restore. That makes an unprepared physical clone unsafe for this application until outbound jobs, webhooks and integrations have an approved containment plan.

### Privilege and billing requirements

- Backup-list inspection requires authenticated project access and is working.
- Restore-to-new-project requires paid-plan eligibility, physical backups and permission to create a project. The new project incurs additional cost.
- A logical export requires a database connection credential with sufficient read/catalog privileges. It must not use an application client key.
- A logical restore needs owner-level database rights on the disposable destination and may require manual handling of managed-schema customizations and role ownership.
- Restoring to live Staging, creating an isolated Supabase recovery project, exporting private data, or changing billing each needs separate explicit authorization.

## Recommended recovery strategy

### Recommended predeployment recovery point

Use a two-tier strategy:

1. **Full-project safety net:** wait for and positively verify a completed automatic physical backup taken after an agreed staging write freeze and immediately before deployment. Record the backup timestamp, release ID, backup retention deadline, accountable restore operator and accepted RPO.
2. **Gist migration recovery kit:** with separate authorization, take an encrypted logical export during the same freeze. The export must contain the exact Gist dependency closure and migration ledger. Restore that export into an isolated disposable database and run the verification suite before the release gate can move to GO.

The physical backup is the authoritative whole-database recovery path. The logical kit is the safer rehearsal and targeted-recovery path because SQL can be inspected and external jobs removed before execution. A logical restore does not automatically carry the source encryption root key and therefore is not a substitute for complete Supabase project recovery.

If the operator will not authorize private-data export, the alternative is a separately authorized physical clone into a new Supabase project. Before that clone, the team must accept the cost and establish containment for cron jobs, webhooks, wrappers, Vault-backed integrations and any other outbound effects.

### Consistency requirements for a logical recovery point

The official Supabase workflow creates role, schema and data SQL files separately. Those separate commands are not, by themselves, proof that all files share one database snapshot. For a release recovery artifact, use one of these controls:

- hold an application/database write freeze for the complete export window and verify no writes occurred; or
- use a database-engineer-reviewed `pg_dump` snapshot/archive process that guarantees one consistent snapshot for schema and data, while separately preserving roles and migration history.

The export must fail closed on errors, record tool versions, hash every artifact, and test restoration before acceptance. Do not log connection strings or passwords.

## Logical recovery scope

### Full-project recovery

A full-project database recovery must include all database schemas and dependencies, not only `public`. It must also preserve:

- Auth database data and identity references;
- migration history in `supabase_migrations`;
- database roles, grants and ownership;
- extensions and extension versions;
- custom objects in managed schemas such as Auth/Storage triggers or policies;
- publication configuration and any replication dependencies;
- Vault/encrypted-column requirements, handled according to the chosen restore mechanism;
- a separate inventory for Storage objects, Edge Functions, Auth/API settings, Realtime and external service secrets because database restore alone does not recover them.

### Gist-specific recovery

The minimum Gist-specific recovery set is not just tables whose names begin with `relationship_gist`. It must include schema objects, data and dependency rows for:

- legacy: `public.relationship_gists`, `public.relationship_gist_user_states`;
- state idempotency: `public.relationship_gist_state_mutation_receipts`;
- editorial: `public.relationship_gist_editions`, `public.relationship_gist_revisions`, `public.relationship_gist_revision_variants`, `public.relationship_gist_editorial_audit_events`;
- AI editorial: `public.relationship_gist_ai_environment_policies`, `public.relationship_gist_ai_topic_calendar`, `public.relationship_gist_ai_generation_jobs`, `public.relationship_gist_ai_job_events`, `public.relationship_gist_ai_draft_metadata`, `public.relationship_gist_ai_source_suggestions`, `public.relationship_gist_specialist_assignments`, `public.relationship_gist_specialist_reviews`;
- engagement: `public.relationship_gist_reactions`, `public.relationship_gist_reflections`, `public.relationship_gist_engagement_receipts`, `public.relationship_gist_reader_events`, `public.relationship_gist_engagement_rate_limits`;
- referenced identities and authorization data: the necessary `auth.users`, `public.profiles` and `public.internal_admins` rows, handled as protected personal/security data;
- `pg_trgm` plus every other extension used by the baseline database;
- all Gist functions/RPC overloads, triggers, RLS policies, grants, constraints, indexes and sequences;
- `supabase_migrations` records for the legacy Gist migration and the five Gist 2.0 migrations;
- all current legacy-Gist-to-edition-to-revision mappings and reader-state foreign-key relationships.

A selected-table export is acceptable only after an FK dependency query proves the closure. It cannot be used as a general disaster-recovery substitute.

## Privacy and backup security controls

No staging data was exported during this milestone. Any future logical export must meet all of these controls:

1. Use a named, authorized operator and least-privileged temporary database access.
2. Store artifacts outside the source repository and outside cloud-synced user folders.
3. Use an encrypted volume plus encrypted-at-rest backup packaging; protect any transport with TLS.
4. Set filesystem ACLs to the operator/release group only. Do not use shared temp folders.
5. Never embed credentials in filenames, scripts, command history, reports or CI logs.
6. Disable verbose row output and redact errors that could contain user content.
7. Hash artifacts separately and store the checksum without the backup data.
8. Define retention before export: recommended maximum is seven days after a successful staging deployment and recovery-gate closure, unless policy requires shorter retention.
9. Securely delete the rehearsal database and export at the retention deadline, then record deletion evidence.
10. Treat Auth rows, profile data, saved-state, reflections, reactions and reader events as private data. Do not inspect content during rehearsal; validate counts, keys and constraints only.
11. Exclude secrets that are not required. A physical clone carries the encryption root key and potentially readable Vault data, so access must be at least as restricted as source Staging.

## Isolated restore rehearsal

### Result

`RESTORE_REHEARSAL = PENDING`

No existing physical backup was restored because doing so would create a remote project, incur cost and risk activating external jobs. No logical backup was available in an approved secure location, and this milestone did not authorize exporting private staging data. The previous disposable-database migration tests used synthetic fixtures and are not counted as recovery proof.

### Exact future rehearsal procedure

The following steps require separate explicit authorization and a named operator:

1. Establish a change window and stop application, editorial and background writes to Staging.
2. Reverify source ref `xsgzxadwuxuziubglvps`, region `eu-north-1`, health, migration ledger and candidate hashes.
3. Choose one recovery source:
   - verify a new completed daily physical backup created after the write freeze; or
   - create a consistent encrypted logical recovery set under the privacy controls above.
4. Record recovery timestamp, RPO, retention deadline, tool versions and SHA-256 checksums. Never record credentials.
5. Positively identify the destination as disposable and isolated. It must not share production/staging URLs, keys, queues, webhooks, notification credentials or third-party endpoints.
6. For a physical clone, first complete an outbound-effects inventory and obtain cost approval. Because jobs can start immediately, do not clone until every external effect has an accepted containment strategy.
7. For a logical restore, inspect schema SQL before execution and remove or neutralize external cron/webhook/wrapper definitions. Restore with `ON_ERROR_STOP` and a single transaction where supported.
8. Restore migration history separately if the logical workflow did not include `supabase_migrations`.
9. Validate without displaying row content:
   - expected schemas, extensions and extension versions;
   - all legacy and Gist 2.0 tables;
   - row counts and deterministic aggregate checksums;
   - zero orphaned `legacy_gist_id`, edition, revision, variant, saved-state, reaction and reflection references;
   - one valid current/published revision relationship per applicable edition;
   - existing legacy Gist IDs unchanged;
   - exact legacy and V2 RPC names, argument signatures, return types and security-definer/search-path properties;
   - all RLS-enabled flags, policies, grants and function execute privileges;
   - immutable audit/event triggers and revision guards;
   - `supabase_migrations` ledger parity;
   - old-client reader calls and saved-state operations against test identities only.
10. Apply the five approved migrations to the disposable destination only, then repeat the verification and compatibility suite.
11. Restart/reconnect the disposable database and repeat identity, relationship and RPC checks to prove persistence.
12. Measure dump, restore and validation duration. Record the observed RTO; do not substitute estimates.
13. Destroy the disposable destination and backup artifacts according to retention policy, and record disposal evidence.
14. Re-enable staging writes only after the rehearsal is complete or the change window is abandoned.

## Recovery-time and data-loss estimates

| Measure | Current conclusion |
| --- | --- |
| Physical-backup RPO | Newest verified point is `2026-10-10T23:17:26.556Z`; daily-backup RPO can approach 24 hours. |
| PITR RPO | Not available because PITR is disabled. |
| Logical predeployment RPO | Can approach the write-freeze boundary, but only after an authorized, consistent export completes and is verified. |
| Full physical-clone RTO | Unknown until rehearsed; Supabase states duration depends on database volume and resource attributes. |
| Logical restore RTO | Unknown until dump size and restore/validation timings are measured. |
| Targeted Gist corrective RTO | Expected to be lower than full restore, but no defensible duration exists without rehearsal. |

The release plan must not promise a numeric RTO until a rehearsal produces one.

## Failure and recovery scenarios

### Failed migration before commit

Each approved migration is transaction-wrapped. If a migration errors and its transaction rolls back, stop the sequence, capture redacted diagnostics, verify ledger/schema/data invariants, and correct with a reviewed migration. Full restore is unnecessary when the transaction cleanly rolled back and invariants pass.

### Partially applied five-migration sequence

If earlier migration files committed and a later file failed, do not edit applied migration files or force ledger entries. Stop, inspect the last committed version, and use an additive forward corrective migration. Restore only if committed changes caused unrecoverable data corruption or the predeployment invariants cannot be re-established safely.

### Incorrect editorial permissions

Disable the affected feature flags and block editorial use. Correct grants, RLS or capability functions with an additive migration after comparing against the recovery artifact. Prefer forward correction; full restore would unnecessarily discard unrelated staging activity.

### Broken reader RPCs

Keep reader/engagement flags off and verify legacy overloads. Deploy a forward migration restoring the exact function signatures and behavior. Restore only if function deployment also damaged persistent data and a targeted repair cannot prove integrity.

### Corrupted revision mapping

Stop publication/editorial writes. Compare `relationship_gist_editions`, revisions, variants and legacy IDs against the recovery artifact using IDs and checksums, not content logs. Repair by a reviewed idempotent migration when the intended mapping is deterministic. Restore affected rows or the database only when the source of truth cannot be reconstructed.

### Lost saved-state relationships

Stop reader-state mutation replay. Verify `profiles`, legacy Gist IDs, state receipts and FK relationships. Prefer targeted data restoration inside a controlled transaction if the exact rows are recoverable. A whole-database restore is justified only for broad, unbounded loss.

### Unexpected content changes

Disable publication surfaces and preserve immutable audit evidence. If a correct prior revision exists, use the product's forward rollback-by-new-revision workflow. Use targeted row recovery from an isolated backup clone for deleted/corrupted content; avoid restoring the entire database for a limited editorial error.

### When full restoration is appropriate

Use whole-database restoration only for widespread or unbounded corruption, failure of database-level invariants across domains, loss that cannot be deterministically corrected, or a security incident requiring return to a trusted recovery point. Additive schema releases should normally be recovered with forward corrective migrations because full restore also rewinds unrelated Auth, Chat, Circles, monetization and user-state activity.

## Remaining authorization requirements

The following are still required before recovery readiness can pass:

1. Authorization to create a fresh logical staging recovery set **or** to wait for and designate a post-freeze automatic physical backup.
2. Authorization and budget approval for an isolated Supabase recovery project if the physical-clone route is selected.
3. Approval to process private staging data in a local/disposable restore environment, including location, ACL, encryption and retention.
4. A named recovery operator and incident decision owner.
5. An external-effects containment review for `pg_net`, `pg_cron`, wrappers, webhooks and Vault-backed destinations.
6. A completed rehearsal with measured RTO, verified integrity, verified legacy compatibility and deletion evidence.
7. Immediate predeployment refresh of project identity, backup freshness, migration ledger and release-candidate hashes.

## GO/NO-GO recommendation

The mechanisms are understood and the project has recoverable daily physical points, but recoverability has not been operationally proven. A physical backup that has not been restored is evidence of backup existence, not evidence of successful recovery. The correct release decision remains `NO_GO` until a fresh recovery point and an isolated restore rehearsal are verified.

`RECOVERY_CAPABILITY = PARTIAL`

`FRESH_RECOVERY_POINT = PENDING`

`RESTORE_REHEARSAL = PENDING`

`RECOVERY_READINESS = CONDITIONAL_PASS`

`STAGING_MIGRATION_GO_NO_GO = NO_GO`

`STAGING_DEPLOYMENT_AUTHORIZED = NO`

`PRODUCTION_MODIFICATIONS = NONE`

`STAGING_MODIFICATIONS = NONE`

`DEPLOYMENTS = NONE`
