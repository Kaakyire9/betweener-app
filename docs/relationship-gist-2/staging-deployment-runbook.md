# Relationship Gist 2.0 — Proposed Staging Deployment Runbook

Status: proposal only; not executed
Current authorization: none for deployment
Target: Supabase `xsgzxadwuxuziubglvps`, EAS `@kaakyire9/betweener-staging`

This runbook becomes executable only after a new explicit staging authorization. Every phase has a hard stop. Commands containing placeholders must be completed from an approved secret manager and must never be committed or copied into reports.

## Phase A — Predeployment

**Preconditions**

- A clean, reviewed release candidate containing only intended Gist 2.0 changes.
- Read-only Supabase access restored and target identity independently confirmed.
- Approved staging backup/PITR recovery point.
- All mobile Gist flags absent or explicitly false; server AI flag/policy disabled.
- No production credential or project selected.

**Authorized operator**: release engineer with staging-only Supabase/EAS access; database owner approves the migration plan.

**Proposed actions**

```powershell
git status --short
git rev-parse HEAD
Get-Content supabase/.temp/project-ref
supabase projects list
supabase migration list --linked
supabase db dump --linked --schema-only --file <approved-staging-schema-snapshot.sql>
eas project:info --json
eas env:list preview --format long
node scripts/verify-eas-project-isolation.cjs
node scripts/verify-android-variant-config.cjs
node scripts/verify-ios-variant-config.cjs
git diff --check
```

Use an approved platform backup/PITR operation before schema work. Do not place database dumps containing member data in the repository.

**Expected evidence**

- Project refs exactly `xsgzxadwuxuziubglvps` and `7f38a835-2da7-419b-a20b-e1a12e021547`.
- Remote ledger and schema snapshot retained in the release evidence store.
- Remote ledger ends exactly at the reviewed predecessor of `20261010120000`.
- Environment-dependent migrations `20261006150000`, `20261007223000` and `20261008090000` have known, verified states and prerequisites.
- Existing Gist and reader-state aggregate counts recorded without personal data.

**Stop conditions**

- Any identity mismatch, unexpected migration, checksum mismatch, production endpoint, missing backup, or active feature flag.

**Recovery**: make no changes; resolve access/source discrepancies and restart Phase A.

## Phase B — Database

**Preconditions**

- Phase A passed.
- The exact five migration hashes match `staging-preflight.md`.
- A disposable database restored from the staging schema/sanitized snapshot has passed migration and pgTAP tests.
- The release migration directory is reconciled to the verified remote ledger.

**Authorized operator**: staging database release engineer with a second reviewer present.

**Proposed actions**

First prove that the supported CLI dry run lists exactly the five reviewed Gist migrations and nothing else:

```powershell
supabase migration list --linked
supabase db push --linked --dry-run
```

If and only if the dry run lists exactly these files in order, the separately authorized execution is:

```powershell
supabase db push --linked
supabase migration list --linked
```

Do **not** run `db push` from the current dirty worktree. If unrelated local migrations appear, create a reviewed release worktree/branch whose migration inventory exactly matches the verified remote ledger plus the five Gist files, then repeat the dry run. Do not use `migration repair` to hide a mismatch. Do not apply raw SQL without a reviewed plan that also preserves migration-ledger integrity.

**Postconditions/evidence**

- Five new ledger entries with expected timestamps.
- Required extensions available (`pgcrypto`, `pg_trgm`; preserve existing `uuid-ossp`).
- Legacy RPCs retain exact signatures.
- New tables/RPCs, constraints, indexes, triggers, RLS and grants match the migrations.
- Four existing staging fixture Gists, legacy IDs and all reader-state counts remain preserved; any delta is explained.
- Anonymous/support/member/editor/quality/safety/specialist/publisher security probes pass without writing non-disposable member data.
- pgTAP 196/196 and the staging-equivalent lifecycle suite pass before live staging traffic is enabled.

**Stop conditions**

- Any unrelated migration, lock/error, changed legacy signature, privilege widening, missing extension, count loss, fixture replacement or failed assertion.

**Recovery**

- Keep all flags off and stop the rollout.
- Prefer a reviewed forward-only corrective migration. Do not delete migration history or immutable audit rows.
- Restore the approved backup/PITR point only for confirmed data-integrity failure under database-owner authorization.

## Phase C — AI Edge Function

**Preconditions**

- Phase B passed.
- Generated drafts cannot publish by database policy.
- Staging-only publishable/secret keys and OpenAI credential are approved.
- Staging policy row exists but is disabled.

**Authorized operator**: staging Edge Function operator; AI/security reviewer approves secrets, policy and budget.

**Proposed actions**

Configure through the approved secret workflow without printing values:

```text
APP_ENVIRONMENT=staging
RELATIONSHIP_GIST_AI_STUDIO_ENABLED=false
OPENAI_API_KEY=<approved-staging-secret>
SUPABASE_PUBLISHABLE_KEYS=<injected-by-platform>
SUPABASE_SECRET_KEYS=<injected-by-platform>
```

Then, under separate deployment authorization:

