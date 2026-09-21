# Chat media albums - Prompt 4

## Behaviour contract

- One send action accepts 1-10 photos or videos.
- Multi-item sends have one `media_group_id`, one `client_message_id`, one expected count, and stable per-item attachment IDs and indexes.
- Captions belong to the whole album. Per-item captions are intentionally unsupported in v1.2.0.
- The album stays as a local optimistic draft until the confirmed composition uploads and the server publishes the exact ordered set atomically.
- Upload concurrency defaults to 2, is configurable with `EXPO_PUBLIC_CHAT_ALBUM_UPLOAD_CONCURRENCY`, and is clamped to 1-4.
- Each item records progress, transfer state, retry count, error, local source, preview, type, identity, and order in the durable outbox.
- Completed items survive restart and are not re-uploaded. A selected retry never silently retries failed siblings.
- Before finalisation, the sender can cancel one item or the whole album. Removing an item increments the composition revision and reindexes the survivors.
- Item and batch cancellation create a server tombstone under the same advisory lock used by finalisation before local state is removed.
- Finalisation accepts the exact ordered composition once. Late items, partial realtime records, and response-loss retries cannot create a second message.

## Rendering and viewer

- 1 item: normal media bubble.
- 2 items: equal split.
- 3 items: one hero plus two stacked items.
- 4 items: 2 x 2.
- 5-10 items: 2 x 2 preview with a `+N` overlay.
- Stable aspect-aware frames are calculated before remote downloads for portrait, square, and landscape sources.
- Tapping any tile opens that item index. The viewer preserves the index and can traverse the complete ordered album, including hidden items and mixed image/video media.
- The viewer prefers verified local files, refreshes expired signed URLs, and recovers when a cached file has disappeared.

## Server guarantees

Migration `20260804120000_whatsapp_style_chat_media_albums.sql` provides:

- stable message and attachment `media_group_id` fields;
- one album per sender/group uniqueness;
- unique item positions within an album;
- atomic `rpc_finalize_chat_media_album_v4` publication;
- exact count, contiguous order, type, ownership, path, size, preview, and conversation validation;
- idempotent replay through the existing finalisation claim/result binding;
- immutable canonical composition after publication.

Migration `20260919120000_chat_album_cancellation_staging_hardening.sql` expands the existing cancellation RPC without changing its signature. It permits v1.2.0 image source and preview paths in `chat-attachment-staging-v1-2`, creates the batch tombstone first, and schedules both objects for cleanup. Existing `chat-media` and `voice-messages` callers remain valid.

The Edge Function validates signatures and authoritative storage metadata before invoking the transaction. Client dimensions, duration, and MIME values remain provisional until server validation.

## 1.1.1 compatibility

- `app.json` uses `runtimeVersion.policy = appVersion`; v1.2.0 client code cannot be delivered to the 1.1.1 runtime.
- Both database changes are additive or `create or replace`; no 1.1.1 column, storage path, policy, or RPC signature is removed.
- Existing single-image, video, voice, and document finalisation modes remain supported.
- Database and Edge Function changes are shared surfaces. They must pass the 1.1.1 health gate before and after deployment.

## Deployment order

1. Record a pre-deploy result from `supabase/verification/v1.1.1_production_health.sql`.
2. Apply `20260804120000_whatsapp_style_chat_media_albums.sql` and its follow-up album migrations if they are not already deployed.
3. Apply `20260919120000_chat_album_cancellation_staging_hardening.sql`.
4. Regenerate/check `supabase/types/database.ts` when schema columns change. The cancellation-only migration adds no generated type surface.
5. Deploy `chat-attachment-finalize`.
6. Run the 1.1.1 health gate again and execute the v1.2.0 album smoke matrix in production-compatible staging.
7. Release the 1.2.0 native build gradually. Do not publish it to the 1.1.1 Expo runtime.

Do not deploy the updated Edge Function before the cancellation migration. It deliberately fails closed if the server cannot persist the tombstone.

## Verification

Automated commands:

```powershell
npm.cmd run typecheck
npm.cmd run test:chat-logic
npx.cmd supabase test db supabase/tests/chat_album_cancellation_staging.sql
```

After deployment, run the read-only `supabase/verification/v1.2.0_chat_album_health.sql` and require zero release blockers.

Required device checks:

- Send 2, 3, 4, 5, and 10 items; verify identical order on sender and receiver.
- Send mixed portrait/landscape/square images and both image-first and video-first mixed albums.
- Kill and relaunch during upload; verify the same optimistic bubble resumes without duplication.
- Interrupt one or several items, then test retry-only, remove-item/send-remaining, and cancel-album.
- Simulate a lost finalisation response; verify retry returns the same canonical message.
- Open every item, including the `+N` tile, online and offline.
- Expire signed URLs and delete one cached file; verify per-item recovery without losing other cached items.
- Sign out during upload and sign into another account; verify no media/cache crosses accounts.

## Rollback

Roll back the 1.2.0 client rollout first, then restore the previous Edge Function only if needed. The nullable album schema and expanded cancellation RPC can remain deployed safely for 1.1.1. Do not drop album columns or versioned RPCs while any 1.2.0 client is active.

## Observability

Correlate lifecycle events using `media_group_id`, `client_message_id`, attachment ID/index, attempt count, transfer state, composition revision, and canonical message ID. Alert on repeated finalisation conflicts, stale assembling albums, cancellation resurrection attempts, and cleanup dead letters.
