# Relationship Gist 2.0 — Milestone 5H-A Predeployment Verification

Validation date: 2026-10-11 (Europe/London)

Execution mode: read-only predeployment verification. No remote writes were performed.

## Verdict

| Gate | Result | Evidence |
| --- | --- | --- |
| Release candidate integrity | PASS | Baseline, patch and 55/55 payload hashes match Milestone 5G |
| Dedicated staging identity | PASS | Authenticated project metadata identifies `xsgzxadwuxuziubglvps` as healthy Betweener Staging |
| Exact remote migration set | PASS | 231 versions match, exactly five approved versions are local-only, and zero versions are remote-only |
| Baseline/data preservation | CONDITIONAL_PASS | Additive/backfill design is compatible; current remote counts and IDs are unverified |
| Recovery readiness | UNVERIFIED | Seven completed physical backups exist, but PITR is disabled and no restore-rehearsal or fresh predeployment recovery-point evidence exists |
| Static security review | CONDITIONAL_PASS | No critical static grant/RLS issue found; current remote roles, grants and policies remain unverified |
| Legacy compatibility | PASS | Stable IDs and legacy RPC signatures are preserved by source and prior exact-candidate tests |
| Feature flags | PASS | Reader V2, Editorial V2, AI Studio, engagement, reactions, Reflections and analytics remain fail-closed/default-off |
| Production isolation | PASS | Proposed procedure names only the staging ref and rejects the production ref |

Current recommendation: `NO_GO`. Candidate integrity, staging identity and the migration ledger now pass. Recovery remains a critical unresolved gate, and the current authenticated Gist data baseline is still incomplete.

## Release candidate integrity

| Property | Verified value |
| --- | --- |
| Candidate root | `C:\Projects\betweener-gist2-rc-5f-20261011` |
| Candidate form | Clean-HEAD archive plus reviewed patch; no candidate-local `.git` directory |
| Baseline HEAD | `f560559b6a3ef09ecb7fd7dfadf9bd742a88184a` |
| Original repository current HEAD | `f560559b6a3ef09ecb7fd7dfadf9bd742a88184a` |
| Original repository branch | `feature/betweener-live` |
| Payload | 55 files; 55/55 current SHA-256 entries match |
| Patch bytes | `2058365` |
| Patch SHA-256 | `3680A0BA286F9EF39E98319AFE8A5E136C4DE1CE9308EF75240638BD2CEA03D6` |
| Unrelated Live payload paths | `0` |
| Gist migrations in payload | Exactly five |
| AI Edge Function in payload | `relationship-gist-ai-draft`; present but not deployed |

The current candidate matches the Milestone 5G identity. `app.config.js`, `eas.json`, `package.json` and `package-lock.json` retain the exact Git blob IDs from baseline HEAD:

| Path | Git blob |
| --- | --- |
| `app.config.js` | `278c398f4e39c3828269a6c8e87f18cb3774e1f7` |
| `eas.json` | `1ee63cb586ffdfc68a013a89aeb37b8536e64154` |
| `package.json` | `fda3f5d8e44052d87af8766377b5e0bcae4bfc3f` |
| `package-lock.json` | `7a9798457657b48de3be6cc507d501a45f0d16e6` |

The original dirty worktree was inspected read-only and was not modified. Its 49 tracked Live Studio deletions remain outside the 55-file candidate payload.

`RC_INTEGRITY = PASS`

## Approved migration allowlist

These hashes are for the current candidate bytes and match `.release/payload-sha256.md`.

| Order | Migration | SHA-256 |
| ---: | --- | --- |
| 1 | `20261010120000_relationship_gist_editorial_capability_hardening.sql` | `C61E95207DD6BC2803A6C0F90C91BAA9F98560C50FD207C5632D54C106F10BFD` |
| 2 | `20261010121000_relationship_gist_reader_state_idempotency.sql` | `5B90B9F86D72F92AC42913C39F0E9B20BE5A4CCDFEF79FCD57D6397A32C4801D` |
| 3 | `20261010130000_relationship_gist_editorial_v2.sql` | `9D6FDE25819D3D2E07A81C32524B4756502ACF2164EE829EE7DF95C5CDA9887A` |
| 4 | `20261010140000_relationship_gist_ai_editorial_studio.sql` | `EB55BF58E30B8D38E446E18CBA15137F73126AAC3C50411B93B349D6038002D5` |
| 5 | `20261010150000_relationship_gist_reader_engagement.sql` | `6B13E3618D34E9E14A9F5CF049B8D4C8F1FE5AECA39793CBFAE0B77A62D6ED13` |

Each file contains one explicit `BEGIN`/`COMMIT`, contains no `CREATE INDEX CONCURRENTLY`, and contains no table, column, schema or extension drop. Trigger replacement is limited to triggers introduced on the new Gist 2.0 tables. Runtime reaction/reflection RPCs contain user-requested deletes; those deletes are function bodies and are not executed by migration application.

Static dependency order is valid:

