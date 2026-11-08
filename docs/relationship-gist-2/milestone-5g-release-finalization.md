# Relationship Gist 2.0 — Milestone 5G Release Finalization

Validation date: 2026-10-11 (Europe/London)

## Result

`MILESTONE_5G = CONDITIONAL_PASS`

`RELEASE_CANDIDATE_REPRODUCIBLE = YES`

`ADMIN_EDITORIAL_NAVIGATION = PASS`

`UNRELATED_DELETIONS = OWNERSHIP_UNRESOLVED`

The release candidate is reproducible and the editorial route is now discoverable only after the server grants Relationship Gist read access. Dependency ownership of the 49 original-worktree deletions is clear, but the intent behind those deletions cannot be established from repository evidence; they remain untouched and outside this candidate.

## Candidate identity and pre-edit verification

| Property | Evidence |
| --- | --- |
| Candidate root | `C:\Projects\betweener-gist2-rc-5f-20261011` |
| Baseline HEAD | `f560559b6a3ef09ecb7fd7dfadf9bd742a88184a` |
| Candidate form | Clean-HEAD archive plus reviewed patch; no candidate-local `.git` directory |
| Milestone 5F payload | 53 files: 48 added, 5 modified |
| Milestone 5F payload verification | 53/53 SHA-256 entries matched before 5G edits |
| Milestone 5F patch SHA-256 | `C6699B989CDADFCA9086052E7ED725BB37D9B59C5B5773589BE28A223578003C` |
| Final Milestone 5G patch SHA-256 | `3680A0BA286F9EF39E98319AFE8A5E136C4DE1CE9308EF75240638BD2CEA03D6` |
| Git-status verification | A temporary isolated index loaded directly from baseline HEAD; no source index mutation |
| Final payload | 55 files: 49 added, 6 modified |
| Final isolated-index status | 61 paths: 55 payload files and 6 evidence artifacts; no deletions |

The isolated-index status exactly reproduced the five modified and 48 added 5F payload files, plus the three `.release` evidence artifacts. `node_modules` remained ignored and is not part of the release payload.

## Editorial navigation

The existing `app/admin.tsx` dashboard now performs a fail-closed call to `rpc_get_my_relationship_gist_editorial_permissions`. It renders the `/admin-editorial` entry only when the normalized server response grants `can_read = true`.

Security properties:

- no new client-side role or permission model;
- no inference from email, UI labels, draft permission, or feature flags;
- permission RPC failure leaves the entry hidden;
- the route retains its own server-backed authorization and RPC enforcement;
- existing admin tools and their behavior are unchanged;
- the entry uses existing theme tokens in both color schemes;
- the control exposes button semantics and an explicit accessibility label.

Changed navigation files and final SHA-256 values:

| Path | Purpose | SHA-256 |
| --- | --- | --- |
| `app/admin.tsx` | Minimal conditional route card | `1A2617A301951A22981672724E046113817AD63EAC2598A2F90F43E64356E2FA` |
| `features/relationship-gists/editorial/relationship-gist-editorial-permissions.ts` | Reuses normalized `canRead` as a pure fail-closed navigation predicate | `C804B65FF7AE3F14D0E547B852C8329CB2B931E6099489568F227EA23A36A71B` |
| `__tests__/relationship-gist-admin-navigation.regression.test.ts` | Authorized, unauthorized, error and accessible-route coverage | `2F6C4CFC8D7F1F2624873B6B13BEBAD4808892006BB2179E195579293B1CC00A` |

Backend authorization remains authoritative through the existing action-specific Gist capability functions and RPCs.

## Dependency graph

```text
app/admin.tsx
  -> rpc_get_my_relationship_gist_editorial_permissions
  -> normalizeRelationshipGistEditorialPermissions
  -> canShowRelationshipGistEditorialNavigation
  -> /admin-editorial (only when canRead)

/admin-editorial
  -> AdminScreenShell
  -> legacy or V2 editorial workspace (default-off V2 flag)
  -> action-specific editorial RPC authorization

Gist database layer
  -> five ordered additive migrations
  -> immutable editions/revisions + reader state + AI draft-only studio + engagement
  -> generated supabase/types/database.ts
```

No Gist payload file directly imports `apps/program-audio-worker`, `apps/studio`, `packages/live-program-domain`, or `@betweener/live-program-domain`.

## Original-worktree deletion classification

Read-only status: all 49 paths are unstaged tracked deletions (` D`). They are present in baseline HEAD and in the isolated candidate. The dependency domain is Live, not Relationship Gist.

### Program audio worker — 7 paths

Owner: Betweener Live program-audio runtime service. Gist direct import: none. Candidate reproducibility impact: none; committed files are present in the clean-HEAD candidate.

