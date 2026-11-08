# Current-state repository audit

## Scope and method

This is local, read-only inspection of the current worktree. “VERIFIED” means directly evidenced by code or SQL; it does not prove a remote migration, credential, service, or production deployment. “PARTIAL” means a usable foundation exists but does not satisfy Daily. “MISSING” means no implementation was found. “UNVERIFIED” means repository evidence cannot establish runtime state.

## Architecture evidence matrix

| Area | Status | Evidence and verified behavior | Gap / recommendation | Confidence |
|---|---|---|---|---|
| Mobile stack | VERIFIED | Expo `~57.0.27`, React Native `0.86.3`, Expo Router `~57.0.25`, TypeScript `~6.0.3` (`package.json:94`, `package.json:137`, `package.json:122`, `package.json:188`). | Reuse; add no game framework. | High |
| Backend client | VERIFIED | Supabase JS `2.117.2` (`package.json:92`); client uses durable auth storage and AppState/network recovery (`lib/supabase.ts:1`). | Reuse the authenticated client; put certification transactions in RPCs. | High |
| Navigation | VERIFIED | Five existing tabs are declared in `app/(tabs)/_layout.tsx:1`; Circles/Vibes are already primary surfaces. | Add one canonical `/daily` route and entry cards, not a sixth tab. | High |
| Design system | PARTIAL | Shared light/dark palette and teal/purple accents exist (`constants/theme.ts:13`); Archivo/Playfair/Manrope roles exist (`constants/typography.ts:1`). | Use existing tokens. Proposed warm ivory/dark direction needs token-level contrast review, not parallel colors. | High |
| Motion/accessibility | PARTIAL | Reanimated and haptics are installed (`package.json:146`, `package.json:111`); reduced-motion/accessibility patterns occur in Gist/Live surfaces. | Define focus order, announcements, font scaling, and reduced-motion variants for every game state. | Medium |
| State management | VERIFIED | React context/hooks and local modules dominate; Zustand is installed (`package.json:159`) but no feature use was found. | Do not introduce a new store. Use a feature-scoped reducer/query service. | High |
| Offline cache | VERIFIED | Typed/versioned envelopes and stale metadata exist (`lib/offline/core.ts:1`). | Reuse for immutable content and confirmed snapshots. | High |
| Offline mutations | VERIFIED | Queue records have IDs, dedupe keys, attempts and optional owner IDs (`lib/offline/mutation-queue.ts:334`); reads are owner-scoped (`lib/offline/mutation-queue.ts:1092`); draining checks active owner (`lib/offline/mutation-queue.ts:3385`) and reacts to AppState/network (`lib/offline/mutation-queue.ts:3472`). | Add Daily operations modularly; never mark provisional completion as server-confirmed. | High |
| Retry policy | VERIFIED | Queue has bounded attempts/backoff and failed retention (`lib/offline/mutation-queue.ts:62`). | Use operation UUIDs and RPC receipts for start/answer/complete/contribute. | High |
| Server idempotency | VERIFIED foundation | Durable mutation receipts exist (`supabase/migrations/20260918120000_idempotent_app_mutation_receipts.sql:6`). | Prefer Daily-specific unique constraints plus receipt semantics; avoid indefinite generic receipt growth. | High |
| Session/account isolation | VERIFIED foundation | Offline queue refuses absent owner and clears by owner (`lib/offline/mutation-queue.ts:1120`, `lib/offline/mutation-queue.ts:1139`). | Cache keys must include user ID and challenge version; purge private data on account transition. | High |
| Telemetry | PARTIAL | Sentry redacts context and disables default PII (`lib/telemetry/sentry.ts:1`); a durable Vibes telemetry queue exists (`lib/vibes/telemetry-queue.ts:1`). | No general product analytics pipeline was found. Add a minimal server-owned Daily event contract; never log answer text. | Medium |
| Feature flags | PARTIAL | Economy exposes server-owned flags (`lib/economy/economy-feature-flag-service.ts:1`; `supabase/migrations/20260929100000_membership_sparks_phase_b_foundation.sql:7`). | Create Daily-specific enabled/cohort/content controls rather than reuse economy flags. | High |
| App-version controls | VERIFIED | Client fetches server app-version rules (`lib/app-version/app-version-service.ts:134`). | Include minimum compatible Daily content schema/runtime in rollout config. | High |
| Notifications | PARTIAL | Push routing and environment provenance exist; delivery has an explicit mode (`supabase/functions/push-notifications/index.ts:79`). | Daily reminders are out of initial MVP; later require opt-in, quiet hours, and environment-bound templates. | High |
| Moderation | VERIFIED foundation | Public UGC reporting/content-safety migrations and shared safety functions exist. | Reuse only if later adding comments/submissions; MVP has no public user text. | Medium |
| CI | PARTIAL | Quality CI runs install, lint, typecheck, Expo Doctor and selected suites (`.github/workflows/quality.yml:1`). | Add Daily unit/component/pgTAP/E2E gates. Supabase types workflow hard-codes production ref (`.github/workflows/supabase-types.yml:1`); isolate staging before relying on it. | High |
| Environment isolation | VERIFIED in config | Production and staging use distinct bundle/package, scheme, web host, EAS project and Supabase ref (`app.config.js:7`, `app.config.js:22`); staging profiles use `APP_VARIANT=staging` (`eas.json:1`). | Remote identities and deployed schema are UNVERIFIED in this audit. | High/local only |
| AI capability | PARTIAL | Server-side OpenAI content-safety/Odo code exists (`supabase/functions/_shared/content-safety.ts:124`; `supabase/functions/_shared/odo/model-router.ts:1`). | No Daily/Gist editorial drafting pipeline exists. Do not expose model credentials or autonomous publishing. | High |

