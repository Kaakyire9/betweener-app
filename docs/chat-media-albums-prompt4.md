# Chat media albums — Prompt 4

## Behaviour contract

- A send action accepts 1–10 image or video items.
- Multi-item sends have one `media_group_id`, one `client_message_id`, one expected count, and stable per-item attachment IDs/indexes.
- Captions belong to the album message. Per-item captions are intentionally unsupported.
- The optimistic album remains local until every item in the confirmed composition is uploaded and the server publishes the exact ordered set atomically.
- Upload work is bounded to two concurrent items. Results and finalisation input always return in canonical selection order.
- Successful item uploads are retained across retry; only unfinished items are uploaded again.
- Before finalisation starts, a failed item can be removed and remaining items reindexed. Once a finalisation key exists, the composition is immutable.
- Item removal first records a server-owned cancellation tombstone under the same advisory lock used by finalisation. A stale worker therefore cannot publish the removed item.
- Whole-album cancellation uses the durable cancellation/tombstone path and prevents later resurrection.

## Server guarantees

Migration `20260804120000_whatsapp_style_chat_media_albums.sql` adds:

- stable message and attachment `media_group_id` fields;
- one album per sender/group uniqueness;
- unique item position within an album;
- an atomic `rpc_finalize_chat_media_album_v4` transaction;
- exact count, contiguous order, type, ownership, object path, object size, preview, and conversation checks;
- idempotent replay through the existing exact finalisation claim/result binding;
- immutable canonical composition after publication.

The Edge Function validates file signatures and authoritative storage metadata before invoking the transaction. Client dimensions, duration and MIME values remain provisional until server validation.

## Deployment order

1. Apply `20260804120000_whatsapp_style_chat_media_albums.sql`.
2. Regenerate `supabase/types/database.ts`.
3. Deploy `chat-attachment-finalize`.
4. Ship the compatible application build.

Do not deploy the new Edge Function before the migration: mixed-media album finalisation deliberately fails closed when the v4 RPC is unavailable.

## Rollback

Roll back the application and Edge Function first. The added nullable columns and indexes may remain safely in place. Do not drop album columns while a compatible client can still create albums. If database rollback becomes necessary after all clients are retired, first retain/copy canonical message metadata, then drop the v4 RPC, indexes, constraints, and columns in reverse migration order.

## Required device checks

- Send 2, 3, 4, 5 and 10 items; verify identical order on sender and receiver.
- Send mixed portrait/landscape/square images and mixed image/video albums.
- Kill and relaunch during upload; verify the same optimistic bubble resumes without duplication.
- Interrupt one item, then test retry-only, remove-item/send-remaining, and cancel-album.
- Lose the finalisation response; verify retry returns the same canonical message.
- Open every item from the grid, including the `+N` tile, online and offline.
- Expire signed URLs and delete one local cached file; verify per-item remote recovery without losing other cached items.
- Sign out during an upload and sign into another account; verify no media/cache exposure crosses accounts.

## Observability

Use the structured album/outbox lifecycle events to correlate `media_group_id`, `client_message_id`, attachment index, attempt count, upload state and canonical message ID. Alert on repeated finalisation conflicts, stale assembling albums, cancellation resurrection attempts, and cleanup dead letters.
