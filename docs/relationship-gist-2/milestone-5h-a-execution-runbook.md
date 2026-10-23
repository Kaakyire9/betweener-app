# Relationship Gist 2.0 — Milestone 5H-A Proposed Staging Execution Runbook

Status: proposed only. Do not execute until the owner authorizes the exact staging database migration in a later instruction and every precondition below is PASS.

## Safety model

- Target only Supabase project `xsgzxadwuxuziubglvps`.
- Reject production ref `jbyblhithbqwojhwlenv` anywhere in the connection path.
- Never rely on the current CLI link.
- Never echo, log or save the database URL, password or access token.
- Use `supabase migration up`, not `supabase db push`.
- Build a phase-specific migration directory whose read-only ledger comparison proves exactly one allowlisted migration is pending.
- Stop after every migration for a human checkpoint.
- Never use `migration repair`, `db reset`, `db pull`, a destructive down migration or ad-hoc ledger writes.

## Preconditions

All items must be recorded in the release ticket before execution:

1. explicit owner authorization for this exact five-migration staging deployment;
2. release candidate baseline `f560559b6a3ef09ecb7fd7dfadf9bd742a88184a`;
3. patch SHA-256 `3680A0BA286F9EF39E98319AFE8A5E136C4DE1CE9308EF75240638BD2CEA03D6`;
4. 55/55 payload hashes verified;
5. current authenticated account metadata positively identifies staging ref `xsgzxadwuxuziubglvps`;
6. an ephemeral, percent-encoded staging database URL is supplied as `BETWEENER_STAGING_DATABASE_URL`;
7. the URL contains the staging ref and does not contain the production ref;
8. current remote history is exactly 231 migrations and the five approved versions are absent;
9. the three staging-only history versions are present remotely and match reviewed source;
10. no unrelated migration is pending;
11. privacy-preserving baseline snapshot completed;
12. a usable recovery point and restore owner are recorded;
13. all Relationship Gist feature flags are absent or false;
14. `relationship-gist-ai-draft` remains undeployed for this gate;
15. approved operator access and a second reviewer are present.

## Fixed allowlist

```text
20261010120000_relationship_gist_editorial_capability_hardening.sql
20261010121000_relationship_gist_reader_state_idempotency.sql
20261010130000_relationship_gist_editorial_v2.sql
20261010140000_relationship_gist_ai_editorial_studio.sql
20261010150000_relationship_gist_reader_engagement.sql
```

The checksums are recorded in `milestone-5h-a-predeployment-verification.md`. Any mismatch is a hard stop.

## Phase A — authenticate and prove target identity

Use an approved operator profile. Do not put credentials on the command line or in a report.

```powershell
$Supabase = 'C:\Projects\betweener-app\node_modules\.bin\supabase.cmd'
$ExpectedStagingRef = 'xsgzxadwuxuziubglvps'
$RejectedProductionRef = 'jbyblhithbqwojhwlenv'

& $Supabase --version
& $Supabase projects list --output-format json
& $Supabase backups list --project-ref $ExpectedStagingRef --output-format json

if ([string]::IsNullOrWhiteSpace($env:BETWEENER_STAGING_DATABASE_URL)) {
  throw 'BETWEENER_STAGING_DATABASE_URL is required.'
}
if ($env:BETWEENER_STAGING_DATABASE_URL -notmatch [regex]::Escape($ExpectedStagingRef)) {
  throw 'Database URL does not identify the dedicated staging project.'
}
if ($env:BETWEENER_STAGING_DATABASE_URL -match [regex]::Escape($RejectedProductionRef)) {
  throw 'Production database identity detected.'
}
```

Human checkpoint:

- project listing shows the expected staging ref, status and organization;
- backup listing succeeds for that same ref;
- the installed CLI version is recorded and is the reviewed version;
- no production ref appears in the staging execution variables;
- the secret value itself is not printed.

Stop on any identity ambiguity.

