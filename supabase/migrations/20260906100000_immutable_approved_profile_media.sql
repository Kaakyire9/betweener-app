-- Publish only server-moderated profile images from an immutable client boundary.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'moderated-profile-media',
  'moderated-profile-media',
  true,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Deliberately no authenticated INSERT/UPDATE/DELETE policies. Edge Functions
-- publish content-addressed objects with service_role after scanning held bytes.
