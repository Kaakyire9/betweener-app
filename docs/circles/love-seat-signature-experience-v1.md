# Love Seat Signature Experience V1

Date: 2026-10-30. Scope: Circle Pulse Love Seat only. Betweener Connect, calling, and Betweener Live media infrastructure are unchanged.

## Experience contract

1. A member privately requests consideration, optionally adding a host-only note of at most 500 characters.
2. A host selects a queued member or directly nominates a member, choosing 12, 24, or 48 hours.
3. The selected member receives a private invitation and must explicitly accept before anything is published.
4. Acceptance activates one Love Seat and one Circle Pulse item with matching start/end timestamps.
5. Eligible Circle members see one ceremonial arrival per Love Seat. Dismissal or opening the feature acknowledges it server-side; AsyncStorage remains an offline fallback.
6. The ordinary Pulse card shows the settled portrait only, the remaining duration, and the public `Ask {firstName}` discussion action.
7. The featured member or an authorized host can end the feature. Cleanup also expires stale requests, invitations, and active seats.

## Frontend architecture

- `CircleLoveSeatCeremony`: arrival-only, 3.7-second native-driver crossfade, reduced-motion immediate completion, background/asset-failure final-state fallback.
- `CircleLoveSeatPortrait`: lightweight settled state used by the normal Pulse card; it never replays the ceremony.
- `CircleLoveSeatArrivalPrompt`: person-specific one-shot modal and explicit acknowledgment actions.
- `CircleLoveSeatRequestCard`: private optional note, bounded counter, preserves text on request failure.
- `CircleLoveSeatDurationPicker`: shared 12/24/48-hour selector used by direct nominations and queue selections.
- `useCircleLoveSeatInvalidation`: subscribes only to a content-free version row and refetches the caller's authorized RPC snapshot. Event payloads are not content.
- Notification routing maps request, consent, active, and terminal events to typed Circle destinations. Removed/revoked content fails calmly into the current Circle.

## Backend architecture

Migration: `20261030162943_love_seat_signature_experience_v1.sql`.
Performance hardening: `20261030163332_love_seat_signature_experience_v1_performance_hardening.sql`.

- `circle_love_seat_updates`: content-free per-Circle version row, member/owner SELECT policy, only Love Seat table added to `supabase_realtime`.
- `circle_love_seat_arrival_acknowledgements`: server-owned, RPC-only, unique per Love Seat/viewer, cascade cleanup.
- `rpc_get_circle_love_seat_arrival_acknowledged_v1` and `rpc_acknowledge_circle_love_seat_arrival_v1`: authenticated profile ownership and active membership checks.
- `rpc_nominate_circle_love_seat_v2`: direct nominations share the 12/24/48-hour duration model.
- `notify_circle_love_seat_push`: content-minimal payload V1 with stable lifecycle event ID, Circle ID, Love Seat ID, and event type. Private request notes never enter push payloads.
- `circle-love-seat-cleanup-v1`: five-minute `pg_cron` job when the extension is installed; the existing opportunistic cleanup remains defence in depth.
- Legacy public/anon execute grants are revoked from the nomination, cancellation, host-list, and end RPCs.

## Security and privacy invariants

- Direct Love Seat table reads remain denied; all content is returned by audience-scoped RPCs.
- Realtime publishes an invalidation counter only. It exposes no request note, candidate identity, invitation state, or private reason.
- A member cannot acknowledge another profile's ceremony.
- A ceremony acknowledgment cannot be created for an inactive, expired, or unrelated Love Seat.
- Public visibility begins only after explicit acceptance.
- One active/open-seat database constraints remain authoritative.

## Asset performance and production specification

Current approved source PNGs are 1312×1199 and total 7,603,382 bytes. V1 runtime references three chair frames (`front`, `three-quarter`, `dissolve`) plus the halo; the side and reduced-motion source frames are not bundled by this surface. Decoded peak must still be measured on a low-memory physical device before release.

Production delivery target for a true rotating-chair asset set:

- transparent WebP or AVIF where native support is verified;
- maximum canvas 512×512, tightly cropped alpha bounds;
- 8–12 evenly spaced rotation frames, 70–110 KB each;
- halo at 384×384, under 80 KB;
- total compressed ceremony set under 1.25 MB;
- peak decoded ceremony allocation under 18 MB;
- preload only the first two frames and dispose the modal after settling;
- static portrait remains available if any frame fails.

The current three-frame treatment is a polished crossfade, not true 3D rotation. Do not describe it as a 360-degree chair until the production asset set above is supplied and device-validated.

An optional featured-member opening question is intentionally deferred. Adding it cleanly requires a separate moderated content field, edit/report lifecycle, and notification policy; it is not multiplexed into the private request note or public quote.

## Staging rollout order

No deployment was performed as part of implementation.

1. Confirm staging link and migration history with `scripts\supabase-staging.cmd migration list`.
2. Preview schema changes with `scripts\supabase-staging.cmd db push --dry-run`.
3. Apply only after explicit approval: `scripts\supabase-staging.cmd db push`.
4. Verify `circle_love_seat_updates` is the only new Love Seat publication table.
5. Verify `cron.job` contains exactly one enabled `circle-love-seat-cleanup-v1` row; if `pg_cron` is absent, record cleanup as blocked.
6. Publish a staging app build/OTA only after migration verification.
7. Run the two-client matrix below before any production promotion.

Rollback: remove the cleanup job, remove only `circle_love_seat_updates` from the publication, revert clients to foreground/RPC refresh, then drop the V1 RPCs/triggers/tables only after confirming no client still calls them. Do not roll back the older private-request migration.

## Required two-client staging matrix

- request with and without a note; host receives queue invalidation;
- select each 12/24/48-hour duration; member receives exact invitation;
- accept and decline from client B while client A remains open;
- verify acceptance publishes once and both clients converge after invalidation/refetch;
- verify ceremony appears once, acknowledgment suppresses it on a second device, and offline local fallback does not block entry;
- foreground/background during animation and reduced-motion behavior;
- leave Circle, revoke host role, delete featured profile, expire invitation, and end active seat;
- push and in-app routing for request, selected, accepted, declined, withdrawn, and ended;
- verify request note never appears in Realtime or notification payloads;
- verify cron cleanup and notification idempotency;
- measure compressed bundle and decoded-memory peak on low-memory Android and iOS devices.

## Validation status

- TypeScript compile: PASS.
- Focused local Love Seat regressions: PASS.
- Notification routing regression: PASS when run with the staging environment flag.
- SQL source-contract regression: PASS.
- Migration applied to staging: NOT RUN.
- Two-client staging lifecycle: NOT RUN.
- Physical-device animation/performance/accessibility: NOT RUN.
- Production asset budget: PARTIAL; current approved sources exceed the target and true rotation assets are not yet available.
- Production readiness: NOT CLAIMED.