1. action-specific editorial authorization;
2. additive legacy reader-state columns, receipts and V2 mutation RPC;
3. editions, revisions, variants, audit events and compatibility adapters;
4. `pg_trgm`, AI draft/job metadata and draft-only service RPCs;
5. reaction, private Reflection and analytics event storage.

The candidate contains 228 pre-Gist migrations plus the five allowlisted migrations. The expected staging history has three additional, already-applied staging-only files that are not candidate payload:

| Expected history-only migration | Local evidence SHA-256 |
| --- | --- |
| `20261007180000_admin_operations_context.sql` | `33D1843981FBF5D1B3E0789F553610F4E9DCBC90ADD739553A1FB11DA50863F8` |
| `20261007223000_circle_staging_readiness_hardening.sql` | `7C2070679B96B698A82ACF90EF8923C405530AC3D15BDD42C7C85FD3EF8A451E` |
| `20261008090000_relationship_gist_staging_fixtures.sql` | `6249F6B9109741F2F91A28A841D860BA8A5FECF6CFADD1AA9B4964270D465A9E` |

Those files must appear as already applied in the remote ledger. If any is pending, the deployment stops; the staging fixture migration must never be replayed as part of this release.

## Positive staging identity verification

Expected identities:

| Surface | Expected identity | Local evidence |
| --- | --- | --- |
| Supabase | `xsgzxadwuxuziubglvps` | `app.config.js`, isolation verifier, and current original-worktree `.temp/project-ref` agree |
| Supabase URL | `https://xsgzxadwuxuziubglvps.supabase.co` | Staging verifier source |
| EAS | `7f38a835-2da7-419b-a20b-e1a12e021547` | `app.config.js` and staging profiles |
| Mobile package/bundle | `com.aduboffour.betweener.staging` | `app.config.js`, Android/iOS verifiers |
| Production Supabase ref to reject | `jbyblhithbqwojhwlenv` | Production identity in unchanged config |

The isolated candidate deliberately has no `.temp/project-ref`. The original repository remains linked to the expected staging ref, but the future migration command must not trust that mutable link.

Supabase CLI `2.118.0` was invoked only for read-only metadata. Initial 5H-A attempts returned `401 Invalid access token`. During blocker resolution:

- `SUPABASE_ACCESS_TOKEN` was absent from Process, User and Machine scopes;
- no plaintext `~/.supabase/access-token` file existed, indicating native credential storage;
- no login command or token mutation was performed by Codex;
- the existing native session subsequently authenticated successfully;
- `projects list` identified `xsgzxadwuxuziubglvps` as `betweener-staging`, `ACTIVE_HEALTHY`, region `eu-north-1`, PostgreSQL `17.6.1.166`;
- the project was marked linked and the local link file remained unchanged at `xsgzxadwuxuziubglvps`;
- explicit-project migration and backup queries succeeded.

The earlier 401 was an account-token authentication failure, not a project authorization failure. The available evidence cannot distinguish an expired/revoked native token from a transient credential/session condition, so no more specific cause is asserted. Current access is valid for the required read-only staging checks.

`CLI_AUTHENTICATION = RESTORED`

`STAGING_IDENTITY = PASS`

## Migration ledger

An explicit-project read-only ledger query was run with `--project-ref xsgzxadwuxuziubglvps`; it did not rely on or modify the project link.

| Ledger state | Count |
| --- | ---: |
| Local and remote matched | 231 |
| Local-only pending | 5 |
| Remote-only | 0 |
| Total compared | 236 |

The local-only versions are exactly `20261010120000`, `20261010121000`, `20261010130000`, `20261010140000` and `20261010150000`. The three staging-only history migrations are matched remotely. No unrelated migration is pending and none of the five Gist versions has already been applied.