### Repository environment identity (non-secret)

| Resolution | App identity | EAS project | Supabase project | Evidence/status |
|---|---|---|---|---|
| Production | `Betweener`; `com.aduboffour.betweener`; scheme `betweenerapp` | `7de6cdc4-8616-446f-99de-82764af3a7e6` | `jbyblhithbqwojhwlenv` | VERIFIED in `app.config.js:7-20`; remote state UNVERIFIED. |
| Staging | `Betweener S`; `com.aduboffour.betweener.staging`; scheme `betweenerstaging` | `7f38a835-2da7-419b-a20b-e1a12e021547` | `xsgzxadwuxuziubglvps` | VERIFIED in `app.config.js:22-34`; remote state UNVERIFIED. |
| Development/preview/staging builds | Resolve `APP_VARIANT=staging` and EAS `preview` environment | Staging project through app config | Staging ref enforced by app config | VERIFIED in `eas.json:7-57`; deployed variable values UNVERIFIED. |
| Store staging | `playStaging` and `testflightStaging`, channel `staging`, `APP_VARIANT=staging` | Staging project through app config | Staging ref enforced by app config | VERIFIED in `eas.json:84-113`; built artifacts UNVERIFIED. |

Firebase, RevenueCat and Stream configuration guards/references exist elsewhere in the repository, but remote project ownership and current injected values were not queried. No secret values are reproduced here. Production verification/production profiles select `APP_VARIANT=production`; no file was changed during this audit.

## Relationship Gist findings

