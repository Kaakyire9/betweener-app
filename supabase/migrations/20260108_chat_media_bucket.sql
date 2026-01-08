-- Migration: chat media bucket + policies
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types, avif_autodetection)
VALUES (
  'chat-media',
  'chat-media',
  true,
  52428800,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'application/pdf',
    'text/plain',
    'application/zip',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ],
  false
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for chat media (path: chat-media/{userId}/{filename})
DROP POLICY IF EXISTS "Chat media read" ON storage.objects;
CREATE POLICY "Chat media read"
  ON storage.objects
  FOR SELECT USING (
    bucket_id = 'chat-media'
  );

DROP POLICY IF EXISTS "Chat media upload" ON storage.objects;
CREATE POLICY "Chat media upload"
  ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'chat-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Chat media update" ON storage.objects;
CREATE POLICY "Chat media update"
  ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'chat-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'chat-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Chat media delete" ON storage.objects;
CREATE POLICY "Chat media delete"
  ON storage.objects
  FOR DELETE USING (
    bucket_id = 'chat-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