Supabase documents that `migration list` compares local filenames with `supabase_migrations.schema_migrations` by timestamp. A future operator must capture that output using an explicit staging database URL and an aligned 231-file history bundle before any write command. See the [Supabase CLI migration reference](https://supabase.com/docs/reference/cli/supabase-migration-list).

This closes the migration-selection blocker. The operator must repeat the explicit-project ledger comparison immediately before execution because remote state can change.

`MIGRATION_SET = PASS`

`MIGRATION_LEDGER = PASS`

## Baseline and data preservation

Historical evidence reports four published staging Gists and one reader-state row. The staging fixture source defines these non-personal Gist IDs:

- `91000000-0000-4000-8000-000000000001`
- `91000000-0000-4000-8000-000000000002`
- `91000000-0000-4000-8000-000000000003`
- `91000000-0000-4000-8000-000000000004`

They are expected fixture identities, not current remote proof. No member identifier or reading-history content is included here.

Static preservation properties:

- migration 2 adds six nullable/defaulted columns to `relationship_gist_user_states`; it does not recreate or delete state rows;
- the original `rpc_upsert_relationship_gist_user_state(uuid,boolean,double precision,timestamptz,boolean,text)` signature remains and is replaced compatibly;
- migration 3 retains each legacy Gist ID as both `relationship_gist_editions.id` and `legacy_gist_id`;
- each global legacy Gist receives one revision and one perspective variant only when missing;
- `relationship_gist_user_states.gist_id` continues to reference the unchanged legacy `relationship_gists.id`;
- current reader and Saved Library adapters continue to resolve legacy IDs;
- all new private/editorial tables enable RLS and revoke direct access from `public`, `anon` and `authenticated`.

The staging anonymous client configuration was used for one restricted read-only metadata request after positively checking its URL ref. It returned zero anonymously visible global rows. Because RLS can intentionally hide rows, this is not evidence that the expected fixtures are absent. No authenticated user token, service-role key or privileged ad-hoc SQL was used. Current published-row counts, reader-state aggregates, RPC definitions, orphan counts, grants, constraints, indexes and `internal_admins.role` distribution therefore remain to be captured by the approved privacy-preserving baseline procedure.

`BASELINE_VERIFICATION = CONDITIONAL_PASS`

## Recovery readiness

All five migrations are individually transaction-wrapped. A failed statement should roll back that migration; successful earlier migrations remain applied. Because each stage preserves the legacy reader contract and all new client flags remain off, an interrupted sequence is designed to leave installed legacy clients usable. This must still be verified against the actual staging database after every migration.

No down migration is approved. Normal correction is forward-only. Disabling feature flags does not undo schema changes.

The explicit staging backup inventory reports:

| Property | Verified value |
| --- | --- |
| Region | `eu-north-1` |
| WAL-G/physical backups | Enabled |
| PITR | Disabled |
| Completed physical backups visible | 7 |
| Oldest visible completed backup | 2026-10-04 |
| Latest completed backup | `2026-10-10T23:17:26.556Z` |

Actual backup availability is therefore verified. The installed CLI restore command is PITR-only, while this project reports PITR disabled. Supabase documents Dashboard restoration for daily backups, that restore causes downtime, and that actual duration depends on database size and activity. No restore rehearsal or newly completed predeployment recovery point was available. See [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups).

A GO requires:

1. a completed staging recovery point created before migration 1;
2. recorded recovery-point timestamp, retention, RPO and operator ownership;
3. a documented restore path and acceptable downtime;
4. evidence of a restore rehearsal to a disposable project, or explicit owner acceptance of the unrehearsed limitation;
5. confirmation that required Storage objects are out of scope, because database backup restoration does not restore deleted Storage objects.

`RECOVERY_READINESS = UNVERIFIED`

## Editorial authorization and RLS preflight

Static review found no unresolved critical source-level privilege escalation:

- `has_relationship_gist_editorial_capability` is `SECURITY DEFINER`, fixes `search_path`, is executable only by `service_role`, and maps existing roles narrowly;
- `operations`: read, draft, publish, archive;
- `moderation`: read and safety review only;
- `super_admin`: all declared editorial capabilities;
- quality approval remains `super_admin` only;
- self-approval and publication/review separation checks exist in transition RPCs;
- all security-definer functions set a fixed `search_path`;
- authenticated users receive RPC execution where required, but RPC bodies enforce `auth.uid()`, ownership and action-specific authorization;
- AI worker claim/complete/fail RPCs revoke authenticated access, require `auth.role() = 'service_role'`, and have draft-only effects;
- reader mutations require the supplied owner to equal `auth.uid()`;
- mutation receipts are keyed by account/profile and operation ID and have no direct authenticated table access;
- reaction, Reflection, receipt, analytics and rate-limit tables enable RLS and revoke direct authenticated access;
- private Reflection text is not copied into reader analytics events;
- immutable revision, variant and audit-event triggers reject prohibited mutation.

Remote confirmation remains mandatory after each migration:

- enumerate `internal_admins.role` values and counts only;
- confirm no unexpected `anon`/`public` execute grants;
- confirm authenticated users have no direct privileges on private Gist 2.0 tables;
- confirm RLS is enabled on every new table;
- confirm helper/service RPCs are service-role-only;
- execute authenticated negative tests for operations, moderation, unrelated users and self-approval;
- do not invoke any publishing, AI job or content-mutating RPC during the database-only deployment gate.

## AI and mobile isolation

The migration-only procedure does not deploy `relationship-gist-ai-draft`, insert or enable an AI environment policy, invoke OpenAI, publish content, change EAS configuration, build a client, publish an OTA, or enable any feature flag. Migration 4 creates dormant database structures only. Source configuration remains unchanged from baseline.

## Unresolved blockers

1. Capture privacy-preserving authenticated baseline counts, fixture IDs, orphan checks, RPC signatures, grants, RLS and extensions.
2. Create or select a fresh completed predeployment recovery point.
3. Provide restore-rehearsal evidence or explicit owner acceptance of the unrehearsed daily-backup limitation, including expected RPO/downtime and a restore owner.
4. Repeat identity, ledger and backup inventory checks immediately before any separately authorized migration execution.

`MILESTONE_5H_A_PREFLIGHT = CONDITIONAL_PASS`

`STAGING_MIGRATION_GO_NO_GO = NO_GO`

`STAGING_DEPLOYMENT_AUTHORIZED = NO`

`PRODUCTION_MODIFICATIONS = NONE`

`STAGING_MODIFICATIONS = NONE`

`DEPLOYMENTS = NONE`

`COMMITS = NONE`
