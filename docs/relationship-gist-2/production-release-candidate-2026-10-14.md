# Relationship Gist 2.0 production release candidate

Date: 2026-10-14

Baseline: `c6fa2cbb6d4ee9c7f30ca81a5457c53205707e07`

Candidate: `C:\Projects\betweener-gist2-prod-rc-20261014`
Reproduction: `C:\Projects\betweener-gist2-prod-rc-20261014\.release\relationship-gist2-prod-rc.patch`

## Isolation result

The candidate contains 52 reviewed payload paths. It was constructed from a clean archive of the exact baseline and reproduced from that baseline with a strict patch. All 52 reproduced payload hashes match byte-for-byte.

Patch SHA-256:

`6AE1E4A5E04231C9D6340BCFAED08134FCAE963D57D9BF852639C5B5AA0F1ED6`

The candidate includes the latest Gist reader, offline content cache, canonical route, deep-link payload, editorial workflow, manual cover support, AI retry/error handling, owner publishing, immutable AI revisions, generated types, three additive migrations and focused tests.

The mixed development changes below are deliberately excluded:

- `app/studio.tsx` and `features/studio/**` central Studio work;
- `app/admin.tsx` shared admin-navigation refactoring;
- `app/circles/manage.tsx` and `app/circles/[id].tsx` Circle/Gathering workflow changes;
- Live implementation and package changes;
- unrelated authentication, matching, monetization and moderation changes.

`app/(tabs)/explore.tsx` was extracted surgically. Only Gist catalog isolation, account-scoped cache migration, canonical navigation and environment-safe sharing were included. Circle creation, Gathering creation and Studio-menu changes were not copied.

## Reproduction evidence

The `.release` directory contains:

- `baseline-head.txt`;
- `payload-paths.txt`;
- `payload-sha256.md`;
- `candidate-status.txt`;
- `relationship-gist2-prod-rc.patch`;
- `patch-sha256.txt`.

Reproduction procedure:

1. Create a clean archive or detached worktree at the recorded baseline.
2. Run `git apply --check --whitespace=error-all relationship-gist2-prod-rc.patch`.
3. Apply the patch.
4. Compare every payload path against `payload-sha256.md`.

Observed result: `52/52` hashes matched.

## Candidate validation

| Gate | Result |
| --- | --- |
| TypeScript | PASS, zero diagnostics |
| Scoped ESLint | PASS, zero warnings/errors |
| Node Gist regressions | PASS, 59/59 |
| Jest interaction suites | PASS, 22/22 across five suites |
| Staging pgTAP role/security/compatibility canaries | PASS, 291/291 |
| Strict patch whitespace check | PASS |
| Reproduced payload hashes | PASS, 52/52 |
| Production modifications | NONE |

The pgTAP canaries ran in rollback-only transactions against dedicated Staging. They did not create durable accounts or fixtures.

## Environment and feature safety

- Production and staging application identifiers remain unchanged from baseline.
- Environment selection remains server/runtime bound.
- Reader V2, engagement, reactions, Reflections, analytics, Editorial V2, AI Studio and AI imagery remain strict explicit-`true` flags.
- No production migration, function deployment, feature-flag change, build or OTA update was performed.

## Hosting payload validation

Local validation passed:

- production AASA files identify `A964DV394M.com.aduboffour.betweener`;
- staging AASA identifies `A964DV394M.com.aduboffour.betweener.staging`;
- every AASA payload includes `/gists/*`;
- production and staging rewrite files route Gist URLs to the fallback;
- both fallback documents are present and marked `noindex`.

Remote hosting deployment and read-back remain deferred until the coordinated Live/Circles production release gate.

## Remaining gates

1. Complete and record the physical-device matrix in `production-device-evidence-2026-10-14.md`.
2. Rebase or regenerate this candidate after any required device-test correction.
3. Confirm Live and Circles production blockers are closed.
4. Approve backup/recovery, exact migration/function manifest and flag rollout.
5. Deploy and read back hosting association files under separate authorization.
6. Obtain explicit production migration, Edge Function, mobile release and feature-flag authorization.

`GIST_RELEASE_CANDIDATE = PASS`

`RELEASE_CANDIDATE_REPRODUCIBLE = YES`

`DEVICE_EVIDENCE = PENDING`

`PRODUCTION_DEPLOYMENT_AUTHORIZED = NO`

`PRODUCTION_MODIFICATIONS = NONE`