Last committed by `3dabda96c61bf08122da5a352673f24c20f1a044` (`feat(live): add programme audio and realtime activity services`, 2026-09-13):

- `apps/program-audio-worker/.dockerignore`
- `apps/program-audio-worker/Dockerfile`
- `apps/program-audio-worker/package.json`
- `apps/program-audio-worker/src/gain-control.py`

Last committed by `d96336e7ea87c2603354740384faec2c1c954d88` (`perf(live): add adaptive program audio polling`, 2026-09-30):

- `apps/program-audio-worker/src/program-audio.mjs`
- `apps/program-audio-worker/src/worker.mjs`
- `apps/program-audio-worker/test/program-audio.test.mjs`

### Studio application — 35 paths

Owner: Betweener Live operator Studio web application. Gist direct import: none. Candidate reproducibility impact: none; committed files are present in the clean-HEAD candidate.

Last committed by `5f3f890d93896aee9071f3f80dd2591fa517e3a5` (`feat(live): deliver phases 10F and 10G`, 2026-09-10):

- `apps/studio/index.html`
- `apps/studio/src/App.tsx`
- `apps/studio/src/auth/StudioSignIn.tsx`
- `apps/studio/src/auth/use-studio-auth.ts`
- `apps/studio/src/hooks/use-studio-sessions.ts`
- `apps/studio/src/hooks/use-studio-snapshot.ts`
- `apps/studio/src/lib/supabase.ts`
- `apps/studio/src/main.tsx`
- `apps/studio/src/media/AudioMeter.tsx`
- `apps/studio/src/media/use-audio-meter.ts`
- `apps/studio/src/sessions/StudioSessionPicker.tsx`
- `apps/studio/tsconfig.app.json`
- `apps/studio/tsconfig.json`
- `apps/studio/tsconfig.node.json`
- `apps/studio/vercel.json`
- `apps/studio/vite.config.ts`

Last committed by `8d19ea2409fd35b00f2222c63853cba82e1ce22b` (`feat(live): harden Studio programme controls`, 2026-09-12):

- `apps/studio/src/hooks/use-controller-lease.ts`
- `apps/studio/src/lib/errors.ts`
- `apps/studio/src/media/StudioDjSource.tsx`
- `apps/studio/src/media/StudioMediaControls.tsx`
- `apps/studio/src/media/studio-media-context.tsx`
- `apps/studio/src/program/SceneLibrary.tsx`
- `apps/studio/src/program/source-assignments.ts`

Last committed by `3dabda96c61bf08122da5a352673f24c20f1a044` (`feat(live): add programme audio and realtime activity services`, 2026-09-13):

- `apps/studio/src/panels/MusicLibraryAdminUpload.tsx`
- `apps/studio/src/panels/OperationalPanels.tsx`
- `apps/studio/src/program/ProgramRenderer.tsx`

Last committed by `bdf4e8efccfb1151ee833b246a91f8224eb054c5` (`feat(live): finalize premium hosted experiences`, 2026-09-14):

- `apps/studio/src/api/studio-api.ts`
- `apps/studio/src/panels/HostAndRuntimePanel.tsx`
- `apps/studio/src/styles.css`
- `apps/studio/src/workspace/StudioWorkspace.tsx`

Last committed by `75a2487c746fd1541f43d8ef8d15a5456248d3ab` (`fix(live): isolate staging runtime identities`, 2026-10-07):

- `apps/studio/.env.example`
- `apps/studio/src/lib/environment.ts`
- `apps/studio/src/lib/studio-environment-resolver.ts`
- `apps/studio/src/vite-env.d.ts`

Last committed by baseline HEAD `f560559b6a3ef09ecb7fd7dfadf9bd742a88184a` (`chore(deps): refresh Expo and Studio toolchain`, 2026-10-07):

- `apps/studio/package.json`

### Shared Live program domain — 7 paths

Owner: shared Betweener Live program contracts used by the mobile Live surface and Studio. Gist direct import: none. The original worktree cannot complete repository-wide TypeScript without these files, but candidate reproducibility is unaffected because the clean-HEAD candidate includes them.

Last committed by `5f3f890d93896aee9071f3f80dd2591fa517e3a5` (`feat(live): deliver phases 10F and 10G`, 2026-09-10):

- `packages/live-program-domain/package.json`
- `packages/live-program-domain/src/index.ts`
- `packages/live-program-domain/src/preview.ts`
- `packages/live-program-domain/tsconfig.json`

Last committed by `3dabda96c61bf08122da5a352673f24c20f1a044` (`feat(live): add programme audio and realtime activity services`, 2026-09-13):

- `packages/live-program-domain/src/contracts.ts`
- `packages/live-program-domain/src/layout.ts`
- `packages/live-program-domain/src/validation.ts`