## Phase B — prove recovery readiness

Before schema execution, an authorized operator must create or select a consistent recovery point and record:

- backup/PITR type;
- completed timestamp immediately before migration 1;
- earliest/latest recoverable time and retention;
- expected RPO;
- expected downtime/RTO range based on staging database size;
- restore owner and escalation contact;
- restore-rehearsal evidence from a disposable project, or explicit owner acceptance that no rehearsal exists.

Supabase documents that restore makes a project unavailable during the operation and that duration varies with database size and activity: [Database Backups](https://supabase.com/docs/guides/platform/backups). A displayed backup feature without a completed recovery point and usable restore procedure is not sufficient.

If recovery evidence is absent, stop.

## Phase C — privacy-preserving baseline

Run the following through an approved read-only database role or an authorized SQL console in a read-only transaction. Do not export member identifiers or Reflection text.

```sql
begin transaction read only;

select current_database() as database_name,
       current_setting('server_version') as server_version;

select version, name
from supabase_migrations.schema_migrations
order by version;

select id, status, perspective, published_at
from public.relationship_gists
where circle_id is null
order by id;

select count(*) as global_gist_count,
       count(*) filter (where status = 'published') as published_global_gist_count
from public.relationship_gists
where circle_id is null;

select count(*) as reader_state_count,
       count(*) filter (where saved) as saved_count,
       count(*) filter (where progress > 0) as progress_count
from public.relationship_gist_user_states;

select count(*) as orphan_reader_state_count
from public.relationship_gist_user_states state
left join public.relationship_gists gist on gist.id = state.gist_id
where gist.id is null;

select role, count(*) as account_count
from public.internal_admins
group by role
order by role;

select extname, extversion
from pg_extension
where extname in ('pgcrypto', 'pg_trgm')
order by extname;

select p.proname,
       pg_get_function_identity_arguments(p.oid) as identity_arguments,
       pg_get_function_result(p.oid) as result_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'rpc_get_global_relationship_gists',
    'rpc_upsert_relationship_gist_user_state',
    'rpc_admin_get_relationship_gists',
    'rpc_upsert_relationship_gist_editorial',
    'rpc_publish_relationship_gist',
    'rpc_archive_relationship_gist_editorial'
  )
order by p.proname, identity_arguments;

rollback;
```

Expected baseline:

- 231 migration rows;
- exactly four published global staging fixtures with IDs `91000000-0000-4000-8000-000000000001` through `...0004`;
- historically one reader-state row, but the current count must be accepted from live read-only evidence;
- zero orphan reader-state rows;
- legacy reader and editorial signatures present;
- only expected `internal_admins.role` values;
- no private identifiers in the release evidence.

Any unexpected Gist ID/status change, orphan, missing RPC, unknown admin role or migration count is a hard stop.

## Phase D — assemble a ledger-aligned, allowlisted deployment workspace

The candidate has 228 pre-Gist migrations. Staging is expected to have three additional history-only migrations. Build five cumulative phase directories: 231 verified history files plus the first one, two, three, four or five approved Gist migrations. Never execute from the original dirty worktree.

```powershell
$Rc = 'C:\Projects\betweener-gist2-rc-5f-20261011'
$HistorySource = 'C:\Projects\betweener-app\supabase\migrations'
$DeployRoot = Join-Path $env:TEMP 'betweener-gist2-staging-5ha'

$Approved = @(
  '20261010120000_relationship_gist_editorial_capability_hardening.sql',
  '20261010121000_relationship_gist_reader_state_idempotency.sql',
  '20261010130000_relationship_gist_editorial_v2.sql',
  '20261010140000_relationship_gist_ai_editorial_studio.sql',
  '20261010150000_relationship_gist_reader_engagement.sql'
)

$ExpectedApprovedHashes = @{
  $Approved[0] = 'C61E95207DD6BC2803A6C0F90C91BAA9F98560C50FD207C5632D54C106F10BFD'
  $Approved[1] = '5B90B9F86D72F92AC42913C39F0E9B20BE5A4CCDFEF79FCD57D6397A32C4801D'
  $Approved[2] = '9D6FDE25819D3D2E07A81C32524B4756502ACF2164EE829EE7DF95C5CDA9887A'
  $Approved[3] = 'EB55BF58E30B8D38E446E18CBA15137F73126AAC3C50411B93B349D6038002D5'
  $Approved[4] = '6B13E3618D34E9E14A9F5CF049B8D4C8F1FE5AECA39793CBFAE0B77A62D6ED13'
}

$HistoryOnly = @{
  '20261007180000_admin_operations_context.sql' = '33D1843981FBF5D1B3E0789F553610F4E9DCBC90ADD739553A1FB11DA50863F8'
  '20261007223000_circle_staging_readiness_hardening.sql' = '7C2070679B96B698A82ACF90EF8923C405530AC3D15BDD42C7C85FD3EF8A451E'
  '20261008090000_relationship_gist_staging_fixtures.sql' = '6249F6B9109741F2F91A28A841D860BA8A5FECF6CFADD1AA9B4964270D465A9E'
}

if (Test-Path -LiteralPath $DeployRoot) {
  throw 'Deployment workspace already exists; inspect it instead of overwriting it.'
}
New-Item -ItemType Directory -Path $DeployRoot | Out-Null

foreach ($entry in $ExpectedApprovedHashes.GetEnumerator()) {
  $path = Join-Path "$Rc\supabase\migrations" $entry.Key
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash -ne $entry.Value) {
    throw "Approved migration hash mismatch: $($entry.Key)"
  }
}

foreach ($entry in $HistoryOnly.GetEnumerator()) {
  $path = Join-Path $HistorySource $entry.Key
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash -ne $entry.Value) {
    throw "History-only migration hash mismatch: $($entry.Key)"
  }
}

for ($phase = 1; $phase -le 5; $phase++) {
  $phaseRoot = Join-Path $DeployRoot ("phase-{0}" -f $phase)
  $migrationRoot = Join-Path $phaseRoot 'supabase\migrations'
  New-Item -ItemType Directory -Path $migrationRoot -Force | Out-Null
  Copy-Item -LiteralPath "$Rc\supabase\config.toml" -Destination "$phaseRoot\supabase\config.toml"

  Get-ChildItem -LiteralPath "$Rc\supabase\migrations" -File |
    Where-Object { $Approved -notcontains $_.Name } |
    ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $migrationRoot }

  foreach ($name in $HistoryOnly.Keys) {
    Copy-Item -LiteralPath (Join-Path $HistorySource $name) -Destination $migrationRoot
  }

  for ($index = 0; $index -lt $phase; $index++) {
    Copy-Item -LiteralPath (Join-Path "$Rc\supabase\migrations" $Approved[$index]) -Destination $migrationRoot
  }

  $expectedCount = 231 + $phase
  $actualCount = (Get-ChildItem -LiteralPath $migrationRoot -File -Filter '*.sql').Count
  if ($actualCount -ne $expectedCount) {
    throw "Phase $phase contains $actualCount migrations; expected $expectedCount."
  }
}
```

This workspace is temporary evidence, not source. Do not commit it. If the remote ledger does not align with the 231 history files, stop; do not repair the ledger in this release.

## Phase E — execute one migration at a time

Before each phase, run the read-only ledger comparison and have two operators confirm that exactly the next allowlisted version is local-only. The Supabase CLI compares migration timestamps, so the human review of both the version and the candidate SHA-256 is mandatory.

For phase `N`:

```powershell
$Phase = 1
$PhaseRoot = Join-Path $DeployRoot ("phase-{0}" -f $Phase)

& $Supabase migration list `
  --db-url $env:BETWEENER_STAGING_DATABASE_URL `
  --workdir $PhaseRoot

# Run only after the ledger output has been reviewed and exactly one approved
# migration is pending for this phase.
& $Supabase migration up `
  --db-url $env:BETWEENER_STAGING_DATABASE_URL `
  --include-all `
  --workdir $PhaseRoot
```

Repeat with `$Phase = 2`, `3`, `4`, then `5` only after the prior checkpoint passes. Do not use a loop for migration execution.

### Checkpoint 1 — editorial capabilities

Expected:

- ledger adds `20261010120000` only;
- six reviewed functions exist;
- `has_relationship_gist_editorial_capability` is service-role-only;
- editorial RPCs reject anonymous access and enforce operations/moderation/super-admin boundaries;
- legacy Gist and state counts are unchanged.

Stop if any unexpected grant, role value, row-count change or function error appears.

### Checkpoint 2 — reader-state idempotency

Expected:

- ledger adds `20261010121000` only;
- six additive columns exist on `relationship_gist_user_states`;
- receipt table and index exist with RLS enabled and no authenticated direct table grant;
- V2 mutation RPC exists;
- the legacy upsert RPC identity arguments and result type are unchanged;
- baseline state count, saved count, progress count and orphan count are unchanged.

Stop on any state loss, orphan, signature drift or direct-table privilege.

### Checkpoint 3 — editorial V2

Expected:

- ledger adds `20261010130000` only;
- editions, revisions, variants and audit-event tables exist with RLS enabled;
- immutability triggers exist;
- each legacy global Gist has exactly one edition and at least one revision/variant;
- edition `id` and `legacy_gist_id` equal the existing Gist ID for the four fixtures;
- four published legacy fixtures remain published and their title/body/status values are unchanged;
- no reader-state row is orphaned;
- compatibility RPC signatures remain available.

Stop on any missing binding, duplicate revision-1 row, content drift or reader incompatibility.

### Checkpoint 4 — AI editorial schema

Expected:

- ledger adds `20261010140000` only;
- `pg_trgm` exists;
- eight AI/editorial tables exist with RLS enabled and no direct authenticated grants;
- helper/service RPCs are service-role-only;
- AI job-event and review/provenance triggers exist;
- `relationship_gist_ai_environment_policies` contains no enabled current policy unless separately pre-approved; for this gate the required count is zero;
- no AI job, draft, source-suggestion or specialist-review row is created by migration;
- no Edge Function call or OpenAI traffic occurs.

Stop if an environment policy is enabled, a job/draft appears or grants exceed the reviewed model.

### Checkpoint 5 — reader engagement schema

Expected:

- ledger adds `20261010150000` only;
- reactions, private Reflections, receipts, reader events and rate limits exist with RLS enabled;
- authenticated users have RPC execution only, not direct table privileges;
- owner checks remain bound to `auth.uid()`;
- all five new tables are empty immediately after migration;
- existing Gists and reader state remain unchanged;
- engagement feature flags remain false/absent.

Stop on any seeded engagement row, direct table access, owner-check mismatch or legacy regression.

## Postdeployment verification

Use a read-only transaction and retain aggregate evidence only:

```sql
begin transaction read only;

select version, name
from supabase_migrations.schema_migrations
where version in (
  '20261010120000','20261010121000','20261010130000',
  '20261010140000','20261010150000'
)
order by version;

select c.relname, c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'relationship_gist_state_mutation_receipts',
    'relationship_gist_editions','relationship_gist_revisions',
    'relationship_gist_revision_variants','relationship_gist_editorial_audit_events',
    'relationship_gist_ai_environment_policies','relationship_gist_ai_topic_calendar',
    'relationship_gist_ai_generation_jobs','relationship_gist_ai_job_events',
    'relationship_gist_ai_draft_metadata','relationship_gist_ai_source_suggestions',
    'relationship_gist_specialist_assignments','relationship_gist_specialist_reviews',
    'relationship_gist_reactions','relationship_gist_reflections',
    'relationship_gist_engagement_receipts','relationship_gist_reader_events',
    'relationship_gist_engagement_rate_limits'
  )
