# Connection Journal

Implementation of **Your Connections — Every call has a story.** The Connection Journal database migration is deployed to `betweener-staging`.

## Implementation

- `features/connect/journal/`: participant-bound read service, canonical cache, lifecycle presentation, Journal, filters/search, details, safety actions and reduced-motion-aware Connection Pulse.
- `/connect`: virtualised Journal; `/connect/history/[callId]`: persistent canonical details link.
- `components/chat/ChatMessageList.tsx`: typed call cells interleaved with messages by server time and stable identity. Message indexes, receipts, outbox, attachments and existing list fallback remain separate.
- `lib/chat/hooks/`: call previews participate in existing conversation sorting without changing unread counts or read receipts.
- `lib/realtime/user-chat-broadcast.ts`: small invalidation hints on the existing private owner channel. Data is reconciled through participant-authorised RPCs, not trusted from transport payloads.
- `ConnectCallRoute.tsx`: explicit Done can return to the known conversation only after existing local dismissal safety permits it. No automatic messages or redial.

History reads do not bootstrap the calling SDK. Redial refreshes the canonical record, verifies the account epoch and live relationship/consent eligibility, then opens the existing explicit Start lobby.

## Staging deployment

`supabase/migrations/20261105031025_connect_connection_journal.sql` was applied to staging on 2026-11-05 and registered as `20261105031025`. The deployed SQL SHA256 matches the reviewed source. Access checks, schema verification and protected-state comparisons are recorded in the [deployment receipt](connect-connection-journal.staging-deployment.json).

The canonical source remains `private.connect_sessions`. The additive migration supplies participant-only keyset RPCs, bounded chat previews, pair indexes and private invalidation triggers. It adds only a private personal-chat visibility cutoff; no duplicate call-state table or client call-result writes.

Existing historical calls need no outcome backfill. They are projected directly from authoritative states, reasons and timestamps. Never-connected calls have no fabricated duration. Cleanup acknowledgements do not prove physical or remote media shutdown.

## Privacy and retention

- Authenticated participants only; third-party reads/search/topics are rejected. Mobile clients cannot write operational calls or personal cutoffs.
- Deleted/blocked/unavailable relationships lose functional redial and chat visibility; personal history uses a generic unavailable-contact identity.
- Deleting a personal chat hides its old call cards permanently for that owner, even if the preference is reopened or removed. The other participant's history and operational cleanup remain intact.
- Canonical call retention follows the existing Connect schema. No personal-history deletion control is added; it must not delete operational cleanup obligations.
- Existing account masking retains generic counterpart history. Existing eventual Auth hard purge cascades canonical records while durable provider jobs survive. This feature does not change that policy.
- Cache is memory-only, scoped to the authenticated account/epoch and cleared on retirement. Offline viewing is limited to the current session.
- Private notes are deferred pending explicit retention/deletion policy; there is no recording, transcription or analysis.

## Review and activation

Real app reads require `EXPO_PUBLIC_CONNECT_JOURNAL_READS=true`, a staging development build identity and the exact staging Supabase URL. The local staging environment enables this flag for development testing. Preflight found staging calling already enabled. Its configuration hash matched after deployment.

Journal reads were enabled locally on 2026-11-05 after explicit user approval. Exercise participant reads and private topics with approved staging accounts.

The account-deletion profile-guard repair was deployed to staging on 2026-11-05. Migration `20261105054114` adds the service-only profile-mask RPC, and `delete-account` version 40 masks the profile before storage cleanup. JWT verification, existing profile guards and calling configuration were verified against their deployment baseline. Six handler tests and hosted access-denial checks passed. End-to-end Auth/Storage deletion still requires an explicitly approved disposable staging account. [Deployment receipt](account-deletion-guard-fix.staging-deployment.json). [Local validation](account-deletion-guard-fix.local.json).

## Local verification and previews

- `scripts/test-connect-journal-local.cjs`: unique disposable database/PostgREST clone, synthetic users, real SQL/ACL/RLS/topic checks; clone removed in `finally`. No shared or hosted database mutation.
- `__tests__/connect-journal*`: identity, lifecycle/duration, pagination/reordering/deletion, epoch fencing, safe redial, previews/receipts, typed list integration, themes and reduced motion.
- Existing Chat and Connect regression suites were run offline. Exact results and source hashes: [validation receipt](../../tmp/connect-secure-calling/connection-journal/validation.json).
- [Visual gallery](../../tmp/connect-secure-calling/connection-journal/screens/index.html): real presentation components rendered with controlled web fixtures in dark/light/compact layouts. The chat shell is illustrative; no messages are sent. These are not physical-device screenshots.
- `harnesses/connect-journal-visual/entry.tsx`: development-only web presentation fixture, no calling provider or Supabase access.

Native iOS/Android layout, Dynamic Type and device accessibility checks remain required in existing development builds. No new dependencies/native modules were introduced.