### Ownership conclusion

The dependency owners are identifiable, but Git history and current status do not establish whether deleting these files is intentional, temporary, or accidental. No restore, delete, stage, reset, stash, commit, or content change was made in the original worktree.

`UNRELATED_DELETIONS = OWNERSHIP_UNRESOLVED`

## Database validation

A new disposable local Supabase stack was created under the system temp directory and removed after testing.

| Property | Evidence |
| --- | --- |
| Project/container identity | `gist2-rc5g-20261011` / `supabase_db_gist2-rc5g-20261011` |
| PostgreSQL host port | `56422` |
| Docker image | `public.ecr.aws/supabase/postgres:17.6.1.171` |
| Baseline migrations | 226 |
| Final candidate migrations | 233 |
| Environment fixture | `staging`, package `com.aduboffour.betweener.staging`, EAS project `7f38a835-2da7-419b-a20b-e1a12e021547` |
| `pg_trgm` | 1.6 |
| pgTAP | 5 files, 196 assertions, PASS |
| Cleanup | Stack stopped without backup; temp harness removed; zero matching containers remain |

The first environment-bound migration attempt correctly failed closed before any identity fixture existed. The discarded stack was removed. The successful run applied the 226-migration baseline, inserted only a disposable staging push identity, then applied the two tracked staging provenance migrations and the five Gist migrations in order.

## Validation results

| Gate | Result |
| --- | --- |
| TypeScript | PASS, 0 diagnostics |
| Scoped ESLint | PASS, 0 warnings/errors |
| Node Gist + legacy Circles regressions | PASS, 50/50 including 3 navigation tests |
| Jest outbox/state/Saved Library | PASS, 17/17 across 4 suites |
| Admin navigation authorization | PASS, 3/3 |
| pgTAP editorial capabilities | PASS, 23/23 |
| pgTAP reader state V2 | PASS, 33/33 |
| pgTAP editorial V2 | PASS, 43/43 |
| pgTAP AI Editorial Studio | PASS, 48/48 |
| pgTAP reader engagement | PASS, 49/49 |
| pgTAP total | PASS, 196/196 |
| Payload SHA-256 verification | PASS, 55/55 |
| Clean-HEAD strict patch apply | PASS |
| Reproduced payload hashes | PASS, 55/55 |
| `git diff --check` equivalent on final patch | PASS |

## Feature flags and environment isolation

Relationship Gist Reader V2, Editorial V2, AI Studio, engagement, reactions, Reflections and analytics remain disabled unless their explicit static `EXPO_PUBLIC_*` value equals `true`. `app.config.js`, `eas.json`, `package.json`, and `package-lock.json` are unchanged from baseline HEAD. No environment-selection change is present.

Generated types remain the verified Milestone 5F output:

`203A62D357C772C84B4E2214BAAC45E022DD6629590A292F79EC94D91F8876F1`

## Reproduction

From an exact clean archive or worktree at baseline HEAD:

```text
git apply --check --whitespace=error-all .release/relationship-gist-2-rc.patch
git apply --whitespace=error-all .release/relationship-gist-2-rc.patch
```

Compare all payload paths with `.release/payload-sha256.md`. The patch hash and evidence-artifact hashes are recorded in `.release/release-artifact-sha256.md`; `.release` itself is not part of the application payload.

## Rollback

- Before deployment: discard the isolated candidate directory; the original worktree is independent.
- After a source-only staging deployment: revert the exact 5G patch as a new reviewed change; keep feature flags disabled.
- After additive database migrations: do not drop schema objects. Disable all Gist 2.0 flags and use legacy RPC/read paths while a forward-only remediation is prepared.
- AI drafting remains default-off and has no publication authority.

## Exact staging prerequisites

1. Resolve or explicitly accept the original-worktree Live deletions outside this candidate.
2. Reproduce the candidate from baseline HEAD and verify all 55 hashes.
3. Review the final strict patch and the direct-RPC editorial navigation gate.
4. Obtain separate staging deployment authorization.
5. Verify the staging Supabase project identity before applying the five additive Gist migrations in order.
6. Deploy the reviewed AI Edge Function only to staging, with environment-bound secrets, an approved test budget, and AI flags still disabled.
7. Run authenticated role-boundary, scheduling, saved-library, offline, reaction, Reflection, accessibility and physical-device gates.
8. Enable individual staging flags only through a separately approved rollout and rollback plan.

`STAGING_DEPLOYMENT_AUTHORIZED = NO`

`PRODUCTION_MODIFICATIONS = NONE`

`STAGING_MODIFICATIONS = NONE`

`DEPLOYMENTS = NONE`

`COMMITS = NONE`
