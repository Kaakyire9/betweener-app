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

The four runtime assets are tightly cropped transparent WebPs. They total **216,382 bytes** compressed and have a conservative RGBA decoded-size estimate of **3,150,336 bytes**. All runtime canvases are at or below 512×512; the halo is 384×371. `npm run verify:love-seat-assets` enforces the 1.25 MB compressed and 18 MB decoded-estimate ceilings in CI/release checks.

The original PNGs remain source assets only. No Love Seat runtime component imports them.

Production delivery target for a true rotating-chair asset set:

- transparent WebP or AVIF where native support is verified;
- maximum canvas 512×512, tightly cropped alpha bounds;
- 8–12 evenly spaced rotation frames, 70–110 KB each;
- halo at 384×384, under 80 KB;
- total compressed ceremony set under 1.25 MB;
- peak decoded ceremony allocation under 18 MB;
- preload only the first two frames and dispose the modal after settling;
- static portrait remains available if any frame fails.

The current three-frame treatment is a polished crossfade, not true 3D rotation. Do not describe it as a 360-degree chair.

An optional featured-member opening question is intentionally deferred. Adding it cleanly requires a separate moderated content field, edit/report lifecycle, and notification policy; it is not multiplexed into the private request note or public quote.

## Production promotion order

The two Love Seat V1 migrations are applied and verified on staging. Production has not been changed.

1. Freeze the reviewed Love Seat client and migration diff; exclude unrelated dirty-worktree changes.
2. Confirm the production project identity and migration history with the repository Supabase wrapper.
3. Preview only the pending Love Seat migrations with a linked production dry-run; stop on unexpected history or schema drift.
4. Apply only after explicit production-deployment approval.
5. Verify `circle_love_seat_updates` is the only Love Seat table in `supabase_realtime`, both V1 tables have RLS enabled, direct client grants remain revoked, and authenticated RPC grants match the migration.
6. Verify exactly one enabled `circle-love-seat-cleanup-v1` cron row and a successful run.
7. Release the client only after the database verification, then run the request → select → accept → converge → ceremony smoke test with two production-safe accounts.

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
- Focused Love Seat source contracts: PASS, 35/35.
- Focused React Native interactions: PASS, 40/40; process exits cleanly without `--forceExit`.
- Notification routing regression: PASS when run with the staging environment flag.
- SQL source-contract regression: PASS.
- Migration applied to staging: PASS; both V1 migrations are present.
- Staging publication/RLS/RPC/cron verification: PASS; latest observed cleanup run succeeded on 2026-11-05.
- Two-client staging lifecycle: PASS, owner-confirmed on 2026-11-05 for request → host selection → member acceptance → both-device convergence → ceremony.
- Runtime asset budget: PASS; 216,382 compressed bytes and 3,150,336 estimated decoded RGBA bytes.
- Physical-device animation and core interaction: PASS by the owner-confirmed two-device staging run. A dedicated low-memory allocation profile remains recommended release telemetry, not a V1 blocker at the current 3.0 MiB static decoded estimate.
- Local Android Expo export preflight: INCONCLUSIVE; the full workspace Metro export stalled twice after startup on Windows without emitting a Love Seat asset or resolver error. The normal EAS release build remains a required promotion gate.
- Production readiness: **READY FOR CONTROLLED PRODUCTION PROMOTION**. This is a code/staging declaration, not evidence that the production migration or app release has occurred.

## Accepted advisor exceptions

- `circle_love_seat_arrival_acknowledgements` intentionally has RLS with no direct client policy because it is RPC-only and has no anon/authenticated table grants.
- The two authenticated `SECURITY DEFINER` arrival RPCs are intentional. They validate `auth.uid()`, profile ownership, active Circle membership, Circle/Love Seat binding, and active-seat state before reading or writing acknowledgements.
- The new viewer index can appear unused until production traffic exercises cross-device ceremony suppression.