order by c.relname;

select grantee, table_name, privilege_type
from information_schema.table_privileges
where table_schema = 'public'
  and table_name like 'relationship_gist%'
  and grantee in ('PUBLIC','anon','authenticated')
order by table_name, grantee, privilege_type;

select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
  and routine_name like '%relationship_gist%'
  and grantee in ('PUBLIC','anon')
order by routine_name, grantee;

select count(*) as missing_edition_bindings
from public.relationship_gists gist
left join public.relationship_gist_editions edition on edition.legacy_gist_id = gist.id
where gist.circle_id is null and edition.id is null;

select count(*) as orphan_reader_state_count
from public.relationship_gist_user_states state
left join public.relationship_gists gist on gist.id = state.gist_id
where gist.id is null;

select
  (select count(*) from public.relationship_gist_ai_environment_policies where enabled and is_current)
    as enabled_ai_policies,
  (select count(*) from public.relationship_gist_ai_generation_jobs) as ai_jobs,
  (select count(*) from public.relationship_gist_reactions) as reactions,
  (select count(*) from public.relationship_gist_reflections) as reflections,
  (select count(*) from public.relationship_gist_reader_events) as reader_events;

rollback;
```

Expected:

- five ledger rows in exact order;
- all listed new tables have `relrowsecurity = true`;
- no unexpected direct table grants to `PUBLIC`, `anon` or `authenticated`;
- no execute grants to `PUBLIC` or `anon` for Gist RPCs;
- zero missing edition bindings and zero reader-state orphans;
- zero enabled AI policies and zero newly seeded AI/engagement rows;
- four fixture Gists and the accepted reader-state aggregates match baseline;
- all application feature flags remain false/absent in staging configuration;
- no Edge Function deployment, AI request, publication, EAS build or OTA event occurred.

Run the separately reviewed authenticated security suite after the read-only checks. It may create only disposable test identities/content explicitly approved for staging; it is not part of this migration-only command set.

## Failure response

Stop immediately when:

- target identity or authentication changes;
- ledger output differs from the expected cumulative phase;
- a migration hash differs;
- a migration command exits non-zero;
- a checkpoint detects data loss, orphaning, content drift, signature drift, unexpected grants, missing RLS or an enabled AI policy;
- production traffic, credentials or identifiers appear.

Response:

1. do not execute the next phase;
2. preserve CLI output, timestamps and aggregate checks without credentials or member data;
3. keep all feature flags disabled;
4. notify the release owner and database/security owner;
5. diagnose against a restored disposable copy where possible;
6. prepare a reviewed forward corrective migration for additive/schema issues;
7. use the recovery point only through a separately approved incident procedure when forward correction cannot safely preserve data or service;
8. never drop Gist tables/functions or edit migration history as an improvised rollback;
9. preserve editorial audit history and user state.

Because earlier successful migrations remain applied if a later migration fails, record the last verified ledger version precisely. Legacy client compatibility is expected after each phase, but must be proven at its checkpoint.

## Cleanup after a successful, separately authorized deployment

Remove the temporary deployment workspace only after evidence is archived and the exact resolved path is confirmed to be under the task-specific temp directory. Clear the ephemeral database URL from the process environment. Do not modify the original repository or the isolated release candidate.

## Isolation statement

This runbook does not authorize or include:

- Edge Function deployment;
- AI environment-policy enablement;
- OpenAI invocation;
- Gist publication or editorial mutation;
- Reader V2, Editorial V2, AI Studio, reaction, Reflection or analytics flag enablement;
- EAS build, OTA publication or EAS channel modification;
- production database access.

`STAGING_DEPLOYMENT_AUTHORIZED = NO`

`PRODUCTION_MODIFICATIONS = NONE`

`STAGING_MODIFICATIONS = NONE`

`DEPLOYMENTS = NONE`

`COMMITS = NONE`
