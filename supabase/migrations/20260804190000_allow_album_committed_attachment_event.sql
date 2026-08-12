-- Align the attachment lifecycle event allow-list with the atomic album
-- finalizer introduced by 20260804120000_whatsapp_style_chat_media_albums.sql.
--
-- Album finalisation is transactional. Before this correction, inserting the
-- final `album_committed` audit event violated the older allow-list and rolled
-- back an otherwise valid canonical album.

begin;

alter table public.chat_attachment_lifecycle_events
  drop constraint if exists chat_attachment_event_type_valid;

alter table public.chat_attachment_lifecycle_events
  add constraint chat_attachment_event_type_valid check (
    event_type in (
      'batch_committed',
      'album_committed',
      'idempotent_replay',
      'state_transition',
      'cancel_requested',
      'cleanup_scheduled',
      'recovery_requested'
    )
  ) not valid;

alter table public.chat_attachment_lifecycle_events
  validate constraint chat_attachment_event_type_valid;

commit;