```powershell
supabase functions deploy relationship-gist-ai-draft --project-ref xsgzxadwuxuziubglvps
```

Run auth/role/environment/schema/moderation/idempotency/failure probes while both the server flag and policy remain disabled. Use mocked/local provider checks first. Enable only for a one-job canary after separate budget approval.

**Real-provider canary constraints**

- One fictional, non-sensitive approved topic.
- `daily_job_budget=1`, `daily_token_budget=5000`, `max_output_tokens<=3000`, `max_attempts=1`.
- Hard approved ceiling: USD $0.10.
- Human checks schema, moderation, unverified source labels, prompt/model/request provenance, token/cost accounting and draft-only state.
- No approval, schedule, publication or archive action in the canary.

**Stop conditions**

- Wrong environment, missing/legacy credential, authorization bypass, unredacted content in logs, budget mismatch, unsafe/malformed acceptance, or any AI-controlled publication path.

**Recovery**: set server AI flag and policy disabled, stop jobs, retain job/audit history, roll back only the function version if needed.

## Phase D — Mobile

**Preconditions**

- Database and function verification passed.
- `supabase/types/database.ts` regenerated from the migrated staging schema and reviewed.
- Exact release commit selected; no mixed dirty worktree.
- Feature activation sequence approved.

**Authorized operator**: mobile release engineer with staging-only EAS access.

**Proposed actions**

```powershell
supabase gen types typescript --project-id xsgzxadwuxuziubglvps > <reviewed-temporary-output>
npm.cmd run typecheck
npx.cmd eslint <scoped-gist-files> --max-warnings=0
npm.cmd test -- <focused-gist-suites>
node scripts/verify-eas-project-isolation.cjs
eas project:info --json
eas build --platform ios --profile testflightStaging
eas build --platform android --profile playStaging
eas build:list --platform ios --build-profile testflightStaging --limit 1 --json --non-interactive
eas build:list --platform android --build-profile playStaging --limit 1 --json --non-interactive
```

The type-generation redirection must be reviewed before replacing the tracked type file. Build commands require separate explicit authorization; they are not authorized by this runbook.

**Expected evidence**

- Dedicated project, updates URL, staging channel, runtime and app identifiers on both artifacts.
- No production endpoint/key/product identity.
- Old development clients still read legacy RPC output while flags are off.
- Flags are enabled in dependency order only through a reviewed staging bundle/update: Reader V2, Editorial V2, engagement master, then individual reactions/Reflections/analytics. AI mobile flag remains last.

**Stop conditions**: shared-project artifact, wrong runtime/channel, type drift, missing RPC, production reference, or old-client regression.

**Recovery**: do not distribute the artifact/update; keep flags off. If an update was separately published, republish the last verified compatible bundle to the same dedicated staging branch/runtime under incident authorization.

## Phase E — QA

**Preconditions**: dedicated staging builds installed; disposable staging accounts and synthetic editorial content only.

**Authorized operator**: QA lead, with editorial/safety reviewer for sensitive content and AI cases.

**Required matrix**

- Complete Draft → In Review → quality/safety/specialist approval → schedule/cancel → publish → supersede/archive lifecycle.
- Saved Gists, reading history, resume anchor/fallback and unavailable-content explanations.
- Offline save/unsave, reaction add/change/remove, app termination, reconnect and account switch.
- Private Reflection create/edit/delete and cross-account non-disclosure.
- Multi-device deterministic conflict handling and idempotent retries.
- VoiceOver/TalkBack, large text, reduced motion and focus order.
- Real Wi-Fi/cellular loss, background/resume and stale-session recovery.
- Legacy client compatibility with all flags off and partial activation.
- One approved AI canary followed by human review; never autonomous publication.

**Expected evidence**: timestamped screenshots/logs without private text, server aggregate/audit evidence, device/build IDs and pass/fail per platform.

**Stop conditions**: data loss, cross-account replay, private Reflection exposure, incorrect aggregates, accessibility blocker, publication bypass, or environment leakage.

**Recovery**: disable the affected flags, stop AI jobs, preserve queued account-scoped intent and file a forward-fix. Do not delete user state to make a test pass.

## Phase F — Rollback and containment

**Authorized operator**: incident commander plus the owner of the affected surface.

1. Disable the narrowest affected mobile flag in a compatible staging update; Reader V2/engagement queues remain stored and must not be drained by legacy sync.
2. Disable server AI flag and current staging policy; do not delete jobs, provenance or audit history.
3. Preserve legacy reader access where schema compatibility remains intact.
4. Correct database defects with forward-only migrations. Do not drop additive tables/functions during initial containment.
5. Roll editorial content back by a new immutable revision, never by rewriting a published revision.
6. Use backup/PITR only for confirmed integrity loss with explicit database-owner approval.
7. Retain migration history, user state, receipts and immutable audits.

`STAGING_DEPLOYMENT_AUTHORIZED = NO`

`PRODUCTION_MODIFICATIONS = NONE`

`STAGING_MODIFICATIONS = NONE`

`DEPLOYMENTS = NONE`

`COMMITS = NONE`
