-- Voice notes do not have visual preview objects. Harden production schemas
-- against legacy/service payloads that explicitly include a null preview path
-- but accidentally derive a non-null preview bucket.

begin;

create or replace function public.normalize_non_visual_attachment_preview()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if new.attachment_type not in ('image', 'video')
     and new.preview_storage_path is null
     and new.preview_mime_type is null
     and new.preview_byte_size is null
     and new.preview_width is null
     and new.preview_height is null then
    new.preview_bucket_id := null;
  end if;
  return new;
end;
$$;

revoke all on function public.normalize_non_visual_attachment_preview()
  from public, anon, authenticated;

drop trigger if exists normalize_non_visual_attachment_preview
  on public.message_attachments;
create trigger normalize_non_visual_attachment_preview
before insert or update of
  attachment_type,
  preview_bucket_id,
  preview_storage_path,
  preview_mime_type,
  preview_byte_size,
  preview_width,
  preview_height
on public.message_attachments
for each row execute function public.normalize_non_visual_attachment_preview();

comment on function public.normalize_non_visual_attachment_preview() is
  'Normalizes absent preview metadata for audio/document attachments before preview integrity checks run.';

commit;
