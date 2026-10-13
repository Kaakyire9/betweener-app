# Relationship Gist 2.0 — Milestone 5F Release Candidate

Validation date: 2026-10-11 (Europe/London)

## Result

`MILESTONE_5F = CONDITIONAL_PASS`

`RELEASE_CANDIDATE_REPRODUCIBLE = YES`

`GENERATED_TYPES = PASS`

The isolated payload is reproducible and all local gates pass. Two conditions remain: the baseline admin dashboard has no narrow entry to the isolated editorial route, and the original dirty worktree acquired 49 unrelated tracked deletions during validation. Those deletions were not included in the candidate or restored.

## Verified baseline and isolation

| Property | Evidence |
| --- | --- |
| Source branch | `feature/betweener-live` |
| Source HEAD | `f560559b6a3ef09ecb7fd7dfadf9bd742a88184a` |
| Original dirty-state fingerprint at start | `ED4D5D8F2266AABB672ED27DEB98DA865088F3F9EB52139EBBC3492ECAC65D6D` |
| Original dirty-state fingerprint at end | `BA93CBAE94DC22A1D74C96FAB9917327C3B393BE7221EA00ED599015CAA3D8DD` |
| Candidate payload | 53 files: 48 added, 5 modified |
| Removed baseline files | 0 |
| Reproduction patch | `.release/relationship-gist-2-rc.patch` |
| Patch SHA-256 | `C6699B989CDADFCA9086052E7ED725BB37D9B59C5B5773589BE28A223578003C` |
| Patch reproduction | PASS: clean archive of HEAD, 53/53 payload hashes identical, 0 mismatches |
| Complete file hashes | `.release/payload-sha256.md` |
| Payload path list | `.release/payload-paths.txt` |

The candidate was built from a clean archive of HEAD. No original worktree file was copied wholesale unless it was Gist-owned or an explicitly documented required dependency. The original repository was not checked out, reset, stashed, staged or committed.

The final status audit found 49 newly missing tracked files under `apps/program-audio-worker/`, `apps/studio/` and `packages/live-program-domain/`. No release-candidate operation targeted those paths, their ownership is ambiguous, and they were left untouched rather than silently restored. The four mixed Gist source hashes captured at the start (`explore.tsx`, the domain module, local state and legacy hardening test) remained exact matches at the end.

## Mixed-file and hunk review

### `app/(tabs)/explore.tsx`

The working-tree file contained 59 one-line-context diff hunks spanning Relationship Gist, Circles, Live, profile binding, Gathering copy and admin discoverability.

Included Gist hunks: `2, 3, 4, 5, 7, 8, 13, 14, 19, 20, 23–29, 39–50, 58, 59`.

Additional surgical adjustments:

- hunk 5 retained only Gist route parameters; the unrelated `canSchedule: canHostLive` change was removed;
- the Gist result portion of mixed hunk 15 was extracted so `fetchCurrentRelationshipGists()` uses its typed `data`, `source` and `primaryError` contract;
- no Circle query-error, profile-binding, Live-hosting, Gathering-copy or admin-menu remediation was included.

Excluded unrelated hunks include `circle-load-health`, profile-binding retries, supplemental Circle query failures, Live scheduling/discoverability, Gathering terminology changes, Circle Activity copy, and creator/admin menu restructuring.

### Mixed regression tests

Two candidate tests had inherited assertions for unrelated Circle staging-readiness symbols. Four assertions requiring `collectCircleQueryFailures` and `retryCirclesLoad` were excluded. All Gist, legacy reader, Circles entry and Live entry assertions remain.

### Generated types

`supabase/types/database.ts` is the only shared file replaced wholesale. It was generated from the verified disposable database, not copied from the dirty worktree and not hand-edited semantically. Only trailing whitespace and the final extra blank line were normalized for `git diff --check`.

### Required shared dependencies

The Gist editorial route requires two whole, new shared files:

- `components/admin/AdminScreenShell.tsx`
- `lib/admin/admin-access.ts`

They are included and documented because the Gist workspace imports them directly. The broader `app/admin.tsx` Operations-console rewrite is excluded because it combines editorial navigation with unrelated Community, Live, Trust, Accounts and Commerce changes.

## Dependency graph

```text
legacy Gists + internal_admins
  -> 20261010120000 editorial capabilities
  -> 20261010121000 idempotent reader state
  -> 20261010130000 editions/revisions/saved library
       -> 20261010140000 AI studio + pg_trgm
       -> 20261010150000 reader engagement

explore.tsx
  -> domain + default-off flags
  -> reader repository + reader-state outbox/hook
  -> engagement repository + outbox/hook/panel
  -> legacy auth, Supabase, network and offline stores from HEAD

saved-gists.tsx
  -> stable Gist identity + saved repository + legacy auth/Supabase

admin-editorial.tsx
  -> editorial permissions/workspace
  -> AdminScreenShell -> admin-access -> legacy auth/Supabase/internal-tools
  -> AI Studio -> AI repository + default-off AI flag

relationship-gist-ai-draft
  -> contracts + provider + redacted telemetry
  -> M3 service RPCs
  -> draft-only authority

generated database.ts
  <- disposable schema with all 236 migrations
```

