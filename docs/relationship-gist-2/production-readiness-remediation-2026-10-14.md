# Relationship Gist 2.0 production-readiness remediation

Date: 2026-10-14

Scope: local source, local tests, and local Supabase only. No remote deployment or flag change was performed.

## Remediation completed in order

| Order | Recommendation | Result |
| --- | --- | --- |
| 1 | Add a canonical Gist route and environment-safe sharing | Complete locally. `/gists/[gistId]` is the stable app route. Shared HTTPS and custom-scheme links fail closed if the runtime identity does not match the expected staging or production identity. |
| 2 | Make readable Gist content available after a cold offline start | Complete locally. A versioned, account-scoped content cache is populated from the global catalog and can migrate available Saved Library content. |
| 3 | Decouple Gist availability from Circles supplemental queries | Complete locally. The Gist catalog starts independently and is applied before Circle membership or supplemental failures are evaluated. |
| 4 | Separate approved-cover display from AI generation | Complete locally. `EXPO_PUBLIC_RELATIONSHIP_GIST_COVERS_ENABLED` controls reading; the AI image flag controls generation. An unset cover flag retains staging-build compatibility, while an explicit `false` wins. |
| 5 | Add executable security coverage for manual covers | Complete locally. The test covers the exact RPC signatures, grants, policies, storage contract, authenticated ownership binding, audit event, and direct-table denial. |
| 6 | Complete large-text, accessibility, offline, and deep-link device QA | Prepared below. Normal device testing was reported successful; the expanded matrix still requires recorded iOS and Android evidence. |
| 7 | Produce a clean release candidate | Pending. The development worktree contains pre-existing mixed Studio, Circles, Live, editorial, and Gist changes. Isolation must use an explicitly reviewed manifest rather than committing the current worktree wholesale. |

## Architecture and compatibility

- Existing Gist IDs, legacy reader RPCs, state keys, Circles entry point, and Saved Library identity remain intact.
- The old embedded reader remains available for installed-client compatibility; new navigation uses the canonical standalone reader.
- Saved state, content cache, mutation outbox, and engagement outbox remain account-scoped.
- A stale request from a previous account cannot populate the standalone reader after an account switch.
- Network content remains usable if a best-effort cache write fails.
- Reactions refresh when the reader opens, when the app returns to the foreground, and on pull-to-refresh. Realtime subscriptions remain intentionally out of scope.
- Reflections remain private and online-only. Their text is excluded from analytics and durable mutation payloads.
- No native module or app-identifier change is required. Existing associated-domain and Android HTTPS intent-filter configuration already covers `/gists/*`.

## Deep-link hosting requirements

Local hosting payloads now include `/gists/*` in both Apple app-site-association manifests and a minimal browser fallback for canonical Gist URLs. These files are not live until the correct staging and production hosts are updated and verified.

Before production rollout:

1. Publish the staging association manifest and Gist fallback only to `staging.getbetweener.com`.
2. Verify correct JSON content type and no redirects for `/.well-known/apple-app-site-association`.
3. Verify Android asset links still identify only the staging package and signing certificate.
4. Test cold-start and warm-start links on physical iOS and Android devices.
5. Repeat separately for production only after production release authorization.

## Required physical-device matrix

Run on one currently supported small phone and one large phone per platform:

- Open a canonical link with the app closed, backgrounded, and foregrounded.
- Open a Saved Gist while online, terminate the app, disable connectivity, and reopen it from Saved Gists and its canonical link.
- Save and unsave offline, terminate, reconnect, and verify deterministic outbox replay.
- React, change reaction, remove reaction, and verify aggregate refresh from a second account.
- Create, edit, and delete a private Reflection; verify it never appears for another account.
- Switch accounts while a Gist request is in flight; verify no previous-account content or state flashes or replays.
- Test Dynamic Type / Large Text through the maximum accessibility size.
- Test VoiceOver and TalkBack reading order, labels, radio-state announcements, and 44-point touch targets.
- Test Reduce Motion, light/dark appearance, screen rotation where supported, background/resume, and low-connectivity recovery.
- Disable each Gist feature flag independently and verify the legacy reader remains usable.

## Production gates

Production remains blocked until all of the following are true:

- A clean, reproducible Gist-only candidate is built from an approved baseline and its hashes are recorded.
- The expanded device matrix has recorded iOS and Android evidence.
- Production backup/recovery readiness and migration checksums are approved.
- Production migrations and the AI Edge Function receive separate execution authorization.
- Production role canaries prove ordinary-member, editorial, moderation, operations, and super-admin boundaries.
- Hosting association files and canonical fallback are deployed and read back from the intended domains.
- Production feature flags begin disabled and are enabled progressively after reader and error-rate canaries pass.

## Rollout and rollback

Recommended rollout order:

1. Database migrations with feature flags disabled.
2. Edge Function with AI generation disabled.
3. Mobile/web payload and canonical-link hosting.
4. Reader V2 and cover display canary.
5. Saves and analytics canary.
6. Reactions canary.
7. Private Reflections canary.
8. AI Studio for authorized editors only.

Rollback uses flag disablement first. Database rollback should use forward corrective migrations because published editions and reader state are durable. Hosting rollback removes the `/gists/*` association entry and fallback only if canonical routing itself is defective; existing app content remains reachable through Circles and Saved Gists.

## Current verdict

`LOCAL_TECHNICAL_REMEDIATION = PASS`

`PRODUCTION_READINESS = CONDITIONAL_PASS`

`PRODUCTION_DEPLOYMENT_AUTHORIZED = NO`

`PRODUCTION_MODIFICATIONS = NONE`

`STAGING_MODIFICATIONS = NONE`