| Reported weakness | Status | Evidence | Required action |
|---|---|---|---|
| General admin instead of editorial capability | UNRESOLVED | Editorial upsert checks `is_admin_user` (`20260831130000_relationship_gist_hardening.sql:111`), while UI capabilities distinguish editorial roles (`20261007180000_admin_operations_context.sql:38`). | Enforce a dedicated DB capability in every editorial read/write/publish/archive RPC; add pgTAP denial tests. |
| Offline save/unsave can be overwritten | UNRESOLVED | Local state lacks operation/version metadata (`lib/relationship-gists/local-state.ts:1`); reconciliation only uploads local state when the server row is missing (`app/(tabs)/explore.tsx:499`). | Add owner-scoped outbox, operation UUID, server receipt, `updated_at` conflict rule, and explicit unsave tombstone. |
| Editing published content resets current status | UNRESOLVED | Upsert sets `published_at` to now and clears `scheduled_for` (`20260831130000_relationship_gist_hardening.sql:160`). | Make published revisions immutable; edit into a new draft and atomically promote/rollback versions. |
| Old saved Gists inaccessible | UNRESOLVED | Global RPC returns one current row per perspective (`20260831130000_relationship_gist_hardening.sql:55`); screen renders a single Gist only in My Circles mode (`app/(tabs)/explore.tsx:2022`). | Add saved-library RPC/screen independent of current editorial selection. |
| Scheduling has no admin UI | PARTIAL | Schema/RLS considers `scheduled_for` (`20260831130000_relationship_gist_hardening.sql:23`), but the editor only loads/saves/publishes/archives (`app/admin-editorial.tsx:43`, `app/admin-editorial.tsx:80`, `app/admin-editorial.tsx:105`). | Add timezone-explicit schedule controls, preview, cancel and publication event audit. |
| Revision/rollback absent | UNRESOLVED | Current editor mutates rows; no Gist revision/history domain was found. | Add immutable revisions and publication events before Daily can pin a Gist. |
| Perspective switch changes topic/article | UNRESOLVED | Selection chooses separate rows by perspective (`features/relationship-gists/domain/relationship-gist.ts:57`); there is no shared article/version family. | Model a Gist edition with optional lens variants, or label the action “Explore another perspective.” |
| Religion implicitly selects/hides lenses | UNRESOLVED | Religion auto-preference and eligible order exclude Communication for Christian/Muslim paths (`features/relationship-gists/domain/relationship-gist.ts:32`, `features/relationship-gists/domain/relationship-gist.ts:39`). | Ask for an explicit lens preference; always offer neutral Communication and “all perspectives.” |
| Successful reader analytics missing | UNRESOLVED | Reader has persistence/share error logging but no verified impression/start/complete/save/share success events (`app/(tabs)/explore.tsx:1548`, `app/(tabs)/explore.tsx:1601`). | Add privacy-safe success events with stable denominators. |
| Gist buried/no library | UNRESOLVED | Gist renders within the 3,677-line Circles screen (`app/(tabs)/explore.tsx:2022`); no saved route was found. | Extract feature UI/services and add Gist archive/saved entry. |
| Feature concentrated in Circles screen | UNRESOLVED | `app/(tabs)/explore.tsx` is 3,677 lines and owns fetch, merge, reader, sharing and render. | Extract reader, cards, query/state service and route before integrating Daily. |

### Verified Gist strengths

- Authenticated users can read eligible published/scheduled content via an RPC (`20260831130000_relationship_gist_hardening.sql:27`, `:82`).
- Per-user save/progress state is protected by RLS (`20260831130000_relationship_gist_hardening.sql:179`, `:202`).
- Read time, progress normalization and short-content completion logic are isolated domain helpers (`features/relationship-gists/domain/relationship-gist.ts:69`, `:127`).
- Card UI already handles accessibility and reduced motion (`components/circles/CirclesHomeCards.tsx:921`).

## Circles, matching, chat and Live

- **Circles — VERIFIED foundation.** Circles and active memberships are normalized in the baseline migration. Circle dating preferences are explicit opt-in and active-member scoped (`20260830160000_circle_dating_discovery.sql:7`, `:150`). Quest eligibility must use active membership but must not read or change dating preferences.
- **Blocking — VERIFIED.** Circle dating candidates exclude blocks in both directions (`20260830160000_circle_dating_discovery.sql:362`). Any comparison endpoint must do the same.
- **Chat authorization — VERIFIED.** `can_users_chat` requires current relationship state and checks both block directions (`20260719213000_chat_trust_and_privacy_hardening.sql:10`, `:61`); message policy calls it (`:84`). A comparison endpoint must re-check this function at read and consent time and must never send a message automatically.
- **Live/Pulse/Odo — VERIFIED as existing domains, not Daily dependencies.** Repository routes, hooks, RPCs and regression suites show extensive Live capability. Daily must not modify these systems. Game Nights/Oware are post-MVP concepts only.
- **Deep links — PARTIAL.** Root routing handles authenticated deep links and notification routes (`app/_layout.tsx:374`). A single authenticated `/daily?challenge=<public-id>` route can fit this model, but no Daily route exists.

## Runtime and remote limits

Remote Supabase schema, RLS installation, scheduled jobs, user counts, analytics volume, current feature flags, deployed Edge Functions, EAS secrets, push state, and production/staging data parity are **UNVERIFIED**. No network, CLI login, database inspection, or remote mutation was performed.