`pg_trgm 1.6` was present before M3 application. The release delta after the verified `20261008090000` staging baseline contains exactly the five Gist migrations and no unrelated pending migration.

## Disposable database and generated types

| Check | Result |
| --- | --- |
| Disposable project | `gist2-rc5f-20261011` |
| Container | `supabase_db_gist2-rc5f-20261011` |
| PostgreSQL host port | `55422` |
| Image | `public.ecr.aws/supabase/postgres:17.6.1.171` |
| Baseline ledger | 231 migrations |
| Baseline identity | staging / `com.aduboffour.betweener.staging` / project `7f38a835-2da7-419b-a20b-e1a12e021547` |
| Synthetic data | 4 `example.invalid` identities and 4 legacy Gists |
| Final ledger | 236 migrations |
| Applied Gist versions | `20261010120000`, `20261010121000`, `20261010130000`, `20261010140000`, `20261010150000` |
| Backfill | 4 editions, 4 revisions, 0 missing legacy bindings |
| Generated type SHA-256 | `203A62D357C772C84B4E2214BAAC45E022DD6629590A292F79EC94D91F8876F1` |
| Required type symbols | editions, revisions, AI jobs, reactions, Reflections and transition RPC all present |

The disposable target was positively identified by Docker labels, workdir, image and port before migrations or generation. No remote project was linked or queried.

## Exact validation results

| Gate | Result |
| --- | --- |
| TypeScript, `npm.cmd run typecheck` | PASS, 0 diagnostics |
| Scoped ESLint, `--max-warnings=0` | PASS, 0 warnings/errors |
| Node Gist + legacy Circles compatibility | PASS, 47/47 |
| Jest outbox/state/Saved Library | PASS, 17/17; 4/4 suites |
| pgTAP editorial capabilities | PASS, 23/23 |
| pgTAP reader state V2 | PASS, 33/33 |
| pgTAP editorial V2 | PASS, 43/43 |
| pgTAP AI Editorial Studio | PASS, 48/48 |
| pgTAP reader engagement | PASS, 49/49 |
| pgTAP total | PASS, 196/196 |
| `git diff --check` on exact 53-file payload | PASS |
| Clean-HEAD patch apply | PASS with `--whitespace=error-all` |
| Reproduced source hashes | PASS, 53/53; 0 mismatches |

## Feature flags and environment isolation

All Reader V2, editorial V2, AI Studio, engagement, reactions, Reflections and analytics flags remain fail-closed unless their explicit static `EXPO_PUBLIC_*` value equals `true`.

`app.config.js`, `eas.json`, `package.json` and `package-lock.json` are byte-equivalent Git blobs to HEAD. Neither app config nor EAS config adds a Gist flag. Staging/production environment selection is unchanged.

The AI Edge Function source matches the Milestone 5E reviewed hashes. No Deno deployment, real provider request, EAS build or OTA publication occurred.

## Reproduction

From an exact archive/worktree at `f560559b6a3ef09ecb7fd7dfadf9bd742a88184a`:

```text
git apply --check --whitespace=error-all .release/relationship-gist-2-rc.patch
git apply --whitespace=error-all .release/relationship-gist-2-rc.patch
```

Then compare every path against `.release/payload-sha256.md` and rerun the recorded gates. The patch and hash manifest are evidence artifacts and are not themselves release payload files.

## Remaining condition and rollback

Before any staging authorization:

1. Decide how the baseline admin dashboard should expose `/admin-editorial`. Do not absorb the current dirty `app/admin.tsx` wholesale. Add only a separately reviewed editorial entry or release the broader Operations-console work as its own dependency.
2. Resolve ownership and intent for the 49 unrelated tracked deletions under the Studio/program-audio packages. Do not restore or accept them implicitly as part of Relationship Gist 2.0.

Rollback before deployment is deletion of the disposable candidate. After an authorized database rollout, keep every feature flag disabled and retain legacy RPC/client behavior; the five migrations are additive and should not be down-migrated. Any schema rollback must be a new reviewed forward migration. The AI Function is absent remotely in this task, so no function rollback is required.

`STAGING_DEPLOYMENT_AUTHORIZED = NO`

`PRODUCTION_MODIFICATIONS = NONE`

`STAGING_MODIFICATIONS = NONE`

`DEPLOYMENTS = NONE`

`COMMITS = NONE`
